import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadContent, mapFixRequest, mapStepRequest, readMapStep, withoutMap, type Content, type ContentFile } from '../engine'
import { regionMap, type RegionMap } from '../engine/map/region'
import type { ProviderId } from '../node/ai/providers'
import { costUsd } from '../node/ai/pricing'
import type { AiService } from '../node/ai/service'
import { readContentFiles } from '../node/content'

// The map painted as a table, measured (M10.26; Bram: can the map be made as
// well with a cheaper model?). The Quiet Reach and Skerrow without their maps,
// laid out from their places and painted from their words, with each model
// asked for, as often as asked: does it load, how much of it agrees with the
// map each world has now (by how each hex walks: water, fen, heath...), does a
// place stand on water, and what it cost. Then one second try per model with
// what stood wrong, to see the cached part read again. With an explicit model
// a call is the player's own trial and counts in no hour or build.

export interface MapRun {
  world: string
  model: string
  n: number
  fix?: boolean
  problems: string[]
  /** The share of hexes that walk as they do on the world's own map. */
  agree: number
  /** Places that came to stand on water. */
  onWater: string[]
  inputTokens: number
  cachedTokens: number
  outputTokens: number
  costUsd: number
  seconds: number
}

/** How much of a painted map walks as the world's own map does, hex by hex, by where each hex lies. */
function agreement(painted: RegionMap, own: RegionMap): number {
  let same = 0
  let all = 0
  for (let col = 0; col < painted.cols; col++)
    for (let row = 0; row < painted.rows; row++) {
      const theirs = own.cell(own.hexOf(painted.posOf({ col, row })))
      if (!theirs) continue
      all++
      if (theirs.land === painted.cell({ col, row })!.land) same++
    }
  return all ? Math.round((same / all) * 100) / 100 : 0
}

const providerOf = (model: string): ProviderId => (model.startsWith('gpt') || model.startsWith('o') ? 'openai' : 'anthropic')

export async function mapTrial(ai: AiService, contentRoot: string, appPath: string, how: { models: string[]; times: number; record: boolean }, say: (line: string) => void): Promise<boolean> {
  const quiet = join(appPath, 'tests/fixtures/worldbuild/quiet-reach/12-palette.json')
  const worlds: { id: string; said: string; files: ContentFile[]; own: Content }[] = []
  for (const [id, said] of [
    ['quietreach', existsSync(quiet) ? String((JSON.parse(readFileSync(quiet, 'utf8')) as { said: string }).said) : ''],
    ['isle', 'A small, rocky island in a grey sea: black shingle on the strand, heather and grey stone on the heights, a salt marsh behind the harbour, and the beacon on the headland.'],
  ] as const) {
    const files = await readContentFiles(contentRoot, id)
    worlds.push({ id, said, files: withoutMap(files), own: loadContent(files) })
  }
  const runs: MapRun[] = []
  const tables = new Map<string, string>()
  const paint = async (world: (typeof worlds)[number], model: string, n: number, fix?: string[]): Promise<void> => {
    const { layout, request } = mapStepRequest(world.files, world.said)
    const asked = fix ? mapFixRequest(world.files, world.said, tables.get(`${world.id}:${model}`)!, fix) : request
    if (!asked) {
      say(`${world.id}: nothing to paint`)
      return
    }
    const started = Date.now()
    try {
      const response = await ai.gateway.complete(asked, { provider: providerOf(model), model })
      const draft = readMapStep(world.files, layout, response.text)
      const painted = draft.result?.content ? regionMap(draft.result.content) : undefined
      const own = regionMap(world.own)
      const onWater = painted ? [...painted.places].filter(([area, hex]) => area !== painted.region.area && painted.cell(hex)?.land === 'water').map(([area]) => area) : []
      const run: MapRun = {
        world: world.id,
        model: response.model,
        n,
        ...(fix ? { fix: true } : {}),
        problems: draft.problems,
        agree: painted && own ? agreement(painted, own) : 0,
        onWater,
        inputTokens: response.usage.inputTokens,
        cachedTokens: response.usage.cachedTokens,
        outputTokens: response.usage.outputTokens,
        costUsd: costUsd(response.model, response.usage) ?? 0,
        seconds: Math.round((Date.now() - started) / 1000),
      }
      runs.push(run)
      if (!fix) tables.set(`${world.id}:${model}`, response.text)
      say(`${world.id} ${model}${fix ? ' (second try)' : ` #${n}`}: ${draft.problems.length ? `does not load: ${draft.problems.slice(0, 2).join('; ')}` : 'loads'}, agrees ${Math.round(run.agree * 100)}%, on water: ${onWater.join(', ') || 'none'}, in ${run.inputTokens} (${run.cachedTokens} cached), out ${run.outputTokens}, $${run.costUsd.toFixed(4)}, ${run.seconds}s`)
      if (how.record) {
        // Skerrow's is the kind's own situation; The Quiet Reach's stays with the build it belongs to.
        const folder = world.id === 'isle' ? join(appPath, 'tests/fixtures/model/map_paint') : join(appPath, 'tests/fixtures/worldbuild/quiet-reach-map')
        mkdirSync(folder, { recursive: true })
        const date = new Date().toISOString().slice(0, 10)
        const entry = { kind: 'map_paint', about: `the map of ${world.own.world.name}, laid out from its places and painted as a table${fix ? ', a second try with what stood wrong' : ''}`, model: response.model, provider: response.provider, date, usage: { inputTokens: run.inputTokens, cachedTokens: run.cachedTokens, outputTokens: run.outputTokens }, reply: response.text, problems: draft.problems, ...(fix ? { wrong: fix } : {}) }
        // A later round of the same model and number keeps the earlier one: -r2, -r3.
        const stem = `${date}-${response.model.replace(/[^a-z0-9.-]/gi, '_')}-${fix ? 'fix' : n}`
        let file = join(folder, `${stem}.json`)
        for (let round = 2; existsSync(file); round++) file = join(folder, `${stem}-r${round}.json`)
        writeFileSync(file, `${JSON.stringify(entry, null, 2)}\n`)
      }
    } catch (error) {
      say(`${world.id} ${model} #${n}: stopped: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  for (const model of how.models)
    for (const world of worlds) {
      for (let n = 1; n <= how.times; n++) await paint(world, model, n)
      // A second try after a wrong map: the cached part read again, and what stood wrong.
      if (world.id === 'quietreach' && tables.has(`${world.id}:${model}`)) await paint(world, model, 0, ['Orison Ridge is the high ground: the high rock lies around it, and the land climbs to it from the port, past Ridge Shelter.'])
    }
  mkdirSync(join(appPath, 'docs/worldbuild'), { recursive: true })
  writeFileSync(join(appPath, 'docs/worldbuild/map-measure.json'), `${JSON.stringify(runs, null, 2)}\n`)
  say(`total: $${runs.reduce((a, r) => a + r.costUsd, 0).toFixed(3)}`)
  return runs.length > 0
}
