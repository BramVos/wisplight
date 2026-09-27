import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { LlmRequest } from '../src/engine'
import { CostRegister } from '../src/node/ai/costs'
import { Gateway, UNPRICED_CALLS_PER_HOUR } from '../src/node/ai/gateway'
import { AiLog } from '../src/node/ai/log'
import { costUsd } from '../src/node/ai/pricing'
import type { Provider, ProviderResponse } from '../src/node/ai/providers'
import { UsageStore } from '../src/node/ai/usage'

// Milestone M9.3 (docs/ROADMAP.md): scale. Costs first: the hourly budget
// counts every call of the last hour, also after a restart; calls reserve
// what they may cost before they go; an unknown price is a status of its own;
// cache writes are counted and priced apart. No real API is called.

const folders: string[] = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wisplight-m93-'))
  folders.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

const request: LlmRequest = { role: 'voice', system: 's', prompt: 'p', schemaName: 'x', schema: {}, maxTokens: 50 }
const provider = (answer: () => Promise<ProviderResponse>): Provider => ({ id: 'openai', listModels: async () => [], complete: answer })
// gpt-4.1-mini: $0.40 per million input tokens, so 25,000 tokens cost $0.01.
const cent = (): Promise<ProviderResponse> => Promise.resolve({ text: '{}', provider: 'openai', model: 'gpt-4.1-mini', usage: { inputTokens: 25_000, outputTokens: 0, cachedTokens: 0 }, latencyMs: 1 })

function gateway(dir: string, p: Provider, budget: number, model = 'gpt-4.1-mini', now?: () => number) {
  return new Gateway({ role: () => ({ provider: 'openai', model }), provider: () => p, budgetUsdPerHour: () => budget, log: new AiLog(), usage: new UsageStore(join(dir, 'usage.json')), costs: new CostRegister(join(dir, 'costs.jsonl'), now), ...(now ? { now } : {}) })
}

describe('M9.3: the cost register', () => {
  it('counts every call of the last hour, not the last 200 lines of a log, and after a restart too', async () => {
    const dir = temp()
    const g = gateway(dir, provider(cent), 10)
    for (let i = 0; i < 250; i++) await g.complete(request)
    expect(g.status().hourSpentUsd).toBeCloseTo(2.5, 6)
    // A restart: a new gateway on the same folder.
    expect(gateway(dir, provider(cent), 10).status().hourSpentUsd).toBeCloseTo(2.5, 6)
    // An hour later it has all fallen away.
    const later = gateway(dir, provider(cent), 10, 'gpt-4.1-mini', () => Date.now() + 61 * 60 * 1000)
    expect(later.status().hourSpentUsd).toBe(0)
  })

  it('reserves what a call may cost before it goes, so calls at the same time stay within the budget together', async () => {
    const dir = temp()
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => (release = r))
    const slow = provider(async () => {
      await gate
      return cent()
    })
    // Each call may answer 12,500 tokens at $1.60 a million: $0.02 at most. With $0.05 an hour, two may go at once, not three.
    const g = gateway(dir, slow, 0.05)
    const big = { ...request, maxTokens: 12_500 }
    const calls = [g.complete(big), g.complete(big), g.complete(big).catch((e: unknown) => e)]
    expect(g.status().hourReservedUsd).toBeGreaterThan(0.04)
    release()
    const results = await Promise.all(calls)
    expect(results[2]).toMatchObject({ kind: 'budget' })
    // Settled: what they really cost, and nothing held any more.
    expect(g.status().hourReservedUsd).toBe(0)
    expect(g.status().hourSpentUsd).toBeCloseTo(0.02, 6)
  })

  it('treats an unknown price as a status of its own: tokens counted, calls capped, shown in the settings', async () => {
    const dir = temp()
    const g = gateway(dir, provider(async () => ({ text: '{}', provider: 'openai', model: 'mystery-9', usage: { inputTokens: 900, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 })), 10, 'mystery-9')
    for (let i = 0; i < UNPRICED_CALLS_PER_HOUR; i++) await g.complete(request)
    await expect(g.complete(request)).rejects.toMatchObject({ kind: 'budget', message: /price of mystery-9 is not known/ })
    expect(g.status().unpriced).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'voice', model: 'mystery-9', callsThisHour: UNPRICED_CALLS_PER_HOUR })]))
  })

  it('counts and prices cache writes apart, and knows per role how much came from the cache', () => {
    const usage = { inputTokens: 10_000, outputTokens: 0, cachedTokens: 4_000, cacheWriteTokens: 6_000 }
    // Haiku 4.5: $1 input, $0.10 cached, $1.25 to write, per million.
    expect(costUsd('claude-haiku-4-5', usage)).toBeCloseTo((4_000 * 0.1 + 6_000 * 1.25) / 1_000_000, 10)
    const store = new UsageStore(join(temp(), 'usage.json'))
    store.record('anthropic', 'claude-haiku-4-5', usage, true, undefined, 'voice')
    store.record('anthropic', 'claude-haiku-4-5', { inputTokens: 10_000, outputTokens: 0, cachedTokens: 10_000 }, true, undefined, 'voice')
    store.record('openai', 'gpt-4.1-mini', { inputTokens: 1_000, outputTokens: 0, cachedTokens: 0 }, true, undefined, 'brain')
    const roles = store.summary().byRole
    expect(roles.find((r) => r.role === 'voice')).toMatchObject({ calls: 2, cachedTokens: 14_000, cacheWriteTokens: 6_000, cachedPercent: 70 })
    expect(roles.find((r) => r.role === 'brain')).toMatchObject({ cachedPercent: 0 })
    expect(store.summary().month.cacheWriteTokens).toBe(6_000)
  })
})
