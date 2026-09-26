// Seeded random numbers (mulberry32). Each system draws from its own named
// stream, and the stream state lives in the game state, so a savegame or a
// replay produces exactly the same rolls.

export function hashString(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export class Rng {
  constructor(private readonly streams: Record<string, number>, private readonly seed: number) {}

  /** A float in [0, 1). */
  next(stream: string): number {
    let t = (this.streams[stream] ?? (this.seed ^ hashString(stream)) >>> 0) + 0x6d2b79f5
    t >>>= 0
    this.streams[stream] = t
    let r = Math.imul(t ^ (t >>> 15), t | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }

  int(stream: string, min: number, max: number): number {
    return min + Math.floor(this.next(stream) * (max - min + 1))
  }

  pick<T>(stream: string, list: readonly T[]): T | undefined {
    return list.length === 0 ? undefined : list[Math.floor(this.next(stream) * list.length)]
  }

  d20(stream = 'dice'): number {
    return this.int(stream, 1, 20)
  }
}
