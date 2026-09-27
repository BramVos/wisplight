import type { Content } from '../../engine/content'
import { hasAnachronism, outOfCharacter } from '../../engine/dialogue/guard'
import type { LlmClient, LlmRejection, LlmRequest, LlmResponse } from '../../engine/dialogue/llm'
import { brainTrial, chroniclerTrial, runSituation, trialSituations } from '../../engine/dialogue/testset'
import type { Gateway } from './gateway'
import { CALLS_PER_HOUR, costUsd, priceOf, priceTable, PRICING_AS_OF } from './pricing'
import type { ModelInfo, ProviderId } from './providers'
import { CHOSEN_ROLES, type ChosenRole } from './settings'

// Model advice after connecting a provider (FO, chapter 16): a capable model
// of that provider recommends a model per role, chosen only from the ids the
// key can use; the game then tries the advice on the fixed test set.
//
// The trial (M9.3) plays the test set through the game itself: a conversation
// with its retry and its set line when both replies fail, the brain's goal
// choices, a chronicle run with its checks. It counts what the player would
// get: usable answers, retries and fallbacks, knowledge leaks, false facts,
// breaks of character, and how long an answer took. The cost that counts is
// the cost of one usable answer, retries and failures included, and the
// choice between models is made on that.

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
  /** Model calls made, retries and second looks included. */
  runs: number
  /** Answers the game wanted: a reply, a goal choice, a chronicle run (M9.3). */
  answers: number
  /** Answers that passed the game's own checks, at once or after a retry. */
  valid: number
  /** Calls made again after a reply failed the checks. */
  retries: number
  /** Answers the game made without the model in the end: a set line, the rules, a template. */
  fallbacks: number
  /** Names or knowledge the speaker could not have. */
  leaks: number
  /** Made-up names, goals that do not fit, lore no fact bears out. */
  factualErrors: number
  /** Words from outside the world, talk of models and prompts, markup. */
  characterBreaks: number
  averageLatencyMs: number
  maxLatencyMs: number
  inputTokens: number
  outputTokens: number
  costUsd?: number
  /** What one usable answer cost, retries and failed answers included (M9.3). */
  costPerUsableUsd?: number
  /** The cost of a usable answer times the answers in an hour of play. */
  costPerHourUsd?: number
  errors: string[]
}

/** How a model came out of its trial, and why (M9.3). */
export interface TrialVerdict {
  model: string
  provider: ProviderId
  passed: boolean
  why: string
}

// What a model must do in its trial to be chosen: the share of usable answers,
// and how long an answer may take on average (FO, chapter 16: a reply within
// four seconds; the chronicler writes in the background).
const PASS_SHARE: Record<ChosenRole, number> = { voice: 0.8, brain: 0.66, chronicler: 0.5 }
const LATENCY_MS: Record<ChosenRole, number> = { voice: 4000, brain: 8000, chronicler: 90000 }

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

/** One short call with this exact model id, to prove it answers in JSON. Returns a problem, or undefined. */
export async function testCall(gateway: Gateway, provider: ProviderId, model: string): Promise<string | undefined> {
  try {
    const response = await gateway.complete(
      {
        role: 'advisor',
        system: 'Reply with JSON that matches the schema, and nothing else.',
        prompt: 'Is this line reaching you? Answer ok: true.',
        schemaName: 'test_call',
        schema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } },
        maxTokens: 50,
      },
      { provider, model },
    )
    const reply = JSON.parse(response.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')) as { ok?: unknown }
    return typeof reply.ok === 'boolean' ? undefined : 'the reply was not the expected JSON'
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

interface Call {
  latencyMs: number
  inputTokens: number
  outputTokens: number
  costUsd?: number
  /** Which answer it belongs to. */
  answer: number
  rejected?: LlmRejection['reason']
  failed?: string
}

/** A client for the game that calls one model and keeps count of every call and every rejection. */
class Meter implements LlmClient {
  readonly calls: Call[] = []
  answer = 0

  constructor(
    private readonly gateway: Gateway,
    private readonly provider: ProviderId,
    private readonly model: string,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    try {
      const response = await this.gateway.complete(request, { provider: this.provider, model: this.model })
      this.calls.push({ latencyMs: response.latencyMs, inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens, costUsd: costUsd(this.model, response.usage), answer: this.answer })
      return response
    } catch (error) {
      this.calls.push({ latencyMs: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, answer: this.answer, failed: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  report(rejection: LlmRejection): void {
    const last = this.calls.at(-1)
    if (last) last.rejected = rejection.reason
    this.gateway.report(rejection)
  }
}

/**
 * Tries a model in one role on the fixed test set, played through the game
 * with the game's own checks (M9.3), and measures what it gives and costs.
 */
export async function trial(gateway: Gateway, content: Content, provider: ProviderId, model: string, role: ChosenRole, count = role === 'voice' ? 6 : role === 'brain' ? 3 : 2): Promise<TrialResult> {
  const meter = new Meter(gateway, provider, model)
  const result: TrialResult = { provider, model, role, runs: 0, answers: 0, valid: 0, retries: 0, fallbacks: 0, leaks: 0, factualErrors: 0, characterBreaks: 0, averageLatencyMs: 0, maxLatencyMs: 0, inputTokens: 0, outputTokens: 0, errors: [] }
  const note = (problem: string) => {
    if (result.errors.length < 8 && !result.errors.includes(problem)) result.errors.push(problem)
  }
  if (role === 'voice') {
    // Every line the player says is an answer the game wants; a line without a call (a greeting from the rules) is not counted.
    for (const situation of trialSituations(content, count)) {
      await runSituation(content, situation, meter, 7, () => meter.answer++)
    }
    const byAnswer = new Map<number, Call[]>()
    for (const call of meter.calls) byAnswer.set(call.answer, [...(byAnswer.get(call.answer) ?? []), call])
    for (const calls of byAnswer.values()) {
      result.answers++
      result.retries += calls.length - 1
      if (calls.some((c) => !c.rejected && !c.failed)) result.valid++
      else result.fallbacks++
    }
    for (const call of meter.calls) {
      if (call.rejected === 'leak') result.leaks++
      if (call.rejected === 'invented') result.factualErrors++
      if (call.rejected === 'anachronism' || call.rejected === 'character') result.characterBreaks++
      if (call.rejected) note(`reply: failed the ${call.rejected} check`)
      if (call.failed) note(call.failed)
    }
  } else if (role === 'brain') {
    const engine = brainTrial(content, count)
    engine.setLlm(meter)
    for (const done of await engine.runBrain()) {
      result.answers++
      // No reply, or one that could not be read: the rules decide, as in the game.
      const noReply = done.rejected.some((r) => r.startsWith('no reply'))
      if (noReply || (done.accepted === 0 && done.rejected.length > 0)) {
        result.fallbacks++
        note(noReply ? 'goals: no usable reply, the rules decide' : 'goals: nothing usable in the reply, the rules decide')
      } else result.valid++
      for (const r of noReply ? [] : done.rejected) {
        if (/not something .* knows/.test(r)) result.leaks++
        else result.factualErrors++
        note(`goal: ${r}`)
      }
    }
  } else {
    for (const engine of await chroniclerTrial(content)) {
      if (result.answers >= count) break
      engine.setLlm(meter)
      for (const done of await engine.runChronicler()) {
        result.answers++
        meter.answer++
        const run = engine.devRuns.find((r) => r.run === done.run)
        // A reply that cannot be read leaves the run to the templates, as in the game.
        if (!run?.output || done.problems.some((p) => /the reply is not JSON|does not match the schema/.test(p))) {
          result.fallbacks++
          note(`chronicle: ${done.problems[0] ?? 'no usable reply'}, a template wrote it`)
          continue
        }
        result.valid++
        for (const p of done.problems) {
          // Names it was not given are a leak; names nobody knows, and lore no fact bears out, are false.
          if (/not in the story/.test(p)) result.leaks++
          else if (/names the world does not know|no fact says|could not be read/.test(p) || (/^lore "/.test(p) && !/not big enough/.test(p))) result.factualErrors++
          note(`chronicle: ${p}`)
        }
        const texts = run.output.lore.flatMap((l) => [l.summary, l.story ?? '', ...(l.details ?? [])])
        result.characterBreaks += texts.filter((t) => hasAnachronism(t) || outOfCharacter(t)).length
      }
    }
  }
  result.runs = meter.calls.length
  const answered = meter.calls.filter((c) => !c.failed)
  result.averageLatencyMs = answered.length ? Math.round(answered.reduce((sum, c) => sum + c.latencyMs, 0) / answered.length) : 0
  result.maxLatencyMs = Math.max(0, ...answered.map((c) => c.latencyMs))
  result.inputTokens = meter.calls.reduce((sum, c) => sum + c.inputTokens, 0)
  result.outputTokens = meter.calls.reduce((sum, c) => sum + c.outputTokens, 0)
  if (answered.every((c) => c.costUsd !== undefined)) {
    result.costUsd = meter.calls.reduce((sum, c) => sum + (c.costUsd ?? 0), 0)
    if (result.valid) {
      result.costPerUsableUsd = result.costUsd / result.valid
      result.costPerHourUsd = result.costPerUsableUsd * CALLS_PER_HOUR[role]
    }
  }
  return result
}

/**
 * Chooses between models tried in the same role (M9.3). A model passes with
 * enough usable answers, no leaks, no false facts, no breaks of character and
 * answers in time; of those, the cheapest usable answer wins, a known price
 * before an unknown one, then the quicker. When none passes, the one with the
 * fewest problems is named, and the verdict says so.
 */
export function judgeTrials(results: TrialResult[]): { choice?: TrialResult; verdicts: TrialVerdict[] } {
  const why = (r: TrialResult): string[] => {
    const reasons: string[] = []
    if (!r.answers) reasons.push('no answers')
    else if (r.valid / r.answers < PASS_SHARE[r.role]) reasons.push(`${r.valid} of ${r.answers} usable`)
    if (r.leaks) reasons.push(`${r.leaks} ${r.leaks === 1 ? 'leak' : 'leaks'}`)
    if (r.factualErrors) reasons.push(`${r.factualErrors} false ${r.factualErrors === 1 ? 'fact' : 'facts'}`)
    if (r.characterBreaks) reasons.push(`${r.characterBreaks} out of character`)
    if (r.averageLatencyMs > LATENCY_MS[r.role]) reasons.push(`${(r.averageLatencyMs / 1000).toFixed(1)} s an answer`)
    return reasons
  }
  const cost = (r: TrialResult) => r.costPerUsableUsd ?? Infinity
  const problems = (r: TrialResult) => (r.answers - r.valid) + r.leaks + r.factualErrors + r.characterBreaks
  const passed = results.filter((r) => why(r).length === 0).sort((a, b) => cost(a) - cost(b) || a.averageLatencyMs - b.averageLatencyMs)
  const choice = passed[0] ?? [...results].filter((r) => r.answers > 0).sort((a, b) => problems(a) - problems(b) || cost(a) - cost(b))[0]
  const verdicts = results.map((r) => {
    const reasons = why(r)
    const price = r.costPerUsableUsd === undefined ? 'price unknown' : `$${r.costPerUsableUsd.toFixed(4)} a usable answer`
    return { model: r.model, provider: r.provider, passed: reasons.length === 0, why: reasons.length ? reasons.join(', ') : `${r.valid} of ${r.answers} usable, ${price}` }
  })
  return { ...(choice ? { choice } : {}), verdicts }
}
