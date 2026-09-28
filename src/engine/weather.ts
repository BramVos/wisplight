import { GameClock } from './clock'
import type { World } from './world'

// Weather (FO, chapter 4, "Dagdelen, seizoenen en weer"): decided for the
// region every three game hours. It changes how far you see, how fast you
// walk and how places read.
//
// Since M10.8 it has a memory and comes from the content (Bram, 28 September
// 2026): the seasons per month and the chances per season are in world.yaml
// (Skerrow has sea weather: more wind and mist, less frost). Each step is a
// move, not a draw: the sky stays as it was with a good chance, or moves to a
// neighbour (clear, overcast, rain, storm and back; mist beside clear and
// overcast; frost and snow in the cold), weighed by the season, so a storm
// builds and blows over. The wind has a direction and a force from the same
// step. The next step is known one part of the day ahead: whoever can read
// the sky says what is coming.

export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'fog' | 'storm' | 'frost' | 'snow'

export const WEATHER_KINDS: WeatherKind[] = ['clear', 'overcast', 'rain', 'fog', 'storm', 'frost', 'snow']

export const WINDS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'] as const
export type Wind = (typeof WINDS)[number]

export interface WeatherState {
  kind: WeatherKind
  since: number
  /** Where the wind comes from, and how hard: 0 still, 1 a breeze, 2 a wind, 3 a gale, 4 a storm. */
  wind?: { from: Wind; force: number }
  /** The next step, rolled one part of the day ahead (M10.8): the forecast the engine knows. */
  next?: { kind: WeatherKind; wind: { from: Wind; force: number } }
}

/** Which weather can follow which: the sky moves by neighbours, never jumps. */
const NEIGHBOURS: Record<WeatherKind, WeatherKind[]> = {
  clear: ['overcast', 'fog', 'frost'],
  overcast: ['clear', 'rain', 'fog', 'snow', 'frost'],
  rain: ['overcast', 'storm', 'fog'],
  storm: ['rain', 'overcast'],
  fog: ['clear', 'overcast', 'rain'],
  frost: ['clear', 'overcast', 'snow'],
  snow: ['overcast', 'frost'],
}

/** How hard the wind blows with each weather: least and most. */
const FORCE: Record<WeatherKind, [number, number]> = { clear: [0, 2], overcast: [1, 2], rain: [1, 3], storm: [3, 4], fog: [0, 1], frost: [0, 1], snow: [1, 2] }

// A plain temperate year: the seasons for a world that has a calendar but names none (M10.17). A world without
// a weather block in world.yaml has no weather at all: the sky does not change and nobody speaks of it.
const DEFAULT_SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter', 'winter']
const DEFAULT_CHANCES: Record<string, Partial<Record<WeatherKind, number>>> = {
  spring: { clear: 0.3, overcast: 0.3, rain: 0.3, fog: 0.1 },
  summer: { clear: 0.55, overcast: 0.25, rain: 0.15, storm: 0.05 },
  autumn: { clear: 0.15, overcast: 0.25, rain: 0.2, fog: 0.35, storm: 0.05 },
  winter: { clear: 0.2, overcast: 0.3, frost: 0.25, snow: 0.15, fog: 0.1 },
}
/** The chance the sky stays as it is for another part of the day. */
const STAY = 0.6

/** Whether this world has weather (M10.17): only with a weather block in world.yaml. */
export function hasWeather(world: World): boolean {
  return Boolean(world.content.world.weather)
}

function climate(world: World) {
  const w = world.content.world.weather
  return { seasons: w?.seasons ?? DEFAULT_SEASONS, chances: w?.chances ?? DEFAULT_CHANCES, stay: w?.stay ?? STAY, prevailing: (w?.prevailing ?? 'south-west') as Wind }
}

export function season(minutes: number, world?: World): string {
  const seasons = world ? climate(world).seasons : DEFAULT_SEASONS
  return seasons[new GameClock(minutes).parts.month - 1] ?? 'autumn'
}

export function weather(world: World): WeatherKind {
  return world.state.weather?.kind ?? (hasWeather(world) ? 'overcast' : 'clear')
}

/** The wind now: from where, and how hard (an old save without wind: a breeze from the usual quarter; no weather: still). */
export function wind(world: World): { from: Wind; force: number } {
  return world.state.weather?.wind ?? { from: climate(world).prevailing, force: hasWeather(world) ? 1 : 0 }
}

/** One step of the sky: stay, or move to a neighbour, by the chances of the season; and the wind with it. */
function step(world: World, from: WeatherKind, gust: { from: Wind; force: number }, at: number): { kind: WeatherKind; wind: { from: Wind; force: number } } {
  const { chances, stay, prevailing } = climate(world)
  const odds = chances[season(at, world)] ?? DEFAULT_CHANCES['autumn']!
  const weight = (k: WeatherKind) => odds[k] ?? 0
  let kind = from
  // Out of its season (snow in spring), the sky moves on at once; otherwise it stays with a good chance.
  if (weight(from) === 0 || world.rng.next('weather') >= stay) {
    const options = [from, ...NEIGHBOURS[from]].filter((k) => weight(k) > 0)
    const pool = options.length ? options : WEATHER_KINDS.filter((k) => weight(k) > 0)
    const total = pool.reduce((sum, k) => sum + weight(k), 0)
    let roll = world.rng.next('weather') * total
    kind = pool.find((k) => (roll -= weight(k)) < 0) ?? pool[0] ?? 'overcast'
  }
  // The wind veers a point now and then, back towards the usual quarter more often than away.
  let dir = WINDS.indexOf(gust.from)
  const r = world.rng.next('weather')
  if (r < 0.15) dir += 1
  else if (r < 0.3) dir -= 1
  else if (r < 0.4) dir += Math.sign(WINDS.indexOf(prevailing) - dir) || 0
  const [low, high] = FORCE[kind]
  const force = Math.max(low, Math.min(high, gust.force + (world.rng.next('weather') < 0.5 ? -1 : 1)))
  return { kind, wind: { from: WINDS[((dir % 8) + 8) % 8]!, force } }
}

/** Every three game hours the sky over the region moves on; the step after it is rolled now, the forecast. */
export function weatherHour(world: World): void {
  if (!hasWeather(world)) return
  const hour = new GameClock(world.now).parts.hour
  const now = world.state.weather
  if (now && hour % 3 !== 0) return
  if (!now) {
    // A new game: a sky of the season, and the step after it.
    const first = step(world, 'overcast', { from: climate(world).prevailing, force: 1 }, world.now)
    world.state.weather = { kind: first.kind, since: world.now, wind: first.wind, next: step(world, first.kind, first.wind, world.now + 180) }
    return
  }
  // An old save has no forecast yet: the sky moves on from where it was.
  const current = now.next ?? step(world, now.kind, wind(world), world.now)
  const changed = current.kind !== now.kind
  world.state.weather = { kind: current.kind, since: changed ? world.now : now.since, wind: current.wind, next: step(world, current.kind, current.wind, world.now + 180) }
}

/** The wind in words: "a west wind", "still air". */
export function windWords(w: { from: Wind; force: number }): string {
  if (w.force <= 0) return 'still air'
  return `a ${w.from} ${['', 'breeze', 'wind', 'gale', 'storm wind'][Math.min(4, w.force)]}`
}

/** What is coming, as someone who reads the sky would say it: "Rain before long, and the wind backing south." */
export function forecastLine(world: World): string | undefined {
  const w = world.state.weather
  if (!w?.next) return undefined
  const next = w.next
  const same = next.kind === w.kind
  const what: Record<WeatherKind, string> = {
    clear: 'It will clear',
    overcast: 'Cloud is coming over',
    rain: 'Rain before long',
    fog: 'Mist will come up',
    storm: 'A storm is building',
    frost: 'There will be frost',
    snow: 'Snow is on the way',
  }
  const head = same ? 'It will hold as it is for a while' : what[next.kind]
  const turn = next.wind.from !== (w.wind?.from ?? next.wind.from) ? `, and the wind going ${next.wind.from}` : next.wind.force > (w.wind?.force ?? 1) ? ', and the wind getting up' : ''
  return `${head}${turn}.`
}

/** The words for the sky when a world gives none of its own (M10.17): plain, of no land in particular. */
const SKY: Record<WeatherKind, { day: string; night?: string }> = {
  fog: { day: 'Mist lies over everything and muffles every sound.' },
  rain: { day: 'Rain falls steadily and runs down your neck.' },
  storm: { day: 'Wind tears at your clothes and the rain comes sideways.' },
  frost: { day: 'Frost crackles underfoot and your breath smokes.' },
  snow: { day: 'Snow falls softly and swallows every sound.' },
  clear: { day: 'The sky is wide and pale.', night: 'Stars hang sharp and cold overhead.' },
  overcast: { day: 'Low grey cloud sits on the land.', night: 'There is no moon to speak of.' },
}

/**
 * One short sentence for a description outdoors, with the wind when it blows; in the world's own words
 * (world.yaml weather.lines) where it has them. Undefined in a world without weather.
 */
export function weatherLine(world: World, kind: WeatherKind, night: boolean, gust?: { from: Wind; force: number }): string | undefined {
  if (!hasWeather(world)) return undefined
  const own = world.content.world.weather?.lines?.[kind]
  const words = typeof own === 'string' ? { day: own } : (own ?? SKY[kind])
  const sky = (night ? words.night : undefined) ?? words.day
  // The wind (M10.8), when there is enough of it to feel, and the storm has not already said so.
  if (!gust || gust.force < 2 || kind === 'storm') return sky
  return `${sky} ${gust.force >= 3 ? `A ${gust.from} gale leans on you.` : `A ${gust.from} wind pushes at you.`}`
}

/** Whether someone reads the sky (M10.8): a trade that works outdoors, by the world's own list. */
export function readsTheSky(world: World, npcId: string): boolean {
  if (!world.content.npcs.has(npcId)) return false
  return (world.content.world.weather?.readers ?? []).includes(world.npc(npcId).profession)
}

/**
 * LOOK SKY (M10.8): the sky now and the wind; and what is coming, for a
 * stranger who can read it (trained in Survival, or of a trade that works
 * under the sky).
 */
export function lookSky(world: World): string {
  if (!hasWeather(world)) return 'There is no weather here to speak of.'
  const night = new GameClock(world.now).isNight
  const gust = wind(world)
  const lines = [weatherLine(world, weather(world), night) ?? '', gust.force > 0 ? `The wind: ${windWords(gust)}.` : 'The air is still.']
  const c = world.state.player.character
  const reader = Boolean(c && ((c.ranks['survival'] ?? 0) >= 1 || (world.content.world.weather?.readers ?? []).includes(c.background)))
  const coming = forecastLine(world)
  lines.push(reader && coming ? `You read the sky: ${coming.charAt(0).toLowerCase()}${coming.slice(1)}` : 'What it will do next, you could not say.')
  return lines.join(' ')
}
