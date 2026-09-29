import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { warnings } from '../src/engine/builder'
import type { Content } from '../src/engine/content'
import { loadContentFromDir } from '../src/node/content'
import { content as nethermarch } from './helpers'

// M10.29 D, the craft bench, from Bram's playtest of The Quiet Reach:
// examining the lamp ran as a repair and ended in "You have .", Tessa taught
// a lesson from across the station, and a failed try could be tried again at
// once, over and over.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')

/** The Quiet Reach with the bench's examining set to a difficulty a test wants. */
function withDc(dc: number, base: Content = quiet): Content {
  const bench = base.objectTypes.get('electronics_bench')!
  const affordances = bench.affordances.map((a) => (a.id === 'examine_lamp' ? { ...a, check: { dc } } : a))
  return { ...base, objectTypes: new Map(base.objectTypes).set(bench.id, { ...bench, affordances }) }
}

function atTheBench(c: Content): Engine {
  const engine = new Engine(c, { seed: 3 })
  engine.start()
  engine.state.player.location = 'loc_workshop'
  engine.state.player.money = 100_000
  return engine
}
const said = async (engine: Engine, line: string) => (await engine.handle(line)).map((o) => o.text).join('\n')

describe('M10.29 D: the craft bench', () => {
  it('examining makes nothing: no "You have .", and a failure is no spoilt material', async () => {
    const well = await said(atTheBench(withDc(-20)), 'use electronics bench examine')
    expect(well).toMatch(/a kink near the grip/)
    expect(well).not.toMatch(/You have \./)
    const badly = await said(atTheBench(withDc(80)), 'use electronics bench examine')
    expect(badly).toMatch(/Nothing comes of it this time\.|the wrong way from the start/)
    expect(badly).not.toMatch(/repair that did not hold|material/)
  })

  it('a lesson with Tessa needs Tessa at the bench', async () => {
    const engine = atTheBench(quiet)
    const tessa = engine.state.npcs['npc_tessa_rook']!
    tessa.location = 'loc_commons'
    expect(await said(engine, 'use electronics bench learn')).toMatch(/Tessa is not here\./)
    tessa.location = 'loc_workshop'
    tessa.activity = 'working'
    expect(await said(engine, 'use electronics bench learn')).not.toMatch(/is not here/)
  })

  it('after three failed tries in a row the bench rests an hour, in the world\'s own words', async () => {
    const engine = atTheBench(withDc(80))
    for (let i = 0; i < 3; i++) await said(engine, 'use electronics bench examine')
    const resting = await said(engine, 'use electronics bench examine')
    expect(resting).toMatch(/^The soldering iron has overheated.*\(About \d+ minutes\.\)$/)
    engine.tick(61)
    expect(await said(engine, 'use electronics bench examine')).not.toMatch(/overheated/)
  })

  it('a world without the knob lets you try as often as you like', async () => {
    // The Nethermarch leaves crafts.fail_cooldown out: its neutral default is off.
    const bare = { ...withDc(80), world: { ...quiet.world, knobs: { ...quiet.world.knobs } } }
    delete (bare.world.knobs as Record<string, unknown>)['crafts.fail_cooldown']
    const engine = atTheBench(bare)
    for (let i = 0; i < 5; i++) expect(await said(engine, 'use electronics bench examine')).not.toMatch(/overheated/)
    expect(nethermarch.world.knobs?.['crafts.fail_cooldown']).toBeUndefined()
  })

  it('warns under Check of work whose text names someone who need not be there', () => {
    expect(warnings(quiet).some((w) => /electronics_bench lesson/.test(w))).toBe(false)
    const bench = quiet.objectTypes.get('electronics_bench')!
    const loose = { ...quiet, objectTypes: new Map(quiet.objectTypes).set(bench.id, { ...bench, affordances: bench.affordances.map((a) => (a.id === 'lesson' ? { ...a, with: undefined } : a)) }) }
    expect(warnings(loose).some((w) => /electronics_bench lesson: the text names Tessa; set with: npc_tessa_rook/.test(w))).toBe(true)
  })
})
