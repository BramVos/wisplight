import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { argv, stdout } from 'node:process'
import { MockLlm } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'
import { keepTally, keptTallies, measuring, playRegion, regionReport, REGION_SETTINGS, type RegionSetting } from '../src/node/regionplay'

// The played proof of a new region (M10.25 (4)), with the mock model: the
// Holleveen's south edge explored once per setting of the fourth dial, and
// Skerrow over the sea at `story`; three game days in each. The mock shows the
// shape (what each setting builds, whether the quest can be done, what fires),
// not the quality; the real run goes through the app with the player's key:
// npm run trial -- --kind region_play. Transcripts and the comparison go to
// docs/playtest/region-mock-*.
//
// npm run regionplay [-- base|isle] [-- --setting story]

const args = argv.slice(2)
const i = args.indexOf('--setting')
const only = i >= 0 ? (args[i + 1] as RegionSetting) : undefined
const worlds = (['base', 'isle'] as const).filter((w) => !args.some((a) => a === 'base' || a === 'isle') || args.includes(w))
const dir = resolve(import.meta.dirname, '../docs/playtest')
mkdirSync(dir, { recursive: true })
for (const world of worlds) {
  const content = await loadContentFromDir(resolve(import.meta.dirname, '../content'), world)
  // Skerrow over the sea, in small: the story setting only (the roadmap).
  const settings = REGION_SETTINGS.filter((s) => (only ? s === only : world === 'base' || s === 'story'))
  for (const setting of settings) {
    const { transcript, tally } = await playRegion({ content, world, setting, llm: measuring(new MockLlm('good')), seed: 7 })
    writeFileSync(resolve(dir, `region-mock-${world}-${setting}.txt`), `${world === 'base' ? 'The Holleveen, south edge' : 'Skerrow, over the sea'}; the dial at ${setting}; seed 7; the mock model\n${transcript}\n`)
    keepTally(dir, 'region-mock', tally)
    stdout.write(`${world} ${setting}: ${tally.region?.name ?? 'nothing charted'}, ${tally.places.count} places, ${tally.people.count} people, ${tally.quests.length} quests, ${tally.watchers.made.length} watchers, ${tally.calls.length} calls\n`)
  }
  // The report from every setting's tally on disk, also those of an earlier run.
  writeFileSync(resolve(dir, `region-mock-${world}.md`), `${regionReport(keptTallies(dir, 'region-mock', world), { title: world === 'base' ? 'Een nieuwe streek ten zuiden van de Holleveen, per stand (mock)' : 'Een nieuwe streek over de zee van Skerrow (mock)', mock: true })}\n`)
}
