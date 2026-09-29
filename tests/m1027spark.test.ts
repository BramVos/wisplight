import { describe, expect, it } from 'vitest'
import { Engine, loadContent, MockLlm, type Content } from '../src/engine'
import { recordFact } from '../src/engine/news'
import { readContentFiles } from '../src/node/content'
import { content } from './helpers'

// M10.27 (2), as Bram set it: a quiet night does not go silent. A night with
// news does the whole round; a quiet night climbs a ladder of chances
// (story.quiet_ladder), a step faster when the stranger's quest stands still,
// and on a spark the stranger gets one unexpected thing that follows from the
// open storylines: one small call on the brain, one step of the chronicler's,
// checked like every other. Without a model the rule's pulse does it.

const DAY = 24 * 60
// The pulse's own gap two weeks (half a hook a week), so within these nights only the ladder speaks.
const ladder = (world: Content, first: number, second = first, third = second, fourth = 1): Content => ({ ...world, world: { ...world.world, knobs: { ...world.world.knobs, 'story.hooks_per_week': 0.5, 'story.quiet_ladder': { first, second, third, fourth } } } })

/** A game with an open storyline in Veenhoek, whose news the chronicler has already told, and the stranger playing. */
async function quiet(world: Content, llm?: MockLlm): Promise<Engine> {
  const engine = new Engine(world, { seed: 5, builder: true, ...(llm ? { llm } : {}) })
  engine.start()
  recordFact(engine.world, { kind: 'quarrel', about: ['npc_mirte', 'npc_harmen'], place: 'loc_veenhoek_green', belang: 3, title: 'the quarrel over the flour', text: { precise: 'Mirte and Harmen quarrelled over the flour.', village: 'The baker and the miller fell out.', far: 'Two in Veenhoek fell out.' } })
  engine.tick(DAY)
  await engine.runModels()
  return engine
}

/**
 * On to four in the night, the stranger doing something first so the world knows they play. The Nethermarch has news
 * nearly every night; a quiet one is made by telling the chronicler everything just before (unless the test has news).
 */
async function toNight(engine: Engine, news = false): Promise<void> {
  await engine.handle('time')
  const now = engine.world.now % DAY
  engine.tick(((4 * 60 - now + DAY) % DAY || DAY) - 1)
  const state = engine.state.chronicle!
  if (!news) {
    for (const line of state.lines) line.reported = [...line.facts]
    state.signals = []
  }
  engine.tick(1)
}

describe('M10.27: the spark of a quiet night', () => {
  it('climbs the ladder on quiet nights, and a spark brings one step of a storyline near the stranger', async () => {
    const llm = new MockLlm('good')
    const engine = await quiet(ladder(content, 0, 0, 0, 0), llm)
    await toNight(engine)
    expect(engine.state.chronicle!.quiet).toBe(1)
    await toNight(engine)
    expect(engine.state.chronicle!.quiet).toBe(2)
    // Every rung at one: the next quiet night sparks.
    const sure = await quiet(ladder(content, 1), llm)
    await toNight(sure)
    const spark = sure.state.chronicle!.pending.find((r) => r.reason === 'spark')
    expect(spark).toBeDefined()
    expect(sure.state.chronicle!.quiet).toBe(0)
    await sure.runModels()
    const call = llm.calls.filter((c) => c.schemaName === 'spark').at(-1)!
    expect(call.role).toBe('brain')
    expect(call.cacheBreak).toBe(0)
    expect(call.prompt).toMatch(/STORYLINES:\n {2}s1 "the quarrel over the flour"/)
    // One step of the chronicler's: something stays on someone's mind.
    const beat = sure.state.plans!.find((p) => p.source === 'chronicler' && p.topic === 'beat')
    expect(beat).toBeDefined()
    expect(sure.state.chronicle!.pending.some((r) => r.reason === 'spark')).toBe(false)
    // In the log as a run of the chronicler, so a replay applies the same step (this test makes its nights quiet by
    // hand, which the log does not hold, so it does not replay here).
    expect(sure.save().log.some((e) => e.k === 'chron' && (e.v as { plans?: unknown[] } | null)?.plans?.length === 1)).toBe(true)
  }, 60_000)

  it('a night with news does the whole round, and the ladder starts again', async () => {
    const engine = await quiet(ladder(content, 0, 0, 0, 0), new MockLlm('good'))
    await toNight(engine)
    expect(engine.state.chronicle!.quiet).toBe(1)
    await toNight(engine, true)
    expect(engine.state.chronicle!.quiet).toBe(0)
  }, 60_000)

  it('a stranger whose quest stands still for days gets there a step sooner', async () => {
    const engine = await quiet(ladder(content, 0, 1, 1, 1), new MockLlm('good'))
    engine.state.questlog = { flour: { stage: 'ask', started: 0, stageAt: engine.world.now - 5 * DAY, path: [], done: [] } }
    await toNight(engine)
    // The first quiet night counts as the second: a spark.
    expect(engine.state.chronicle!.pending.some((r) => r.reason === 'spark')).toBe(true)
  }, 60_000)

  it('without a model the pulse watcher of the content does it, on the same ladder; a reply that does not fit brings nothing', async () => {
    const plain = await quiet(ladder(content, 1))
    await toNight(plain)
    expect(plain.state.pulse!.fired.at(-1)).toMatchObject({ how: 'rule', t: plain.world.now })
    const odd = await quiet(ladder(content, 1), new MockLlm('invalid'))
    await toNight(odd)
    await odd.runModels()
    expect(odd.state.plans?.some((p) => p.source === 'chronicler' && p.topic === 'beat') ?? false).toBe(false)
  }, 60_000)

  it('never in a world that wants no hook to come unasked', async () => {
    const none = { ...ladder(content, 1), world: { ...ladder(content, 1).world, knobs: { ...ladder(content, 1).world.knobs, 'story.hooks_per_week': 0 } } }
    const engine = await quiet(none, new MockLlm('good'))
    await toNight(engine)
    expect(engine.state.chronicle!.pending.some((r) => r.reason === 'spark')).toBe(false)
  }, 60_000)

  it('Skerrow climbs its own, slower ladder', async () => {
    const isle = loadContent(await readContentFiles('content', 'isle'))
    const engine = new Engine(isle, { seed: 5 })
    expect(engine.world.content.world.knobs?.['story.quiet_ladder']).toBeDefined()
  })
})
