import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { measuredModule } from '../scripts/coveragescan'
import { guidePrice } from '../src/node/ai/guideprice'
import { MEASURED } from '../src/node/ai/measured'

// M10.21: a guide price per hour of play in the settings, measured with the
// recorded real replies (npm run trial) at the pace of a talkative hour, with
// the models the player chose; a new place in a far town apart.

const root = resolve(import.meta.dirname, '..')
const models = { voice: 'claude-haiku-4-5-20251001', brain: 'claude-sonnet-5', chronicler: 'claude-opus-5-5' } as Record<string, string>

describe('M10.21: what an hour of play costs about', () => {
  it('prices an hour from the measured tokens and the chosen models', () => {
    const guide = guidePrice((role) => (models[role] ? { provider: 'anthropic', model: models[role]! } : undefined))
    const r = MEASURED['npc_reply']!
    // Haiku 4.5: $1 in and $5 out a million tokens, forty lines an hour.
    expect(guide.conversations).toBeCloseTo(((r.inputTokens * 1 + r.outputTokens * 5) / 1e6) * 40, 6)
    expect(guide.goals).toBeGreaterThan(0)
    expect(guide.night).toBeGreaterThan(0)
    expect(guide.hour).toBeCloseTo(guide.conversations! + guide.goals! + guide.night!, 9)
    expect(guide.place).toBeGreaterThan(0)
    // Bram's models on the recorded trials of 29 September 2026: under a dollar an hour.
    expect(guide.hour).toBeLessThan(1)
  })

  it('says nothing it cannot price: a model without a known price, or no model chosen', () => {
    expect(guidePrice(() => ({ provider: 'openai', model: 'gpt-unknown' }))).toEqual({})
    expect(guidePrice(() => undefined)).toEqual({})
  })

  it('ships the measurements npm run coverage writes from the recordings', () => {
    expect(readFileSync(resolve(root, 'src/node/ai/measured.ts'), 'utf8')).toBe(measuredModule(root))
  })
})
