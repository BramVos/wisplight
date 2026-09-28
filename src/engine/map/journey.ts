import { GameClock } from '../clock'
import type { Output } from '../commands'
import type { World } from '../world'
import { weather } from '../weather'
import { type Hex, hexKey, neighbours } from './hexgrid'
import { regionMap, type RegionMap } from './region'
import { entranceOn, hasSeen, hasWalked, minutesFor, passable, playerHex, seenBits, tread } from './travel'
import { tellsJourneys } from './journeyText'

// Fast travel (FO, chapter 4, "Snelreizen"): time runs on over a route you
// know because you walked it, with a chance of something on the way. The
// barge and every other line of transport are content since M10.12
// (passages.ts).

/** The quickest way over hexes the player has walked, between known places. */
function knownRoute(world: World, map: RegionMap, from: Hex, to: Hex): Hex[] | undefined {
  const goal = hexKey(to)
  const cost = new Map<string, number>([[hexKey(from), 0]])
  const back = new Map<string, Hex>()
  const open: Hex[] = [from]
  // Ground you walked or saw with your own eyes on the way counts as known.
  const seen = seenBits(world, map)
  const known = (hex: Hex) => hasWalked(world, map, hex) || hasSeen(world, map, hex, seen)
  while (open.length) {
    open.sort((a, b) => cost.get(hexKey(a))! - cost.get(hexKey(b))!)
    const hex = open.shift()!
    if (hexKey(hex) === goal) break
    for (const { hex: next } of neighbours(hex)) {
      const cell = map.cell(next)
      if (!cell || !passable(world, cell, true) || (!known(next) && hexKey(next) !== goal)) continue
      const g = cost.get(hexKey(hex))! + minutesFor(world, cell)
      if (g < (cost.get(hexKey(next)) ?? Infinity)) {
        cost.set(hexKey(next), g)
        back.set(hexKey(next), hex)
        open.push(next)
      }
    }
  }
  if (!back.has(goal)) return undefined
  const path = [to]
  while (hexKey(path[0]!) !== hexKey(from)) path.unshift(back.get(hexKey(path[0]!))!)
  return path
}


function onTheWay(world: World, map: RegionMap, path: Hex[], minutes: number): { lines: string[]; extra: number } {
  const lines: string[] = []
  let extra = 0
  const hours = Math.max(1, Math.round(minutes / 60))
  const kinds = new Set(path.map((h) => map.cell(h)!).map((c) => (c.way ? (c.way.kind === 'canal' ? 'canal' : 'road') : c.land === 'fen' ? 'fen' : 'road')))
  const night = new GameClock(world.now + minutes / 2).isNight
  for (let hour = 0; hour < hours && lines.length < 2; hour++) {
    const chance = 0.15 + (night ? 0.1 : 0) + (kinds.has('fen') ? 0.05 : 0)
    if (world.rng.next('travel') >= chance) continue
    // What may happen on the way is the world's own (M10.11, journey.yaml); nothing when it says nothing (M10.17).
    const events = world.content.journey?.on_the_way ?? []
    const fits = events.filter((e) => (e.where === 'any' || kinds.has(e.where)) && (e.night === undefined || e.night === night) && !lines.includes(e.text))
    const event = world.rng.pick('travel', fits)
    if (!event) continue
    if (event.text.includes('mist') && weather(world) !== 'fog' && weather(world) !== 'overcast') continue
    lines.push(event.text)
    extra += event.minutes ?? 0
  }
  return { lines, extra }
}

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${hours === 1 ? 'an hour' : `${hours} hours`}${rest >= 10 ? ` and ${rest} minutes` : ''}`
}

export function travelTo(world: World, target: Hex, name: string, pass: (minutes: number) => Output[]): Output[] {
  const map = regionMap(world.content)
  const from = playerHex(world)
  if (!map || !from) return [{ kind: 'error', text: 'You cannot travel from here.' }]
  const path = knownRoute(world, map, from, target)
  if (!path) return [{ kind: 'error', text: `You don't know the way to ${name} well enough yet. Walk it once, then you can travel it.` }]
  const minutes = path.slice(1).reduce((sum, h) => sum + minutesFor(world, map.cell(h)!), 0)
  const { lines, extra } = onTheWay(world, map, path, minutes)
  pass(minutes + extra)
  tread(world, map, path)
  const entrance = entranceOn(world, map, target)
  world.state.player.location = entrance ?? `hex:${target.col},${target.row}`
  // Told in one paragraph where the world has the sentences for it (M10.11): the land, the weather, what happened on the way.
  if (tellsJourneys(world) && path.length > 4) {
    const kit = world.content.journey!
    const terrains = [...new Set(path.slice(1).map((h) => map.cell(h)!).map((c) => (c.way ? c.way.kind : c.land)))].filter((t) => kit.terrain[t]?.length).slice(0, 2)
    const pick = (list: string[] | undefined) => (list?.length ? world.rng.pick('journey', list) : undefined)
    const parts = [`You travel to ${name}. It takes ${duration(minutes + extra)}.`, ...terrains.map((t) => pick(kit.terrain[t])), pick(kit.weather[weather(world)]), ...lines]
    return [{ kind: 'narration', text: parts.filter((p): p is string => Boolean(p)).join(' '), journey: true }]
  }
  return [{ kind: 'narration', text: [`You travel to ${name}. It takes ${duration(minutes + extra)}.`, ...lines].join(' ') }]
}
