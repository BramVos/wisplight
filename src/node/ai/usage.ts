import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { LlmUsage } from '../../engine/dialogue/llm'
import { costUsd } from './pricing'
import type { SpendSource } from './costs'
import type { ProviderId } from './providers'

// What the AI costs, per session, day, month and model (FO, chapter 16,
// "Kosten en verbruik in beeld"). Neither provider tells a normal API key how
// much credit is left, so the percentage left comes from a month budget and a
// credit balance the player copies from the provider's console.

export interface UsageTotals {
  calls: number
  failed: number
  /** Replies the engine threw away: invalid JSON, a word from outside the world, a knowledge leak. */
  rejected: number
  inputTokens: number
  cachedTokens: number
  /** Input written to the cache (M9.3), priced apart where the provider does. */
  cacheWriteTokens: number
  outputTokens: number
  costUsd: number
  /** Calls whose model is not in the price table: tokens counted, no cost. */
  unpriced: number
}

/** How much of the prompts of a role came from the cache, this month (M9.3). */
export interface RoleUsage {
  role: string
  calls: number
  inputTokens: number
  cachedTokens: number
  cacheWriteTokens: number
  /** Percent of the input that was read from the cache. */
  cachedPercent: number
  /** What the role cost this month (M10.28: the pings that keep a place's cache warm show apart, with their cost). */
  costUsd: number
}

interface Credit {
  amountUsd: number
  enteredAt: string
  /** The provider's all-time spend when the balance was entered. */
  spentBefore: number
}

interface UsageFile {
  version: 1
  /** Local date (YYYY-MM-DD) -> "provider/model" -> totals. */
  days: Record<string, Record<string, UsageTotals>>
  /** Local date -> role -> totals (M9.3): the cache share per role. */
  roles?: Record<string, Record<string, UsageTotals>>
  /** Local date -> where the calls came from -> totals (M10.26): the game, the editor, a trial, a picture run. */
  sources?: Record<string, Partial<Record<SpendSource, UsageTotals>>>
  monthBudgetUsd?: number
  credit: Partial<Record<ProviderId, Credit>>
}

export interface ModelUsage extends UsageTotals {
  provider: ProviderId
  model: string
}

export interface CreditStatus {
  provider: ProviderId
  amountUsd: number
  enteredAt: string
  estimatedLeftUsd: number
  leftPercent: number
  /** Older than 30 days: ask the player to copy the balance again. */
  stale: boolean
}

export interface UsageSummary {
  session: UsageTotals
  today: UsageTotals
  month: UsageTotals
  byModel: ModelUsage[]
  monthBudgetUsd?: number
  monthLeftPercent?: number
  credit: CreditStatus[]
  /** Share of this month's calls that failed or whose reply was thrown away. */
  fallbackPercent: number
  /** Per role, this month: how much of its prompts came from the cache (M9.3). */
  byRole: RoleUsage[]
}

const KEEP_DAYS = 400
const STALE_DAYS = 30

export function emptyTotals(): UsageTotals {
  return { calls: 0, failed: 0, rejected: 0, inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0, costUsd: 0, unpriced: 0 }
}

const COUNTS = Object.keys(emptyTotals()) as (keyof UsageTotals)[]

function add<T extends UsageTotals>(into: T, from: UsageTotals): T {
  for (const key of COUNTS) into[key] += from[key] ?? 0
  return into
}

/** The computer's own calendar date, so a month starts on the first in the player's time zone. */
export function localDate(at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

export class UsageStore {
  private data: UsageFile
  private readonly session = emptyTotals()

  constructor(
    private readonly path?: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.data = this.read()
  }

  private read(): UsageFile {
    const empty: UsageFile = { version: 1, days: {}, credit: {} }
    if (!this.path || !existsSync(this.path)) return empty
    try {
      return { ...empty, ...(JSON.parse(readFileSync(this.path, 'utf8')) as Partial<UsageFile>) }
    } catch {
      return empty
    }
  }

  private write(): void {
    if (!this.path) return
    mkdirSync(dirname(this.path), { recursive: true })
    const temp = `${this.path}.tmp`
    writeFileSync(temp, JSON.stringify(this.data), { mode: 0o600 })
    renameSync(temp, this.path)
  }

  /**
   * What another process wrote since (M10.26: a trial or a picture run beside
   * the game): read again before each change, so every process adds to the
   * same days and the month budget counts them all.
   */
  private fresh(): void {
    this.data = this.read()
  }

  /** One call: its tokens and cost. A picture has a price of its own instead of tokens. */
  record(provider: ProviderId, model: string, usage: LlmUsage | undefined, ok: boolean, fixedCostUsd?: number, role?: string, source?: SpendSource): number | undefined {
    this.fresh()
    const cost = fixedCostUsd ?? (usage ? costUsd(model, usage) : undefined)
    const entry: UsageTotals = {
      calls: 1,
      failed: ok ? 0 : 1,
      rejected: 0,
      inputTokens: usage?.inputTokens ?? 0,
      cachedTokens: usage?.cachedTokens ?? 0,
      cacheWriteTokens: usage?.cacheWriteTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      costUsd: cost ?? 0,
      unpriced: usage && cost === undefined ? 1 : 0,
    }
    const day = localDate(this.now())
    const models = (this.data.days[day] ??= {})
    add((models[`${provider}/${model}`] ??= emptyTotals()), entry)
    if (role) add(((this.data.roles ??= {})[day] ??= {})[role] ??= emptyTotals(), entry)
    add(((this.data.sources ??= {})[day] ??= {})[source ?? 'game'] ??= emptyTotals(), entry)
    add(this.session, entry)
    this.prune()
    this.write()
    return cost
  }

  private prune(): void {
    const days = Object.keys(this.data.days).sort()
    for (const day of days.slice(0, Math.max(0, days.length - KEEP_DAYS))) {
      delete this.data.days[day]
      delete this.data.roles?.[day]
      delete this.data.sources?.[day]
    }
  }

  reject(provider: ProviderId, model: string): void {
    this.fresh()
    const day = localDate(this.now())
    const models = (this.data.days[day] ??= {})
    ;(models[`${provider}/${model}`] ??= emptyTotals()).rejected++
    this.session.rejected++
    this.write()
  }

  setMonthBudget(usd: number | undefined): void {
    this.fresh()
    this.data.monthBudgetUsd = usd && usd > 0 ? Math.min(usd, 1000) : undefined
    this.write()
  }

  setCredit(provider: ProviderId, amountUsd: number | undefined): void {
    this.fresh()
    if (amountUsd === undefined || !(amountUsd > 0)) delete this.data.credit[provider]
    else this.data.credit[provider] = { amountUsd, enteredAt: this.now().toISOString(), spentBefore: this.providerSpend(provider) }
    this.write()
  }

  monthCost(): number {
    return this.totals((day) => day.startsWith(localDate(this.now()).slice(0, 7))).costUsd
  }

  /** True when a month budget is set and used up, by any process on the key. */
  monthBudgetSpent(): boolean {
    this.fresh()
    return this.data.monthBudgetUsd !== undefined && this.monthCost() >= this.data.monthBudgetUsd
  }

  private providerSpend(provider: ProviderId): number {
    let total = 0
    for (const models of Object.values(this.data.days)) {
      for (const [key, totals] of Object.entries(models)) if (key.startsWith(`${provider}/`)) total += totals.costUsd
    }
    return total
  }

  private totals(dayFilter: (day: string) => boolean): UsageTotals {
    const sum = emptyTotals()
    for (const [day, models] of Object.entries(this.data.days)) {
      if (dayFilter(day)) for (const totals of Object.values(models)) add(sum, totals)
    }
    return sum
  }

  summary(): UsageSummary {
    this.fresh()
    const today = localDate(this.now())
    const month = today.slice(0, 7)
    const byModel = new Map<string, ModelUsage>()
    for (const [day, models] of Object.entries(this.data.days)) {
      if (!day.startsWith(month)) continue
      for (const [key, totals] of Object.entries(models)) {
        const [provider, ...rest] = key.split('/')
        const row = byModel.get(key) ?? { provider: provider as ProviderId, model: rest.join('/'), ...emptyTotals() }
        byModel.set(key, add(row, totals))
      }
    }
    const monthTotals = this.totals((day) => day.startsWith(month))
    const budget = this.data.monthBudgetUsd
    const credit = (Object.entries(this.data.credit) as [ProviderId, Credit][]).map(([provider, c]) => {
      const left = Math.max(0, c.amountUsd - (this.providerSpend(provider) - c.spentBefore))
      return {
        provider,
        amountUsd: c.amountUsd,
        enteredAt: c.enteredAt,
        estimatedLeftUsd: left,
        leftPercent: Math.round((left / c.amountUsd) * 100),
        stale: this.now().getTime() - Date.parse(c.enteredAt) > STALE_DAYS * 24 * 60 * 60 * 1000,
      }
    })
    return {
      session: { ...this.session },
      today: this.totals((day) => day === today),
      month: monthTotals,
      byModel: [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls),
      monthBudgetUsd: budget,
      monthLeftPercent: budget ? Math.max(0, Math.round((1 - monthTotals.costUsd / budget) * 100)) : undefined,
      credit,
      fallbackPercent: monthTotals.calls ? Math.round(((monthTotals.failed + monthTotals.rejected) / monthTotals.calls) * 1000) / 10 : 0,
      byRole: this.roleUsage(month),
    }
  }

  private roleUsage(month: string): RoleUsage[] {
    const sum = new Map<string, UsageTotals>()
    for (const [day, roles] of Object.entries(this.data.roles ?? {})) {
      if (!day.startsWith(month)) continue
      for (const [role, totals] of Object.entries(roles)) add((sum.get(role) ?? (sum.set(role, emptyTotals()), sum.get(role)!)), totals)
    }
    return [...sum.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([role, t]) => ({ role, calls: t.calls, inputTokens: t.inputTokens, cachedTokens: t.cachedTokens, cacheWriteTokens: t.cacheWriteTokens, cachedPercent: t.inputTokens ? Math.round((1000 * t.cachedTokens) / t.inputTokens) / 10 : 0, costUsd: t.costUsd }))
  }

  /** CSV of the kept days, one row per day and model. */
  csv(): string {
    const lines = ['date,provider,model,calls,failed,rejected,input_tokens,cached_tokens,output_tokens,cost_usd,cache_write_tokens']
    for (const day of Object.keys(this.data.days).sort()) {
      for (const [key, t] of Object.entries(this.data.days[day]!)) {
        const [provider, ...rest] = key.split('/')
        lines.push([day, provider, rest.join('/'), t.calls, t.failed, t.rejected, t.inputTokens, t.cachedTokens, t.outputTokens, t.costUsd.toFixed(6), t.cacheWriteTokens ?? 0].join(','))
      }
    }
    return `${lines.join('\n')}\n`
  }
}
