import type { World } from '../world'
import { centre, type Hex, hexAt } from './hexgrid'
import { noise, regionMap, type RegionMap } from './region'

// What the map shows (FO, chapter 4, "Wat de kaart laat zien"): places you
// have been to or seen, exactly; places you have only heard of, as a zone.
// A teller at level 1 gives a wide guess, at level 2 a circle of about 2 km,
// at level 3 one of 500 m; several tellers together narrow it down.

export type PlaceStatus = 'visited' | 'seen' | 'heard' | 'mapped'

export interface KnownPlace {
  /** The topic the player knows it by: a location, an area or a lore topic. */
  topic: string
  name: string
  status: PlaceStatus
  /** Where it really is, when the player knows exactly. */
  hex?: Hex
  /** Where the player thinks it is, when only heard of: centre and radius in km. */
  zone?: { x: number; y: number; km: number; tellers: number }
}

const RADIUS = [4, 4, 2, 0.5]

/** The hex a topic stands for on the region map, if it lies on it. */
export function hexOfTopic(world: World, map: RegionMap, topic: string): { hex: Hex; area?: string; location?: string } | undefined {
  if (map.locations.has(topic)) return { hex: map.locations.get(topic)!, location: topic, area: world.content.locations.get(topic)?.area }
  const areaId = topic.startsWith('area_') ? topic.slice(5) : [...world.content.areas.values()].find((a) => a.topic === topic)?.id
  if (areaId && map.places.has(areaId)) return { hex: map.places.get(areaId)!, area: areaId }
  const pos = world.content.topics.get(topic)?.pos
  if (pos) {
    const hex = map.hexOf(pos)
    if (map.inside(hex)) return { hex }
  }
  return undefined
}

export function knownPlace(world: World, topic: string): KnownPlace | undefined {
  const map = regionMap(world.content)
  if (!map) return undefined
  const where = hexOfTopic(world, map, topic)
  if (!where) return undefined
  const player = world.state.player
  const name = world.content.locations.get(topic)?.name ?? (where.area ? world.content.areas.get(where.area)?.name : undefined) ?? world.content.topics.get(topic)?.name ?? topic
  const visited = (where.area && player.visited?.includes(where.area)) || (where.location && player.seen?.includes(where.location))
  if (visited) return { topic, name, status: 'visited', hex: where.hex }
  if (where.area && player.seenAreas?.includes(where.area) && !where.location) return { topic, name, status: 'seen', hex: where.hex }
  const sources = (player.sources?.[topic] ?? []).filter((s) => s.from !== 'player')
  if ((player.journal ?? {})[topic] === undefined) return undefined
  // Heard of: each teller's guess lies somewhere around the truth, by how well they knew it.
  const [tx, ty] = centre(where.hex, map.size)
  const tellers = [...new Map(sources.map((s) => [s.from, s])).values()]
  if (tellers.length === 0) return { topic, name, status: 'heard', zone: { x: tx, y: ty, km: RADIUS[1]!, tellers: 0 } }
  let x = 0
  let y = 0
  let smallest = Infinity
  for (const teller of tellers) {
    const radius = RADIUS[teller.level] ?? 4
    const seed = [...teller.from].reduce((sum, c) => sum + c.charCodeAt(0), 0)
    const angle = noise(map.region.seed, seed, [...topic].reduce((sum, c) => sum + c.charCodeAt(0), 0), 11) * Math.PI * 2
    const off = noise(map.region.seed, seed, 3, 12) * radius * 0.6
    x += tx + Math.cos(angle) * off
    y += ty + Math.sin(angle) * off
    smallest = Math.min(smallest, radius)
  }
  x /= tellers.length
  y /= tellers.length
  // Where the tellers' circles overlap, the zone shrinks.
  const km = Math.max(map.size, smallest / Math.sqrt(tellers.length))
  return { topic, name, status: 'heard', zone: { x, y, km, tellers: tellers.length } }
}

/** The hex to walk to for a known place: the place itself, or the middle of what you heard. */
export function walkTarget(world: World, place: KnownPlace): Hex | undefined {
  const map = regionMap(world.content)
  if (!map) return undefined
  if (place.hex) return place.hex
  if (!place.zone) return undefined
  const hex = hexAt(place.zone.x, place.zone.y, map.size)
  return map.inside(hex) ? hex : undefined
}

/** Every place on the region map the player knows of, for the map panel. */
export function knownPlaces(world: World): KnownPlace[] {
  const map = regionMap(world.content)
  if (!map) return []
  const topics = new Set<string>([
    ...Object.keys(world.state.player.journal ?? {}),
    ...(world.state.player.visited ?? []).map((a) => `area_${a}`),
    ...(world.state.player.seenAreas ?? []).map((a) => world.content.areas.get(a)?.topic ?? `area_${a}`),
  ])
  const places: KnownPlace[] = []
  for (const topic of [...topics].sort()) {
    if (topic.startsWith('loc_')) continue
    const place = knownPlace(world, topic)
    if (place) places.push(place)
  }
  return places
}
