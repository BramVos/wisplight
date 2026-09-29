import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent, MockLlm } from '../src/engine'
import { regionMap } from '../src/engine/map/region'
import { simulate } from '../src/engine/playtest'
import { mapFixRequest, mapStepRequest, readMapStep } from '../src/engine/editor'
import { readContentFiles } from '../src/node/content'

// M10.25: the map belongs to the world build. After the last step the editor
// lays the region map out from the places and has the Palette step paint it,
// as one proposal with a diff, as the steps have.

const deepwell = () => readContentFiles(resolve(import.meta.dirname, 'worlds'), 'other')

describe('M10.25: the map after the world steps', () => {
  it('lays a world without a map out from its places and has it painted as a table, in one proposal', async () => {
    const files = await deepwell()
    expect(loadContent(files).regions.size).toBe(0)
    const { layout, request } = mapStepRequest(files, 'Ice under a black sky; the Domes glow, the rest is dark rock.')
    expect(layout.changes.some((c) => c.kind === 'region')).toBe(true)
    // M10.26: a table of its own, not the whole Palette step; the instruction and the world are the cached part.
    expect(request!.schemaName).toBe('map_paint')
    expect(request!.meta).toMatchObject({ step: 'map' })
    expect(request!.cacheBreak).toBe(request!.system.length)
    expect(request!.system).toMatch(/^YOU PAINT THE REGION MAP OF A WORLD WITH ITS DESIGNER, AS A TABLE/)
    expect(request!.system).toMatch(/THE DESIGNER SAYS: Ice under a black sky/)
    // Where each place falls in the drawing, so the painter knows which row is the north (M10.25, The Quiet Reach).
    expect(request!.system).toMatch(/WHERE THE PLACES LIE IN THE DRAWING \(row from the top, which is the north[^)]*\): [^;]+ row \d+, column \d+/)
    const table = (await new MockLlm().complete(request!)).text
    const draft = readMapStep(files, layout, table)
    expect(draft.problems).toEqual([])
    const content = draft.result!.content!
    const region = [...content.regions.values()][0]!
    expect(region.lands['open_sea']).toMatchObject({ like: 'water' })
    expect(content.world.map!.palette!.names['open_sea']).toBe('open sea')
    expect(content.world.map!.palette!.dark.terrain['open_sea']![0]).toBe('#23495e')
    // What the layout set stays: its size and where it lies; the drawing keeps its rows and width.
    const laid = loadContent(layout.result!.files).regions.get(region.id)!
    expect([region.size, region.origin]).toEqual([laid.size, laid.origin])
    expect(region.zones.split('\n').filter(Boolean).map((r) => r.length)).toEqual(laid.zones.split('\n').filter(Boolean).map((r) => r.length))
  })

  it('says what does not fit the drawing, and a second try reads the cached part again with what stood wrong', async () => {
    const files = await deepwell()
    const { layout, request } = mapStepRequest(files, '')
    const good = JSON.parse((await new MockLlm().complete(request!)).text) as { drawing: string[] }
    // A row or a character or two off is made to size and said; more is a drawing of another size, for the fix round.
    const nearly = readMapStep(files, layout, JSON.stringify({ ...good, drawing: good.drawing.slice(1).map((r) => r.slice(1)) }))
    expect(nearly.problems).toEqual([])
    expect(nearly.say).toMatch(/The drawing came as \d+ rows of \d+ characters and is made \d+ of \d+/)
    const short = JSON.stringify({ ...good, drawing: good.drawing.slice(3) })
    expect(readMapStep(files, layout, short).problems[0]).toMatch(/^the drawing has \d+ rows; it needs \d+/)
    // A name written in the drawing takes the land beside it, as the map reads it, and the proposal says so.
    const named = readMapStep(files, layout, JSON.stringify({ ...good, drawing: good.drawing.map((r, i) => (i ? r : `X${r.slice(1)}`)) }))
    expect(named.problems).toEqual([])
    expect(named.say).toMatch(/The drawing has X, which is no land: the map reads each as the land beside it/)
    const again = mapFixRequest(files, '', short, ['the drawing has one row too few', 'Orison Ridge should stand on the high rock'])!
    expect(again.system).toBe(request!.system)
    expect(again.cacheBreak).toBe(request!.cacheBreak)
    expect(again.prompt).toMatch(/YOUR TABLE AS IT STANDS:[\s\S]*WHAT STOOD WRONG:\n- the drawing has one row too few\n- Orison Ridge should stand on the high rock/)
  })

  it('gave The Quiet Reach its map in the app, painted from Bram\'s own words, and it plays', async () => {
    const content = loadContent(await readContentFiles(resolve(import.meta.dirname, '../content'), 'quietreach'))
    const map = regionMap(content)!
    expect(Object.keys(map.region.lands ?? {}).sort()).toEqual(['beds', 'highland', 'ocean', 'scrub', 'shallows', 'volcanic'])
    // The sea to the west, the ridge on the high rock, the port on the basalt by the coast.
    expect(map.cell({ col: 0, row: 0 })!.terrain).toBe('ocean')
    const on = (area: string) => map.cell(map.places.get(area)!)!.terrain
    expect([on('orison_ridge'), on('port_vesper')]).toEqual(['highland', 'volcanic'])
    const engine = new Engine(content, { seed: 1 })
    expect(engine.world.content.regions.size).toBe(1)
    expect(simulate(content, 3).problems).toEqual([])
  }, 120_000)
})
