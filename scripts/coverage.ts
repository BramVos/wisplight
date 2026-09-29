import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cacheMeasures, coverage, coverageMarkdown, measuredModule } from './coveragescan'
import { loadContentFromDir, readContentFiles } from '../src/node/content'

// npm run coverage (M10.20): docs/COVERAGE.md, every kind of model call with its mock test and its recorded real replies.

const root = resolve(import.meta.dirname, '..')
const { rows, unlisted, stale } = coverage(root)
for (const kind of unlisted) console.log(`${kind}: the code makes this call, but src/engine/modelkinds.ts has no row for it`)
for (const kind of stale) console.log(`${kind}: a row in src/engine/modelkinds.ts, but the code no longer makes this call`)
// The cache per kind (M10.26), measured on the fixed situations.
const worlds = { base: await loadContentFromDir(resolve(root, 'content'), 'base'), isle: await readContentFiles(resolve(root, 'content'), 'isle') }
writeFileSync(resolve(root, 'docs/COVERAGE.md'), coverageMarkdown(rows, await cacheMeasures(worlds, rows)), 'utf8')
// The measured tokens the app ships with, for the guide price in the settings (M10.21).
writeFileSync(resolve(root, 'src/node/ai/measured.ts'), measuredModule(root), 'utf8')
console.log(`docs/COVERAGE.md: ${rows.length} kinds, ${rows.filter((r) => r.recorded.length).length} with a recorded real reply`)
if (unlisted.length || stale.length) process.exitCode = 1
