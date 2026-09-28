import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE, DEFAULT_SIGNS, MapPaletteSchema, signsOf, type MapPalette, type Sign } from '../src/engine/map/palette'
import { noise, regionMap, type Cell } from '../src/engine/map/region'
import { previewMapData } from '../src/engine/map/view'
import { describeHex, minutesFor } from '../src/engine/map/travel'
import { loadContentFromDir } from '../src/node/content'
import type { Content } from '../src/engine'
import { content, newEngine } from './helpers'

// M10.20: a world names the signs on its land (found building The Quiet Reach:
// the palette's signs were the Nethermarch's peat pits and willows, and there
// was no place for danger or uncertain). A sign has a shape, a colour per
// style, the land it lies on and how often, and what the stranger reads.

function cells(content: Content): Cell[] {
  const map = regionMap(content)!
  const all: Cell[] = []
  for (let col = 0; col < map.cols; col++) for (let row = 0; row < map.rows; row++) all.push(map.cell({ col, row })!)
  return all
}

/** The Nethermarch with other signs on its fen, and colours for them. */
function withSigns(signs: Record<string, Sign>, colours: Record<string, string> = {}): Content {
  const palette = content.world.map?.palette ?? DEFAULT_PALETTE
  const glyph = (style: 'dark' | 'paper') => ({ stairs: palette[style].glyph['stairs']!, ...Object.fromEntries(Object.keys(signs).map((id) => [id, colours[id] ?? '#aa3322'])) })
  const next: MapPalette = { ...palette, signs, dark: { ...palette.dark, glyph: glyph('dark') }, paper: { ...palette.paper, glyph: glyph('paper') } }
  return { ...content, world: { ...content.world, map: { levels: [], ...content.world.map, palette: next } } }
}

describe('M10.20: signs on the land per world', () => {
  it("lays the Nethermarch's signs exactly where the generator always did", () => {
    // The old rule, written out: on the fen a pool, peat pit, willow, old wall or hummock by one roll; a willow on fields; an old wall on heath.
    const seed = regionMap(content)!.region.seed
    const old = (cell: Cell) => {
      const roll = noise(seed, cell.col, cell.row, 1)
      if (cell.land === 'fen') return roll < 0.1 ? 'pool' : roll < 0.17 ? 'peat_pit' : roll < 0.22 ? 'willow' : roll < 0.23 ? 'ruin' : roll < 0.35 ? 'hummock' : undefined
      if (cell.land === 'fields') return roll < 0.04 ? 'willow' : undefined
      if (cell.land === 'heath') return roll < 0.02 ? 'ruin' : undefined
      return undefined
    }
    const untouched = cells(content).filter((c) => !c.way && !c.hidden && !c.channel && !c.place && !c.ways)
    expect(untouched.length).toBeGreaterThan(5000)
    const map = regionMap(content)!
    const differ = untouched.filter((c) => !map.placeOn(c) && c.feature !== old(c))
    expect(differ).toEqual([])
    expect(signsOf(content.world.map?.palette).map(([id]) => id)).toEqual(['pool', 'peat_pit', 'willow', 'ruin', 'hummock'])
  })

  it("lays a world's own signs by their shares, fills a wet one where a way runs, and makes firm ground of it on a hidden path", () => {
    const own = withSigns({
      reed: { name: 'reed bed', shape: 'tuft', on: { fen: 0.2 } },
      sink: { name: 'sinkhole', shape: 'warning', means: 'danger', on: { fen: 0.05 }, wet: true, text: 'The ground sags into a sinkhole here.' },
      tump: { name: 'tump', shape: 'knoll', on: { fen: 0.1 }, firm: true },
    })
    const all = cells(own)
    const fen = all.filter((c) => c.land === 'fen' && !c.way && !c.hidden)
    const share = (id: string) => fen.filter((c) => c.feature === id).length / fen.length
    expect(share('reed')).toBeGreaterThan(0.15)
    expect(share('reed')).toBeLessThan(0.25)
    expect(share('sink')).toBeGreaterThan(0.02)
    expect(share('sink')).toBeLessThan(0.08)
    expect(all.some((c) => ['pool', 'peat_pit', 'willow', 'ruin', 'hummock'].includes(c.feature ?? ''))).toBe(false)
    // Water in the ground is filled in where a way is laid; on the hidden ridge it becomes the firm sign.
    expect(all.filter((c) => c.way && c.feature === 'sink')).toEqual([])
    expect(all.filter((c) => c.hidden && c.feature === 'sink')).toEqual([])
    // The firm sign is never soft, and quicker to cross.
    expect(all.filter((c) => c.feature === 'tump' && c.bog)).toEqual([])
    const engine = newEngine(1, own)
    const tump = all.find((c) => c.feature === 'tump' && !c.way && c.land === 'fen')!
    const reed = all.find((c) => c.feature === 'reed' && !c.way && c.land === 'fen')!
    expect(minutesFor(engine.world, tump, false)).toBeLessThan(minutesFor(engine.world, reed, false))
    // What the stranger reads is the sign's own line.
    const sink = all.find((c) => c.feature === 'sink' && !c.way && !c.place)!
    expect(describeHex(engine.world, sink).text).toContain('The ground sags into a sinkhole here.')
  })

  it('shows the signs of a proposed palette on the preview before it is saved, by their place in the palette', () => {
    const palette = withSigns({ reed: { name: 'reed bed', shape: 'tuft', on: { fen: 0.3 } } }).world.map!.palette!
    const data = previewMapData(content, palette, true)
    const kept = new Set<number>()
    for (let i = 4; i < data.hexes.length; i += 5) kept.add((data.hexes[i]! >> 2) & 7)
    expect([...kept].sort()).toEqual([0, 1])
    // The saved palette still draws the Nethermarch's five.
    const saved = previewMapData(content, content.world.map?.palette ?? DEFAULT_PALETTE, true)
    const five = new Set<number>()
    for (let i = 4; i < saved.hexes.length; i += 5) five.add((saved.hexes[i]! >> 2) & 7)
    expect([...five].sort()).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('checks the signs of a palette: a colour for each, no stray ones, a known land, room on it, and at most seven', () => {
    const base = content.world.map?.palette ?? DEFAULT_PALETTE
    const problems = (p: unknown) => {
      const r = MapPaletteSchema.safeParse(p)
      return r.success ? [] : r.error.issues.map((i) => i.message)
    }
    expect(problems(base)).toEqual([])
    const shaft = { name: 'old mine shaft', shape: 'pit', means: 'danger', on: { fen: 0.02 } }
    expect(problems({ ...base, signs: { shaft } }).join(' ')).toMatch(/no colour for the sign shaft/)
    expect(problems({ ...base, signs: { shaft } }).join(' ')).toMatch(/glyph.pool: there is no sign pool/)
    const colours = (style: 'dark' | 'paper', extra: Record<string, string>) => ({ ...base[style], glyph: { stairs: '#111111', ...extra } })
    const good = { ...base, signs: { shaft }, dark: colours('dark', { shaft: '#cd786c' }), paper: colours('paper', { shaft: '#a8544a' }) }
    expect(problems(good)).toEqual([])
    expect(problems({ ...good, signs: { shaft: { ...shaft, on: { moor: 0.1 } } } }).join(' ')).toMatch(/there is no land moor/)
    expect(problems({ ...good, signs: { shaft: { ...shaft, on: { fen: 1.5 } } } }).length).toBeGreaterThan(0)
    const many = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`s${i}`, { name: `s${i}`, shape: 'rock', on: { fen: 0.2 } }]))
    const all = problems({ ...base, signs: many, dark: colours('dark', Object.fromEntries(Object.keys(many).map((k) => [k, '#123456']))), paper: colours('paper', Object.fromEntries(Object.keys(many).map((k) => [k, '#123456']))) }).join(' ')
    expect(all).toMatch(/at most 7 signs/)
    expect(all).toMatch(/the signs on fen take 160%/)
    expect(problems({ ...good, signs: { ...good.signs, stairs: shaft } }).join(' ')).toMatch(/stairs is the way up or down/)
    expect(problems({ ...good, signs: { shaft: { ...shaft, shape: 'volcano' } } }).length).toBeGreaterThan(0)
  })

  it('gives Skerrow and The Quiet Reach signs of their own, with danger and uncertain; Deepwell draws with the default', async () => {
    const isle = await loadContentFromDir('content', 'isle')
    const reach = await loadContentFromDir('content', 'quietreach')
    const deepwell = await loadContentFromDir('tests/worlds', 'other')
    const means = (c: Content) => Object.fromEntries(signsOf(c.world.map?.palette).filter(([, s]) => s.means).map(([id, s]) => [id, s.means]))
    expect(means(isle)).toEqual({ timbers: 'uncertain', sheer_drop: 'danger' })
    expect(means(reach)).toEqual({ mine_shaft: 'danger', structure: 'uncertain' })
    for (const c of [isle, reach]) expect(signsOf(c.world.map?.palette).some(([id]) => id in DEFAULT_SIGNS && id !== 'tide_pool')).toBe(false)
    // Deepwell names no signs: the preview of a world without a region draws the Nethermarch's five, the neutral default.
    expect(deepwell.world.map?.palette?.signs).toBeUndefined()
    const sample = previewMapData(deepwell, deepwell.world.map?.palette ?? DEFAULT_PALETTE)
    const used = new Set<number>()
    for (let i = 4; i < sample.hexes.length; i += 5) used.add((sample.hexes[i]! >> 2) & 7)
    expect(Math.max(...used)).toBe(5)
  })
})
