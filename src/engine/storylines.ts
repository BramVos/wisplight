import { minuteOfDay } from './clock'
import { questsOf } from './life'
import type { ChronicleRun, ChronicleState, Fact, Storyline } from './state'
import type { World } from './world'

// The chronicler's notebook of storylines (design: lore and world change, "Hoe
// de kroniekschrijver de wereld ziet"). The motor groups facts that belong
// together: the same people, the same pattern at the same place. It decides
// when the chronicler writes: at 04:00 when there is news of belang 3 or more,
// and at once for belang 4 or 5 or the death of someone with a quest role.

const DAY = 24 * 60
const OPEN_DAYS = 14
/** Everyday noise that tells no story. */
const QUIET = new Set(['stranger', 'gift'])

export function chronicleState(world: World): ChronicleState {
  return (world.state.chronicle ??= { seq: 0, lines: [], lore: [], news: {}, pending: [], runs: 0 })
}

export function lineOf(world: World, factId: string): Storyline | undefined {
  return world.state.chronicle?.lines.find((l) => l.facts.includes(factId))
}

/** Every new fact goes on a storyline; big news asks the chronicler to write at once. */
export function onFact(world: World, fact: Fact): void {
  if (QUIET.has(fact.kind) || fact.belang < 1) return
  const state = chronicleState(world)
  for (const line of state.lines) if (line.open && world.now - line.changed > OPEN_DAYS * DAY) line.open = false
  const people = fact.about.filter((id) => world.content.npcs.has(id))
  const places = [...new Set([fact.place, ...fact.about.filter((id) => world.content.locations.has(id))])]
  const pattern = fact.pattern ?? fact.kind
  const line = state.lines
    .filter((l) => l.open)
    .sort((a, b) => b.changed - a.changed || a.id.localeCompare(b.id))
    .find((l) => people.some((p) => l.people.includes(p)) || (l.pattern === pattern && l.places.includes(fact.place) && world.now - l.changed < DAY))
  let target: Storyline
  if (line) {
    // A line is called after the biggest thing that happened on it.
    const biggest = Math.max(0, ...line.facts.map((id) => world.state.news?.facts.find((f) => f.id === id)?.belang ?? 0))
    if (fact.belang > biggest) line.title = fact.title
    line.facts.push(fact.id)
    line.people = [...new Set([...line.people, ...people])]
    line.places = [...new Set([...line.places, ...places])]
    line.changed = world.now
    target = line
  } else {
    target = { id: `line_${++state.seq}`, title: fact.title, pattern, facts: [fact.id], people, places, summary: [], roles: [], hooks: [], next: '', open: true, changed: world.now, reported: [] }
    state.lines.push(target)
  }
  // The death of someone with a quest role ends or changes that quest: the chronicler writes now.
  const questDeath = fact.kind === 'death' && people.some((p) => questsOf(world, p).length > 0)
  if (fact.belang >= 4 || questDeath) requestRun(world, 'urgent', [target.id])
}

/** Asks the chronicler to write about these lines, unless a waiting run already covers them. */
export function requestRun(world: World, reason: ChronicleRun['reason'], lines: string[]): ChronicleRun | undefined {
  const state = chronicleState(world)
  const waiting = new Set(state.pending.flatMap((r) => r.lines))
  const fresh = lines.filter((l) => !waiting.has(l))
  if (fresh.length === 0) return undefined
  const run: ChronicleRun = { id: `run_${++state.seq}`, t: world.now, reason, lines: fresh }
  state.pending.push(run)
  return run
}

/** The facts on a line the chronicler has not seen yet. */
export function unreported(world: World, line: Storyline): Fact[] {
  const facts = world.state.news?.facts ?? []
  return line.facts.filter((id) => !line.reported.includes(id)).map((id) => facts.find((f) => f.id === id)!).filter(Boolean)
}

/** At 04:00: every storyline with unseen news of belang 3 or more goes to the chronicler in one run. */
export function nightly(world: World): void {
  if (minuteOfDay(world.now) !== 4 * 60) return
  const state = world.state.chronicle
  if (!state) return
  const lines = state.lines.filter((l) => unreported(world, l).some((f) => f.belang >= 3)).map((l) => l.id)
  if (lines.length) requestRun(world, 'night', lines)
}
