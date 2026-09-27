import { remedyItem } from '../items'
import type { Content } from '../content'
import { Rng } from '../rng'
import { autoLevelChoice, createCharacter, levelUp, rulesOf, suggestChoice, xpForLevel, type Character } from '../rules/character'
import { creatureFighter } from './combat'
import { beginFight, runOthers } from './flow'
import type { Combat } from './types'

// The balance test (roadmap M5): many fights per class across levels 1 to 10
// against standard encounters, played by the same utility the foes use. The
// margins it must stay within are agreed in the FO, chapter 12.

/** Experience for a foe by its level against the player's (after Pathfinder 2e). */
export function foeXp(foeLevel: number, playerLevel: number): number {
  const diff = Math.max(-4, Math.min(4, foeLevel - playerLevel))
  return { '-4': 10, '-3': 15, '-2': 20, '-1': 30, '0': 40, '1': 60, '2': 80, '3': 120, '4': 160 }[String(diff)]!
}

/** A standard encounter for one character alone: about 40 experience of foes (one of its own level). */
export const STANDARD_BUDGET = 40

export const MARGINS = {
  /** Share of standard fights the character wins (foes dead, fled or given up), per class. */
  win: [0.75, 1] as [number, number],
  /** Share of standard fights that end in death, per class. */
  death: 0.08,
  /** No class wins more than this many points above or below the average of all classes. */
  spread: 0.12,
  /** Average rounds per fight. */
  rounds: [2, 7] as [number, number],
}

/** A character of a class at a level, levelled by the template. */
export function characterAt(content: Content, klass: string, level: number): Character {
  const made = createCharacter(content, suggestChoice(content, klass))
  if ('problems' in made) throw new Error(made.problems.join(' '))
  const c = made.character
  while (c.level < level) {
    c.xp = xpForLevel(content, c.level + 1)
    const result = levelUp(content, c, autoLevelChoice(content, c))
    if ('problems' in result) throw new Error(`${klass} to level ${c.level + 1}: ${result.problems.join(' ')}`)
  }
  return c
}

export interface FoeGroup {
  creature: string
  count: number
  /** Levels of elite strength added (for high levels, where the bestiary runs out). */
  elite: number
}

/**
 * The standard groups for a level, each worth about 40 experience: one foe of
 * the same level, or two foes two levels lower. Where the bestiary has nothing
 * that strong, a creature is made stronger of its kind (elite).
 */
export function standardGroups(content: Content, level: number): FoeGroup[] {
  const groups: FoeGroup[] = []
  for (const c of content.creatures.values()) {
    if (c.attacks.length === 0) continue
    const single = level - c.level
    if (single >= 0 && single <= 4) groups.push({ creature: c.id, count: 1, elite: single })
    const pair = level - 2 - c.level
    if (pair >= 0 && pair <= 4) groups.push({ creature: c.id, count: 2, elite: pair })
  }
  return groups
}

export interface FightResult {
  outcome: Combat['over'] | 'dead'
  rounds: number
  hpLeft: number
}

/** One fight played out by the utility, start to end. */
export function simulateFight(content: Content, character: Character, group: FoeGroup, seed: number): FightResult {
  const rng = new Rng({}, seed)
  const c: Character = JSON.parse(JSON.stringify(character)) as Character
  const remedy = remedyItem(content)
  // What the class carries of the remedy, or one.
  const herbs = { count: (remedy && content.rules?.classes.find((k) => k.id === c.class)?.gear[remedy]) || 1 }
  const arena = { content, rng, character: c, items: { count: (id: string) => (id === remedy ? herbs.count : 0), take: () => void herbs.count-- }, where: { outdoors: true } }
  const { combat } = beginFight(arena, { id: 'sim', place: 'sim', foes: [{ creature: group.creature, count: group.count, range: 'near' }], now: 0 })
  if (group.elite) {
    for (const f of combat.fighters) {
      if (f.side !== 'foes') continue
      const base = creatureFighter(content, group.creature, f.id, f.name, f.pos)
      const n = group.elite
      f.level = base.level + n
      // A stronger one of its kind: +1 to its numbers and a fifth more hit points for every level added.
      f.maxHp = f.hp = Math.round(base.maxHp * (1 + 0.2 * n))
      f.defence = base.defence + n
      f.saves = { fortitude: base.saves.fortitude + n, reflex: base.saves.reflex + n, will: base.saves.will + n }
      f.attacks = base.attacks.map((a) => ({ ...a, bonus: a.bonus + n, dice: addBonus(a.dice, n) }))
      f.abilities = f.abilities.map((a) => ({ ...a, dc: a.dc + n }))
    }
  }
  runOthers(arena, combat, true, 15)
  const player = combat.fighters.find((f) => f.id === 'player')!
  return { outcome: player.state === 'dead' ? 'dead' : combat.over, rounds: combat.round, hpLeft: player.hp / player.maxHp }
}

function addBonus(dice: string, n: number): string {
  const m = /^(\d+d\d+)([+-]\d+)?$/.exec(dice)
  if (!m) return String((Number(dice) || 0) + n)
  const b = Number(m[2] ?? 0) + n
  return `${m[1]}${b > 0 ? `+${b}` : b < 0 ? b : ''}`
}

export interface ClassReport {
  class: string
  fights: number
  win: number
  fled: number
  lost: number
  death: number
  rounds: number
  byLevel: { level: number; win: number; death: number }[]
}

/** Fights per class, spread evenly over levels 1 to 10 and over the standard groups of each level. */
export function balanceReport(content: Content, fightsPerClass = 1000, seed = 1): ClassReport[] {
  const reports: ClassReport[] = []
  for (const k of rulesOf(content).classes) {
    const perLevel = Math.ceil(fightsPerClass / 10)
    const totals = { win: 0, fled: 0, lost: 0, death: 0, rounds: 0, fights: 0 }
    const byLevel: ClassReport['byLevel'] = []
    for (let level = 1; level <= 10; level++) {
      const character = characterAt(content, k.id, level)
      const groups = standardGroups(content, level)
      let win = 0
      let death = 0
      for (let i = 0; i < perLevel; i++) {
        const group = groups[i % groups.length]!
        const r = simulateFight(content, character, group, seed * 100_003 + level * 10_007 + i * 7 + k.id.length)
        totals.fights++
        totals.rounds += r.rounds
        if (r.outcome === 'won') {
          win++
          totals.win++
        } else if (r.outcome === 'fled') totals.fled++
        else if (r.outcome === 'dead') {
          death++
          totals.death++
          totals.lost++
        } else totals.lost++
      }
      byLevel.push({ level, win: win / perLevel, death: death / perLevel })
    }
    reports.push({
      class: k.id,
      fights: totals.fights,
      win: totals.win / totals.fights,
      fled: totals.fled / totals.fights,
      lost: totals.lost / totals.fights,
      death: totals.death / totals.fights,
      rounds: totals.rounds / totals.fights,
      byLevel,
    })
  }
  return reports
}

/** The margins the report must stay within; an empty list means it does. */
export function marginProblems(reports: ClassReport[]): string[] {
  const problems: string[] = []
  const average = reports.reduce((s, r) => s + r.win, 0) / reports.length
  for (const r of reports) {
    const pct = (x: number) => `${Math.round(x * 100)}%`
    if (r.win < MARGINS.win[0] || r.win > MARGINS.win[1]) problems.push(`${r.class}: wins ${pct(r.win)}, outside ${pct(MARGINS.win[0])}-${pct(MARGINS.win[1])}`)
    if (r.death > MARGINS.death) problems.push(`${r.class}: dies in ${pct(r.death)} of fights, more than ${pct(MARGINS.death)}`)
    if (Math.abs(r.win - average) > MARGINS.spread) problems.push(`${r.class}: wins ${pct(r.win)} against an average of ${pct(average)}`)
    if (r.rounds < MARGINS.rounds[0] || r.rounds > MARGINS.rounds[1]) problems.push(`${r.class}: ${r.rounds.toFixed(1)} rounds a fight`)
  }
  return problems
}
