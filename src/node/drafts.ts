import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// The open proposals of a world build (M10.20; the build of The Quiet Reach,
// 28 September 2026: two good proposals were lost when the app restarted for a
// new version). One per world and step, with the words it was asked for, until
// the designer accepts or throws it away. drafts.json in the app's data folder:
// a proposal is work in progress, not content.

export interface KeptDraft {
  /** The proposal as the editor shows it. */
  draft: unknown
  /** The designer's words it was proposed for. */
  asked: string
  /** When it was kept, as an ISO time. */
  at: string
}

export class DraftStore {
  constructor(private readonly path: string) {}

  get(world: string, step: string): KeptDraft | undefined {
    return this.read()[world]?.[step]
  }

  /** Keeps a proposal for a step, or forgets it (null). */
  set(world: string, step: string, kept: { draft: unknown; asked: string } | null): void {
    const all = this.read()
    const steps = (all[world] ??= {})
    if (kept) steps[step] = { draft: kept.draft, asked: kept.asked, at: new Date().toISOString() }
    else delete steps[step]
    if (!Object.keys(steps).length) delete all[world]
    mkdirSync(dirname(this.path), { recursive: true })
    const temp = `${this.path}.tmp`
    writeFileSync(temp, JSON.stringify(all), { mode: 0o600 })
    renameSync(temp, this.path)
  }

  private read(): Record<string, Record<string, KeptDraft>> {
    if (!existsSync(this.path)) return {}
    try {
      const all = JSON.parse(readFileSync(this.path, 'utf8')) as unknown
      return all && typeof all === 'object' ? (all as Record<string, Record<string, KeptDraft>>) : {}
    } catch {
      return {}
    }
  }
}
