import type { PlanState } from './quests/plans'
import type { Fact, Signal, Storyline } from './state'
import { lineStatus } from './storylines'
import type { World } from './world'

// The archive (M9.1; design: signalen en nasleep, "Later", review point 9).
// A game runs for hundreds of days, and what is over piles up in the save:
// plans that ended, signals long handled, facts that nobody knows any more.
// Once a day, what has been over for a month leaves the save for the game
// log, where it is kept for good: the save stays as small as after a month,
// and loading, saving and passing on news stay as quick. What anything still
// points to stays: a fact in lore, on a board or in someone's head; a
// storyline in lore or still told; a signal a running plan came from. A
// storyline that has taken nothing new for a month is over (it closes after
// two weeks), and goes with its facts when nobody knows them any more. A plan
// from the content keeps its record, so what may run once runs once.
//
// Since M10.2 archiving weighs where a line stands: only a closed line goes.
// An active or dormant line stays as its record (people, open questions,
// cause), while its old facts that nobody knows may go; the game log keeps
// them, and a lookup finds them there. What a line follows and what it came
// from stay with it: the arc keeps its beginning.

const DAY = 24 * 60
/** Over for this long, it goes to the archive. */
export const ARCHIVE_AFTER = 30 * DAY

/** What went to the archive in one go, as the game log keeps it. */
export interface Archived {
  facts: Fact[]
  lines?: Storyline[]
  plans: PlanState[]
  signals: Signal[]
}

/** Once a day, before dawn: what is over goes to the archive. Nothing when nothing is. */
export function archiveDay(world: World): Archived | undefined {
  const state = world.state
  const before = world.now - ARCHIVE_AFTER
  const plans = (state.plans ?? []).filter((p) => p.ended !== undefined && p.ended < before && p.source !== 'content')
  const planSet = new Set(plans)
  const keptPlans = (state.plans ?? []).filter((p) => !planSet.has(p))
  // A signal stays while a plan that is kept came from it.
  const fromPlans = new Set(keptPlans.flatMap((p) => (p.signal ? [p.signal] : [])))
  const log = state.signals?.log ?? []
  const signals = log.filter((s) => s.t < before && s.handled !== undefined && !fromPlans.has(s.id))
  const signalSet = new Set(signals)
  const keptSignals = log.filter((s) => !signalSet.has(s))
  // A fact stays while anyone knows it, or anything that stays points to it.
  const heard = state.news?.heard ?? {}
  const known = new Set(Object.values(heard).flatMap((h) => Object.keys(h)))
  const facts = state.news?.facts ?? []
  const byId = new Map(facts.map((f) => [f.id, f]))
  const old = facts.filter((f) => f.t < before && !known.has(f.id))
  const chronicle = state.chronicle
  // A storyline that is over, all its news old and told to the chronicler, and none of it known.
  const over = (l: Storyline) => lineStatus(l) === 'closed' && l.changed < before && l.facts.every((id) => !known.has(id) && (byId.get(id)?.t ?? 0) < before && ((byId.get(id)?.belang ?? 0) < 3 || l.reported.includes(id)))
  let lines = old.length ? (chronicle?.lines ?? []).filter(over) : []
  let pointed = new Set<string>()
  if (old.length) {
    const lineSet = new Set(lines)
    // The facts of a line that stays are its own business (below), not a reason to keep them all.
    const rest = { ...state, news: undefined, plans: keptPlans, signals: state.signals ? { ...state.signals, log: keptSignals } : undefined, chronicle: chronicle ? { ...chronicle, lines: chronicle.lines.filter((l) => !lineSet.has(l)).map(({ facts: _f, reported: _r, ...l }) => l) } : undefined }
    pointed = new Set(JSON.stringify(rest).match(/\b(?:fact|line)_\d+\b/g) ?? [])
    // A line in lore, a request or a waiting run stays, and so does what a kept line follows or came from (M10.2).
    lines = lines.filter((l) => !pointed.has(l.id))
    // An active line keeps its facts; a dormant one keeps its record, and its old facts nobody knows may go.
    for (const l of chronicle?.lines ?? []) if (!lines.includes(l) && lineStatus(l) === 'active') for (const id of l.facts) pointed.add(id)
  }
  const gone = old.filter((f) => !pointed.has(f.id))
  if (!plans.length && !signals.length && !gone.length && !lines.length) return undefined
  if (plans.length) state.plans = keptPlans
  if (signals.length) state.signals!.log = keptSignals
  if (lines.length) chronicle!.lines = chronicle!.lines.filter((l) => !lines.includes(l))
  if (gone.length) {
    const goneSet = new Set(gone)
    state.news!.facts = facts.filter((f) => !goneSet.has(f))
  }
  return { facts: gone, plans, signals, ...(lines.length ? { lines } : {}) }
}
