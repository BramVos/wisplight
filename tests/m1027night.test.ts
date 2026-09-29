import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assignKeys, buildRequest, chronicle, DEFAULT_LIMITS, type ChronicleInput, type ChroniclerModel } from '../src/chronicler'
import { buildInput } from '../src/engine/chronicler'
import { chroniclerTrial } from '../src/engine/dialogue/testset'
import { playGuide } from '../src/engine/quests/reference'
import { loadContentFromDir } from '../src/node/content'

// M10.27 (2): the night round costs less (Bram, 29 September 2026: the costs
// as low as they can be). It reads the part of the world's guide a round in
// the game needs, not the sections for the world builder; the plans part of
// its answer comes only when something may be planned; and a round with
// nothing new makes no call at all.

const root = resolve(import.meta.dirname, '..')

async function nightInput(): Promise<ChronicleInput> {
  const base = await loadContentFromDir(resolve(root, 'content'), 'base')
  const engine = (await chroniclerTrial(base)).find((e) => e.state.chronicle?.pending[0])!
  return buildInput(engine.world, engine.state.chronicle!.pending[0]!)
}

const request = (input: ChronicleInput) => buildRequest(input, assignKeys(input), DEFAULT_LIMITS, [], DEFAULT_LIMITS.lookups)
const plansIn = (input: ChronicleInput) => Boolean((request(input).schema['properties'] as Record<string, unknown>)['plans'])

describe('M10.27: the night round, cheaper', () => {
  it('reads the guide for a round in the game: without the sections for the world builder, the world\'s own part whole', async () => {
    const base = await loadContentFromDir(resolve(root, 'content'), 'base')
    const guide = playGuide(base.chronicler!)
    for (const heading of ['Your place in the game', 'Belang', 'Three versions', 'Storylines', 'A run in the game', 'Requests that come up by themselves', 'This world: the Nethermarch']) expect(guide, heading).toContain(`## ${heading}\n`)
    for (const heading of ['Where everything lives', 'Ids', 'The pieces', 'Sparring in the editor', 'Reference: the plan language']) expect(guide, heading).not.toContain(`## ${heading}\n`)
    expect(guide.length).toBeLessThan(base.chronicler!.length / 3)
    const night = request(await nightInput())
    expect(night.system).toContain('## A run in the game')
    expect(night.system).not.toContain('## Sparring in the editor')
  }, 60_000)

  it('asks for plans only when something may be planned, and for the phase of every storyline all the same', async () => {
    const input = await nightInput()
    const quiet: ChronicleInput = { ...input, lines: input.lines.map((l) => ({ ...l, phase: 'setup' as const })) }
    delete quiet.mayPlan
    delete quiet.signals
    expect(plansIn(quiet)).toBe(false)
    expect(request(quiet).system).not.toMatch(/^- plans:/m)
    expect(request(quiet).system).not.toContain('\nVERBS\n')
    // The pace still asks for the phase.
    expect(JSON.stringify(request(quiet).schema)).toContain('"phase"')
    expect(request(quiet).system).toContain('- lines also have phase')
    // A storyline rising may get its next beat; a big event its plan; a signal its steps.
    expect(plansIn({ ...quiet, lines: quiet.lines.map((l, i) => (i === 0 ? { ...l, phase: 'rising' as const } : l)) })).toBe(true)
    expect(plansIn({ ...quiet, mayPlan: [quiet.lines[0]!.id] })).toBe(true)
  }, 60_000)

  it('makes no call when nothing is new: no event, no signal, no hook asked for', async () => {
    const input = await nightInput()
    let calls = 0
    const model: ChroniclerModel = { complete: async () => (calls++, { text: '{}', usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 } }) }
    const told: ChronicleInput = { ...input, lines: input.lines.map((l) => ({ ...l, events: [] })) }
    delete told.signals
    delete told.pulse
    const result = await chronicle(told, model)
    expect(calls).toBe(0)
    expect(result.calls).toBe(0)
    expect(result.output.lore).toEqual([])
    // With news it asks as before.
    await chronicle(input, model)
    expect(calls).toBe(1)
  }, 60_000)
})
