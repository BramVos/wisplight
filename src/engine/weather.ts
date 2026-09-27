import { GameClock } from './clock'
import type { World } from './world'

// Weather (FO, chapter 4, "Dagdelen, seizoenen en weer"): decided for the
// region every three game hours with a simple chance model per season. It
// changes how far you see, how fast you walk and how places read.

export type WeatherKind = 'clear' | 'overcast' | 'rain' | 'fog' | 'storm' | 'frost' | 'snow'

type Season = 'spring' | 'summer' | 'autumn' | 'winter'

// Months 1 to 13: Louwmaand to Dijkdagen.
const SEASON: Season[] = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter', 'winter']

const CHANCES: Record<Season, [WeatherKind, number][]> = {
  spring: [['clear', 0.3], ['overcast', 0.3], ['rain', 0.3], ['fog', 0.1]],
  summer: [['clear', 0.55], ['overcast', 0.25], ['rain', 0.15], ['storm', 0.05]],
  autumn: [['clear', 0.15], ['overcast', 0.25], ['rain', 0.2], ['fog', 0.35], ['storm', 0.05]],
  winter: [['clear', 0.2], ['overcast', 0.3], ['frost', 0.25], ['snow', 0.15], ['fog', 0.1]],
}

export function season(minutes: number): Season {
  return SEASON[new GameClock(minutes).parts.month - 1] ?? 'autumn'
}

export function weather(world: World): WeatherKind {
  return world.state.weather?.kind ?? 'overcast'
}

/** Every three game hours the sky over the region changes, by the season. */
export function weatherHour(world: World): void {
  const hour = new GameClock(world.now).parts.hour
  if (world.state.weather && hour % 3 !== 0) return
  let roll = world.rng.next('weather')
  for (const [kind, chance] of CHANCES[season(world.now)]) {
    roll -= chance
    if (roll < 0) {
      world.state.weather = { kind, since: world.now }
      return
    }
  }
  world.state.weather = { kind: 'overcast', since: world.now }
}

/** One short sentence for a description outdoors. */
export function weatherLine(kind: WeatherKind, night: boolean): string {
  switch (kind) {
    case 'fog':
      return 'Mist lies over everything and muffles every sound.'
    case 'rain':
      return 'Rain hisses on the reeds and runs down your neck.'
    case 'storm':
      return 'Wind tears at your clothes and the rain comes sideways.'
    case 'frost':
      return 'Frost crackles underfoot and your breath smokes.'
    case 'snow':
      return 'Snow falls softly and swallows every sound.'
    case 'clear':
      return night ? 'Stars hang sharp and cold over the fen.' : 'The sky is wide and pale over the flat land.'
    default:
      return night ? 'There is no moon to speak of.' : 'Low grey cloud sits on the land.'
  }
}
