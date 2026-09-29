import { knob } from '../knobs'
import { GameClock, startOfDay } from '../clock'
import { callName } from '../content'
import { cachedSystem, type LlmRequest } from '../dialogue/llm'
import { describePersonality, peopleIds, relevantPeople, worldFrame } from '../dialogue/prompt'
import { worldText } from '../safety'
import { goalJsonSchema, GoalReplySchema } from '../dialogue/schema'
import { itemName } from '../items'
import { questsOf } from '../life'
import { factById, versionOf } from '../news'
import { isNear, peopleLine, tieTo } from '../people'
import { landOfNpc, standingLine } from '../standing'
import { openRequestsOf } from '../requests'
import type { Fact, Goal, GoalType } from '../state'
import type { World } from '../world'
import { allowAct, type ActKind } from './acts'
import { kmBetween, tierOf } from '../lod'
import { applyIntention, backToRules, intentionLines, offered, signalOf, withIntention } from './intentions'

// The AI's choice of goals (FO, chapter 7): the model says what an NPC wants,
// the planner and the simulation work out how. The model may only choose from
// a catalogue, with ids from the NPC's own knowledge; the validator throws out
// the rest, and when nothing is left the utility function carries on. The
// world never waits: the NPC follows its schedule until the choice arrives.

export interface GoalChoice {
  id: string
  npc: string
  t: number
  trigger: string
  /** A signal about this NPC or their household: the brain may answer with an intention (M8.2). */
  signal?: string
}

interface Entry {
  type: GoalType
  /** item: a thing to get; mine: a thing the NPC has; object: something of theirs to mend; thing: something anywhere. */
  target: 'item' | 'mine' | 'place' | 'person' | 'object' | 'thing' | 'none'
  text: string
  /** The gate that may refuse it (npc/acts.ts). */
  gate?: ActKind | 'flee'
}

/** What the motor can carry out (FO, chapter 7, "De doelcatalogus"), with the gates from the FO. */
export const GOAL_CATALOGUE: Record<string, Entry> = {
  Work: { type: 'Work', target: 'none', text: 'carry on with your work as usual' },
  Obtain: { type: 'Obtain', target: 'item', text: 'get hold of a thing: buy it where you know it is sold' },
  Produce: { type: 'Produce', target: 'item', text: 'make what your trade makes' },
  Repair: { type: 'Repair', target: 'object', text: 'mend something broken that you look after' },
  Visit: { type: 'Visit', target: 'place', text: 'go to a place and spend some time there' },
  Talk: { type: 'Talk', target: 'person', text: 'go and find someone to talk to them' },
  Socialize: { type: 'Socialize', target: 'place', text: 'seek company at a place where people gather' },
  Pray: { type: 'Pray', target: 'none', text: 'pray at the chapel' },
  Rest: { type: 'Rest', target: 'none', text: 'stay home and rest' },
  Ask_help: { type: 'AskHelp', target: 'item', text: 'ask around for a thing you need and cannot get: someone may bring it' },
  // The rest of the catalogue (M7.2).
  Buy: { type: 'Obtain', target: 'item', text: 'buy a thing where you know it is sold' },
  Sell: { type: 'Sell', target: 'mine', text: 'sell something you have where they buy it' },
  Deliver: { type: 'Deliver', target: 'person', text: 'bring someone the thing they asked for, if you have it' },
  Meet: { type: 'Meet', target: 'person', text: "spend an hour in someone's company" },
  Follow: { type: 'Follow', target: 'person', text: 'keep an eye on someone: go where they are and watch them a while' },
  Guard: { type: 'Guard', target: 'place', text: 'keep watch at a place for some hours' },
  Avoid: { type: 'Avoid', target: 'place', text: 'keep away from a place for a day' },
  Help: { type: 'Help', target: 'person', text: 'go and give someone a hand with their work' },
  Spread: { type: 'Spread', target: 'none', text: 'go where people gather and pass on what you have heard' },
  Court: { type: 'Court', target: 'person', text: 'spend time with someone you are sweet on', gate: 'court' },
  Celebrate: { type: 'Celebrate', target: 'none', text: 'celebrate with a drink where people gather' },
  Investigate: { type: 'Investigate', target: 'place', text: 'go and look round a place yourself, to find out what happened there', gate: 'investigate' },
  Report: { type: 'Report', target: 'none', text: 'tell the law what you saw', gate: 'report' },
  Confront: { type: 'Confront', target: 'person', text: 'have it out with someone who wronged you' },
  Recruit_help: { type: 'RecruitHelp', target: 'person', text: 'ask someone to come and help you' },
  Steal: { type: 'Steal', target: 'item', text: 'take a thing from a shop when nobody is looking (only if you are that sort)', gate: 'steal' },
  Sabotage: { type: 'Sabotage', target: 'thing', text: "damage something of someone else's (only if you are that sort)", gate: 'sabotage' },
  Harm: { type: 'Harm', target: 'person', text: 'hurt someone you hate (almost never)', gate: 'harm' },
  Flee: { type: 'Flee', target: 'place', text: 'get away to a place and stay there a while' },
}

const DAY = 24 * 60

function brain(world: World) {
  return (world.state.brain ??= { seq: 0, pending: [], counts: {} })
}

/**
 * Whether a person asks the model for a choice (M10.27: the goal choices drove
 * the bill, 45 to 80 an hour where the guide counted 25, from everyone within
 * eight km): near the player (the knob people.model_km), in the player's area,
 * in an open storyline, or named in a running plan. A plan of the content
 * that holds whole areas as its groups does not count, or everyone would.
 */
export function asksModel(world: World, npcId: string): boolean {
  const here = world.npcState(npcId).location
  const player = world.state.player.location
  const km = kmBetween(world, here, player)
  if (km !== undefined && km <= knob(world, 'people.model_km')) return true
  const area = world.content.locations.get(here)?.area
  if (area && area === world.content.locations.get(player)?.area) return true
  if (world.state.chronicle?.lines.some((l) => l.open && (l.people.includes(npcId) || l.roles.some((r) => r.who === npcId)))) return true
  return (world.state.plans ?? []).some((p) => p.ended === undefined && (p.subjects?.includes(npcId) || Object.values(p.bind ?? {}).includes(npcId)))
}

/**
 * A decision moment: goes to the AI when a model is connected and the day's
 * budget allows. A finished goal only asks again after a rest of five hours,
 * so an NPC thinks two to four times a day (FO, chapter 7); news that concerns
 * it and the morning always count.
 */
export function triggerChoice(world: World, npcId: string, trigger: string, kind: 'morning' | 'news' | 'goal' | 'signal' = 'news', signal?: string): boolean {
  if (!world.aiLive || !world.alive(npcId) || world.npc(npcId).child) return false
  // Far from the player the rules decide: no model for someone coarse or a note (M8.2, after the review).
  if (tierOf(world, npcId) !== 'full') return false
  // Near enough to matter, or in a story (M10.27); the others choose by the rules as a person far off always did.
  if (!asksModel(world, npcId)) return false
  const state = brain(world)
  if (kind === 'signal') {
    // A signal is its own reason to think, within the day's maximum for signals.
    const today = startOfDay(world.now)
    const used = state.signals?.day === today ? state.signals.n : 0
    // Two things at once may happen to someone (a shortage and a quarrel, M8.4): at most two signals waiting per person.
    if (used >= knob(world, 'signals.per_day') || state.pending.filter((p) => p.npc === npcId && p.signal).length >= 2 || state.pending.some((p) => p.signal === signal && p.npc === npcId)) return false
    state.signals = { day: today, n: used + 1 }
    state.pending.push({ id: `choice_${++state.seq}`, npc: npcId, t: world.now, trigger, signal })
    return true
  }
  if (state.pending.some((p) => p.npc === npcId)) return false
  const last = state.last?.[npcId]
  if (kind === 'goal' && last !== undefined && world.now - last < (knob(world, 'people.goal_rest_hours') * 60)) {
    // Not yet: the NPC thinks again once the rest is over.
    ;(state.due ??= {})[npcId] = last + (knob(world, 'people.goal_rest_hours') * 60)
    return false
  }
  if (state.due) delete state.due[npcId]
  const today = startOfDay(world.now)
  const count = state.counts[npcId]
  const used = count && count.day === today ? count.n : 0
  if (used >= knob(world, 'people.goals_per_day')) return false
  state.counts[npcId] = { day: today, n: used + 1 }
  ;(state.last ??= {})[npcId] = world.now
  state.pending.push({ id: `choice_${++state.seq}`, npc: npcId, t: world.now, trigger })
  return true
}

/** Big enough news about the NPC, or about someone near to them, makes them think again. */
export function concerns(world: World, npcId: string, fact: Fact): boolean {
  if (fact.belang < 2) return false
  return fact.about.some((id) => id === npcId || isNear(tieTo(world, npcId, id)))
}

/** At the first moment of the day the NPC is up: plan the day. Later: a choice put off after a finished goal. */
export function morning(world: World, npcId: string): void {
  const npc = world.npcState(npcId)
  if (npc.activity === 'asleep') return
  const today = startOfDay(world.now)
  if (npc.plannedDay !== today) {
    npc.plannedDay = today
    // No call without something new to choose about (M8.2, after the review): otherwise the schedule does it.
    if (somethingNew(world, npcId)) triggerChoice(world, npcId, 'You have just got up. What do you want to do today?', 'morning')
    return
  }
  const due = world.state.brain?.due?.[npcId]
  if (due !== undefined && world.now >= due) triggerChoice(world, npcId, 'Some hours have passed since you last decided. What next?', 'goal')
}

/**
 * Something to choose about in the morning: news since yesterday, a thought,
 * a request of theirs still open, an intention running, or a need that is low.
 */
export function somethingNew(world: World, npcId: string): boolean {
  const npc = world.npcState(npcId)
  const heard = world.state.news?.heard[npcId] ?? {}
  if (Object.values(heard).some((h) => world.now - h.t < DAY)) return true
  if ((npc.thoughts ?? []).some((t) => t.until > world.now)) return true
  if (openRequestsOf(world, npcId).length) return true
  if ((world.state.plans ?? []).some((p) => p.source === 'brain' && p.ended === undefined && (p.subjects ?? []).includes(npcId))) return true
  return Object.entries(npc.needs).some(([need, value]) => need !== 'work' && need !== 'faith' && value < 30)
}

// ---------------------------------------------------------------- the request

interface Allowed {
  places: string[]
  people: string[]
  items: string[]
  objects: string[]
  /** Things the NPC has, and objects of other people in places they know. */
  mine: string[]
  things: string[]
}

/** The ids an NPC may choose from: places, people and things they know (also for intentions). */
export function allowedIds(world: World, npcId: string): Allowed {
  return allowed(world, npcId)
}

/**
 * What an NPC may choose among. Checking a reply takes everything they know;
 * the prompt, with a focus, only what belongs to the choice (M9.3): their own
 * places, where they are, the places in focus and the open places of their
 * area (at most twenty), and the people who matter (at most sixteen).
 */
function allowed(world: World, npcId: string, focus?: { people: string[]; places: string[] }): Allowed {
  const npc = world.npc(npcId)
  const state = world.npcState(npcId)
  const known = world.knownLocations(npcId)
  const area = world.location(npc.home).area
  const open = [...known].filter((id) => world.location(id).area === area && !world.location(id).tags.includes('private')).sort()
  const places = focus
    ? [...new Set([npc.home, ...(npc.work ? [npc.work] : []), state.location, ...focus.places, ...open].filter((id) => world.content.locations.has(id) && known.has(id)))].slice(0, 20).sort()
    : [...known].filter((id) => !world.location(id).tags.includes('private') || id === npc.home || id === npc.work).sort()
  const people = (focus ? relevantPeople(world, npcId, focus.people, 16) : peopleIds(world, npcId)).filter((id) => world.alive(id))
  const items = new Set<string>(Object.keys(state.inventory))
  for (const id of places) for (const service of world.location(id).services) for (const item of Object.keys(service.sells)) items.add(item)
  for (const request of openRequestsOf(world, npcId)) if (request.item) items.add(request.item)
  const objects: string[] = []
  for (const id of [npc.home, npc.work].filter((x): x is string => Boolean(x))) {
    for (const object of world.location(id).objects) if (world.objectState(id, object.id)['broken'] === true) objects.push(`${id}/${object.id}`)
  }
  const mine = Object.keys(state.inventory).filter((i) => (state.inventory[i] ?? 0) > 0).sort()
  const things = places.filter((id) => id !== npc.home && id !== npc.work).flatMap((id) => world.location(id).objects.filter((o) => world.objectState(id, o.id)['broken'] !== true).map((o) => `${id}/${o.id}`))
  return { places, people, items: [...items].sort(), objects, mine, things }
}

const SYSTEM = [
  'You choose what one character in a text role-playing game wants to do next.',
  'The game carries it out: you only choose goals from the list, with the keys you are given (l1 is a place, p1 a person).',
  'Choose 1 to 3 goals that fit the character, the time and what just happened. Priority is 0 to 1.',
  'Choose Work when nothing special is going on. Never choose anything the character would not do.',
  'Reply with JSON that matches the schema, and nothing else.',
].join('\n')

/**
 * The whole catalogue, the same for everyone (M10.26): in the part that is
 * cached for every choice in a land, so that part reaches what the brain's
 * model caches; which of them are open to one person now goes after the mark.
 */
function catalogueLines(): string[] {
  return Object.entries(GOAL_CATALOGUE).map(([type, e]) => `  ${type} (${e.target === 'none' ? 'target none' : `target: ${e.target === 'place' ? 'a place key' : e.target === 'person' ? 'a person key' : e.target}`}): ${e.text}`)
}

/** The goal schema every person shares (M10.28): the whole catalogue and a plain key, checked by validateGoals. */
const GOAL_SCHEMA = goalJsonSchema(Object.keys(GOAL_CATALOGUE))

/** The goals of the catalogue this NPC could choose at all: those whose gate is shut are not offered (M8.2). */
function openGoals(world: World, npcId: string, people: string[]): string[] {
  return Object.entries(GOAL_CATALOGUE)
    .filter(([, e]) => {
      if (!e.gate) return true
      if (e.gate === 'court' || e.gate === 'harm') return people.some((p) => !allowAct(world, npcId, e.gate as ActKind, p))
      return !allowAct(world, npcId, e.gate, undefined)
    })
    .map(([type]) => type)
}

/**
 * The brain's request (FO, chapter 7; M8.2 after the review): the character,
 * the rules and the goals open to them in the cached part; in the changing
 * part only what is new, with short keys for places and people (l1, p1).
 */
export function goalRequest(world: World, choice: GoalChoice, answers?: string[]): LlmRequest {
  const npcId = choice.npc
  const npc = world.npc(npcId)
  const state = world.npcState(npcId)
  // The people and places of what this choice is about (M9.3): the signal, and the news they just heard.
  const about = choice.signal ? signalOf(world, choice.signal) : undefined
  const recent = Object.entries(world.state.news?.heard[npcId] ?? {}).filter(([, h]) => world.now - h.t < 2 * DAY).map(([id]) => factById(world, id)).filter((f) => f !== undefined)
  const ids = allowed(world, npcId, { people: [...(about?.who ?? []), ...recent.flatMap((f) => f!.about)], places: [...(about ? [about.place] : []), ...recent.map((f) => f!.place)] })
  const profession = world.content.professions.get(npc.profession)?.name ?? npc.profession
  const keys: Record<string, string> = {}
  const keyOf = new Map<string, string>()
  const key = (id: string, prefix: string) => {
    if (!keyOf.has(id)) {
      const k = `${prefix}${[...keyOf.values()].filter((v) => v.startsWith(prefix)).length + 1}`
      keyOf.set(id, k)
      keys[k] = id
    }
    return keyOf.get(id)!
  }
  ids.places.forEach((id) => key(id, 'l'))
  ids.people.forEach((id) => key(id, 'p'))
  const name = (id: string) => (world.content.npcs.has(id) ? callName(world.npc(id)) : (world.content.locations.get(id)?.name ?? itemName(world.content, id)))
  const heard = world.state.news?.heard[npcId] ?? {}
  const news = (world.state.news?.facts ?? [])
    .filter((f) => heard[f.id] && heard[f.id]!.stance !== 'rejects' && world.now - f.t < 2 * DAY)
    .sort((a, b) => b.belang - a.belang || b.t - a.t)
    .slice(0, 3)
    .map((f) => `  ${versionOf(f, heard[f.id]!)}`)
  const goals = openGoals(world, npcId, ids.people)
  const card = [
    `CHARACTER: ${npc.name}, ${npc.age}, ${profession}. ${describePersonality(npc)}. Cares about: ${Object.entries(npc.values)
      .filter(([, v]) => v >= 2)
      .map(([k]) => k)
      .join(', ') || 'getting by'}.`,
    peopleLine(world, npcId) ?? '',
    standingLine(world, npcId) ?? '',
  ].filter(Boolean)
  // What they may choose now changes with who is about (M10.26: after the cache mark); the schema holds them to it.
  const choosable = [`GOALS YOU MAY CHOOSE NOW: ${goals.join(', ')}.`]
  const signal = choice.signal ? signalOf(world, choice.signal) : undefined
  const intentions = signal ? offered(world, signal, npcId) : []
  const lines = [
    `NOW: ${new GameClock(world.now).format(world.calendar)}, at ${world.location(state.location).name}. Doing: ${state.activity}.`,
    `NEEDS (0 bad, 100 good): ${Object.entries(state.needs)
      .map(([k, v]) => `${k} ${Math.round(v)}`)
      .join(', ')}. Money: ${world.money(state.money)}.`,
    ...(state.goals.length ? [`GOALS NOW: ${state.goals.map((g) => `${g.type}${g.item ? ` ${g.item}` : ''}${g.target ? ` ${name(g.target)}` : ''}`).join(', ')}`] : []),
    ...(news.length ? ['NEWS YOU HEARD:', ...news] : []),
    ...(state.thoughts ?? []).filter((t) => t.until > world.now).map((t) => `ON YOUR MIND: ${t.text}`),
    `WHY YOU CHOOSE NOW: ${choice.trigger}`,
    `PLACES YOU KNOW: ${ids.places.map((id) => `${keyOf.get(id)} ${name(id)}`).join(', ')}`,
    `PEOPLE YOU KNOW: ${ids.people.map((id) => `${keyOf.get(id)} ${name(id)}`).join(', ')}`,
    `THINGS: ${ids.items.join(', ')}`,
    ...(ids.objects.length ? [`BROKEN, YOURS TO MEND: ${ids.objects.join(', ')}`] : []),
    ...(ids.mine.length ? [`YOU HAVE: ${ids.mine.join(', ')}`] : []),
    ...(ids.things.length ? [`OTHER PEOPLE'S THINGS: ${ids.things.join(', ')}`] : []),
    ...(signal && intentions.length ? intentionLines(world, npcId, signal, (id) => key(id, 'h')) : []),
    // What they asked before choosing (M9.3), answered from their own head only.
    ...(answers?.length ? ['LOOKED UP:', ...answers.map((a) => `  ${a}`)] : []),
    ...(intentions.length && !answers ? ['If you need to know more before you choose, ask at most two questions in lookup and leave goals empty: "knows <your own key> <topic>", "bond <person key> <person key>" (your own bonds only), "near <place key>". Otherwise leave lookup empty.'] : []),
  ]
  // Goal choices of people with a part in a quest keep their place when the budget runs low (FO, chapter 16).
  const priority = questsOf(world, npcId).length ? 'normal' : 'low'
  // The same schema for everyone (M10.28), so the shared part reads back from the cache; the validator holds the rest.
  const base = GOAL_SCHEMA
  // Before a choice about a signal, one round of questions (M9.3).
  const asking = intentions.length > 0 && !answers
  const withLookup = (s: Record<string, unknown>) =>
    asking ? { ...s, properties: { ...(s['properties'] as Record<string, unknown>), lookup: { type: 'array', maxItems: 2, items: { type: 'string' } } }, required: [...((s['required'] as string[]) ?? []), 'lookup'] } : s
  keys['self'] = npcId
  return {
    role: 'brain',
    // The rules and the frame of the land they live in (M10.23), cached for everyone of that land; their card; and
    // what they may choose now (M10.26). Only the shared part is marked (M10.27): the same person rarely chooses twice
    // in five minutes, so a mark after the card would only pay a write. Kept an hour (M10.28): at the normal clock a
    // choice comes about every seven minutes, past the five of a plain mark; one write an hour and the rest read.
    cacheHour: true,
    ...cachedSystem([SYSTEM, '', 'THE GOALS:', ...catalogueLines(), '', worldText(worldFrame(world.content, landOfNpc(world, npcId)))].join('\n'), worldText(card.join('\n')), choosable.join('\n'), 'shared'),
    prompt: lines.join('\n'),
    schemaName: 'npc_goals',
    schema: withLookup(intentions.length ? (withIntention(base, intentions.map((i) => i.id), Object.keys(keys)) as typeof base) : base) as typeof base,
    maxTokens: intentions.length ? 500 : 400,
    priority,
    meta: { npc: npcId, keys, places: ids.places, people: ids.people, items: ids.items, intentions: intentions.map((i) => i.id), ...(asking ? { lookups: true } : {}) },
  }
}

/** The model answers with keys (l1, p1): back to ids before the answer is recorded and checked. */
export function fromKeys(reply: unknown, keys: Record<string, string> | undefined): unknown {
  if (!keys || !reply || typeof reply !== 'object') return reply
  const r = reply as { goals?: { target?: unknown }[]; intention?: { fill?: { key?: unknown }[] } }
  for (const g of r.goals ?? []) if (typeof g.target === 'string' && keys[g.target]) g.target = keys[g.target]
  for (const f of r.intention?.fill ?? []) if (typeof f.key === 'string' && keys[f.key]) f.key = keys[f.key]
  return reply
}

// ---------------------------------------------------------------- the validator

export interface GoalResult {
  accepted: Goal[]
  rejected: string[]
}

/**
 * Checks each goal (FO, chapter 7, "Wat de AI krijgt en teruggeeft"): in the
 * catalogue, ids from the NPC's knowledge, gates open, not active already,
 * priority between 0 and 1, never more than three AI goals at once.
 */
export function validateGoals(world: World, npcId: string, reply: unknown): GoalResult {
  const parsed = GoalReplySchema.safeParse(reply)
  if (!parsed.success) return { accepted: [], rejected: ['the reply does not match the goal schema'] }
  const ids = allowed(world, npcId)
  const state = world.npcState(npcId)
  const accepted: Goal[] = []
  const rejected: string[] = []
  for (const goal of parsed.data.goals) {
    const entry = GOAL_CATALOGUE[goal.type]
    if (!entry) {
      rejected.push(`${goal.type}: not a goal the game knows`)
      continue
    }
    const target = goal.target
    const known =
      entry.target === 'none' ||
      (entry.target === 'place' && ids.places.includes(target)) ||
      (entry.target === 'person' && ids.people.includes(target)) ||
      (entry.target === 'item' && ids.items.includes(target) && world.content.items.has(target)) ||
      (entry.target === 'mine' && ids.mine.includes(target)) ||
      (entry.target === 'object' && ids.objects.includes(target)) ||
      (entry.target === 'thing' && ids.things.includes(target))
    if (!known) {
      rejected.push(`${goal.type} ${target}: not something ${callName(world.npc(npcId))} knows`)
      continue
    }
    if (entry.type === 'Produce' && !producible(world, npcId, target)) {
      rejected.push(`Produce ${target}: not what this trade makes`)
      continue
    }
    const refused = entry.gate ? allowAct(world, npcId, entry.gate, target) : undefined
    if (refused) {
      rejected.push(`${goal.type} ${target}: ${refused}`)
      continue
    }
    if (entry.type === 'Deliver' && !deliverable(world, npcId, target)) {
      rejected.push(`Deliver ${target}: nothing they asked for`)
      continue
    }
    if (entry.type === 'AskHelp' && (state.inventory[target] ?? 0) > 0) {
      rejected.push(`Ask_help ${target}: already has it`)
      continue
    }
    if ([...state.goals, ...accepted].some((g) => g.source === 'ai' && g.type === entry.type && (g.item ?? g.target ?? g.object ?? 'none') === (entry.target === 'none' ? 'none' : target))) {
      rejected.push(`${goal.type} ${target}: already wanted`)
      continue
    }
    if (entry.type === 'Work') continue
    const made = toGoal(world, entry, target, goal.priority)
    if (entry.type === 'Deliver') made.item = deliverable(world, npcId, target)
    accepted.push(made)
  }
  const active = state.goals.filter((g) => g.source === 'ai').length
  return { accepted: accepted.slice(0, Math.max(0, knob(world, 'people.goals_at_once') - active)), rejected }
}

/** Something the NPC has that the other asked for. */
export function deliverable(world: World, npcId: string, target: string): string | undefined {
  const mine = world.npcState(npcId).inventory
  return world.state.requests.find((r) => r.npc === target && r.status === 'open' && r.item && (mine[r.item] ?? 0) > 0)?.item
}

function producible(world: World, npcId: string, item: string): boolean {
  const profession = world.content.professions.get(world.npc(npcId).profession)
  return (profession?.daily_goals ?? []).some((g) => g.type === 'Produce' && g.item === item)
}

function toGoal(world: World, entry: Entry, target: string, priority: number): Goal {
  const base: Goal = { id: `g${++world.state.goalSeq}`, type: entry.type, priority: Math.max(0, Math.min(1, priority)), source: 'ai', created: world.now, until: world.now + DAY }
  if (entry.target === 'item' || entry.target === 'mine') return { ...base, item: target, qty: 1 }
  if (entry.target === 'object') {
    const [location, object] = target.split('/')
    return { ...base, target: location, object }
  }
  if (entry.target === 'none') return base
  return { ...base, target }
}

/** Applies a finished choice. Without goals from the AI the utility function simply carries on. */
export function applyChoice(world: World, choiceId: string, reply: unknown | null): GoalResult {
  const state = brain(world)
  const index = state.pending.findIndex((p) => p.id === choiceId)
  if (index < 0) return { accepted: [], rejected: [`no waiting choice ${choiceId}`] }
  const [choice] = state.pending.splice(index, 1)
  if (reply === null || !world.alive(choice!.npc)) {
    // No answer to a signal: the standard aftermath does it (M8.2).
    if (choice!.signal) applyIntention(world, choice!.npc, choice!.signal, { choice: 'none' }, { people: [], places: [] })
    return { accepted: [], rejected: reply === null ? ['no reply: the utility function decides'] : [] }
  }
  const result = validateGoals(world, choice!.npc, reply)
  world.npcState(choice!.npc).goals.push(...result.accepted)
  if (choice!.signal) {
    // The intention it chose, with its open bindings filled; none, or a wrong one, and custom decides.
    const ids = allowed(world, choice!.npc)
    const problems = applyIntention(world, choice!.npc, choice!.signal, (reply as { intention?: unknown }).intention, { people: ids.people, places: ids.places })
    result.rejected.push(...problems)
    if (problems.length) (state.failed ??= {})[choice!.npc] = (state.failed[choice!.npc] ?? 0) + 1
    else delete state.failed?.[choice!.npc]
  }
  return result
}

/** Without a model, choices are not waited for; signals waiting for a brain go to the rules. */
export function settleChoices(world: World): void {
  if (world.aiLive || !world.state.brain?.pending.length) return
  const signals = world.state.brain.pending.map((p) => p.signal).filter((s): s is string => Boolean(s))
  world.state.brain.pending = []
  for (const s of signals) backToRules(world, s)
}
