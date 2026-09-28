import { describe, expect, it } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import type { LlmRequest } from '../src/engine'
import { anthropicProvider, anthropicSchema, jsonOf, openAiStrict } from '../src/node/ai/providers'

// M10.20: the real trial of every kind of call found what no mock could:
// Anthropic refused the palette's schema (a map of names), a goal choice
// (maxItems) and the nightly round (its grammar too large), and OpenAI's
// strict mode refuses a schema with a field that may be left out. The schema
// goes as each provider takes it; where it cannot, the call goes without the
// grammar, with the schema in words, and the game's readers check the reply.

const map = { type: 'object', additionalProperties: false, required: ['names'], properties: { names: { type: 'object', additionalProperties: { type: 'string' } } } }
const bounded = { type: 'object', additionalProperties: false, required: ['goals'], properties: { goals: { type: 'array', maxItems: 3, items: { type: 'object', required: ['n'], properties: { n: { type: 'integer', minimum: 0, maximum: 9 } } } } } }

describe('M10.20: every reply schema as the provider takes it', () => {
  it('drops what Anthropic cannot compile, closes every object, and gives up on a map', () => {
    expect(anthropicSchema(bounded)).toEqual({ type: 'object', additionalProperties: false, required: ['goals'], properties: { goals: { type: 'array', items: { type: 'object', required: ['n'], properties: { n: { type: 'integer' } }, additionalProperties: false } } } })
    expect(anthropicSchema(map)).toBeUndefined()
    expect(anthropicSchema({ type: 'object' })).toBeUndefined()
  })

  it('asks OpenAI strictly only when every field is required and every object closed', () => {
    expect(openAiStrict({ type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: 'string' } } })).toBe(true)
    expect(openAiStrict({ type: 'object', additionalProperties: false, required: [], properties: { a: { type: 'string' } } })).toBe(false)
    expect(openAiStrict(map)).toBe(false)
  })

  it('takes the JSON out of a reply that came without the grammar', () => {
    expect(jsonOf('```json\n{"a":1}\n```')).toBe('{"a":1}')
    expect(jsonOf('Here it is: {"a":{"b":2}} Hope it helps.')).toBe('{"a":{"b":2}}')
  })

  it('asks again without the grammar when Anthropic refuses the schema, and keeps doing so for that kind', async () => {
    const sent: { format: boolean; system: string }[] = []
    const message = (text: string) => ({ model: 'claude-opus-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } })
    const client = {
      models: { list: () => [] },
      messages: {
        stream: (params: { output_config: { format?: unknown }; system: { text: string }[] }) => ({
          withResponse: async () => {
            sent.push({ format: Boolean(params.output_config.format), system: params.system.map((b) => b.text).join('') })
            if (params.output_config.format) throw Object.assign(new Error('400 The compiled grammar is too large, which would cause performance issues.'), { status: 400 })
            return { data: { finalMessage: async () => message('```json\n{"lore":[]}\n```') }, response: { headers: new Headers() } }
          },
        }),
      },
    } as unknown as Pick<Anthropic, 'messages' | 'models'>
    const provider = anthropicProvider('test', client)
    const request: LlmRequest = { role: 'chronicler', system: 'Night.', prompt: 'x', schemaName: 'chronicle', schema: { type: 'object', additionalProperties: false, required: ['lore'], properties: { lore: { type: 'array', items: { type: 'string' } } } }, maxTokens: 100 }
    const first = await provider.complete('claude-opus-5-5', request)
    expect(first.text).toBe('{"lore":[]}')
    expect(sent.map((s) => s.format)).toEqual([true, false])
    expect(sent[1]!.system).toContain('ANSWER FORMAT: one JSON object and nothing else')
    // The next night goes without the grammar at once; a map never tries it.
    await provider.complete('claude-opus-5-5', request)
    await provider.complete('claude-opus-5-5', { ...request, schemaName: 'palette_draft', schema: map })
    expect(sent.map((s) => s.format)).toEqual([true, false, false, false])
  })
})
