import type { Card, ChronicleInput, PlanOp, SignalCard, StepOp, StepVerb } from '../chronicler'
import { callName } from './content'
import { signalBindings, signalOf, backToRules } from './npc/intentions'
import { mediators } from './aftermath'
import { GOAL_CATALOGUE } from './npc/goals'
import { PLACE_STATES } from './quests/schema'
import { StepSchema, type Plan, type Step } from './quests/planschema'
import { permitted } from './quests/verbs'
import { questsOf } from './life'
import type { Signal } from './state'
import { chronicleState, requestRun } from './storylines'
import type { World } from './world'

// The chronicler plans (M8.3; design: signalen en nasleep, "Brein of
// kroniekschrijver"). What touches many households, matters a lot, touches a
// quest, or what brains could not settle (twice no valid choice, or two
// plans that cross) goes to the chronicler: at night, or at once for belang
// 4 and 5. He writes steps with the verbs he may use (quests/verbs.ts), for a
// group person by person, and at most one beat for any storyline that is
// rising. Every step is checked again here; what does not pass is dropped,
// and a signal without a valid plan goes to the standard aftermath.

/** The verbs of the chronicler, as the chronicler module shows them to the model (built when asked: the catalogue loads later). */
export function chroniclerVerbs(): StepVerb[] {
  return [
  { name: 'return', text: 'someone who fled or stays away goes home now', who: 'many' },
  { name: 'settle', text: 'someone stays for good at the target place: it becomes their home', who: 'many', target: ['place'] },
  { name: 'goal', text: 'someone goes after a goal for a day; target a person or place when the goal needs one', who: 'one', detail: `one of ${Object.keys(GOAL_CATALOGUE).join(', ')}` },
  { name: 'thought', text: 'something stays on their mind for a week', who: 'many', detail: 'the thought, addressed to them' },
  { name: 'move_home', text: 'someone lives at the target place from now on', who: 'one', target: ['place'] },
  { name: 'join_household', text: 'someone moves in with the target and becomes one household with them', who: 'one', target: ['person'] },
  { name: 'set_tie', text: 'what two people are to each other changes', who: 'two', detail: 'spouse, sweetheart, friend, rival, neighbour or acquaintance' },
  { name: 'end_tie', text: 'two people break', who: 'two' },
  { name: 'mediate', text: 'the target tries to make peace between two with a grudge', who: 'two', target: ['person'] },
  { name: 'request', text: 'someone asks the player to go and see the target', who: 'one', target: ['person'], detail: 'what they say when asking' },
  { name: 'feast', text: 'a feast at the target place, with these people as guests', who: 'many', target: ['place'] },
  { name: 'form_group', text: 'these people band together, for or against the newcomers at the target area', who: 'many', target: ['area'], detail: '"against: a name" or "for: a name"' },
  { name: 'regard', text: 'these people think better or worse of the target', who: 'many', target: ['person'], detail: 'a number from -10 to 10' },
  { name: 'place', text: 'the target place changes', who: 'none', target: ['place'], detail: PLACE_STATES.join(', ') },
  { name: 'arrive', text: 'newcomers come to live in a free house of the target area and take up a trade nobody works there', who: 'none', target: ['area'], detail: 'the trade, or a good it makes' },
  { name: 'build', text: 'a settlement begins a project, with materials from its store', who: 'none', detail: 'the project' },
  { name: 'area_news', text: 'the news of the day in the target area', who: 'none', target: ['area'], detail: 'the news, as people there say it' },
  { name: 'invite', text: 'someone finds the stranger and asks them along to the target place; no, and they go alone', who: 'one', target: ['place'], detail: 'what they say when asking' },
  { name: 'place_prop', text: "a new object (NEW OBJECTS) in its owner's home; one per storyline", who: 'one', detail: 'template: what it holds, "locked_chest: diary"' },
  ]
}

/**
 * Whether a signal goes to the chronicler: more than two households, belang
 * 3 or more, someone with a part in a quest, a brain that twice made no valid
 * choice, or two plans that cross. Only with a model; never back from the rules.
 */
export function escalates(world: World, signal: Signal): boolean {
  if (signal.rules || !world.aiLive) return false
  if (signal.scope === 'many' || signal.belang >= 3 || signal.kind === 'plans_cross') return true
  if (signal.who.some((id) => world.content.npcs.has(id) && questsOf(world, id).length > 0)) return true
  // On an open storyline with threads still open.
  if (signal.cause.some((f) => world.state.chronicle?.lines.some((l) => l.open && l.hooks.length > 0 && l.facts.includes(f)))) return true
  // No intention in the content fits anyone it is about (design, "Bijsturing na de review"): the chronicler, or custom.
  return world.content.intentions.size > 0 && ![...world.content.intentions.values()].some((i) => i.signal === signal.kind)
}

/** A signal waits for the chronicler: at once for big news, else in the night run. */
export function toChronicler(world: World, signal: Signal): void {
  const state = chronicleState(world)
  const waiting = (state.signals ??= [])
  if (!waiting.includes(signal.id)) waiting.push(signal.id)
  signal.handled = 'chronicler'
  if (signal.belang >= 4) requestRun(world, 'urgent', [], waiting.splice(0))
}

/** The signals of a run as the chronicler sees them, with the people and places they bring. */
export function signalCards(world: World, ids: string[]): { signals: SignalCard[]; people: string[]; places: string[] } {
  const signals: SignalCard[] = []
  const people = new Set<string>()
  const places = new Set<string>()
  for (const id of ids) {
    const s = signalOf(world, id)
    if (!s) continue
    const group = groupOf(world, s)
    for (const p of [...s.who, ...group]) if (world.content.npcs.has(p)) people.add(p)
    if (world.content.locations.has(s.place)) places.add(s.place)
    for (const p of group) {
      const where = world.state.npcs[p]?.stayAt?.where ?? world.state.npcs[p]?.note?.where
      if (where && world.content.locations.has(where)) places.add(where)
      places.add(world.npc(p).home)
    }
    const aftermath = [...world.content.aftermath.values()].filter((a) => a.signal === s.kind && (!a.event || a.event === s.event))
    const pair = s.who.filter((p) => world.content.npcs.has(p))
    const trusted = s.scope === 'pair' && pair.length === 2 ? mediators(world, pair[0]!, pair[1]!, 3) : []
    for (const p of trusted) people.add(p)
    signals.push({
      id: s.id,
      text: `${s.kind.replace(/_/g, ' ')}${s.event ? ` (${s.event})` : ''}${s.claim ? `: ${s.claim.key} of ${s.claim.subject} is ${s.claim.value}` : ''}`,
      who: s.who.filter((p) => world.content.npcs.has(p)),
      place: s.place,
      standard: aftermath.length ? aftermath.flatMap((a) => a.steps.map((st) => st.id.replace(/_/g, ' '))).join(', ') : 'nothing happens',
      ...(group.length ? { group } : {}),
      ...(trusted.length ? { trusted } : {}),
    })
  }
  return { signals, people: [...people].sort(), places: [...places].sort() }
}

/**
 * The people a signal is about who may each go their own way: those staying
 * away from home whose way back waits on the claim of the signal (peace,
 * a place restored), or who stay in its place from elsewhere.
 */
export function groupOf(world: World, s: Signal): string[] {
  const away = Object.keys(world.state.npcs)
    .sort()
    .filter((id) => {
      const n = world.state.npcs[id]!
      return !n.dead && world.content.npcs.has(id) && Boolean(n.stayAt || (n.note && n.note.home))
    })
  if (!s.claim) {
    const area = world.content.locations.get(s.place)?.area
    return away.filter((id) => {
      const where = world.state.npcs[id]!.stayAt?.where ?? world.state.npcs[id]!.note?.where
      return where && world.content.locations.get(where)?.area === area && world.location(world.npc(id).home).area !== area
    })
  }
  return away.filter((id) => (world.state.plans ?? []).some((p) => p.ended === undefined && Object.values(p.groups).flat().includes(id)))
}

/** Another card for a person or place the run did not bring yet. */
export function extraCards(world: World, input: ChronicleInput, people: string[], places: string[], person: (id: string) => Card, place: (id: string) => Card): void {
  const have = new Set(input.cards.map((c) => c.id))
  for (const id of people) if (!have.has(id)) input.cards.push(person(id))
  for (const id of places) if (!have.has(id) && world.content.locations.has(id)) input.cards.push(place(id))
  const areas = new Set(input.areas.map((a) => a.id))
  for (const id of places) {
    const area = world.content.locations.get(id)?.area
    if (area && !areas.has(area)) {
      areas.add(area)
      input.areas.push({ id: area, kind: 'area', name: world.content.areas.get(area)?.name ?? area, text: world.content.areas.get(area)?.summary ?? '' })
    }
  }
}

/** A step of the chronicler's, as steps of a plan: checked like content, and only verbs he may use. */
export function stepsFromOp(world: World, op: StepOp, n: number, problems: string[]): Step[] {
  const people = op.who
  const at = { hours: op.after }
  const make = (i: number, verb: Record<string, unknown>): Step | undefined => {
    const parsed = StepSchema.safeParse({ id: `c${n}_${i}`, at, do: verb })
    if (!parsed.success) {
      problems.push(`step ${op.verb}: does not make a valid step`)
      return undefined
    }
    if (!permitted(parsed.data.do, 'chronicler')) {
      problems.push(`step ${op.verb}: not a verb the chronicler may use`)
      return undefined
    }
    return parsed.data
  }
  const each = (verb: (who: string) => Record<string, unknown>) => people.map((who, i) => make(i, verb(who))).filter((s): s is Step => Boolean(s))
  const place = (id: string | undefined) => (id && world.content.locations.has(id) ? id : undefined)
  const person = (id: string | undefined) => (id && world.content.npcs.has(id) ? id : undefined)
  switch (op.verb) {
    case 'return':
      return each((who) => ({ return: who }))
    case 'settle':
      return place(op.target) ? each((who) => ({ settle: who, at: op.target })) : (problems.push('settle: needs a place'), [])
    case 'goal': {
      const entry = GOAL_CATALOGUE[op.detail ?? '']
      if (!entry) return (problems.push(`goal: ${op.detail} is not a goal`), [])
      if (entry.target !== 'none' && !op.target) return (problems.push(`goal ${op.detail}: needs a target`), [])
      return each((who) => ({ goal: op.detail, who, ...(op.target && entry.target !== 'none' ? { target: op.target } : {}) }))
    }
    case 'thought':
      return each((who) => ({ thought: who, text: op.detail ?? '', days: 7 }))
    case 'move_home':
      return place(op.target) ? each((who) => ({ move_home: who, to: op.target })) : (problems.push('move_home: needs a place'), [])
    case 'join_household':
      return person(op.target) ? each((who) => ({ join_household: who, of: op.target })) : (problems.push('join_household: needs a person'), [])
    case 'set_tie':
      return [make(0, { set_tie: [people[0], people[1]], role: op.detail?.trim().toLowerCase() })].filter((s): s is Step => Boolean(s))
    case 'end_tie':
      return [make(0, { end_tie: [people[0], people[1]] })].filter((s): s is Step => Boolean(s))
    case 'mediate':
      return person(op.target) ? [make(0, { mediate: [people[0], people[1]], by: op.target })].filter((s): s is Step => Boolean(s)) : (problems.push('mediate: needs a mediator'), [])
    case 'request':
      return person(op.target) ? [make(0, { request: people[0], kind: 'visit', target: op.target, name: `A visit to ${callName(world.npc(op.target!))}`, ask: op.detail ?? '' })].filter((s): s is Step => Boolean(s)) : (problems.push('request: needs a person'), [])
    case 'feast':
      return place(op.target) ? [make(0, { feast: op.target, hours: 4, guests: people })].filter((s): s is Step => Boolean(s)) : (problems.push('feast: needs a place'), [])
    case 'form_group': {
      const [aim, ...name] = (op.detail ?? '').split(':')
      const a = aim?.trim().toLowerCase()
      if ((a !== 'against' && a !== 'for') || !op.target || !world.content.areas.has(op.target)) return (problems.push('form_group: needs "against: name" or "for: name" and an area'), [])
      return [make(0, { form_group: people, aim: a, about: op.target, name: name.join(':').trim() || (a === 'against' ? 'those against the newcomers' : 'those who help the newcomers') })].filter((s): s is Step => Boolean(s))
    }
    case 'regard': {
      const n = Math.max(-10, Math.min(10, Math.round(Number(op.detail))))
      return person(op.target) && Number.isFinite(n) ? [make(0, { regard: people, to: op.target, affinity: n })].filter((s): s is Step => Boolean(s)) : (problems.push('regard: needs a person and a number'), [])
    }
    case 'place':
      return place(op.target) ? [make(0, { place: op.target, state: op.detail?.trim().toLowerCase() })].filter((s): s is Step => Boolean(s)) : (problems.push('place: needs a place'), [])
    case 'area_news':
      return op.target && world.content.areas.has(op.target) ? [make(0, { news: op.detail ?? '', area: op.target })].filter((s): s is Step => Boolean(s)) : (problems.push('area_news: needs an area'), [])
    case 'arrive': {
      // The trade by its workshop, its name, or a good it makes (M8.5).
      const words = (op.detail ?? '').trim().toLowerCase()
      const workshop = [...world.content.settlements.values()].flatMap((s) => s.workshops).find((w) => w.id === words || w.name.toLowerCase() === words || words in w.makes)
      if (!op.target || !world.content.settlements.has(op.target) || !workshop) return (problems.push('arrive: needs a settlement and a trade'), [])
      return [make(0, { arrive: workshop.id, to: op.target })].filter((s): s is Step => Boolean(s))
    }
    case 'invite':
      return place(op.target) && person(people[0]) ? [make(0, { invite: people[0], to: op.target, ...(op.detail ? { line: op.detail } : {}) })].filter((s): s is Step => Boolean(s)) : (problems.push('invite: needs someone and a place'), [])
    case 'place_prop': {
      const [template, items] = (op.detail ?? '').split(':').map((x) => x.trim())
      if (!template || !world.content.props.has(template) || !person(people[0])) return (problems.push('place_prop: needs a template and an owner'), [])
      const list = (items ?? '').split(/,\s*/).map((x) => x.trim()).filter((x) => world.content.items.has(x))
      return [make(0, { place_prop: template, owner: people[0], ...(list.length ? { items: list } : {}) })].filter((s): s is Step => Boolean(s))
    }
    case 'build': {
      const words = (op.detail ?? '').trim().toLowerCase()
      const project = [...world.content.projects.values()].find((p) => p.id === words || p.name.toLowerCase() === words)
      return project ? [make(0, { build: project.id })].filter((s): s is Step => Boolean(s)) : (problems.push(`build: ${op.detail} is not a project`), [])
    }
    default:
      problems.push(`step ${op.verb}: not a verb the chronicler may use`)
      return []
  }
}

/** A plan of the chronicler's for a signal, or one beat of a storyline: started as a plan of source chronicler. */
export function startChroniclePlan(world: World, op: PlanOp, runNo: number, problems: string[]): boolean {
  const steps = (op.steps ?? []).flatMap((s, i) => stepsFromOp(world, s, i + 1, problems))
  if (!steps.length) return false
  const id = `chronicle_${runNo}_${(world.state.planSeq = (world.state.planSeq ?? 0) + 1)}`
  const plan: Plan = { id, name: op.name, groups: {}, phases: [], max_effects: 30, steps, expires: 30, topic: op.signal ? 'story' : 'beat' }
  ;(world.state.dynamicPlans ??= {})[id] = plan
  const signal = op.signal ? signalOf(world, op.signal) : undefined
  const bind = signal ? signalBindings(world, signal) : {}
  ;(world.state.plans ??= []).push({ plan: id, id, started: world.now, phase: 0, cause: 'chronicle', groups: {}, source: 'chronicler', topic: plan.topic, subjects: signal?.who ?? [], ...(signal ? { signal: signal.id } : {}), ...(op.line ? { line: op.line } : {}), steps: {}, expires: world.now + 30 * 24 * 60, bind })
  if (signal) {
    signal.handled = 'chronicler'
    // Two brains' plans that crossed are one story now: theirs end here, or, if their steps already ran, count as part of it.
    if (signal.kind === 'plans_cross') for (const p of world.state.plans ?? []) if (signal.cause.includes(p.id ?? '') && (p.ended === undefined || p.outcome === 'done')) Object.assign(p, { ended: p.ended ?? world.now, outcome: 'merged' })
  }
  return true
}

/** After a run: signals it did not plan for go to the standard aftermath. */
export function unplanned(world: World, signals: string[], planned: Set<string>): void {
  for (const id of signals) if (!planned.has(id)) backToRules(world, id, true)
}
