import { describe, expect, it } from 'vitest'
import { Engine, loadContent, type Content } from '../src/engine'
import { warnings as builderWarnings } from '../src/engine/builder'
import { landMapData } from '../src/engine/map/known'
import { regionMap } from '../src/engine/map/region'
import { hexId } from '../src/engine/map/travel'
import { hexMapData, previewMapData } from '../src/engine/map/view'
import { DEFAULT_PALETTE } from '../src/engine/map/palette'
import { readContentFiles } from '../src/node/content'
import { content } from './helpers'

// M10.21: the edge of the region. Whoever walks to the edge of the map reads
// what the world book says lies beyond it, and may go on (on foot in days, or
// by a line) or turn back; the map draws the edge as an edge; the land map
// marks a far place that is only a sketch with a question mark.

const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

async function at(engine: Engine, location: string): Promise<void> {
  await engine.handle(`@goto ${location}`)
}

describe('M10.21: the edge of the region', () => {
  it('tells what lies beyond the west edge of the Holleveen, and goes on to Graafhaven on foot', async () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    engine.start()
    await at(engine, 'loc_oude_zijl_sluice')
    await engine.handle('head west')
    const edge = said(await engine.handle('head west'))
    expect(edge).toMatch(/You have come to the edge of the Holleveen\./)
    expect(edge).toContain('West, the fen runs on to the Great Dyke')
    const options = engine.state.choice!.options.map((o) => o.label)
    expect(options[0]).toMatch(/^Go on to Graafhaven on foot, about 2 days west/)
    expect(options.some((o) => /barge/i.test(o))).toBe(true)
    expect(options.at(-1)).toBe('Turn back east')
    // The line named it: the stranger knows of Graafhaven now.
    expect(engine.state.player.journal?.['graafhaven']).toBeDefined()
    const on = said(await engine.handle('1'))
    expect(on).toMatch(/You leave the Holleveen behind and go on across country for Graafhaven/)
    expect(engine.world.location(engine.state.player.location).name).toMatch(/Graafhaven/)
  })

  it('says only what lies beyond where the world book names no road, and offers nothing to make', async () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    engine.start()
    const map = regionMap(content)!
    engine.state.player.location = hexId({ col: 60, row: 0 })
    const out = said(await engine.handle('head south'))
    expect(out).toContain('drowned Saeftinge shows at low tide. No road you know of goes that way.')
    expect(engine.state.choice).toBeUndefined()
    expect(map.inside({ col: 60, row: 0 })).toBe(true)
    // Nothing was worked out by walking up to it.
    expect(engine.state.outlines?.pending ?? []).toEqual([])
    expect(engine.state.growth?.farPending ?? []).toEqual([])
  })

  it('says that nobody has told the stranger at an edge without a line, and offers the far places they know that way', async () => {
    const bare: Content = { ...content, regions: new Map([...content.regions].map(([id, r]) => [id, { ...r, beyond: [] }])) }
    const engine = new Engine(bare, { seed: 3, builder: true })
    engine.start()
    engine.state.player.location = hexId({ col: 0, row: 60 })
    const unknown = said(await engine.handle('head west'))
    expect(unknown).toContain('Beyond it the land runs on west, and nobody has told you yet what lies that way.')
    expect(engine.state.choice).toBeUndefined()
    ;(engine.state.player.journal ??= {})['graafhaven'] = engine.world.now
    engine.state.player.location = hexId({ col: 0, row: 60 })
    await engine.handle('head west')
    expect(engine.state.choice?.options[0]?.label).toMatch(/^Go on to Graafhaven on foot/)
    expect(builderWarnings(bare).join('\n')).toMatch(/the north, east, south, west edges say nothing of what lies beyond/)
    expect(builderWarnings(content).join('\n')).not.toMatch(/say nothing of what lies beyond/)
  })

  it("tells Skerrow's edges in the island's words, with the packet to Havenmoor as the way on", async () => {
    const isle = loadContent(await readContentFiles('content', 'isle'))
    const engine = new Engine(isle, { seed: 3, builder: true })
    engine.start()
    const map = regionMap(isle)!
    // Out on the water with a boat, at the east edge.
    engine.state.player.location = hexId({ col: map.cols - 1, row: 12 })
    ;(engine.state.player.hired ??= {})['boat'] = { until: engine.world.now + 24 * 60, crosses: ['water'] } as never
    const out = said(await engine.handle('head east'))
    expect(out).toContain('Havenmoor, the harbour town, lies two days')
    expect(out).not.toMatch(/Holleveen|Graafhaven|peat/)
  })

  it('draws the edge on the map, with the far places beyond each side that the stranger knows of', async () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    engine.start()
    const data = hexMapData(engine.world, { whole: true })!
    const map = regionMap(content)!
    expect(data.edge).toMatchObject({ cols: map.cols, rows: map.rows, beyond: [] })
    ;(engine.state.player.journal ??= {})['zwolderkamp'] = engine.world.now
    expect(hexMapData(engine.world, { whole: true })!.edge!.beyond).toEqual([{ side: 'east', names: ['Zwolderkamp'] }])
    // The designer's map shows every one.
    expect(previewMapData(content, content.world.map?.palette ?? DEFAULT_PALETTE, true).edge!.beyond.map((b) => b.side)).toEqual(['west', 'north', 'east'])
  })

  it('marks a far place on the land map as a sketch until it is worked out', async () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    engine.start()
    ;(engine.state.player.journal ??= {})['graafhaven'] = engine.world.now
    expect(landMapData(engine.world)!.places.find((p) => p.topic === 'graafhaven')?.level).toBe('sketch')
    await engine.handle('travel to Graafhaven on foot')
    expect(landMapData(engine.world)!.places.find((p) => p.topic === 'graafhaven')?.level).toBe('place')
  })

  it('counts a far place waiting for its words as work for the models', () => {
    const engine = new Engine(content, { seed: 3 })
    ;(engine.state.growth ??= {} as never).farPending = ['graafhaven']
    expect(engine.modelsWaiting).toBeGreaterThanOrEqual(1)
  })
})
