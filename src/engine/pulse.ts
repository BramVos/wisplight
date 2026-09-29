import { minuteOfDay } from './clock'
import { HOOK_KINDS } from './quests/planschema'
import { knob } from './knobs'
import { queueSignal } from './signals'
import type { ChronicleRun } from './state'
import { chronicleState, requestRun } from './storylines'
import type { World } from './world'

// The pulse (M10.24; Bram, 28 September 2026: the frames once, and then the
// world comes to you). Everything before made something only when the
// stranger caused it; the pulse is the other side: the world looks the
// stranger up, also when they do not travel. At least one hook near them
// every so many days (the world's knob story.hooks_per_week, two by
// default): a request, a visitor, a tiding, a gesture, a letter; never two
// of the same kind in a row. With a model the night round is asked for one,
// from the open storylines near the stranger; when it brings none, or there
// is no model or budget, the rule does it with the content's own pulse
// watchers (a pedlar, a storm, an errand): smaller, but never silent.

export { HOOK_KINDS }
export type HookKind = (typeof HOOK_KINDS)[number]

const DAY = 24 * 60

export interface PulseState {
  /** Since when the pulse counts: the first night it looked. */
  since: number
  /** Hooks the pulse itself brought, and how; for the rule's, by which watcher. */
  fired: { t: number; kind: HookKind; how: 'chronicler' | 'rule'; watcher?: string }[]
  /** When it asked the night round for a hook, until one came or the rule did it. */
  asked?: number
  /** When the stranger last did something: someone waiting out a month is not playing, and is not looked up. */
  acted?: number
}

function pulseState(world: World): PulseState {
  return (world.state.pulse ??= { since: world.now, fired: [] })
}

/** The stranger is in the game and does something (a game begun, a command given): the pulse looks them up while they play. */
export function wakePulse(world: World): void {
  pulseState(world).acted = world.now
}

/** The area the stranger is in, or undefined out in the open (a hex has no people to bring anything). */
function areaHere(world: World): string | undefined {
  return world.content.locations.get(world.state.player.location)?.area
}

/** The hooks that reached the stranger near where they are, since a moment, oldest first. */
export function hooksSince(world: World, since: number): { t: number; kind: HookKind }[] {
  const area = areaHere(world)
  const inArea = (location: string | undefined) => Boolean(area && location && world.content.locations.get(location)?.area === area)
  const near = (npc: string) => world.content.npcs.has(npc) && (inArea(world.npc(npc).home) || inArea(world.state.npcs[npc]?.location))
  const out: { t: number; kind: HookKind }[] = []
  for (const r of world.state.requests) if (r.created >= since && near(r.npc)) out.push({ t: r.created, kind: 'request' })
  for (const f of world.state.news?.facts ?? []) if (f.t >= since && f.belang >= 2 && inArea(f.place)) out.push({ t: f.t, kind: 'tiding' })
  for (const sk of world.state.lore?.people ?? []) for (const l of sk.letters ?? []) if (l.t >= since) out.push({ t: l.t, kind: 'letter' })
  const gesture = world.state.player.gestures?.at
  if (gesture && gesture.t >= since) out.push({ t: gesture.t, kind: 'gesture' })
  // What a night brought in think mode counts from when it came (M10.24).
  for (const h of world.state.modes?.hooks ?? []) if (h.t >= since) out.push({ t: h.t, kind: h.quest ? 'request' : 'letter' })
  for (const p of world.state.pulse?.fired ?? []) if (p.t >= since) out.push({ t: p.t, kind: p.kind })
  return out.sort((a, b) => a.t - b.t)
}

/** How long the stranger may go without a hook: a week over the knob. */
function every(world: World): number {
  const per = knob(world, 'story.hooks_per_week')
  return per > 0 ? (7 / per) * DAY : Infinity
}

/**
 * Each night at four, with the night round: when the stranger has had
 * nothing near them for too long, the pulse asks the chronicler, or, when it
 * cannot or brought nothing the night before, the rule brings a hook.
 */
export function pulseDay(world: World): void {
  if (minuteOfDay(world.now) !== 4 * 60) return
  const gap = every(world)
  // A world that only runs, with no stranger playing in it, is not looked up.
  const p = world.state.pulse
  if (!p || !Number.isFinite(gap)) return
  // The world comes to the stranger while they play, not while they wait out the days (found in the playtest: a
  // month's WAIT brought the same weather three times, and a visitor who came and went all night).
  if (world.now - (p.acted ?? p.since) > 2 * DAY) return
  const last = hooksSince(world, world.now - 14 * DAY).at(-1)
  if (world.now - Math.max(p.since, last?.t ?? 0) < gap) {
    p.asked = undefined
    return
  }
  if (!areaHere(world)) return
  if (world.aiLive && p.asked === undefined && askNight(world, last?.kind)) {
    p.asked = world.now
    return
  }
  p.asked = undefined
  rulePulse(world, last?.kind)
}

/**
 * Asks the night round for a hook near the stranger (M10.24): up to two open
 * storylines with people or places near them, else the latest open one. False
 * when there is none to bring it from.
 */
function askNight(world: World, avoid: HookKind | undefined): boolean {
  const area = areaHere(world)!
  const open = chronicleState(world).lines.filter((l) => l.open)
  const near = open.filter((l) => l.places.some((pl) => world.content.locations.get(pl)?.area === area) || l.people.some((n) => world.content.npcs.has(n) && world.content.locations.get(world.npc(n).home)?.area === area))
  const lines = (near.length ? near : open.slice(-1)).slice(-2).map((l) => l.id)
  if (!lines.length) return false
  const run = requestRun(world, 'night', lines)
  if (!run) return false
  run.pulse = { area, ...(avoid ? { avoid } : {}) }
  return true
}

/** The words the night round gets for a pulse run. */
export function pulseText(world: World, pulse: NonNullable<ChronicleRun['pulse']>): string {
  const area = world.content.areas.get(pulse.area)?.name ?? pulse.area
  const kinds: Record<HookKind, string> = { request: 'a request', visitor: 'a visitor', tiding: 'news', gesture: 'a gesture', letter: 'a letter', place: 'a place named' }
  return `The stranger is in ${area} and nothing new has come their way for days. From one of these storylines, bring one thing near them: a request by someone of ${area}, a letter, or news for ${area}.${pulse.avoid ? ` Not ${kinds[pulse.avoid as HookKind] ?? pulse.avoid} this time.` : ''} Only what the storyline allows; never a death.`
}

/**
 * The rule's hook (M10.24): one of the content's pulse watchers, of another
 * kind than the last hook, set off where the stranger is, with someone near
 * them as $a. A world without pulse watchers stays as it is.
 */
export function rulePulse(world: World, avoid?: HookKind): boolean {
  const watchers = [...world.content.watchers.values()].filter((w) => w.probe && 'pulse' in w.probe).sort((a, b) => a.id.localeCompare(b.id))
  const kindOf = (w: (typeof watchers)[number]) => (w.probe as { pulse: HookKind }).pulse
  const others = watchers.filter((w) => kindOf(w) !== avoid)
  const list = others.length ? others : watchers
  // The one whose turn it has longest not been, so a small world does not bring the same visitor twice running
  // (found with the frames' "often" on Skerrow: ten pulses in three weeks from three watchers).
  const last = (id: string) => Math.max(-1, ...(world.state.pulse?.fired ?? []).filter((f) => f.watcher === id).map((f) => f.t))
  const oldest = Math.min(...list.map((w) => last(w.id)))
  const due = list.filter((w) => last(w.id) === oldest)
  const watcher = due.length ? due[world.rng.int('pulse', 0, due.length - 1)] : undefined
  if (!watcher) return false
  const here = world.state.player.location
  const area = areaHere(world)
  const people = Object.keys(world.state.npcs)
    .sort()
    .filter((id) => {
      if (!world.content.npcs.has(id) || !world.alive(id)) return false
      const npc = world.npc(id)
      const s = world.state.npcs[id]!
      return !npc.child && !npc.creature && s.activity !== 'asleep' && !s.absent && world.content.locations.get(s.location)?.area === area
    })
  const atHand = people.filter((id) => world.state.npcs[id]!.location === here)
  const pool = atHand.length ? atHand : people
  const who = pool.length ? pool[world.rng.int('pulse', 0, pool.length - 1)]! : undefined
  queueSignal(world, { kind: watcher.signal, ...(watcher.event ? { event: watcher.event } : {}), who: who ? [who] : [], place: here, cause: [], belang: watcher.belang ?? 1, watcher: watcher.id })
  pulseState(world).fired.push({ t: world.now, kind: kindOf(watcher), how: 'rule', watcher: watcher.id })
  if (pulseState(world).fired.length > 20) pulseState(world).fired.splice(0, pulseState(world).fired.length - 20)
  return true
}
