import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { MockLlm, runSituation, type LlmClient, type LlmRequest } from '../src/engine'
import { REPLY_WITHIN_MS } from '../src/engine/dialogue/conversation'
import { CostRegister } from '../src/node/ai/costs'
import { Gateway } from '../src/node/ai/gateway'
import { AiLog } from '../src/node/ai/log'
import type { Provider } from '../src/node/ai/providers'
import { UsageStore } from '../src/node/ai/usage'
import { content } from './helpers'

// Milestone M9.4 (docs/ROADMAP.md): finishing and release. The non-functional
// requirements of FO chapter 18, measured where a test can measure them.

const folders: string[] = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wisplight-m94-'))
  folders.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

describe('M9.4: a reply within six seconds, or the set line', () => {
  it('gives the second try only what is left of the six seconds', async () => {
    const good = new MockLlm('good')
    const leaky = new MockLlm('leak')
    const timeouts: number[] = []
    const client: LlmClient = {
      complete: async (r: LlmRequest) => {
        if (r.role !== 'voice') return good.complete(r)
        timeouts.push(r.timeoutMs ?? Infinity)
        // The first reply is slow and names what the speaker cannot know: it is asked again.
        await new Promise((done) => setTimeout(done, 120))
        return (timeouts.length === 1 ? leaky : good).complete(r)
      },
    }
    await runSituation(content, { id: 'mirte_local', npc: 'npc_mirte', lines: ['What happened to the mill?'] }, client)
    expect(timeouts[0]).toBeLessThanOrEqual(REPLY_WITHIN_MS)
    expect(timeouts[0]).toBeGreaterThan(REPLY_WITHIN_MS - 100)
    if (timeouts.length > 1) expect(timeouts[1]).toBeLessThanOrEqual(REPLY_WITHIN_MS - 120)
  })

  it('the gateway fails a call at once when no time is left, and stops a call that runs over', async () => {
    const dir = temp()
    const slow: Provider = {
      id: 'openai',
      listModels: async () => [],
      complete: (model, _r, signal) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => resolve({ text: '{}', provider: 'openai', model, usage: { inputTokens: 10, outputTokens: 1, cachedTokens: 0 }, latencyMs: 300 }), 300)
          signal?.addEventListener('abort', () => (clearTimeout(timer), reject(new Error('aborted'))))
        }),
    }
    const gateway = new Gateway({ role: () => ({ provider: 'openai', model: 'gpt-4.1-mini' }), provider: () => slow, budgetUsdPerHour: () => 1, log: new AiLog(), usage: new UsageStore(join(dir, 'usage.json')), costs: new CostRegister(join(dir, 'costs.jsonl')) })
    const request: LlmRequest = { role: 'voice', system: 's', prompt: 'p', schemaName: 'x', schema: {}, maxTokens: 20 }
    await expect(gateway.complete({ ...request, timeoutMs: 0 })).rejects.toMatchObject({ kind: 'timeout' })
    const t = Date.now()
    await expect(gateway.complete({ ...request, timeoutMs: 50 })).rejects.toMatchObject({ kind: 'timeout' })
    expect(Date.now() - t).toBeLessThan(250)
    await expect(gateway.complete(request)).resolves.toMatchObject({ text: '{}' })
  })
})
