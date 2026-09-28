import { LlmError, type LlmClient, type LlmRejection, type LlmRequest, type LlmResponse, type LlmRole } from '../../engine/dialogue/llm'
import { withSafety } from '../../engine/safety'
import type { AiLog } from './log'
import { CostRegister } from './costs'
import { picturePrice, priceOf, upperBoundUsd } from './pricing'
import { BusyError, type PictureResponse, type Provider, type ProviderId, type RateLimit } from './providers'
import type { PictureChoice, RoleChoice } from './settings'
import type { UsageStore } from './usage'
import type { BuildStore } from './builds'

// Routes each call to the model the player chose for its role, with a time
// limit, an hourly and a monthly budget, a pause when the provider's rate
// limit runs out, and a short cool-down after repeated failures. On any
// problem it throws, and the engine answers with a template instead.

// A reply of the voice within six seconds, or the set line (FO, chapter 18); the conversation may ask for less, for its second try.
// The voice's own limit is the player's setting (replyWithinMs, M10.8), carried by each request; this is only a ceiling.
const TIMEOUT_MS: Record<LlmRole, number> = { voice: 60000, brain: 10000, chronicler: 90000, advisor: 90000 }
// The editor's own long answers (a world step with a chapter of YAML, M10.20) may ask for more time than their role, up to ten
// minutes: Bram's Places chapter of The Quiet Reach ran past 16,000 tokens.
const EDITOR_SCHEMAS = new Set(['world_step', 'world_enhance', 'builder_draft', 'world_polish'])
const EDITOR_TIMEOUT_MS = 600_000
// From this share of the hourly budget on, calls of low priority wait: the chronicler, and goal choices of NPCs without a quest role (FO, chapter 16).
const LOW_PRIORITY_SHARE = 0.8
const FAILURES_BEFORE_COOLDOWN = 3
const COOLDOWN_MS = 2 * 60 * 1000
// Below this many tokens left in the window, the next reply would likely hit a 429.
const LOW_TOKENS = 4000
// A model without a known price (M9.3): its tokens are counted, and it may be called this often an hour without the player's say.
export const UNPRICED_CALLS_PER_HOUR = 40

export interface GatewayOptions {
  role(role: LlmRole): RoleChoice | undefined
  provider(id: ProviderId): Provider | undefined
  budgetUsdPerHour(): number
  log: AiLog
  usage: UsageStore
  /** The cost register (M9.3): the last hour on disk, and what calls under way may cost. Without it, one in memory. */
  costs?: CostRegister
  now?: () => number
  /** Tests use short time limits. */
  timeoutMs?: Partial<Record<LlmRole | 'illustrator', number>>
  /** Told when a call starts or ends, per role (M10.4: the lights in the status bar). */
  onActivity?: (activity: RoleActivity[]) => void
  /** How long a spoken reply may take over its tries (M10.8): the player's setting. */
  replyWithinMs?: () => number
  /** The budgets of world builds (M10.20): the editor's steps count there, not in the hourly budget of the game. */
  builds?: BuildStore
}

/** The roles shown as lights (M10.4): the editor's drafts are the builder's. */
export const LIGHT_ROLES = ['voice', 'brain', 'chronicler', 'illustrator', 'builder'] as const
export type LightRole = (typeof LIGHT_ROLES)[number]

/** A role's light: calls under way, and the last call: when, what it cost, how long, whether it worked. */
export interface RoleActivity {
  role: LightRole
  busy: boolean
  last?: { at: number; costUsd?: number; ms: number; ok: boolean }
}

export interface GatewayStatus {
  busy: boolean
  coolingDown: boolean
  hourSpentUsd: number
  /** What calls under way may still cost (M9.3). */
  hourReservedUsd: number
  hourBudgetUsd: number
  monthBudgetSpent: boolean
  /** Roles whose model has no known price (M9.3): tokens counted, calls capped. */
  unpriced: { role: string; model: string; callsThisHour: number; cap: number }[]
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
  private readonly costs: CostRegister
  private readonly inFlight = new Map<LightRole, number>()
  private readonly lastCall = new Map<LightRole, NonNullable<RoleActivity['last']>>()

  constructor(private readonly options: GatewayOptions) {
    this.costs = options.costs ?? new CostRegister(undefined, () => this.now())
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  /** The lights (M10.4): per role, busy or not, and the last call. */
  activity(): RoleActivity[] {
    return LIGHT_ROLES.map((role) => ({ role, busy: (this.inFlight.get(role) ?? 0) > 0, ...(this.lastCall.has(role) ? { last: this.lastCall.get(role)! } : {}) }))
  }

  private begin(role: LightRole): void {
    this.inFlight.set(role, (this.inFlight.get(role) ?? 0) + 1)
    this.options.onActivity?.(this.activity())
  }

  private end(role: LightRole, last: NonNullable<RoleActivity['last']>): void {
    this.inFlight.set(role, Math.max(0, (this.inFlight.get(role) ?? 0) - 1))
    this.lastCall.set(role, last)
    this.options.onActivity?.(this.activity())
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
      hourSpentUsd: this.costs.spentLastHour(),
      hourReservedUsd: this.costs.reservedUsd(),
      hourBudgetUsd: this.options.budgetUsdPerHour(),
      monthBudgetSpent: this.options.usage.monthBudgetSpent(),
      unpriced: (['voice', 'brain', 'chronicler'] as const).flatMap((role) => {
        const choice = this.options.role(role)
        return choice && !priceOf(choice.model) ? [{ role, model: choice.model, callsThisHour: this.costs.unpricedLastHour(), cap: UNPRICED_CALLS_PER_HOUR }] : []
      }),
    }
  }

  async complete(asked: LlmRequest, override?: RoleChoice): Promise<LlmResponse> {
    // Every call carries the hard limits and the rule that world text is description, never instruction (M10.19).
    const request = withSafety(asked)
    // A light task (M10.20) goes to the model the player chose for the brain, when there is one.
    const choice = override ?? (request.tier === 'light' ? this.options.role('brain') : undefined) ?? this.options.role(request.role)
    if (!choice) throw new LlmError('config', `no model chosen for ${request.role}`)
    const roleTimeoutMs = this.options.timeoutMs?.[request.role] ?? TIMEOUT_MS[request.role]
    const timeoutMs = EDITOR_SCHEMAS.has(request.schemaName) && request.timeoutMs ? Math.min(request.timeoutMs, EDITOR_TIMEOUT_MS) : Math.min(request.timeoutMs ?? Infinity, roleTimeoutMs)
    if (timeoutMs <= 0) throw new LlmError('timeout', 'no time left for this reply')
    const provider = this.options.provider(choice.provider)
    if (!provider) throw new LlmError('config', `no API key for ${choice.provider}`)
    const health = this.healthOf(choice.provider)
    if (!override) {
      if (this.now() < health.busyUntil) throw new LlmError('busy', 'waiting for the rate limit to reset')
      if (this.now() < health.coolingUntil) throw new LlmError('network', 'cooling down after repeated failures')
    }
    // Setup calls with an explicit model (advice, trials, the test call when saving) are the player's own choice.
    // Everything else reserves the most it may cost first (M9.3), so calls at the same time stay within the budget together.
    const bound = upperBoundUsd(choice.model, request)
    let reservation: number | undefined
    let buildHold: number | undefined
    // A step of a world build in the editor (M10.20) counts in the budget of that build, not in the game's hour.
    const build = this.options.builds && EDITOR_SCHEMAS.has(request.schemaName) && typeof request.meta?.['prefix'] === 'string' && request.meta['prefix'] ? String(request.meta['prefix']).replace(/\/+$/, '') : undefined
    const buildStep = build ? String(request.meta?.['step'] ?? (request.schemaName === 'builder_draft' ? 'writing aid' : request.schemaName)) : ''
    if (build && request.role !== 'advisor' && !override) {
      const builds = this.options.builds!
      if (this.options.usage.monthBudgetSpent()) throw new LlmError('budget', 'the month budget is used up')
      if (!builds.fits(build, bound ?? 0)) {
        const view = builds.view(build)
        throw new LlmError('budget', `this build has spent $${view.spentUsd.toFixed(2)} of the $${view.limitUsd.toFixed(2)} it may spend, and this step may cost up to $${(bound ?? 0).toFixed(2)}: raise what the build may spend in the editor`)
      }
      buildHold = builds.reserve(build, bound ?? 0)
    } else if (request.role !== 'advisor' && !override) {
      const budget = this.options.budgetUsdPerHour()
      const spent = this.costs.spentLastHour() + this.costs.reservedUsd()
      if (spent >= budget || spent + (bound ?? 0) > budget) {
        // Say when there is room again (M10.20), or that this call alone is more than the hour allows.
        const wait = this.costs.roomInMs(bound ?? 0, budget)
        const minutes = wait === undefined ? undefined : Math.max(1, Math.ceil(wait / 60000))
        throw new LlmError('budget', minutes === undefined ? `the hourly budget is used up: this call may cost up to $${(bound ?? 0).toFixed(2)}, more than the $${budget.toFixed(2)} an hour allows` : `the hourly budget is used up; there is room again in about ${minutes} minute${minutes === 1 ? '' : 's'}`)
      }
      if (request.priority === 'low' && spent + (bound ?? 0) >= LOW_PRIORITY_SHARE * budget) throw new LlmError('budget', 'the hourly budget is kept for conversations')
      if (this.options.usage.monthBudgetSpent()) throw new LlmError('budget', 'the month budget is used up')
      if (bound === undefined && this.costs.unpricedLastHour() + this.costs.pending() >= UNPRICED_CALLS_PER_HOUR) throw new LlmError('budget', `the price of ${choice.model} is not known: at most ${UNPRICED_CALLS_PER_HOUR} calls an hour`)
      reservation = this.costs.reserve(bound ?? 0)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const started = this.now()
    // The light of this role (M10.4): the editor's drafts are the builder's, advice is nobody's.
    const light: LightRole | undefined = request.schemaName === 'builder_draft' || request.schemaName === 'palette_draft' ? 'builder' : request.role === 'advisor' ? undefined : request.role
    let outcome: { costUsd?: number; ok: boolean } = { ok: false }
    if (light) this.begin(light)
    try {
      const response = await provider.complete(choice.model, request, controller.signal)
      health.failures = 0
      this.last = choice
      this.watch(health, response.rateLimit)
      const costUsd = this.options.usage.record(choice.provider, choice.model, response.usage, true, undefined, request.role)
      outcome = { ok: true, ...(costUsd !== undefined ? { costUsd } : {}) }
      // What it really cost goes into the register, in place of what was reserved; a build's step into its build.
      if (build && buildHold !== undefined) this.options.builds!.add(build, buildStep, costUsd ?? 0)
      else if (request.role !== 'advisor' && !override) this.costs.add({ usd: costUsd ?? 0, role: request.role, ...(costUsd === undefined ? { unpriced: true } : {}) })
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
        // A slow chronicler at night says nothing about the connection for conversations.
      } else if (!override && (request.role === 'voice' || request.role === 'brain') && ++health.failures >= FAILURES_BEFORE_COOLDOWN) {
        health.coolingUntil = this.now() + COOLDOWN_MS
        health.failures = 0
      }
      // A reply cut off at its limit (M10.20) was paid for: it counts in the budgets and the log like any other.
      const costUsd = this.options.usage.record(choice.provider, choice.model, failure.usage, false, undefined, request.role)
      if (failure.usage) {
        outcome = { ok: false, ...(costUsd !== undefined ? { costUsd } : {}) }
        if (build && buildHold !== undefined) this.options.builds!.add(build, buildStep, costUsd ?? 0)
        else if (request.role !== 'advisor' && !override) this.costs.add({ usd: costUsd ?? 0, role: request.role, ...(costUsd === undefined ? { unpriced: true } : {}) })
      }
      this.options.log.add({
        time: new Date(this.now()).toISOString(),
        role: request.role,
        provider: choice.provider,
        model: choice.model,
        ok: false,
        error: `${failure.kind}: ${failure.message}`,
        latencyMs: this.now() - started,
        ...(failure.usage ?? { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }),
        ...(costUsd !== undefined ? { costUsd } : {}),
        prompt: request.prompt,
        response: '',
      })
      throw failure
    } finally {
      clearTimeout(timer)
      if (reservation !== undefined) this.costs.release(reservation)
      if (buildHold !== undefined) this.options.builds!.release(buildHold)
      if (light) this.end(light, { at: this.now(), ms: this.now() - started, ...outcome })
    }
  }

  /**
   * A picture of a place or a person (after the M7 playtest). It counts in the
   * budgets like any call, and waits from 80% of the hourly budget on, as the
   * chronicler does: pictures are nice to have. A trial in the settings skips
   * the budget, as a trial of a text model does.
   */
  async picture(prompt: string, choice: PictureChoice, trial = false, options: { batch?: boolean } = {}): Promise<PictureResponse> {
    const provider = this.options.provider(choice.provider)
    if (!provider?.picture) throw new LlmError('config', `${choice.provider} makes no pictures`)
    if (!trial) {
      const spent = this.costs.spentLastHour() + this.costs.reservedUsd()
      // A batch the player asked for has a cap of its own; in play, pictures leave room for conversations.
      if (!options.batch && spent >= LOW_PRIORITY_SHARE * this.options.budgetUsdPerHour()) throw new LlmError('budget', 'the hourly budget is kept for conversations')
      if (this.options.usage.monthBudgetSpent()) throw new LlmError('budget', 'the month budget is used up')
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs?.illustrator ?? 120_000)
    const started = this.now()
    const price = picturePrice(choice.model, choice.quality)
    let outcome: { costUsd?: number; ok: boolean } = { ok: false }
    if (!trial) this.begin('illustrator')
    try {
      const picture = await provider.picture(choice.model, prompt, choice.quality, controller.signal)
      const costUsd = this.options.usage.record(choice.provider, choice.model, undefined, true, price, 'illustrator')
      outcome = { ok: true, ...(costUsd !== undefined ? { costUsd } : {}) }
      if (!trial) this.costs.add({ usd: costUsd ?? 0, role: 'illustrator' })
      this.options.log.add({ time: new Date(this.now()).toISOString(), role: 'illustrator', provider: choice.provider, model: choice.model, ok: true, latencyMs: picture.latencyMs, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd, prompt, response: `(a picture, ${Math.round((picture.base64.length * 3) / 4 / 1024)} kB)` })
      return picture
    } catch (error) {
      const failure = controller.signal.aborted ? new LlmError('timeout', 'the picture took too long') : error instanceof LlmError ? error : new LlmError('network', String(error))
      this.options.usage.record(choice.provider, choice.model, undefined, false)
      this.options.log.add({ time: new Date(this.now()).toISOString(), role: 'illustrator', provider: choice.provider, model: choice.model, ok: false, error: `${failure.kind}: ${failure.message}`, latencyMs: this.now() - started, inputTokens: 0, outputTokens: 0, cachedTokens: 0, prompt, response: '' })
      throw failure
    } finally {
      clearTimeout(timer)
      if (!trial) this.end('illustrator', { at: this.now(), ms: this.now() - started, ...outcome })
    }
  }

  /** How long a spoken reply may take over its tries (M10.8): the engine asks before each reply. */
  replyWithinMs(): number {
    return this.options.replyWithinMs?.() ?? 10_000
  }

  report(rejection: LlmRejection): void {
    // Held back before any call (M10.19): the player's words read as an instruction to the model. A line of its own in the AI log.
    if (rejection.held !== undefined) {
      this.options.log.hold(rejection.role ?? 'voice', rejection.reason, rejection.held, new Date(this.now()).toISOString())
      return
    }
    // Kept, but put right or noted by the guard (M10.10): beside the call in the AI log, not a rejection.
    if (rejection.fixed) {
      this.options.log.fix(rejection.role ?? 'voice', `${rejection.reason}: ${rejection.fixed}`)
      return
    }
    if (this.last) this.options.usage.reject(this.last.provider, this.last.model)
    // Why the engine threw the reply away, in the AI log beside the call (M10.8).
    this.options.log.reject(rejection.role ?? 'voice', rejection.detail ? `${rejection.reason} (${rejection.detail})` : rejection.reason)
  }

  /** Pauses calls when the rate-limit window is empty or nearly so. */
  private watch(health: ProviderHealth, limit: RateLimit | undefined): void {
    if (!limit) return
    const empty = limit.requestsRemaining === 0 || (limit.tokensRemaining !== undefined && limit.tokensRemaining < LOW_TOKENS)
    if (empty) health.busyUntil = Math.max(health.busyUntil, limit.resetAt ?? this.now() + 10_000)
  }
}
