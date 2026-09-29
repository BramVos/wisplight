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
  /**
   * A lighter model will do (M10.20: the polish round of place descriptions):
   * the model the player chose for the brain, where there is one, in place of
   * the role's own. The player's choice, not a model named in the code. voice
   * (M10.27): the model of the conversations, for a reword the engine checks
   * word for word (the journey).
   */
  tier?: 'light' | 'voice'
  /**
   * Where the part of `system` that stays the same from call to call ends
   * (M10.20: the world steps, whose guide, contract and working instruction
   * stay the same for twelve steps while the step and the design log change).
   * The providers cache up to here; without it, the whole system part. Every
   * kind of call sets it (M10.26), after the part it keeps the same, or at 0
   * where a mark would only pay a write (M10.27).
   */
  cacheBreak?: number
  /**
   * Where the part every call of the kind shares ends, before cacheBreak
   * (M10.26): the frame and the rules, before what belongs to one speaker or
   * one person. A second mark goes there, so someone new reads the shared
   * part from the cache, and the next turn with the same one reads it all.
   */
  cacheShared?: number
  /** Keep that part an hour rather than five minutes (M10.20: a designer reads a proposal for minutes between two steps). */
  cacheHour?: boolean
  /**
   * The talk so far (M10.28): what the game told the voice each turn and what
   * it answered, as messages before `prompt`, so every earlier line is read
   * from the cache and a new line pays only for what is new.
   */
  turns?: { role: 'user' | 'assistant'; text: string }[]
  /** Mark the end of `prompt` as well (M10.28): the next turn of the talk reads everything up to here. */
  cacheTail?: boolean
  /** How hard the model thinks, where the model lets itself be told (M10.20): low for a table, medium for a story. Without it, the provider's default. */
  effort?: 'low' | 'medium' | 'high'
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
  /** Of those, the tokens kept for an hour (M10.20), at twice the input price. */
  cacheWriteHourTokens?: number
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
  /** What a call would cost about, in dollars, on the model it would go to (M10.21); undefined where the price is not known. */
  costOf?(request: LlmRequest): number | undefined
  /** From what cost of one call the game asks first (M10.21): the player's setting, Infinity after "always". */
  askAboveUsd?(): number
  /** The player chose "always": no more questions about cost. */
  askNever?(): void
  /** How the world goes on (M10.24): the player's play mode. */
  playMode?(): import('../modes').PlayMode
  report?(rejection: LlmRejection): void
  /** How long a spoken reply may take, over its tries, in milliseconds (M10.8): the player's setting at the model. */
  replyWithinMs?(): number
}

export class LlmError extends Error {
  constructor(
    readonly kind: 'timeout' | 'network' | 'busy' | 'refusal' | 'config' | 'invalid' | 'budget',
    message: string,
    /** What a failed call still used (M10.20): a reply cut off at its limit is paid for all the same. */
    readonly usage?: LlmUsage,
  ) {
    super(message)
    this.name = 'LlmError'
  }
}

/** About how many tokens a text is (M10.26: for the cache's minimum and the measure), four characters a token as the mock counts. */
export function tokensAbout(text: string): number {
  return Math.ceil(text.length / 4)
}

/** Everything a request sends as text (M10.28): the system part, the talk so far and the prompt. */
export function sentText(request: Pick<LlmRequest, 'system' | 'prompt' | 'turns'>): string {
  return [request.system, ...(request.turns ?? []).map((t) => t.text), request.prompt].join('\n')
}

/**
 * What a kind of call marks for the cache (M10.27): a mark costs a write at
 * 1.25 times the input it covers, and pays only when a second call reads it
 * within five minutes. `both`: the shared part and one subject's part (a talk:
 * several turns with one person, and someone new reads the shared part);
 * `shared`: only what every call shares (a goal choice: many people, rarely
 * the same one twice in five minutes); `none`: nothing (a call made once per
 * place or night, whose system nobody reads again in time).
 */
export type CacheMark = 'both' | 'shared' | 'none'

/**
 * A system part built from what stays the same (M10.26; CLAUDE.md: the
 * stable part first, with a cache mark): what every call of the kind shares,
 * then what belongs to one speaker or subject, then what changes from call
 * to call; with the marks where the first two end, as the kind chooses
 * (M10.27: no mark where nothing reads it back).
 */
export function cachedSystem(shared: string, own = '', changing = '', mark: CacheMark = 'both'): Pick<LlmRequest, 'system' | 'cacheBreak' | 'cacheShared'> {
  const mine = own ? `\n${own}` : ''
  const rest = changing ? `\n${changing}` : ''
  const system = `${shared}${mine}${rest}`
  if (mark === 'none') return { system, cacheBreak: 0 }
  if (mark === 'shared') return { system, cacheBreak: shared.length }
  return { system, cacheBreak: shared.length + mine.length, ...(mine ? { cacheShared: shared.length } : {}) }
}
