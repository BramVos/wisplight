import type { Direction } from './content'
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

function waysInto(world: World, location: string): [string, Direction][] {
  let ways = into.get(world.content.locations)
  if (!ways) {
    ways = new Map()
    for (const l of world.content.locations.values()) {
      for (const [d, exit] of Object.entries(l.exits) as [Direction, { to: string }][]) {
        if (!ways.has(exit.to)) ways.set(exit.to, [])
        ways.get(exit.to)!.push([l.id, d])
      }
    }
    into.set(world.content.locations, ways)
  }
  return ways.get(location) ?? []
}

/**
 * A place behind a secret way (M10.31): every way into it is secret and not
 * yet found. Knowing its area is not knowing it, so the map does not walk
 * the stranger in.
 */
export function behindSecret(world: World, location: string): boolean {
  const ways = waysInto(world, location)
  return ways.length > 0 && ways.every(([from, d]) => !exitShown(world, from, d))
}
