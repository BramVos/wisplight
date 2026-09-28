import { describe, expect, it } from 'vitest'
import { Engine, GameClock, loadContent, MockLlm } from '../src/engine'
import { tideState, tidesDay } from '../src/engine/tides'
import { moodOf } from '../src/engine/quests/plans'
import { readContentFiles } from '../src/node/content'
import { content } from './helpers'

// M10.22: the great lines. Every day the engine adds up what pushes a line;
// on the first of every month it is judged once: nothing, a threat (a mood of
// threat, news, prices up) or the event itself, a plan of the content the
// engine plays, with a fact of belang 5. At most one event per season, and a
// cooldown after it. With a model the chronicler judges within what the rules
// allow; without one the rule does it at the thresholds.

const DAY = 24 * 60

/** On to the first of the next month, past the nightly round at four; with a pressure set just before it, for a line. */
function toNextMonth(engine: Engine, set?: [string, number]): void {
  const p = new GameClock(engine.world.now).parts
  const left = (p.month === 13 ? 5 : 30) - p.day + 1
  const start = engine.world.now - (engine.world.now % DAY)
  engine.tick(start + left * DAY + 3 * 60 - engine.world.now)
  if (set) tideState(engine.world, set[0]).pressure = set[1]
  engine.tick(65)
}

describe('M10.22: the great lines', () => {
  it('threatens at the threat and breaks at the threshold by the rule, plays the plan, and then cools down', () => {
    const engine = new Engine(content, { seed: 3 })
    engine.start()
    const flood = tideState(engine.world, 'great_flood')
    toNextMonth(engine, ['great_flood', 50])
    expect(flood.stage).toBe('threat')
    expect(moodOf(engine.world, 'veenhoek')?.kind).toBe('threat')
    expect(engine.state.prices?.['veenhoek']?.factor).toBe(1.1)
    expect(engine.state.news!.facts.some((f) => f.kind === 'tide_threat' && f.belang === 3)).toBe(true)
    // At the threshold it breaks: the fact of belang 5, and the dyke leaks by the plan of the content.
    toNextMonth(engine, ['great_flood', 95])
    expect(flood.stage).toBe('event')
    expect(flood.pressure).toBe(0)
    expect(engine.state.news!.facts.some((f) => f.kind === 'tide' && f.belang === 5 && /Great Dyke/.test(f.text.precise))).toBe(true)
    expect(engine.state.plans?.some((p) => p.plan === 'dyke_leak')).toBe(true)
    // In its cooldown it may threaten again, never break.
    toNextMonth(engine, ['great_flood', 95])
    expect(flood.stage).toBe('threat')
    expect(flood.events).toHaveLength(1)
    expect(flood.history.map((h) => h.judged)).toEqual(['threat', 'event', 'threat'])
  }, 120_000)

  it('is pushed every day by what drives it, and calmed by what calms it', () => {
    const engine = new Engine(content, { seed: 3 })
    engine.start()
    const flood = tideState(engine.world, 'great_flood')
    // The game begins in autumn: a little every day.
    tidesDay(engine.world)
    expect(flood.pressure).toBe(1)
    expect(flood.moved).toEqual(['autumn'])
    ;(engine.state.flags ??= {})['dyke_shored'] = true
    tidesDay(engine.world)
    expect(flood.pressure).toBeLessThan(1)
    expect(flood.moved).toEqual(['autumn', 'dyke_shored'])
  })

  it('with a model the chronicler judges within what the rules allow, once a month; a line it made up is not one', async () => {
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 3, llm })
    engine.start()
    toNextMonth(engine, ['great_flood', 60])
    expect(engine.state.tides?.pending).toBe(true)
    await engine.runModels()
    const flood = tideState(engine.world, 'great_flood')
    // Between threat and threshold it may only threaten, and the mock goes as far as it may.
    expect(flood.stage).toBe('threat')
    expect(flood.history.at(-1)!.why).toBe('The signs have been gathering all month.')
    expect(engine.state.tides!.lines['made_up']).toBeUndefined()
    expect(llm.calls.filter((c) => c.schemaName === 'tides')).toHaveLength(1)
  }, 120_000)

  it("plays Skerrow's great storm: the harbour broken, the shore folk at the inn eating from the hamlet, fish scarce", async () => {
    const isle = loadContent(await readContentFiles('content', 'isle'))
    const engine = new Engine(isle, { seed: 3 })
    engine.start()
    toNextMonth(engine, ['great_storm', 95])
    engine.tick(120)
    expect(engine.state.places?.['loc_skerrow_harbour']?.state).toBe('damaged')
    const crowd = (engine.state.crowds ?? []).find((c) => c.at === 'loc_skerrow_salt_kettle')
    expect(crowd?.count).toBe(10)
    expect(engine.state.market?.['salt_fish']).toBe(0.5)
    // When the water has gone, the boat crews band together: a faction formed in play, as content in the save.
    engine.tick(3 * DAY)
    const crews = engine.content.factions.get('boat_crews')
    expect(crews?.members).toEqual(['npc_brannoc'])
    expect(crews?.seats.map((s) => s.at)).toEqual(['loc_skerrow_harbour'])
    expect(engine.state.news!.facts.some((f) => f.kind === 'faction' && f.title === 'the boat crews of the Hythe formed')).toBe(true)
    const loaded = Engine.fromSave(isle, engine.save())
    expect(loaded.content.factions.has('boat_crews')).toBe(true)
    // At most one a season in a world.
    const { foundFaction } = await import('../src/engine/growth/founded')
    expect(foundFaction(engine.world, { id: 'another', name: 'another band', wants: 'More.', seat: 'somewhere', members: [], join: 'reputation' })).toBe(false)
  }, 120_000)

  it('lets a crowd eat from the stock of the settlement it is in', () => {
    const plain = new Engine(content, { seed: 3 })
    const crowded = new Engine(content, { seed: 3 })
    for (const e of [plain, crowded]) e.start()
    crowded.state.crowds = [{ id: 'crowd_test', name: 'refugees', one: 'a refugee', at: 'loc_waagdam_market', count: 400, from: 'veenhoek', profession: 'labourer', looks: [], since: crowded.world.now, named: [] }]
    plain.tick(DAY)
    crowded.tick(DAY)
    const used = (e: Engine) => Object.values(e.state.economy!.ledgers['waagdam']!.last.used).reduce((a, b) => a + b, 0)
    expect(used(crowded)).toBeGreaterThan(used(plain))
  }, 120_000)

  it('brings at most one threat and no event in thirty days without a player, in each world', async () => {
    for (const world of [content, loadContent(await readContentFiles('content', 'isle')), loadContent(await readContentFiles('tests/worlds', 'other'))]) {
      const engine = new Engine(world, { seed: 5 })
      engine.start()
      engine.tick(30 * DAY)
      const judged = Object.values(engine.state.tides?.lines ?? {}).flatMap((l) => l.history.map((h) => h.judged))
      expect(judged.filter((j) => j === 'event')).toEqual([])
      expect(judged.filter((j) => j === 'threat').length).toBeLessThanOrEqual(1)
    }
  }, 120_000)

  it('refuses a line whose plan does not exist, or whose threshold is not above its threat; Deepwell has its own', async () => {
    const files = await readContentFiles('content', 'base')
    const edit = (from: string, to: string) => files.map((f) => (f.path.endsWith('tides.yaml') ? { ...f, text: f.text.replace(from, to) } : f))
    expect(() => loadContent(edit('plan: dyke_leak', 'plan: no_such_plan'))).toThrow(/tide great_flood: unknown plan no_such_plan/)
    expect(() => loadContent(edit('threshold: 90', 'threshold: 30'))).toThrow(/the threshold \(30\) must be above the threat \(40\)/)
    const deepwell = loadContent(await readContentFiles('tests/worlds', 'other'))
    expect([...deepwell.tides.keys()]).toEqual(['long_dark'])
  })
})
