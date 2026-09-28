import { GameClock } from '../clock'
import type { Content } from '../content'
import { weather } from '../weather'
import type { World } from '../world'
import { centre, distance, hexAt, type Hex } from './hexgrid'
import { knownPlaces } from './known'
import { DEFAULT_PALETTE, SURFACE, TERRAIN_ORDER, terrainName, type MapPalette } from './palette'
import { noise, regionMap, type RegionMap } from './region'
import { freshBits, hasSeen, onKnownRidge, playerHex, seenBits, sight, trailAt, trailBits } from './travel'
import { moodOf } from '../quests/plans'
import { lodgingNow } from '../lodgings'

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
  // The hidden ridge (M10): a path for whoever knows it, fen for everyone else.
  if (cells.some((c) => onKnownRidge(world, c))) return { ch: ',', cls: 'way' }
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


// ---------------------------------------------------------------- the map in colour (M10)

/**
 * The map for the interface to draw (M10; FO, chapter 4, "Weergave"): every
 * hex the player knows, with its terrain, which of its tints (from its seed),
 * a feature, and how well it is remembered. What is in sight now is clear;
 * by day what was seen lately too; the rest, and at night or in mist all
 * beyond sight, in the vaguer tint. Ways and places on top; one level at a
 * time, and a way on another level the player does not know is not there.
 */
export interface HexMapData {
  /** The window, in hexes: the leftmost column and the northernmost row, and its size. */
  left: number
  top: number
  width: number
  height: number
  /** The level shown, and the levels the player knows a way on (the surface always). */
  level: string
  levels: { id: string; name: string }[]
  /** Terrain keys, as the hexes refer to them. */
  keys: string[]
  /** Per hex, five numbers: column, row, terrain (index in keys), tint (0 to 3), and flags (memory 0 seen long ago, 1 seen lately, 2 in sight now; feature times 4; the steps of your trail from it times 32: 1 north, 2 north-east, 4 south-east). */
  hexes: number[]
  /** The light now, and how many hexes the player sees (after the M10 playtest): the minimap draws night and mist with them; the map does not. */
  light: 'day' | 'night' | 'mist'
  sight: number
  ways: { c: number; r: number; kind: 'road' | 'path' | 'canal' | 'ridge' }[]
  stairs: { c: number; r: number; dir: 'up' | 'down' }[]
  you?: { c: number; r: number }
  /** mood: the mood its area is in (M10.11), a ring of colour on the map. */
  places: { name: string; kind: string; status: string; c: number; r: number; mood?: string; lodging?: boolean }[]
  zones: { name: string; c: number; r: number; hexes: number }[]
  /** The terrains in view, in the order of the legend, with this world's names. */
  legend: { key: string; name: string }[]
  palette: MapPalette
}

const FEATURES = ['', 'pool', 'peat_pit', 'willow', 'ruin', 'hummock']

export function hexMapData(world: World, options: { width?: number; height?: number; whole?: boolean; level?: string } = {}): HexMapData | undefined {
  const map = regionMap(world.content)
  if (!map) return undefined
  const you = playerHex(world)
  const width = options.whole ? map.cols : Math.min(map.cols, options.width ?? 41)
  const height = options.whole ? map.rows : Math.min(map.rows, options.height ?? 29)
  const left = options.whole || !you ? 0 : Math.max(0, Math.min(map.cols - width, you.col - Math.floor(width / 2)))
  const top = options.whole || !you ? map.rows - 1 : Math.min(map.rows - 1, Math.max(height - 1, you.row + Math.floor(height / 2)))
  const levels = (world.content.world.map?.levels ?? [{ id: SURFACE, name: 'ground level' }]).filter((l) => l.id === SURFACE || knowsLevel(world, map, l.id))
  const level = levels.some((l) => l.id === options.level) ? options.level! : SURFACE
  const seen = seenBits(world, map)
  const fresh = freshBits(world, map)
  const trail = trailBits(world, map)
  const range = you ? sight(world, map, map.cell(you)!) : 0
  const misty = ['fog', 'storm'].includes(weather(world))
  const light: HexMapData['light'] = misty ? 'mist' : new GameClock(world.now).isNight ? 'night' : 'day'
  const keys: string[] = []
  const keyOf = (k: string) => {
    let i = keys.indexOf(k)
    if (i < 0) i = keys.push(k) - 1
    return i
  }
  const hexes: number[] = []
  const ways: HexMapData['ways'] = []
  const stairs: HexMapData['stairs'] = []
  const bit = (bits: Uint8Array, i: number) => (bits[i >> 3]! & (1 << (i & 7))) !== 0
  for (let col = left; col < left + width; col++) {
    for (let row = top; row > top - height; row--) {
      const hex = { col, row }
      if (!map.inside(hex)) continue
      const i = col * map.rows + row
      if (!bit(seen, i)) continue
      const cell = map.cell(hex)!
      const now = you !== undefined && distance(you, hex) <= range
      // In sight now, seen lately, or long ago; what night and mist do with it is the minimap's.
      const memory = now ? 2 : bit(fresh, i) ? 1 : 0
      const ridge = onKnownRidge(world, cell)
      let key: string
      let feature = 0
      if (level === SURFACE) {
        key = ridge ? 'ridge' : cell.channel ? 'channel' : cell.land === 'fen' && cell.bog ? 'bog' : cell.land === 'fen' && cell.feature === 'hummock' ? 'hummock' : cell.land
        feature = cell.feature ? FEATURES.indexOf(cell.feature) : 0
        if (cell.way) ways.push({ c: col, r: row, kind: cell.way.kind })
        else if (ridge) ways.push({ c: col, r: row, kind: 'ridge' })
      } else {
        // Another level: its known ways, and the rest the dark rock or the empty air.
        const here = (cell.levels ?? []).find((l) => l.level === level && (!l.topic || knowsTopic(world, l.topic)))
        key = here ? (level === 'crown' ? 'crown' : 'tunnel') : 'unknown'
        if (here) ways.push({ c: col, r: row, kind: here.kind })
      }
      for (const s of cell.stairs ?? []) {
        if (s.topic && !knowsTopic(world, s.topic)) continue
        if (level === SURFACE) stairs.push({ c: col, r: row, dir: levelIndex(world, s.level) < levelIndex(world, SURFACE) ? 'down' : 'up' })
        else if (s.level === level) stairs.push({ c: col, r: row, dir: levelIndex(world, level) < levelIndex(world, SURFACE) ? 'up' : 'down' })
      }
      // The trail is the way you walked on the land, so only on the surface.
      const steps = level === SURFACE ? trailAt(trail, map, hex) : 0
      hexes.push(col, row, keyOf(key), Math.floor(noise(map.region.seed, col, row, 7) * 4), memory + feature * 4 + steps * 32)
    }
  }
  const places: HexMapData['places'] = []
  const zones: HexMapData['zones'] = []
  if (level === SURFACE) {
    for (const place of knownPlaces(world)) {
      const areaId = place.topic.startsWith('area_') ? place.topic.slice(5) : [...world.content.areas.values()].find((a) => a.topic === place.topic)?.id
      const kind = world.content.areas.get(areaId ?? '')?.kind ?? 'place'
      const mood = moodOf(world, areaId)?.kind
      // Where the stranger lodges (M10.13): a mark of its own.
      const lodging = lodgingNow(world)
      const yours = lodging && world.content.locations.get(lodging.at)?.area === areaId
      if (place.hex) places.push({ name: place.name, kind, status: place.status, c: place.hex.col, r: place.hex.row, ...(mood ? { mood } : {}), ...(yours ? { lodging: true } : {}) })
      else if (place.zone) {
        const h = hexAt(place.zone.x, place.zone.y, map.size)
        zones.push({ name: place.name, c: h.col, r: h.row, hexes: Math.max(1, Math.round(place.zone.km / map.size)) })
      }
    }
  }
  const palette = world.content.world.map?.palette ?? DEFAULT_PALETTE
  const present = new Set(keys)
  const legend = [...TERRAIN_ORDER.filter((k) => present.has(k)), ...keys.filter((k) => !TERRAIN_ORDER.includes(k) && k !== 'unknown')].map((key) => ({ key, name: terrainName(palette, key) }))
  return { left, top, width, height, level, levels, keys, hexes, light, sight: range, ways, stairs, ...(you ? { you: { c: you.col, r: you.row } } : {}), places, zones, legend, palette }
}

function knowsTopic(world: World, topic: string): boolean {
  return (world.state.player.journal ?? {})[topic] !== undefined
}

/** Whether the player knows a way on this level: one without a topic, or whose topic they know. */
function knowsLevel(world: World, map: RegionMap, level: string): boolean {
  for (let col = 0; col < map.cols; col++) for (let row = 0; row < map.rows; row++) for (const l of map.cell({ col, row })!.levels ?? []) if (l.level === level && (!l.topic || knowsTopic(world, l.topic))) return true
  return false
}

function levelIndex(world: World, level: string): number {
  const list = world.content.world.map?.levels ?? [{ id: SURFACE, name: 'ground level' }]
  const i = list.findIndex((l) => l.id === level)
  return i < 0 ? 0 : i
}

/**
 * A map to try a palette on, in the editor (M10): a stretch of the world's
 * own region, all of it known and clear, or, for a world without a region
 * map, a sample with a band for every terrain of the palette.
 */
export function previewMapData(content: Content, palette: MapPalette, whole = false): HexMapData {
  const map = regionMap(content)
  const keys: string[] = []
  const keyOf = (k: string) => {
    let i = keys.indexOf(k)
    if (i < 0) i = keys.push(k) - 1
    return i
  }
  const hexes: number[] = []
  const ways: HexMapData['ways'] = []
  const places: HexMapData['places'] = []
  if (map) {
    // A window around the start, or the whole region (the world book's map, M10.20).
    const width = whole ? map.cols : Math.min(map.cols, 64)
    const height = whole ? map.rows : Math.min(map.rows, 40)
    const start = map.places.get(content.locations.get(content.world.start.location)?.area ?? '') ?? { col: Math.floor(map.cols / 2), row: Math.floor(map.rows / 2) }
    const left = Math.max(0, Math.min(map.cols - width, start.col - Math.floor(width / 2)))
    const top = Math.min(map.rows - 1, Math.max(height - 1, start.row + Math.floor(height / 2)))
    for (let col = left; col < left + width; col++) {
      for (let row = top; row > top - height; row--) {
        const cell = map.cell({ col, row })
        if (!cell) continue
        const key = cell.hidden ? 'ridge' : cell.channel ? 'channel' : cell.land === 'fen' && cell.bog ? 'bog' : cell.land === 'fen' && cell.feature === 'hummock' ? 'hummock' : cell.land
        hexes.push(col, row, keyOf(key), Math.floor(noise(map.region.seed, col, row, 7) * 4), 2 + (cell.feature ? FEATURES.indexOf(cell.feature) : 0) * 4)
        if (cell.way) ways.push({ c: col, r: row, kind: cell.way.kind })
      }
    }
    for (const [area, hex] of map.places) {
      if (hex.col < left || hex.col >= left + width || hex.row > top || hex.row <= top - height) continue
      const a = content.areas.get(area)
      if (a) places.push({ name: a.name, kind: a.kind, status: 'visited', c: hex.col, r: hex.row })
    }
    return { left, top, width, height, level: SURFACE, levels: [{ id: SURFACE, name: 'ground level' }], keys, hexes, light: 'day', sight: 99, ways, stairs: [], places, zones: [], legend: legendOf(keys, palette), palette }
  }
  // No region map: a band for every terrain the palette names, and a road across.
  const terrains = [...TERRAIN_ORDER.filter((k) => palette.dark.terrain[k]), ...Object.keys(palette.dark.terrain).filter((k) => !TERRAIN_ORDER.includes(k))]
  const width = 36
  const band = 3
  const height = Math.max(6, terrains.length * band)
  for (let col = 0; col < width; col++) {
    for (let row = height - 1; row >= 0; row--) {
      const key = terrains[Math.min(terrains.length - 1, Math.floor((height - 1 - row) / band))] ?? 'fields'
      const feature = noise(7, col, row, 1) < 0.12 ? 1 + Math.floor(noise(7, col, row, 2) * 5) : 0
      hexes.push(col, row, keyOf(key), Math.floor(noise(7, col, row, 7) * 4), 2 + feature * 4)
      if (col === Math.floor(width / 3)) ways.push({ c: col, r: row, kind: 'road' })
    }
  }
  return { left: 0, top: height - 1, width, height, level: SURFACE, levels: [{ id: SURFACE, name: 'ground level' }], keys, hexes, light: 'day', sight: 99, ways, stairs: [], places: [], zones: [], legend: legendOf(keys, palette), palette }
}

function legendOf(keys: string[], palette: MapPalette): { key: string; name: string }[] {
  const present = new Set(keys)
  return [...TERRAIN_ORDER.filter((k) => present.has(k)), ...keys.filter((k) => !TERRAIN_ORDER.includes(k))].map((key) => ({ key, name: terrainName(palette, key) }))
}
