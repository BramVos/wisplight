import { knob } from './knobs'
import { agreements } from './agreements'
import { callName } from './content'
import type { Output } from './commands'
import type { Gesture } from './belongSchema'
import type { World } from './world'

// Gestures (M10.13): the small, practical things a relationship does. A loaf
// put aside, a warning that someone leaves at first light, a question how
// something went. Content (gestures.yaml): who, when (the stranger arrives,
// trades with them, or leaves), what the two shared (only from the register
// and memory, never from liking alone), and what they do. Sparing: one a
// person a day, one a place a visit, and one the stranger had twice gives way
// to another.

const DAY = 24 * 60

type Moment = Gesture['at']

/** What the two shared that the gesture rests on, with what it was, or undefined. */
function shared(world: World, g: Gesture): { what: string } | undefined {
  const s = g.shared
  if ('kept' in s) {
    const a = agreements(world).find((x) => x.status === 'kept' && ((x.by === g.who && x.to === 'player') || (x.by === 'player' && x.to === g.who)) && (s.kept === 'any' || x.kind === s.kept))
    return a ? { what: a.what } : undefined
  }
  if ('memory' in s) {
    const m = (world.state.npcs[g.who]?.memory ?? []).find((r) => r.topics.includes(s.memory))
    return m ? { what: m.note } : undefined
  }
  if ('fact' in s) {
    const heard = world.state.news?.heard[g.who] ?? {}
    const f = (world.state.news?.facts ?? []).find((x) => x.kind === s.fact && x.about.includes('player') && heard[x.id])
    return f ? { what: f.title } : undefined
  }
  const lodging = world.content.lodgings.get(s.lodger)
  if (!lodging || world.state.player.lodgingId !== s.lodger || world.now >= (world.state.player.lodging?.until ?? 0)) return undefined
  const last = world.state.player.visits?.[lodging.at]?.t
  return last !== undefined && world.now - last >= s.away * DAY ? { what: lodging.name } : undefined
}

const fill = (text: string, values: Record<string, string>) => text.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole)

/**
 * The gestures of this moment, among the people here (for a departure: the
 * people where the stranger was). One at most at a time.
 */
export function gestures(world: World, at: Moment, present: string[]): Output[] {
  const state = (world.state.player.gestures ??= { given: {}, days: {} })
  const here = at === 'leave' ? '' : world.state.player.location
  // One a place a visit: not again at the place of the last one until the stranger was away.
  if (at !== 'leave' && state.at?.location === here && world.now - state.at.t < DAY) return []
  const today = Math.floor(world.now / DAY)
  const fits = [...world.content.gestures.values()]
    .filter((g) => g.at === at && present.includes(g.who) && world.alive(g.who) && state.days[g.who] !== today)
    .map((g) => ({ g, s: shared(world, g) }))
    .filter((x): x is { g: Gesture; s: { what: string } } => Boolean(x.s))
    // One the stranger had twice gives way to another.
    .sort((a, b) => Number((state.given[a.g.id] ?? 0) >= knob(world, 'gestures.at_most')) - Number((state.given[b.g.id] ?? 0) >= knob(world, 'gestures.at_most')) || (state.given[a.g.id] ?? 0) - (state.given[b.g.id] ?? 0) || a.g.id.localeCompare(b.g.id))
  const pick = fits.find((x) => (state.given[x.g.id] ?? 0) < knob(world, 'gestures.at_most')) ?? undefined
  if (!pick) return []
  const { g, s } = pick
  state.given[g.id] = (state.given[g.id] ?? 0) + 1
  state.days[g.who] = today
  if (at !== 'leave') state.at = { location: here, t: world.now }
  const name = callName(world.npc(g.who))
  const values = { name, what: s.what }
  if ('give' in g.do) {
    if (world.content.items.has(g.do.give)) world.state.player.inventory[g.do.give] = (world.state.player.inventory[g.do.give] ?? 0) + g.do.qty
    return [{ kind: 'narration', text: fill(g.do.line, values) }]
  }
  const text = 'line' in g.do ? g.do.line : 'warn' in g.do ? g.do.warn : g.do.ask
  return [{ kind: 'narration', text: fill(text, values) }]
}
