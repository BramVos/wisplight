import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { LlmError, type LlmRequest } from '../src/engine'
import { advicePrompt, askAdvice, pickAdvisor, preferSnapshot, validateAdvice } from '../src/node/ai/advisor'
import { Gateway } from '../src/node/ai/gateway'
import { AiLog } from '../src/node/ai/log'
import { costUsd, priceOf } from '../src/node/ai/pricing'
import { BusyError, mapError, rateLimitOf, type ModelInfo, type Provider, type ProviderId, type ProviderResponse } from '../src/node/ai/providers'
import { AiService } from '../src/node/ai/service'
import { mask, SettingsStore, type Cipher } from '../src/node/ai/settings'
import { UsageStore } from '../src/node/ai/usage'
import { content } from './helpers'

// The Node side of M2, with a stand-in for Electron's safeStorage and made-up
// providers. No real API is called and no real key is used.

const folders: string[] = []
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'wisplight-test-'))
  folders.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

/** AES with a throwaway key: like safeStorage, the stored text is unreadable. */
function testCipher(available = true): Cipher {
  const key = randomBytes(32)
  return {
    available: () => available,
    encrypt: (plain) => {
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
    },
    decrypt: (encoded) => {
      const raw = Buffer.from(encoded, 'base64')
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12))
      decipher.setAuthTag(raw.subarray(12, 28))
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
    },
  }
}

const TEST_KEY = `sk-proj-unittest${randomBytes(8).toString('hex')}`

function allText(dir: string): string {
  return readdirSync(dir, { recursive: true })
    .map((name) => join(dir, String(name)))
    .filter((path) => statSync(path).isFile())
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n')
}

const reply = (text: string, model = 'm', usage = { inputTokens: 1000, outputTokens: 100, cachedTokens: 600 }): ProviderResponse => ({ text, provider: 'fake', model, usage, latencyMs: 5 })

function fakeProvider(id: ProviderId, models: string[], answer: (model: string, request: LlmRequest, signal?: AbortSignal) => Promise<ProviderResponse>): Provider {
  return { id, listModels: async () => models.map((m): ModelInfo => ({ id: m })), complete: answer }
}

const voiceRequest: LlmRequest = { role: 'voice', system: 's', prompt: 'p', schemaName: 'x', schema: {}, maxTokens: 50 }

describe('settings: API keys', () => {
  it('stores the key encrypted, shows it masked, and removes it with the roles that used it', () => {
    const dir = temp()
    const settings = new SettingsStore(join(dir, 'settings.json'), testCipher())
    settings.setKey('openai', `  ${TEST_KEY}  `)
    settings.setRole('voice', { provider: 'openai', model: 'gpt-4.1-mini-2025-04-14' })
    expect(allText(dir)).not.toContain(TEST_KEY)
    expect(allText(dir)).not.toContain(TEST_KEY.slice(-12))
    expect(settings.key('openai')).toBe(TEST_KEY)
    expect(settings.summary().providers.openai.masked).toBe(`sk-...${TEST_KEY.slice(-4)}`)
    expect(JSON.stringify(settings.summary())).not.toContain(TEST_KEY)
    settings.removeKey('openai')
    expect(settings.key('openai')).toBeUndefined()
    expect(settings.role('voice')).toBeUndefined()
  })

  it('refuses to store a key when secure storage is missing', () => {
    const settings = new SettingsStore(join(temp(), 'settings.json'), testCipher(false))
    expect(() => settings.setKey('anthropic', TEST_KEY)).toThrow(/Secure storage/)
  })

  it('masks Anthropic keys with their prefix', () => {
    expect(mask('sk-ant-api03-abcdefgh1234')).toBe('sk-ant-...1234')
  })
})

describe('pricing', () => {
  it('finds prices for exact ids and dated snapshots, not for unknown models', () => {
    expect(priceOf('gpt-4.1-mini-2025-04-14')).toEqual(priceOf('gpt-4.1-mini'))
    expect(priceOf('claude-haiku-4-5-20251001')).toEqual(priceOf('claude-haiku-4-5'))
    expect(priceOf('gpt-9-ultra')).toBeUndefined()
  })

  it('counts cached input at the cached price', () => {
    // 400 uncached x $0.40 + 600 cached x $0.10 + 100 out x $1.60, per million.
    expect(costUsd('gpt-4.1-mini', { inputTokens: 1000, cachedTokens: 600, outputTokens: 100 })).toBeCloseTo(0.00038, 8)
  })
})

describe('usage', () => {
  it('adds up per session, day, month and model, and counts down the month budget and the credit', () => {
    let now = new Date(2026, 8, 26, 20, 0)
    const dir = temp()
    const usage = new UsageStore(join(dir, 'usage.json'), () => now)
    usage.setMonthBudget(1)
    usage.setCredit('openai', 10)
    const used = { inputTokens: 1_000_000, cachedTokens: 0, outputTokens: 0 }
    usage.record('openai', 'gpt-4.1-mini-2025-04-14', used, true) // $0.40
    usage.record('openai', 'gpt-4.1-mini-2025-04-14', undefined, false)
    usage.reject('openai', 'gpt-4.1-mini-2025-04-14')
    let summary = usage.summary()
    expect(summary.session.calls).toBe(2)
    expect(summary.today.costUsd).toBeCloseTo(0.4)
    expect(summary.monthLeftPercent).toBe(60)
    expect(summary.credit[0]).toMatchObject({ provider: 'openai', estimatedLeftUsd: 9.6, leftPercent: 96, stale: false })
    expect(summary.fallbackPercent).toBe(100)
    expect(summary.byModel[0]).toMatchObject({ model: 'gpt-4.1-mini-2025-04-14', calls: 2, failed: 1, rejected: 1 })

    usage.record('openai', 'gpt-4.1-mini-2025-04-14', { ...used, inputTokens: 2_000_000 }, true) // $0.80
    expect(usage.monthBudgetSpent()).toBe(true)

    // A new month starts on the first; the credit keeps counting and goes stale after 30 days.
    now = new Date(2026, 9, 27, 9, 0)
    const reloaded = new UsageStore(join(dir, 'usage.json'), () => now)
    summary = reloaded.summary()
    expect(summary.month.calls).toBe(0)
    expect(summary.session.calls).toBe(0)
    expect(summary.credit[0]).toMatchObject({ estimatedLeftUsd: expect.closeTo(8.8, 6), stale: true })
    expect(reloaded.monthBudgetSpent()).toBe(false)
    expect(reloaded.csv().split('\n')[0]).toBe('date,provider,model,calls,failed,rejected,input_tokens,cached_tokens,output_tokens,cost_usd,cache_write_tokens')
  })
})

describe('gateway', () => {
  const setup = (provider: Provider, budget = 1) => {
    const dir = temp()
    const usage = new UsageStore(join(dir, 'usage.json'))
    const log = new AiLog(join(dir, 'ai.jsonl'))
    const gateway = new Gateway({
      role: () => ({ provider: provider.id, model: 'gpt-4.1-mini' }),
      provider: () => provider,
      budgetUsdPerHour: () => budget,
      log,
      usage,
      timeoutMs: { voice: 50 },
    })
    return { gateway, usage, log, dir }
  }

  it("gives the editor's own long answers the time they ask for, up to five minutes; other calls keep their role's", async () => {
    const late = fakeProvider('openai', [], (_m, _r, signal) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve({ text: '{}', provider: 'openai', model: 'gpt-4.1-mini', usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 }, latencyMs: 80 }), 80)
      signal!.addEventListener('abort', () => {
        clearTimeout(timer)
        reject(new Error('aborted'))
      })
    }))
    const { gateway } = setup(late)
    const step: LlmRequest = { role: 'voice', system: 's', prompt: 'p', schemaName: 'world_step', schema: {}, maxTokens: 50, timeoutMs: 1000 }
    await expect(gateway.complete(step)).resolves.toMatchObject({ text: '{}' })
    await expect(gateway.complete({ ...step, schemaName: 'npc_reply' })).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('turns a slow reply into a timeout', async () => {
    const slow = fakeProvider('openai', [], (_m, _r, signal) => new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(new Error('aborted')))))
    const { gateway } = setup(slow)
    await expect(gateway.complete(voiceRequest)).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('stops calling when the hourly or monthly budget is used up', async () => {
    const provider = fakeProvider('openai', [], async () => reply('{}', 'gpt-4.1-mini', { inputTokens: 1_000_000, outputTokens: 0, cachedTokens: 0 }))
    const { gateway, usage } = setup(provider, 0.3)
    await gateway.complete(voiceRequest)
    await expect(gateway.complete(voiceRequest)).rejects.toMatchObject({ kind: 'budget' })
    const other = setup(provider, 5)
    other.usage.setMonthBudget(0.3)
    await other.gateway.complete(voiceRequest)
    await expect(other.gateway.complete(voiceRequest)).rejects.toMatchObject({ kind: 'budget', message: /month/ })
    expect(usage.summary().session.calls).toBe(1)
  })

  it('keeps the last fifth of the hourly budget for conversations', async () => {
    // gpt-4.1-mini costs $0.40 per million input tokens: one call of 500k tokens is $0.20 of a $0.24 budget, over 80%.
    const provider = fakeProvider('openai', [], async () => reply('{}', 'gpt-4.1-mini', { inputTokens: 500_000, outputTokens: 0, cachedTokens: 0 }))
    const { gateway } = setup(provider, 0.24)
    await gateway.complete(voiceRequest)
    await expect(gateway.complete({ ...voiceRequest, role: 'chronicler', priority: 'low' })).rejects.toMatchObject({ kind: 'budget', message: /kept for conversations/ })
    await expect(gateway.complete(voiceRequest)).resolves.toBeDefined()
  })

  it('waits after a rate limit without counting it as a failure, and cools down after three failures', async () => {
    let calls = 0
    const limited = fakeProvider('openai', [], async () => {
      calls++
      throw new BusyError(60_000)
    })
    const { gateway } = setup(limited)
    await expect(gateway.complete(voiceRequest)).rejects.toMatchObject({ kind: 'busy' })
    await expect(gateway.complete(voiceRequest)).rejects.toMatchObject({ kind: 'busy' })
    expect(calls).toBe(1)
    expect(gateway.status()).toMatchObject({ busy: true, coolingDown: false })

    const broken = fakeProvider('openai', [], async () => {
      throw new LlmError('network', 'down')
    })
    const second = setup(broken)
    for (let i = 0; i < 3; i++) await expect(second.gateway.complete(voiceRequest)).rejects.toMatchObject({ kind: 'network' })
    expect(second.gateway.status().coolingDown).toBe(true)
  })

  it('logs and counts every call, and never writes the key', async () => {
    const provider = fakeProvider('openai', [], async () => reply('{"ok":true}', 'gpt-4.1-mini'))
    const { gateway, log, usage, dir } = setup(provider)
    await gateway.complete({ ...voiceRequest, prompt: 'What happened to the mill?' })
    gateway.report({ reason: 'leak' })
    expect(log.recent()[0]).toMatchObject({ ok: true, prompt: 'What happened to the mill?', inputTokens: 1000, cachedTokens: 600 })
    expect(usage.summary().session).toMatchObject({ calls: 1, rejected: 1 })
    expect(allText(dir)).not.toMatch(/sk-/)
  })
})

describe('provider errors', () => {
  it('tells "no credit" apart from "too fast"', () => {
    expect(mapError(Object.assign(new Error('429 You exceeded your current quota'), { status: 429, code: 'insufficient_quota' }))).toMatchObject({ kind: 'config', message: /no credit left/ })
    expect(mapError(Object.assign(new Error('400 Your credit balance is too low to access the Anthropic API.'), { status: 400 }))).toMatchObject({ kind: 'config', message: /no credit left/ })
    expect(mapError(Object.assign(new Error('429 You have no credits remaining. Add credits to continue using the API.'), { status: 429 }))).toMatchObject({ kind: 'config', message: /no credit left/ })
    expect(mapError(Object.assign(new Error('429 Rate limit reached'), { status: 429, headers: new Headers({ 'retry-after': '7' }) }))).toMatchObject({ kind: 'busy', retryAfterMs: 7000 })
  })

  it('keeps one provider going while the other is down', async () => {
    const down = fakeProvider('openai', [], async () => {
      throw new LlmError('network', 'down')
    })
    const up = fakeProvider('anthropic', [], async () => reply('{}', 'claude-haiku-4-5'))
    const dir = temp()
    let voice: { provider: ProviderId; model: string } = { provider: 'openai', model: 'gpt-4.1-mini' }
    const gateway = new Gateway({ role: () => voice, provider: (id) => (id === 'openai' ? down : up), budgetUsdPerHour: () => 1, log: new AiLog(), usage: new UsageStore(join(dir, 'u.json')) })
    for (let i = 0; i < 3; i++) await expect(gateway.complete(voiceRequest)).rejects.toMatchObject({ kind: 'network' })
    expect(gateway.status().coolingDown).toBe(true)
    voice = { provider: 'anthropic', model: 'claude-haiku-4-5' }
    await expect(gateway.complete(voiceRequest)).resolves.toMatchObject({ text: '{}' })
    expect(gateway.status().coolingDown).toBe(false)
  })
})

describe('rate-limit headers', () => {
  it('reads Anthropic and OpenAI headers', () => {
    const anthropic = rateLimitOf(new Headers({ 'anthropic-ratelimit-requests-remaining': '0', 'anthropic-ratelimit-tokens-remaining': '12000', 'anthropic-ratelimit-tokens-reset': '2026-09-26T20:00:30Z' }), 'anthropic-ratelimit-requests-remaining', 'anthropic-ratelimit-tokens-remaining', ['anthropic-ratelimit-requests-reset', 'anthropic-ratelimit-tokens-reset'])
    expect(anthropic).toEqual({ requestsRemaining: 0, tokensRemaining: 12000, resetAt: Date.parse('2026-09-26T20:00:30Z') })
    const before = Date.now()
    const openai = rateLimitOf(new Headers({ 'x-ratelimit-remaining-requests': '4999', 'x-ratelimit-remaining-tokens': '100', 'x-ratelimit-reset-tokens': '6m0s' }), 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens', ['x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens'])
    expect(openai!.tokensRemaining).toBe(100)
    expect(openai!.resetAt! - before).toBeGreaterThanOrEqual(360_000)
    expect(rateLimitOf(new Headers(), 'a', 'b', [])).toBeUndefined()
  })
})

describe('model advice', () => {
  const models = ['gpt-4.1-mini', 'gpt-4.1-mini-2025-04-14', 'gpt-4.1-nano-2025-04-14', 'gpt-5.4', 'gpt-9-ultra'].map((id) => ({ id }))
  const ids = models.map((m) => m.id)

  it('asks a capable model and prefers dated snapshots', () => {
    expect(pickAdvisor('openai', models)).toBe('gpt-5.4')
    expect(pickAdvisor('anthropic', [{ id: 'claude-haiku-4-5-20251001' }, { id: 'claude-sonnet-5' }])).toBe('claude-sonnet-5')
    expect(preferSnapshot('gpt-4.1-mini', ids)).toBe('gpt-4.1-mini-2025-04-14')
    expect(preferSnapshot('gpt-5.4', ids)).toBe('gpt-5.4')
  })

  it('gives the model the live list and the known prices, and says which prices are unknown', () => {
    const prompt = advicePrompt(models)
    expect(prompt).toContain('use only these ids): gpt-4.1-mini, gpt-4.1-mini-2025-04-14')
    expect(prompt).toMatch(/gpt-4\.1-nano-2025-04-14: input 0\.1/)
    expect(prompt).toContain('PRICE UNKNOWN for: gpt-5.4, gpt-9-ultra')
  })

  it('accepts only ids from the list', () => {
    const choice = (model: string) => ({ recommended: { model, reason: '' }, cheaper: { model, reason: '' } })
    expect(validateAdvice({ voice: choice('gpt-4.1-mini'), brain: choice('gpt-4.1-nano-2025-04-14') }, ids)).toBeUndefined()
    expect(validateAdvice({ voice: choice('gpt-4o'), brain: choice('gpt-4.1-nano-2025-04-14') }, ids)).toMatch(/gpt-4o/)
  })

  it('rejects advice that names a model the key cannot use, and snapshots the good advice', async () => {
    const advise = async (voiceModel: string) => {
      const provider = fakeProvider('openai', ids, async () =>
        reply(JSON.stringify({ voice: { recommended: { model: voiceModel, reason: 'r' }, cheaper: { model: 'gpt-4.1-nano-2025-04-14', reason: 'r' } }, brain: { recommended: { model: 'gpt-4.1-nano-2025-04-14', reason: 'r' }, cheaper: { model: 'gpt-4.1-nano-2025-04-14', reason: 'r' } } })),
      )
      const dir = temp()
      const gateway = new Gateway({ role: () => undefined, provider: () => provider, budgetUsdPerHour: () => 1, log: new AiLog(), usage: new UsageStore(join(dir, 'u.json')) })
      return askAdvice(gateway, 'openai', models)
    }
    await expect(advise('gpt-4o')).rejects.toThrow(/gpt-4o/)
    const good = await advise('gpt-4.1-mini')
    expect(good.voice.recommended.model).toBe('gpt-4.1-mini-2025-04-14')
    expect(good.advisorModel).toBe('gpt-5.4')
  })
})

describe('AI service', () => {
  const goodReply = JSON.stringify({ act: 'AskAbout', reply: 'Mirte shrugs. "The storm took the sails."', mentioned_topics: [], effects: [], memory_note: 'A stranger asked.', ends_conversation: false })
  const service = (keyWorks = true, cipher = testCipher()) => {
    const dir = temp()
    const ai = new AiService({
      dir,
      cipher,
      content,
      providerFactory: (id, key) => ({
        id,
        listModels: async () => {
          // A real provider may quote the key back in its error; the service must not pass that on.
          if (!keyWorks) throw new Error(`401 Incorrect API key provided: ${key}`)
          return [{ id: 'gpt-4.1-mini-2025-04-14' }, { id: 'gpt-4.1-nano-2025-04-14' }]
        },
        complete: async (model, request) =>
          reply(
            request.schemaName === 'test_call'
              ? JSON.stringify({ ok: true })
              : request.role === 'brain'
              ? JSON.stringify({ goals: [], mood: 'calm', note: 'n' })
              : request.role === 'chronicler'
                ? JSON.stringify({ lookup: [], lore: [], lines: [], quests: [], thoughts: [], news: [] })
                : goodReply,
            model,
          ),
      }),
    })
    return { ai, dir }
  }

  it('saves a key only after the provider accepted it, and never repeats the key in an error', async () => {
    const { ai, dir } = service(false)
    const error = await ai.connect('openai', TEST_KEY).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).not.toContain(TEST_KEY)
    expect(ai.overview().settings.providers.openai.configured).toBe(false)
    expect(allText(dir)).not.toContain(TEST_KEY)
  })

  it('stores exactly the chosen model id after a test call, and only ids from the list', async () => {
    const { ai, dir } = service()
    await ai.connect('openai', TEST_KEY)
    expect(ai.client()).toBeUndefined()
    await expect(ai.choose('voice', 'openai', 'gpt-4.1-mini')).rejects.toThrow(/not in the list/)
    expect(await ai.choose('voice', 'openai', 'gpt-4.1-mini-2025-04-14')).toBe('gpt-4.1-mini-2025-04-14')
    expect(await ai.choose('brain', 'openai', 'gpt-4.1-nano-2025-04-14')).toBe('gpt-4.1-nano-2025-04-14')
    expect(ai.settings.role('voice')).toEqual({ provider: 'openai', model: 'gpt-4.1-mini-2025-04-14' })
    expect(ai.client()).toBe(ai.gateway)
    const trial = await ai.trial('openai', 'gpt-4.1-mini-2025-04-14', 'voice')
    // Six conversation lines, and since M10.20 every other kind of the voice once (a party, an improvisation).
    expect(trial.runs).toBe(8)
    expect(trial.valid).toBeGreaterThanOrEqual(6)
    expect(trial.costPerHourUsd).toBeGreaterThan(0)
    expect(allText(dir)).not.toContain(TEST_KEY)
  })

  it('keeps the model lists, so a model can be chosen without asking again, and notices a model that is gone', async () => {
    const cipher = testCipher()
    const { ai, dir } = service(true, cipher)
    await ai.connect('openai', TEST_KEY)
    expect(ai.overview().settings.models.openai).toEqual(['gpt-4.1-mini-2025-04-14', 'gpt-4.1-nano-2025-04-14'])
    await ai.choose('chronicler', 'openai', 'gpt-4.1-nano-2025-04-14')
    // A new start: the lists come from the settings file, no call needed.
    const again = new AiService({ dir, cipher, content, providerFactory: () => ({ id: 'openai', listModels: async () => [{ id: 'gpt-4.1-mini-2025-04-14' }], complete: async () => reply('{"ok":true}') }) })
    expect((await again.listModels('openai')).map((m) => m.id)).toContain('gpt-4.1-nano-2025-04-14')
    expect(await again.refreshModels()).toEqual(['chronicler'])
    expect(again.overview().settings.missing).toEqual(['chronicler'])
  })

  it('has a third role, the chronicler, tried on a drowning and a theft', async () => {
    const { ai } = service()
    await ai.connect('openai', TEST_KEY)
    const trial = await ai.trial('openai', 'gpt-4.1-mini-2025-04-14', 'chronicler')
    // A drowning and a theft, and since M10.20 the chronicler's other kinds in play once each (M10.25: the story of a new region too).
    expect(trial).toMatchObject({ role: 'chronicler', runs: 11 })
    expect(trial.valid).toBeGreaterThanOrEqual(2)
    expect(await ai.choose('chronicler', 'openai', 'gpt-4.1-mini-2025-04-14')).toBe('gpt-4.1-mini-2025-04-14')
    expect(ai.settings.role('chronicler')).toEqual({ provider: 'openai', model: 'gpt-4.1-mini-2025-04-14' })
  })
})

describe('pictures (after the M7 playtest)', () => {
  const picturing = () => {
    const dir = temp()
    let calls = 0
    const ai = new AiService({
      dir,
      cipher: testCipher(),
      content,
      providerFactory: (id) => ({
        id,
        listModels: async () => [{ id: 'gpt-4.1-mini-2025-04-14' }],
        complete: async () => reply('{}'),
        listImageModels: async () => [{ id: 'gpt-image-1-mini' }],
        picture: async (model) => {
          calls++
          return { base64: Buffer.from('fake jpeg').toString('base64'), mime: 'image/jpeg', model, latencyMs: 5 }
        },
      }),
    })
    return { ai, dir, calls: () => calls }
  }

  it('makes nothing while pictures are off, and a plain figure for someone generic costs nothing', async () => {
    const { ai, calls } = picturing()
    await ai.connect('openai', TEST_KEY)
    expect(await ai.picture(content, 'npc_mirte')).toBeUndefined()
    const generic = { ...content, npcs: new Map(content.npcs) }
    generic.npcs.set('npc_kobus', { ...content.npcs.get('npc_kobus')!, portrait: 'generic' })
    ai.choosePictures({ provider: 'openai', model: 'gpt-image-1-mini', quality: 'low' })
    expect(await ai.picture(generic, 'npc_kobus')).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(calls()).toBe(0)
  })

  it('draws a person once and keeps it; all places of an area share one picture', async () => {
    const { ai, dir, calls } = picturing()
    await ai.connect('openai', TEST_KEY)
    expect((await ai.imageModels('openai')).map((m) => m.id)).toEqual(['gpt-image-1-mini'])
    ai.choosePictures({ provider: 'openai', model: 'gpt-image-1-mini', quality: 'low' })
    const first = await ai.picture(content, 'npc_mirte')
    expect(first).toMatch(/^data:image\/jpeg;base64,/)
    expect(await ai.picture(content, 'npc_mirte')).toBe(first)
    await ai.picture(content, 'loc_veenhoek_quay')
    await ai.picture(content, 'loc_veenhoek_green')
    await ai.picture(content, 'area_veenhoek')
    expect(calls()).toBe(2)
    expect(readdirSync(join(dir, 'pictures', 'nethermarch')).length).toBe(2)
    // Priced per picture, and in the log as the illustrator.
    expect(ai.usage.summary().session.costUsd).toBeCloseTo(0.01, 5)
    expect(ai.recentLog(5).filter((e) => e.role === 'illustrator')).toHaveLength(2)
  })

  it('draws every picture of the worlds at once on request, skips what is there, and never passes the cap (after the M10 playtest)', async () => {
    const { ai, dir, calls } = picturing()
    await ai.connect('openai', TEST_KEY)
    ai.choosePictures({ provider: 'openai', model: 'gpt-image-1-mini', quality: 'low' })
    await ai.picture(content, 'npc_mirte')
    const lines: string[] = []
    // The hourly share does not stop a batch the player asked for; the cap does: $0.05 is ten pictures.
    ai.settings.setBudget(0.01)
    const capped = await ai.drawAll([content], 0.05, (line) => lines.push(line))
    expect(capped.made).toBe(10)
    expect(capped.kept).toBe(1)
    expect(capped.costUsd).toBeCloseTo(0.05, 5)
    expect(capped.stopped).toMatch(/the cap of \$0\.05/)
    expect(lines[0]).toMatch(/to make, 1 made before; gpt-image-1-mini at low quality, \$0\.005 each, at most \$0\.05/)
    expect(readdirSync(join(dir, 'pictures', 'nethermarch')).length).toBe(11)
    // Again with room: only what is missing, and nothing twice.
    const before = calls()
    const rest = await ai.drawAll([content], 5, () => undefined)
    expect(rest.kept).toBe(11)
    expect(calls() - before).toBe(rest.made)
    expect(allText(dir)).not.toContain(TEST_KEY)
    // Pictures off: nothing.
    ai.choosePictures(undefined)
    expect((await ai.drawAll([content], 5, () => undefined)).stopped).toMatch(/pictures are off/)
  })

  it('keeps pictures out of the last fifth of the hourly budget', async () => {
    const { ai, calls } = picturing()
    await ai.connect('openai', TEST_KEY)
    // One picture of $0.011 takes it past 80% of the lowest budget, $0.01 an hour.
    ai.settings.setBudget(0.01)
    ai.choosePictures({ provider: 'openai', model: 'gpt-image-1', quality: 'low' })
    await ai.picture(content, 'npc_mirte')
    await ai.picture(content, 'npc_gerrit')
    expect(calls()).toBe(1)
  })
})
