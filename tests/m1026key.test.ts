import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { LlmRequest } from '../src/engine'
import { CostRegister } from '../src/node/ai/costs'
import { AiLog } from '../src/node/ai/log'
import { AiService } from '../src/node/ai/service'
import type { Cipher } from '../src/node/ai/settings'
import { UsageStore } from '../src/node/ai/usage'
import { content } from './helpers'

// M10.26, Bram's credit fell $4.14 in 24 minutes while the game's AI log
// showed eighteen talks: the trials ran in another process, and each process
// read the log, the hour and the month only as it found them at its start.
// Everything on the player's key now writes to the same log with where it came
// from (game, editor, trial, pictures), counts in the same hour and month, and
// every process reads what the others wrote.

const folders: string[] = []
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wisplight-key-'))
  folders.push(dir)
  return dir
}

function cipher(): Cipher {
  const key = randomBytes(32)
  return {
    available: () => true,
    encrypt: (plain) => {
      const iv = randomBytes(12)
      const c = createCipheriv('aes-256-gcm', key, iv)
      const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
      return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')
    },
    decrypt: (stored) => {
      const raw = Buffer.from(stored, 'base64')
      const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
      d.setAuthTag(raw.subarray(12, 28))
      return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
    },
  }
}

const TEST_KEY = `sk-ant-unittest${randomBytes(8).toString('hex')}`

/** A service on a folder, as a process of the app would have it, with a fake model that answers at a set cost. */
async function service(dir: string, source?: 'trial' | 'pictures', keyCipher = cipher()): Promise<AiService> {
  const ai = new AiService({
    dir,
    cipher: keyCipher,
    content,
    ...(source ? { source } : {}),
    providerFactory: (id) => ({
      id,
      listModels: async () => [{ id: 'claude-sonnet-5' }],
      complete: async () => ({ text: '{"ok":true}', provider: 'anthropic', model: 'claude-sonnet-5', usage: { inputTokens: 100_000, outputTokens: 10_000, cachedTokens: 0 }, latencyMs: 5 }),
    }),
  })
  return ai
}

const request = (extra: Partial<LlmRequest> = {}): LlmRequest => ({ role: 'chronicler', system: 's', prompt: 'p', schemaName: 'chronicle', schema: {}, maxTokens: 100, ...extra })

describe('M10.26: everything on the player\'s key in one log and one budget', () => {
  it('shares the hour and the day between processes, per source', () => {
    const dir = temp()
    const game = new CostRegister(join(dir, 'costs.jsonl'))
    const trial = new CostRegister(join(dir, 'costs.jsonl'))
    trial.add({ usd: 0.5, role: 'brain', source: 'trial' })
    game.add({ usd: 0.2, role: 'voice', source: 'game' })
    trial.add({ usd: 0.1, role: 'illustrator', source: 'pictures' })
    for (const register of [game, trial]) {
      expect(register.spentLastHour()).toBeCloseTo(0.8, 6)
      expect(register.spent().hour).toMatchObject({ trial: 0.5, game: 0.2, pictures: 0.1, editor: 0 })
      expect(register.spent().today.all).toBeCloseTo(0.8, 6)
    }
    // A process that starts later reads it all.
    expect(new CostRegister(join(dir, 'costs.jsonl')).spent().hour.all).toBeCloseTo(0.8, 6)
  })

  it('adds what every process spends to the same days and month', () => {
    const dir = temp()
    const game = new UsageStore(join(dir, 'usage.json'))
    const trial = new UsageStore(join(dir, 'usage.json'))
    game.record('anthropic', 'claude-sonnet-5', undefined, true, 0.3, 'voice', 'game')
    trial.record('anthropic', 'claude-sonnet-5', undefined, true, 0.4, 'brain', 'trial')
    game.record('anthropic', 'claude-sonnet-5', undefined, true, 0.1, 'voice', 'game')
    expect(game.monthCost()).toBeCloseTo(0.8, 6)
    expect(new UsageStore(join(dir, 'usage.json')).monthCost()).toBeCloseTo(0.8, 6)
    game.setMonthBudget(0.75)
    expect(trial.monthBudgetSpent()).toBe(true)
  })

  it('shows the calls of another process in the log, with where they came from', () => {
    const dir = temp()
    const game = new AiLog(join(dir, 'ai.jsonl'))
    const trial = new AiLog(join(dir, 'ai.jsonl'))
    const call = { role: 'brain', provider: 'anthropic', model: 'claude-sonnet-5', ok: true, latencyMs: 1, inputTokens: 1, outputTokens: 1, cachedTokens: 0, costUsd: 0.01, prompt: 'p', response: 'r' }
    trial.add({ ...call, time: '2026-09-29T15:10:00.000Z', source: 'trial' })
    game.add({ ...call, time: '2026-09-29T15:11:00.000Z', source: 'game', role: 'voice' })
    trial.reject('brain', 'schema')
    expect(game.recent(10).map((e) => [e.source, e.role, e.rejected ?? []])).toEqual([
      ['game', 'voice', []],
      ['trial', 'brain', ['schema']],
    ])
  })

  it('counts a trial with its own model in the game\'s hour, and a step of a world build as the editor\'s', async () => {
    const dir = temp()
    const keys = cipher()
    const game = await service(dir, undefined, keys)
    await game.connect('anthropic', TEST_KEY)
    await game.choose('chronicler', 'anthropic', 'claude-sonnet-5')
    game.settings.setBudget(20)
    const trial = await service(dir, 'trial', keys)
    // A trial names its model: the player's own choice, and still on the key.
    await trial.gateway.complete(request(), { provider: 'anthropic', model: 'claude-sonnet-5' })
    // A step of a world build in the game's own process is the editor's; it counts in its build and in the hour.
    await game.gateway.complete(request({ schemaName: 'world_step', meta: { prefix: 'quietreach/', step: 'places' } }))
    await game.gateway.complete(request())
    const spent = game.overview().status.spent!
    expect(spent.hour.trial).toBeGreaterThan(0)
    expect(spent.hour.editor).toBeGreaterThan(0)
    expect(spent.hour.game).toBeGreaterThan(0)
    expect(game.overview().status.hourSpentUsd).toBeCloseTo(spent.hour.all, 6)
    // The test call when choosing the model is on the key too, as the game's.
    expect([...new Set(game.recentLog(10).map((e) => e.source))].sort()).toEqual(['editor', 'game', 'trial'])
    // The hour is one budget: what the trial spent leaves less for the game.
    game.settings.setBudget(spent.hour.all)
    await expect(game.gateway.complete(request())).rejects.toThrow(/hourly budget/)
  })
})
