import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { mapStepRequest, readMapStep, withoutMap } from '../src/engine'
import { regionMap } from '../src/engine/map/region'
import { readContentFiles } from '../src/node/content'

// M10.26, the map cheaper (Bram: $0.27 for a wrong first map and $0.12 for the
// good one on Opus). The layout is code; the painting is a table, measured on
// The Quiet Reach and Skerrow with Sonnet 5 and Haiku 4.5
// (docs/worldbuild/cost-measure.md). The recorded replies of The Quiet Reach
// are read again here as the game reads them.

const dir = resolve(import.meta.dirname, 'fixtures/worldbuild/quiet-reach-map')
const quiet = async () => withoutMap(await readContentFiles(resolve(import.meta.dirname, '../content'), 'quietreach'))

describe('M10.26: the map painted as a table, on the lighter model', () => {
  it('goes to the lighter model the player chose, with the instruction and the world as the cached part', async () => {
    const { request } = mapStepRequest(await quiet(), 'Map the Vesper Coast.')
    expect(request).toMatchObject({ schemaName: 'map_paint', tier: 'light', effort: 'low', role: 'chronicler' })
    expect(request!.cacheBreak).toBe(request!.system.length)
  })

  it('reads each recorded reply of The Quiet Reach as it was judged, and the lighter model\'s map as Bram\'s words have it', async () => {
    const files = await quiet()
    const { layout } = mapStepRequest(files, '')
    const recorded = readdirSync(dir).map((f) => ({ f, e: JSON.parse(readFileSync(join(dir, f), 'utf8')) as { model: string; reply: string; problems: string[] } }))
    expect(recorded.length).toBeGreaterThanOrEqual(4)
    for (const { f, e } of recorded) expect(readMapStep(files, layout, e.reply).problems, f).toEqual(e.problems)
    // Sonnet 5 loads every time; its first map has the sea on the west, the ridge on the high rock, the port on the basalt.
    for (const { e } of recorded.filter((r) => r.e.model === 'claude-sonnet-5')) expect(e.problems).toEqual([])
    const first = recorded.find((r) => /claude-sonnet-5-1\.json$/.test(r.f))!
    const content = readMapStep(files, layout, first.e.reply).result!.content!
    const map = regionMap(content)!
    const land = (area: string) => content.world.map!.palette!.names[map.cell(map.places.get(area)!)!.terrain!]
    expect([land('orison_ridge'), land('port_vesper')]).toEqual(['high rock', 'black basalt'])
    expect([...Array(map.rows).keys()].filter((row) => map.cell({ col: 0, row })!.land === 'water').length).toBeGreaterThan(map.rows / 2)
  })
})
