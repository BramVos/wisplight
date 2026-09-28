import { knob } from '../knobs'
import { minuteOfDay, nextOpening, parseHours, startOfDay, weekdayName } from '../clock'
import { delivered, goalEnded } from '../agreements'
import type { DailyGoal, ScheduleBlock } from '../content'
import type { Goal, Step } from '../state'
import type { World } from '../world'
import { griefSince } from '../people'
import { morning, triggerChoice } from './goals'
import { feastFor } from '../stories'
import { executeStep, resolvePending } from './execute'
import { isFailure, Planner } from './planner'
import { unreported } from './acts'
import { callName } from '../content'
import { standingOf } from '../standing'
import { LAND_LAW } from '../social/crime'
import { factById, heardBy } from '../news'
import { heardClaim, reconsider } from '../belief'

// Without AI an NPC falls back on its schedule, its needs and the daily goals
// of its profession (FO, chapter 7: the utility layer). Goals chosen by the
// AI (M3) will enter through the same goal list.

const MAX_STEPS_PER_TURN = 8
const MAX_REPLANS = 3

export function think(world: World, npcId: string): void {
  const npc = world.npcState(npcId)
  if (world.now < npc.busyUntil) return
  resolvePending(world, npcId)
  morning(world, npcId)

  for (let i = 0; i < MAX_STEPS_PER_TURN && world.now >= npc.busyUntil; i++) {
    if (npc.plan.length === 0 && !choose(world, npcId)) {
      npc.busyUntil = world.now + 15
      npc.activity = 'taking it easy'
      return
    }
    const step = npc.plan[0]!
    const result = executeStep(world, npcId, step)
    if (result === 'done') {
      npc.plan.shift()
      if (npc.plan.length === 0) finishGoal(world, npcId, true)
    } else if (result === 'failed') {
      npc.plan = []
      replanOrFail(world, npcId)
    }
  }
}

/**
 * A report carried to someone (M8.2): when they are together the other hears
 * it from them, and believes it or not by the usual rules. Not found: try
 * again while there is time.
 */
function carryWord(world: World, npcId: string, goal: Goal): void {
  const npc = world.npcState(npcId)
  const other = world.state.npcs[goal.target!]
  if (!other || other.dead) return
  if (other.location !== npc.location || other.note) {
    if ((goal.until ?? 0) > world.now) npc.goals.push({ ...goal, id: `g${++world.state.goalSeq}` })
    return
  }
  const heard = heardBy(world, goal.target!)
  const mine = heardBy(world, npcId)
  for (const id of goal.message!) {
    const fact = factById(world, id)
    if (!fact) continue
    // Someone who comes all this way to tell you in person is heard out; more so when they saw it (M10.6).
    const weight = knob(world, 'belief.in_person') + (mine[id]?.from === 'witness' ? knob(world, 'belief.saw_it') : 0)
    if (heard[id]) {
      // Heard it before and did not believe it: they think again (M10.6).
      if (heard[id]!.stance) reconsider(world, goal.target!, fact, npcId, weight)
      continue
    }
    const h = (heard[id] = { level: 3, reliability: 0.9, from: npcId, t: world.now })
    heardClaim(world, goal.target!, fact, h, weight)
  }
  // Only now does the other know it; the register hears it was done (M10.2).
  delivered(world, goal)
  world.emit('report', npc.location, `${callName(world.npc(npcId))} takes ${callName(world.npc(goal.target!))} aside and tells what ${world.say('{they}', npcId)} heard.`, npcId)
}

function finishGoal(world: World, npcId: string, success: boolean): void {
  const npc = world.npcState(npcId)
  const goal = npc.goals.find((g) => g.id === npc.planGoal)
  if (goal) {
    npc.goals = npc.goals.filter((g) => g !== goal)
    if (goal.message?.length && goal.target) carryWord(world, npcId, goal)
    else if (goal.agreement) goalEnded(world, npcId, goal, success)
    if (goal.source === 'daily') npc.dailyDone[dailyKey(goal)] = startOfDay(world.now)
    if (!success) world.emit('goal_failed', npc.location, world.say(`{name} gives up for now, frowning.`, npcId), npcId)
    // A goal of its own done or given up: a new moment to decide (FO, chapter 7).
    if (goal.source === 'ai') triggerChoice(world, npcId, success ? `You did what you set out to do: ${goal.type}.` : `What you set out to do did not work out: ${goal.type}.`, 'goal')
  }
  npc.planGoal = undefined
  npc.replans = 0
}

function replanOrFail(world: World, npcId: string): void {
  const npc = world.npcState(npcId)
  const goal = npc.goals.find((g) => g.id === npc.planGoal)
  if (goal && npc.replans < MAX_REPLANS) {
    npc.replans++
    const result = new Planner(world, npcId).plan(goal)
    if (!isFailure(result) && result.steps.length > 0) {
      npc.plan = result.steps
      return
    }
  }
  finishGoal(world, npcId, false)
  npc.busyUntil = world.now + 15
}

/** Picks what to do next and fills the plan. Returns false when there is nothing to do. */
function choose(world: World, npcId: string): boolean {
  const npc = world.npcState(npcId)
  const def = world.npc(npcId)

  if (npc.needs.hunger < 15) return setPlan(world, npcId, eatPlan(world, npcId))
  // A fever keeps you in bed; a feast day brings the village together.
  if (npc.sickUntil !== undefined && world.now < npc.sickUntil) {
    return setPlan(world, npcId, [...goHome(world, npcId), { kind: 'spend', minutes: 60, activity: 'idle', label: 'ill in bed' }])
  }
  // A burial (M10.7) draws those who knew the dead, the grieving first, and children with their people.
  const gathering = feastFor(world, npcId)
  if (gathering?.burial) {
    return setPlan(world, npcId, [...goTo(world, npcId, gathering.place), { kind: 'spend', minutes: Math.max(10, gathering.until - world.now), activity: 'idle', label: 'at the burial' }])
  }
  // Fresh grief keeps people at home for a day, and away from feasts for a week.
  const grief = griefSince(world, npcId)
  if (grief !== undefined && world.now - grief < 24 * 60 && npc.needs.rest >= 10) {
    return setPlan(world, npcId, [...goHome(world, npcId), { kind: 'spend', minutes: 60, activity: 'idle', label: 'mourning at home' }])
  }
  const feast = grief !== undefined && world.now - grief < 7 * 24 * 60 ? undefined : gathering
  if (feast && !def.child) {
    return setPlan(world, npcId, [...goTo(world, npcId, feast.place), { kind: 'spend', minutes: Math.max(10, feast.until - world.now), activity: 'socialize' }])
  }
  // Away from home for some days: there, about one's business, until it is time to go back.
  if (npc.stayAt) {
    if (world.now >= npc.stayAt.until) npc.stayAt = undefined
    else return setPlan(world, npcId, [...goTo(world, npcId, npc.stayAt.where), { kind: 'spend', minutes: 60, activity: 'idle', label: `staying at ${world.location(npc.stayAt.where).name}` }])
  }
  if (npc.needs.rest < 10) return setPlan(world, npcId, [...goHome(world, npcId), { kind: 'sleep', until: world.now + 6 * 60 }])

  const block = currentBlock(world, npcId)
  // What the AI chose comes before the schedule; at work only when it matters more than the work.
  npc.goals = npc.goals.filter((g) => g.source !== 'ai' || g.until === undefined || g.until > world.now)
  const own = npc.goals.filter((g) => g.source === 'ai').sort((a, b) => b.priority - a.priority)[0]
  if (own && block?.activity !== 'sleep' && (block?.activity !== 'work' || own.priority >= 0.5) && pursueOwnGoal(world, npcId, own)) return true

  const blockEnd = block ? endOfBlock(world.now, block) : world.now + 30
  const remaining = Math.max(10, blockEnd - world.now)

  switch (block?.activity ?? 'free') {
    case 'sleep':
      return setPlan(world, npcId, [...goHome(world, npcId), { kind: 'sleep', until: blockEnd }])

    case 'eat': {
      const key = `eat@${startOfDay(world.now) + parseHours(`${block!.from}-${block!.to}`)[0]}`
      if (npc.dailyDone[key]) break
      // Yesterday's meals are not kept (M9.1): only today's say whether this one was had.
      for (const k of Object.keys(npc.dailyDone)) if (k.startsWith('eat@') && Number(k.slice(4)) < startOfDay(world.now)) delete npc.dailyDone[k]
      npc.dailyDone[key] = world.now
      return setPlan(world, npcId, eatPlan(world, npcId))
    }

    case 'work': {
      if (pursueDailyGoal(world, npcId)) return true
      const place = placeFor(world, npcId, block?.at ?? 'work')
      return setPlan(world, npcId, [...goTo(world, npcId, place), { kind: 'spend', minutes: Math.min(30, remaining), activity: 'work' }])
    }

    case 'socialize': {
      const place = block?.at ? placeFor(world, npcId, block.at) : socialPlace(world, npcId)
      return setPlan(world, npcId, [...goTo(world, npcId, place), { kind: 'spend', minutes: Math.min(60, remaining), activity: 'socialize' }])
    }

    case 'pray': {
      const place = placeFor(world, npcId, block?.at ?? prayerPlace(world, npcId))
      return setPlan(world, npcId, [...goTo(world, npcId, place), { kind: 'spend', minutes: Math.min(60, remaining), activity: 'pray' }])
    }

    case 'home':
      return setPlan(world, npcId, [...goHome(world, npcId), { kind: 'spend', minutes: Math.min(30, remaining), activity: 'idle' }])

    case 'free':
      break
  }

  // Free time: children play, the lonely seek company, everyone else rests at home.
  if (def.child) {
    const place = placeFor(world, npcId, taggedNear(world, npcId, 'play') ?? socialPlace(world, npcId))
    return setPlan(world, npcId, [...goTo(world, npcId, place), { kind: 'spend', minutes: Math.min(45, remaining), activity: 'play' }])
  }
  if (npc.needs.social < 40) {
    return setPlan(world, npcId, [...goTo(world, npcId, socialPlace(world, npcId)), { kind: 'spend', minutes: Math.min(45, remaining), activity: 'socialize' }])
  }
  return setPlan(world, npcId, [...goHome(world, npcId), { kind: 'spend', minutes: Math.min(30, remaining), activity: 'idle' }])
}

/** Carries out a goal the AI chose: the planner for things to get, make or mend; plain steps for the rest. */
function pursueOwnGoal(world: World, npcId: string, goal: Goal): boolean {
  const npc = world.npcState(npcId)
  const start = (steps: Step[]) => {
    if (steps.length === 0) {
      npc.goals = npc.goals.filter((g) => g !== goal)
      return false
    }
    npc.planGoal = goal.id
    npc.plan = steps
    npc.replans = 0
    return true
  }
  switch (goal.type) {
    case 'Obtain':
    case 'Produce':
    case 'Repair': {
      const result = new Planner(world, npcId).plan(goal)
      if (isFailure(result)) {
        npc.goals = npc.goals.filter((g) => g !== goal)
        triggerChoice(world, npcId, `You could not see how to ${goal.type.toLowerCase()} ${goal.item ?? goal.object ?? ''}: nobody you know has it.`, 'goal')
        return false
      }
      return start(departLater(world, npcId, result.steps))
    }
    case 'Visit':
      return start([...goTo(world, npcId, goal.target!), { kind: 'spend', minutes: 45, activity: world.location(goal.target!).tags.includes('social') ? 'socialize' : 'idle', label: `visiting ${world.location(goal.target!).name}` }])
    case 'Talk': {
      const other = world.state.npcs[goal.target!]
      if (!other || other.dead) return start([])
      return start([...goTo(world, npcId, other.location), { kind: 'spend', minutes: 20, activity: 'socialize', label: `talking with ${world.npc(goal.target!).short}` }])
    }
    case 'Socialize':
      return start([...goTo(world, npcId, goal.target ?? socialPlace(world, npcId)), { kind: 'spend', minutes: 45, activity: 'socialize' }])
    case 'Pray':
      return start([...goTo(world, npcId, placeFor(world, npcId, prayerPlace(world, npcId))), { kind: 'spend', minutes: 30, activity: 'pray' }])
    case 'Rest':
      return start([...goHome(world, npcId), { kind: 'spend', minutes: 60, activity: 'idle', label: 'resting at home' }])
    case 'AskHelp':
      return start([{ kind: 'askHelp', item: goal.item!, qty: goal.qty ?? 1 }])
    default:
      return start(actPlan(world, npcId, goal))
  }
}

/** The rest of the catalogue (M7.2): walk to where it happens, spend the time, and the act itself (npc/acts.ts). */
function actPlan(world: World, npcId: string, goal: Goal): Step[] {
  const npc = world.npcState(npcId)
  const other = goal.target ? world.state.npcs[goal.target] : undefined
  const at = (id: string | undefined) => (id && world.content.npcs.has(id) ? callName(world.npc(id)) : 'them')
  const toPerson = (): Step[] | undefined => (other && !other.dead && !other.absent ? goTo(world, npcId, other.location) : undefined)
  const place = (id: string | undefined) => (id ? world.location(id).name : '')
  switch (goal.type) {
    case 'Sell': {
      const shop = nearestWhere(world, npcId, (id) => world.location(id).services.some((s) => s.buys.includes(goal.item!)))
      return shop ? [...goTo(world, npcId, shop), { kind: 'act', act: 'sell', item: goal.item }] : []
    }
    case 'Deliver': {
      const way = toPerson()
      return way && goal.item ? [...way, { kind: 'act', act: 'deliver', target: goal.target, item: goal.item }] : []
    }
    case 'Meet': {
      const way = toPerson()
      return way ? [...way, { kind: 'spend', minutes: 60, activity: 'socialize', label: `with ${at(goal.target)}` }, { kind: 'act', act: 'meet', target: goal.target }] : []
    }
    case 'Follow': {
      const way = toPerson()
      return way ? [...way, { kind: 'spend', minutes: 40, activity: 'idle', label: `keeping an eye on ${at(goal.target)}` }, { kind: 'act', act: 'follow', target: goal.target }] : []
    }
    case 'Guard':
      return [...goTo(world, npcId, goal.target!), { kind: 'spend', minutes: 180, activity: 'idle', label: `keeping watch at ${place(goal.target)}` }]
    case 'Avoid':
      npc.avoid = { place: goal.target!, until: world.now + 24 * 60 }
      return [{ kind: 'spend', minutes: 5, activity: 'idle', label: 'keeping out of the way' }]
    case 'Help': {
      const way = toPerson()
      return way ? [...way, { kind: 'spend', minutes: 60, activity: 'work', label: `helping ${at(goal.target)}` }, { kind: 'act', act: 'help', target: goal.target }] : []
    }
    case 'Spread':
      return [...goTo(world, npcId, socialPlace(world, npcId)), { kind: 'spend', minutes: 30, activity: 'socialize', label: 'passing on the news' }, { kind: 'act', act: 'spread' }]
    case 'Court': {
      const way = toPerson()
      return way ? [...way, { kind: 'spend', minutes: 45, activity: 'socialize', label: `with ${at(goal.target)}` }, { kind: 'act', act: 'court', target: goal.target }] : []
    }
    case 'Celebrate':
      return [...goTo(world, npcId, socialPlace(world, npcId)), { kind: 'act', act: 'celebrate' }, { kind: 'spend', minutes: 90, activity: 'socialize', label: 'celebrating' }]
    case 'Investigate':
      return [...goTo(world, npcId, goal.target!), { kind: 'spend', minutes: 45, activity: 'idle', label: `looking round ${place(goal.target)}` }, { kind: 'act', act: 'investigate' }]
    case 'Report': {
      const crime = unreported(world, npcId)[0]
      const officer = crime ? lawOfficer(world, crime.law) : undefined
      const where = officer ? world.state.npcs[officer]?.location : undefined
      return where ? [...goTo(world, npcId, where), { kind: 'act', act: 'report', target: officer }] : []
    }
    case 'Confront': {
      const way = toPerson()
      return way ? [...way, { kind: 'act', act: 'confront', target: goal.target }] : []
    }
    case 'RecruitHelp': {
      const way = toPerson()
      return way ? [...way, { kind: 'act', act: 'recruit', target: goal.target }] : []
    }
    case 'Steal': {
      const shop = nearestWhere(world, npcId, (id) => world.location(id).services.some((s) => (world.stock(id, s.id)[goal.item!] ?? 0) > 0))
      return shop ? [...goTo(world, npcId, shop), { kind: 'act', act: 'steal', item: goal.item }] : []
    }
    case 'Sabotage': {
      const [location] = (goal.target ?? '').split('/')
      return location && world.content.locations.has(location) ? [...goTo(world, npcId, location), { kind: 'act', act: 'sabotage', target: goal.target }] : []
    }
    case 'Harm': {
      const way = toPerson()
      return way ? [...way, { kind: 'act', act: 'harm', target: goal.target }] : []
    }
    case 'Flee':
      npc.stayAt = { where: goal.target!, until: world.now + 2 * 24 * 60 }
      return goTo(world, npcId, goal.target!)
    default:
      return []
  }
}

/** The nearest place the NPC knows where something holds. */
function nearestWhere(world: World, npcId: string, test: (location: string) => boolean): string | undefined {
  const here = world.npcState(npcId).location
  let best: string | undefined
  let bestMinutes = Infinity
  for (const id of [...world.knownLocations(npcId)].sort()) {
    if (!test(id)) continue
    const minutes = id === here ? 0 : (world.route(here, id)?.minutes ?? Infinity)
    if (minutes < bestMinutes) {
      best = id
      bestMinutes = minutes
    }
  }
  return best
}

/** Who keeps a law: the members of the faction that keeps it, or the officer of the land's law (world.yaml). */
function lawOfficer(world: World, law: string): string | undefined {
  const faction = [...world.content.factions.values()].find((f) => f.law === law)
  const officer = world.words.law.npc
  return faction?.members.find((id) => world.alive(id)) ?? (law === LAND_LAW && officer && world.alive(officer) ? officer : undefined)
}

/** The nearest known place with this tag, from home (M8.2: the tags play and holy, not the Nethermarch's ids). */
function taggedNear(world: World, npcId: string, tag: string): string | undefined {
  const home = world.npc(npcId).home
  const places = [...world.knownLocations(npcId)].sort().filter((id) => world.location(id).tags.includes(tag))
  return places.sort((a, b) => (world.route(home, a)?.minutes ?? Infinity) - (world.route(home, b)?.minutes ?? Infinity))[0]
}

function setPlan(world: World, npcId: string, steps: Step[]): boolean {
  const npc = world.npcState(npcId)
  npc.plan = steps
  return steps.length > 0
}

/** Starts the first daily goal of the profession that still needs doing today. */
function pursueDailyGoal(world: World, npcId: string): boolean {
  const npc = world.npcState(npcId)
  const profession = world.content.professions.get(world.npc(npcId).profession)
  const today = startOfDay(world.now)
  for (const template of profession?.daily_goals ?? []) {
    if (template.days && !template.days.includes(weekdayName(world.now, world.calendar))) continue
    const goal = concreteGoal(world, npcId, template)
    if (!goal) continue
    if (npc.dailyDone[dailyKey(goal)] === today) continue
    if (!goal.qty && goal.type === 'Produce') {
      npc.dailyDone[dailyKey(goal)] = today
      continue
    }

    const result = new Planner(world, npcId).plan(goal)
    if (isFailure(result)) {
      npc.dailyDone[dailyKey(goal)] = today
      const last = npc.lastAskHelp[result.missing.item]
      if (last === undefined || world.now - last >= (knob(world, 'people.ask_again_days') * 24 * 60)) {
        npc.goals.push(goal)
        npc.planGoal = goal.id
        npc.plan = [{ kind: 'askHelp', item: result.missing.item, qty: result.missing.qty }]
        return true
      }
      continue
    }
    npc.goals.push(goal)
    npc.planGoal = goal.id
    npc.plan = departLater(world, npcId, result.steps)
    npc.replans = 0
    return true
  }
  return false
}

function concreteGoal(world: World, npcId: string, template: DailyGoal): Goal | undefined {
  const base = { id: `g${++world.state.goalSeq}`, priority: 0.7, source: 'daily' as const, created: world.now }
  if (template.type === 'Produce' && template.item) {
    let qty = template.qty ?? 0
    if (template.service) {
      const shop = findService(world, template.service)
      if (!shop) return undefined
      const target = shop.service.sells[template.item]?.target ?? 0
      // Colleagues already working on the same shelf count too.
      const underway = Object.entries(world.state.npcs)
        .filter(([id]) => id !== npcId)
        .flatMap(([, other]) => other.goals)
        .filter((g) => g.service === template.service && g.item === template.item)
        .reduce((sum, g) => sum + (g.qty ?? 0), 0)
      qty = Math.max(0, target - (world.stock(shop.location, shop.service.id)[template.item] ?? 0) - underway)
    }
    return { ...base, type: 'Produce', item: template.item, qty, service: template.service }
  }
  if (template.type === 'Repair' && template.object) {
    const [location, object] = template.object.split('/')
    if (!location || !object) return undefined
    const state = world.objectState(location, object)
    if (state['broken'] !== true) return undefined
    return { ...base, type: 'Repair', target: location, object }
  }
  return undefined
}

function dailyKey(goal: Goal): string {
  return `${goal.type}:${goal.item ?? goal.object ?? ''}:${goal.service ?? goal.target ?? ''}`
}

/**
 * When the first stop only opens later, wait at home or work before leaving,
 * so Mirte sets off at half past five instead of queueing in the dark.
 */
function departLater(world: World, npcId: string, steps: Step[]): Step[] {
  const [first, second] = steps
  if (first?.kind !== 'move' || second?.kind !== 'waitOpen') return steps
  const route = world.route(world.npcState(npcId).location, first.to)
  const service = second.service ? world.service(second.location, second.service) : undefined
  const object = second.object ? world.object(second.location, second.object)?.instance : undefined
  if (!route) return steps
  const arrival = world.now + route.minutes
  const opening = nextOpening(arrival, service?.hours ?? object?.hours, service?.days ?? object?.days, world.calendar)
  if (opening === undefined || opening - arrival <= 30) return steps
  return [{ kind: 'spend', minutes: opening - arrival - 15, activity: 'work' }, ...steps]
}

function eatPlan(world: World, npcId: string): Step[] {
  const npc = world.npcState(npcId)
  const hasFood = Object.keys(npc.inventory).some((item) => (world.content.items.get(item)?.food ?? 0) > 0)
  return hasFood ? [{ kind: 'eat' }] : [...goHome(world, npcId), { kind: 'eat' }]
}

function goHome(world: World, npcId: string): Step[] {
  return goTo(world, npcId, world.npc(npcId).home)
}

function goTo(world: World, npcId: string, place: string): Step[] {
  const npc = world.npcState(npcId)
  // A place the NPC keeps away from for now (the goal Avoid): home instead.
  if (npc.avoid && npc.avoid.until > world.now && npc.avoid.place === place) place = world.npc(npcId).home
  return npc.location === place ? [] : [{ kind: 'move', to: place }]
}

function placeFor(world: World, npcId: string, at: string): string {
  const def = world.npc(npcId)
  if (at === 'home') return def.home
  if (at === 'work') return def.work ?? def.home
  return world.content.locations.has(at) ? at : def.home
}

/** Where someone prays without a place in the schedule: the Veenhoek chapel, or the nearest known place tagged "holy". */
function prayerPlace(world: World, npcId: string): string {
  const home = world.npc(npcId).home
  const holy = [...world.knownLocations(npcId)].sort().filter((id) => world.location(id).tags.includes('holy'))
  return holy.sort((a, b) => (world.route(home, a)?.minutes ?? Infinity) - (world.route(home, b)?.minutes ?? Infinity))[0] ?? home
}

/** The nearest known place tagged "social" (the inn, the green). */
function socialPlace(world: World, npcId: string): string {
  const home = world.npc(npcId).home
  const known = world.knownLocations(npcId)
  // The well-to-do and the notable are not seen at the inn (M8.2): they spend their free time at church.
  const tag = standingOf(world, npcId) >= 4 ? 'holy' : 'social'
  let best = home
  let bestMinutes = Infinity
  for (const id of [...known].sort()) {
    if (!world.location(id).tags.includes(tag) || world.location(id).tags.includes('haunted')) continue
    const minutes = world.route(home, id)?.minutes ?? Infinity
    if (minutes < bestMinutes) {
      best = id
      bestMinutes = minutes
    }
  }
  return best
}

/**
 * Where someone usually is at a time, by their day schedule: what a person
 * who knows them would guess (after the M7 playtest: "where is Mirte?").
 */
export function usualPlace(world: World, npcId: string, at = world.now): { place: string; activity: ScheduleBlock['activity'] } | undefined {
  const block = currentBlock(world, npcId, at)
  if (!block) return undefined
  const def = world.npc(npcId)
  const place =
    block.activity === 'work' ? placeFor(world, npcId, block.at ?? 'work')
    : block.activity === 'socialize' ? (block.at ? placeFor(world, npcId, block.at) : socialPlace(world, npcId))
    : block.activity === 'pray' ? placeFor(world, npcId, block.at ?? prayerPlace(world, npcId))
    : block.at ? placeFor(world, npcId, block.at) : def.home
  return world.content.locations.has(place) ? { place, activity: block.activity } : undefined
}

/** Where someone usually is now, doing what, and until when: a time fact for a conversation (M10.3: "Brannoc is back at six"). */
/**
 * Where someone has gone today, off their usual round (M10.6, Mirte at the
 * market in Waagdam): another settlement than their day would put them in, or
 * where they are walking to. What those who know their day know.
 */
export function goneTo(world: World, npcId: string): string | undefined {
  const s = world.state.npcs[npcId]
  if (!s || s.dead || s.absent) return undefined
  const where = s.note?.where ?? s.location
  const there = world.content.locations.get(where)
  if (!there) return undefined
  const usual = world.content.locations.get(usualPlace(world, npcId)?.place ?? world.npc(npcId).home)
  return usual && there.area !== usual.area ? where : undefined
}

export function routineNow(world: World, npcId: string, at = world.now): { place: string; activity: ScheduleBlock['activity']; until: number } | undefined {
  const block = currentBlock(world, npcId, at)
  const usual = block ? usualPlace(world, npcId, at) : undefined
  return block && usual ? { ...usual, until: endOfBlock(at, block) } : undefined
}

function currentBlock(world: World, npcId: string, at = world.now): ScheduleBlock | undefined {
  const profession = world.content.professions.get(world.npc(npcId).profession)
  const day = weekdayName(at, world.calendar)
  const now = minuteOfDay(at)
  return profession?.schedule.find((block) => {
    if (block.days && !block.days.includes(day)) return false
    const [from, to] = parseHours(`${block.from}-${block.to}`)
    return from <= to ? now >= from && now < to : now >= from || now < to
  })
}

function endOfBlock(now: number, block: ScheduleBlock): number {
  const [from, to] = parseHours(`${block.from}-${block.to}`)
  const day = startOfDay(now)
  const minute = minuteOfDay(now)
  if (from <= to) return day + to
  return minute >= from ? day + 24 * 60 + to : day + to
}

function findService(world: World, serviceId: string) {
  for (const location of world.content.locations.values()) {
    const service = location.services.find((s) => s.id === serviceId)
    if (service) return { location: location.id, service }
  }
  return undefined
}
