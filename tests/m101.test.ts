import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, recordFact } from '../src/engine'
import { devView } from '../src/engine/dev'
import { content, runUntil } from './helpers'

// Milestone M10.1 (docs/ROADMAP.md): under the bonnet. The dev menu reads the
// running game and changes nothing by looking; every intervention is an
// @-command through the engine and its log, so a replay comes out the same.
// (That a production build has no menu at all, the smoke test proves: npm run
// build, then WISPLIGHT_SMOKE=1 npx electron . prints "dev menu absent".)

const DAY = 24 * 60

describe('M10.1: the dev menu reads', () => {
  it('every section, with a person in focus, and the state is the same after as before', () => {
    const engine = new Engine(content, { seed: 140, builder: true })
    runUntil(engine, 16, 9)
    const before = JSON.stringify(engine.state)
    const people = devView(engine, 'people', 'npc_mirte')
    devView(engine, 'people', 'npc_sijbrand')
    const background = devView(engine, 'background')
    const chronicler = devView(engine, 'chronicler')
    expect(JSON.stringify(engine.state)).toBe(before)
    const mirte = people.people!.person!
    expect(mirte.name).toBe('Mirte Bakker')
    expect(mirte.sliders.map((s) => s.name)).toEqual(['standing', 'attitude to the player', 'bond with the player', 'familiarity with the player'])
    expect(mirte.sliders[0]!.why).toMatch(/household purse \d+ against the middle of \d+/)
    expect(mirte.faith).toBe('the Church of the Lantern')
    expect(background.background!.ledgers.map((l) => l.id)).toContain('waagdam')
    expect(background.background!.plans.map((p) => p.name)).toContain('Cornelis measures the Holleveen')
    expect(chronicler.chronicler!.lines.length).toBeGreaterThanOrEqual(0)
  })

  it('says which condition holds a step back', async () => {
    const engine = new Engine(content, { seed: 141, builder: true })
    runUntil(engine, 15, 9)
    await engine.handle('@plan dyke_leak')
    engine.tick(60)
    const plans = devView(engine, 'background').background!.plans
    const leak = plans.find((p) => p.name === 'The dyke at Oude Zijl leaks')!
    expect(leak.steps.some((s) => s.held)).toBe(true)
  })

  it('shows what each run of the chronicler got, gave and had refused', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 142, llm: mock })
    runUntil(engine, 15, 9)
    recordFact(engine.world, { kind: 'fire', about: ['npc_gerrit'], place: 'loc_peat_sheds', belang: 4, title: 'the peat sheds burn', text: { precise: 'The peat sheds burned.', village: 'The sheds burned!', far: 'A fire.' } })
    mock.judge = () => []
    await engine.runChronicler()
    const run = devView(engine, 'chronicler').chronicler!.runs[0]!
    expect(run.offered).toContain('the peat sheds burn')
    expect(run.lore.length + run.problems.length).toBeGreaterThan(0)
  })
})

describe('M10.1: steering goes through the engine and the log', () => {
  it('skip a day, a plan, tension, market, a signal and the budget play back to the same world', async () => {
    const engine = new Engine(content, { seed: 143, builder: true })
    runUntil(engine, 15, 9)
    const day = engine.world.now
    for (const command of ['@skip 1', '@plan dyke_leak', '@tension rijkland 10', '@market lamp_oil 0.5', '@signal quarrel npc_gerrit npc_jan_visser', '@budget 0.3']) {
      const out = (await engine.handle(command)).map((o) => o.text).join(' ')
      expect(out, command).toMatch(/\[build\]/)
    }
    expect(engine.world.now).toBeGreaterThanOrEqual(day + DAY)
    expect(engine.state.market?.['lamp_oil']).toBe(0.5)
    expect(engine.state.signals!.log.some((s) => s.kind === 'quarrel' && s.watcher === 'builder') || engine.state.signals!.queue.some((s) => s.kind === 'quarrel')).toBe(true)
    const log = engine.save().log.filter((e) => e.k === 'cmd').map((e) => e.v)
    expect(log).toEqual(expect.arrayContaining(['@skip 1', '@market lamp_oil 0.5', '@budget 0.3']))
    const replayed = await Engine.replay(content, 143, engine.save().log)
    expect(replayed.state).toEqual(engine.state)
  }, 120_000)
})
