import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { LlmRequest } from '../src/engine'
import { MODEL_KINDS } from '../src/engine/modelkinds'
import { journeyRequest } from '../src/engine/map/journeyText'
import { tidesRequest } from '../src/engine/tides'
import { MEASURED_PER_HOUR } from '../src/node/ai/frequency'
import { guidePrice } from '../src/node/ai/guideprice'
import { mostOut, priceOf, upperBoundUsd } from '../src/node/ai/pricing'
import { AiService } from '../src/node/ai/service'
import { content } from './helpers'
import { Engine } from '../src/engine'

// M10.27, the costs down: an effort per table-shaped kind (the model's
// default medium thought and billed it as output), the journey on the
// conversations' model and the great lines on the brain's, the upper bound
// with the thinking an always-thinking model is given, and a guide price at
// the pace calls really come.

const folders: string[] = []
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})


describe('M10.27: the costs down, per kind', () => {
  it('reserves the thinking an always-thinking model is given, and counts the schema as input', () => {
    const request = { system: 's'.repeat(3500), prompt: 'p', maxTokens: 1000 }
    expect(mostOut('claude-opus-5-5', 1000)).toBe(5000)
    expect(mostOut('claude-sonnet-5', 1000)).toBe(1000)
    // The same call asking nothing more: what is left is the 4,000 tokens of thinking at the output price.
    const opus = priceOf('claude-opus-5-5')!
    expect(upperBoundUsd('claude-opus-5-5', { ...request, maxTokens: 0 })! - upperBoundUsd('claude-opus-5-5', { ...request, maxTokens: 0, system: '' })!).toBeGreaterThan(0)
    const inputOnly = (upperBoundUsd('claude-opus-5-5', { ...request, maxTokens: 0 })! * 1_000_000 - 4000 * opus.output) / 1_000_000
    expect(upperBoundUsd('claude-opus-5-5', request)!).toBeCloseTo(inputOnly + (5000 * opus.output) / 1_000_000, 9)
    expect(inputOnly).toBeGreaterThan(0)
    expect(upperBoundUsd('claude-sonnet-5', { ...request, schema: { a: 'x'.repeat(3500) } })!).toBeGreaterThan(upperBoundUsd('claude-sonnet-5', request)!)
  })

  it('gives every table-shaped kind an effort of its own, and sends it when the request sets none', async () => {
    for (const kind of ['tides', 'weave', 'far_place', 'district', 'outline', 'expansion', 'land', 'legends', 'palette_draft', 'voice_draft']) {
      expect(MODEL_KINDS.find((k) => k.kind === kind)?.effort, kind).toBe('low')
    }
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-effort-'))
    folders.push(dir)
    const seen: LlmRequest[] = []
    const ai = new AiService({
      dir,
      cipher: { available: () => true, encrypt: (p) => Buffer.from(p).toString('base64'), decrypt: (s) => Buffer.from(s, 'base64').toString() },
      content,
      providerFactory: (id) => ({ id, listModels: async () => [{ id: 'claude-opus-5-5' }], complete: async (_m, r) => (seen.push(r), { text: '{"ok":true}', provider: 'anthropic', model: 'claude-opus-5-5', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }) }),
    })
    await ai.connect('anthropic', `sk-ant-unittest${randomBytes(8).toString('hex')}`)
    await ai.choose('chronicler', 'anthropic', 'claude-opus-5-5')
    ai.settings.setBudget(20)
    const ask = (schemaName: string, effort?: 'medium') => ai.gateway.complete({ role: 'chronicler', system: 's', prompt: 'p', schemaName, schema: {}, maxTokens: 50, ...(effort ? { effort } : {}) })
    await ask('weave')
    await ask('weave', 'medium')
    // The night round at low as well, since its measurement (M10.27 (2)); a kind with no effort of its own sends none.
    await ask('chronicle')
    await ask('builder_draft')
    expect(seen.slice(-4).map((r) => r.effort)).toEqual(['low', 'medium', 'low', undefined])
  })

  it("sends the journey to the conversations' model, and keeps the great lines with the chronicler", () => {
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    expect(journeyRequest(engine.world, 'You walk.', 'frame').tier).toBe('voice')
    // Measured on Bram's key: the brain's model broke two great lines in one month where the chronicler's let one threaten first.
    expect(MODEL_KINDS.find((k) => k.kind === 'tides')?.tier).toBeUndefined()
    expect(tidesRequest(engine.world).tier).toBeUndefined()
  })

  it('prices an hour as the guide counts it and as it was measured, each kind on the model it goes to', () => {
    const roles = { voice: 'claude-haiku-4-5-20251001', brain: 'claude-sonnet-5', chronicler: 'claude-opus-5-5' } as const
    const guide = guidePrice((role) => (role in roles ? { provider: 'anthropic', model: roles[role as keyof typeof roles] } : undefined))
    expect(guide.hour).toBeGreaterThan(0)
    expect(guide.measuredHour).toBeGreaterThan(0)
    expect(MEASURED_PER_HOUR['npc_goals']).toBeGreaterThan(25)
    // The journey goes by the conversations' model: a dearer voice model makes the measured hour dearer by its share.
    const dearVoice = guidePrice((role) => (role === 'voice' ? { provider: 'anthropic', model: 'claude-opus-5-5' } : role in roles ? { provider: 'anthropic', model: roles[role as keyof typeof roles] } : undefined))
    expect(dearVoice.measuredHour!).toBeGreaterThan(guide.measuredHour!)
  })
})
