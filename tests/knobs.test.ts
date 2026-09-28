import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { KNOBS } from '../src/engine/knobs'
import { inventory, knobsMarkdown } from '../scripts/knobscan'

// Milestone M10.20 (docs/ROADMAP.md): an inventory of the fixed numbers of
// the code, each with its place: the content of a world, the settings of the
// app, or the code, with why. A new number without a place fails here.

const root = resolve(import.meta.dirname, '..')
const places = readFileSync(resolve(root, 'docs/knobs.yaml'), 'utf8')

describe('M10.20: every fixed number has a place', () => {
  it('every numeric constant of the code is placed, and every place is still in the code', () => {
    const { rows, unplaced, stale, problems } = inventory(root, places)
    expect(problems).toEqual([])
    expect(unplaced.map((c) => `${c.file}:${c.line} ${c.name} = ${c.value}`), 'add it to docs/knobs.yaml as world, settings or code, then npm run knobs').toEqual([])
    expect(stale, 'remove it from docs/knobs.yaml, then npm run knobs').toEqual([])
    expect(rows.length).toBeGreaterThan(80)
    // What stays in the code says why.
    for (const r of rows.filter((r) => r.place === 'code')) expect(r.note.length, r.name).toBeGreaterThan(10)
  })

  it('docs/KNOBS.md is what npm run knobs writes', () => {
    const { rows } = inventory(root, places)
    expect(readFileSync(resolve(root, 'docs/KNOBS.md'), 'utf8')).toBe(knobsMarkdown(rows, Object.entries(KNOBS).map(([id, k]) => ({ id, ...k }))))
  })
})
