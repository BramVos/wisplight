import type { World } from '../world'
import { centre, type Hex } from './hexgrid'
import { knownPlaces } from './known'
import { regionMap, type RegionMap } from './region'
import { hasSeen, playerHex, seenBits } from './travel'

// The map as the player knows it (FO, chapter 4, "Weergave"): characters with
// a colour per terrain, in the style of Dwarf Fortress. Only what the player
// has seen is drawn; places heard of are vague zones with a question mark.

export interface MapCell {
  ch: string
  /** A class for the colour: fen, water, woods, heath, fields, way, place, zone, you, unknown. */
  cls: string
}

export interface MapView {
  rows: MapCell[][]
  /** Places shown, with where they are in the view. */
  labels: { name: string; status: string; x: number; y: number }[]
  /** One line per place: what the player knows of where it is. */
  legend: string[]
}

const LAND: Record<string, MapCell> = {
  fen: { ch: '"', cls: 'fen' },
  water: { ch: '~', cls: 'water' },
  woods: { ch: 'T', cls: 'woods' },
  heath: { ch: '^', cls: 'heath' },
  fields: { ch: '.', cls: 'fields' },
}

/**
 * A window on the region map around the player (the side panel), or the whole
 * region shrunk to fit (the journal): one character stands for a block of hexes.
 */
export function mapView(world: World, options: { width: number; height: number; whole?: boolean; centre?: Hex; mark?: Hex }): MapView | undefined {
  const map = regionMap(world.content)
  if (!map) return undefined
  const you = playerHex(world)
  // A journal page centres on what it is about, and marks it.
  const middle = options.centre ?? you
  const scaleX = options.whole ? Math.max(1, Math.ceil(map.cols / options.width)) : 1
  const scaleY = options.whole ? Math.max(1, Math.ceil(map.rows / options.height)) : 2
  const width = options.whole ? Math.ceil(map.cols / scaleX) : options.width
  const height = options.whole ? Math.ceil(map.rows / scaleY) : options.height
  const left = options.whole || !middle ? 0 : Math.max(0, Math.min(map.cols - width * scaleX, middle.col - Math.floor((width * scaleX) / 2)))
  const top = options.whole || !middle ? map.rows - 1 : Math.min(map.rows - 1, Math.max(height * scaleY - 1, middle.row + Math.floor((height * scaleY) / 2)))

  const places = knownPlaces(world)
  const zones = places.filter((p) => p.zone)
  const seen = seenBits(world, map)
  const rows: MapCell[][] = []
  const labels: MapView['labels'] = []
  for (let y = 0; y < height; y++) {
    const row: MapCell[] = []
    for (let x = 0; x < width; x++) {
      const block: Hex[] = []
      for (let dx = 0; dx < scaleX; dx++) for (let dy = 0; dy < scaleY; dy++) block.push({ col: left + x * scaleX + dx, row: top - y * scaleY - dy })
      row.push(cellFor(world, map, block, you, zones, seen))
    }
    rows.push(row)
  }
  // Places the player knows exactly get their initial; heard-of places a question mark at the middle of the zone.
  for (const place of places) {
    let hex: Hex | undefined = place.hex
    if (!hex && place.zone) hex = { col: Math.round((place.zone.x - map.size / 2) / map.size), row: Math.round((place.zone.y - map.size / 2) / map.size) }
    if (!hex) continue
    const x = Math.floor((hex.col - left) / scaleX)
    const y = Math.floor((top - hex.row) / scaleY)
    if (x < 0 || y < 0 || x >= width || y >= height) continue
    const cell = rows[y]![x]!
    if (cell.cls === 'you') continue
    rows[y]![x] = place.hex ? { ch: place.name.replace(/^the /i, '')[0]!.toUpperCase(), cls: 'place' } : { ch: '?', cls: 'zone' }
    labels.push({ name: place.name, status: place.status, x, y })
  }
  if (options.mark) {
    const x = Math.floor((options.mark.col - left) / scaleX)
    const y = Math.floor((top - options.mark.row) / scaleY)
    if (x >= 0 && y >= 0 && x < width && y < height && rows[y]![x]!.cls !== 'you') rows[y]![x] = { ch: '*', cls: 'mark' }
  }
  return { rows, labels, legend: legend(world, map, places) }
}

function cellFor(world: World, map: RegionMap, block: Hex[], you: Hex | undefined, zones: ReturnType<typeof knownPlaces>, seenHexes: Uint8Array): MapCell {
  if (you && block.some((h) => h.col === you.col && h.row === you.row)) return { ch: '@', cls: 'you' }
  const seen = block.filter((h) => map.inside(h) && hasSeen(world, map, h, seenHexes))
  if (seen.length === 0) {
    const inZone = zones.some((z) => block.some((h) => map.inside(h) && Math.hypot(centre(h, map.size)[0] - z.zone!.x, centre(h, map.size)[1] - z.zone!.y) <= z.zone!.km))
    return inZone ? { ch: '·', cls: 'zone' } : { ch: ' ', cls: 'unknown' }
  }
  const cells = seen.map((h) => map.cell(h)!)
  const way = cells.find((c) => c.way)
  if (way) return { ch: way.way!.kind === 'canal' ? '=' : way.way!.kind === 'road' ? ':' : ',', cls: 'way' }
  // The land most of the block is.
  const counts = new Map<string, number>()
  for (const c of cells) counts.set(c.land, (counts.get(c.land) ?? 0) + 1)
  const land = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0]
  return LAND[land] ?? { ch: '.', cls: 'fields' }
}

function legend(world: World, map: RegionMap, places: ReturnType<typeof knownPlaces>): string[] {
  const you = playerHex(world)
  const here = you ? centre(you, map.size) : undefined
  return places.map((place) => {
    if (place.status !== 'heard') return `${place.name}: ${place.status === 'visited' ? 'been there' : 'seen from afar'}${here && place.hex ? `, ${bearing(here, centre(place.hex, map.size))}` : ''}.`
    const zone = place.zone!
    const size = zone.km >= 3 ? 'somewhere' : zone.km >= 1 ? 'roughly' : 'close to'
    return `${place.name}: heard of, ${size} ${here ? bearing(here, [zone.x, zone.y]) : 'on the map'}${zone.tellers > 1 ? ` (${zone.tellers} people told you)` : ''}.`
  })
}

function bearing(from: [number, number], to: [number, number]): string {
  const km = Math.hypot(to[0] - from[0], to[1] - from[1])
  if (km < 0.3) return 'right here'
  const angle = (Math.atan2(to[0] - from[0], to[1] - from[1]) * 180) / Math.PI
  const winds = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
  const wind = winds[Math.round(((angle + 360) % 360) / 45) % 8]!
  return `${km < 1 ? 'less than a kilometre' : `about ${Math.round(km)} km`} ${wind}`
}

/** The map as text, for the terminal and the MAP command. */
export function mapText(world: World, whole = true): string {
  const view = mapView(world, whole ? { width: 60, height: 20, whole: true } : { width: 40, height: 14 })
  if (!view) return 'There is no map of this land.'
  const lines = view.rows.map((row) => row.map((c) => c.ch).join('').replace(/\s+$/, ''))
  return [...lines, '', '@ you   " fen   ~ water   T woods   ^ heath   . fields   = tow path   : road   , path   ? heard of', ...view.legend].join('\n')
}

