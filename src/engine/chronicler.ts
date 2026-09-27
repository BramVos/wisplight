import { chronicle, emptyOutput, type Card, type ChronicleEvent, type ChronicleInput, type ChronicleLine, type ChronicleOutput, type ChroniclerModel, type ChroniclerRequest, type PlanOp, type QuestTemplate } from '../chronicler'
import { PlanSchema, type Plan, type PlanEffect } from './quests/planschema'
import { shiftTension } from './social/realms'
import { GameClock, MONTHS, WEEKDAYS } from './clock'
import { callName } from './content'
import { leakedNames, unknownNames, vocabularyOf } from './dialogue/guard'
import { worldFrame } from './dialogue/prompt'
import { itemName, remedyItem } from './items'
import { questsOf } from './life'
import { factById } from './news'
import { isNear, noun, ties } from './people'
import { askLine, openRequest, openRequestsOf, requestName } from './requests'
import type { ChronicleRun, ChronicleState, Claim, Fact, LoreEntry, Offered, Storyline } from './state'
import { judged, judgeRequest, loreProblem } from './truth'
import { answerLookup, lookupFromId } from './lookups'
import { chronicleState, unreported } from './storylines'
import { chroniclerVerbs, extraCards, signalCards, startChroniclePlan, stepsFromOp, unplanned } from './planning'
import { withoutReference } from './quests/reference'
import { tradeLine } from './economy/ledger'
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
  const because = (fact.cause ?? []).map((id) => factById(world, id)?.title).filter((t): t is string => Boolean(t))
  return { id: fact.id, when: when(world, fact.t), place: fact.place, who, witnesses, belang: fact.belang, text: fact.text.precise, ...(fact.truth === false ? { untrue: true } : {}), ...(because.length ? { because } : {}) }
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
    ...(line.phase ? { phase: line.phase } : {}),
    roles: line.roles,
    hooks: line.hooks,
    next: line.next,
    events: unreported(world, line).map((f) => eventOf(world, f)),
    earlier: facts(line)
      .filter((f) => line.reported.includes(f.id))
      .slice(-3)
      .map((f) => eventOf(world, f)),
    ...(arcOf(state, line).length ? { arc: arcOf(state, line) } : {}),
  }))

  const cast = new Set<string>()
  const places = new Set<string>()
  const big = lines.filter((line) => unreported(world, line).some((f) => f.belang >= 4))
  // A big event may get a plan of consequences, unless a fixed plan that lets people flee started lately (it covers it).
  const plannable = mayPlan(world) ? big.map((l) => l.id) : []
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
    const remedy = remedyItem(world.content, 'sickened')
    if (remedy && facts(line).some((f) => f.kind === 'sickness')) items.add(remedy)
  }
  // Where people could go if they have to flee (M8.1): the chronicler decides the flight of a big event,
  // so a plannable line comes with the churches, chapels and inns of the region as places.
  const refuges: string[] = []
  if (plannable.length) {
    const from = [...places][0]
    const shelters = [...world.content.locations.values()]
      .filter((l) => (l.tags.includes('holy') || l.tags.includes('social')) && l.tags.includes('public') && !l.tags.some((t) => t === 'haunted' || t.startsWith('hazard')))
      .map((l) => ({ id: l.id, minutes: from ? (world.route(from, l.id)?.minutes ?? Infinity) : 0 }))
      .sort((a, b) => a.minutes - b.minutes || a.id.localeCompare(b.id))
    for (const s of shelters.slice(0, 6)) if (!places.has(s.id)) refuges.push(s.id)
  }
  // The people near to those in the story: the family of the dead, a sweetheart.
  for (const id of [...cast]) for (const tie of ties(world, id)) if (isNear(tie) && tie.id && world.content.npcs.has(tie.id) && !world.state.npcs[tie.id]?.absent) cast.add(tie.id)
  const requests = [...cast].flatMap((id) => openRequestsOf(world, id))
  for (const r of requests) if (r.item) items.add(r.item)

  const sorted = (set: Set<string>) => [...set].sort()
  const cards: Card[] = [
    ...sorted(cast).map((id) => personCard(world, id, cast)),
    ...sorted(places).map((id) => placeCard(world, id)),
    ...refuges.map((id) => placeCard(world, id)),
    ...sorted(items).map((id) => ({ id, kind: 'item' as const, name: itemName(world.content, id), text: world.content.items.get(id)?.description ?? '' })),
  ]
  const areas = [...new Set([...places].map((p) => world.location(p).area))].sort()
  const related = relatedLore(world, lines, cast, areas)
  const older = state.lines
    .filter((l) => !run.lines.includes(l.id) && (l.people.some((p) => cast.has(p)) || l.places.some((p) => places.has(p))))
    .slice(-5)
    .map((l) => ({ id: l.id, title: l.title }))

  // Signals to plan for (M8.3), with the people and places they bring, and the verbs he may use.
  const planning = signalCards(world, run.signals ?? [])
  const input: ChronicleInput = {
    instruction: withoutReference(world.content.chronicler ?? FALLBACK_INSTRUCTION),
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
    ...(planning.signals.length ? { signals: planning.signals } : {}),
    verbs: chroniclerVerbs(),
    pace: { building: building(world, run), climaxes: climaxes(world) },
  }
  extraCards(world, input, planning.people, planning.places, (id) => personCard(world, id, new Set([...cast, ...planning.people])), (id) => placeCard(world, id))
  return input
}

/** The storylines a line goes on from, oldest first, at most four (M9.2). */
function arcOf(state: ChronicleState, line: Storyline): { title: string; summary: string[] }[] {
  const arc: { title: string; summary: string[] }[] = []
  let at = line.follows ? state.lines.find((l) => l.id === line.follows) : undefined
  while (at && arc.length < 4) {
    arc.unshift({ title: at.title, summary: at.summary.slice(0, 2) })
    at = at.follows ? state.lines.find((l) => l.id === at!.follows) : undefined
  }
  return arc
}

/**
 * Whether the chronicler may plan consequences now: not while a fixed plan
 * that lets people flee started in the last day, for that covers the event.
 * Plans of the aftermath and of the chronicler do not count (M8.1), and a war
 * without a flight of its own leaves the flight to him (Bram, 27 September).
 */
export function mayPlan(world: World): boolean {
  return !(world.state.plans ?? []).some((p) => {
    if (world.now - p.started >= 24 * 60 || !world.content.plans.has(p.plan)) return false
    const plan = world.content.plans.get(p.plan)!
    return plan.phases.some((ph) => ph.effects.some((e) => 'flee' in e)) || plan.steps.some((s) => 'flee' in s.do)
  })
}

/** A plan of the chronicler's is a plan like the fixed ones, with an id of its own (M7.2). */
function toPlan(world: World, op: PlanOp & { line: string }, id: string, cause: Claim | undefined): Plan | undefined {
  const groups: Plan['groups'] = {}
  const steps: Plan['steps'] = []
  const phases = op.phases.map((phase, i) => ({
    after: phase.after,
    effects: phase.effects.flatMap((e): PlanEffect[] => {
      if ('place' in e) return [{ place: e.place, state: e.state }]
      if ('news' in e) return [{ news: e.news, area: e.area }]
      if ('market' in e) return [{ market: e.market, factor: e.factor }]
      // A flight is a step, and it ends with a return by what each of them knows (M8.1):
      // back when what drove them out is over as far as they know, and they think their house stands.
      groups[e.flee] = { areas: [e.flee], npcs: [], except: [] }
      const n = steps.length / 2
      steps.push({ id: `flee_${n}`, at: { hours: phase.after }, wait: 0, when: [], otherwise: 'skip', unguarded: false, do: { flee: e.flee, to: e.to, days: e.days } })
      steps.push({
        id: `return_${n}`,
        after: `flee_${n}`,
        wait: cause ? 0 : e.days * 24,
        each: e.flee,
        when: [...(cause ? [{ knows: { who: '$who', subject: cause.subject, key: cause.key, not: cause.value } }] : []), { thinks_home_stands: '$who' }],
        otherwise: 'wait',
        unguarded: false,
        do: { return: '$who' },
      })
      void i
      return []
    }),
  })).filter((p) => p.effects.length > 0)
  const parsed = PlanSchema.safeParse({ id, name: op.name, groups, phases, max_effects: 10, steps, ...(steps.length ? { expires: 60 } : {}) })
  if (!parsed.success) return undefined
  // Only places and things of this world.
  const ok =
    parsed.data.phases.every((p) => p.effects.every((e) => ('place' in e && 'state' in e ? world.content.locations.has(e.place) : 'area' in e ? world.content.areas.has(e.area) : 'market' in e ? world.content.items.has(e.market) : true))) &&
    parsed.data.steps.every((s) => !('flee' in s.do) || (world.content.locations.has(s.do.to) && world.content.areas.has(s.do.flee)))
  return ok ? parsed.data : undefined
}

function catalogue(world: World): string {
  const patterns = [...world.content.patterns.values()].map((p) => `${p.id} (${p.kind}, belang ${p.belang})`).join(', ')
  // Regions beyond the map are stubs (M8.4): what is said of them must fit what they send and ask.
  const trade = [...world.content.outlands.keys()].sort().map((id) => tradeLine(world, id)).filter(Boolean)
  return `Small story patterns the world plays by itself: ${patterns}. Deaths, needs and news come from the rules.${trade.length ? ` Trade from beyond the map (not worked out; keep to this): ${trade.join(' ')}` : ''}`
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
    // A question (M9.3), answered within its bounds.
    const q = lookupFromId(id)
    if (q) {
      const a = answerLookup(world, 'chronicler', q)
      cards.push({ id, kind: 'lore', name: 'refused' in a ? id : a.title, text: 'refused' in a ? `Refused: ${a.refused}.` : a.text })
      continue
    }
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
/** Climaxes a week at most: a third line waits. */
const MAX_CLIMAXES = 2

/** Lines that came to a crisis in the last seven days. */
function climaxes(world: World): number {
  return chronicleState(world).lines.filter((l) => l.crisisAt !== undefined && world.now - l.crisisAt < 7 * 24 * 60).length
}

/** Other lines that build up now, for the pace (M8.3). */
function building(world: World, run: ChronicleRun): { title: string; phase: 'rising' | 'crisis' }[] {
  return chronicleState(world)
    .lines.filter((l) => l.open && !run.lines.includes(l.id) && (l.phase === 'rising' || l.phase === 'crisis'))
    .map((l) => ({ title: l.title, phase: l.phase as 'rising' | 'crisis' }))
}

/** What an input offers: the facts of its storylines, and whom and what it lets be named. */
export function offeredBy(input: ChronicleInput): Offered {
  return {
    facts: [...new Set(input.lines.flatMap((l) => [...l.events, ...l.earlier].map((e) => e.id)))],
    allowed: [...new Set([...input.cards.map((c) => c.id), ...input.lore.map((c) => c.id), ...input.areas.map((a) => `area_${a.id}`)])],
  }
}

export function applyOutput(world: World, run: ChronicleRun, output: ChronicleOutput | null, by: LoreEntry['by'] = 'chronicler', offered?: Offered): string[] {
  const state = chronicleState(world)
  const problems: string[] = []
  const out = output ?? emptyOutput()
  const words = vocabulary(world)
  const lines = run.lines.map((id) => state.lines.find((l) => l.id === id)).filter((l): l is Storyline => Boolean(l))
  const input = buildInput(world, run)
  // What the model saw (M9.2): facts that came meanwhile wait for the next run, and only names it was shown pass.
  const shown = offered ?? offeredBy(input)
  const seen = new Set(shown.facts)
  // Everyone and everything in the overview may be named; nobody else.
  const allowed = new Set(shown.allowed)
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
    const facts = line.facts.map((id) => factById(world, id)).filter((f): f is Fact => Boolean(f) && seen.has(f!.id))
    const belang = Math.max(0, ...facts.map((f) => f.belang))
    if (belang < 3) {
      problems.push(`lore "${op.name}": the storyline is not big enough for lore (belang ${belang})`)
      continue
    }
    if (!fits(`lore "${op.name}"`, op.summary, op.details, op.story, op.far)) continue
    // Only what a fact carries (M9.2): its claims on events of the line, held against the world, and no checkable untruth in the words.
    const untrue = loreProblem(world, op, facts)
    if (untrue) {
      problems.push(`lore "${op.name}": ${untrue}`)
      continue
    }
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
    if (op.phase === 'crisis' && line.phase !== 'crisis' && climaxes(world) >= MAX_CLIMAXES) {
      // No three climaxes in one week (design: "Opbouw per verhaallijn"): this one builds a while longer.
      problems.push(`line ${line.id}: two others came to a crisis this week, it stays rising`)
      line.phase = 'rising'
    } else if (op.phase) {
      if (op.phase === 'crisis' && line.phase !== 'crisis') line.crisisAt = world.now
      line.phase = op.phase
    }
    if (op.close) {
      line.open = false
      line.phase = 'closed'
    }
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
  // Plans (M7.2, M8.3): consequences of a big event, a plan for a signal, or one beat of a storyline.
  const planned = new Set<string>()
  for (const op of out.plans ?? []) {
    if (op.signal) {
      if (!(run.signals ?? []).includes(op.signal)) {
        problems.push(`plan "${op.name}": not a signal of this run`)
        continue
      }
      if (startChroniclePlan(world, op, state.runs + 1, problems)) planned.add(op.signal)
      else problems.push(`plan "${op.name}": no valid step, custom decides`)
      continue
    }
    if (!op.line || !input.mayPlan?.includes(op.line)) {
      // One beat for a storyline of the run, and never a second while one still waits (design: "Opbouw per verhaallijn").
      if (op.line && run.lines.includes(op.line) && (op.steps?.length ?? 0) === 1 && !op.phases.length) {
        const waiting = (world.state.plans ?? []).some((p) => p.source === 'chronicler' && p.line === op.line && p.topic === 'beat' && p.ended === undefined)
        if (waiting) problems.push(`beat "${op.name}": the line has a beat still to come`)
        else if (!startChroniclePlan(world, op, state.runs + 1, problems)) problems.push(`beat "${op.name}": not a valid step`)
        continue
      }
      problems.push(`plan "${op.name}": not offered`)
      continue
    }
    const id = `chronicle_${state.runs + 1}_${(world.state.dynamicPlans ? Object.keys(world.state.dynamicPlans).length : 0) + 1}`
    // What drove it, for the returns: the newest claim among the big news of the line.
    const cause = state.lines.find((l) => l.id === op.line)?.facts.map((f) => factById(world, f)).filter((f): f is Fact => Boolean(f?.claim && f.belang >= 4)).at(-1)?.claim
    const plan = toPlan(world, { ...op, line: op.line }, id, cause)
    if (!plan) {
      problems.push(`plan "${op.name}": does not fit this world`)
      continue
    }
    // Steps of his own beside the phases, checked like any.
    plan.steps.push(...(op.steps ?? []).flatMap((s, i) => stepsFromOp(world, s, i + 1, problems)))
    ;(world.state.dynamicPlans ??= {})[id] = plan
    ;(world.state.pendingPlans ??= []).push(id)
    // It comes from the big news of its storyline (M9.2).
    const from = state.lines.find((l) => l.id === op.line)?.facts.map((f) => factById(world, f)).filter((f): f is Fact => Boolean(f && f.belang >= 4)).at(-1)
    if (from) (world.state.pendingCauses ??= {})[id] = from.id
  }
  // Signals of this run without a valid plan: the standard aftermath does it (M8.3).
  unplanned(world, run.signals ?? [], planned)

  // What the chronicler left out, the templates fill in.
  for (const line of lines) {
    const facts = line.facts.map((id) => factById(world, id)).filter((f): f is Fact => Boolean(f) && seen.has(f!.id))
    const fresh = unreported(world, line).filter((f) => seen.has(f.id))
    const biggest = [...facts].sort((a, b) => b.belang - a.belang || b.t - a.t)[0]
    if (!written.has(line.id) && biggest && biggest.belang >= 3 && fresh.length) writeLore(world, line, facts, biggest.belang, templateLore(biggest), 'template')
    if (!noted.has(line.id)) line.summary = facts.slice(-3).map((f) => `${cap(f.title)} (${when(world, f.t)}).`)
    if (fresh.length && biggest) {
      const area = world.location(fresh.at(-1)!.place).area
      const old = state.news[area]
      if (!out.news.some((n) => n.area === area) && (!old || world.now - old.t > 12 * 60)) state.news[area] = { text: fresh.at(-1)!.text.village, t: world.now }
    }
    line.reported = [...new Set([...line.reported, ...line.facts.filter((id) => seen.has(id))])]
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
    facts: facts.map((f) => f.id),
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
export function applyRun(world: World, runId: string, output: ChronicleOutput | null, by: LoreEntry['by'] = output ? 'chronicler' : 'template', offered?: Offered): string[] {
  const state = chronicleState(world)
  const index = state.pending.findIndex((r) => r.id === runId)
  if (index < 0) return [`no waiting run ${runId}`]
  const [run] = state.pending.splice(index, 1)
  return applyOutput(world, run!, output, by, offered)
}

/** Runs the chronicler model on the first waiting run. The caller records and applies the result, with what was offered. */
export async function writeRun(world: World, run: ChronicleRun, model: ChroniclerModel): Promise<{ output: ChronicleOutput; problems: string[]; offered: Offered }> {
  const input = buildInput(world, run)
  const offered = offeredBy(input)
  const result = await chronicle(input, model, (ids) => {
    const cards = lookupCards(world, ids)
    // What he looked up, he saw.
    offered.allowed.push(...cards.map((c) => c.id).filter((id) => !offered.allowed.includes(id)))
    return cards
  })
  // Big lore gets a second look (M9.2): a small model names what no fact says; then the template tells it.
  const problems = [...result.problems]
  for (const op of [...result.output.lore]) {
    const line = input.lines.find((l) => l.id === op.line)
    const events = line ? [...line.events, ...line.earlier] : []
    if (Math.max(0, ...events.map((e) => e.belang)) < 4) continue
    let found: string[] | undefined
    try {
      found = judged((await model.complete(judgeRequest(op, events) as unknown as ChroniclerRequest)).text)
    } catch {
      found = undefined
    }
    if (found && !found.length) continue
    result.output.lore = result.output.lore.filter((l) => l !== op)
    problems.push(`lore "${op.name}": ${found ? `the second look found what no fact says (${found.join('; ')})` : 'the second look could not be read'}`)
  }
  return { output: result.output, problems, offered }
}
