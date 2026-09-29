import { knob } from './knobs'
import { minuteOfDay } from './clock'
import { questsOf } from './life'
import { factById } from './news'
import type { ChronicleRun, ChronicleState, Fact, Storyline } from './state'
import type { World } from './world'

// The chronicler's notebook of storylines (design: lore and world change, "Hoe
// de kroniekschrijver de wereld ziet"). The motor groups facts that belong
// together: the same pattern with the same people or at the same place, the
// same two people whatever happens between them next, or big news about
// someone a line is about. A busy person does not pull every small thing onto
// one line, and a full line starts a new one (M8.3).
// It decides when the chronicler writes: at 04:00 when there is news of
// belang 3 or more, and at once for belang 4 or 5 or the death of someone
// with a quest role.

const DAY = 24 * 60
/** A line takes no more facts than this; after it, the story goes on on a new line. */
const MAX_FACTS = 12
/** Everyday noise that tells no story. */
const QUIET = new Set(['stranger', 'gift'])

export function chronicleState(world: World): ChronicleState {
  return (world.state.chronicle ??= { seq: 0, lines: [], lore: [], news: {}, pending: [], runs: 0 })
}

/**
 * Which line a fact is on, as an index (M9.3). Lines and their facts are only
 * ever added to the same list (the archive makes a new one), so their count
 * says when the index is out of date.
 */
const lineIndex = new WeakMap<Storyline[], { facts: number; byFact: Map<string, Storyline> }>()

export function lineOf(world: World, factId: string): Storyline | undefined {
  const lines = world.state.chronicle?.lines
  if (!lines) return undefined
  const facts = lines.reduce((n, l) => n + l.facts.length, lines.length)
  let idx = lineIndex.get(lines)
  if (!idx || idx.facts !== facts) {
    const byFact = new Map<string, Storyline>()
    for (const l of lines) for (const id of l.facts) if (!byFact.has(id)) byFact.set(id, l)
    lineIndex.set(lines, (idx = { facts, byFact }))
  }
  return idx.byFact.get(factId)
}

/** Where a line stands (M10.2); a line from an old save gets it from what it has. */
export function lineStatus(line: Storyline): 'active' | 'dormant' | 'closed' {
  if (line.status) return line.status
  if (line.open) return 'active'
  return line.phase === 'closed' || line.hooks.length === 0 ? 'closed' : 'dormant'
}

/** Sets where a line stands, and keeps `open` (what older code reads) in step. */
export function setLineStatus(world: World, line: Storyline, status: 'active' | 'dormant' | 'closed'): void {
  line.status = status
  line.open = status === 'active'
  if (status === 'dormant') line.dormantSince ??= world.now
  else delete line.dormantSince
}

/**
 * Lines that took nothing new for two weeks (M10.2): dormant while a question
 * is still open, closed when none is. Never closed by time alone.
 */
export function settleLines(world: World): void {
  for (const line of world.state.chronicle?.lines ?? []) {
    if (lineStatus(line) !== 'active' || world.now - line.changed <= knob(world, 'storylines.open_days') * DAY) continue
    setLineStatus(world, line, line.hooks.length > 0 && line.phase !== 'closed' ? 'dormant' : 'closed')
  }
}

/**
 * What wakes a dormant line for one of its people (M10.2): a coming back, a
 * death or what is left behind, a home or a household or a tie that changes.
 * Not everything big: someone rising in the world is no reason to take up an
 * old quarrel.
 */
const WAKES = /^(death|wedding|return|arrival|inheritance|inherit|homecoming)$|:(return|inherit|move_home|join_household|leave_household|set_tie|end_tie|expect_home)$/

/**
 * A dormant line wakes (M10.2) when two of its people are in a new fact
 * together (they meet again, they quarrel again), or when a return, a death,
 * an inheritance or a change of home or tie comes to one of them. It wakes
 * with its cause and its open questions.
 */
function wakes(line: Storyline, fact: Fact, people: string[]): boolean {
  const shared = people.filter((p) => line.people.includes(p)).length
  return shared >= 2 || (shared >= 1 && WAKES.test(fact.kind))
}

/** Every new fact goes on a storyline; big news asks the chronicler to write at once. */
export function onFact(world: World, fact: Fact): void {
  if (QUIET.has(fact.kind) || fact.belang < 1) return
  const state = chronicleState(world)
  settleLines(world)
  const people = fact.about.filter((id) => world.content.npcs.has(id))
  const places = [...new Set([fact.place, ...fact.about.filter((id) => world.content.locations.has(id))])]
  const pattern = fact.pattern ?? fact.kind
  const shared = (l: Storyline) => people.filter((p) => l.people.includes(p)).length
  const fits = (l: Storyline) => (l.pattern === pattern && (shared(l) > 0 || (l.places.includes(fact.place) && world.now - l.changed < DAY))) || shared(l) >= (fact.belang >= 3 ? 1 : 2)
  const newest = (a: Storyline, b: Storyline) => b.changed - a.changed || a.id.localeCompare(b.id)
  const line = state.lines
    .filter((l) => l.open && l.facts.length < MAX_FACTS)
    .sort(newest)
    .find(fits)
  // Else a dormant line it wakes, the one asleep longest first: the old quarrel before the newer one.
  const sleeping = line
    ? undefined
    : state.lines
        .filter((l) => lineStatus(l) === 'dormant' && l.facts.length < MAX_FACTS && wakes(l, fact, people))
        .sort((a, b) => (a.dormantSince ?? a.changed) - (b.dormantSince ?? b.changed) || a.id.localeCompare(b.id))[0]
  if (sleeping) {
    setLineStatus(world, sleeping, 'active')
    ;(sleeping.resumed ??= []).push({ t: world.now, by: fact.id })
  }
  let target: Storyline
  const onto = line ?? sleeping
  if (onto) {
    const line = onto
    // A line is called after the biggest thing that happened on it.
    const biggest = Math.max(0, ...line.facts.map((id) => factById(world, id)?.belang ?? 0))
    if (fact.belang > biggest) line.title = fact.title
    line.facts.push(fact.id)
    line.people = [...new Set([...line.people, ...people])]
    line.places = [...new Set([...line.places, ...places])]
    line.changed = world.now
    target = line
  } else {
    // A full line goes on as a new one (M9.2), with its note, its open threads and its cause;
    // otherwise a new line follows the line of what caused this fact, so an arc stays one arc.
    const full = state.lines.filter((l) => l.open && l.facts.length >= MAX_FACTS).sort(newest).find(fits)
    const causeLine = full ? undefined : (fact.cause ?? []).map((id) => lineOf(world, id)).filter((l): l is Storyline => Boolean(l)).at(-1)
    target = {
      id: `line_${++state.seq}`,
      title: fact.title,
      pattern,
      facts: [fact.id],
      people: full ? [...new Set([...full.people, ...people])] : people,
      places: full ? [...new Set([...full.places, ...places])] : places,
      summary: full ? [...full.summary] : [],
      roles: full ? [...full.roles] : [],
      hooks: full ? [...full.hooks] : [],
      next: full?.next ?? '',
      open: true,
      status: 'active',
      changed: world.now,
      reported: [],
      ...(full ? { follows: full.id } : causeLine ? { follows: causeLine.id } : {}),
      ...((full?.cause ?? fact.cause)?.length ? { cause: [...(full?.cause ?? fact.cause)!] } : {}),
      ...(full?.phase && full.phase !== 'closed' ? { phase: full.phase } : {}),
    }
    // The full line goes on as this one: it is done, and this one carries its questions.
    if (full) setLineStatus(world, full, 'closed')
    state.lines.push(target)
  }
  // The death of someone with a quest role ends or changes that quest: the chronicler writes now.
  const questDeath = fact.kind === 'death' && people.some((p) => questsOf(world, p).length > 0)
  // From the knob (M10.24: a game may set it lower with the frames' dial), not a fixed 4.
  if (fact.belang >= knob(world, 'story.urgent_belang') || questDeath) urgentRun(world, questDeath ? Math.max(fact.belang, knob(world, 'story.urgent_belang')) : fact.belang, [target.id])
}

/**
 * A run that cannot wait for the night (M10.22, one cadence and one queue;
 * Bram: not ten times in quick succession): news from the world's knob
 * `story.urgent_belang` up (4 unless it says otherwise, a death in the
 * village), and at most one such run a game day. Anything else waits for the
 * night run, which takes every line with unseen news of belang 3 or more and
 * every waiting signal.
 */
export function urgentRun(world: World, belang: number, lines: string[], signals: string[] = []): ChronicleRun | undefined {
  const state = chronicleState(world)
  const day = Math.floor(world.now / (24 * 60))
  if (belang < knob(world, 'story.urgent_belang') || state.urgentDay === day) {
    if (signals.length) state.signals = [...new Set([...(state.signals ?? []), ...signals])]
    return undefined
  }
  state.urgentDay = day
  return requestRun(world, 'urgent', lines, signals)
}

/** Asks the chronicler to write about these lines, unless a waiting run already covers them. */
export function requestRun(world: World, reason: ChronicleRun['reason'], lines: string[], signals: string[] = []): ChronicleRun | undefined {
  const state = chronicleState(world)
  const waiting = new Set(state.pending.flatMap((r) => r.lines))
  const fresh = lines.filter((l) => !waiting.has(l))
  if (fresh.length === 0 && signals.length === 0) return undefined
  // One night run waits at a time (M10.22): a later night adds to it, so a round the host held back handles it all at once.
  const night = reason === 'night' ? state.pending.find((r) => r.reason === 'night') : undefined
  if (night) {
    night.lines.push(...fresh)
    if (signals.length) night.signals = [...new Set([...(night.signals ?? []), ...signals])]
    return night
  }
  const run: ChronicleRun = { id: `run_${++state.seq}`, t: world.now, reason, lines: fresh, ...(signals.length ? { signals } : {}) }
  state.pending.push(run)
  return run
}

/** The facts on a line the chronicler has not seen yet. */
export function unreported(world: World, line: Storyline): Fact[] {
  return line.facts.filter((id) => !line.reported.includes(id)).map((id) => factById(world, id)).filter((f): f is Fact => Boolean(f))
}

/** At 04:00: every storyline with unseen news of belang 3 or more goes to the chronicler in one run. */
export function nightly(world: World): void {
  if (minuteOfDay(world.now) !== 4 * 60) return
  const state = world.state.chronicle
  if (!state) return
  // Big news, and what the stranger improvised (M10.16): the chronicler decides whether anything comes of it.
  const lines = state.lines.filter((l) => unreported(world, l).some((f) => f.belang >= 3 || f.kind === 'improvised')).map((l) => l.id)
  // Signals that waited for the night (M8.3) go in the same run.
  const signals = (state.signals ?? []).splice(0)
  if (lines.length || signals.length) requestRun(world, 'night', lines, signals)
}

/** The areas of a line: where its places are. */
function areasOf(world: World, line: Storyline): string[] {
  return [...new Set(line.places.map((id) => world.content.locations.get(id)?.area).filter((a): a is string => Boolean(a)))]
}

/** Open lines on their way to a climax (M8.3): the pace of the world weighs them. */
export function risingLines(world: World): Storyline[] {
  return (world.state.chronicle?.lines ?? []).filter((l) => l.open && (l.phase === 'rising' || l.phase === 'crisis'))
}

/** Villages where two lines or more run towards a crisis: the story engine starts nothing new there (design: "Opbouw per verhaallijn"). */
export function tenseAreas(world: World): Set<string> {
  const count = new Map<string, number>()
  for (const line of risingLines(world)) for (const area of areasOf(world, line)) count.set(area, (count.get(area) ?? 0) + 1)
  return new Set([...count.entries()].filter(([, n]) => n >= 2).map(([area]) => area))
}
