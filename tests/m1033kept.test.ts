import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { CostRegister } from '../src/node/ai/costs'
import { trial } from '../src/node/ai/advisor'
import { Gateway } from '../src/node/ai/gateway'
import { AiLog } from '../src/node/ai/log'
import type { Provider } from '../src/node/ai/providers'
import { UsageStore } from '../src/node/ai/usage'
import { content } from './helpers'

// M10.33 Q and W, the answers of a voice trial kept with what each was given
// and the model's own reply, to read one prompt beside another. Each kept
// line must carry its own answer: the trial counts TALK, then every line, then
// BYE, so a line's calls are not those of the line before it.

const dirs: string[] = []
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

describe('M10.33 Q: the answers of a trial kept, each with its own call', () => {
  it('keeps for every line the reply and what was given to that line, not to the one before', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-kept-'))
    dirs.push(dir)
    // A model that says back what the player said: the kept reply must hold the line it belongs to.
    const echo: Provider = {
      id: 'openai',
      listModels: async () => [],
      complete: async (model, request) => {
        const said = String((request.meta as { playerText?: string } | undefined)?.playerText ?? '')
        const text = JSON.stringify({ reply: `"You said: ${said}"`, names: [], mentioned_topics: [], effects: [], memory_note: 'Talked.', ends_conversation: false, keep_talking: 'no', action: 'none', propose: 'none' })
        return { text, provider: 'openai', model, usage: { inputTokens: 100, outputTokens: 20, cachedTokens: 0 }, latencyMs: 1 }
      },
    }
    const gateway = new Gateway({ role: () => ({ provider: 'openai', model: 'gpt-4.1-mini' }), provider: () => echo, budgetUsdPerHour: () => 10, log: new AiLog(), usage: new UsageStore(join(dir, 'usage.json')), costs: new CostRegister(join(dir, 'costs.jsonl')) })
    const result = await trial(gateway, content, 'openai', 'gpt-4.1-mini', 'voice', 4)
    const byModel = result.kept!.filter((k) => k.reply)
    expect(byModel.length).toBeGreaterThan(2)
    for (const k of byModel) {
      expect(k.reply).toContain(`You said: ${k.said}`)
      expect(k.given).toContain(k.said)
    }
  })
})
