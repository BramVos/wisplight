import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { LlmError, type LlmRequest, type LlmResponse } from '../../engine/dialogue/llm'

// The two providers of version 1 (FO, chapter 16). Both return raw JSON text;
// the engine validates it.

export type ProviderId = 'openai' | 'anthropic'

export interface ModelInfo {
  id: string
  name?: string
  created?: string
}

/** What the rate-limit headers say about the current window. It is about pace, not money. */
export interface RateLimit {
  requestsRemaining?: number
  tokensRemaining?: number
  /** When the tightest window resets, in ms since the epoch. */
  resetAt?: number
}

export interface ProviderResponse extends LlmResponse {
  rateLimit?: RateLimit
}

/** A picture as the image model sends it: a JPEG, base64. */
export interface PictureResponse {
  base64: string
  mime: string
  model: string
  latencyMs: number
}

export interface Provider {
  id: ProviderId
  listModels(): Promise<ModelInfo[]>
  complete(model: string, request: LlmRequest, signal?: AbortSignal): Promise<ProviderResponse>
  /** Image models, for pictures of places and people (OpenAI only; Claude makes no pictures). */
  listImageModels?(): Promise<ModelInfo[]>
  picture?(model: string, prompt: string, quality: 'low' | 'medium', signal?: AbortSignal): Promise<PictureResponse>
}

const OPENAI_IMAGE = /^(gpt-image|chatgpt-image)/

// Chat models only: the OpenAI list also holds audio, image and embedding models.
const OPENAI_CHAT = /^(gpt-|o\d|chatgpt-)/
const OPENAI_SKIP = /(audio|realtime|transcribe|tts|image|search|embedding|instruct|codex|moderation|dall-e|whisper|computer-use|deep-research|oss)/

export function openAiProvider(apiKey: string): Provider {
  const client = new OpenAI({ apiKey, maxRetries: 1 })
  return {
    id: 'openai',
    async listModels() {
      const models: ModelInfo[] = []
      for await (const model of client.models.list()) {
        if (OPENAI_CHAT.test(model.id) && !OPENAI_SKIP.test(model.id)) {
          models.push({ id: model.id, created: new Date(model.created * 1000).toISOString().slice(0, 10) })
        }
      }
      return models.sort((a, b) => a.id.localeCompare(b.id))
    },
    async listImageModels() {
      const models: ModelInfo[] = []
      for await (const model of client.models.list()) {
        if (OPENAI_IMAGE.test(model.id)) models.push({ id: model.id, created: new Date(model.created * 1000).toISOString().slice(0, 10) })
      }
      return models.sort((a, b) => a.id.localeCompare(b.id))
    },
    async picture(model, prompt, quality, signal) {
      const started = Date.now()
      try {
        const response = await client.images.generate({ model, prompt, n: 1, size: '1024x1024', quality, output_format: 'jpeg', output_compression: 70 }, { signal })
        const base64 = response.data?.[0]?.b64_json
        if (!base64) throw new LlmError('invalid', 'no picture in the reply')
        return { base64, mime: 'image/jpeg', model, latencyMs: Date.now() - started }
      } catch (error) {
        throw mapError(error)
      }
    },
    async complete(model, request, signal) {
      const started = Date.now()
      const reasoning = /^(gpt-5|o\d)/.test(model)
      try {
        const { data: response, response: raw } = await client.chat.completions
          .create(
            {
              model,
              messages: [
                { role: 'system', content: request.system },
                { role: 'user', content: request.prompt },
              ],
              // Strict only where OpenAI allows it (M10.20): every field required and every object closed; otherwise the schema guides and the game's readers check.
              response_format: { type: 'json_schema', json_schema: { name: request.schemaName, schema: request.schema, strict: openAiStrict(request.schema) } },
              max_completion_tokens: reasoning ? Math.max(request.maxTokens * 4, 2000) : request.maxTokens,
              ...(reasoning ? { reasoning_effort: request.effort ?? ('low' as const) } : {}),
            },
            { signal },
          )
          .withResponse()
        const choice = response.choices[0]
        const usage = {
          inputTokens: response.usage?.prompt_tokens ?? 0,
          outputTokens: response.usage?.completion_tokens ?? 0,
          cachedTokens: response.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        }
        if (choice?.message.refusal) throw new LlmError('refusal', choice.message.refusal)
        if (choice?.finish_reason === 'length') throw new LlmError('invalid', 'reply was cut off', usage)
        return {
          text: choice?.message.content ?? '',
          provider: 'openai',
          model: response.model,
          usage,
          latencyMs: Date.now() - started,
          rateLimit: rateLimitOf(raw.headers, 'x-ratelimit-remaining-requests', 'x-ratelimit-remaining-tokens', ['x-ratelimit-reset-requests', 'x-ratelimit-reset-tokens']),
        }
      } catch (error) {
        throw mapError(error)
      }
    },
  }
}

export function anthropicProvider(apiKey: string, given?: Pick<Anthropic, 'messages' | 'models'>): Provider {
  const client = given ?? new Anthropic({ apiKey, maxRetries: 1 })
  // The kinds whose schema Anthropic would not compile (M10.20): asked without the grammar from then on.
  const loose = new Set<string>()
  return {
    id: 'anthropic',
    async listModels() {
      const models: ModelInfo[] = []
      for await (const model of client.models.list({ limit: 100 })) {
        models.push({ id: model.id, name: model.display_name, created: model.created_at.slice(0, 10) })
      }
      return models.sort((a, b) => a.id.localeCompare(b.id))
    },
    async complete(model, request, signal) {
      const started = Date.now()
      // Thinking eats into max_tokens. Turn it off where the model allows it; where it is
      // always on, leave room for it (Claude API documentation, thinking and effort).
      const alwaysThinks = /fable|mythos|opus-5-5/.test(model)
      const thinkingByDefault = /opus-5|sonnet-5/.test(model) && !alwaysThinks
      const effort = request.effort && takesEffort(model) ? { effort: request.effort } : {}
      // Streamed (M10.20): the SDK refuses a long answer in one piece, and a world step may write a whole chapter of YAML.
      const ask = async (schema: unknown) => {
        const { data: stream, response: raw } = await client.messages
          .stream(
            {
              model,
              max_tokens: request.maxTokens + (alwaysThinks ? 4000 : 0),
              system: systemBlocks(request, schema === undefined ? looseLine(request.schema) : undefined),
              messages: [{ role: 'user', content: request.prompt }],
              output_config: { ...(schema !== undefined ? { format: { type: 'json_schema' as const, schema: schema as Record<string, unknown> } } : {}), ...effort },
              ...(thinkingByDefault ? { thinking: { type: 'disabled' as const } } : {}),
            },
            { signal },
          )
          .withResponse()
        return { response: await stream.finalMessage(), raw }
      }
      try {
        // Structured output where the schema allows it (M10.20: the real trial of every kind found Anthropic refusing
        // a map, maxItems, and the chronicle's schema as too large); otherwise the schema as words, and the game's
        // readers check the reply as they always do.
        const strict = loose.has(request.schemaName) ? undefined : anthropicSchema(request.schema)
        let asked: Awaited<ReturnType<typeof ask>>
        try {
          asked = await ask(strict)
        } catch (error) {
          if (strict === undefined || !schemaRefused(error)) throw error
          loose.add(request.schemaName)
          asked = await ask(undefined)
        }
        const { response, raw } = asked
        const cacheWrite = response.usage.cache_creation_input_tokens ?? 0
        const cacheRead = response.usage.cache_read_input_tokens ?? 0
        const hour = response.usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
        const usage = { inputTokens: response.usage.input_tokens + cacheWrite + cacheRead, outputTokens: response.usage.output_tokens, cachedTokens: cacheRead, cacheWriteTokens: cacheWrite, ...(hour ? { cacheWriteHourTokens: hour } : {}) }
        if (response.stop_reason === 'refusal') throw new LlmError('refusal', 'the model declined')
        if (response.stop_reason === 'max_tokens') throw new LlmError('invalid', 'reply was cut off', usage)
        const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
        return {
          text: strict === undefined || loose.has(request.schemaName) ? jsonOf(text) : text,
          provider: 'anthropic',
          model: response.model,
          usage,
          latencyMs: Date.now() - started,
          rateLimit: rateLimitOf(raw.headers, 'anthropic-ratelimit-requests-remaining', 'anthropic-ratelimit-tokens-remaining', ['anthropic-ratelimit-requests-reset', 'anthropic-ratelimit-tokens-reset']),
        }
      } catch (error) {
        throw mapError(error)
      }
    },
  }
}

/** Whether OpenAI's strict structured outputs take a schema: every object closed, with all its fields required. */
export function openAiStrict(schema: unknown): boolean {
  const ok = (node: unknown): boolean => {
    if (Array.isArray(node)) return node.every(ok)
    if (!node || typeof node !== 'object') return true
    const n = node as Record<string, unknown>
    if (n['type'] === 'object') {
      const fields = Object.keys((n['properties'] as Record<string, unknown> | undefined) ?? {})
      const required = new Set((n['required'] as string[] | undefined) ?? [])
      if (n['additionalProperties'] !== false || !fields.length || fields.some((f) => !required.has(f))) return false
    }
    return Object.entries(n).every(([key, value]) => (key === 'properties' ? Object.values(value as Record<string, unknown>).every(ok) : key === 'enum' || key === 'required' || key === 'const' ? true : ok(value)))
  }
  return ok(schema)
}

// What Anthropic's structured outputs leave out of JSON Schema (Claude API documentation, JSON schema
// limitations): numbers, lengths and array sizes as constraints. The game's readers check them.
const UNSUPPORTED = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'pattern', 'minProperties', 'maxProperties'])

/**
 * A JSON schema as Anthropic's structured outputs take it (M10.20): the
 * constraints it does not know dropped, every object closed; undefined where
 * it cannot be said at all, a map of names (additionalProperties with a
 * schema) or an object without fields.
 */
export function anthropicSchema(schema: unknown): unknown | undefined {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk)
    if (!node || typeof node !== 'object') return node
    const n = node as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(n)) {
      if (UNSUPPORTED.has(key)) continue
      if (key === 'properties' || key === '$defs' || key === 'definitions') out[key] = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, walk(v)]))
      else if (key === 'additionalProperties' || key === 'enum' || key === 'const' || key === 'required') out[key] = value
      else out[key] = walk(value)
    }
    const isObject = n['type'] === 'object' || (Array.isArray(n['type']) && n['type'].includes('object'))
    if (isObject) {
      if (n['additionalProperties'] !== undefined && n['additionalProperties'] !== false) throw new Error('a map')
      if (!n['properties']) throw new Error('an object without fields')
      out['additionalProperties'] = false
    }
    return out
  }
  try {
    return walk(schema)
  } catch {
    return undefined
  }
}

/** Whether a 400 is about the schema of the reply, so that asking without it may work. */
function schemaRefused(error: unknown): boolean {
  const e = error as { status?: number; message?: string }
  return e?.status === 400 && /grammar|output_config\.format|json_schema|schema/i.test(e.message ?? '')
}

/** The line that asks for JSON when the schema cannot go as a grammar. */
function looseLine(schema: unknown): string {
  return `ANSWER FORMAT: one JSON object and nothing else (no code fence, no words around it), in this shape (JSON schema): ${JSON.stringify(schema)}`
}

/** The JSON object in a reply that was asked for without a grammar: a fence or words around it taken off. */
export function jsonOf(text: string): string {
  const bare = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  if (bare.startsWith('{')) return bare
  const from = bare.indexOf('{')
  const to = bare.lastIndexOf('}')
  return from >= 0 && to > from ? bare.slice(from, to + 1) : bare
}

/**
 * The system part as Anthropic takes it (M10.20): what stays the same from
 * call to call with the cache mark, what changes after it, so a world step
 * reads the guide and the contract from the cache instead of writing them
 * again with its own step and log.
 */
export function systemBlocks(request: Pick<LlmRequest, 'system' | 'cacheBreak' | 'cacheShared' | 'cacheHour'>, tail?: string): { type: 'text'; text: string; cache_control?: { type: 'ephemeral'; ttl?: '1h' } }[] {
  const at = (n: number) => Math.max(0, Math.min(n, request.system.length))
  const cut = at(request.cacheBreak ?? request.system.length)
  // What every call of the kind shares, marked on its own (M10.26): someone new reads it from the cache.
  const shared = request.cacheShared !== undefined ? Math.min(at(request.cacheShared), cut) : 0
  const rest = `${request.system.slice(cut)}${tail ? `\n\n${tail}` : ''}`
  const mark = { type: 'ephemeral' as const, ...(request.cacheHour ? { ttl: '1h' as const } : {}) }
  return [
    ...[request.system.slice(0, shared), request.system.slice(shared, cut)].filter((part) => part.trim()).map((text) => ({ type: 'text' as const, text, cache_control: mark })),
    ...(rest.trim() ? [{ type: 'text' as const, text: rest }] : []),
  ]
}

/** Models that take an effort (Claude API documentation, effort): Opus from 4.5, Sonnet from 4.6, and what came after. */
export function takesEffort(model: string): boolean {
  return /opus-4-[5-9]|opus-5|sonnet-4-6|sonnet-5|fable|mythos/.test(model)
}

export function createProvider(id: ProviderId, apiKey: string): Provider {
  return id === 'openai' ? openAiProvider(apiKey) : anthropicProvider(apiKey)
}

/** Reads the remaining requests and tokens, and the latest reset time, from response headers. */
export function rateLimitOf(headers: Headers, requests: string, tokens: string, resets: string[]): RateLimit | undefined {
  const number = (name: string) => {
    const value = headers.get(name)
    return value === null || value === '' || Number.isNaN(Number(value)) ? undefined : Number(value)
  }
  const times = resets.flatMap((name) => {
    const at = resetTime(headers.get(name))
    return at === undefined ? [] : [at]
  })
  const limit: RateLimit = { requestsRemaining: number(requests), tokensRemaining: number(tokens), resetAt: times.length ? Math.max(...times) : undefined }
  return limit.requestsRemaining === undefined && limit.tokensRemaining === undefined ? undefined : limit
}

// Anthropic sends an RFC 3339 time, OpenAI a duration such as "1s", "6m0s" or "120ms".
function resetTime(value: string | null, now = Date.now()): number | undefined {
  if (!value) return undefined
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const at = Date.parse(value)
    return Number.isNaN(at) ? undefined : at
  }
  const parts = [...value.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)]
  if (!parts.length) return undefined
  const ms = parts.reduce((sum, [, amount, unit]) => sum + Number(amount) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[unit as 'ms' | 's' | 'm' | 'h'], 0)
  return now + ms
}

/** An LlmError for a 429, with how long to wait. */
export class BusyError extends LlmError {
  constructor(
    readonly retryAfterMs: number,
    detail = '',
  ) {
    super('busy', `rate limited, waiting for the provider${detail ? ` (${detail})` : ''}`)
  }
}

const NO_CREDIT = 'the account has no credit left. Add credit on the billing page of the provider.'

export function mapError(error: unknown): LlmError {
  if (error instanceof LlmError) return error
  const e = error as { name?: string; status?: number; message?: string; headers?: Headers; code?: string | null; error?: { code?: string; type?: string } }
  // OpenAI answers 429 both for "too fast" and for "no credit"; Anthropic answers 400 for no credit.
  if (e?.code === 'insufficient_quota' || e?.error?.code === 'insufficient_quota' || /insufficient_quota|exceeded your current quota|no credits remaining|credit balance is too low/i.test(e?.message ?? '')) {
    return new LlmError('config', NO_CREDIT)
  }
  if (e?.name === 'AbortError' || /abort/i.test(e?.message ?? '')) return new LlmError('timeout', 'the model took too long')
  if (e?.status === 401 || e?.status === 403) return new LlmError('config', 'the API key was refused')
  if (e?.status === 404) return new LlmError('config', 'that model does not exist for this key')
  if (e?.status === 400) return new LlmError('invalid', `the request was refused: ${(e.message ?? '').slice(0, 200)}`)
  if (e?.status === 429) {
    const seconds = Number(e.headers?.get?.('retry-after'))
    return new BusyError(Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 120) * 1000 : 20_000, (e.message ?? '').slice(0, 300))
  }
  return new LlmError('network', (e?.message ?? 'network error').slice(0, 200))
}
