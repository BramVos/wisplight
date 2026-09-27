import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// The cost register (M9.3; review of 27 September 2026 on cost). The hourly
// budget counts every call of the last hour, also after a restart: each call's
// cost is a line on disk, and what is older than an hour falls away. Calls
// under way hold a reservation of what they may cost at most, so calls that
// run at the same time cannot go over the budget together. Calls of a model
// without a known price count by number instead: tokens are counted, the
// automatic spending on them is capped.

const HOUR = 60 * 60 * 1000

export interface CostEntry {
  /** Milliseconds since 1970. */
  t: number
  usd: number
  role?: string
  /** A model whose price is not known: the cost is not known either. */
  unpriced?: boolean
}

export class CostRegister {
  private entries: CostEntry[] = []
  private readonly reserved = new Map<number, number>()
  private seq = 0
  private written = 0

  constructor(
    private readonly path?: string,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (!path || !existsSync(path)) return
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (!line.trim()) continue
      try {
        const e = JSON.parse(line) as CostEntry
        if (typeof e.t === 'number' && typeof e.usd === 'number') this.entries.push(e)
      } catch {
        // A torn last line after a crash: skip it.
      }
    }
    this.prune(true)
  }

  /** A finished call. */
  add(entry: Omit<CostEntry, 't'>): void {
    const e: CostEntry = { t: this.now(), ...entry }
    this.entries.push(e)
    if (this.path) {
      mkdirSync(dirname(this.path), { recursive: true })
      appendFileSync(this.path, `${JSON.stringify(e)}\n`, { mode: 0o600 })
      this.written++
    }
    this.prune(false)
  }

  /** What the calls of the last hour cost. */
  spentLastHour(): number {
    const since = this.now() - HOUR
    return this.entries.filter((e) => e.t >= since).reduce((sum, e) => sum + e.usd, 0)
  }

  /** Calls in the last hour of a model without a known price. */
  unpricedLastHour(): number {
    const since = this.now() - HOUR
    return this.entries.filter((e) => e.t >= since && e.unpriced).length
  }

  /** Holds what a call may cost at most, until it is settled. Returns the reservation. */
  reserve(usd: number): number {
    const id = ++this.seq
    this.reserved.set(id, usd)
    return id
  }

  release(id: number): void {
    this.reserved.delete(id)
  }

  reservedUsd(): number {
    let sum = 0
    for (const usd of this.reserved.values()) sum += usd
    return sum
  }

  /** Calls under way. */
  pending(): number {
    return this.reserved.size
  }

  /** Forgets what is older than an hour; now and then the file is written again without it. */
  private prune(rewrite: boolean): void {
    const since = this.now() - HOUR
    const before = this.entries.length
    this.entries = this.entries.filter((e) => e.t >= since)
    if (!this.path || (!rewrite && (this.written < 200 || before === this.entries.length))) return
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, this.entries.map((e) => `${JSON.stringify(e)}\n`).join(''), { mode: 0o600 })
    this.written = 0
  }
}
