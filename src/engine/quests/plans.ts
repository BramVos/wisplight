import { setRoute } from '../economy/ledger'
import { isRestDay } from '../clock'
import type { Output } from '../commands'
import { callName } from '../content'
import { goAway, tierOf } from '../lod'
import { shiftTension } from '../social/realms'
import type { Claim } from '../state'
import type { World } from '../world'
import { recordFact } from '../news'
import { applyEffects, holds, type QuestHost } from './engine'
import { PlanSchema, type MoodKind, type Plan, type PlanEffect, type Step } from './planschema'
import type { PlaceStateName } from './schema'
import { bindValue, runVerb, verbGuard, type PlanContext } from '../aftermath'

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

/** The facts a plan comes from (M9.2): its cause, its signal's causes, the newest fact of its storyline. */
export function planCauses(world: World, p: PlanState): string[] {
  const out: string[] = []
  if (p.cause.startsWith('fact_')) out.push(p.cause)
  const signal = p.signal ? (world.state.signals?.log.find((s) => s.id === p.signal) ?? world.state.signals?.queue.find((s) => s.id === p.signal)) : undefined
  for (const c of signal?.cause ?? []) if (c.startsWith('fact_')) out.push(c)
  const line = p.line ? world.state.chronicle?.lines.find((l) => l.id === p.line) : undefined
  if (line?.facts.length) out.push(line.facts.at(-1)!)
  return [...new Set(out)]
}

/** The plans of the world that run from the first day (world.yaml, M8.3): started once, in a new game or an old save. */
export function startWorldPlans(world: World, host: QuestHost): Output[] {
  return world.content.world.plans.filter((id) => !(world.state.plans ?? []).some((p) => p.plan === id)).flatMap((id) => startPlan(world, host, id, 'world'))
}

/** Runs the phases whose hour has come, and the steps that are due. */
export function plansDue(world: World, host: QuestHost): Output[] {
  const out: Output[] = []
  const before = world.causing
  for (const p of [...(world.state.plans ?? [])]) {
    const plan = planOf(world, p.plan)
    if (!plan || !planDue(world, p, plan)) continue
    // What happens now comes from what the plan came from (M9.2).
    world.causing = planCauses(world, p)
    while (p.phase < plan.phases.length && world.now >= p.started + plan.phases[p.phase]!.after * 60) {
      for (const e of plan.phases[p.phase]!.effects.slice(0, plan.max_effects)) runEffect(world, host, p, e, out)
      p.phase++
    }
    if (plan.steps.length && p.ended === undefined) runSteps(world, host, p, plan, out)
  }
  world.causing = before
  // Wars that broke out by the rules of statecraft, and plans of the chronicler, are waiting, with the fact they come from.
  for (const id of (world.state.pendingPlans ?? []).splice(0)) {
    const cause = world.state.pendingCauses?.[id]
    if (world.state.pendingCauses) delete world.state.pendingCauses[id]
    out.push(...startPlan(world, host, id, cause ?? (id.startsWith('chronicle_') ? 'chronicle' : 'war')))
  }
  return out
}

/**
 * Whether a plan has anything to do now (M9.3): a phase whose time has come,
 * or, while it runs, a step that is due or waits on a condition, or its end.
 * A plan whose next moment lies ahead is passed over without more work. It
 * reads the plan and changes nothing.
 */
function planDue(world: World, p: PlanState, plan: Plan): boolean {
  if (p.phase < plan.phases.length && world.now >= p.started + plan.phases[p.phase]!.after * 60) return true
  if (!plan.steps.length || p.ended !== undefined) return false
  if (p.expires !== undefined && world.now >= p.expires) return true
  // A plan whose steps are all settled ends on this pass.
  let open = false
  for (const step of plan.steps) {
    const st = p.steps?.[step.id]
    if (st?.done !== undefined || st?.skipped !== undefined) continue
    open = true
    if (st?.due !== undefined) {
      if (world.now >= st.due) return true
      continue
    }
    // Not yet worked out: the step after an unsettled one waits; others are looked at by runSteps.
    const before = step.after ? p.steps?.[step.after] : undefined
    if (!step.after || before?.done !== undefined || before?.skipped !== undefined) return true
  }
  return !open
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
  if (step.at?.rest_day) while (!isRestDay(t, world.calendar)) t += DAY
  st.due = t
  return t
}

type Result = 'done' | 'wait' | 'skip' | 'fail'

function runOne(world: World, host: QuestHost, p: PlanState, step: Step, st: StepState, bind: Record<string, string>, out: Output[]): Result {
  const ctx: PlanContext = { plan: p, bind, host, out }
  // The standard conditions of the verb hold for every maker (M9.2); content may leave them out on purpose, a model may not.
  const guarded = !step.unguarded || p.source === 'chronicler'
  const ok = step.when.every((c) => holds(world, bindValue(world, c, ctx), undefined)) && !(guarded && verbGuard(world, ctx, step.do))
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
    // The flight is news (M9.2), from what the plan came from: every step of a plan is a fact.
    const going = (p.groups[e.flee] ?? []).filter((id) => { const s = world.state.npcs[id]; return s && !s.dead && !s.following })
    if (going.length && world.content.locations.has(e.to)) {
      const from = world.content.areas.get(e.flee)?.name ?? e.flee
      const to = world.location(e.to).name
      recordFact(world, { kind: 'flight', about: going.slice(0, 5), place: e.to, belang: 3, title: `${from} fled to ${to}`, text: { precise: `${going.length} people of ${from} fled to ${to}.`, village: `Half of ${from} has come to ${to}, with what they could carry.`, far: `People are fleeing ${from}.` } })
    }
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
  else if ('news' in e) setAreaNews(world, e.area, e.news, out)
  else if ('mood' in e) setAreaMood(world, e.mood, e.kind, e.days, e.line, e.prompt)
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
/**
 * News of an area (M9.4): the player there hears it at once, and whoever comes
 * into the area later hears it once. Found in the playtest of the dyke: "the
 * water is in Veenhoek" was written down and never told.
 */
/**
 * The mood of an area (M10.11), a new kind of state for any event: panic,
 * grief, feast or threat for some days. The area of a place, or an area by
 * id; a newer mood takes the place of the old one.
 */
export function setAreaMood(world: World, where: string, kind: MoodKind, days: number, line: string, prompt?: string): boolean {
  const area = world.content.areas.has(where) ? where : world.content.locations.get(where)?.area
  if (!area) return false
  ;(world.state.moods ??= {})[area] = { kind, t: world.now, until: world.now + days * DAY, line, ...(prompt ? { prompt } : {}) }
  return true
}

/** The mood an area is in now, if any (M10.11). */
export function moodOf(world: World, area: string | undefined): { kind: MoodKind; line: string; prompt?: string } | undefined {
  const mood = area ? world.state.moods?.[area] : undefined
  return mood && mood.until > world.now ? mood : undefined
}

export function setAreaNews(world: World, area: string, news: string, out: Output[]): void {
  ;(world.state.areaNews ??= {})[area] = news
  tellAreaNews(world, out)
}

/** The news of the player's area, once. */
export function tellAreaNews(world: World, out: Output[]): void {
  const area = world.content.locations.get(world.state.player.location)?.area
  const news = area ? world.state.areaNews?.[area] : undefined
  if (!area || !news) return
  const told = (world.state.player.areaNewsTold ??= {})
  if (told[area] === news) return
  told[area] = news
  out.push({ kind: 'narration', text: news.charAt(0).toUpperCase() + news.slice(1) })
}

export function placeStateLine(world: World, location: string): string | undefined {
  const state = world.state.places?.[location]?.state
  const line = state ? stateLine(state) : undefined
  // Lasting marks (M10.7): a cairn with a name, a line on a wall.
  const marks = (world.state.marks?.[location] ?? []).filter((m) => m.until === undefined || m.until > world.now).map((m) => m.text)
  // The mood of the area (M10.11): people hurrying past with buckets.
  const mood = moodOf(world, world.content.locations.get(location)?.area)?.line
  const all = [line, ...marks, mood].filter((x): x is string => Boolean(x))
  return all.length ? all.join(' ') : undefined
}

function stateLine(state: PlaceStateName): string | undefined {
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

/**
 * What holds a step back now, in words, or undefined (M10.1, the dev menu):
 * the first condition that does not hold, or the verb's standard condition.
 * Reads only.
 */
export function stepHeld(world: World, p: PlanState, step: Step): string | undefined {
  const members = step.each ? (p.groups[step.each] ?? []).filter((m) => p.steps?.[step.id]?.members?.[m] === undefined) : [undefined]
  const who = members[0]
  const ctx = { plan: p, bind: { ...p.bind, ...(who ? { who } : {}) }, host: undefined as unknown as QuestHost, out: [] }
  const blocking = step.when.find((c) => !holds(world, bindValue(world, c, ctx), undefined))
  if (blocking) return `${who ? `${who}: ` : ''}${JSON.stringify(blocking)}`
  const guard = step.unguarded && p.source !== 'chronicler' ? undefined : verbGuard(world, ctx, step.do)
  return guard ? `${who ? `${who}: ` : ''}${guard}` : undefined
}
