import { regionMap } from './map/region'
import { factById } from './news'
import { hexOfId } from './map/travel'
import type { World } from './world'

// Where things are, in km on the map of the land (Wereldboek, chapter 2): a
// location, an area, a person's home, a far place, the place of an event.
// The journal uses it to show what is near first (after the M7 playtest).

type Pos = readonly [number, number]

/** A location or a spot on the region map, in national km. */
export function posOfLocation(world: World, id: string): Pos | undefined {
  const map = regionMap(world.content)
  const hex = hexOfId(id) ?? map?.locations.get(id)
  if (map && hex) return map.posOf(hex)
  const location = world.content.locations.get(id)
  if (!location) return undefined
  return location.pos ?? world.content.areas.get(location.area)?.pos ?? firstOfArea(world, location.area)
}

function firstOfArea(world: World, area: string): Pos | undefined {
  const map = regionMap(world.content)
  if (!map) return undefined
  for (const location of world.content.locations.values()) {
    const hex = location.area === area ? map.locations.get(location.id) : undefined
    if (hex) return map.posOf(hex)
  }
  return undefined
}

/** Anything the journal can hold: a person, a place, an area, a story, an event. */
export function posOf(world: World, id: string): Pos | undefined {
  const { content } = world
  if (content.locations.has(id) || hexOfId(id)) return posOfLocation(world, id)
  const npc = content.npcs.get(id)
  if (npc) return posOfLocation(world, npc.home)
  if (id.startsWith('area_')) {
    const area = content.areas.get(id.slice(5))
    return area?.pos ?? (area ? firstOfArea(world, area.id) : undefined)
  }
  if (id.startsWith('fact_')) {
    const fact = factById(world, id)
    return fact ? posOfLocation(world, fact.place) : undefined
  }
  const topic = content.topics.get(id)
  if (topic?.pos) return topic.pos
  const area = [...content.areas.values()].find((a) => a.topic === id)
  if (area) return area.pos ?? firstOfArea(world, area.id)
  if (topic?.origin) return content.areas.has(topic.origin) ? (content.areas.get(topic.origin)!.pos ?? firstOfArea(world, topic.origin)) : posOfLocation(world, topic.origin)
  return undefined
}

/** How far something is from the player, in km, or undefined if it has no place. */
export function kmFromPlayer(world: World, id: string): number | undefined {
  const here = posOfLocation(world, world.state.player.location)
  const there = posOf(world, id)
  if (!here || !there) return undefined
  return Math.round(Math.hypot(there[0] - here[0], there[1] - here[1]) * 10) / 10
}
