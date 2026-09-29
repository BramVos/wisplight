import { describe, expect, it } from 'vitest'
import { Engine, MockLlm } from '../src/engine'
import { toChronicler } from '../src/engine/planning'
import { queueSignal } from '../src/engine/signals'
import { content, runUntil } from './helpers'

// M10.22: one cadence, one queue (Bram: not ten times in quick succession).
// What the chronicler must see waits in the signal queue for one night run,
// with the limits a run has. By day, only big news calls him apart (the
// world's knob, belang 4 unless it says otherwise), once a game day at most.
// A night run takes the most important signals; the rest wait a night, once.

const people = ['npc_mirte', 'npc_gerrit', 'npc_harmen', 'npc_aaltje', 'npc_jan_visser', 'npc_wouter']

function signal(engine: Engine, i: number, belang: number) {
  const s = queueSignal(engine.world, { kind: `test_${i}`, who: [people[i % people.length]!], place: 'loc_veenhoek_green', cause: [], belang, watcher: 'test' })
  toChronicler(engine.world, s)
  return s
}

const calls = (mock: MockLlm) => mock.calls.filter((c) => c.schemaName === 'chronicle').length

describe('M10.22: one cadence, one queue', () => {
  it('twenty signals in one hour: one round, in the night', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 3, llm: mock })
    runUntil(engine, 15, 10)
    const mine = Array.from({ length: 20 }, (_, i) => signal(engine, i, 1 + (i % 3)))
    await engine.runChronicler()
    expect(calls(mock)).toBe(0)
    runUntil(engine, 16, 3, 59)
    const before = engine.state.chronicle!.signals!.length
    runUntil(engine, 16, 4, 5)
    await engine.runChronicler()
    expect(calls(mock)).toBe(1)
    // The night run took the twelve most important (the world's own signals of the day among them); the rest wait a night.
    expect(engine.state.chronicle!.signals).toHaveLength(before - 12)
    expect(mine.filter((s) => s.belang === 3).some((s) => s.waited)).toBe(false)
    expect(mine.filter((s) => s.waited).every((s) => s.belang < 3)).toBe(true)
  }, 60_000)

  it('big news calls him by day once a game day; the rest waits for the night', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 3, llm: mock })
    runUntil(engine, 15, 10)
    for (let i = 0; i < 3; i++) signal(engine, i, 4)
    await engine.runChronicler()
    expect(calls(mock)).toBe(1)
    expect(engine.state.chronicle!.signals).toHaveLength(2)
    runUntil(engine, 16, 4, 5)
    await engine.runChronicler()
    expect(calls(mock)).toBe(2)
    expect(engine.state.chronicle!.signals ?? []).toHaveLength(0)
  }, 60_000)

  it('a signal that waited a night goes back to the rules rather than wait again', async () => {
    const engine = new Engine(content, { seed: 3 })
    runUntil(engine, 15, 10)
    const all = Array.from({ length: 20 }, (_, i) => signal(engine, i, 1 + (i % 3)))
    runUntil(engine, 16, 5)
    const waiting = new Set((engine.state.chronicle!.signals ?? []).filter((id) => all.some((s) => s.id === id)))
    expect(waiting.size).toBeGreaterThanOrEqual(8)
    for (let i = 0; i < 20; i++) signal(engine, 100 + i, 3)
    runUntil(engine, 17, 5)
    // Those eight did not wait a second night: none of them is in the queue still.
    expect((engine.state.chronicle!.signals ?? []).filter((id) => waiting.has(id))).toEqual([])
    expect(all.filter((s) => waiting.has(s.id)).every((s) => s.waited)).toBe(true)
  }, 60_000)
})
