import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent, MockLlm } from '../src/engine'
import { regionMap } from '../src/engine/map/region'
import { simulate } from '../src/engine/playtest'
import { mapStepRequest, readMapStep } from '../src/engine/editor'
import { readContentFiles } from '../src/node/content'

// M10.25: the map belongs to the world build. After the last step the editor
// lays the region map out from the places and has the Palette step paint it,
// as one proposal with a diff, as the steps have.

const deepwell = () => readContentFiles(resolve(import.meta.dirname, 'worlds'), 'other')

describe('M10.25: the map after the world steps', () => {
  it('lays a world without a map out from its places and has the Palette step paint it, in one proposal', async () => {
    const files = await deepwell()
    expect(loadContent(files).regions.size).toBe(0)
    const { layout, request } = mapStepRequest(files, 'Ice under a black sky; the Domes glow, the rest is dark rock.')
    expect(layout.changes.some((c) => c.kind === 'region')).toBe(true)
    expect(request.schemaName).toBe('world_step')
    expect(request.meta).toMatchObject({ step: 'palette', map: true })
    // The Palette step sees the region just laid out, and the designer's words.
    expect(request.prompt).toMatch(/Ice under a black sky/)
    expect(request.prompt).toMatch(/Paint the region map just laid out/)
    // Where each place falls in the drawing, so the painter knows which row is the north (M10.25, The Quiet Reach).
    expect(request.prompt).toMatch(/WHERE THE PLACES LIE IN THE DRAWING \(row from the top, which is the north[^)]*\): [^;]+ row \d+, column \d+/)
    const draft = readMapStep(files, layout, (await new MockLlm().complete(request)).text)
    expect(draft.problems).toEqual([])
    const content = draft.result!.content!
    expect(content.regions.size).toBe(1)
    expect(content.world.pictures?.style).toMatch(/Ice under a black sky/)
  })

  it('makes one change of a thing both the layout and the painting touch, the painting over the layout', async () => {
    const files = await deepwell()
    const { layout } = mapStepRequest(files, '')
    const region = layout.changes.find((c) => c.kind === 'region')!
    const reply = JSON.stringify({ say: 'Painted.', questions: [], changes: [{ kind: 'region', id: region.id, merge: true, yaml: 'name: The Crater Floor\n' }], world: '', rules: '', files: [] })
    const draft = readMapStep(files, layout, reply)
    expect(draft.problems).toEqual([])
    expect(draft.changes.filter((c) => c.kind === 'region')).toHaveLength(1)
    const made = draft.result!.content!.regions.get(region.id)!
    expect(made.name).toBe('The Crater Floor')
    // What the layout set stays: its drawing, its size and where it lies.
    const laid = loadContent(layout.result!.files).regions.get(region.id)!
    expect([made.zones, made.size, made.origin]).toEqual([laid.zones, laid.size, laid.origin])
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
