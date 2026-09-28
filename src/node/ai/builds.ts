import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { hourlyBudget } from '../../engine/aisettings'

// The budget of a world build (M10.20; Bram, 28 September 2026). Building a
// world in the editor is the designer's own choice, one step at a time: it
// does not wait on the hourly budget of the game, and does not use it up.
// Each world being built may spend up to its own limit (the hourly budget
// until the designer sets one), and what each step cost so far is kept, so
// the editor can show it. builds.json in the app's data folder.

export interface BuildView {
  world: string
  /** What this build may spend, in dollars. */
  limitUsd: number
  /** Whether the designer set the limit, or it is the hourly budget. */
  own: boolean
  spentUsd: number
  /** What each step cost so far, by step id ("fix" rounds count with their step). */
  steps: Record<string, number>
  /** Calls counted. */
  calls: number
}

interface BuildRecord {
  limitUsd?: number
  spentUsd: number
  steps: Record<string, number>
  calls: number
}

export class BuildStore {
  private data: Record<string, BuildRecord> = {}
  private readonly reserved = new Map<number, { world: string; usd: number }>()
  private seq = 0

  constructor(
    private readonly path: string | undefined,
    private readonly hourly: () => number,
  ) {
    if (!path || !existsSync(path)) return
    try {
      const read = JSON.parse(readFileSync(path, 'utf8')) as Record<string, BuildRecord>
      if (read && typeof read === 'object') this.data = read
    } catch {
      // A damaged file starts over: it only holds what builds cost.
    }
  }

  view(world: string): BuildView {
    const r = this.data[world]
    return { world, limitUsd: r?.limitUsd ?? this.hourly(), own: r?.limitUsd !== undefined, spentUsd: r?.spentUsd ?? 0, steps: { ...(r?.steps ?? {}) }, calls: r?.calls ?? 0 }
  }

  /** Sets what this build may spend, as the hourly budget is kept: from a cent to a thousand dollars. */
  setLimit(world: string, usd: number): { view: BuildView; adjusted: boolean } {
    const kept = hourlyBudget(usd)
    this.record(world).limitUsd = kept.usd
    this.write()
    return { view: this.view(world), adjusted: kept.adjusted }
  }

  /** Counts from zero again, keeping the limit: a new round of building. */
  reset(world: string): BuildView {
    const limit = this.data[world]?.limitUsd
    this.data[world] = { spentUsd: 0, steps: {}, calls: 0, ...(limit !== undefined ? { limitUsd: limit } : {}) }
    this.write()
    return this.view(world)
  }

  /** Whether a call of at most `bound` dollars fits in what is left, counting calls under way. */
  fits(world: string, bound: number): boolean {
    const view = this.view(world)
    let held = 0
    for (const r of this.reserved.values()) if (r.world === world) held += r.usd
    return view.spentUsd + held + bound <= view.limitUsd
  }

  reserve(world: string, usd: number): number {
    const id = ++this.seq
    this.reserved.set(id, { world, usd })
    return id
  }

  release(id: number): void {
    this.reserved.delete(id)
  }

  /** A finished call of this build, paid for. */
  add(world: string, step: string, usd: number): void {
    const r = this.record(world)
    r.spentUsd += usd
    r.steps[step] = (r.steps[step] ?? 0) + usd
    r.calls++
    this.write()
  }

  private record(world: string): BuildRecord {
    return (this.data[world] ??= { spentUsd: 0, steps: {}, calls: 0 })
  }

  private write(): void {
    if (!this.path) return
    mkdirSync(dirname(this.path), { recursive: true })
    const temp = `${this.path}.tmp`
    writeFileSync(temp, JSON.stringify(this.data), { mode: 0o600 })
    renameSync(temp, this.path)
  }
}
