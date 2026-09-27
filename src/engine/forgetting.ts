import { callName } from './content'
import { tieTo } from './people'
import { queueSignal } from './signals'
import type { World } from './world'

// Forgetting and recognising (M8.2; design: signalen en nasleep, "Vergeten
// en herkennen"). Familiarity sinks slowly when people do not see each other,
// faster without a tie: someone known becomes someone vaguely known, and then
// a memory. A memory is small and stays: who, and one line. When someone
// comes back after a long time, the rules work out whether they are known
// again: what is left of the familiarity, how strong the memory is. Known
// again is a signal, with the memory as its context. The player's old
// stranger (M7.2) is remembered the same way.

const DAY = 24 * 60
const WEEK = 7 * DAY
/** Below this, someone is only a memory. */
const MEMORY = 10
/** Apart this long, meeting again is a meeting after a long absence. */
const LONG = 60 * DAY

/** Once a week: familiarity sinks between people who did not see each other that week. */
export function forgetWeek(world: World): void {
  for (const [a, row] of Object.entries(world.state.bonds ?? {}).sort((x, y) => x[0].localeCompare(y[0]))) {
    const self = world.state.npcs[a]
    if (!self || self.dead) continue
    for (const [b, bond] of Object.entries(row).sort((x, y) => x[0].localeCompare(y[0]))) {
      if (!world.state.npcs[b] || bond.familiarity <= 0) continue
      const last = self.sightings?.[b]?.t ?? 0
      if (world.now - last < WEEK) continue
      const before = bond.familiarity
      bond.familiarity = Math.max(0, before - (tieTo(world, a, b) ? 1 : 3))
      // Someone known becomes a memory: one line, kept.
      if (before >= MEMORY && bond.familiarity < MEMORY && !(self.memory ?? []).some((m) => m.topics.includes(b))) memoryOf(world, a, b)
    }
  }
  // The player too, but slowly, and only after four weeks away.
  for (const [npcId, rel] of Object.entries(world.state.relations ?? {})) {
    const last = world.state.npcs[npcId]?.sightings?.['player']?.t ?? world.now
    if (world.now - last >= 4 * WEEK && rel.familiarity > 0) rel.familiarity = Math.max(0, rel.familiarity - 1)
  }
}

/** The line someone keeps of another: what they were to them, or what they last heard of them together. */
function memoryOf(world: World, a: string, b: string): void {
  const tie = tieTo(world, a, b)
  const heard = world.state.news?.heard[a] ?? {}
  const shared = [...(world.state.news?.facts ?? [])].reverse().find((f) => heard[f.id] && f.about.includes(b))
  const from = world.content.areas.get(world.location(world.npc(b).home).area)?.name
  const line = shared ? shared.title : tie ? `${callName(world.npc(b))}, ${tie.role === 'acquaintance' ? 'someone you knew' : `your ${tie.role}`}` : `${callName(world.npc(b))} from ${from ?? 'somewhere'}`
  const bond = world.state.bonds?.[a]?.[b]
  const memory = (world.state.npcs[a]!.memory ??= [])
  memory.push({ t: world.now, note: `You remember ${callName(world.npc(b))}: ${line}.`, topics: [b], valence: bond && bond.affinity >= 25 ? 1 : bond && bond.affinity <= -25 ? -1 : 0 })
  if (memory.length > 40) memory.splice(0, memory.length - 40)
}

/**
 * Two people meet again after a long time apart. Known again when what is
 * left of the familiarity and the strength of the memory are enough; then a
 * signal, and the aftermath has them spoken to.
 */
export function metAgain(world: World, a: string, b: string): void {
  if (!world.content.npcs.has(a) || !world.content.npcs.has(b) || world.npc(a).child) return
  const bond = world.state.bonds?.[a]?.[b]
  const memory = (world.state.npcs[a]!.memory ?? []).some((m) => m.topics.includes(b))
  const tie = tieTo(world, a, b)
  const score = (bond?.familiarity ?? 0) + (memory ? 15 + Math.max(0, tie?.bond ?? 0) * 5 : 0) + Math.round((world.rng.next('forgetting') - 0.5) * 20)
  if (score < 25) return
  queueSignal(world, { kind: 'recognised', who: [a, b], place: world.state.npcs[a]!.location, cause: [], belang: 1, watcher: 'rules' })
}

/** Whether this is a meeting after a long absence. */
export function longApart(world: World, last: number | undefined): boolean {
  return last !== undefined && world.now - last >= LONG
}

