import { describe, expect, it } from 'vitest'
import { Engine, type LlmClient, type LlmRejection, type LlmRequest } from '../src/engine'
import { content } from './helpers'

// M10.34 A, narration and effect are one outcome (V01 of the external review
// of 30 September 2026; the cause, in readImprovisation: a refused effect
// became nothing, but the narration and `spent` stayed, so the screen told a
// deed that did not happen, the milk was gone, and the narration lived on as
// a memory). A refused effect is asked again with nothing changing; then the
// thing's own line.

const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')
const answer = (narration: string, effect: object, spent = false) => ({ narration, effect: { kind: 'nothing', id: '', delta: 0, title: '', ...effect }, spent })

/** A model that gives these answers in turn, the last one again. */
function scripted(...answers: object[]): LlmClient & { reports: LlmRejection[]; calls: LlmRequest[] } {
  const reports: LlmRejection[] = []
  const calls: LlmRequest[] = []
  return {
    reports,
    calls,
    complete: async (request) => {
      calls.push(request)
      const a = answers[Math.min(calls.length - 1, answers.length - 1)]!
      return { text: JSON.stringify(a), provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
    report: (r) => reports.push(r),
  }
}

async function atTheHill(llm: LlmClient): Promise<Engine> {
  const engine = new Engine(content, { seed: 31, builder: true, llm })
  engine.start()
  await engine.handle('@goto loc_kabouterberg')
  engine.state.player.inventory['milk'] = 2
  return engine
}

describe('M10.34 A: narration and effect are one outcome', () => {
  it('asks again when the effect is refused, keeps the milk, and keeps only the narration that stood', async () => {
    // A thing that may not turn up here, with the milk spent: refused; then the same act with nothing changing.
    const llm = scripted(answer('You pour, and a gold coin rolls out of the roots.', { kind: 'item', id: 'gold_coin' }, true), answer('You pour, and the milk sinks into the moss. Nothing stirs.', {}))
    const engine = await atTheHill(llm)
    const out = said(await engine.handle('pour milk on the oak'))
    expect(llm.calls.filter((c) => c.schemaName === 'improvise')).toHaveLength(2)
    expect(llm.calls.at(-1)!.prompt).toMatch(/NOTE: what you proposed cannot happen here/)
    expect(out).toMatch(/the milk sinks into the moss/)
    expect(out).not.toMatch(/gold coin/)
    expect(engine.state.player.inventory['milk']).toBe(2)
    expect(engine.state.improvisations?.map((i) => i.narration).join(' ')).not.toMatch(/gold coin/)
    expect(llm.reports.map((r) => r.reason)).toContain('bounds')
  })

  it('gives the thing its own line when the effect is refused twice, a forbidden state among them, and remembers nothing', async () => {
    const llm = scripted(answer('The oak splits in two at your word.', { kind: 'state', id: 'split:true' }, true))
    const engine = await atTheHill(llm)
    const out = said(await engine.handle('pour milk on the oak'))
    expect(out).toMatch(/The hill keeps its silence/)
    expect(out).not.toMatch(/splits in two/)
    expect(engine.state.player.inventory['milk']).toBe(2)
    expect(engine.state.improvisations ?? []).toEqual([])
  })
})
