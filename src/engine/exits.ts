import type { Content, Direction } from './content'
import { allHold } from './quests/engine'
import type { World } from './world'

// A secret way (M10.31, a gap after M10.30: a way that waited with `when` was
// listed all the same, so a secret door could not be). An exit with `hidden`
// is not in the exits, on the plan or taken until it is found: by something
// hidden of the place that names it (SEARCH, or the words of one who knows),
// or once its `when` holds (a deed that opens it). People keep to the other
// ways.

/** The key under which a found exit is kept, with what else the stranger found. */
export const exitFound = (location: string, direction: string) => `exit:${location}/${direction}`

/** Whether the stranger sees this way out of the place: every ordinary one, a hidden one once found or opened. */
export function exitShown(world: World, location: string, direction: Direction): boolean {
  const exit = world.location(location).exits[direction]
  if (!exit) return false
  if (!exit.hidden) return true
  if ((world.state.player.found ?? []).includes(exitFound(location, direction))) return true
  return Boolean(exit.when?.length && allHold(world, exit.when))
}

/** The ways out of a place the stranger sees, by direction. */
export function shownExits(world: World, location: string): Direction[] {
  return (Object.keys(world.location(location).exits) as Direction[]).filter((d) => exitShown(world, location, d))
}

/** Per world's places: the ways into each place, as [from, direction]. */
const into = new WeakMap<object, Map<string, [string, Direction][]>>()

function waysInto(content: Pick<Content, 'locations'>, location: string): [string, Direction][] {
  let ways = into.get(content.locations)
  if (!ways) {
    ways = new Map()
    for (const l of content.locations.values()) {
      for (const [d, exit] of Object.entries(l.exits) as [Direction, { to: string }][]) {
        if (!ways.has(exit.to)) ways.set(exit.to, [])
        ways.get(exit.to)!.push([l.id, d])
      }
    }
    into.set(content.locations, ways)
  }
  return ways.get(location) ?? []
}

/**
 * A place behind a secret way (M10.31): every way into it is secret and not
 * yet found. Knowing its area is not knowing it, so the map does not walk
 * the stranger in.
 */
export function behindSecret(world: World, location: string): boolean {
  const ways = waysInto(world.content, location)
  return ways.length > 0 && ways.every(([from, d]) => !exitShown(world, from, d))
}

/**
 * A place every way into which is secret or waits for something (M10.31, the
 * playtest of the other session: a walk to Orison Ridge came out in the Cable
 * Gallery): never where a walk over the land, a guide or a companion comes in.
 */
export function shutAway(content: Pick<Content, 'locations'>, location: string): boolean {
  const ways = waysInto(content, location)
  return ways.length > 0 && ways.every(([from, d]) => {
    const exit = content.locations.get(from)!.exits[d]!
    return Boolean(exit.hidden || exit.when?.length)
  })
}

/**
 * How a place behind a secret or waiting way reads where the chronicler is
 * shown the places (M10.32): secret, and where it is found from; or shut
 * until a way there opens. Nothing for any other place.
 */
export function secretNote(content: Pick<Content, 'locations'>, location: string): string {
  if (!shutAway(content, location)) return ''
  const ways = waysInto(content, location)
  const from = [...new Set(ways.map(([f]) => content.locations.get(f)?.name ?? f))].join(' or ')
  return ways.some(([f, d]) => content.locations.get(f)!.exits[d]!.hidden) ? ` (secret: found by searching in ${from})` : ` (shut: reached from ${from} once something opens the way)`
}

/**
 * The codes that stand between the start and a place (M10.34 B): none when a
 * way without a code reaches it, otherwise the words of the locked ways into
 * the part of the world it lies in (the hangar, and the deck above it).
 */
export function behindCodes(c: Pick<Content, 'locations'> & { world?: Pick<Content['world'], 'start'> }, place: string): string[] {
  const start = c.world?.start.location
  if (!start || !c.locations.has(start)) return []
  const reach = (from: string[], skip: (e: { lock?: { word?: string } }) => boolean) => {
    const seen = new Set(from)
    const queue = [...from]
    while (queue.length) {
      for (const e of Object.values(c.locations.get(queue.shift()!)?.exits ?? {})) {
        if (!e || seen.has(e.to) || !c.locations.has(e.to) || skip(e)) continue
        seen.add(e.to)
        queue.push(e.to)
      }
    }
    return seen
  }
  const open = reach([start], (e) => Boolean(e.lock?.word))
  if (open.has(place)) return []
  const words = new Set<string>()
  for (const id of open) {
    for (const e of Object.values(c.locations.get(id)!.exits)) {
      // A locked way out of the open part, into the part that holds the place.
      if (e?.lock?.word && !open.has(e.to) && reach([e.to], (x) => Boolean(x.lock?.word)).has(place)) words.add(e.lock.word)
    }
  }
  return [...words]
}

/** A place behind a code, for the quest writers (M10.34 B): which code, and that a deed there needs it given first. */
export function codeNote(content: Pick<Content, 'locations' | 'world'>, location: string): string {
  const words = behindCodes(content, location)
  return words.length ? ` (behind the code ${words.join(', ')}: a deed here needs a stage before it where the stranger is given the code)` : ''
}

/** The rule that goes with the notes, for every call that writes quests (M10.32). */
export const SECRET_PLACES_RULE =
  'A PLACE MARKED secret is found in play, by searching where it is found from; nobody names it (in knows, the ask or a journal line) before a stage sends the stranger to look there, and a deed in it comes only after that stage. A place marked shut opens only once something happens there first: a deed in it needs a stage before it that opens the way.'

/**
 * The ways out of a place the words name by what they are called (M10.33 Z:
 * "open hatch" said there was no hatch, and "go down the ladder" took the
 * stairs, for the way was called `in`): each shown way whose own words fit.
 */
export function exitsByWords(world: World, location: string, words: string): Direction[] {
  const wanted = words.toLowerCase().replace(/^(?:down|up|in|into|through|out|out of|the|a|an)\s+/g, '').replace(/^(?:the|a|an)\s+/, '').trim()
  if (!wanted) return []
  const exits = world.location(location).exits
  return shownExits(world, location).filter((d) => (exits[d]!.words ?? []).some((w) => w.toLowerCase() === wanted || wanted.endsWith(` ${w.toLowerCase()}`) || w.toLowerCase().endsWith(` ${wanted}`)))
}

