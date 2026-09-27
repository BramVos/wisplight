import { z } from 'zod'
import type { Output } from '../commands'
import { callName } from '../content'
import { goAway, tierOf } from '../lod'
import { shiftTension } from '../social/realms'
import type { World } from '../world'
import { applyEffects, type QuestHost } from './engine'
import { QuestEffectSchema } from './schema'

// Big events (design: lore and world change, "Grote gebeurtenissen"): an
// effect plan in phases, from a fixed vocabulary the system can check and
// carry out. Near the player everything happens in detail: people pack up and
// really walk away. Far off they become notes. Quests react to the state of
// the world that follows, not to text.

const PlanEffectSchema = z.union([
  QuestEffectSchema,
  /** A group flees: those near the player walk, the others become notes on the road. */
  z.object({ flee: z.string(), to: z.string(), days: z.number().int().positive() }).strict(),
  /** A route closes: an exit that cannot be used, with a reason. */
  z.object({ close: z.tuple([z.string(), z.string()]), reason: z.string() }).strict(),
  z.object({ open: z.tuple([z.string(), z.string()]) }).strict(),
  /** Scarcity: stock of a thing drops, and what comes in is a share of what came before. */
  z.object({ market: z.string(), factor: z.number().min(0).max(3) }).strict(),
  z.object({ tension: z.tuple([z.string(), z.string()]), delta: z.number().int(), why: z.string() }).strict(),
  z.object({ news: z.string(), area: z.string() }).strict(),
])
export type PlanEffect = z.infer<typeof PlanEffectSchema>

export const PlanSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    /** The groups by area: everyone who lives there, alive and not travelling with the player. */
    groups: z.record(z.string(), z.object({ areas: z.array(z.string()).default([]), npcs: z.array(z.string()).default([]), except: z.array(z.string()).default([]) }).strict()).default({}),
    phases: z.array(z.object({ after: z.number().int().min(0), effects: z.array(PlanEffectSchema) }).strict()).min(1),
    /** At most this many effects in all (design: a plan has a maximum). */
    max_effects: z.number().int().positive().default(30),
  })
  .strict()
export type Plan = z.infer<typeof PlanSchema>

export interface PlanState {
  plan: string
  started: number
  phase: number
  cause: string
  groups: Record<string, string[]>
}

/** A fixed plan of the content, or one the chronicler wrote for this game. */
export function planOf(world: World, id: string): Plan | undefined {
  return world.content.plans.get(id) ?? world.state.dynamicPlans?.[id]
}

export function startPlan(world: World, host: QuestHost, planId: string, cause: string): Output[] {
  const plan = planOf(world, planId)
  if (!plan) return []
  const plans = (world.state.plans ??= [])
  if (plans.some((p) => p.plan === planId && p.phase < plan.phases.length)) return []
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
  plans.push({ plan: planId, started: world.now, phase: 0, cause, groups })
  return plansDue(world, host)
}

/** Runs the phases whose hour has come. */
export function plansDue(world: World, host: QuestHost): Output[] {
  const out: Output[] = []
  for (const p of world.state.plans ?? []) {
    const plan = planOf(world, p.plan)
    if (!plan) continue
    while (p.phase < plan.phases.length && world.now >= p.started + plan.phases[p.phase]!.after * 60) {
      for (const e of plan.phases[p.phase]!.effects.slice(0, plan.max_effects)) runEffect(world, host, p, e, out)
      p.phase++
    }
  }
  // Wars that broke out by the rules of statecraft have their plans waiting.
  for (const id of (world.state.pendingPlans ?? []).splice(0)) out.push(...startPlan(world, host, id, 'war'))
  return out
}

function runEffect(world: World, host: QuestHost, p: PlanState, e: PlanEffect, out: Output[]): void {
  if ('flee' in e) {
    for (const id of p.groups[e.flee] ?? []) {
      const s = world.state.npcs[id]
      if (!s || s.dead || s.following) continue
      if (tierOf(world, id) === 'full') {
        // Near the player: they pack up and really walk away.
        s.stayAt = { where: e.to, until: world.now + e.days * 24 * 60 }
        s.plan = []
        s.planGoal = undefined
        s.busyUntil = world.now
        s.activity = 'packing up to flee'
        world.emit('flee', s.location, world.say(`{name} snatches up what {they} can carry and makes for ${world.location(e.to).name}.`, id), id)
      } else {
        goAway(world, id, e.to, e.days)
        if (s.note) {
          s.note.unrest = 'fleeing'
          s.note.activity = `fled to ${world.location(e.to).name}`
        }
      }
    }
  } else if ('close' in e) {
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
