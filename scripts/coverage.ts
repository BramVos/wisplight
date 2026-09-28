import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { coverage, coverageMarkdown } from './coveragescan'

// npm run coverage (M10.20): docs/COVERAGE.md, every kind of model call with its mock test and its recorded real replies.

const root = resolve(import.meta.dirname, '..')
const { rows, unlisted, stale } = coverage(root)
for (const kind of unlisted) console.log(`${kind}: the code makes this call, but src/engine/modelkinds.ts has no row for it`)
for (const kind of stale) console.log(`${kind}: a row in src/engine/modelkinds.ts, but the code no longer makes this call`)
writeFileSync(resolve(root, 'docs/COVERAGE.md'), coverageMarkdown(rows), 'utf8')
console.log(`docs/COVERAGE.md: ${rows.length} kinds, ${rows.filter((r) => r.recorded.length).length} with a recorded real reply`)
if (unlisted.length || stale.length) process.exitCode = 1
