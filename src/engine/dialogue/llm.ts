// The engine's view of a language model. The engine builds requests and
// validates replies; the Node side (src/node/ai) sends them to OpenAI or
// Anthropic. Tests and the browser preview use MockLlm.

export type LlmRole = 'voice' | 'brain' | 'advisor'

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
  /** Structured context for the mock model; real providers ignore it. */
  meta?: Record<string, unknown>
}

export interface LlmUsage {
  inputTokens: number
  outputTokens: number
  cachedTokens: number
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
  reason: 'schema' | 'anachronism' | 'leak' | 'invented'
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>
  report?(rejection: LlmRejection): void
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
