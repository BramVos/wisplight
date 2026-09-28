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

  recent(count = 50): AiLogEntry[] {
    return this.entries.slice(-count).reverse()
  }

  /** Spend in the last hour of real time. */
  spentLastHour(now = Date.now()): number {
    const since = now - 60 * 60 * 1000
    return this.entries.filter((e) => Date.parse(e.time) >= since).reduce((sum, e) => sum + (e.costUsd ?? 0), 0)
  }
}
