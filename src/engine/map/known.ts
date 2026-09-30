import type { World } from '../world'
import { openThreads } from '../leaving'
import { tenseLines } from '../tidepages'
import { centre, type Hex, hexAt } from './hexgrid'
import { noise, regionMap, type RegionMap } from './region'
import { DEFAULT_PALETTE, type MapPalette } from './palette'
import { journeyLines, waysTo } from './passages'
import { farPlaceOf } from '../growth/far'
import { behindSecret } from '../exits'

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
  // A place behind a secret way not yet found (M10.31) is not known by having been in its area.
  if (where.location && !player.seen?.includes(where.location) && behindSecret(world, where.location)) return undefined
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
    // Only places are on the map: a tale or a being with a home somewhere is not (the Haakman, after the M10 playtest).
    const kind = world.content.topics.get(topic)?.kind
    if (kind && kind !== 'place') continue
    const place = knownPlace(world, topic)
    if (place) places.push(place)
  }
  return places
}

/** The land beyond the region (FO, chapter 4, "De landkaart"): the far places the player knows, by direction and days. */
export function landLines(world: World): string[] {
  const map = regionMap(world.content)
  if (!map) return []
  const journal = world.state.player.journal ?? {}
  const here = map.posOf(playerHexOr(world, map))
  const lines: string[] = []
  for (const topic of [...world.content.topics.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    // Only places (M10.12): a person the world book puts somewhere (the Count in Graafhaven) is no destination.
    if (!topic.pos || topic.kind !== 'place' || journal[topic.id] === undefined || map.inside(map.hexOf(topic.pos))) continue
    const km = Math.hypot(topic.pos[0] - here[0], topic.pos[1] - here[1])
    const angle = (Math.atan2(topic.pos[0] - here[0], topic.pos[1] - here[1]) * 180) / Math.PI
    const wind = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((angle + 360) % 360) / 45) % 8]
    const days = Math.max(1, Math.round(km / 40))
    lines.push(`  ${topic.name}: about ${Math.round(km / 5) * 5} km ${wind}, ${days === 1 ? 'a day' : `${days} days`} on foot.`)
    // And what goes there (M10.12): a barge, a coach, with its next departure.
    for (const way of waysTo(world, topic.id)) if (way.how === 'passage') lines.push(`    ${way.label}.`)
  }
  for (const far of world.state.lore?.far ?? []) if (journal[far.id] !== undefined) lines.push(`  ${far.name}: a ${far.kind} far beyond ${world.words.land}, you were told.`)
  // The journeys of days the stranger made (M10.12), a line each.
  const journeys = journeyLines(world)
  return [...(lines.length ? ['', `BEYOND ${world.words.region.toUpperCase()}`, ...lines] : []), ...(journeys.length ? ['', 'YOUR JOURNEYS', ...journeys.map((j) => `  ${j}`)] : [])]
}

function playerHexOr(world: World, map: RegionMap): Hex {
  const here = world.state.player.location
  return map.locations.get(here) ?? parseHex(here) ?? map.locations.get(world.content.world.start.location) ?? map.places.get(world.location(world.content.world.start.location).area) ?? { col: 0, row: 0 }
}

function parseHex(id: string): Hex | undefined {
  const match = /^hex:(\d+),(\d+)$/.exec(id)
  return match ? { col: Number(match[1]), row: Number(match[2]) } : undefined
}

/** The location that stands for a place on the map: the entrance of an area, if it has one. */
export function knownEntrance(world: World, topic: string): string | undefined {
  const map = regionMap(world.content)
  if (!map) return undefined
  const where = hexOfTopic(world, map, topic)
  if (!where) return undefined
  if (where.location) return where.location
  const here = [...map.locations.entries()].filter(([id, h]) => h.col === where.hex.col && h.row === where.hex.row && !world.content.locations.get(id)!.tags.includes('private'))
  return here.sort((a, b) => a[0].localeCompare(b[0]))[0]?.[0]
}

/**
 * The land map (M10; FO, chapter 4, "De landkaart"): the region as a box on
 * the map of the land, the stranger in it, the far places they know, and the
 * routes that run to those places. In national km, north up.
 */
export interface LandMapData {
  region: { name: string; x: number; y: number; w: number; h: number }
  you?: [number, number]
  /**
   * ways (M10.12): how to get there, on foot or by a passage, each with the command that sets off.
   * level (M10.21): a sketch is only a name and a line from the world book, an outline is worked out
   * in words, a place is playable; the map marks a sketch with a question mark.
   */
  places: { name: string; x: number; y: number; topic?: string; ways?: { label: string; command: string }[]; level: 'sketch' | 'outline' | 'place' }[]
  routes: { name: string; from: [number, number]; to: [number, number] }[]
  palette: MapPalette
  /** The threads the stranger would leave open by setting off (M10.21, the hint at departure), heaviest first. */
  leaving?: string[]
  /** Great lines under a threat or just broken (M10.22): the map colours the region's border. */
  tense?: { name: string; stage: 'threat' | 'event' }[]
}

export function landMapData(world: World): LandMapData | undefined {
  const map = regionMap(world.content)
  if (!map) return undefined
  const journal = world.state.player.journal ?? {}
  const region = map.region
  const places: LandMapData['places'] = []
  for (const topic of [...world.content.topics.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!topic.pos || topic.kind !== 'place' || journal[topic.id] === undefined || map.inside(map.hexOf(topic.pos))) continue
    const ways = waysTo(world, topic.id).map((w) => ({ label: w.label, command: w.command }))
    const level = farPlaceOf(world, topic.id) ? 'place' : world.state.outlines?.done[topic.id] ? 'outline' : 'sketch'
    places.push({ name: topic.name, x: topic.pos[0], y: topic.pos[1], topic: topic.id, ...(ways.length ? { ways } : {}), level })
  }
  const posOf = (id: string): [number, number] | undefined => {
    const outland = world.content.outlands.get(id)
    if (outland) {
      const topic = outland.topic ? world.content.topics.get(outland.topic) : undefined
      return topic?.pos && journal[topic.id] !== undefined ? [topic.pos[0], topic.pos[1]] : undefined
    }
    const pos = world.content.areas.get(id)?.pos
    return pos ? [pos[0], pos[1]] : undefined
  }
  const routes: LandMapData['routes'] = []
  for (const route of world.content.routes.values()) {
    if (!world.content.outlands.has(route.from) && !world.content.outlands.has(route.to)) continue
    const from = posOf(route.from)
    const to = posOf(route.to)
    if (from && to) routes.push({ name: route.name, from, to })
  }
  const here = map.posOf(playerHexOr(world, map))
  const leaving = openThreads(world).slice(0, 4).map((t) => (t.then ? `${t.text} ${t.then}` : t.text))
  const tense = tenseLines(world)
  return {
    region: { name: map.region.name, x: region.origin[0], y: region.origin[1], w: region.size[0], h: region.size[1] },
    you: here,
    places,
    routes,
    // The palette of the land the stranger is in (M10.23).
    palette: world.frame.palette ?? DEFAULT_PALETTE,
    ...(leaving.length ? { leaving } : {}),
    ...(tense.length ? { tense } : {}),
  }
}
