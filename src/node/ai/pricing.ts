// List prices per million tokens (USD), as of September 2026. Language models
// do not reliably know their own provider's current prices, so the model
// advice gets this table instead of guessing (FO, chapter 16). Update it with
// the game; unknown models show "price unknown".

export const PRICING_AS_OF = '2026-09'

export interface Price {
  input: number
  cachedInput: number
  output: number
  /** Writing to the cache, where the provider prices it apart (M9.3): Anthropic, 1.25 times the input for five minutes. */
  cacheWrite?: number
}

const TABLE: Record<string, Price> = {
  // OpenAI (developers.openai.com/api/docs/pricing)
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2.0 },
  'gpt-5.4-nano': { input: 0.2, cachedInput: 0.02, output: 1.25 },
  'gpt-5.4-mini': { input: 0.75, cachedInput: 0.075, output: 4.5 },
  'gpt-4.1-nano': { input: 0.1, cachedInput: 0.025, output: 0.4 },
  'gpt-4.1-mini': { input: 0.4, cachedInput: 0.1, output: 1.6 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.6 },
  // Anthropic (Claude API documentation, June 2026)
  'claude-haiku-4-5': { input: 1, cachedInput: 0.1, output: 5, cacheWrite: 1.25 },
  'claude-sonnet-5': { input: 2, cachedInput: 0.2, output: 10, cacheWrite: 2.5 },
  'claude-sonnet-4-6': { input: 3, cachedInput: 0.3, output: 15, cacheWrite: 3.75 },
  'claude-opus-5-5': { input: 4, cachedInput: 0.2, output: 20, cacheWrite: 5 },
  'claude-opus-5': { input: 5, cachedInput: 0.5, output: 25, cacheWrite: 6.25 },
  'claude-opus-4-8': { input: 5, cachedInput: 0.5, output: 25, cacheWrite: 6.25 },
  'claude-fable-5-1': { input: 10, cachedInput: 0.25, output: 50, cacheWrite: 12.5 },
}

/** Finds the price for an exact model id, a dated snapshot of a known model, or undefined. */
export function priceOf(model: string): Price | undefined {
  if (TABLE[model]) return TABLE[model]
  const undated = model.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/-\d{8}$/, '')
  return TABLE[undated]
}

export function priceTable(ids: string[]): Record<string, Price> {
  return Object.fromEntries(ids.flatMap((id) => (priceOf(id) ? [[id, priceOf(id)!]] : [])))
}

export function costUsd(model: string, usage: { inputTokens: number; outputTokens: number; cachedTokens: number; cacheWriteTokens?: number }): number | undefined {
  const price = priceOf(model)
  if (!price) return undefined
  const written = usage.cacheWriteTokens ?? 0
  const uncached = Math.max(0, usage.inputTokens - usage.cachedTokens - written)
  return (uncached * price.input + usage.cachedTokens * price.cachedInput + written * (price.cacheWrite ?? price.input) + usage.outputTokens * price.output) / 1_000_000
}

/**
 * The most a call may cost (M9.3), reserved before it is sent: every input
 * token at the full price (a guess of 3.5 characters a token) and the most it
 * may answer. Undefined for a model without a known price.
 */
export function upperBoundUsd(model: string, request: { system: string; prompt: string; maxTokens: number }): number | undefined {
  const price = priceOf(model)
  if (!price) return undefined
  const input = Math.ceil((request.system.length + request.prompt.length) / 3.5)
  return (input * Math.max(price.input, price.cacheWrite ?? 0) + request.maxTokens * price.output) / 1_000_000
}

// A play hour with a lot of talking (FO, chapter 16): 40 dialogue calls and 25 goal choices;
// the chronicler writes 0 to 2 times an hour (design: lore and world change).
export const CALLS_PER_HOUR = { voice: 40, brain: 25, chronicler: 1 }

// Pictures are priced per picture, not per token: 1024x1024 at low and medium
// quality, as of September 2026 (the image generation guide's calculator, and
// costgoat.com/pricing/openai-images). Unknown tiers show "price unknown".
const PICTURES: Record<string, Partial<Record<'low' | 'medium', number>>> = {
  'gpt-image-1-mini': { low: 0.005 },
  'gpt-image-2': { low: 0.006, medium: 0.053 },
  'gpt-image-1.5': { low: 0.009 },
  'gpt-image-1': { low: 0.011 },
}

export function picturePrice(model: string, quality: 'low' | 'medium'): number | undefined {
  const undated = model.replace(/-\d{4}-\d{2}-\d{2}$/, '')
  return PICTURES[model]?.[quality] ?? PICTURES[undated]?.[quality]
}
