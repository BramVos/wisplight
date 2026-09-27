import { GameClock, weekdayOf } from '../clock'
import type { Output } from '../commands'
import type { World } from '../world'
import { blessed } from '../rules/blessings'
import { weather } from '../weather'
import { centre, type Hex, hexKey, neighbours } from './hexgrid'
import { regionMap, type RegionMap } from './region'
import { entranceOn, hasSeen, hasWalked, minutesFor, passable, playerHex, seenBits } from './travel'

// Fast travel (FO, chapter 4, "Snelreizen"): time runs on over a route you
// know because you walked it, with a chance of something on the way. The
// barge keeps its timetable and costs money.

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

const ON_THE_WAY: { text: string; where: 'canal' | 'road' | 'fen' | 'any'; night?: boolean; minutes?: number }[] = [
  { text: 'A barge slides past on the Vaart, the horse plodding along the tow path, the bargeman raising a hand.', where: 'canal' },
  { text: 'Two peat-cutters pass you with their spades on their shoulders and give you a nod.', where: 'road' },
  { text: 'A heron lifts out of the reeds ahead of you and flaps away, complaining.', where: 'fen' },
  { text: 'The mist comes down so thick that you wait for it to lift before going on.', where: 'any', minutes: 30 },
  { text: 'Somebody has left a bowl of milk on a gatepost. You leave it alone.', where: 'road' },
  { text: 'Little lights dance over the fields in the dark. You keep your eyes on the way.', where: 'any', night: true },
  { text: 'A cart has lost a wheel in the ruts and you lend a shoulder before going on.', where: 'road', minutes: 15 },
]

function onTheWay(world: World, map: RegionMap, path: Hex[], minutes: number): { lines: string[]; extra: number } {
  const lines: string[] = []
  let extra = 0
  const hours = Math.max(1, Math.round(minutes / 60))
  const kinds = new Set(path.map((h) => map.cell(h)!).map((c) => (c.way ? (c.way.kind === 'canal' ? 'canal' : 'road') : c.land === 'fen' ? 'fen' : 'road')))
  const night = new GameClock(world.now + minutes / 2).isNight
  for (let hour = 0; hour < hours && lines.length < 2; hour++) {
    const chance = 0.15 + (night ? 0.1 : 0) + (kinds.has('fen') ? 0.05 : 0)
    if (world.rng.next('travel') >= chance) continue
    const fits = ON_THE_WAY.filter((e) => (e.where === 'any' || kinds.has(e.where)) && (e.night === undefined || e.night === night) && !lines.includes(e.text))
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
  const entrance = entranceOn(world, map, target)
  world.state.player.location = entrance ?? `hex:${target.col},${target.row}`
  return [{ kind: 'narration', text: [`You travel to ${name}. It takes ${duration(minutes + extra)}.`, ...lines].join(' ') }]
}

// ---------------------------------------------------------------- the barge

/** Where the barge on the Graafse Vaart stops (Wereldboek, chapter 7: Maandag and Donderdag). */
const STOPS = ['loc_oude_zijl_sluice', 'loc_veenhoek_quay', 'loc_waagdam_harbour']
const FARE = 16

export function takeBarge(world: World, destination: string | undefined, pass: (minutes: number) => Output[]): Output[] {
  const here = world.state.player.location
  if (!STOPS.every((stop) => world.content.locations.has(stop))) return [{ kind: 'error', text: 'There is no barge here.' }]
  if (!STOPS.includes(here)) return [{ kind: 'error', text: 'The barge stops at the quay in Veenhoek, the harbour in Waagdam and the sluice at Oude Zijl.' }]
  const day = weekdayOf(world.now)
  const hour = new GameClock(world.now).parts.hour
  if ((day !== 'Maandag' && day !== 'Donderdag') || hour < 7 || hour >= 17) {
    return [{ kind: 'text', text: 'No barge today. It runs on Maandag and Donderdag, from first light until the afternoon.' }]
  }
  if (!destination) return [{ kind: 'error', text: 'Take the barge where? Oude Zijl, Veenhoek or Waagdam.' }]
  const from = world.words.from
  if (destination.includes(from.toLowerCase())) return [{ kind: 'text', text: `The barge goes on to ${from}, two days west, but that lies beyond ${world.words.region} for now.` }]
  const to = STOPS.find((stop) => world.location(stop).area === destination || world.location(stop).name.toLowerCase().includes(destination) || world.content.areas.get(world.location(stop).area)?.name.toLowerCase() === destination)
  if (!to || to === here) return [{ kind: 'error', text: 'The barge stops at Oude Zijl, Veenhoek and Waagdam.' }]
  if (world.state.player.money < FARE) return [{ kind: 'text', text: `The bargeman wants ${world.money(FARE)}, and you do not have it.` }]
  const map = regionMap(world.content)!
  const a = centre(map.locations.get(here)!, map.size)
  const b = centre(map.locations.get(to)!, map.size)
  // Some 70 km in a day of twelve hours: about 6 km an hour, and the barge takes its time at the locks.
  // Fair Wind (Nehalennia): travel over water goes a quarter faster.
  const fair = blessed(world.content, world.state.player.character, 'Fair Wind') ? 0.75 : 1
  const minutes = Math.round((Math.hypot(b[0] - a[0], b[1] - a[1]) / 6) * 60 * fair) + 15
  world.state.player.money -= FARE
  pass(minutes)
  world.state.player.location = to
  return [{ kind: 'narration', text: `You pay ${world.money(FARE)} and sit among sacks of grain while the horse plods along the tow path. After ${duration(minutes)} you step ashore at ${world.location(to).name}.` }]
}
