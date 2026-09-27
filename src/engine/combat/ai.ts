import { scaledDice } from '../rules/character'
import {
  abilityTargets,
  actionsFor,
  breakFree,
  canUse,
  defenceOf,
  distance,
  fill,
  inRange,
  momentum,
  settle,
  standing,
  stepMove,
  strike,
  tryFlee,
  useAbility,
  useRemedy,
  type Arena,
} from './combat'
import type { Combat, FightAbility, FightAttack, Fighter, Line } from './types'

// Tactics without tokens (FO, chapter 12, "Tactiek van gezellen en vijanden"):
// a small utility that weighs targets, own hit points, conditions and morale.
// Foes use it on their turn; the balance test lets it play the player too.

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function avg(dice: string): number {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(dice)
  if (!m) return Number(dice) || 0
  return (Number(m[1]) * (Number(m[2]) + 1)) / 2 + Number(m[3] ?? 0)
}

function hitChance(bonus: number, defence: number): number {
  return Math.min(0.95, Math.max(0.05, (21 + bonus - defence) / 20))
}

/** Morale (FO, chapter 12): below the threshold they run or give up. */
export function broken(combat: Combat, f: Fighter): boolean {
  if (f.morale.never) return false
  const ratio = f.hp / f.maxHp
  if (f.morale.fleesBelow !== undefined && ratio < f.morale.fleesBelow) return true
  const fallen = combat.fighters.some((x) => x.side === f.side && ['dead', 'unconscious', 'fled', 'surrendered'].includes(x.state))
  if (fallen && standing(combat, f.side).length === 1 && ratio < 0.75 && f.morale.courage <= 0) return true
  if ((f.conditions['frightened'] ?? 0) >= 2 && ratio < 0.75 && f.morale.courage < 2) return true
  return false
}

function pickTarget(combat: Combat, f: Fighter, targets: Fighter[]): Fighter {
  const marked = targets.find((t) => t.id === f.quarry)
  if (marked) return marked
  return [...targets].sort((a, b) => distance(f, a) - distance(f, b) || a.hp - b.hp)[0]!
}

function attackInRange(f: Fighter, target: Fighter): FightAttack | undefined {
  return f.attacks.find((a) => (a.kind === 'melee' ? distance(f, target) === 0 : a.range === 'far' || distance(f, target) <= 1))
}

/** A foe's turn: morale first, then the best thing to do with each action. */
export function foeTurn(arena: Arena, combat: Combat, f: Fighter, lines: Line[]): void {
  let actions = actionsFor(f)
  if (!f.fleeing && broken(combat, f)) {
    const cornered = f.conditions['grabbed'] || f.conditions['prone'] || f.conditions['slowed']
    const engaged = standing(combat, 'party').some((p) => distance(p, f) === 0)
    if (f.morale.surrenders && (cornered || (engaged && arena.rng.next('combat') < 0.35))) {
      f.state = 'surrendered'
      lines.push({ kind: 'narration', text: fill(f.says.surrender, f) ?? `${cap(f.name)} gives up.` })
      return
    }
    f.fleeing = true
    lines.push({ kind: 'narration', text: `${cap(f.name)} turns to run.` })
  }
  while (actions > 0 && !settle(combat)) {
    if (f.conditions['prone']) {
      delete f.conditions['prone']
      actions--
      lines.push({ kind: 'narration', text: `${cap(f.name)} gets up.` })
      continue
    }
    if (f.fleeing) {
      if (f.conditions['grabbed']) breakFree(arena, combat, f, lines)
      else stepMove(arena, combat, f, 'back', lines, true)
      actions--
      continue
    }
    const targets = standing(combat, 'party')
    if (targets.length === 0) return
    const target = pickTarget(combat, f, targets)
    const ability = f.abilities.find((a) => canUse(f, a) && a.actions <= actions && abilityTargets(combat, f, a).length > 0)
    if (ability && f.strikes === 0 && arena.rng.next('combat') < 0.5) {
      lines.push(...useAbility(arena, combat, f, ability))
      actions -= ability.actions
      continue
    }
    const attack = attackInRange(f, target)
    if (attack) {
      if (f.strikes >= 2 && hitChance(attack.bonus - 10, defenceOf(arena, combat, target, f, attack.kind === 'ranged')) < 0.3) break
      lines.push(...strike(arena, combat, f, target, {}, f.attacks.indexOf(attack)))
      actions--
      continue
    }
    if (f.conditions['grabbed']) breakFree(arena, combat, f, lines)
    else if (!stepMove(arena, combat, f, 'forward', lines)) break
    actions--
  }
}

// ---------------------------------------------------------------- the automatic player

function abilityValue(arena: Arena, combat: Combat, f: Fighter, a: FightAbility): number {
  const targets = abilityTargets(combat, f, a)
  if (targets.length === 0) return 0
  let value = 0
  for (const step of a.do) {
    for (const t of targets) {
      if ('strike' in step && t.side !== f.side) {
        const attack = f.attacks[0]
        if (!attack) continue
        const map = f.strikes === 0 ? 0 : f.strikes === 1 ? 5 : 10
        value += hitChance(attack.bonus + step.strike.bonus - map + momentum(arena, combat), defenceOf(arena, combat, t, f, attack.kind === 'ranged')) * (avg(attack.dice) + (step.strike.damage ? avg(step.strike.damage) : 0))
      } else if ('damage' in step && t.side !== f.side) value += avg(scaledDice(step.damage.dice, f.level, a.from)) * 0.6
      else if ('condition' in step && t.side !== f.side && !t.conditions[step.condition.name] && !t.immune.includes(step.condition.name)) {
        value += { slowed: 5, grabbed: 3, frightened: 3, blinded: 4, off_guard: 2, prone: 2, sickened: 2 }[step.condition.name] ?? 1
      }
    }
  }
  return value / a.actions
}

function strikeValue(arena: Arena, combat: Combat, f: Fighter, target: Fighter): number {
  const attack = attackInRange(f, target)
  if (!attack) return 0
  const map = f.strikes === 0 ? 0 : f.strikes === 1 ? 5 : 10
  return hitChance(attack.bonus - map + momentum(arena, combat), defenceOf(arena, combat, target, f, attack.kind === 'ranged')) * avg(attack.dice)
}

/**
 * The player's turn played by the utility (the balance test, and companions
 * later): heal when low, run when it is hopeless, otherwise the action that
 * does the most harm, and a raised shield with what is left.
 */
export function autoTurn(arena: Arena, combat: Combat, f: Fighter, lines: Line[], opts: { fleeDc?: number } = {}): void {
  let actions = actionsFor(f)
  while (actions > 0 && !settle(combat)) {
    const foes = standing(combat, 'foes')
    if (foes.length === 0) return
    if (f.hp < f.maxHp * 0.4) {
      const healing = f.abilities.find((a) => canUse(f, a) && a.actions <= actions && a.do.some((s) => 'heal' in s) && a.target !== 'enemy' && a.target !== 'enemies')
      if (healing) {
        lines.push(...useAbility(arena, combat, f, healing, f))
        actions -= healing.actions
        continue
      }
      if (arena.items && arena.items.count('herbs') > 0 && useRemedy(arena, combat, f, 'herbs', lines)) {
        actions--
        continue
      }
      const foeHp = foes.reduce((s, x) => s + x.hp, 0)
      const foeMax = foes.reduce((s, x) => s + x.maxHp, 0)
      if (f.hp < f.maxHp * 0.2 && foeHp > foeMax * 0.5 && actions >= 2 && opts.fleeDc !== undefined) {
        actions -= 2
        if (tryFlee(arena, combat, opts.fleeDc, lines)) return
        continue
      }
    }
    if (f.conditions['prone']) {
      delete f.conditions['prone']
      actions--
      continue
    }
    // A ward on yourself before blows, and a cure for what hinders you most.
    const ward = f.abilities.find((a) => canUse(f, a) && a.actions < actions && a.target !== 'enemy' && a.target !== 'enemies' && a.do.some((s) => 'buff' in s && s.buff.to === 'defence') && !f.buffs.some((b) => b.to === 'defence'))
    if (ward) {
      lines.push(...useAbility(arena, combat, f, ward, f))
      actions -= ward.actions
      continue
    }
    const hindered = ['grabbed', 'bleeding', 'frightened', 'slowed', 'blinded'].find((c) => f.conditions[c])
    const cure = hindered && f.abilities.find((a) => canUse(f, a) && a.actions <= actions && a.target !== 'enemy' && a.target !== 'enemies' && a.do.some((s) => 'cure' in s && (s.cure.name === 'any' || s.cure.name === hindered)))
    if (cure && (hindered !== 'frightened' || (f.conditions['frightened'] ?? 0) >= 2)) {
      lines.push(...useAbility(arena, combat, f, cure, f))
      actions -= cure.actions
      continue
    }
    const target = pickTarget(combat, f, foes)
    const mark = f.abilities.find((a) => a.do.some((s) => 'mark' in s) && canUse(f, a))
    if (mark && !f.quarry && actions >= 2 && inRange(f, target, mark.range)) {
      lines.push(...useAbility(arena, combat, f, mark, target))
      actions -= mark.actions
      continue
    }
    const options = f.abilities
      .filter((a) => canUse(f, a) && a.actions <= actions && !a.do.some((s) => 'mark' in s || 'heal' in s || 'protect' in s || 'move' in s || 'buff' in s || 'cure' in s))
      .map((a) => ({ a, v: abilityValue(arena, combat, f, a) }))
      .filter((o) => o.v > 0)
      .sort((x, y) => y.v - x.v)
    const hit = strikeValue(arena, combat, f, target)
    const best = options[0]
    if (best && best.v >= hit && best.v > 0.5) {
      lines.push(...useAbility(arena, combat, f, best.a, target))
      actions -= best.a.actions
      continue
    }
    if (hit > 0) {
      if (f.strikes >= 2 && hit < 1.2) break
      lines.push(...strike(arena, combat, f, target))
      actions--
      continue
    }
    if (f.conditions['grabbed']) breakFree(arena, combat, f, lines)
    else if (!stepMove(arena, combat, f, 'forward', lines)) break
    actions--
  }
  if (actions > 0 && !settle(combat) && arena.character?.gear.shield) f.shieldUp = true
}
