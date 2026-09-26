import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './llm'

// A stand-in model for tests and the browser preview. It answers from the
// knowledge packet in request.meta and can misbehave on purpose, so tests can
// prove that the guardrails catch it.

export type MockMode = 'good' | 'leak' | 'long' | 'invalid' | 'throw' | 'anachronism' | 'topics' | 'invent' | 'far' | 'twofar'

export interface MockMeta {
  npcName: string
  act: string
  wordLimit: number
  known: { topic: string; facts: string[]; story?: string; toldBy?: string }[]
  unknown: { topic: string; name: string }[]
  referral?: { npc: string; name: string; call: string }
  check?: string
  secret?: string
}

export class MockLlm implements LlmClient {
  calls: LlmRequest[] = []

  constructor(
    public mode: MockMode = 'good',
    private readonly leakName = 'the Weeping Stone',
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request)
    if (this.mode === 'throw') throw new LlmError('timeout', 'mock timeout')
    const text = request.role === 'voice' ? this.voice(request.meta as unknown as MockMeta) : this.other(request)
    return { text, provider: 'mock', model: 'mock-1', usage: { inputTokens: Math.round((request.system.length + request.prompt.length) / 4), outputTokens: Math.round(text.length / 4), cachedTokens: 0 }, latencyMs: 1 }
  }

  private voice(meta: MockMeta): string {
    if (this.mode === 'invalid') return 'Mirte says hello, but not in JSON.'
    const name = meta.npcName.split(' ')[0]
    let speech: string
    const known = meta.known[0]
    if (meta.secret) speech = meta.secret
    else if (meta.check && /failure/.test(meta.check)) speech = "I don't think so."
    else if (meta.act === 'AskStory' && known?.story && !known.toldBy) speech = known.story
    else if (known) speech = known.facts.slice(0, 2).join(' ')
    else if (meta.unknown.length) speech = `Can't say I know.${meta.referral ? ` Ask ${meta.referral.call}.` : ''}`
    else if (meta.act === 'Greet') speech = 'Evening to you.'
    else speech = 'Mm. That so?'

    if (this.mode === 'leak') speech = `My cousin swears ${this.leakName} wept for it. ${speech}`
    if (this.mode === 'long') speech = Array.from({ length: 12 }, () => speech).join(' ')
    if (this.mode === 'anachronism') speech = `Okay, ${speech}`
    if (this.mode === 'invent') speech = `${speech} Father Oswin would know more.`
    if (this.mode === 'far') speech = `Salt comes dear from the Amber Coast these days. ${speech}`
    if (this.mode === 'twofar') speech = `Salt comes from the Amber Coast and tin from Kessmoor. ${speech}`
    const words = speech.split(/\s+/)
    if (this.mode === 'good' && words.length > meta.wordLimit) speech = words.slice(0, meta.wordLimit).join(' ').replace(/[,;:]?$/, '.')

    const topics = this.mode === 'topics' ? ['not_a_topic', ...(known ? [known.topic] : [])] : [...(known ? [known.topic] : []), ...(meta.referral && !known ? [meta.referral.npc] : [])]
    return JSON.stringify({
      act: meta.act,
      reply: `${name} looks up. "${speech}"`,
      names: this.mode === 'far' ? [{ text: 'Amber Coast', new_kind: 'land' }] : this.mode === 'twofar' ? [{ text: 'Amber Coast', new_kind: 'land' }, { text: 'Kessmoor', new_kind: 'city' }] : [],
      mentioned_topics: topics,
      effects: this.mode === 'good' && known ? [{ type: 'affinity', delta: 1, reason: 'a friendly question' }] : [],
      memory_note: known ? `The stranger asked me about ${known.topic}.` : 'The stranger talked to me.',
      ends_conversation: false,
    })
  }

  private other(request: LlmRequest): string {
    const properties = (request.schema['properties'] ?? {}) as Record<string, unknown>
    if ('goals' in properties) return JSON.stringify({ goals: [], mood: 'calm', note: 'Nothing new today.' })
    return '{}'
  }
}
