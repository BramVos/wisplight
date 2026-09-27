import type { Rng } from '../rng'
import type { Attitude } from './relations'

// Checks before words (FO, chapter 9): d20 + bonus against a DC with four
// degrees of success. The bonus is the character's skill (rules/player.ts);
// these fixed bonuses are only for a world without character rules.

export type Degree = 'critical success' | 'success' | 'failure' | 'critical failure'

export interface CheckResult {
  skill: string
  roll: number
  bonus: number
  total: number
  dc: number
  degree: Degree
}

export const PLAYER_BONUS: Record<string, number> = {
  persuasion: 4,
  deception: 4,
  intimidation: 4,
  insight: 3,
}

const ATTITUDE_DC: Record<Attitude, number> = {
  Hostile: 8,
  Unfriendly: 5,
  Wary: 3,
  Neutral: 1,
  Friendly: 0,
  Warm: -2,
  Devoted: -4,
}

export function dcFor(base: number, attitude: Attitude, extra = 0): number {
  return base + ATTITUDE_DC[attitude] + extra
}

export function check(rng: Rng, skill: string, dc: number, bonus = PLAYER_BONUS[skill] ?? 0): CheckResult {
  const roll = rng.d20('checks')
  const total = roll + bonus
  const steps: Degree[] = ['critical failure', 'failure', 'success', 'critical success']
  let index = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1
  if (roll === 20) index = Math.min(3, index + 1)
  if (roll === 1) index = Math.max(0, index - 1)
  return { skill, roll, bonus, total, dc, degree: steps[index]! }
}

export function succeeded(result: CheckResult): boolean {
  return result.degree === 'success' || result.degree === 'critical success'
}

export function describeCheck(result: CheckResult): string {
  const skill = result.skill.charAt(0).toUpperCase() + result.skill.slice(1)
  return `(${skill} ${result.total} vs DC ${result.dc}: ${result.degree})`
}
