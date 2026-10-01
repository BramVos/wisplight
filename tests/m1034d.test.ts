import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { applyOutput, buildInput } from '../src/engine/chronicler'
import type { ChronicleRun, Storyline } from '../src/engine/state'
import { chronicleState } from '../src/engine/storylines'
import { content } from './helpers'

// M10.34 D, nothing falls out of the night round (V04 of the external review;
// the cause, in talksOf: the newest ten talks of a storyline went, and then its
// time mark moved to now, so every older talk that did not go was gone for
// good; and the review's second note, 1 October 2026: moving the mark only to
// the last talk taken does not help while the newest ten are taken). The
// round reads the oldest open talks first, at most ten, and marks each.

const empty = { lore: [], lines: [], quests: [], thoughts: [], news: [] } as never

describe('M10.34 D: nothing falls out of the night round', () => {
  it('reads ten of twelve talks, the oldest first, and the last two with the next round', () => {
    const engine = new Engine(content, { seed: 3 })
    const world = engine.world
    const t0 = world.now
    // A line that began at t0 (a line of an older save keeps its last round's time as where its talks begin).
    const line = { id: 'line_d', title: 'the mill', facts: [], people: ['npc_harmen'], places: [], summary: [], roles: [], hooks: [], reported: [], open: true, changed: false, told: t0 } as unknown as Storyline
    chronicleState(world).lines.push(line)
    for (let i = 0; i < 12; i++) (world.state.npcs['npc_harmen']!.memory ??= []).push({ t: t0 + 10 + i, note: `Talk ${i}.`, topics: [], valence: 0, talk: true })
    engine.tick(60)
    const first: ChronicleRun = { id: 'run_d1', t: world.now, reason: 'night', lines: ['line_d'] }
    const talks = buildInput(world, first).lines[0]!.talks!
    expect(talks).toHaveLength(10)
    expect(talks[0]).toMatch(/Talk 0\.$/)
    expect(talks.at(-1)).toMatch(/Talk 9\.$/)
    applyOutput(world, first, empty, 'chronicler')
    const memory = world.state.npcs['npc_harmen']!.memory!
    expect(memory.filter((m) => m.toldTo?.includes('line_d'))).toHaveLength(10)
    expect(memory.filter((m) => !m.toldTo?.includes('line_d')).map((m) => m.note)).toEqual(['Talk 10.', 'Talk 11.'])
    // A talk after the round was asked waits for the next one.
    memory.push({ t: world.now + 5, note: 'Talk later.', topics: [], valence: 0, talk: true })
    const second: ChronicleRun = { id: 'run_d2', t: world.now, reason: 'night', lines: ['line_d'] }
    expect(buildInput(world, second).lines[0]!.talks).toEqual([expect.stringMatching(/Talk 10\.$/), expect.stringMatching(/Talk 11\.$/)])
  })

  it('marks nothing when the rules write the round, so a round with a model still reads the talks', () => {
    const engine = new Engine(content, { seed: 3 })
    const world = engine.world
    const line = { id: 'line_r', title: 'the mill', facts: [], people: ['npc_harmen'], places: [], summary: [], roles: [], hooks: [], reported: [], open: true, changed: false, told: world.now } as unknown as Storyline
    chronicleState(world).lines.push(line)
    ;(world.state.npcs['npc_harmen']!.memory ??= []).push({ t: world.now + 1, note: 'A talk.', topics: [], valence: 0, talk: true })
    engine.tick(10)
    applyOutput(world, { id: 'run_r', t: world.now, reason: 'night', lines: ['line_r'] }, null, 'template')
    expect(world.state.npcs['npc_harmen']!.memory!.at(-1)!.toldTo).toBeUndefined()
  })
})
