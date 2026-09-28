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
              response_format: { type: 'json_schema', json_schema: { name: request.schemaName, schema: request.schema, strict: true } },
              max_completion_tokens: reasoning ? Math.max(request.maxTokens * 4, 2000) : request.maxTokens,
              ...(reasoning ? { reasoning_effort: 'low' as const } : {}),
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

export function anthropicProvider(apiKey: string): Provider {
  const client = new Anthropic({ apiKey, maxRetries: 1 })
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
      try {
        // Streamed (M10.20): the SDK refuses a long answer in one piece, and a world step may write a whole chapter of YAML.
        const { data: stream, response: raw } = await client.messages
          .stream(
            {
              model,
              max_tokens: request.maxTokens + (alwaysThinks ? 4000 : 0),
              system: [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
              messages: [{ role: 'user', content: request.prompt }],
              output_config: { format: { type: 'json_schema', schema: request.schema } },
              ...(thinkingByDefault ? { thinking: { type: 'disabled' as const } } : {}),
            },
            { signal },
          )
          .withResponse()
        const response = await stream.finalMessage()
        const cacheWrite = response.usage.cache_creation_input_tokens ?? 0
        const cacheRead = response.usage.cache_read_input_tokens ?? 0
        const usage = { inputTokens: response.usage.input_tokens + cacheWrite + cacheRead, outputTokens: response.usage.output_tokens, cachedTokens: cacheRead, cacheWriteTokens: cacheWrite }
        if (response.stop_reason === 'refusal') throw new LlmError('refusal', 'the model declined')
        if (response.stop_reason === 'max_tokens') throw new LlmError('invalid', 'reply was cut off', usage)
        const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
        return {
          text,
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
