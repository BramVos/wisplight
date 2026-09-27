import { GameClock, startOfDay } from '../clock'
import { callName } from '../content'
import type { LlmRequest } from '../dialogue/llm'
import { describePersonality, peopleIds, WORLD_FRAME } from '../dialogue/prompt'
import { goalJsonSchema, GoalReplySchema } from '../dialogue/schema'
import { itemName } from '../items'
import { questsOf } from '../life'
import { versionOf } from '../news'
import { isNear, peopleLine, tieTo } from '../people'
import { openRequestsOf } from '../requests'
import type { Fact, Goal, GoalType } from '../state'
import type { World } from '../world'

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
}

interface Entry {
  type: GoalType
  target: 'item' | 'place' | 'person' | 'object' | 'none'
  text: string
}

/** What the motor can carry out today. Darker goals (steal, harm) come with their gates in M6. */
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
}

const MAX_PER_DAY = 6
const MAX_ACTIVE = 3
const GOAL_REST = 5 * 60
const DAY = 24 * 60

function brain(world: World) {
  return (world.state.brain ??= { seq: 0, pending: [], counts: {} })
}

/**
 * A decision moment: goes to the AI when a model is connected and the day's
 * budget allows. A finished goal only asks again after a rest of five hours,
 * so an NPC thinks two to four times a day (FO, chapter 7); news that concerns
 * it and the morning always count.
 */
export function triggerChoice(world: World, npcId: string, trigger: string, kind: 'morning' | 'news' | 'goal' = 'news'): void {
  if (!world.aiLive || !world.alive(npcId) || world.npc(npcId).child) return
  const state = brain(world)
  if (state.pending.some((p) => p.npc === npcId)) return
  const last = state.last?.[npcId]
  if (kind === 'goal' && last !== undefined && world.now - last < GOAL_REST) {
    // Not yet: the NPC thinks again once the rest is over.
    ;(state.due ??= {})[npcId] = last + GOAL_REST
    return
  }
  if (state.due) delete state.due[npcId]
  const today = startOfDay(world.now)
  const count = state.counts[npcId]
  const used = count && count.day === today ? count.n : 0
  if (used >= MAX_PER_DAY) return
  state.counts[npcId] = { day: today, n: used + 1 }
  ;(state.last ??= {})[npcId] = world.now
  state.pending.push({ id: `choice_${++state.seq}`, npc: npcId, t: world.now, trigger })
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
    triggerChoice(world, npcId, 'You have just got up. What do you want to do today?', 'morning')
    return
  }
  const due = world.state.brain?.due?.[npcId]
  if (due !== undefined && world.now >= due) triggerChoice(world, npcId, 'Some hours have passed since you last decided. What next?', 'goal')
}

// ---------------------------------------------------------------- the request

interface Allowed {
  places: string[]
  people: string[]
  items: string[]
  objects: string[]
}

function allowed(world: World, npcId: string): Allowed {
  const npc = world.npc(npcId)
  const state = world.npcState(npcId)
  const places = [...world.knownLocations(npcId)].filter((id) => !world.location(id).tags.includes('private') || id === npc.home || id === npc.work).sort()
  const people = peopleIds(world, npcId).filter((id) => world.alive(id))
  const items = new Set<string>(Object.keys(state.inventory))
  for (const id of places) for (const service of world.location(id).services) for (const item of Object.keys(service.sells)) items.add(item)
  for (const request of openRequestsOf(world, npcId)) if (request.item) items.add(request.item)
  const objects: string[] = []
  for (const id of [npc.home, npc.work].filter((x): x is string => Boolean(x))) {
    for (const object of world.location(id).objects) if (world.objectState(id, object.id)['broken'] === true) objects.push(`${id}/${object.id}`)
  }
  return { places, people, items: [...items].sort(), objects }
}

const SYSTEM = [
  'You choose what one character in a text role-playing game wants to do next.',
  'The game carries it out: you only choose goals from the list, with ids you are given.',
  'Choose 1 to 3 goals that fit the character, the time and what just happened. Priority is 0 to 1.',
  'Choose Work when nothing special is going on. Never choose anything the character would not do.',
  'Reply with JSON that matches the schema, and nothing else.',
].join('\n')

export function goalRequest(world: World, choice: GoalChoice): LlmRequest {
  const npcId = choice.npc
  const npc = world.npc(npcId)
  const state = world.npcState(npcId)
  const ids = allowed(world, npcId)
  const profession = world.content.professions.get(npc.profession)?.name ?? npc.profession
  const name = (id: string) => (world.content.npcs.has(id) ? callName(world.npc(id)) : world.content.locations.get(id)?.name ?? itemName(world.content, id))
  const heard = world.state.news?.heard[npcId] ?? {}
  const news = (world.state.news?.facts ?? [])
    .filter((f) => heard[f.id] && world.now - f.t < 2 * DAY)
    .sort((a, b) => b.belang - a.belang || b.t - a.t)
    .slice(0, 3)
    .map((f) => `  ${versionOf(f, heard[f.id]!)}`)
  const card = [
    `CHARACTER: ${npc.name}, ${npc.age}, ${profession}. ${describePersonality(npc)}. Cares about: ${Object.entries(npc.values)
      .filter(([, v]) => v >= 2)
      .map(([k]) => k)
      .join(', ') || 'getting by'}.`,
    peopleLine(world, npcId) ?? '',
  ].filter(Boolean)
  const lines = [
    `NOW: ${new GameClock(world.now).format()}, at ${world.location(state.location).name}. Doing: ${state.activity}.`,
    `NEEDS (0 bad, 100 good): ${Object.entries(state.needs)
      .map(([k, v]) => `${k} ${Math.round(v)}`)
      .join(', ')}. Money: ${state.money} duiten.`,
    ...(state.goals.length ? [`GOALS NOW: ${state.goals.map((g) => `${g.type}${g.item ? ` ${g.item}` : ''}${g.target ? ` ${name(g.target)}` : ''}`).join(', ')}`] : []),
    ...(news.length ? ['NEWS YOU HEARD:', ...news] : []),
    ...((state.thoughts ?? []).filter((t) => t.until > world.now).map((t) => `ON YOUR MIND: ${t.text}`)),
    `WHY YOU CHOOSE NOW: ${choice.trigger}`,
    'GOALS YOU MAY CHOOSE:',
    ...Object.entries(GOAL_CATALOGUE).map(([type, e]) => `  ${type} (${e.target === 'none' ? 'target none' : `target: ${e.target}`}): ${e.text}`),
    `PLACES YOU KNOW: ${ids.places.map((id) => `${id} (${name(id)})`).join(', ')}`,
    `PEOPLE YOU KNOW: ${ids.people.map((id) => `${id} (${name(id)})`).join(', ')}`,
    `THINGS: ${ids.items.join(', ')}`,
    ...(ids.objects.length ? [`BROKEN, YOURS TO MEND: ${ids.objects.join(', ')}`] : []),
  ]
  const targets = [...ids.places, ...ids.people, ...ids.items, ...ids.objects, 'none']
  // Goal choices of people with a part in a quest keep their place when the budget runs low (FO, chapter 16).
  const priority = questsOf(world, npcId).length ? 'normal' : 'low'
  return {
    role: 'brain',
    system: [SYSTEM, '', WORLD_FRAME, '', ...card].join('\n'),
    prompt: lines.join('\n'),
    schemaName: 'npc_goals',
    schema: goalJsonSchema(Object.keys(GOAL_CATALOGUE), targets),
    maxTokens: 400,
    priority,
    meta: { npc: npcId, places: ids.places, people: ids.people, items: ids.items },
  }
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
      (entry.target === 'object' && ids.objects.includes(target))
    if (!known) {
      rejected.push(`${goal.type} ${target}: not something ${callName(world.npc(npcId))} knows`)
      continue
    }
    if (entry.type === 'Produce' && !producible(world, npcId, target)) {
      rejected.push(`Produce ${target}: not what this trade makes`)
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
    accepted.push(toGoal(world, entry, target, goal.priority))
  }
  const active = state.goals.filter((g) => g.source === 'ai').length
  return { accepted: accepted.slice(0, Math.max(0, MAX_ACTIVE - active)), rejected }
}

function producible(world: World, npcId: string, item: string): boolean {
  const profession = world.content.professions.get(world.npc(npcId).profession)
  return (profession?.daily_goals ?? []).some((g) => g.type === 'Produce' && g.item === item)
}

function toGoal(world: World, entry: Entry, target: string, priority: number): Goal {
  const base: Goal = { id: `g${++world.state.goalSeq}`, type: entry.type, priority: Math.max(0, Math.min(1, priority)), source: 'ai', created: world.now, until: world.now + DAY }
  if (entry.target === 'item') return { ...base, item: target, qty: 1 }
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
  if (reply === null || !world.alive(choice!.npc)) return { accepted: [], rejected: reply === null ? ['no reply: the utility function decides'] : [] }
  const result = validateGoals(world, choice!.npc, reply)
  world.npcState(choice!.npc).goals.push(...result.accepted)
  return result
}

/** Without a model, choices are not waited for. */
export function settleChoices(world: World): void {
  if (world.aiLive || !world.state.brain?.pending.length) return
  world.state.brain.pending = []
}
