import type { Content } from './content'
import { landOfArea } from './lands'

// Lands know each other in degrees (M10.23; Bram, 28 September 2026:
// neighbours with many ties, a far chain of islands on its own, a Venice with
// ties everywhere). Per pair of lands a reach from the content (world.yaml
// `reach:`), or else from its lines of transport and routes: none (nobody
// knows of it: no news, no trade), rumour (a single traveller, tales from
// afar, no prices), trade (lines and routes, news in weeks, wares in the
// ledger, a trader with a cousin there) or close (daily traffic, news in days,
// storylines over the border). Within one land there is no border to cross.

export type Reach = 'none' | 'rumour' | 'trade' | 'close'
const ORDER: readonly Reach[] = ['none', 'rumour', 'trade', 'close']

type Lands = Pick<Content, 'world' | 'areas' | 'lands' | 'locations' | 'passages' | 'routes'>

/** The land of an area, as an id: the land's own, or the world's for the home land. */
export function landIdOf(content: Pick<Content, 'world' | 'areas' | 'lands'>, area: string | undefined): string {
  return landOfArea(content, area)?.id ?? content.world.id
}

const cache = new WeakMap<object, Map<string, Reach>>()

/**
 * How well two lands know each other; the same land is close. Without an
 * entry in world.yaml: close where a way on foot crosses from one to the other
 * (neighbours), trade where a line of transport or a route joins them, and
 * none otherwise.
 */
export function reachOf(content: Lands, a: string, b: string): Reach {
  if (a === b) return 'close'
  const key = a < b ? `${a}|${b}` : `${b}|${a}`
  let known = cache.get(content.locations)
  if (!known) cache.set(content.locations, (known = new Map()))
  const hit = known.get(key)
  if (hit) return hit
  const reach = worked(content, a, b)
  known.set(key, reach)
  return reach
}

function worked(content: Lands, a: string, b: string): Reach {
  const set = content.world.reach?.find((r) => (r.between[0] === a && r.between[1] === b) || (r.between[0] === b && r.between[1] === a))
  if (set) return set.reach
  const landOfPlace = (place: string) => landIdOf(content, content.locations.get(place)?.area)
  const pair = (x: string, y: string) => (x === a && y === b) || (x === b && y === a)
  const byFoot = [...content.locations.values()].some((l) => Object.values(l.exits ?? {}).some((e) => e && content.locations.has(e.to) && pair(landIdOf(content, l.area), landOfPlace(e.to))))
  if (byFoot) return 'close'
  const joinedByLine = [...content.passages.values()].some((p) => {
    const lands = new Set(p.stops.map(landOfPlace))
    return lands.has(a) && lands.has(b)
  })
  const joinedByRoute = [...content.routes.values()].some((r) => pair(landIdOf(content, r.from), landIdOf(content, r.to)))
  return joinedByLine || joinedByRoute ? 'trade' : 'none'
}

/** Whether a reach is at least another. */
export function atLeast(reach: Reach, least: Reach): boolean {
  return ORDER.indexOf(reach) >= ORDER.indexOf(least)
}

/** How well the lands of two places know each other. */
export function reachBetween(content: Lands, placeA: string | undefined, placeB: string | undefined): Reach {
  const area = (place: string | undefined) => (place ? (content.locations.get(place)?.area ?? place) : undefined)
  return reachOf(content, landIdOf(content, area(placeA)), landIdOf(content, area(placeB)))
}

/** Whether a route carries wares (M10.23): within a land always, between two lands from trade up. */
export function landsTrade(content: Lands, route: { from: string; to: string }): boolean {
  return atLeast(reachOf(content, landIdOf(content, route.from), landIdOf(content, route.to)), 'trade')
}
