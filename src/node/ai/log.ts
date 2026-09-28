import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Every model call, for the AI log in the world builder and for debugging
// (FO, chapter 15). Prompts are truncated; API keys never get here.

export interface AiLogEntry {
  time: string
  role: string
  provider: string
  model: string
  ok: boolean
  error?: string
  latencyMs: number
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  costUsd?: number
  prompt: string
  response: string
  /** Replies of this call the engine threw away, and why (M10.8): schema, leak, invented, ... */
  rejected?: string[]
  /** What the guard put right in this reply or noted (M10.10): "oath: ...", "not_here: potatoes > turnips", "number: 12 was not given". */
  fixed?: string[]
}

/** How often the guard stepped in, per model and why (M10.10): replies thrown away and things put right. */
export interface GuardCount {
  provider: string
  model: string
  reasons: Record<string, number>
}

const KEEP = 200

export class AiLog {
  private readonly entries: AiLogEntry[] = []

  constructor(private readonly path?: string) {
    if (path) mkdirSync(dirname(path), { recursive: true })
  }

  add(entry: AiLogEntry): void {
    const trimmed = { ...entry, prompt: entry.prompt.slice(0, 4000), response: entry.response.slice(0, 2000) }
    this.entries.push(trimmed)
    if (this.entries.length > KEEP) this.entries.splice(0, this.entries.length - KEEP)
    if (this.path) appendFileSync(this.path, `${JSON.stringify(trimmed)}\n`, { mode: 0o600 })
  }

  /** The engine threw away the last reply of this role (M10.8): the reason goes with that call. */
  reject(role: string, reason: string): void {
    const last = [...this.entries].reverse().find((e) => e.role === role && e.ok)
    if (!last) return
    ;(last.rejected ??= []).push(reason)
    if (this.path) appendFileSync(this.path, `${JSON.stringify({ time: last.time, role, rejected: reason })}\n`, { mode: 0o600 })
  }

  /** Text the guard held back before any call (M10.19): a line of its own, with the reason and the text, cut like a prompt. */
  hold(role: string, reason: string, text: string, time: string): void {
    this.add({ time, role, provider: 'guard', model: '-', ok: false, error: `held back: ${reason}`, latencyMs: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, prompt: text, response: '', rejected: [reason] })
  }

  /** The guard put something right in the last reply of this role, or noted it (M10.10). */
  fix(role: string, what: string): void {
    const last = [...this.entries].reverse().find((e) => e.role === role && e.ok)
    if (!last) return
    ;(last.fixed ??= []).push(what)
    if (this.path) appendFileSync(this.path, `${JSON.stringify({ time: last.time, role, fixed: what })}\n`, { mode: 0o600 })
  }

  /** Per model, how often the guard threw a reply away or put one right, and why (M10.10), over the calls kept here. */
  guardCounts(): GuardCount[] {
    const out = new Map<string, GuardCount>()
    for (const e of this.entries) {
      const reasons = [...(e.rejected ?? []), ...(e.fixed ?? []).map((f) => f.split(':')[0]!)]
      if (!reasons.length) continue
      const key = `${e.provider}/${e.model}`
      const count = out.get(key) ?? { provider: e.provider, model: e.model, reasons: {} }
      for (const r of reasons) count.reasons[r] = (count.reasons[r] ?? 0) + 1
      out.set(key, count)
    }
    return [...out.values()]
  }

  recent(count = 50): AiLogEntry[] {
    return this.entries.slice(-count).reverse()
  }

  /** Spend in the last hour of real time. */
  spentLastHour(now = Date.now()): number {
    const since = now - 60 * 60 * 1000
    return this.entries.filter((e) => Date.parse(e.time) >= since).reduce((sum, e) => sum + (e.costUsd ?? 0), 0)
  }
}
