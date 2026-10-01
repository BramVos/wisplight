import { talksOf } from './chronicler'
import { callName, checkContent, lockedIds, QuestSchema, type Content, type Location, type Npc } from './content'
import { cachedSystem, type LlmRequest } from './dialogue/llm'
import { worldFrame } from './dialogue/prompt'
import { voiceSummary } from './dialogue/voice'
import { grownContent } from './growth/growth'
import { knob } from './knobs'
import { playModeOf } from './modes'
import { factById, recordFact } from './news'
import { activeIn, questlog, regionOfPlace } from './quests/engine'
import { DEED_RULE, endingProblems, fit, placeThings, questFromSketch, readSketch, sketchSchema } from './quests/sketch'
import { worldText } from './safety'
import type { GameState, MadeQuest, NightQuestWant } from './state'
import type { World } from './world'
import { SECRET_PLACES_RULE, secretNote } from './exits'

// The chronicler makes a quest in play (M10.30 (7), Bram's log of 29
// September 2026: Ilyan asked the stranger to recover the recordings, and
// nothing held it). After the night round, when a storyline holds an ask of
// the stranger (a fact of kind asked_stranger) with no quest or request of the
// asker's to go with it, one call writes one quest in the form every quest a
// model writes has (quests/sketch.ts): its stages and deeds, what to do now,
// what each person knows at each stage, and what it keeps hidden, within the
// world's own truth (CHRONICLER.md). At most one a night, and only while the
// asker's region has room (story.quests_active). The play mode delivers it:
// at once, as a hook in the morning, or as a proposal.

type Raw = Record<string, unknown>

const DAY = 24 * 60
/** How many people and places the prompt names, the asker's own first. */
const MOST_PEOPLE = 12
const MOST_PLACES = 16
/** The talks it reads: of the last week, since the night round has told of them already. */
const TALK_DAYS = 7
/** How hard a deed of such a quest is, when it asks for a skill. */
const MADE_DC = 12

/** What the chronicler reads back. */
export interface NightQuestReply {
  make: boolean
  why?: string
  quest?: unknown
}

const RULES = [
  'IN PLAY: A QUEST IN THE MAKING. Someone asked the stranger to do something, and no quest of the game holds it yet. Make it one quest the game can carry, or none (make false) when the ask is too small to be one (a loaf fetched, a word passed on) or already done. There is no designer to ask: you write, the game checks, and what does not fit is left out.',
  'QUEST: a matter of THE ASKER (giver, by key), of kind request, mystery, bargain, discovery, social, trial or conflict; a name; a summary (one sentence, for the designer); what the giver says when asking (ask: one or two sentences in their voice, true to what they said); two to four stages; and an outcome (a name, and one or two sentences of what came of it). Each stage has its journal line (text), what the stranger can do now (goal: the command the player types for its deed, its say, with the place after it if you like: "Copy the recordings in the Listening Room"), what the giver wants of the stranger then (asks: one or two sentences in the giver\'s voice, without quotation marks), and, every stage but the last, the one deed that completes it: say (the command the player types, three to six plain words, a verb first), at (the key of one of the PLACES), with (the key of a person who must be there, or empty), skill (one of SKILLS where the deed asks for it, or empty) and done (one or two sentences of what the deed brings). knows: for each of the PEOPLE with a part, what they know of it at that stage and may say, a sentence with their name. With each, points: where that person may point the stranger at that stage, the only thing they may recommend: now (the Now line), the key of a person or a place, or nothing; at every stage somebody points somewhere.',
  'ENDINGS (always): at least three ways the quest may end, each a deed (say, at, with, skill as a stage has) with a name and what came of it (text): at least two solutions by different ways (way: talk, give for giving or paying, deed for doing something with the world), and at least one where it goes wrong (solution false, way fail). The endings are the deeds of the last stage, so only the last stage may leave its own say, at and done empty; every stage before it has its deed.',
  // Secret and shut places (M10.32): marked in PLACES.
  SECRET_PLACES_RULE,
  DEED_RULE,
  'TRUTHS: what the story keeps hidden, if anything: text, the plain words that would give it away (words), and the stage from which people may say it (from, counted from 1). What the world keeps true stands in THE WORLD\'S OWN TRUTH: never against it.',
  'Keep to what was said: the ask, the talks and the storyline. No death, no fight, no money out of nothing; it can be done with what is there. Use only keys given. JSON only.',
].join('\n')

// ---------------------------------------------------------------- when

/** Whether someone already has a matter with the stranger: a quest they give that has not ended, or an open request. */
function hasMatter(world: World, npcId: string): boolean {
  const log = questlog(world)
  if ([...world.content.quests.values()].some((q) => q.givers.includes(npcId) && !log[q.id]?.ended)) return true
  return world.state.requests.some((r) => r.npc === npcId && r.status === 'open')
}

/** The region someone lives in (M10.30), for the limit. */
export function regionOfNpc(world: World, npcId: string): string {
  return regionOfPlace(world, world.content.npcs.get(npcId)?.home)
}

/**
 * The ask a quest could be made of tonight: the newest of a storyline that is
 * still open, by someone alive with no matter of theirs running, in a region
 * with room; none when one was made or tried today.
 */
export function questWanted(world: World): NightQuestWant | undefined {
  const made = world.state.made
  if (made?.day === Math.floor(world.now / DAY)) return undefined
  const tried = new Set([...(made?.quests ?? []).map((q) => q.asked), ...(made?.declined ?? [])])
  let best: (NightQuestWant & { t: number }) | undefined
  for (const line of world.state.chronicle?.lines ?? []) {
    if (!line.open || line.status === 'closed') continue
    for (const id of line.facts) {
      const fact = factById(world, id)
      if (!fact || fact.kind !== 'asked_stranger' || tried.has(fact.id)) continue
      const asker = fact.about[0]
      if (!asker || !world.content.npcs.has(asker) || !world.alive(asker) || hasMatter(world, asker)) continue
      if (activeIn(world, regionOfNpc(world, asker)).length >= knob(world, 'story.quests_active')) continue
      if (!best || fact.t > best.t) best = { line: line.id, asked: fact.id, keys: {}, t: fact.t }
    }
  }
  if (!best) return undefined
  const { t: _t, ...want } = best
  return { ...want, keys: keysFor(world, want.asked) }
}

// ---------------------------------------------------------------- the request

/** The people and places the quest may use, keyed as the prompt gives them: the asker, the line's people, their area. */
function cast(world: World, asked: string): { people: Npc[]; places: Location[] } {
  const fact = factById(world, asked)
  const asker = fact?.about[0] ?? ''
  const line = world.state.chronicle?.lines.find((l) => l.facts.includes(asked))
  const area = world.content.locations.get(world.content.npcs.get(asker)?.home ?? '')?.area
  const alive = (id: string) => world.content.npcs.has(id) && world.alive(id)
  const ids = [...new Set([asker, ...(line?.people ?? []), ...(line?.roles ?? []).map((r) => r.who), ...[...world.content.npcs.values()].filter((n) => world.content.locations.get(n.home)?.area === area).map((n) => n.id)])].filter(alive)
  const people = ids.slice(0, MOST_PEOPLE).map((id) => world.npc(id))
  const places = [...new Set([...[...world.content.locations.values()].filter((l) => l.area === area).map((l) => l.id), ...(line?.places ?? []), ...people.flatMap((n) => [n.home, n.work ?? ''])])]
    .filter((id) => world.content.locations.has(id))
    .slice(0, MOST_PLACES)
    .map((id) => world.location(id))
  return { people, places }
}

/** The keys of the people and places, key to id: fixed when the call is asked for, so the reply reads the same keys. */
function keysFor(world: World, asked: string): Record<string, string> {
  const { people, places } = cast(world, asked)
  return Object.fromEntries([...people.map((n, i) => [`p${i + 1}`, n.id]), ...places.map((l, i) => [`l${i + 1}`, l.id])])
}

/** The call: the rules and the world's own truth first, then the storyline, the ask, what was said, and who and what there is. */
export function nightQuestRequest(world: World, want: NightQuestWant): LlmRequest {
  const content = world.content
  const fact = factById(world, want.asked)
  const line = world.state.chronicle?.lines.find((l) => l.id === want.line)
  const key = Object.fromEntries(Object.entries(want.keys).map(([k, id]) => [id, k]))
  const people = Object.entries(want.keys).filter(([k]) => k.startsWith('p')).map(([k, id]) => [k, content.npcs.get(id)] as const).filter((e): e is readonly [string, Npc] => Boolean(e[1]))
  const places = Object.entries(want.keys).filter(([k]) => k.startsWith('l')).map(([k, id]) => [k, content.locations.get(id)] as const).filter((e): e is readonly [string, Location] => Boolean(e[1]))
  const facts = (line?.facts ?? []).map((id) => factById(world, id)).filter((f) => f !== undefined)
  const talks = line ? talksOf(world, line, facts, { since: world.now - TALK_DAYS * DAY }) : []
  const skills = (content.rules?.skills ?? []).map((s) => s.id)
  const running = activeIn(world, regionOfNpc(world, fact?.about[0] ?? '')).map((id) => content.quests.get(id)?.name ?? id)
  // The world's own part of the chronicler's notes (M10.30): its truth, without the working instruction every world shares.
  const notes = content.chronicler ?? ''
  const own = notes.indexOf('## This world')
  const shared = notes.indexOf('# Working instruction', own + 1)
  const truth = (own < 0 ? notes : shared > own ? notes.slice(own, shared) : notes.slice(own)).trim()
  return {
    role: 'chronicler',
    ...cachedSystem([RULES, ...(truth ? ['', "THE WORLD'S OWN TRUTH (the chronicler's notes of this world):", worldText(truth)] : [])].join('\n'), '', '', 'none'),
    prompt: [
      worldText([worldFrame(content, world.land), voiceSummary(content, world.land)].filter(Boolean).join('\n\n')),
      '',
      `STORYLINE: "${line?.title ?? ''}"`,
      ...(line?.summary.length ? [`  so far: ${line.summary.join(' / ')}`] : []),
      ...(line?.hooks.length ? [`  open threads: ${line.hooks.join(' / ')}`] : []),
      ...facts.slice(-4).map((f) => `  ${f.text.precise}`),
      `THE ASKER: ${key[fact?.about[0] ?? ''] ?? ''}. ${fact?.text.precise ?? ''}`,
      ...(talks.length ? ['WHAT WAS SAID (their notes of their talks with the stranger):', ...talks.map((t) => `  ${t}`)] : []),
      'PEOPLE:',
      ...people.map(([k, n]) => `  ${k} ${n.name}, ${content.professions.get(n.profession)?.name ?? n.profession}, at ${key[n.home] ?? n.home}. ${n.public_facts[0] ?? ''}`),
      'PLACES:',
      ...places.map(([k, l]) => `  ${k} ${l.name}: ${l.summary ?? l.description.day.split(/(?<=[.!?])\s/)[0]}${placeThings(content, l)}${secretNote(content, l.id)}`),
      `SKILLS: ${skills.length ? skills.join(', ') : 'none'}`,
      `QUESTS RUNNING HERE: ${running.length ? running.join('; ') : 'none'}`,
    ].join('\n'),
    schemaName: 'night_quest',
    schema: NIGHT_QUEST_SCHEMA,
    maxTokens: 2000,
    meta: { line: want.line, asked: want.asked, keys: want.keys, asker: key[fact?.about[0] ?? ''] ?? '', people: people.map(([k, n]) => ({ key: k, name: n.name })), places: places.map(([k]) => k), skills },
  }
}

/**
 * The schema of the call, the same every night: the shared sketch, with its
 * endings required here (M10.30: at low, with endings optional, Opus 5.5 left
 * them out and wrote one stage without a deed).
 */
const NIGHT_QUEST_SCHEMA = (() => {
  const sketch = sketchSchema() as { required: string[] }
  return {
    type: 'object',
    additionalProperties: false,
    required: ['make', 'why'],
    properties: { make: { type: 'boolean' }, why: { type: 'string' }, quest: { ...sketch, required: [...sketch.required, 'endings'] } },
  }
})()

/** The reply, or null when it cannot be read. */
export function nightQuestReply(text: string): NightQuestReply | null {
  try {
    const v = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as NightQuestReply
    return v && typeof v.make === 'boolean' ? v : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- the quest

/** An id for a quest made in play: never one the world has or ever had. */
function freeId(world: World, stem: string): string {
  const locked = lockedIds(world.base)
  const clean = `made_${stem}`.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_')
  let id = clean
  for (let n = 2; locked.has(id) || world.content.quests.has(id) || (world.state.made?.quests ?? []).some((q) => q.id === id); n++) id = `${clean}_${n}`
  return id
}

/** The quest the reply makes, checked like any content, or none. */
export function makeNightQuest(world: World, want: NightQuestWant, reply: NightQuestReply | null): MadeQuest | undefined {
  const sketch = reply?.make ? readSketch(reply.quest) : null
  if (!sketch) return undefined
  const byKey = (kind: 'p' | 'l') => (k: string | undefined) => {
    const id = k && k.trim().startsWith(kind) ? want.keys[k.trim()] : undefined
    return id && (kind === 'p' ? world.content.npcs.has(id) && world.alive(id) : world.content.locations.has(id)) ? id : undefined
  }
  const places = Object.entries(want.keys).filter(([k]) => k.startsWith('l')).map(([, id]) => ({ id }))
  const skills = new Set((world.content.rules?.skills ?? []).map((s) => s.id))
  const asker = factById(world, want.asked)?.about[0]
  // Only the asker's matter, and not the world's main line.
  if (byKey('p')(sketch.giver) !== asker || sketch.kind === 'main' || sketch.kind === 'personal') return undefined
  // At least three ways to end, two of them solutions by different ways, and one where it goes wrong (M10.30).
  if (endingProblems(sketch).length) return undefined
  const id = freeId(world, fit(sketch.name, 80)?.split(/\s+/).slice(0, 4).join('_') ?? 'quest')
  const quest = questFromSketch(world, { ...sketch, begins: 'talk' }, id, { person: byKey('p'), place: byKey('l'), places, skills, dc: MADE_DC, minStages: 2, mostStages: 4 })
  if (!quest) return undefined
  const made: MadeQuest = { id, line: want.line, asked: want.asked, quest, t: world.now, why: fit(reply?.why, 300) ?? '' }
  // It must load with everything else, or it is left out.
  const state: GameState = { ...world.state, made: { ...(world.state.made ?? { quests: [] }), quests: [...(world.state.made?.quests ?? []), made] } }
  try {
    if (checkContent(grownContent(world.base, state)).length) return undefined
  } catch {
    return undefined
  }
  return made
}

/**
 * The night's quest, as the play mode has it (M10.30): at once in the world,
 * or held as a hook for the morning (think); a proposal the engine put first
 * (direct) comes here when accepted. Once a night, made or not.
 */
export function applyNightQuest(world: World, want: NightQuestWant, reply: NightQuestReply | null): MadeQuest | undefined {
  const m = (world.state.made ??= { quests: [] })
  m.pending = undefined
  m.day = Math.floor(world.now / DAY)
  const made = makeNightQuest(world, want, reply)
  if (!made) {
    ;(m.declined ??= []).push(want.asked)
    return undefined
  }
  if (playModeOf(world) === 'think') made.held = true
  m.quests.push(made)
  world.regrow()
  const giver = ((made.quest['givers'] as string[] | undefined) ?? [])[0]!
  const name = String(made.quest['name'])
  if (made.held) {
    const modes = (world.state.modes ??= { seq: 0, hooks: [], proposals: [] })
    modes.hooks.push({ id: `hook_${++modes.seq}`, t: world.now, until: world.now + knob(world, 'story.hook_days') * DAY, made: made.id, label: `${callName(world.npc(giver))} wants a word with you: ${name}` })
  }
  // A change of the world, in the log and the chronicle with why; not news anyone tells.
  recordFact(world, {
    kind: 'quest_made',
    about: [giver],
    place: world.content.npcs.get(giver)?.home ?? world.state.player.location,
    belang: 0,
    witnesses: [],
    title: `a matter of ${callName(world.npc(giver))}'s`,
    text: { precise: `${made.why ? `${made.why} ` : ''}A matter to take up: ${name}.`, village: `${callName(world.npc(giver))} has something on their mind.`, far: 'Someone has something on their mind.' },
  })
  return made
}

/** A held quest taken up (think): it comes into the world now; what its giver will say. */
export function releaseNightQuest(world: World, id: string): string | undefined {
  const made = world.state.made?.quests.find((q) => q.id === id)
  if (!made?.held) return undefined
  made.held = false
  world.regrow()
  return String(made.quest['ask'] ?? '')
}

/** The changes it would make, one a line, for a proposal (direct). */
export function nightQuestLines(world: World, want: NightQuestWant, reply: NightQuestReply | null): string[] {
  const made = makeNightQuest(world, want, reply)
  if (!made) return ['(nothing)']
  const giver = ((made.quest['givers'] as string[] | undefined) ?? [])[0]!
  return [`+ a matter of ${callName(world.npc(giver))}: ${String(made.quest['name'])}. "${String(made.quest['ask'])}"`, ...((made.quest['stages'] as Raw[]) ?? []).map((s) => `  then: ${String(s['text'])}`)]
}

// ---------------------------------------------------------------- the layer

/** The quests made in play, for the content of a game: those not held. */
export function withMadeQuests(content: Content, state: GameState): Content {
  const made = (state.made?.quests ?? []).filter((q) => !q.held)
  if (!made.length) return content
  const quests = new Map(content.quests)
  for (const m of made) {
    const q = QuestSchema.parse(m.quest)
    if (!quests.has(q.id)) quests.set(q.id, q)
  }
  return { ...content, quests }
}
