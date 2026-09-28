import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { hourlyBudget, replyWithin, type LlmRequest } from '../src/engine'
import { BuildStore } from '../src/node/ai/builds'
import { CostRegister } from '../src/node/ai/costs'
import { Gateway } from '../src/node/ai/gateway'
import { AiLog } from '../src/node/ai/log'
import type { Provider, ProviderResponse } from '../src/node/ai/providers'
import { SettingsStore, type Cipher } from '../src/node/ai/settings'
import { UsageStore } from '../src/node/ai/usage'

// M10.20: the player's budget, and a budget per world build (Bram, 28
// September 2026). He set $50 an hour while building The Quiet Reach, and the
// app made it $5 without a word; the build then waited four times on the
// game's hourly budget. No real API is called.

const folders: string[] = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wisplight-m1020budget-'))
  folders.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

const plain: Cipher = { available: () => true, encrypt: (s) => s, decrypt: (s) => s }
// gpt-4.1-mini: $0.40 per million input tokens, so 250,000 tokens cost $0.10.
const dime = (): Promise<ProviderResponse> => Promise.resolve({ text: '{}', provider: 'openai', model: 'gpt-4.1-mini', usage: { inputTokens: 250_000, outputTokens: 0, cachedTokens: 0 }, latencyMs: 1 })
const provider: Provider = { id: 'openai', listModels: async () => [], complete: dime }

function gateway(dir: string, budget: number, builds?: BuildStore) {
  return new Gateway({ role: () => ({ provider: 'openai', model: 'gpt-4.1-mini' }), provider: () => provider, budgetUsdPerHour: () => budget, log: new AiLog(), usage: new UsageStore(join(dir, 'usage.json')), costs: new CostRegister(join(dir, 'costs.jsonl')), ...(builds ? { builds } : {}) })
}
const talk: LlmRequest = { role: 'voice', system: 's', prompt: 'p', schemaName: 'x', schema: {}, maxTokens: 50 }
const step = (world: string, id: string): LlmRequest => ({ role: 'chronicler', system: 's', prompt: 'p', schemaName: 'world_step', schema: {}, maxTokens: 50, timeoutMs: 600000, meta: { step: id, prefix: `${world}/` } })

describe('M10.20: the budget is the player\'s', () => {
  it('keeps what the player sets, and says when a slip of the keyboard is caught', () => {
    const settings = new SettingsStore(join(temp(), 'settings.json'), plain)
    expect(settings.setBudget(50)).toEqual({ usd: 50, adjusted: false })
    expect(settings.budgetUsdPerHour).toBe(50)
    expect(settings.setBudget(5000)).toEqual({ usd: 1000, adjusted: true })
    expect(settings.setReplyWithin(100)).toEqual({ seconds: 60, adjusted: true })
    expect(settings.setReplyWithin(12)).toEqual({ seconds: 12, adjusted: false })
    expect(hourlyBudget(0)).toEqual({ usd: 0.01, adjusted: true })
    expect(replyWithin(2.4)).toEqual({ seconds: 3, adjusted: true })
  })

  it('says when there is room in the hour again, or that a call is more than the hour allows', async () => {
    const dir = temp()
    const g = gateway(dir, 0.1)
    await g.complete(talk)
    await expect(g.complete(talk)).rejects.toMatchObject({ kind: 'budget', message: 'the hourly budget is used up; there is room again in about 60 minutes' })
    await expect(gateway(temp(), 0.001).complete({ ...talk, maxTokens: 100_000 })).rejects.toMatchObject({ message: expect.stringMatching(/^the hourly budget is used up: this call may cost up to \$\d+\.\d\d, more than the \$0\.00 an hour allows$/) })
  })

  it('counts a world build in its own budget, per step, and leaves the game\'s hour alone', async () => {
    const dir = temp()
    const builds = new BuildStore(join(dir, 'builds.json'), () => 0.1)
    const g = gateway(dir, 0.1, builds)
    // The game's hour is full; the build goes on in its own budget (the hourly one until the designer sets another).
    await g.complete(talk)
    await expect(g.complete(talk)).rejects.toMatchObject({ kind: 'budget' })
    await g.complete(step('reach', 'places'))
    expect(builds.view('reach')).toMatchObject({ limitUsd: 0.1, own: false, calls: 1 })
    expect(builds.view('reach').steps['places']).toBeCloseTo(0.1, 6)
    expect(g.status().hourSpentUsd).toBeCloseTo(0.1, 6)
    // Past its own limit a build stops, and says how to go on.
    await expect(g.complete(step('reach', 'people'))).rejects.toMatchObject({ kind: 'budget', message: expect.stringMatching(/^this build has spent \$0\.10 of the \$0\.10 it may spend.*raise what the build may spend in the editor$/) })
    expect(builds.setLimit('reach', 50)).toMatchObject({ adjusted: false, view: { limitUsd: 50, own: true } })
    await g.complete(step('reach', 'people'))
    expect(builds.view('reach').spentUsd).toBeCloseTo(0.2, 6)
    // Kept on disk, and counted from zero again when asked, with the limit kept.
    expect(new BuildStore(join(dir, 'builds.json'), () => 5).view('reach')).toMatchObject({ limitUsd: 50, calls: 2 })
    expect(builds.reset('reach')).toMatchObject({ limitUsd: 50, spentUsd: 0, calls: 0, steps: {} })
  })
})
