import { describe, expect, it } from 'vitest'
import { Engine, loadContent, MockLlm } from '../src/engine'
import { hooksSince } from '../src/engine/pulse'
import { readContentFiles } from '../src/node/content'
import { content } from './helpers'

// M10.24: the pulse. The world looks the stranger up, also when they do not
// travel: at least one hook near them every so many days (story.hooks_per_week,
// two by default), never two of the same kind in a row. With a model the night
// round is asked for one from the open storylines near them; without one, or
// when it brought none, the rule sets off one of the content's pulse watchers.

const DAY = 24 * 60

/** Three weeks in which the stranger stays where they are, and looks about once a day. */
async function stayPut(engine: Engine, days = 21): Promise<void> {
  for (let d = 0; d < days; d++) {
    engine.tick(DAY)
    await engine.handle('look')
  }
}

describe('M10.24: the pulse', () => {
  it('without a model the rule keeps the stranger looked up: no gap much over three and a half days, never two of a kind in a row', async () => {
    const engine = new Engine(content, { seed: 9 })
    const out = engine.start()
    expect(out.length).toBeGreaterThan(0)
    const begin = engine.world.now
    await stayPut(engine)
    const fired = engine.state.pulse!.fired
    expect(fired.length).toBeGreaterThan(0)
    expect(fired.every((f) => f.how === 'rule')).toBe(true)
    for (let i = 1; i < fired.length; i++) expect(fired[i]!.kind).not.toBe(fired[i - 1]!.kind)
    // The stranger stood in one place all along: the hooks near them come at most four and a half days apart.
    const times = [begin, ...hooksSince(engine.world, begin).map((h) => h.t), engine.world.now]
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeLessThanOrEqual(4.5 * DAY)
  }, 120_000)

  it("sets off the content's own watchers: the pedlar seeks the stranger, weather is talked of, or someone has an errand", async () => {
    const engine = new Engine(content, { seed: 9 })
    engine.start()
    await stayPut(engine)
    const kinds = new Set(engine.state.pulse!.fired.map((f) => f.kind))
    expect([...kinds].every((k) => ['visitor', 'tiding', 'request'].includes(k))).toBe(true)
    const signals = engine.state.signals?.log.map((s) => s.kind) ?? []
    expect(signals.some((k) => k.startsWith('pulse_'))).toBe(true)
  }, 120_000)

  it('with a model asks the night round for one hook near the stranger, from an open storyline there', async () => {
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 3, llm, builder: true })
    engine.start()
    // A storyline near the stranger: a drowning at the mill, where they stand.
    await engine.handle('@goto loc_molenend_mill')
    await engine.handle('@kill harmen drowned in the Blackmere')
    await engine.runModels()
    for (let d = 0; d < 8; d++) {
      engine.tick(DAY)
      await engine.handle('look')
      await engine.runModels()
    }
    const pulsed = llm.calls.filter((c) => c.schemaName === 'chronicle' && c.prompt.includes('PULSE'))
    expect(pulsed.length).toBeGreaterThan(0)
    expect(pulsed[0]!.prompt).toMatch(/PULSE\n {2}The stranger is in .* and nothing new has come their way for days/)
  }, 120_000)

  it('never, with the knob at nought; and a world without pulse watchers stays as it is', async () => {
    const quiet = loadContent((await readContentFiles('content', 'base')).map((f) => (f.path.endsWith('base/world.yaml') ? { ...f, text: f.text.replace(/^world:\n/, 'world:\n  knobs:\n    story.hooks_per_week: 0\n') } : f)))
    const engine = new Engine(quiet, { seed: 9 })
    engine.start()
    await stayPut(engine, 14)
    expect(engine.state.pulse?.fired ?? []).toEqual([])
    const deepwell = new Engine(loadContent(await readContentFiles('tests/worlds', 'other')), { seed: 9 })
    deepwell.start()
    await stayPut(deepwell, 14)
    expect(deepwell.state.pulse?.fired ?? []).toEqual([])
    // Nor someone who waits out the days without doing anything.
    const waiting = new Engine(content, { seed: 9 })
    waiting.start()
    waiting.tick(21 * DAY)
    expect(waiting.state.pulse?.fired ?? []).toEqual([])
  }, 120_000)

  it("with the frames' lines on often, a small world brings a hook every two days or so, and takes its watchers in turn", async () => {
    const isle = loadContent(await readContentFiles('content', 'isle'))
    const engine = new Engine(isle, { seed: 9 })
    engine.start()
    await engine.handle('frames lines often')
    const begin = engine.world.now
    await stayPut(engine)
    const times = [begin, ...hooksSince(engine.world, begin).map((h) => h.t), engine.world.now]
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeLessThanOrEqual(2.5 * DAY)
    const turns = engine.state.pulse!.fired.map((f) => f.watcher)
    expect(turns.length).toBeGreaterThanOrEqual(6)
    for (let i = 1; i < turns.length; i++) expect(turns[i]).not.toBe(turns[i - 1])
    expect(new Set(turns.slice(0, 3)).size).toBe(3)
  }, 120_000)
})
