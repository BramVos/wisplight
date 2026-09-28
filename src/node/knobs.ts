import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { APP_KNOBS, type AppKnobId, type AppKnobView } from '../engine/appknobs'

// The knobs of the app (M10.20; Bram, 28 September 2026: "één laag voor
// knoppen"): how the app behaves, not the rules of a world. Each has what it
// does, a unit, a default and bounds; the player sets them under Settings,
// Advanced. They live in knobs.json in the app's own folder, apart from the
// settings, and are written one key at a time: a second window of the app
// changing one knob never writes back another it had in memory.

export { APP_KNOBS, type AppKnobDef, type AppKnobId, type AppKnobView } from '../engine/appknobs'

export class AppKnobs {
  private values: Partial<Record<AppKnobId, number>> = {}

  constructor(private readonly path?: string) {
    this.values = this.read()
  }

  private read(): Partial<Record<AppKnobId, number>> {
    if (!this.path || !existsSync(this.path)) return {}
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8')) as Record<string, unknown>
      const out: Partial<Record<AppKnobId, number>> = {}
      for (const [id, v] of Object.entries(raw)) if (id in APP_KNOBS && typeof v === 'number' && Number.isFinite(v)) out[id as AppKnobId] = clamp(id as AppKnobId, v)
      return out
    } catch {
      return {}
    }
  }

  /** The value of a knob: the player's, or the default. */
  get(id: AppKnobId): number {
    return this.values[id] ?? APP_KNOBS[id].default
  }

  /** Every knob, for the settings screen. */
  list(): AppKnobView[] {
    return (Object.keys(APP_KNOBS) as AppKnobId[]).map((id) => ({ id, ...APP_KNOBS[id], value: this.get(id), set: this.values[id] !== undefined }))
  }

  /**
   * Sets one knob, or back to the default with undefined; within its bounds,
   * and said so when it had to be moved. The file is read first and only this
   * key changes.
   */
  set(id: AppKnobId, value: number | undefined): { value: number; adjusted?: string } {
    const onDisk = this.read()
    let adjusted: string | undefined
    if (value === undefined) delete onDisk[id]
    else {
      const kept = clamp(id, value)
      if (kept !== value) adjusted = `${APP_KNOBS[id].about.replace(/[.:].*$/, '')}: ${value} is outside ${APP_KNOBS[id].min} to ${APP_KNOBS[id].max}, so it is ${kept}.`
      onDisk[id] = kept
    }
    this.values = onDisk
    if (this.path) {
      mkdirSync(dirname(this.path), { recursive: true })
      writeFileSync(this.path, `${JSON.stringify(onDisk, null, 2)}\n`, 'utf8')
    }
    return { value: this.get(id), ...(adjusted ? { adjusted } : {}) }
  }
}

function clamp(id: AppKnobId, value: number): number {
  const def = APP_KNOBS[id]
  return Math.min(def.max, Math.max(def.min, value))
}
