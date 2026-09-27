import type { Content } from './content'
import type { LogEntry } from './engine'
import type { WorldEvent } from './state'

// Checkpoints (M9.3; review of 27 September 2026 on saving). A save used to
// copy the whole state and the whole log, and then write that copy out again.
// Now a save is the last checkpoint plus what the log recorded since: the
// state and the log are turned into text once, when a checkpoint is taken,
// and an autosave in between writes only the few entries since. Loading plays
// those entries again on the checkpoint, with the recorded model replies, so
// the game is exactly where it was.

/** A new checkpoint when so many log entries came after the last one. */
export const CHECKPOINT_ENTRIES = 400
/** Or when so much game time went by (minutes). */
export const CHECKPOINT_MINUTES = 24 * 60

export interface Checkpoint {
  world: string
  /** The version of the world's content it was taken with. */
  content: string
  seed: number
  /** Game time of the checkpoint. */
  minutes: number
  /** How many log entries it covers. */
  at: number
  /** The state and the log up to here, as text: written once, when it is taken. */
  state: string
  log: string
}

/** A save for the store: a checkpoint and what happened since. */
export interface CheckpointedSave {
  version: 2
  world: string
  content: string
  seed: number
  /** Game time of the save itself. */
  minutes: number
  checkpoint: Checkpoint
  tail: LogEntry[]
  /** The world events of the moment, for looking into a save without playing it. */
  events: WorldEvent[]
  session?: { game: string; branch: number; logId: number }
}

const versions = new WeakMap<Content, string>()

/**
 * A short fingerprint of a world's content, as written: two saves with the same
 * version were played on the same content, so playing a log again gives the
 * same world. Worked out once per loaded content.
 */
export function contentVersion(content: Content): string {
  const known = versions.get(content)
  if (known) return known
  // Two FNV-1a hashes over a canonical walk: maps and object keys in sorted order.
  let a = 2166136261
  let b = 0x811c9dc5 ^ 0x5bd1e995
  const feed = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i)
      a = Math.imul(a ^ c, 16777619)
      b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 13)
    }
  }
  const path = new Set<unknown>()
  const walk = (value: unknown): void => {
    if (value === null || value === undefined) return feed('~')
    if (typeof value !== 'object') return feed(`${typeof value}:${String(value)};`)
    if (path.has(value)) return feed('^')
    path.add(value)
    if (value instanceof Map) {
      feed('M{')
      for (const [key, item] of [...value.entries()].map(([k, v]) => [String(k), v] as const).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0))) {
        feed(`${key}=`)
        walk(item)
      }
      feed('}')
    } else if (value instanceof Set) {
      feed(`S[${[...value].map(String).sort().join(',')}]`)
    } else if (Array.isArray(value)) {
      feed('[')
      for (const item of value) walk(item)
      feed(']')
    } else {
      feed('{')
      for (const key of Object.keys(value).sort()) {
        feed(`${key}:`)
        walk((value as Record<string, unknown>)[key])
      }
      feed('}')
    }
    path.delete(value)
  }
  walk(content)
  const version = `${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`
  versions.set(content, version)
  return version
}
