import { askOutput, mustAsk } from '../asking'
import type { Output } from '../commands'
import { callName, checkContent, lockedIds, NpcSchema, QuestSchema, TopicSchema, type Content, type Location, type Npc } from '../content'
import { cachedSystem, type LlmRequest } from '../dialogue/llm'
import { worldFrame } from '../dialogue/prompt'
import { voiceSummary } from '../dialogue/voice'
import { knob } from '../knobs'
import { playModeOf } from '../modes'
import { recordFact } from '../news'
import { WatcherSchema } from '../quests/planschema'
import { crossesLimits, readsAsInstruction, worldText } from '../safety'
import type { GameState } from '../state'
import type { World } from '../world'
import { worldFixedPart } from '../worldfixed'
import { districtOf, districtsOf } from './districts'
import { farPlaceOf } from './far'
import { outlineOf } from '../outlines'
import { fullDone } from './regionfull'
import { grownContent, growth } from './growth'

// A new region with a story of its own (M10.25; Bram, 29 September 2026: is
// a region that grows in play filled well enough without a world builder?).
// A far place or the first district of a far town, made playable, has places
// and people but nothing to do: no quest with stages, no watchers, few
// secrets. At arrival the chronicler writes, in one call, what there is to
// live through there: one quest of two or three stages with the people who
// are there, two watchers that set off the world's own standard aftermath,
// one piece of lore about the place, and a secret for one in three people.
// The engine fixes the shape (ids, flags, stages, conditions) and checks the
// whole as content before it is kept, as a layer in the save. Without a model
// the region gets one watcher of the world's standard set and no quest.

type Raw = Record<string, unknown>

/** What the chronicler writes: words and choices, never the shape. */
export interface StoryReply {
  /** One sentence: what of the region and the world the story grows from. */
  why: string
  quest: {
    name: string
    kind: string
    summary: string
    /** The key of the one who asks. */
    giver: string
    /** What they say when asking, in their voice. */
    ask: string
    /** Two or three stages, each done by one deed of the stranger. */
    stages: { text: string; say: string; at: string; with: string; skill: string; done: string }[]
    outcome: { name: string; text: string }
  } | null
  /** Up to two: a signal of the world's standard aftermath, when (the quest taken up, or done), and whom it is about. */
  watchers: { signal: string; on: string; who: string[]; why: string }[]
  lore: { name: string; summary: string; details: string; story: string; teller: string } | null
  secrets: { who: string; text: string; hint: string }[]
}

/** What the story round made for a region, kept in the save as a layer of content. */
export interface RegionStory {
  topic: string
  by: 'chronicler' | 'rules'
  t: number
  quest?: Raw
  /** Think mode (M10.24): the quest waits as a hook until the stranger takes it up; not in the world while it waits. */
  held?: boolean
  watchers: Raw[]
  lore?: Raw
  /** New secrets, by person. */
  secrets: Record<string, Raw[]>
  why: string
}

const QUEST_KINDS = ['request', 'mystery', 'bargain', 'discovery', 'social', 'trial', 'conflict', 'personal'] as const
const MOST_STAGES = 3
const MOST_WATCHERS = 2
/** How hard a deed of a story's quest is, when it asks for a skill. */
const STORY_DC = 12

// ---------------------------------------------------------------- the region

/** A region made in play: its area, its places and its living people. */
export function regionOf(world: World, topic: string): { area: string; places: Location[]; people: Npc[] } | undefined {
  const far = farPlaceOf(world, topic)
  if (!far) return undefined
  const area = String(far.area['id'])
  const places = [...world.content.locations.values()].filter((l) => l.area === area)
  const people = [...world.content.npcs.values()].filter((n) => world.content.locations.get(n.home)?.area === area && world.alive(n.id))
  return { area, places, people }
}

/**
 * Whether a region is ready for its story: made, and the stranger took part
 * in it as M10.21 counts that (passing through costs nothing): a town's first
 * district made, or a place without quarters worked out to its outline.
 */
export function storyReady(world: World, topic: string): boolean {
  if (!farPlaceOf(world, topic)) return false
  // Built in full (M10.25): the story comes last, after the steps.
  if (world.state.frames?.region === 'full' && chartedInPlay(world, topic) && !fullDone(world, topic)) return false
  const first = districtsOf(world.content, topic)[0]
  if (!first) return Boolean(outlineOf(world, topic)) || chartedInPlay(world, topic)
  const d = districtOf(world, topic, first.id)
  return Boolean(d && d.by !== 'stub')
}

/** A region a round at the edge charted in this game (M10.21), not one the world book names. */
export function chartedInPlay(world: Pick<World, 'state'>, topic: string): boolean {
  return Object.values(world.state.growth?.expansions?.made ?? {}).some((m) => m.outline.id === topic)
}

export function storyOf(world: Pick<World, 'state'>, topic: string): RegionStory | undefined {
  return world.state.growth?.stories?.[topic]
}

// ---------------------------------------------------------------- the layer

/** The stories of regions, for the content of a game: their quests, watchers, lore and secrets. */
export function withStories(content: Content, state: GameState): Content {
  const all = Object.values(state.growth?.stories ?? {}).sort((a, b) => a.topic.localeCompare(b.topic))
  if (!all.length) return content
  const quests = new Map(content.quests)
  const watchers = new Map(content.watchers)
  const topics = new Map(content.topics)
  const npcs = new Map(content.npcs)
  for (const s of all) {
    if (s.quest && !s.held) {
      const q = QuestSchema.parse(s.quest)
      if (!quests.has(q.id)) quests.set(q.id, q)
    }
    for (const raw of s.watchers) {
      const w = WatcherSchema.parse(raw)
      if (!watchers.has(w.id)) watchers.set(w.id, w)
    }
    if (s.lore) {
      const t = TopicSchema.parse(s.lore)
      if (!topics.has(t.id)) topics.set(t.id, t)
    }
    for (const [id, raws] of Object.entries(s.secrets)) {
      const npc = npcs.get(id)
      if (!npc) continue
      const more = NpcSchema.shape.secrets.parse(raws).filter((x) => !npc.secrets.some((y) => y.id === x.id))
      if (more.length) npcs.set(id, { ...npc, secrets: [...npc.secrets, ...more] })
    }
  }
  return { ...content, quests, watchers, topics, npcs }
}

// ---------------------------------------------------------------- the request

/** The standard aftermath a region's watcher may set off: the world's own, without places or people of its own in its steps. */
export function standardAftermath(content: Content): { signal: string; what: string }[] {
  const fixed = (value: unknown): boolean => {
    if (typeof value === 'string') return content.locations.has(value) || content.npcs.has(value)
    if (Array.isArray(value)) return value.some(fixed)
    if (value && typeof value === 'object') return Object.values(value).some(fixed)
    return false
  }
  const seen = new Set<string>()
  const out: { signal: string; what: string }[] = []
  for (const a of [...content.aftermath.values()].sort((x, y) => x.id.localeCompare(y.id))) {
    if (seen.has(a.signal) || a.signal === 'improvised' || a.signal.startsWith('pulse') || fixed(a.steps)) continue
    // A claim of a fact the watcher does not give ($subject, $value) would leave the steps with nothing to go on.
    if (/\$(subject|value|key)\b/.test(JSON.stringify(a.steps)) || /\$(subject|value|key)\b/.test(JSON.stringify(a.when))) continue
    seen.add(a.signal)
    const does = a.steps.map((s) => Object.keys(s.do)[0]).join(', ')
    const said = a.steps.map((s) => (s.do as Raw)['text'] ?? (s.do as Raw)['line']).find((x): x is string => typeof x === 'string')
    out.push({ signal: a.signal, what: `${does}${said ? `: "${said.length > 90 ? `${said.slice(0, 87)}...` : said}"` : ''}` })
  }
  return out
}

/** The rules of the story round: the same for every region, so they are cached with the fixed part of the world build. */
const STORY_RULES = [
  'IN PLAY: THE STORY OF A NEW REGION. A region came into being in a game: the stranger has come there, and its places and people are made. There is no designer to ask now: you write, the game checks, and what does not fit is left out. Write what there is to live through here, from what the region is and the world book says of it, in the frame and tone of the world.',
  `QUEST: one, or null: a matter of one of the PEOPLE (the giver, by key) that the stranger can take up, of kind ${QUEST_KINDS.join(', ')}; a name, a summary (one sentence), what the giver says when asking (one or two sentences in their voice), two or three stages, and an outcome (a name, and one or two sentences of what came of it). Each stage has its journal line (text) and the one deed that completes it: say (the command the player types, three to six plain words, a verb first: "search the reed beds", "ask ansel about the bell"), at (the key of one of the PLACES), with (the key of a person who must be there, or empty), skill (one of SKILLS where the deed asks for it, or empty) and done (one or two sentences of what the deed brings). No death, no fight, no money out of nothing; small and believable, and it can be done with what is there.`,
  `WATCHERS: up to ${MOST_WATCHERS}, each setting off one signal of the STANDARD AFTERMATH (by its name) when the quest is taken up (on: taken) or done (on: done), about one or two of the PEOPLE (who, by key; the first is the one it happens to), with why in one sentence. Without a quest, none.`,
  'LORE: one, or null: a piece of lore about the place that its people tell: a name, a summary (one sentence), details (two or three sentences), a story (a short paragraph as someone tells it), and teller (the key of one of the PEOPLE who tells it, or empty).',
  'SECRETS: for about one in three of the PEOPLE (never more), who does not have one yet: what they hide (one sentence) and a hint someone watchful might notice (one sentence).',
  'WHY: one sentence the chronicle keeps: what of the region and the world the story grows from.',
  'Use only keys given. JSON only.',
].join('\n')

/** The request: the fixed part of the world build first (cached), then the region. */
export function storyRequest(world: World, topic: string): LlmRequest {
  const content = world.content
  const t = content.topics.get(topic)
  const region = regionOf(world, topic)
  const people = region?.people ?? []
  const places = region?.places ?? []
  const key = keyed(people, places)
  const text = { type: 'string' }
  const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
  // The world's fixed part, the same as the world steps of a full build read (M10.26: cached for both), then the rules of the story.
  const fixed = worldFixedPart(content, content.chronicler ?? '')
  const system = cachedSystem(fixed, `\n${STORY_RULES}`)
  const quarters = districtsOf(content, topic)
  const secretsNow = (n: Npc) => (n.secrets.length ? ' (has a secret)' : '')
  const aftermath = standardAftermath(content)
  const skills = (content.rules?.skills ?? []).map((s) => s.id)
  return {
    role: 'chronicler',
    ...system,
    prompt: [
      // The frame of the land the region lies in (M10.23), as description, never as instruction.
      worldText([worldFrame(content, t?.land), voiceSummary(content, t?.land)].filter(Boolean).join('\n\n')),
      '',
      `REGION: ${t?.name ?? topic}. ${t?.summary ?? ''}`,
      ...(t?.details ? [t.details] : []),
      ...(t?.story ? [`What they tell of it: ${t.story}`] : []),
      ...(quarters.length ? [`QUARTERS: ${quarters.map((q) => `${q.name}: ${q.line}`).join('; ')}`] : []),
      'PLACES:',
      ...places.map((l) => `  ${key.place.get(l.id)} ${l.name}: ${l.summary ?? l.description.day.split(/(?<=[.!?])\s/)[0]}`),
      'PEOPLE:',
      ...people.map((n) => `  ${key.person.get(n.id)} ${n.name}, ${content.professions.get(n.profession)?.name ?? n.profession}, at ${key.place.get(n.home) ?? n.home}. ${n.public_facts[0] ?? ''}${secretsNow(n)}`),
      `STANDARD AFTERMATH: ${aftermath.length ? aftermath.map((a) => `${a.signal} (${a.what})`).join('; ') : 'none'}`,
      `SKILLS: ${skills.length ? skills.join(', ') : 'none'}`,
    ].join('\n'),
    schemaName: 'region_story',
    schema: object({
      why: text,
      quest: {
        anyOf: [
          object({
            name: text,
            kind: { type: 'string', enum: [...QUEST_KINDS] },
            summary: text,
            giver: text,
            ask: text,
            stages: { type: 'array', items: object({ text, say: text, at: text, with: text, skill: text, done: text }) },
            outcome: object({ name: text, text }),
          }),
          { type: 'null' },
        ],
      },
      watchers: { type: 'array', items: object({ signal: text, on: { type: 'string', enum: ['taken', 'done'] }, who: { type: 'array', items: text }, why: text }) },
      lore: { anyOf: [object({ name: text, summary: text, details: text, story: text, teller: text }), { type: 'null' }] },
      secrets: { type: 'array', items: object({ who: text, text, hint: text }) },
    }),
    maxTokens: 2500,
    effort: 'medium',
    meta: { story: topic, name: t?.name ?? topic, people: people.map((n) => ({ key: key.person.get(n.id), name: n.name, secret: n.secrets.length > 0 })), places: places.map((l) => key.place.get(l.id)), aftermath: aftermath.map((a) => a.signal), skills },
  }
}

/** The keys of a region's people and places, in the order the prompt gives them. */
function keyed(people: readonly Npc[], places: readonly Location[]): { person: Map<string, string>; place: Map<string, string>; id: Map<string, string> } {
  const person = new Map(people.map((n, i) => [n.id, `p${i + 1}`]))
  const place = new Map(places.map((l, i) => [l.id, `l${i + 1}`]))
  const id = new Map<string, string>([...[...person].map(([a, b]) => [b, a] as [string, string]), ...[...place].map(([a, b]) => [b, a] as [string, string])])
  return { person, place, id }
}

/** The chronicler's reply, or null when it cannot be read. */
export function storyReply(text: string): StoryReply | null {
  try {
    const v = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as StoryReply
    return v && Array.isArray(v.watchers) && Array.isArray(v.secrets) ? v : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- the shape

/** A line of the chronicler's, when it is fit to keep: short, within the limits, and no instruction to a model. */
function fit(text: unknown, most: number): string | undefined {
  if (typeof text !== 'string') return undefined
  const t = text.trim().replace(/\s+/g, ' ')
  if (!t || t.length > most || crossesLimits(t) || readsAsInstruction(t)) return undefined
  return t
}

/** A command as a pattern: the words in order, "the", "a" and "an" optional, and any spacing. */
export function sayPattern(say: string): string | undefined {
  const words = say
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const content = words.filter((w) => !['the', 'a', 'an'].includes(w))
  if (content.length < 2 || content.length > 7) return undefined
  const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return content.map(escape).join(' (?:(?:the|a|an) )?')
}

/** An id for something the game makes: never one the world has or ever had. */
function freeKey(world: World, stem: string, taken: Set<string>): string {
  const locked = lockedIds(world.base)
  const c = world.content
  const used = (id: string) => taken.has(id) || locked.has(id) || c.quests.has(id) || c.topics.has(id) || c.watchers.has(id) || c.npcs.has(id) || c.locations.has(id)
  const clean = stem.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_')
  let id = clean
  for (let n = 2; used(id); n++) id = `${clean}_${n}`
  taken.add(id)
  return id
}

/** The story made from the reply: every part checked on its own, and what does not fit left out. */
export function makeStory(world: World, topic: string, reply: StoryReply | null): RegionStory | undefined {
  const region = regionOf(world, topic)
  if (!region) return undefined
  const key = keyed(region.people, region.places)
  const person = (k: string | undefined) => {
    const id = k ? key.id.get(k.trim()) : undefined
    return id && world.content.npcs.has(id) ? id : undefined
  }
  const place = (k: string | undefined) => {
    const id = k ? key.id.get(k.trim()) : undefined
    return id && world.content.locations.has(id) ? id : undefined
  }
  const taken = new Set<string>()
  const slug = topic.replace(/^far_|^topic_/, '')
  const heart = region.places[0]?.id
  const story: RegionStory = { topic, by: reply ? 'chronicler' : 'rules', t: world.now, watchers: [], secrets: {}, why: fit(reply?.why, 300) ?? `${world.content.topics.get(topic)?.name ?? topic} came into the game, and with it what its people live with.` }

  // The quest: stages that follow each other, each done by one deed, and one way it ends.
  let questId: string | undefined
  const q = reply?.quest
  const giver = person(q?.giver)
  if (q && giver) {
    const skills = new Set((world.content.rules?.skills ?? []).map((s) => s.id))
    const id = freeKey(world, `story_${slug}`, taken)
    const stages: Raw[] = []
    const actions: Raw[] = []
    const good = q.stages.slice(0, MOST_STAGES).filter((s) => fit(s.text, 240) && fit(s.done, 400) && sayPattern(s.say) && place(s.at))
    good.forEach((s, i) => {
      const flag = `${id}_${i + 1}`
      const next = i + 1 < good.length ? [{ when: [{ flag }], to: `s${i + 2}` }] : []
      stages.push({ id: `s${i + 1}`, text: fit(s.text, 240)!, next })
      const withWho = person(s.with)
      const skill = s.skill && skills.has(s.skill.trim()) ? s.skill.trim() : undefined
      // Someone who must be there is met where they live or work (M10.25: the harness found a deed at the market
      // with an innkeeper who never leaves the inn): the deed moves to them, or it could never be done.
      const who = withWho ? world.content.npcs.get(withWho) : undefined
      const where = who && ![who.home, who.work].includes(place(s.at)) ? (who.work && region.places.some((l) => l.id === who.work) ? who.work : who.home) : place(s.at)!
      actions.push({
        id: `a${i + 1}`,
        say: [sayPattern(s.say)!],
        intent: fit(s.say, 80)!,
        at: [where],
        ...(withWho ? { with: withWho } : {}),
        when: [...(i > 0 ? [{ flag: `${id}_${i}` }] : []), { not_flag: flag }],
        ...(skill ? { check: { skill, dc: STORY_DC }, fail_text: 'It does not come right this time. You may try again.' } : {}),
        effects: [{ set: flag }],
        text: fit(s.done, 400)!,
        once: false,
      })
    })
    const name = fit(q.name, 80)
    const summary = fit(q.summary, 240)
    const ask = fit(q.ask, 400)
    const end = fit(q.outcome?.name, 80)
    const endText = fit(q.outcome?.text, 400)
    if (good.length >= 2 && name && summary && ask && end && endText) {
      questId = id
      story.quest = {
        id,
        name,
        kind: (QUEST_KINDS as readonly string[]).includes(q.kind) ? q.kind : 'request',
        summary,
        givers: [giver],
        starts: { talk: [giver] },
        ask,
        stages,
        actions,
        outcomes: [{ id: 'done', name: end, text: endText, when: [{ flag: `${id}_${good.length}` }] }],
      }
    }
  }

  // Watchers: only with the quest, only on the world's own standard aftermath.
  const signals = new Set(standardAftermath(world.content).map((a) => a.signal))
  if (questId) {
    for (const w of (reply?.watchers ?? []).slice(0, MOST_WATCHERS)) {
      const who = w.who.map(person).filter((x): x is string => Boolean(x)).slice(0, 2)
      if (!signals.has(w.signal) || !who.length || (w.on !== 'taken' && w.on !== 'done') || !fit(w.why, 300)) continue
      // A signal of the region's own full build carries its name already (M10.25: story_driestromen_driestromen_...).
      const own = w.signal.startsWith(`${slug}_`) ? w.signal.slice(slug.length + 1) : w.signal
      story.watchers.push({ id: freeKey(world, `story_${slug}_${own}`, taken), signal: w.signal, when: [w.on === 'taken' ? { stage: `${questId}:s1` } : { outcome: `${questId}:done` }], who, ...(heart ? { place: heart } : {}), belang: 2 })
    }
  }
  // Without a model (or without a watcher that fits): one of the world's standard set, when the stranger comes into the region.
  if (!reply && !story.watchers.length) {
    const pick = ['strangers_stay', 'request_open', 'asked_about', 'recognised'].find((s) => signals.has(s)) ?? [...signals][0]
    const first = region.people[0]?.id
    if (pick && first) story.watchers.push({ id: freeKey(world, `story_${slug}_${pick}`, taken), signal: pick, when: [{ at: region.area }], who: [first], ...(heart ? { place: heart } : {}), belang: 1 })
  }

  // Lore about the place, told by its people.
  const l = reply?.lore
  const loreName = fit(l?.name, 80)
  const loreSummary = fit(l?.summary, 300)
  if (l && loreName && loreSummary) {
    const teller = person(l.teller)
    story.lore = {
      id: freeKey(world, `lore_${slug}`, taken),
      name: loreName,
      kind: 'lore',
      summary: loreSummary,
      ...(fit(l.details, 800) ? { details: fit(l.details, 800) } : {}),
      ...(fit(l.story, 1500) ? { story: fit(l.story, 1500) } : {}),
      ...(teller ? { teller } : {}),
      known_by: region.people.map((n) => n.id),
      fame: 1,
    }
  }

  // Secrets for one in three of the people, those who have none yet.
  const room = Math.max(0, Math.ceil(region.people.length / 3) - region.people.filter((n) => n.secrets.length).length)
  for (const s of (reply?.secrets ?? []).slice(0, room)) {
    const who = person(s.who)
    const secret = fit(s.text, 240)
    const hint = fit(s.hint, 240)
    if (!who || !secret || !hint || world.content.npcs.get(who)!.secrets.length || story.secrets[who]) continue
    story.secrets[who] = [{ id: 'story_1', text: secret, hint, dc: 16, about: [] }]
  }
  return story
}

// ---------------------------------------------------------------- applying it

/**
 * Keeps a region's story, once, as a layer of the save, checked as content
 * first: when the world would not load with it, the rules' version is tried.
 * In think mode (M10.24) the quest waits as a hook. Returns what was kept.
 */
export function applyStory(world: World, topic: string, reply: StoryReply | null): RegionStory | undefined {
  const g = growth(world)
  g.storyPending = (g.storyPending ?? []).filter((x) => x !== topic)
  if (g.stories?.[topic]) return g.stories[topic]
  for (const attempt of reply ? [reply, null] : [null]) {
    const made = makeStory(world, topic, attempt)
    if (!made) return undefined
    const state = { ...world.state, growth: { ...g, stories: { ...(g.stories ?? {}), [topic]: made } } }
    let next: Content
    try {
      next = grownContent(world.base, state)
    } catch {
      continue
    }
    if (checkContent(next).length) continue
    if (made.quest && playModeOf(world) === 'think') made.held = true
    ;(g.stories ??= {})[topic] = made
    world.regrow()
    if (made.held) holdStory(world, topic)
    const name = world.content.topics.get(topic)?.name ?? topic
    const quest = made.quest ? String(made.quest['name']) : undefined
    const at = regionOf(world, topic)?.places[0]?.id ?? world.state.player.location
    // A change of the world, in the log and the chronicle with why; not news anyone tells.
    recordFact(world, {
      kind: 'region_story',
      about: [topic],
      place: at,
      belang: 0,
      witnesses: [],
      title: `the story of ${name}`,
      text: { precise: `${made.why}${quest ? ` There is a matter to take up: ${quest}.` : ''}`, village: `${name} has its own troubles, they say.`, far: `${name} is a place with its own troubles.` },
    })
    return made
  }
  return undefined
}

/** A waiting quest of a region taken up (think mode): it comes into the world now. */
export function releaseStory(world: World, topic: string): string | undefined {
  const s = storyOf(world, topic)
  if (!s?.quest || !s.held) return undefined
  s.held = false
  world.regrow()
  return String(s.quest['ask'] ?? '')
}

/** The hook of a held quest (think): who asks, and what. */
function holdStory(world: World, topic: string): void {
  const s = storyOf(world, topic)!
  const giver = ((s.quest?.['givers'] as string[] | undefined) ?? [])[0]
  const who = giver && world.content.npcs.has(giver) ? callName(world.npc(giver)) : 'Someone'
  const m = (world.state.modes ??= { seq: 0, hooks: [], proposals: [] })
  m.hooks.push({ id: `hook_${++m.seq}`, t: world.now, until: world.now + knob(world, 'story.hook_days') * 24 * 60, story: topic, label: `${who} wants a word with you: ${String(s.quest?.['name'] ?? '')}` })
}

/** The changes a story would make, one a line, for a proposal (direct mode). */
export function storyLines(world: World, topic: string, reply: StoryReply | null): string[] {
  const s = makeStory(world, topic, reply)
  if (!s) return ['(nothing)']
  const name = (id: string) => (world.content.npcs.has(id) ? callName(world.npc(id)) : id)
  return [
    ...(s.quest ? [`+ a matter of ${name(((s.quest['givers'] as string[]) ?? [])[0] ?? '')}: ${String(s.quest['name'])}. "${String(s.quest['ask'])}"`, ...((s.quest['stages'] as Raw[]) ?? []).map((st) => `  then: ${String(st['text'])}`)] : []),
    ...s.watchers.map((w) => `+ custom: ${String(w['signal']).replace(/_/g, ' ')}, about ${((w['who'] as string[]) ?? []).map(name).join(' and ')}`),
    ...(s.lore ? [`+ lore: ${String(s.lore['name'])}. ${String(s.lore['summary'])}`] : []),
    ...Object.entries(s.secrets).map(([id, list]) => `+ secret of ${name(id)}: ${String(list[0]?.['text'] ?? '')}`),
    `  why: ${s.why}`,
  ]
}

// ---------------------------------------------------------------- wanting it

/**
 * A region's story wanted: made by the rules now without a model, else
 * waiting for the chronicler, once. Above the player's threshold it asks
 * first, as a district does (M10.21). What to show: the question, or nothing.
 */
export function wantStory(world: World, topic: string): Output[] {
  const g = growth(world)
  // The player chose to have new regions built to their outline only; without a model the rules still give one watcher.
  if (g.stories?.[topic] || g.storyPending?.includes(topic) || world.state.frames?.region === 'outline') return []
  if (!world.aiLive) {
    if (storyReady(world, topic)) applyStory(world, topic, null)
    return []
  }
  const name = world.content.topics.get(topic)?.name ?? topic
  const asked = mustAsk(world, `story:${topic}`, `Writing what there is to live through in ${name}`, storyRequest(world, topic), `story ${topic}`)
  if (asked && 'declined' in asked) return []
  if (asked) return askOutput(world, asked.ask)
  ;(g.storyPending ??= []).push(topic)
  return []
}

/** The region whose story is due where the stranger is: a far place made in play, ready, with none yet. */
export function storyDue(world: World): string | undefined {
  const area = world.content.locations.get(world.state.player.location)?.area
  if (!area) return undefined
  const topic = Object.entries(world.state.growth?.far ?? {}).find(([, far]) => String(far.area['id']) === area)?.[0]
  if (!topic || storyOf(world, topic) || world.state.growth?.storyPending?.includes(topic)) return undefined
  return storyReady(world, topic) ? topic : undefined
}
