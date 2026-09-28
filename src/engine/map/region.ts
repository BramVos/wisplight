import type { Content, Region } from '../content'
import { centre, distance, type Hex, hexAt, hexKey, line, neighbours } from './hexgrid'

// The region map (FO, chapter 4, "De streekkaart"): the generator fills every
// hex of 250 m from the designer's zone drawing, with a fixed seed, so the
// same content always gives the same land. Roads, tow paths and fen paths are
// lines through it; the places of the content sit on their own hexes; the
// rules of the region (a hidden ridge, channels) are laid over the top.

export type Terrain = 'woods' | 'fields' | 'fen' | 'water' | 'heath' | 'road' | 'canal' | 'path'
export type Feature = 'pool' | 'peat_pit' | 'willow' | 'ruin' | 'hummock'

export interface Cell {
  col: number
  row: number
  /** The land itself; a road or path lies on top of it. */
  land: Terrain
  /** The main road, tow path or fen path through this hex, if any. */
  way?: { kind: 'road' | 'canal' | 'path'; name: string }
  /** Every way through this hex, with its place along that way: where two meet, both. */
  ways?: { kind: 'road' | 'canal' | 'path'; name: string; at: number }[]
  feature?: Feature
  /** Soft ground that swallows a leg. */
  bog: boolean
  /** Part of a hidden path; only whoever knows the topic sees and uses it. */
  hidden?: string
  /** Water that only a punt crosses. */
  channel?: boolean
  /** The area whose place stands on this hex. */
  place?: string
  /** Ways on other levels through this hex (M10): a tunnel beneath it, a walk through the crowns above. */
  levels?: { level: string; kind: 'road' | 'canal' | 'path'; name: string; topic?: string }[]
  /** Where a way goes up or down to another level from here (M10): a stair, a well, a ladder, a trunk. */
  stairs?: { level: string; topic?: string }[]
}

export class RegionMap {
  readonly cols: number
  readonly rows: number
  readonly size: number
  private readonly cells: Cell[]
  /** Area id to the hex of its place. */
  readonly places = new Map<string, Hex>()
  /** Location id to its hex. */
  readonly locations = new Map<string, Hex>()
  private readonly placeAt = new Map<string, string>()

  constructor(
    readonly content: Content,
    readonly region: Region,
  ) {
    this.size = region.hex
    this.cols = Math.round(region.size[0] / region.hex)
    this.rows = Math.round(region.size[1] / region.hex)
    this.cells = []
    const zones = new Zones(region)
    for (let col = 0; col < this.cols; col++) {
      for (let row = 0; row < this.rows; row++) {
        const [x, y] = centre({ col, row }, this.size)
        this.cells.push(this.fill(col, row, zones.at(x, y)))
      }
    }
    this.placeAreas()
    this.layPaths()
    this.applyRules()
  }

  inside(hex: Hex): boolean {
    return hex.col >= 0 && hex.col < this.cols && hex.row >= 0 && hex.row < this.rows
  }

  cell(hex: Hex): Cell | undefined {
    return this.inside(hex) ? this.cells[hex.col * this.rows + hex.row] : undefined
  }

  /** National km to km within the region. */
  local(pos: readonly [number, number]): [number, number] {
    return [pos[0] - this.region.origin[0], pos[1] - this.region.origin[1]]
  }

  national(local: readonly [number, number]): [number, number] {
    return [local[0] + this.region.origin[0], local[1] + this.region.origin[1]]
  }

  hexOf(pos: readonly [number, number]): Hex {
    const [x, y] = this.local(pos)
    return hexAt(x, y, this.size)
  }

  /** Where a hex lies, in national km. */
  posOf(hex: Hex): [number, number] {
    return this.national(centre(hex, this.size))
  }

  /** The area whose place stands on this hex. */
  placeOn(hex: Hex): string | undefined {
    return this.placeAt.get(hexKey(hex))
  }

  // ------------------------------------------------------------ generation

  private fill(col: number, row: number, land: Terrain): Cell {
    const r = (salt: number) => noise(this.region.seed, col, row, salt)
    const cell: Cell = { col, row, land, bog: false }
    if (land === 'fen') {
      const roll = r(1)
      cell.feature = roll < 0.1 ? 'pool' : roll < 0.17 ? 'peat_pit' : roll < 0.22 ? 'willow' : roll < 0.23 ? 'ruin' : roll < 0.35 ? 'hummock' : undefined
      cell.bog = cell.feature !== 'hummock' && r(2) < 0.09
    } else if (land === 'fields') {
      cell.feature = r(1) < 0.04 ? 'willow' : undefined
    } else if (land === 'heath') {
      cell.feature = r(1) < 0.02 ? 'ruin' : undefined
    }
    return cell
  }

  private placeAreas(): void {
    for (const area of [...this.content.areas.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      if (!area.pos || area.id === this.region.area) continue
      const hex = this.hexOf(area.pos)
      if (!this.inside(hex)) continue
      this.places.set(area.id, hex)
      this.settle(hex, area.id)
    }
    for (const location of [...this.content.locations.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      const area = this.content.areas.get(location.area)
      const pos = location.pos ?? area?.pos
      if (!pos || location.area === this.region.area) continue
      const hex = this.hexOf(pos)
      if (!this.inside(hex)) continue
      this.locations.set(location.id, hex)
      if (location.pos) this.settle(hex, location.area)
    }
  }

  /** A place stands on dry ground. */
  private settle(hex: Hex, area: string): void {
    const cell = this.cell(hex)!
    if (!this.placeAt.has(hexKey(hex))) this.placeAt.set(hexKey(hex), area)
    if (cell.land === 'water') cell.land = 'fields'
    cell.bog = false
    cell.feature = undefined
  }

  private point(via: string | readonly [number, number]): [number, number] | undefined {
    if (typeof via !== 'string') return [via[0], via[1]]
    const hex = this.places.get(via)
    return hex ? centre(hex, this.size) : undefined
  }

  private layPaths(): void {
    for (const path of this.region.paths) {
      const points = path.via.map((v) => this.point(v)).filter((p): p is [number, number] => Boolean(p))
      const hexes: Hex[] = []
      for (let i = 0; i + 1 < points.length; i++) {
        const a = hexAt(points[i]![0], points[i]![1], this.size)
        const b = hexAt(points[i + 1]![0], points[i + 1]![1], this.size)
        for (const hex of line(a, b)) if (!hexes.length || hexKey(hexes.at(-1)!) !== hexKey(hex)) hexes.push(hex)
      }
      if (path.level && path.level !== 'surface') {
        // A way on another level leaves the ground as it is; its ends lead up or down (M10).
        for (const hex of hexes) {
          const cell = this.cell(hex)
          if (!cell) continue
          cell.levels ??= []
          if (!cell.levels.some((l) => l.name === path.name)) cell.levels.push({ level: path.level, kind: path.kind, name: path.name, ...(path.topic ? { topic: path.topic } : {}) })
        }
        for (const end of [hexes[0], hexes.at(-1)]) {
          const cell = end ? this.cell(end) : undefined
          if (cell) (cell.stairs ??= []).push({ level: path.level, ...(path.topic ? { topic: path.topic } : {}) })
        }
        continue
      }
      hexes.forEach((hex, at) => this.lay(hex, path, at))
    }
  }

  private lay(hex: Hex, path: Region['paths'][number], at: number): void {
    const cell = this.cell(hex)
    if (!cell) return
    cell.ways ??= []
    if (!cell.ways.some((w) => w.name === path.name)) cell.ways.push({ kind: path.kind, name: path.name, at })
    // The main way of a hex: the tow path over a road over a path.
    if (!cell.way || cell.way.kind === 'path' || path.kind === 'canal') cell.way = { kind: path.kind, name: path.name }
    if (cell.land === 'water') cell.land = 'fields'
    cell.bog = false
    if (cell.feature === 'pool' || cell.feature === 'peat_pit') cell.feature = undefined
  }

  private applyRules(): void {
    for (const rule of this.region.rules) {
      if (rule.kind === 'hidden_path') this.hiddenPath(rule.topic, rule.from, rule.to)
      if (rule.kind === 'channels') this.channels(rule.from, rule.to)
    }
  }

  /** A winding line of dry ground between two places, laid with the seed. */
  private hiddenPath(topic: string, from: string, to: string): void {
    const start = this.places.get(from)
    const end = this.places.get(to)
    if (!start || !end) return
    // Four legs, each bend pushed a little aside, so it winds without wandering off.
    const [ax, ay] = centre(start, this.size)
    const [bx, by] = centre(end, this.size)
    const length = Math.hypot(bx - ax, by - ay)
    const [px, py] = [-(by - ay) / length, (bx - ax) / length]
    const bends: Hex[] = [start]
    for (let i = 1; i < 4; i++) {
      const push = (noise(this.region.seed, i, start.col + end.col, 13) - 0.5) * 1.5
      bends.push(hexAt(ax + ((bx - ax) * i) / 4 + px * push, ay + ((by - ay) * i) / 4 + py * push, this.size))
    }
    bends.push(end)
    for (let i = 0; i + 1 < bends.length; i++) {
      for (const hex of line(bends[i]!, bends[i + 1]!)) {
        const cell = this.cell(hex)
        if (!cell) continue
        cell.hidden = topic
        if (this.placeOn(hex)) continue
        if (cell.land === 'water') cell.land = 'fen'
        cell.bog = false
        if (cell.feature === 'pool' || cell.feature === 'peat_pit') cell.feature = 'hummock'
      }
    }
  }

  /** Channels of open water across the fen between two places. */
  private channels(from: string, to: string): void {
    const a = this.places.get(from)
    const b = this.places.get(to)
    if (!a || !b) return
    const [ax, ay] = centre(a, this.size)
    const [bx, by] = centre(b, this.size)
    for (const cell of this.cells) {
      if (cell.land !== 'fen' || cell.way || cell.hidden || this.placeOn(cell)) continue
      const [x, y] = centre(cell, this.size)
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)))
      const d = Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)))
      if (t > 0.15 && t < 0.85 && d < 1 && noise(this.region.seed, cell.col, cell.row, 9) < 0.55) {
        cell.land = 'water'
        cell.channel = true
        cell.feature = undefined
      }
    }
  }
}

/** Reads the zone drawing: one character per 0.5 km east-west and 1 km north-south. */
class Zones {
  private readonly rows: string[]

  constructor(private readonly region: Region) {
    this.rows = region.zones.split('\n').filter((line) => line.length > 0)
  }

  at(x: number, y: number): Terrain {
    const top = this.region.size[1]
    const row = this.rows[Math.max(0, Math.min(this.rows.length - 1, Math.round(top - y)))] ?? ''
    const col = Math.max(0, Math.floor(x / 0.5))
    return this.land(row, col)
  }

  /** The land under a character; names, markers, gaps and lines take the land beside them. */
  private land(row: string, col: number): Terrain {
    for (let d = 0; d < row.length + 1; d++) {
      for (const c of [col - d, col + d]) {
        const kind = this.region.legend[row[c] ?? '']
        if (kind && kind !== 'road' && kind !== 'canal' && kind !== 'path') return kind
      }
    }
    return 'fields'
  }
}

/** A fixed pseudo-random number in [0, 1) for a hex. */
export function noise(seed: number, col: number, row: number, salt: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0
  for (const v of [col, row, salt]) {
    h = Math.imul(h ^ v, 0x85ebca6b) >>> 0
    h ^= h >>> 13
    h = Math.imul(h, 0xc2b2ae35) >>> 0
    h ^= h >>> 16
  }
  // Unsigned (M10): the last xor can leave the sign bit set, and half the draws came out below zero, so
  // 59 per cent of the fen had a pool where 10 was meant (the map review of 27 September 2026).
  return (h >>> 0) / 0x100000000
}

const maps = new WeakMap<Content, Map<string, RegionMap>>()

/** The region map of a region (the first one by default), built once per content. */
export function regionMap(content: Content, id?: string): RegionMap | undefined {
  const region = id ? content.regions.get(id) : [...content.regions.values()][0]
  if (!region) return undefined
  let cache = maps.get(content)
  if (!cache) maps.set(content, (cache = new Map()))
  let map = cache.get(region.id)
  if (!map) cache.set(region.id, (map = new RegionMap(content, region)))
  return map
}
