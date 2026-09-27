import type { Output } from './commands'
import { startAftermath } from './aftermath'
import { allHold, type QuestHost } from './quests/engine'
import type { Watcher } from './quests/planschema'
import type { Fact, Signal, SignalState } from './state'
import type { World } from './world'

// Signals (M8.1; design: signalen en nasleep, "Signalen"). A watcher in the
// content says when a change in the world is a signal: a new fact with a
// claim (a wedding, peace, a place open again), conditions that come true
// (in the language of quest conditions), or a state the system works out (a
// house nobody lives in). Signals are data, merged per subject per hour, and
// go to the cheapest handler that can take them: in M8.1 the standard
// aftermath of the content. Watchers of facts see them at once; the others
// look on the hour. What they start runs where the effect plans run.

const DAY = 24 * 60
const KEEP = 200

export function signalState(world: World): SignalState {
  return (world.state.signals ??= { seq: 0, queue: [], log: [], seen: {} })
}

/** Puts a signal in the queue, or adds its cause to one about the same people in the same hour. */
export function queueSignal(world: World, input: Omit<Signal, 'id' | 't' | 'scope'> & { scope?: Signal['scope'] }): Signal {
  const state = signalState(world)
  const hour = Math.floor(world.now / 60)
  const same = (s: Signal) => s.kind === input.kind && s.event === input.event && Math.floor(s.t / 60) === hour && [...s.who].sort().join() === [...input.who].sort().join() && s.place === input.place
  const twin = state.queue.find(same) ?? state.log.find(same)
  if (twin) {
    twin.cause = [...new Set([...twin.cause, ...input.cause])]
    return twin
  }
  const signal: Signal = { ...input, id: `sig_${++state.seq}`, t: world.now, scope: input.scope ?? scopeOf(world, input.who) }
  state.queue.push(signal)
  return signal
}

/** One person, one household, or more. */
function scopeOf(world: World, who: string[]): Signal['scope'] {
  const people = who.filter((id) => id === 'player' || world.content.npcs.has(id))
  if (people.length <= 1) return 'person'
  const houses = new Set(people.map((id) => (id === 'player' ? world.state.player.home : (world.npc(id).household ?? world.npc(id).home))))
  return houses.size === 1 || people.includes('player') ? 'household' : 'many'
}

/** A new fact: every watcher of facts that it fits gives its signal. */
export function watchFact(world: World, fact: Fact): void {
  for (const w of watchers(world)) {
    const f = w.fact
    if (!f) continue
    if (f.key && fact.claim?.key !== f.key) continue
    if (f.value !== undefined && !(Array.isArray(f.value) ? f.value : [f.value]).includes(fact.claim?.value ?? '')) continue
    if (f.not !== undefined && (Array.isArray(f.not) ? f.not : [f.not]).includes(fact.claim?.value ?? '')) continue
    if (f.kind && fact.kind !== f.kind && !fact.kind.startsWith(`${f.kind}:`)) continue
    if (!f.key && !f.kind) continue
    const people = (id: string | undefined) => (id && (id === 'player' || world.content.npcs.has(id)) ? [id] : [])
    const bound = (sel: string): string[] => {
      if (sel === '$subject') return people(fact.claim?.subject)
      if (sel === '$value') return people(fact.claim?.value)
      if (sel === '$about') return fact.about.flatMap(people)
      return people(sel)
    }
    const who = w.who ? w.who.flatMap(bound) : [...people(fact.claim?.subject), ...people(fact.claim?.value)]
    const place = w.place && w.place !== '$place' ? w.place : fact.place
    queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who: [...new Set(who)], place, cause: [fact.id], belang: w.belang ?? fact.belang, ...(fact.claim ? { claim: fact.claim } : {}), watcher: w.id })
  }
}

/** On the hour: conditions that came true, and the states the system works out. */
export function watchHour(world: World): void {
  const seen = signalState(world).seen
  for (const w of watchers(world)) {
    if (w.when) {
      const now = allHold(world, w.when)
      const before = seen[w.id]
      seen[w.id] = now
      if (now && before === false) queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who: w.who ?? [], place: w.place ?? world.state.player.location, cause: [], belang: w.belang ?? 1, watcher: w.id })
    } else if (w.probe?.house_empty !== undefined) emptyHouses(world, w, w.probe.house_empty)
  }
}

/** What the watchers see at the start of a game (or of an old save): only what changes after that is a signal. */
export function primeWatchers(world: World): void {
  const seen = signalState(world).seen
  for (const w of watchers(world)) if (w.when) seen[w.id] = allHold(world, w.when)
}

/**
 * A house nobody lives in any more: the home of someone in the content, and
 * now nobody's home (the dead do not count, the absent still do). After so
 * many days it is a free house, and a signal once.
 */
function emptyHouses(world: World, w: Watcher, days: number): void {
  const state = signalState(world)
  const layer = (world.state.layer ??= {})
  const houses = new Set([...world.content.npcs.values()].map((n) => n.home))
  const lived = new Set<string>()
  for (const [id, s] of Object.entries(world.state.npcs)) if (!s.dead && world.content.npcs.has(id)) lived.add(world.npc(id).home)
  if (world.state.player.home) lived.add(world.state.player.home)
  for (const house of [...houses].sort()) {
    const key = `${w.id}:${house}`
    if (lived.has(house)) {
      if (layer.empty?.[house] !== undefined) delete layer.empty[house]
      state.seen[key] = false
      continue
    }
    const since = ((layer.empty ??= {})[house] ??= world.now)
    if (world.now - since >= days * DAY && state.seen[key] !== true) {
      state.seen[key] = true
      queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who: [], place: house, cause: [], belang: w.belang ?? 1, watcher: w.id })
    }
  }
}

/** The signals in the queue go to their handler: the standard aftermath (M8.1). */
export function processSignals(world: World, host: QuestHost): Output[] {
  const state = world.state.signals
  if (!state?.queue.length) return []
  const out: Output[] = []
  for (let round = 0; round < 5 && state.queue.length; round++) {
    for (const signal of state.queue.splice(0)) {
      out.push(...startAftermath(world, host, signal))
      state.log.push(signal)
    }
  }
  if (state.log.length > KEEP) state.log.splice(0, state.log.length - KEEP)
  return out
}

function watchers(world: World): Watcher[] {
  return [...world.content.watchers.values()].sort((a, b) => a.id.localeCompare(b.id))
}
