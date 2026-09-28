import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { KNOBS } from '../src/engine/knobs'
import { inventory, knobsMarkdown } from './knobscan'

// npm run knobs (M10.20): docs/KNOBS.md, the fixed numbers of the code and where they belong (docs/knobs.yaml).

const root = resolve(import.meta.dirname, '..')
const { rows, unplaced, stale, problems } = inventory(root, readFileSync(resolve(root, 'docs/knobs.yaml'), 'utf8'))
for (const p of problems) console.log(`docs/knobs.yaml: ${p}`)
for (const c of unplaced) console.log(`${c.file}:${c.line} ${c.name} = ${c.value}: no place in docs/knobs.yaml`)
for (const s of stale) console.log(`docs/knobs.yaml: ${s} is no longer in the code`)
writeFileSync(resolve(root, 'docs/KNOBS.md'), knobsMarkdown(rows, Object.entries(KNOBS).map(([id, k]) => ({ id, ...k }))), 'utf8')
console.log(`docs/KNOBS.md: ${rows.length} numbers${unplaced.length ? `, ${unplaced.length} without a place` : ''}`)
if (unplaced.length || stale.length || problems.length) process.exitCode = 1
