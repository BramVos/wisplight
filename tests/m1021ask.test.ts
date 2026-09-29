import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { askOpen, askOutput, Engine, MockLlm, mustAsk, type LlmClient, type LlmRequest } from '../src/engine'
import { CostRegister } from '../src/node/ai/costs'
import { Gateway } from '../src/node/ai/gateway'
import { AiLog } from '../src/node/ai/log'
import { SettingsStore } from '../src/node/ai/settings'
import { UsageStore } from '../src/node/ai/usage'
import { content } from './helpers'

// M10.21: no question for small amounts. A call below the player's threshold
// runs at once; one that reaches it asks once, as a choice in the game: go on,
// not now (for the rest of the game day), or always. The price comes from the
// client; whether a question was put is kept in the log.

const folders: string[] = []
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

const request: LlmRequest = { role: 'chronicler', system: 'Make a district.', prompt: 'The harbour of Graafhaven.', schemaName: 'district', schema: {}, maxTokens: 3000 }

function priced(usd: number, above = 1): LlmClient & { never: number } {
  const mock = new MockLlm('good')
  const client = { never: 0, complete: (r: LlmRequest) => mock.complete(r), costOf: () => usd, askAboveUsd: () => (client.never ? Infinity : above), askNever: () => void (client.never += 1) }
  return client
}

describe('M10.21: ask once above the threshold', () => {
  it('lets a call below the threshold run, and one without a price or a model', () => {
    for (const llm of [priced(0.4), { complete: new MockLlm().complete.bind(new MockLlm()) }, undefined]) {
      const engine = new Engine(content, { seed: 1, ...(llm ? { llm } : {}) })
      expect(mustAsk(engine.world, 'district:graafhaven:harbour', 'Making the harbour district of Graafhaven playable', request)).toBeUndefined()
    }
  })

  it('asks once above it: go on runs what it was about, and it is not asked again', async () => {
    const engine = new Engine(content, { seed: 1, llm: priced(1.5) })
    engine.start()
    const asked = mustAsk(engine.world, 'district:graafhaven:harbour', 'Making the harbour district of Graafhaven playable', request, 'look')
    expect(asked && 'ask' in asked ? asked.ask : undefined).toMatchObject({ id: 'district:graafhaven:harbour', usd: 1.5, then: 'look' })
    expect(askOpen(engine.world)?.id).toBe('district:graafhaven:harbour')
    const shown = askOutput(engine.world, (asked as { ask: Parameters<typeof askOutput>[1] }).ask)
    expect(shown[0]!.text).toBe('Making the harbour district of Graafhaven playable costs about $1.50 with the model you chose.\n  1. Go on\n  2. Not now\n  3. Always go on, and stop asking\n(a number, the name, or anything else to leave it)')
    const out = await engine.handle('1')
    expect(out.some((o) => o.kind === 'room' || /Canal Quay|quay/i.test(o.text))).toBe(true)
    expect(askOpen(engine.world)).toBeUndefined()
    expect(mustAsk(engine.world, 'district:graafhaven:harbour', 'x', request)).toBeUndefined()
    expect(engine.save().log.filter((e) => e.k === 'ask')).toEqual([expect.objectContaining({ k: 'ask', id: 'district:graafhaven:harbour', usd: 1.5 })])
  })

  it('not now holds for the rest of the game day; always stops the questions for good', async () => {
    const llm = priced(2)
    const engine = new Engine(content, { seed: 1, llm })
    engine.start()
    mustAsk(engine.world, 'district:graafhaven:court', 'Making the court of Graafhaven playable', request)
    askOutput(engine.world, askOpen(engine.world)!)
    expect((await engine.handle('not now')).map((o) => o.text)).toEqual(['Not now, then. It stays as it is for today.'])
    expect(mustAsk(engine.world, 'district:graafhaven:court', 'x', request)).toEqual({ declined: true })
    engine.tick(24 * 60)
    expect(mustAsk(engine.world, 'district:graafhaven:court', 'x', request)).toHaveProperty('ask')
    askOutput(engine.world, askOpen(engine.world)!)
    const always = await engine.handle('3')
    expect(always.map((o) => o.text)).toContain('The game will not ask about the cost again; you can change that under Settings > AI.')
    expect(llm.never).toBe(1)
    expect(mustAsk(engine.world, 'district:graafhaven:guilds', 'x', request)).toBeUndefined()
  })

  it('puts the same question in a replay, from the log', () => {
    const engine = new Engine(content, { seed: 1, llm: priced(3) })
    expect(engine.world.costAsk?.('district:a:b', request)).toBe(3)
    const entry = engine.save().log.find((e) => e.k === 'ask')!
    // Played back, the recorded question comes in its place; nothing else is asked.
    const again = new Engine(content, { seed: 1 }) as unknown as { replaying: boolean; replayAsks: unknown[]; world: Engine['world']; save: Engine['save'] }
    again.replaying = true
    again.replayAsks = [entry]
    expect(again.world.costAsk?.('district:a:b', request)).toBe(3)
    expect(again.world.costAsk?.('district:a:b', request)).toBeUndefined()
    expect(again.save().log.filter((e) => e.k === 'ask')).toEqual([entry])
  })

  it('prices a call on the model it would go to, and keeps the threshold as the player sets it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-m1021ask-'))
    folders.push(dir)
    const settings = new SettingsStore(join(dir, 'settings.json'), { available: () => false, encrypt: () => '', decrypt: () => '' })
    expect(settings.askAboveUsd).toBe(1)
    expect(settings.setAskAbove(0.5)).toEqual({ usd: 0.5, adjusted: false })
    expect(settings.summary().askAboveUsd).toBe(0.5)
    settings.setAskAbove(null)
    expect(settings.askAboveUsd).toBe(Infinity)
    expect(settings.summary().askAboveUsd).toBeNull()
    const gateway = new Gateway({ role: () => ({ provider: 'anthropic', model: 'claude-opus-5-5' }), provider: () => undefined, budgetUsdPerHour: () => 5, log: new AiLog(), usage: new UsageStore(join(dir, 'usage.json')), costs: new CostRegister(join(dir, 'costs.jsonl')), askAboveUsd: () => settings.askAboveUsd })
    // Opus 5.5: about 3,000 tokens in at $4 a million and half of 3,000 out at $20.
    expect(gateway.costOf({ ...request, prompt: 'x'.repeat(10500) })).toBeCloseTo(0.042, 2)
    expect(gateway.askAboveUsd()).toBe(Infinity)
  })
})
