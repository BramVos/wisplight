import { setRoute } from '../economy/ledger'
import { WEEKDAYS, weekdayOf } from '../clock'
import type { Output } from '../commands'
import { callName } from '../content'
import { goAway, tierOf } from '../lod'
import { shiftTension } from '../social/realms'
import type { Claim } from '../state'
import type { World } from '../world'
import { applyEffects, holds, type QuestHost } from './engine'
import { PlanSchema, type Plan, type PlanEffect, type Step } from './planschema'
import { bindValue, runVerb, type PlanContext } from '../aftermath'

export { PlanSchema, type Plan, type PlanEffect }

// Plans (design: lore and world change, "Grote gebeurtenissen"; signalen en
// nasleep, "Het plan is data"). The effect plans of big events run in phases
// hours after they start, from a fixed vocabulary the system can check and
// carry out. Since M8.1 a plan can also have steps over days, each with a
// moment, a condition on what someone knows or what is true, and one verb:
// the standard aftermath, the brain and the chronicler all hand in plans of
// this one kind, and this module carries them out. Near the player people
// really pack up and walk; far off they become notes. Quests react to the
// state of the world that follows, not to text.

const DAY = 24 * 60

export interface PlanState {
  plan: string
  started: number
  phase: number
  cause: string
  groups: Record<string, string[]>
  /** Plans with steps (M8.1): their own id, who made them, about whom and what, and how far they are. */
  id?: string
  source?: 'content' | 'rules' | 'chronicler' | 'brain'
  topic?: string
  subjects?: string[]
  signal?: string
  bind?: Record<string, string>
  steps?: Record<string, StepState>
  expires?: number
  ended?: number
  outcome?: 'done' | 'failed' | 'expired' | 'merged'
  /** The storyline a beat of the chronicler belongs to (M8.3). */
  line?: string
}

export interface StepState {
  due?: number
  done?: number
  skipped?: number
  /** Where it happened, for later steps. */
  where?: string
  /** One by one for the members of a group: when each was done (or skipped, negative). */
  members?: Record<string, number>
}

/** A fixed plan of the content, one the chronicler wrote for this game, or a standard aftermath. */
export function planOf(world: World, id: string): Plan | undefined {
  if (id.startsWith('aftermath:')) {
    const a = world.content.aftermath.get(id.slice(10))
    return a ? { id: a.id, name: a.id, groups: a.groups, phases: [], max_effects: 30, steps: a.steps, expires: a.expires, topic: a.topic } : undefined
  }
  if (id.startsWith('intention:')) {
    const i = world.content.intentions.get(id.slice(10))
    return i ? { id: i.id, name: i.choice.name, groups: i.groups, phases: [], max_effects: 30, steps: i.steps, expires: i.expires, topic: i.topic } : undefined
  }
  return world.content.plans.get(id) ?? world.state.dynamicPlans?.[id]
}

/** Whether a plan still has something to do. */
export function running(world: World, p: PlanState): boolean {
  const plan = planOf(world, p.plan)
  if (!plan) return false
  return p.phase < plan.phases.length || (plan.steps.length > 0 && p.ended === undefined)
}

/** The groups of a plan: everyone who lives in their areas, alive, not absent, not with the player. */
function groupsOf(world: World, plan: Plan): Record<string, string[]> {
  const groups: Record<string, string[]> = {}
  for (const [name, g] of Object.entries(plan.groups)) {
    groups[name] = Object.keys(world.state.npcs)
      .sort()
      .filter((id) => {
        const s = world.state.npcs[id]!
        if (s.dead || s.absent || s.following || g.except.includes(id)) return false
        const home = world.content.locations.get(world.npc(id).home)
        return g.npcs.includes(id) || Boolean(home && g.areas.includes(home.area))
      })
  }
  return groups
}

export function startPlan(world: World, host: QuestHost, planId: string, cause: string, extra: Partial<PlanState> = {}): Output[] {
  const plan = planOf(world, planId)
  if (!plan) return []
  const plans = (world.state.plans ??= [])
  // A fixed plan runs once at a time; a plan of the aftermath once per topic and person.
  if (!planId.startsWith('aftermath:') && !planId.startsWith('intention:') && plans.some((p) => p.plan === planId && running(world, p))) return []
  const state: PlanState = { plan: planId, started: world.now, phase: 0, cause, groups: groupsOf(world, plan), ...extra }
  if (plan.steps.length) {
    state.id ??= `plan_${(world.state.planSeq = (world.state.planSeq ?? 0) + 1)}`
    state.source ??= world.content.plans.has(planId) ? 'content' : planId.startsWith('chronicle_') ? 'chronicler' : 'rules'
    state.steps = {}
    if (plan.expires) state.expires = world.now + plan.expires * DAY
    if (plan.topic) state.topic ??= plan.topic
  }
  plans.push(state)
  return plansDue(world, host)
}

/** The plans of the world that run from the first day (world.yaml, M8.3): started once, in a new game or an old save. */
export function startWorldPlans(world: World, host: QuestHost): Output[] {
  return world.content.world.plans.filter((id) => !(world.state.plans ?? []).some((p) => p.plan === id)).flatMap((id) => startPlan(world, host, id, 'world'))
}

/** Runs the phases whose hour has come, and the steps that are due. */
export function plansDue(world: World, host: QuestHost): Output[] {
  const out: Output[] = []
  for (const p of [...(world.state.plans ?? [])]) {
    const plan = planOf(world, p.plan)
    if (!plan) continue
    while (p.phase < plan.phases.length && world.now >= p.started + plan.phases[p.phase]!.after * 60) {
      for (const e of plan.phases[p.phase]!.effects.slice(0, plan.max_effects)) runEffect(world, host, p, e, out)
      p.phase++
    }
    if (plan.steps.length && p.ended === undefined) runSteps(world, host, p, plan, out)
  }
  // Wars that broke out by the rules of statecraft, and plans of the chronicler, are waiting.
  for (const id of (world.state.pendingPlans ?? []).splice(0)) out.push(...startPlan(world, host, id, id.startsWith('chronicle_') ? 'chronicle' : 'war'))
  return out
}

// ---------------------------------------------------------------- steps (M8.1)

function runSteps(world: World, host: QuestHost, p: PlanState, plan: Plan, out: Output[]): void {
  if (p.expires !== undefined && world.now >= p.expires) {
    p.ended = world.now
    p.outcome = 'expired'
    return
  }
  const steps = (p.steps ??= {})
  // A step may make the next one due at once (after, without waiting): a few rounds.
  for (let round = 0; round < 5; round++) {
    let moved = false
    for (const step of plan.steps) {
      const st = (steps[step.id] ??= {})
      if (st.done !== undefined || st.skipped !== undefined) continue
      const due = dueOf(world, p, step, st)
      if (due === undefined || world.now < due) continue
      const result = step.each ? runEach(world, host, p, step, st, out) : runOne(world, host, p, step, st, { ...p.bind }, out)
      if (result === 'fail') {
        p.ended = world.now
        p.outcome = 'failed'
        return
      }
      if (result === 'done') moved = true
      // Again in so many days, at the same hour (M8.3); a wait that lasts till then counts as skipped.
      if (step.every && (result === 'done' || world.now >= due + step.every * DAY)) steps[step.id] = { due: due + step.every * DAY }
    }
    if (!moved) break
  }
  if (plan.steps.every((s) => !s.every && (steps[s.id]?.done !== undefined || steps[s.id]?.skipped !== undefined))) {
    p.ended = world.now
    p.outcome = 'done'
  }
}

/** When a step is due: from the start or after another step, then on a day, an hour, a rest day. */
function dueOf(world: World, p: PlanState, step: Step, st: StepState): number | undefined {
  if (st.due !== undefined) return st.due
  let base = p.started
  if (step.after) {
    const before = p.steps?.[step.after]
    const resolved = before?.done ?? before?.skipped
    if (resolved === undefined) return undefined
    base = resolved
  }
  let t = base + step.wait * 60 + (step.at?.days ?? 0) * DAY + (step.at?.hours ?? 0) * 60
  if (step.at?.hour !== undefined) {
    const day = Math.floor(t / DAY) * DAY
    t = day + step.at.hour * 60 >= t ? day + step.at.hour * 60 : day + DAY + step.at.hour * 60
  }
  // The day of rest is the last of the week in every calendar.
  if (step.at?.rest_day) while (WEEKDAYS.indexOf(weekdayOf(t)) !== 6) t += DAY
  st.due = t
  return t
}

type Result = 'done' | 'wait' | 'skip' | 'fail'

function runOne(world: World, host: QuestHost, p: PlanState, step: Step, st: StepState, bind: Record<string, string>, out: Output[]): Result {
  const ctx: PlanContext = { plan: p, bind, host, out }
  const ok = step.when.every((c) => holds(world, bindValue(world, c, ctx), undefined))
  // A step with a chance may simply not happen when it can (rolled once, seeded).
  if (ok && step.chance !== undefined && world.rng.next('plans') >= step.chance) {
    st.skipped = world.now
    return 'done'
  }
  const done = ok && runVerb(world, ctx, step.do, st)
  if (done) {
    st.done = world.now
    return 'done'
  }
  if (step.otherwise === 'wait') return 'wait'
  if (step.otherwise === 'fail') return 'fail'
  st.skipped = world.now
  return 'done'
}

/** A step for each member of a group: each goes when their own conditions hold. */
function runEach(world: World, host: QuestHost, p: PlanState, step: Step, st: StepState, out: Output[]): Result {
  const members = p.groups[step.each!] ?? []
  const seen = (st.members ??= {})
  for (const who of members) {
    if (seen[who] !== undefined) continue
    if (world.state.npcs[who]?.dead) {
      seen[who] = -world.now
      continue
    }
    const one: StepState = {}
    const result = runOne(world, host, p, step, one, { ...p.bind, who }, out)
    if (result === 'fail') return 'fail'
    if (one.done !== undefined) seen[who] = world.now
    else if (one.skipped !== undefined) seen[who] = -world.now
  }
  if (members.every((m) => seen[m] !== undefined)) {
    st.done = world.now
    return 'done'
  }
  return 'wait'
}

// ---------------------------------------------------------------- effects of the phases

export function runEffect(world: World, host: QuestHost, p: PlanState, e: PlanEffect, out: Output[], until?: number): void {
  if ('flee' in e) {
    for (const id of p.groups[e.flee] ?? []) {
      const s = world.state.npcs[id]
      if (!s || s.dead || s.following) continue
      // A flight in a plan with steps has no end of its own: its return step decides (M8.1).
      const end = until ?? world.now + e.days * DAY
      if (tierOf(world, id) === 'full') {
        // Near the player: they pack up and really walk away.
        s.stayAt = { where: e.to, until: end }
        s.plan = []
        s.planGoal = undefined
        s.busyUntil = world.now
        s.activity = 'packing up to flee'
        world.emit('flee', s.location, world.say(`{name} snatches up what {they} can carry and makes for ${world.location(e.to).name}.`, id), id)
      } else {
        goAway(world, id, e.to, (end - world.now) / DAY)
        if (s.note) {
          s.note.unrest = 'fleeing'
          s.note.activity = `fled to ${world.location(e.to).name}`
        }
      }
    }
  } else if ('close_route' in e) setRoute(world, e.close_route, true, e.why)
  else if ('open_route' in e) setRoute(world, e.open_route, false)
  else if ('close' in e) {
    ;(world.state.closed ??= {})[routeKey(e.close[0], e.close[1])] = e.reason
  } else if ('open' in e) {
    delete world.state.closed?.[routeKey(e.open[0], e.open[1])]
  } else if ('market' in e) {
    ;(world.state.market ??= {})[e.market] = e.factor
    for (const location of world.content.locations.values()) {
      for (const service of location.services) {
        const stock = world.stock(location.id, service.id)
        if (stock[e.market]) stock[e.market] = Math.floor(stock[e.market]! * e.factor)
      }
    }
  } else if ('tension' in e) shiftTension(world, e.tension[0], e.tension[1], e.delta, e.why)
  else if ('news' in e) (world.state.areaNews ??= {})[e.area] = e.news
  else applyEffects(world, host, undefined, [e], out)
}

export function routeKey(a: string, b: string): string {
  return [a, b].sort().join('|')
}

/** Why an exit cannot be used now, if it cannot. */
export function closedBetween(world: World, a: string, b: string): string | undefined {
  return world.state.closed?.[routeKey(a, b)]
}

/** What a place looks like in its changed state, after its own description. */
export function placeStateLine(world: World, location: string): string | undefined {
  const state = world.state.places?.[location]?.state
  if (!state) return undefined
  return {
    normal: undefined,
    flooded: 'Brown water stands knee-deep here, cold and still. Whatever could float has floated away.',
    damaged: 'Things are broken here: a wall down, a door hanging, the smell of wet ash.',
    destroyed: 'There is not much left here but blackened beams and silence.',
    abandoned: 'Nobody is here. Doors stand open, and a dog sniffs at an empty step.',
    occupied: 'Soldiers have taken this place. They watch you come.',
    drained: 'The water is gone from here. The mud stinks and cracks in the wind.',
  }[state]
}

/** Who fled where, for the people still near the player. */
export function fled(world: World): string[] {
  return (world.state.plans ?? []).flatMap((p) => Object.values(p.groups).flat()).filter((id) => world.state.npcs[id]?.stayAt || world.state.npcs[id]?.note).map((id) => callName(world.npc(id)))
}

/** The claim that drove a plan: its signal's, for the conditions of a return. */
export type Cause = Claim
