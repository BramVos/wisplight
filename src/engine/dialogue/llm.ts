// The engine's view of a language model. The engine builds requests and
// validates replies; the Node side (src/node/ai) sends them to OpenAI or
// Anthropic. Tests and the browser preview use MockLlm.

export type LlmRole = 'voice' | 'brain' | 'chronicler' | 'advisor'

export interface JsonSchema {
  [key: string]: unknown
}

export interface LlmRequest {
  role: LlmRole
  /** Stable part: rules, world frame, NPC card. Cached by the providers. */
  system: string
  /** Changing part: scene, knowledge, history, the player's words. */
  prompt: string
  schemaName: string
  schema: JsonSchema
  maxTokens: number
  /** Low: waits once 80% of the hourly budget is spent (the chronicler, goal choices without a quest role). */
  priority?: 'normal' | 'low'
  /**
   * How long this call may take at most, in milliseconds (M9.4): what is left of
   * the time a reply may take, over both tries (ten seconds unless the player set
   * otherwise, M10.8). At zero or less the call fails at once, so a replay, which
   * records the failure, goes the same way.
   */
  timeoutMs?: number
  /** Structured context for the mock model; real providers ignore it. */
  meta?: Record<string, unknown>
}

export interface LlmUsage {
  /** All input, cached and written to the cache included. */
  inputTokens: number
  outputTokens: number
  /** Input read from the provider's cache. */
  cachedTokens: number
  /** Input written to the cache on this call (M9.3; Anthropic prices it apart). */
  cacheWriteTokens?: number
}

export interface LlmResponse {
  text: string
  provider: string
  model: string
  usage: LlmUsage
  latencyMs: number
}

/** A reply the engine threw away after validation, so the usage overview can count it. */
export interface LlmRejection {
  /**
   * Why (M10.19 adds three): injection, the player's words read as an instruction and never went to the model;
   * limits, the reply crossed the hard limits (PEGI 18); bounds, an effect outside what the game allows was refused.
   */
  reason: 'schema' | 'anachronism' | 'character' | 'leak' | 'invented' | 'goal' | 'promise' | 'oath' | 'not_here' | 'number' | 'injection' | 'limits' | 'bounds'
  /** Whose reply it was; the voice when not given. */
  role?: LlmRole
  /**
   * Not thrown away (M10.10): the guard put it right in place (an oath, a word
   * that is not here) or only noted it (a number nobody gave); what it was.
   */
  fixed?: string
  /** What exactly, for the AI log (M10.19): which hard limit, which effect. */
  detail?: string
  /** Held back before any call (M10.19): the text that never went to the model, for the AI log. */
  held?: string
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>
  report?(rejection: LlmRejection): void
  /** How long a spoken reply may take, over its tries, in milliseconds (M10.8): the player's setting at the model. */
  replyWithinMs?(): number
}

export class LlmError extends Error {
  constructor(
    readonly kind: 'timeout' | 'network' | 'busy' | 'refusal' | 'config' | 'invalid' | 'budget',
    message: string,
  ) {
    super(message)
    this.name = 'LlmError'
  }
}
