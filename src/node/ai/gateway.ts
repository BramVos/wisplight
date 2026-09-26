import { LlmError, type LlmClient, type LlmRejection, type LlmRequest, type LlmResponse, type LlmRole } from '../../engine/dialogue/llm'
import type { AiLog } from './log'
import { BusyError, type Provider, type ProviderId, type RateLimit } from './providers'
import type { RoleChoice } from './settings'
import type { UsageStore } from './usage'

// Routes each call to the model the player chose for its role, with a time
// limit, an hourly and a monthly budget, a pause when the provider's rate
// limit runs out, and a short cool-down after repeated failures. On any
// problem it throws, and the engine answers with a template instead.

const TIMEOUT_MS: Record<LlmRole, number> = { voice: 8000, brain: 10000, advisor: 90000 }
const FAILURES_BEFORE_COOLDOWN = 3
const COOLDOWN_MS = 2 * 60 * 1000
// Below this many tokens left in the window, the next reply would likely hit a 429.
const LOW_TOKENS = 4000

export interface GatewayOptions {
  role(role: LlmRole): RoleChoice | undefined
  provider(id: ProviderId): Provider | undefined
  budgetUsdPerHour(): number
  log: AiLog
  usage: UsageStore
  now?: () => number
  /** Tests use short time limits. */
  timeoutMs?: Partial<Record<LlmRole, number>>
}

export interface GatewayStatus {
  busy: boolean
  coolingDown: boolean
  hourSpentUsd: number
  hourBudgetUsd: number
  monthBudgetSpent: boolean
}

interface ProviderHealth {
  failures: number
  coolingUntil: number
  busyUntil: number
}

export class Gateway implements LlmClient {
  // Per provider: a rate limit or an outage at one should not stop the other.
  private readonly health = new Map<ProviderId, ProviderHealth>()
  private last?: RoleChoice

  constructor(private readonly options: GatewayOptions) {}

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  private healthOf(provider: ProviderId): ProviderHealth {
    let health = this.health.get(provider)
    if (!health) this.health.set(provider, (health = { failures: 0, coolingUntil: 0, busyUntil: 0 }))
    return health
  }

  /** Busy and cooling down refer to the provider of the dialogue model. */
  status(): GatewayStatus {
    const voice = this.options.role('voice')
    const health = voice ? this.healthOf(voice.provider) : { failures: 0, coolingUntil: 0, busyUntil: 0 }
    return {
      busy: this.now() < health.busyUntil,
      coolingDown: this.now() < health.coolingUntil,
      hourSpentUsd: this.options.log.spentLastHour(this.now()),
      hourBudgetUsd: this.options.budgetUsdPerHour(),
      monthBudgetSpent: this.options.usage.monthBudgetSpent(),
    }
  }

  async complete(request: LlmRequest, override?: RoleChoice): Promise<LlmResponse> {
    const choice = override ?? this.options.role(request.role)
    if (!choice) throw new LlmError('config', `no model chosen for ${request.role}`)
    const provider = this.options.provider(choice.provider)
    if (!provider) throw new LlmError('config', `no API key for ${choice.provider}`)
    const health = this.healthOf(choice.provider)
    if (!override) {
      if (this.now() < health.busyUntil) throw new LlmError('busy', 'waiting for the rate limit to reset')
      if (this.now() < health.coolingUntil) throw new LlmError('network', 'cooling down after repeated failures')
    }
    if (request.role !== 'advisor') {
      if (this.options.log.spentLastHour(this.now()) >= this.options.budgetUsdPerHour()) throw new LlmError('budget', 'the hourly budget is used up')
      if (this.options.usage.monthBudgetSpent()) throw new LlmError('budget', 'the month budget is used up')
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs?.[request.role] ?? TIMEOUT_MS[request.role])
    const started = this.now()
    try {
      const response = await provider.complete(choice.model, request, controller.signal)
      health.failures = 0
      this.last = choice
      this.watch(health, response.rateLimit)
      const costUsd = this.options.usage.record(choice.provider, choice.model, response.usage, true)
      this.options.log.add({
        time: new Date(this.now()).toISOString(),
        role: request.role,
        provider: choice.provider,
        model: response.model,
        ok: true,
        latencyMs: response.latencyMs,
        ...response.usage,
        costUsd,
        prompt: request.prompt,
        response: response.text,
      })
      const { rateLimit: _, ...reply } = response
      return reply
    } catch (error) {
      const failure = controller.signal.aborted
        ? new LlmError('timeout', 'the model took too long')
        : error instanceof LlmError
          ? error
          : new LlmError('network', String(error))
      if (failure instanceof BusyError) {
        // A full rate limit is about pace, not a broken connection: wait, do not count it.
        health.busyUntil = this.now() + failure.retryAfterMs
      } else if (!override && ++health.failures >= FAILURES_BEFORE_COOLDOWN) {
        health.coolingUntil = this.now() + COOLDOWN_MS
        health.failures = 0
      }
      this.options.usage.record(choice.provider, choice.model, undefined, false)
      this.options.log.add({
        time: new Date(this.now()).toISOString(),
        role: request.role,
        provider: choice.provider,
        model: choice.model,
        ok: false,
        error: `${failure.kind}: ${failure.message}`,
        latencyMs: this.now() - started,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        prompt: request.prompt,
        response: '',
      })
      throw failure
    } finally {
      clearTimeout(timer)
    }
  }

  report(_rejection: LlmRejection): void {
    if (this.last) this.options.usage.reject(this.last.provider, this.last.model)
  }

  /** Pauses calls when the rate-limit window is empty or nearly so. */
  private watch(health: ProviderHealth, limit: RateLimit | undefined): void {
    if (!limit) return
    const empty = limit.requestsRemaining === 0 || (limit.tokensRemaining !== undefined && limit.tokensRemaining < LOW_TOKENS)
    if (empty) health.busyUntil = Math.max(health.busyUntil, limit.resetAt ?? this.now() + 10_000)
  }
}
