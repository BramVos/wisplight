import type { Content } from '../content'
import type { Character } from './character'

// The blessings that are more than a bonus (Wereldboek, chapter 5; M7.2):
// once a day, once a week, once a season or once ever. The engine asks here
// whether the character has one, and whether it can be used now.

const DAY = 24 * 60

export function blessed(content: Content, c: Character | undefined, name: string): boolean {
  if (!c?.patron) return false
  const patron = content.rules?.patrons.find((p) => p.id === c.patron!.id)
  return Boolean(patron?.blessings.some((b) => b.name === name && c.patron!.favour >= b.at))
}

/**
 * Uses a blessing that comes back after a while: true when it may be used now,
 * and then it is marked as used. `every` in minutes; Infinity for once ever.
 */
export function useBlessing(content: Content, c: Character | undefined, name: string, now: number, every: number): boolean {
  if (!c || !blessed(content, c, name)) return false
  const used = (c.blessingsUsed ??= {})
  const last = used[name]
  if (last !== undefined && (every === Infinity || now - last < every)) return false
  used[name] = now
  return true
}

export const ONCE = { day: DAY, week: 7 * DAY, season: 91 * DAY, ever: Infinity }
