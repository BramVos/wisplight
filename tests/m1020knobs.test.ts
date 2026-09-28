import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent } from '../src/engine'
import { aimOf } from '../src/engine/economy/ledger'
import { knob, knobProblems, KNOBS, knobsSummary } from '../src/engine/knobs'
import { loadContentFromDir, readContentFiles } from '../src/node/content'
import { inventory } from '../scripts/knobscan'
import { content } from './helpers'

// Milestone M10.20 (docs/ROADMAP.md): one layer for knobs. Every rule of
// play that may differ per world is a knob with a default, bounds and a unit;
// a world sets it in world.yaml `knobs:`, and the code reads it with
// knob(world, id). Deepwell sets one otherwise, and the game follows it.

const worlds = join(import.meta.dirname, 'worlds')

describe('M10.20: the knobs of a world', () => {
  it('a world without knobs plays by the defaults; a table takes only the rows a world sets', () => {
    const engine = new Engine(content, { seed: 1 })
    expect(knob(engine.world, 'talk.max_effect')).toBe(5)
    expect(knob(engine.world, 'talk.words')).toEqual({ short: 15, normal: 50, explain: 90, story: 180 })
    const own = { content: { world: { ...content.world, knobs: { 'talk.words': { short: 8 }, 'talk.max_turns': 30 } } } }
    expect(knob(own, 'talk.words')).toEqual({ short: 8, normal: 50, explain: 90, story: 180 })
    expect(knob(own, 'talk.max_turns')).toBe(30)
  })

  it('Deepwell keeps five days of stores, not three, and the ledger follows it', async () => {
    const deepwell = await loadContentFromDir(worlds, 'other')
    expect(deepwell.world.knobs).toEqual({ 'economy.days_of_use': 5 })
    const engine = new Engine(deepwell, { seed: 2 })
    // Without a keep of its own, a settlement aims at so many days of its use.
    const domes = { ...deepwell.settlements.get('deepwell_domes')!, keep: {} }
    expect(aimOf(engine.world, domes, 'algae_stew')).toBe(10 * 5)
    const plain = { content: { world: { ...deepwell.world, knobs: {} } } } as unknown as Engine['world']
    expect(aimOf(plain, domes, 'algae_stew')).toBe(10 * 3)
  })

  it('a knob that does not exist, of the wrong shape or out of bounds does not load, and says what it may be', async () => {
    expect(knobProblems({ 'talk.max_effect': 99, 'talk.nonsense': 1, 'talk.words': 12, 'belief.openness': { cave: 0.4 }, 'rules.lock_dc': { rusty: 8 } })).toEqual([
      'world.knobs: talk.max_effect is 99, but must be from 0 to 30 (points)',
      'world.knobs: talk.nonsense is no knob; the knobs are listed in docs/KNOBS.md',
      'world.knobs: talk.words is a table of short, normal, explain, story',
      'world.knobs: rules.lock_dc.rusty is not one of crude, common, good, fine, masterwork',
    ])
    const files = await readContentFiles(worlds, 'other')
    const wrong = files.map((f) => (f.path === 'other/world.yaml' ? { ...f, text: f.text.replace('economy.days_of_use: 5', 'economy.days_of_use: 500') } : f))
    expect(() => loadContent(wrong)).toThrow(/world\.knobs: economy\.days_of_use is 500, but must be from 1 to 60 \(days\)/)
  })

  it('the code reads no constant for a rule of play any more, except the shape of the year', () => {
    const root = resolve(import.meta.dirname, '..')
    const { rows } = inventory(root, readFileSync(resolve(root, 'docs/knobs.yaml'), 'utf8'))
    expect(rows.filter((r) => r.place === 'world' && !r.moved).map((r) => r.name).sort()).toEqual(['DAYS_PER_YEAR', 'SEASON', 'SEASON', 'YEAR'])
    expect(Object.keys(KNOBS).length).toBeGreaterThan(70)
    expect(knobsSummary()).toMatch(/^KNOBS \(world\.yaml `knobs:`[\s\S]*\n- talk\.max_turns \(turns; 20; 3 to 100\): A talk ends after this many turns/)
  })
})
