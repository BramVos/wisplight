import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, LlmError, MockLlm, type LlmClient, type LlmRejection, type LlmRequest } from '../src/engine'
import { buildInput } from '../src/engine/chronicler'
import { nightly } from '../src/engine/storylines'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// Milestone M10.16 (docs/ROADMAP.md): improvisation, when the rules know no
// way. Only on what the content says matters; the model tells, the engine
// checks the one effect and carries it out; no count per day, the budget is
// the limit; without a model or with the budget spent, the thing's own line.

const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

/** A model that answers improvisations with what the test says, or throws. */
function scripted(answer: object | Error): LlmClient & { reports: LlmRejection[]; calls: LlmRequest[] } {
  const reports: LlmRejection[] = []
  const calls: LlmRequest[] = []
  return {
    reports,
    calls,
    complete: async (request) => {
      calls.push(request)
      if (answer instanceof Error) throw answer
      return { text: JSON.stringify(answer), provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
    report: (r) => reports.push(r),
  }
}

async function atTheHill(llm?: LlmClient): Promise<Engine> {
  const engine = new Engine(content, { seed: 31, builder: true, ...(llm ? { llm } : {}) })
  engine.start()
  await engine.handle('@goto loc_kabouterberg')
  engine.state.player.inventory['milk'] = 2
  return engine
}

describe('M10.16: improvisation where the rules know no way', () => {
  it('milk poured on the oak of the Kabouterberg: a narration and a little standing with the kabouters; the milk is spent', async () => {
    const mock = new MockLlm('good')
    const engine = await atTheHill(mock)
    const out = said(await engine.handle('pour milk on the oak'))
    expect(out).toMatch(/^You pour and wait\./)
    expect(engine.state.reputation?.['kabouters']).toBe(2)
    expect(engine.state.player.inventory['milk']).toBe(1)
    expect(engine.state.improvisations?.at(-1)).toMatchObject({ target: 'loc_kabouterberg', act: 'pour milk on the oak', effect: 'standing kabouters +2' })
    expect(engine.state.signals?.queue.concat(engine.state.signals.log).some((s) => s.kind === 'improvised')).toBe(true)
    // A second act here goes on from the first: the model is told what happened before.
    await engine.handle('bow to the oak')
    const second = mock.calls.filter((c) => c.schemaName === 'improvise').at(-1)!
    expect(second.prompt).toMatch(/BEFORE, HERE \(go on from this, do not repeat it\):\n- pour milk on the oak:/)
  })

  it('the rules first: a known verb, a thing\'s own line, and a thing that does not matter never reach the model', async () => {
    const mock = new MockLlm('good')
    const engine = await atTheHill(mock)
    expect(said(await engine.handle('drink milk'))).toMatch(/That milk is not yours to drink\./)
    expect(said(await engine.handle('dig hill'))).toMatch(/Nobody digs in the Kabouterberg/)
    await engine.handle('@goto loc_waagdam_market')
    expect(said(await engine.handle('kick market'))).not.toMatch(/You kick/)
    expect(mock.calls.filter((c) => c.schemaName === 'improvise')).toEqual([])
    // A stone that the content gives no improvise: the fixed answer.
    const deepwell = await loadContentFromDir(join(import.meta.dirname, 'worlds'), 'other')
    const dome = new Engine(deepwell, { seed: 32, llm: mock })
    dome.start()
    await dome.handle('e')
    expect(said(await dome.handle('kick the tap'))).toMatch(/^You think better of it|^You can't/)
    expect(mock.calls.filter((c) => c.schemaName === 'improvise')).toEqual([])
  })

  it('an effect outside what the content allows is refused: the narration stays, nothing else happens', async () => {
    const llm = scripted({ narration: 'You pour it out. A loaf lies there that was not there before.', effect: { kind: 'item', id: 'rye_bread', delta: 0, title: '' } })
    const engine = await atTheHill(llm)
    const out = said(await engine.handle('pour milk on the oak'))
    expect(out).toBe('You pour it out. A loaf lies there that was not there before.')
    expect(engine.state.player.inventory['rye_bread'] ?? 0).toBe(0)
    expect(llm.reports).toEqual([expect.objectContaining({ reason: 'schema', fixed: expect.stringMatching(/effect refused: item is not something this may do/) })])
  })

  it('no count a day: every act goes to the model while the budget lasts; spent, the thing\'s own line and why', async () => {
    const mock = new MockLlm('good')
    const engine = await atTheHill(mock)
    for (const act of ['pour milk on the oak', 'bow to the oak', 'sing to the oak', 'hug the oak', 'whisper to the oak']) await engine.handle(act)
    expect(mock.calls.filter((c) => c.schemaName === 'improvise')).toHaveLength(5)
    const spent = await atTheHill(scripted(new LlmError('budget', 'the hourly budget is spent')))
    const out = said(await spent.handle('pour milk on the oak'))
    expect(out).toBe("The hill keeps its silence. Whatever you meant by it, the kabouters keep their own counsel.\n(The AI budget is used up: the hourly budget is spent; this is the game's own line for the oak.)")
    expect(spent.state.player.inventory['milk']).toBe(2)
    // Without any model, only the line.
    const none = await atTheHill()
    expect(said(await none.handle('pour milk on the oak'))).toBe('The hill keeps its silence. Whatever you meant by it, the kabouters keep their own counsel.')
  })

  it('a fact of an improvisation reaches the chronicler, who decides whether anything comes of it', async () => {
    const llm = scripted({ narration: 'You set the bread on the stone. The water goes very still, and then a ring spreads out from it, slow.', effect: { kind: 'fact', id: '', delta: 0, title: 'bread for the Haakman' } })
    const engine = new Engine(content, { seed: 33, builder: true, llm })
    engine.start()
    await engine.handle('@goto loc_blackmere_hookstone')
    engine.state.player.inventory['rye_bread'] = 1
    await engine.handle('lay bread on the stone')
    const fact = engine.state.news!.facts.find((f) => f.kind === 'improvised')!
    expect(fact).toMatchObject({ belang: 2, title: 'bread for the Haakman', place: 'loc_blackmere_hookstone' })
    // In the night the chronicler gets a run with the line it is on.
    await engine.handle('@time 4')
    nightly(engine.world)
    const run = engine.state.chronicle!.pending.find((r) => r.reason === 'night')!
    const input = buildInput(engine.world, run)
    expect(JSON.stringify(input)).toContain('bread for the Haakman')
  })

  it('a signal every time: the dog answers what was done at its stone, in the night, as content; and what was offered stays unless the answer spends it', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 34, builder: true, llm: mock })
    engine.start()
    await engine.handle('@goto loc_veenhoek_quay')
    engine.state.player.inventory['beer'] = 1
    await engine.handle('pour beer on the stone')
    expect(engine.state.reputation?.['water_spirits']).toBe(2)
    // With a model the chronicler has the signal first, in his night run; what he leaves, the content answers.
    for (let i = 0; i < 48 && !engine.state.news!.facts.some((f) => f.kind === 'omen'); i++) {
      engine.tick(60)
      await engine.runChronicler()
    }
    expect(engine.state.news!.facts.find((f) => f.kind === 'omen')?.title).toBe('a dog barking across the water in the night')
    const kept = await atTheHill(scripted({ narration: 'You hold the milk out to the hollow. Nothing takes it.', effect: { kind: 'nothing', id: '', delta: 0, title: '' }, spent: false }))
    await kept.handle('pour milk on the oak')
    expect(kept.state.player.inventory['milk']).toBe(2)
  })

  it('Skerrow: the silver grove and the waystone may be improvised on', async () => {
    const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')
    expect(isle.locations.get('loc_skerrow_silver_grove')!.improvise).toMatchObject({ domain: 'offering', may: [{ standing: 'tidemother_faithful' }, { fact: true }] })
    expect(isle.objectTypes.get('waystone')!.improvise?.domain).toBe('lore')
  })
})
