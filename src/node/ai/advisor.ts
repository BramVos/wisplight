import type { Content } from '../../engine/content'
import { TIER_WORDS } from '../../engine/dialogue/acts'
import { wordCount } from '../../engine/dialogue/guard'
import type { LlmRequest } from '../../engine/dialogue/llm'
import { MockLlm } from '../../engine/dialogue/mock'
import { GoalReplySchema, parseReply } from '../../engine/dialogue/schema'
import { brainRequests, chroniclerRequests, trialRequests } from '../../engine/dialogue/testset'
import type { Gateway } from './gateway'
import { CALLS_PER_HOUR, costUsd, priceOf, priceTable, PRICING_AS_OF } from './pricing'
import type { ModelInfo, ProviderId } from './providers'
import { CHOSEN_ROLES, type ChosenRole } from './settings'

// Model advice after connecting a provider (FO, chapter 16): a capable model
// of that provider recommends a model per role, chosen only from the ids the
// key can use; the game then tries the advice on the fixed test set.

export interface AdviceChoice {
  model: string
  reason: string
}

export interface RoleAdvice {
  recommended: AdviceChoice
  cheaper: AdviceChoice
}

export interface Advice {
  provider: ProviderId
  advisorModel: string
  voice: RoleAdvice
  brain: RoleAdvice
  chronicler: RoleAdvice
  unknownPrices: string[]
}

export interface TrialResult {
  provider: ProviderId
  model: string
  role: ChosenRole
  runs: number
  valid: number
  averageLatencyMs: number
  inputTokens: number
  outputTokens: number
  costUsd?: number
  /** Measured cost per call times the calls in an hour of play. */
  costPerHourUsd?: number
  errors: string[]
}

// Strong, quick models that are good at this kind of judgement. The first one
// the key can use gives the advice; a single call costs a cent or two.
const ADVISORS: Record<ProviderId, string[]> = {
  anthropic: ['claude-sonnet-5', 'claude-opus-5', 'claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5'],
  openai: ['gpt-5.4', 'gpt-5.2', 'gpt-5.1', 'gpt-5', 'gpt-4.1', 'gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o'],
}

const DATED = /-(\d{4}-\d{2}-\d{2}|\d{8})$/

/** The advisor: the first preferred family the key can use, else the first model in the list. */
export function pickAdvisor(provider: ProviderId, models: ModelInfo[]): string | undefined {
  const ids = models.map((m) => m.id)
  for (const family of ADVISORS[provider]) {
    const match = ids.find((id) => id === family) ?? ids.find((id) => id.startsWith(`${family}-`) && DATED.test(id) && id.replace(DATED, '') === family)
    if (match) return match
  }
  return ids[0]
}

/** Prefers a dated snapshot of the same model, so its behaviour does not change unnoticed. */
export function preferSnapshot(id: string, ids: string[]): string {
  if (DATED.test(id)) return id
  const snapshots = ids.filter((other) => other.startsWith(`${id}-`) && DATED.test(other) && other.replace(DATED, '') === id).sort()
  return snapshots.at(-1) ?? id
}

export function advicePrompt(models: ModelInfo[]): string {
  const ids = models.map((m) => m.id)
  const prices = priceTable(ids)
  const priceLines = Object.entries(prices).map(([id, p]) => `  ${id}: input ${p.input}, cached input ${p.cachedInput}, output ${p.output}`)
  const unknown = ids.filter((id) => !prices[id])
  return [
    'You are helping to set up Wisplight, a single-player text RPG. Language',
    'models play three roles:',
    '- VOICE: short, in-character dialogue in English (15 to 50 words, up to',
    '  180 for a story), returned as JSON that follows a strict schema.',
    '- BRAIN: picks 1 to 3 goals for an NPC from a fixed list, as JSON.',
    '- CHRONICLER: rarely, mostly at night, turns what happened into lore,',
    '  notes, requests and news, as JSON: about 4,500 input tokens (3,000 of',
    '  them cached) and up to 1,800 output tokens, 0 to 2 times per hour.',
    '  Good writing and sticking to the facts matter more than speed.',
    'Typical load per hour of play for VOICE and BRAIN: about 160,000 input',
    'tokens (60% can be cached) and 10,000 output tokens, roughly 70% VOICE',
    'and 30% BRAIN. Targets: a reply within 4 seconds, valid JSON every time,',
    'good English, and a total cost below 0.10 USD per hour of play; a',
    'CHRONICLER run below 0.03 USD. Cheaper is better as long as quality holds.',
    `AVAILABLE MODELS for this API key (use only these ids): ${ids.join(', ')}`,
    `KNOWN PRICES per million tokens in USD, as of ${PRICING_AS_OF}:`,
    ...(priceLines.length ? priceLines : ['  (none of these models are in the price table)']),
    ...(unknown.length ? [`PRICE UNKNOWN for: ${unknown.join(', ')}`] : []),
    'For each role, recommend one model id and one cheaper alternative, with',
    'one sentence of reasoning each. If a price is unknown, say so. Do not',
    'guess prices and do not name models that are not in the list.',
  ].join('\n')
}

function adviceSchema(ids: string[]) {
  const choice = { type: 'object', additionalProperties: false, required: ['model', 'reason'], properties: { model: { type: 'string', enum: ids }, reason: { type: 'string' } } }
  const role = { type: 'object', additionalProperties: false, required: ['recommended', 'cheaper'], properties: { recommended: choice, cheaper: choice } }
  return { type: 'object', additionalProperties: false, required: ['voice', 'brain', 'chronicler'], properties: { voice: role, brain: role, chronicler: role } }
}

/** Checks the advice: every id must come from the provider's list. Returns an error text or undefined. */
export function validateAdvice(advice: { voice: RoleAdvice; brain: RoleAdvice; chronicler?: RoleAdvice }, ids: string[]): string | undefined {
  for (const role of CHOSEN_ROLES) {
    if (role === 'chronicler' && !advice.chronicler) continue
    for (const kind of ['recommended', 'cheaper'] as const) {
      const id = advice[role]?.[kind]?.model
      if (!id || !ids.includes(id)) return `The advice named "${id ?? 'nothing'}" for ${role}, which this key cannot use.`
    }
  }
  return undefined
}

export async function askAdvice(gateway: Gateway, provider: ProviderId, models: ModelInfo[]): Promise<Advice> {
  const ids = models.map((m) => m.id)
  if (!ids.length) throw new Error('This key cannot use any chat models.')
  const advisorModel = pickAdvisor(provider, models)!
  const response = await gateway.complete(
    {
      role: 'advisor',
      system: 'You advise on choosing language models for a game. Answer with JSON only.',
      prompt: advicePrompt(models),
      schemaName: 'model_advice',
      schema: adviceSchema(ids),
      maxTokens: 1200,
    },
    { provider, model: advisorModel },
  )
  let parsed: { voice: RoleAdvice; brain: RoleAdvice; chronicler?: RoleAdvice }
  try {
    parsed = JSON.parse(response.text) as { voice: RoleAdvice; brain: RoleAdvice; chronicler?: RoleAdvice }
  } catch {
    throw new Error('The advice did not come back as JSON. Try again or pick a model yourself.')
  }
  const problem = validateAdvice(parsed, ids)
  if (problem) throw new Error(problem)
  const snap = (choice: AdviceChoice): AdviceChoice => ({ model: preferSnapshot(choice.model, ids), reason: choice.reason })
  const voice = { recommended: snap(parsed.voice.recommended), cheaper: snap(parsed.voice.cheaper) }
  const brain = { recommended: snap(parsed.brain.recommended), cheaper: snap(parsed.brain.cheaper) }
  // An advisor that leaves the chronicler out gets the voice's models for it: good writing first.
  const writer = parsed.chronicler ?? parsed.voice
  const chronicler = { recommended: snap(writer.recommended), cheaper: snap(writer.cheaper) }
  const named = [voice, brain, chronicler].flatMap((r) => [r.recommended.model, r.cheaper.model])
  return { provider, advisorModel, voice, brain, chronicler, unknownPrices: [...new Set(named.filter((id) => !priceOf(id)))] }
}

/** Runs a model on situations from the fixed test set and measures validity, latency, tokens and cost. */
export async function trial(gateway: Gateway, content: Content, provider: ProviderId, model: string, role: ChosenRole, count = role === 'voice' ? 6 : role === 'brain' ? 3 : 2): Promise<TrialResult> {
  const requests: LlmRequest[] =
    role === 'voice' ? await trialRequests(content, new MockLlm('good'), count) : role === 'brain' ? brainRequests().slice(0, count) : (await chroniclerRequests(content)).slice(0, count)
  const result: TrialResult = { provider, model, role, runs: 0, valid: 0, averageLatencyMs: 0, inputTokens: 0, outputTokens: 0, errors: [] }
  let latency = 0
  let cost = 0
  let answered = 0
  let priced = true
  for (const request of requests) {
    result.runs++
    try {
      const response = await gateway.complete(request, { provider, model })
      answered++
      latency += response.latencyMs
      result.inputTokens += response.usage.inputTokens
      result.outputTokens += response.usage.outputTokens
      const callCost = costUsd(model, response.usage)
      if (callCost === undefined) priced = false
      else cost += callCost
      const problem = role === 'voice' ? voiceProblem(response.text, request) : role === 'brain' ? brainProblem(response.text) : chroniclerProblem(response.text)
      if (problem) result.errors.push(problem)
      else result.valid++
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  result.averageLatencyMs = answered ? Math.round(latency / answered) : 0
  if (priced && answered) {
    result.costUsd = cost
    result.costPerHourUsd = (cost / answered) * CALLS_PER_HOUR[role]
  }
  return result
}

function voiceProblem(text: string, request: LlmRequest): string | undefined {
  const reply = parseReply(text)
  if (!reply) return 'reply: not valid JSON for the reply schema'
  const limit = (request.meta?.['wordLimit'] as number | undefined) ?? TIER_WORDS.normal
  // The engine trims a reply that runs a little long; far too long counts as a miss.
  if (wordCount(reply.reply) > limit * 1.5) return `reply: ${wordCount(reply.reply)} words where ${limit} was the limit`
  return undefined
}

function chroniclerProblem(text: string): string | undefined {
  try {
    const reply = JSON.parse(text) as Record<string, unknown>
    return ['lore', 'lines', 'quests', 'thoughts', 'news'].every((key) => Array.isArray(reply[key])) ? undefined : 'reply: not valid JSON for the chronicle schema'
  } catch {
    return 'reply: not JSON'
  }
}

function brainProblem(text: string): string | undefined {
  try {
    return GoalReplySchema.safeParse(JSON.parse(text)).success ? undefined : 'reply: not valid JSON for the goal schema'
  } catch {
    return 'reply: not JSON'
  }
}
