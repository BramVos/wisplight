import { chronicle, emptyOutput, type Card, type ChronicleEvent, type ChronicleInput, type ChronicleLine, type ChronicleOutput, type ChroniclerModel, type PlanOp, type QuestTemplate } from '../chronicler'
import { PlanSchema, type Plan } from './quests/plans'
import { shiftTension } from './social/realms'
import { GameClock, MONTHS, WEEKDAYS } from './clock'
import { callName } from './content'
import { leakedNames, unknownNames, vocabularyOf } from './dialogue/guard'
import { worldFrame } from './dialogue/prompt'
import { itemName } from './items'
import { questsOf } from './life'
import { factById } from './news'
import { isNear, noun, ties } from './people'
import { askLine, openRequest, openRequestsOf, requestName } from './requests'
import type { ChronicleRun, Fact, LoreEntry, Storyline } from './state'
import { chronicleState, unreported } from './storylines'
import type { World } from './world'

// The game's side of the chronicler (design: lore and world change). The
// chronicler itself (src/chronicler) knows nothing of the game: this file
// builds its overview from the world, answers its lookups, checks what comes
// back against the world, and applies it. Without a model, or when a reply
// fails, the same storylines are written up from templates.

/** Requests the game can check and reward (FO, chapter 14, the verifiable ones). */
export const QUEST_TEMPLATES: QuestTemplate[] = [
  { kind: 'fetch', text: 'bring the giver something they need; any of that thing will do', needs: ['item'] },
  { kind: 'recover', text: 'find what the giver lost or had stolen, and bring it back', needs: ['item'] },
  { kind: 'visit', text: 'go and see someone for the giver: to comfort, to warn, to ask after them', needs: ['target'] },
]

const FALLBACK_INSTRUCTION = 'Write the lore of this world from what happened. Only facts from the overview; only names from the overview.'

function when(world: World, t: number): string {
  return new GameClock(t).short(world.calendar).replace(',', '')
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

// ---------------------------------------------------------------- the overview

function areaName(world: World, location: string): string {
  const area = world.location(location).area
  return world.content.areas.get(area)?.name ?? area
}

function personCard(world: World, id: string, cast: Set<string>): Card {
  const npc = world.npc(id)
  const profession = world.content.professions.get(npc.profession)?.name ?? npc.profession
  const their = npc.pronoun === 'she' ? 'her' : npc.pronoun === 'he' ? 'his' : 'their'
  const parts = [`${npc.name}, ${npc.age}, ${profession.toLowerCase()} in ${areaName(world, npc.home)}${world.state.npcs[id]?.dead ? ', dead' : ''}.`]
  for (const tie of ties(world, id)) {
    const inCast = tie.id && cast.has(tie.id)
    if (!inCast && !(isNear(tie) && !tie.id)) continue
    const line = `${tie.name} is ${their} ${noun(tie)}${tie.status === 'alive' ? '' : ` (${tie.status})`}${tie.note && tie.private ? `: ${tie.note}` : ''}.`
    parts.push(tie.private ? `PRIVATE: ${line}` : line)
  }
  const quests = questsOf(world, id)
  if (quests.length) parts.push(`Has a part in: ${quests.map((q) => q.name).join(', ')}.`)
  return { id, kind: 'person', name: npc.short, text: parts.join(' ') }
}

function placeCard(world: World, id: string): Card {
  const location = world.location(id)
  return { id, kind: 'place', name: location.name, text: `${location.summary ?? location.description.day.split(/(?<=\.)\s/)[0]!.trim()} (${areaName(world, id)})` }
}

function eventOf(world: World, fact: Fact): ChronicleEvent {
  const who = fact.about.filter((id) => world.content.npcs.has(id))
  const witnesses = Object.entries(world.state.news?.heard ?? {})
    .filter(([id, heard]) => id !== 'player' && heard[fact.id]?.from === 'witness' && !who.includes(id))
    .map(([id]) => id)
    .sort()
    .slice(0, 4)
  return { id: fact.id, when: when(world, fact.t), place: fact.place, who, witnesses, belang: fact.belang, text: fact.text.precise, ...(fact.truth === false ? { untrue: true } : {}) }
}

export function buildInput(world: World, run: ChronicleRun): ChronicleInput {
  const state = chronicleState(world)
  const lines = run.lines.map((id) => state.lines.find((l) => l.id === id)).filter((l): l is Storyline => Boolean(l))
  const facts = (line: Storyline) => line.facts.map((id) => factById(world, id)).filter((f): f is Fact => Boolean(f))
  const chronicleLines: ChronicleLine[] = lines.map((line) => ({
    id: line.id,
    title: line.title,
    ...(line.pattern ? { pattern: line.pattern } : {}),
    summary: line.summary,
    roles: line.roles,
    hooks: line.hooks,
    next: line.next,
    events: unreported(world, line).map((f) => eventOf(world, f)),
    earlier: facts(line)
      .filter((f) => line.reported.includes(f.id))
      .slice(-3)
      .map((f) => eventOf(world, f)),
  }))

  const cast = new Set<string>()
  const places = new Set<string>()
  const big = lines.filter((line) => unreported(world, line).some((f) => f.belang >= 4))
  // A big event may get a plan of consequences, unless a plan was started lately (a fixed one covers it).
  const lately = (world.state.plans ?? []).some((p) => world.now - p.started < 24 * 60)
  const plannable = lately ? [] : big.map((l) => l.id)
  const items = new Set<string>()
  for (const line of chronicleLines) {
    for (const event of [...line.events, ...line.earlier]) {
      for (const id of [...event.who, ...event.witnesses]) cast.add(id)
      places.add(event.place)
    }
    for (const role of line.roles) if (world.content.npcs.has(role.who)) cast.add(role.who)
  }
  for (const line of lines) {
    for (const f of facts(line)) for (const id of f.about) if (id.startsWith('item_') && world.content.items.has(id.slice(5))) items.add(id.slice(5))
    if (facts(line).some((f) => f.kind === 'sickness')) items.add('herbs')
  }
  // The people near to those in the story: the family of the dead, a sweetheart.
  for (const id of [...cast]) for (const tie of ties(world, id)) if (isNear(tie) && tie.id && world.content.npcs.has(tie.id) && !world.state.npcs[tie.id]?.absent) cast.add(tie.id)
  const requests = [...cast].flatMap((id) => openRequestsOf(world, id))
  for (const r of requests) if (r.item) items.add(r.item)

  const sorted = (set: Set<string>) => [...set].sort()
  const cards: Card[] = [
    ...sorted(cast).map((id) => personCard(world, id, cast)),
    ...sorted(places).map((id) => placeCard(world, id)),
    ...sorted(items).map((id) => ({ id, kind: 'item' as const, name: itemName(world.content, id), text: world.content.items.get(id)?.description ?? '' })),
  ]
  const areas = [...new Set([...places].map((p) => world.location(p).area))].sort()
  const related = relatedLore(world, lines, cast, areas)
  const older = state.lines
    .filter((l) => !run.lines.includes(l.id) && (l.people.some((p) => cast.has(p)) || l.places.some((p) => places.has(p))))
    .slice(-5)
    .map((l) => ({ id: l.id, title: l.title }))

  return {
    instruction: world.content.chronicler ?? FALLBACK_INSTRUCTION,
    world: worldFrame(world.content),
    catalogue: catalogue(world),
    now: when(world, world.now),
    lines: chronicleLines,
    cards,
    lore: related,
    requests: requests.map((r) => ({ id: r.id, kind: 'request', name: requestName(world, r), text: `${callName(world.npc(r.npc))} asks: ${askLine(world, r)}` })),
    areas: areas.map((id) => ({ id, kind: 'area', name: world.content.areas.get(id)?.name ?? id, text: world.content.areas.get(id)?.summary ?? '' })),
    templates: QUEST_TEMPLATES,
    older,
    // Big events only (M7.2): the lands, whose relations may shift, and the storylines whose consequences may be planned.
    ...(big.length ? { realms: [...world.content.realms.values()].map((r) => ({ id: r.id, kind: 'realm' as const, name: r.name, text: `Ruled by ${r.ruler}, from ${r.capital}.` })) } : {}),
    ...(plannable.length ? { mayPlan: plannable } : {}),
  }
}

/** A plan of the chronicler's is a plan like the fixed ones, with an id of its own (M7.2). */
function toPlan(world: World, op: PlanOp, id: string): Plan | undefined {
  const groups: Plan['groups'] = {}
  const phases = op.phases.map((phase) => ({
    after: phase.after,
    effects: phase.effects.map((e) => {
      if ('place' in e) return { place: e.place, state: e.state }
      if ('news' in e) return { news: e.news, area: e.area }
      if ('market' in e) return { market: e.market, factor: e.factor }
      groups[e.flee] = { areas: [e.flee], npcs: [], except: [] }
      return { flee: e.flee, to: e.to, days: e.days }
    }),
  }))
  const parsed = PlanSchema.safeParse({ id, name: op.name, groups, phases, max_effects: 10 })
  if (!parsed.success) return undefined
  // Only places and things of this world.
  const ok = parsed.data.phases.every((p) =>
    p.effects.every((e) => ('place' in e && 'state' in e ? world.content.locations.has(e.place) : 'area' in e ? world.content.areas.has(e.area) : 'market' in e ? world.content.items.has(e.market) : 'flee' in e ? world.content.locations.has(e.to) : true)),
  )
  return ok ? parsed.data : undefined
}

function catalogue(world: World): string {
  const patterns = [...world.content.patterns.values()].map((p) => `${p.id} (${p.kind}, belang ${p.belang})`).join(', ')
  return `Small story patterns the world plays by itself: ${patterns}. Deaths, needs and news come from the rules.`
}

function relatedLore(world: World, lines: Storyline[], cast: Set<string>, areas: string[]): Card[] {
  const cards: Card[] = []
  for (const entry of world.state.chronicle?.lore ?? []) {
    if (lines.some((l) => l.id === entry.line) || entry.facts.some((f) => factById(world, f)?.about.some((a) => cast.has(a)))) {
      cards.push({ id: entry.id, kind: 'lore', name: entry.name, text: entry.summary })
    }
  }
  for (const topic of [...world.content.topics.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (topic.kind !== 'lore' && topic.kind !== 'fact') continue
    const origin = topic.origin ? (world.content.areas.has(topic.origin) ? topic.origin : world.content.locations.get(topic.origin)?.area) : undefined
    if ((origin && areas.includes(origin)) || topic.everywhere) cards.push({ id: topic.id, kind: 'lore', name: topic.name, text: topic.summary })
  }
  return cards.slice(0, 8)
}

/** Fuller cards for the chronicler's lookups: a person, a place, lore, an older storyline, a thing. */
export function lookupCards(world: World, ids: string[]): Card[] {
  const cards: Card[] = []
  for (const id of ids) {
    const npc = world.content.npcs.get(id)
    if (npc) {
      const people = ties(world, id).map((t) => `${t.private ? 'PRIVATE: ' : ''}${t.name}, ${noun(t)}${t.status === 'alive' ? '' : ` (${t.status})`}${t.note ? `: ${t.note}` : ''}`)
      cards.push({ id, kind: 'person', name: npc.short, text: [npc.appearance, ...npc.public_facts, people.length ? `People: ${people.join('; ')}.` : ''].filter(Boolean).join(' ') })
      continue
    }
    if (world.content.locations.has(id)) {
      const location = world.location(id)
      cards.push({ id, kind: 'place', name: location.name, text: location.description.day.replace(/\s+/g, ' ').trim() })
      continue
    }
    const topic = world.content.topics.get(id)
    if (topic) {
      cards.push({ id, kind: 'lore', name: topic.name, text: [topic.summary, topic.details, topic.story?.split(/\s+/).slice(0, 80).join(' ')].filter(Boolean).join(' ') })
      continue
    }
    const lore = world.state.chronicle?.lore.find((l) => l.id === id)
    if (lore) {
      cards.push({ id, kind: 'lore', name: lore.name, text: [lore.details, lore.story].filter(Boolean).join(' ') })
      continue
    }
    const line = world.state.chronicle?.lines.find((l) => l.id === id)
    if (line) {
      const titles = line.facts.map((f) => factById(world, f)?.title).filter(Boolean)
      cards.push({ id, kind: 'lore', name: line.title, text: [...line.summary, `Events: ${titles.join('; ')}.`].join(' ') })
      continue
    }
    const item = world.content.items.get(id)
    if (item) cards.push({ id, kind: 'item', name: item.name, text: item.description ?? '' })
  }
  return cards
}

// ---------------------------------------------------------------- applying what comes back

function vocabulary(world: World): Set<string> {
  return vocabularyOf(
    { ...world.content, chronicler: undefined },
    worldFrame(world.content),
    MONTHS,
    WEEKDAYS,
    (world.state.lore?.far ?? []).map((f) => f.name),
    (world.state.chronicle?.lore ?? []).map((l) => l.name),
  )
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(the|a|an)\s+/, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .split('_')
    .slice(0, 4)
    .join('_')
}

/**
 * Checks the chronicler's operations against the world and applies what holds.
 * Returns what was dropped, and why. Lines it did not cover get templates.
 */
export function applyOutput(world: World, run: ChronicleRun, output: ChronicleOutput | null, by: LoreEntry['by'] = 'chronicler'): string[] {
  const state = chronicleState(world)
  const problems: string[] = []
  const out = output ?? emptyOutput()
  const words = vocabulary(world)
  const lines = run.lines.map((id) => state.lines.find((l) => l.id === id)).filter((l): l is Storyline => Boolean(l))
  const input = buildInput(world, run)
  // Everyone and everything in the overview may be named; nobody else.
  const allowed = new Set([...input.cards.map((c) => c.id), ...input.lore.map((c) => c.id), ...input.areas.map((a) => `area_${a.id}`)])
  const properNames = [
    ...[...world.content.npcs.values()].flatMap((n) => [
      { id: n.id, name: n.name },
      { id: n.id, name: n.short },
    ]),
    ...[...world.content.locations.values()].map((l) => ({ id: l.id, name: l.name })),
  ]
  const fits = (what: string, ...texts: string[]) => {
    for (const text of texts.filter(Boolean)) {
      const invented = unknownNames(text, words)
      if (invented.length) {
        problems.push(`${what}: names the world does not know (${invented.join(', ')})`)
        return false
      }
      const strangers = leakedNames(text, properNames, allowed)
      if (strangers.length) {
        problems.push(`${what}: names people or places that are not in the story (${strangers.join(', ')})`)
        return false
      }
    }
    return true
  }

  const written = new Set<string>()
  for (const op of out.lore) {
    const line = lines.find((l) => l.id === op.line)
    if (!line) continue
    const facts = line.facts.map((id) => factById(world, id)).filter((f): f is Fact => Boolean(f))
    const belang = Math.max(0, ...facts.map((f) => f.belang))
    if (belang < 3) {
      problems.push(`lore "${op.name}": the storyline is not big enough for lore (belang ${belang})`)
      continue
    }
    if (!fits(`lore "${op.name}"`, op.summary, op.details, op.story, op.far)) continue
    const teller = op.teller && facts.some((f) => world.state.news?.heard[op.teller!]?.[f.id]?.from === 'witness') ? op.teller : undefined
    writeLore(world, line, facts, belang, { name: op.name, summary: op.summary, details: op.details, story: op.story, far: op.far, teller, links: op.links.filter((l) => world.content.topics.has(l) || world.content.npcs.has(l) || state.lore.some((e) => e.id === l)) }, by)
    written.add(line.id)
  }

  const noted = new Set<string>()
  for (const op of out.lines) {
    const line = lines.find((l) => l.id === op.line)
    if (!line || !fits(`note on ${line.id}`, ...op.summary, ...op.hooks, op.next)) continue
    line.summary = op.summary
    line.roles = op.roles.filter((r) => world.content.npcs.has(r.who))
    line.hooks = op.hooks
    line.next = op.next
    if (op.close) line.open = false
    noted.add(line.id)
  }

  for (const op of out.quests) {
    const line = lines.find((l) => l.id === op.line)
    if (!line || !fits(`request "${op.name}"`, op.ask, op.stakes)) continue
    if (op.request) {
      const request = world.state.requests.find((r) => r.id === op.request && r.status === 'open')
      if (!request) continue
      Object.assign(request, { name: op.name, ask: op.ask, stakes: op.stakes, line: line.id })
      continue
    }
    const here = (id: string) => world.alive(id) && !world.state.npcs[id]?.absent
    if (!here(op.giver) || !input.cards.some((c) => c.id === op.giver)) {
      problems.push(`request "${op.name}": ${op.giver} cannot ask anything`)
      continue
    }
    if (op.template === 'visit' && (!op.target || op.target === op.giver || !here(op.target))) {
      problems.push(`request "${op.name}": nobody to visit`)
      continue
    }
    const made = openRequest(world, {
      npc: op.giver,
      kind: op.template as 'fetch' | 'recover' | 'visit',
      ...(op.item ? { item: op.item } : {}),
      ...(op.target ? { target: op.target } : {}),
      line: line.id,
      name: op.name,
      ask: op.ask,
      stakes: op.stakes,
      source: 'chronicler',
    })
    if (!made) problems.push(`request "${op.name}": ${op.giver} already asks something`)
  }

  for (const op of out.thoughts) {
    if (!world.alive(op.who) || !input.cards.some((c) => c.id === op.who) || !fits('thought', op.text)) continue
    const npc = world.npcState(op.who)
    npc.thoughts = [...(npc.thoughts ?? []).filter((t) => t.until > world.now), { text: op.text, t: world.now, until: world.now + 7 * 24 * 60 }].slice(-3)
  }

  for (const op of out.news) {
    if (!world.content.areas.has(op.area) || !fits(`news for ${op.area}`, op.text)) continue
    state.news[op.area] = { text: op.text, t: world.now }
  }

  // Realms and plans (M7.2): bounded again here, and only what this run was offered.
  for (const op of (out.tensions ?? []).slice(0, 1)) {
    if (!input.realms?.length || !world.content.realms.has(op.between[0]) || !world.content.realms.has(op.between[1])) {
      problems.push('tension: not offered')
      continue
    }
    shiftTension(world, op.between[0], op.between[1], Math.max(-5, Math.min(5, op.delta)), op.why)
  }
  for (const op of out.plans ?? []) {
    if (!input.mayPlan?.includes(op.line)) {
      problems.push(`plan "${op.name}": not offered`)
      continue
    }
    const id = `chronicle_${state.runs + 1}_${(world.state.dynamicPlans ? Object.keys(world.state.dynamicPlans).length : 0) + 1}`
    const plan = toPlan(world, op, id)
    if (!plan) {
      problems.push(`plan "${op.name}": does not fit this world`)
      continue
    }
    ;(world.state.dynamicPlans ??= {})[id] = plan
    ;(world.state.pendingPlans ??= []).push(id)
  }

  // What the chronicler left out, the templates fill in.
  for (const line of lines) {
    const facts = line.facts.map((id) => factById(world, id)).filter((f): f is Fact => Boolean(f))
    const fresh = unreported(world, line)
    const biggest = [...facts].sort((a, b) => b.belang - a.belang || b.t - a.t)[0]
    if (!written.has(line.id) && biggest && biggest.belang >= 3 && fresh.length) writeLore(world, line, facts, biggest.belang, templateLore(biggest), 'template')
    if (!noted.has(line.id)) line.summary = facts.slice(-3).map((f) => `${cap(f.title)} (${when(world, f.t)}).`)
    if (fresh.length && biggest) {
      const area = world.location(fresh.at(-1)!.place).area
      const old = state.news[area]
      if (!out.news.some((n) => n.area === area) && (!old || world.now - old.t > 12 * 60)) state.news[area] = { text: fresh.at(-1)!.text.village, t: world.now }
    }
    line.reported = [...line.facts]
  }
  state.runs++
  return problems
}

function templateLore(fact: Fact) {
  return { name: cap(fact.title), summary: fact.text.village, details: fact.text.precise, story: '', far: fact.text.far, teller: undefined, links: [] as string[] }
}

function writeLore(world: World, line: Storyline, facts: Fact[], belang: number, text: ReturnType<typeof templateLore> | Omit<LoreEntry, 'id' | 'fame' | 'place' | 'line' | 'facts' | 't' | 'by'>, by: LoreEntry['by']): void {
  const state = chronicleState(world)
  const biggest = [...facts].sort((a, b) => b.belang - a.belang || b.t - a.t)[0]!
  const existing = state.lore.find((l) => l.line === line.id)
  const entry: LoreEntry = {
    id: existing?.id ?? `chr_${++state.seq}_${slug(text.name) || 'story'}`,
    name: text.name,
    summary: text.summary,
    details: text.details,
    story: text.story,
    far: text.far,
    ...(text.teller ? { teller: text.teller } : {}),
    // Lore reaches as far as the news it came from (design, "Belang van gebeurtenissen").
    fame: Math.min(5, belang),
    place: biggest.place,
    line: line.id,
    facts: [...line.facts],
    links: text.links,
    t: existing?.t ?? world.now,
    by,
  }
  if (existing) Object.assign(existing, entry)
  else state.lore.push(entry)
}

/** Without a model, runs are written up from templates at once, at the moment they were asked for. */
export function settleRuns(world: World): void {
  const state = world.state.chronicle
  if (!state?.pending.length || world.aiLive) return
  while (state.pending.length) applyRun(world, state.pending[0]!.id, null, 'template')
}

/** Applies a finished run, from the model or from templates, and takes it off the waiting list. */
export function applyRun(world: World, runId: string, output: ChronicleOutput | null, by: LoreEntry['by'] = output ? 'chronicler' : 'template'): string[] {
  const state = chronicleState(world)
  const index = state.pending.findIndex((r) => r.id === runId)
  if (index < 0) return [`no waiting run ${runId}`]
  const [run] = state.pending.splice(index, 1)
  return applyOutput(world, run!, output, by)
}

/** Runs the chronicler model on the first waiting run. The caller records and applies the result. */
export async function writeRun(world: World, run: ChronicleRun, model: ChroniclerModel): Promise<{ output: ChronicleOutput; problems: string[] }> {
  const result = await chronicle(buildInput(world, run), model, (ids) => lookupCards(world, ids))
  return { output: result.output, problems: result.problems }
}
