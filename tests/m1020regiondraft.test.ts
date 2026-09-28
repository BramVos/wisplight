import { describe, expect, it } from 'vitest'
import { draftResult } from '../src/engine/editor'
import { draftRegion, likeOf } from '../src/engine/map/regiondraft'
import { regionMap, type Cell } from '../src/engine/map/region'
import { describeHex, findPath, minutesFor } from '../src/engine/map/travel'
import { hexMapData } from '../src/engine/map/view'
import { simulate } from '../src/engine/playtest'
import { Engine, loadContent, type Content, type ContentFile } from '../src/engine'
import { readContentFiles } from '../src/node/content'

// M10.20: a step that makes the map (found building The Quiet Reach: no step
// made a region with its hexes, so the world played without a map). The
// places are laid out from their exits and minutes; a region's own terrains
// (black basalt, open sea) walk like one of the engine's lands.

async function withDraft(root: string, world: string): Promise<{ files: ContentFile[]; content: Content; notes: string[] }> {
  const files = await readContentFiles(root, world)
  const draft = draftRegion(loadContent(files))
  const result = draftResult(files, { changes: draft.changes, world: '', files: [] })
  expect(result.problems).toEqual([])
  expect(result.ok).toBe(true)
  return { files: result.files!, content: result.content!, notes: draft.notes }
}

describe('M10.20: a map from the places', () => {
  it('lays every area of The Quiet Reach and Deepwell on a hex of its own, and the world loads with it', async () => {
    for (const [root, world] of [
      ['content', 'quietreach'],
      ['tests/worlds', 'other'],
    ] as const) {
      const { content, notes } = await withDraft(root, world)
      const map = regionMap(content)!
      expect(map).toBeDefined()
      const lived = [...new Set([...content.locations.values()].map((l) => l.area))]
      const hexes = lived.map((a) => map.places.get(a))
      expect(hexes.every(Boolean)).toBe(true)
      expect(new Set(hexes.map((h) => `${h!.col},${h!.row}`)).size).toBe(lived.length)
      expect(notes.join(' ')).toMatch(/paint the drawing/)
    }
  })

  it("makes the way between two places about as long as its exit says, on Skerrow's map as the editor laid it out", async () => {
    const content = loadContent(await readContentFiles('content', 'isle'))
    const engine = new Engine(content, { seed: 1 })
    const map = regionMap(content)!
    // The green to the headland: fifteen minutes north.
    const from = map.places.get('skerrow_hythe')!
    const to = map.locations.get('loc_skerrow_headland') ?? map.places.get('skerrow_heights')!
    const path = findPath(engine.world, map, from, to, false)!
    const minutes = path.slice(1).reduce((sum, hex) => sum + minutesFor(engine.world, map.cell(hex)!, false), 0)
    expect(minutes).toBeGreaterThan(15 * 0.5)
    expect(minutes).toBeLessThan(15 * 2)
  })

  it("walks a region's own terrain as its land, names it and colours it by the world's palette", async () => {
    const { files, content } = await withDraft('content', 'quietreach')
    const map = regionMap(content)!
    const basalt = (() => {
      for (let col = 0; col < map.cols; col++) for (let row = 0; row < map.rows; row++) {
        const cell = map.cell({ col, row })!
        if (cell.terrain === 'volcanic' && !cell.way && !map.placeOn(cell)) return cell
      }
      return undefined
    })() as Cell
    expect(basalt.land).toBe('heath')
    const engine = new Engine(content, { seed: 1 })
    const text = describeHex(engine.world, basalt).text
    expect(text).toMatch(/^On the black basalt/)
    expect(text).toContain('The black basalt lies all around you.')
    expect(text).not.toMatch(/sedge|heather|peat|ditch/i)
    // The region's own line, when it has one.
    const region = files.find((f) => f.path.endsWith('region.yaml'))!
    const lined = loadContent(files.map((f) => (f === region ? { ...f, text: f.text.replace('volcanic: { like: heath }', 'volcanic: { like: heath, text: "Black rock runs down to the grey swell, wet and cold." }') } : f)))
    const again = describeHex(new Engine(lined, { seed: 1 }).world, basalt).text
    expect(again).toContain('Black rock runs down to the grey swell, wet and cold.')
    // The map keys the hex by its own terrain, so the palette's basalt tints colour it.
    const data = hexMapData(new Engine(content, { seed: 1 }).world, { whole: true })!
    expect(data.keys).toContain('volcanic')
    expect(data.legend.map((l) => l.name)).toContain('black basalt')
  })

  it('guesses from its name what an own terrain walks like', () => {
    expect([likeOf('ocean', 'open sea'), likeOf('shallows', 'tidal shallows'), likeOf('scrub', 'coastal scrub'), likeOf('beds', 'growing beds'), likeOf('volcanic', 'black basalt'), likeOf('dune')]).toEqual(['water', 'fen', 'woods', 'fields', 'heath', 'heath'])
  })

  it('refuses a drawing with a land nobody named, and an own land without tints', async () => {
    const { files } = await withDraft('content', 'quietreach')
    const region = files.find((f) => f.path.endsWith('region.yaml'))!
    const problems = (text: string) => {
      try {
        loadContent(files.map((f) => (f === region ? { ...f, text } : f)))
        return ''
      } catch (error) {
        return String((error as { problems?: string[] }).problems ?? error)
      }
    }
    expect(problems(region.text.replace('"#": volcanic', '"#": lava'))).toMatch(/lava, which is no land/)
    expect(problems(region.text.replace('volcanic: { like: heath }', 'volcanic: { like: heath }\n      magma: { like: heath }'))).toMatch(/the land magma has no tints in the palette/)
  })

  it('gives Skerrow a map in its own words: its lands and its paths, and three days of play without a problem', async () => {
    const content = loadContent(await readContentFiles('content', 'isle'))
    const map = regionMap(content)!
    expect(map.region.zone).toEqual([0.25, 0.25])
    const engine = new Engine(content, { seed: 1 })
    const read = (land: string) => {
      for (let col = 0; col < map.cols; col++) for (let row = 0; row < map.rows; row++) {
        const cell = map.cell({ col, row })!
        if (cell.terrain === land && !cell.way && !map.placeOn(cell)) return describeHex(engine.world, { col, row }).text
      }
      return ''
    }
    expect(read('heath')).toMatch(/^On the heather/)
    expect(read('heath')).toContain('Heather and bare grey stone')
    expect(read('fen')).toMatch(/^In the salt marsh/)
    expect(read('water')).toMatch(/^On the sea/)
    for (const land of ['heath', 'fen', 'fields', 'cliff', 'dune']) expect(read(land)).not.toMatch(/sedge|peat|ditch|alder|ice/i)
    const track = [...Array(map.cols).keys()].flatMap((col) => [...Array(map.rows).keys()].map((row) => ({ col, row }))).find((h) => map.cell(h)!.way?.name === 'the beacon track' && !map.placeOn(h))!
    expect(describeHex(engine.world, track).text).toContain('A track crosses the heather towards the squat tower on the headland.')
    expect(simulate(content, 3).problems).toEqual([])
  })

  it('proposes nothing for a world with a map of its own', async () => {
    const files = await readContentFiles('content', 'base')
    const draft = draftRegion(loadContent(files))
    expect(draft.changes).toEqual([])
    expect(draft.notes[0]).toMatch(/has a map of its own already/)
  })
})
