import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// The cost register (M9.3; review of 27 September 2026 on cost). The hourly
// budget counts every call of the last hour, also after a restart: each call's
// cost is a line on disk, and what is older than an hour falls away. Calls
// under way hold a reservation of what they may cost at most, so calls that
// run at the same time cannot go over the budget together. Calls of a model
// without a known price count by number instead: tokens are counted, the
// automatic spending on them is capped.
//
// One register for the key (M10.26; Bram's credit fell $4.14 in 24 minutes
// while the game's log showed eighteen talks): the game, the editor, a trial
// and a picture run each write their calls here with where they came from, and
// each reads what the others wrote, so they share the hour and the day. The
// file keeps the calls of today (and of the last hour past midnight).

const HOUR = 60 * 60 * 1000

/** Where a call on the player's key came from (M10.26). */
export const SPEND_SOURCES = ['game', 'editor', 'trial', 'pictures'] as const
export type SpendSource = (typeof SPEND_SOURCES)[number]

export interface CostEntry {
  /** Milliseconds since 1970. */
  t: number
  usd: number
  role?: string
  /** A model whose price is not known: the cost is not known either. */
  unpriced?: boolean
  /** Where the call came from; a line from before M10.26 is the game's. */
  source?: SpendSource
}

/** Spend per source, and in all. */
export type SpendBySource = Record<SpendSource, number> & { all: number }

/** Midnight of the local day of a time. */
function startOfDay(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export class CostRegister {
  private entries: CostEntry[] = []
  private readonly reserved = new Map<number, number>()
  private seq = 0
  private written = 0

  /** How far the file is read, in bytes: what another process adds after it is read on the next look. */
  private offset = 0

  constructor(
    private readonly path?: string,
    private readonly now: () => number = () => Date.now(),
  ) {
    if (!path || !existsSync(path)) return
    this.sync()
    this.prune(true)
  }

  /** Reads what was added to the file since the last look, by this process or another. */
  private sync(): void {
    if (!this.path || !existsSync(this.path)) return
    const size = statSync(this.path).size
    // Written again without its old lines (by another process at its start): read it whole.
    if (size < this.offset) {
      this.entries = []
      this.offset = 0
    }
    if (size === this.offset) return
    const buffer = Buffer.alloc(size - this.offset)
    const fd = openSync(this.path, 'r')
    try {
      readSync(fd, buffer, 0, buffer.length, this.offset)
    } finally {
      closeSync(fd)
    }
    const text = buffer.toString('utf8')
    const end = text.lastIndexOf('\n')
    // A line still being written is read on the next look.
    if (end < 0) return
    for (const line of text.slice(0, end).split('\n')) {
      if (!line.trim()) continue
      try {
        const e = JSON.parse(line) as CostEntry
        if (typeof e.t === 'number' && typeof e.usd === 'number') this.entries.push(e)
      } catch {
        // A torn line after a crash: skip it.
      }
    }
    this.offset += Buffer.byteLength(text.slice(0, end + 1), 'utf8')
  }

  /** A finished call. */
  add(entry: Omit<CostEntry, 't'>): void {
    const e: CostEntry = { t: this.now(), ...entry }
    if (this.path) {
      mkdirSync(dirname(this.path), { recursive: true })
      appendFileSync(this.path, `${JSON.stringify(e)}\n`, { mode: 0o600 })
      this.written++
      this.sync()
    } else this.entries.push(e)
    this.prune(false)
  }

  /** What the calls of the last hour cost, from every source. */
  spentLastHour(): number {
    this.sync()
    const since = this.now() - HOUR
    return this.entries.filter((e) => e.t >= since).reduce((sum, e) => sum + e.usd, 0)
  }

  /** What was spent on the key this hour and today, per source (M10.26: the settings show it next to the budget). */
  spent(): { hour: SpendBySource; today: SpendBySource } {
    this.sync()
    const sum = (since: number): SpendBySource => {
      const out = { game: 0, editor: 0, trial: 0, pictures: 0, all: 0 } as SpendBySource
      for (const e of this.entries) {
        if (e.t < since) continue
        out[e.source ?? 'game'] += e.usd
        out.all += e.usd
      }
      return out
    }
    return { hour: sum(this.now() - HOUR), today: sum(startOfDay(this.now())) }
  }

  /** Calls in the last hour of a model without a known price. */
  unpricedLastHour(): number {
    this.sync()
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

  /**
   * How long until a call of at most `bound` dollars fits in `budget` again,
   * in milliseconds, as the oldest calls of the hour fall away (M10.20: "the
   * hourly budget is used up" said nothing of when). Undefined when waiting
   * will not do: the call alone costs more than the budget, or calls under
   * way hold it.
   */
  roomInMs(bound: number, budget: number): number | undefined {
    this.sync()
    const since = this.now() - HOUR
    const live = this.entries.filter((e) => e.t >= since).sort((a, b) => a.t - b.t)
    let spent = live.reduce((sum, e) => sum + e.usd, 0) + this.reservedUsd()
    if (spent + bound <= budget) return 0
    for (const e of live) {
      spent -= e.usd
      if (spent + bound <= budget) return Math.max(0, e.t + HOUR - this.now())
    }
    return undefined
  }

  /** Calls under way. */
  pending(): number {
    return this.reserved.size
  }

  /**
   * Forgets what is older than today and the last hour. The file is written
   * again without it only at the start: another process may be adding to it
   * later, and reads it whole when it finds it shorter.
   */
  private prune(rewrite: boolean): void {
    const since = Math.min(this.now() - HOUR, startOfDay(this.now()))
    const before = this.entries.length
    this.entries = this.entries.filter((e) => e.t >= since)
    if (!this.path || !rewrite || before === this.entries.length) return
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, this.entries.map((e) => `${JSON.stringify(e)}\n`).join(''), { mode: 0o600 })
    this.offset = statSync(this.path).size
    this.written = 0
  }
}
