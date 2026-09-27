import type { Content } from '../content'
import type { Rng } from '../rng'
import {
  abilitiesOf,
  classDc,
  defence as characterDefence,
  initiative as characterInitiative,
  maxHp,
  saveBonus,
  scaledDice,
  skillBonus,
  weaponStats,
  bonus as characterBonus,
  type Character,
  type Context,
} from '../rules/character'
import { SAVES, type Save, type Step } from '../rules/schema'
import type { Combat, FightAbility, FightAttack, Fighter, Line } from './types'
import { blessed, ONCE, useBlessing } from '../rules/blessings'

// The rules of a fight (FO, chapter 12). Everything here is deterministic
// given the random stream: the same fight with the same rolls ends the same.

export interface Arena {
  content: Content
  rng: Rng
  /** The player's character, for bonuses that depend on the situation. */
  character?: Character
  /** Things the player carries: remedies can be used in a fight. */
  items?: { count(id: string): number; take(id: string): void }
  /** Where the fight is: the fen, outdoors, at night. */
  where?: { fen?: boolean; outdoors?: boolean; night?: boolean }
  /** The time, for blessings that come back once a day or a week. */
  now?: number
}

const STREAM = 'combat'
export const FLED_AT = 4
/** What a raised shield takes off one blow a round (Shield Block). */
export const SHIELD_HARDNESS = 3

export function rollDice(rng: Rng, dice: string, stream = STREAM): number {
  const m = /^(\d+)d(\d+)([+-]\d+)?$/.exec(dice.trim())
  if (!m) return Number(dice) || 0
  let sum = Number(m[3] ?? 0)
  for (let i = 0; i < Number(m[1]); i++) sum += rng.int(stream, 1, Number(m[2]))
  return sum
}

/** The four degrees (FO, chapter 11): beat the DC by 10 for a critical, a natural 20 or 1 shifts one step. */
export function degreeOf(roll: number, total: number, dc: number): 0 | 1 | 2 | 3 {
  let d = total >= dc + 10 ? 3 : total >= dc ? 2 : total <= dc - 10 ? 0 : 1
  if (roll === 20) d = Math.min(3, d + 1)
  if (roll === 1) d = Math.max(0, d - 1)
  return d as 0 | 1 | 2 | 3
}

export const DEGREE_NAMES = ['critical failure', 'failure', 'success', 'critical success']

// ---------------------------------------------------------------- fighters

export function playerFighter(content: Content, character: Character): Fighter {
  return characterFighter(content, character, { id: 'player', name: 'you', side: 'party', kind: 'player' })
}

/** A fighter from a character: the player, a companion, or an NPC with a class. */
export function characterFighter(content: Content, character: Character, who: { id: string; name: string; side: 'party' | 'foes'; kind: 'player' | 'npc'; npc?: string }): Fighter {
  const weapon = weaponStats(content, character)
  const dc = classDc(content, character)
  const abilities: FightAbility[] = abilitiesOf(content, character).map((a) => ({ ...a, dc, used: 0 }))
  const ranged = weapon.kind === 'ranged' || ['conjurer', 'herbalist', 'poacher'].includes(character.class)
  return {
    id: who.id,
    name: who.name,
    side: who.side,
    kind: who.kind,
    ...(who.npc ? { npc: who.npc, sheet: character } : {}),
    level: character.level,
    hp: Math.max(1, character.hp),
    maxHp: maxHp(content, character),
    defence: characterDefence(content, character),
    saves: Object.fromEntries(SAVES.map((s) => [s, saveBonus(content, character, s)])) as Record<Save, number>,
    perception: characterInitiative(content, character),
    attacks: [
      {
        name: weapon.name,
        bonus: weapon.attack,
        dice: `${weapon.dice.count}d${weapon.dice.sides}${weapon.damage ? (weapon.damage > 0 ? `+${weapon.damage}` : `${weapon.damage}`) : ''}`,
        kind: weapon.kind === 'ranged' ? 'ranged' : 'melee',
        ...(weapon.crit !== 'none' ? { crit: weapon.crit } : {}),
        iron: weapon.iron,
        range: weapon.range,
      },
    ],
    abilities,
    conditions: Object.fromEntries(Object.entries(character.conditions).filter(([c]) => c === 'sickened' || c === 'cursed')),
    timers: {},
    buffs: [],
    pos: who.side === 'party' && who.id !== 'player' && ranged ? 1 : 0,
    row: who.side === 'party' && who.id !== 'player' && ranged ? 'back' : 'front',
    state: 'up',
    morale: { courage: 3, surrenders: true, never: false },
    immune: [],
    weak: {},
    initiative: 0,
    strikes: 0,
    says: {},
  }
}

export function creatureFighter(content: Content, creatureId: string, id: string, name: string, pos: number, joinsAt?: number): Fighter {
  const c = content.creatures.get(creatureId)
  if (!c) throw new Error(`Unknown creature ${creatureId}`)
  const save = (s: Save) => c.saves[s] ?? c.level + 3
  return {
    id,
    name,
    side: 'foes',
    kind: c.kind,
    creature: c.id,
    level: c.level,
    hp: c.hp,
    maxHp: c.hp,
    defence: c.defence,
    saves: { fortitude: save('fortitude'), reflex: save('reflex'), will: save('will') },
    perception: c.perception ?? c.level + 4,
    attacks: c.attacks.map((a) => ({
      name: a.name,
      bonus: a.bonus,
      dice: a.damage,
      kind: a.kind,
      ...(a.crit ? { crit: a.crit } : {}),
      ...(a.effect ? { effect: { condition: a.effect.condition, value: a.effect.value, save: a.effect.save, dc: a.effect.dc } } : {}),
      range: a.kind === 'ranged' ? 'far' : 'near',
    })),
    abilities: c.abilities.map((a) => ({ ...a, dc: a.dc ?? 10 + c.level + 5, from: c.level, used: 0 })),
    conditions: {},
    timers: {},
    buffs: [],
    pos,
    row: 'front',
    state: joinsAt ? 'waiting' : 'up',
    ...(joinsAt ? { joinsAt } : {}),
    morale: { courage: c.morale.courage, ...(c.morale.flees_below !== undefined ? { fleesBelow: c.morale.flees_below } : {}), surrenders: c.morale.surrenders, never: c.morale.never },
    immune: c.immune,
    weak: c.weak,
    initiative: 0,
    strikes: 0,
    says: c.says,
  }
}

/** Names for a group: "the Goat-Rider", or "the first Goat-Rider" and "the second Goat-Rider". */
export function foeNames(content: Content, list: { creature: string; count: number }[]): string[] {
  const ORD = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth']
  const totals: Record<string, number> = {}
  for (const f of list) totals[f.creature] = (totals[f.creature] ?? 0) + f.count
  const seen: Record<string, number> = {}
  const names: string[] = []
  for (const f of list) {
    const c = content.creatures.get(f.creature)!
    const article = /^the\s/i.test(c.name) || (/^[A-Z]/.test(c.name) && !c.plural) ? '' : 'the '
    const bare = c.name.replace(/^the\s+/i, '')
    for (let i = 0; i < f.count; i++) {
      const n = (seen[f.creature] = (seen[f.creature] ?? 0) + 1)
      names.push(totals[f.creature]! > 1 ? `the ${ORD[n - 1] ?? `${n}th`} ${bare}` : `${article}${c.name}`)
    }
  }
  return names
}

// ---------------------------------------------------------------- the fight

export function distance(a: Fighter, b: Fighter): number {
  return Math.abs(a.pos - b.pos)
}

export function inRange(a: Fighter, b: Fighter, range: 'engaged' | 'near' | 'far'): boolean {
  const d = distance(a, b)
  return range === 'engaged' ? d === 0 : range === 'near' ? d <= 1 : true
}

export const active = (f: Fighter) => f.state === 'up'
export const standing = (combat: Combat, side: 'party' | 'foes') => combat.fighters.filter((f) => f.side === side && active(f))

export function fighter(combat: Combat, id: string): Fighter {
  return combat.fighters.find((f) => f.id === id)!
}

export function momentum(arena: Arena, combat: Combat): number {
  const bonus = arena.character ? characterBonus(arena.content, arena.character, 'momentum') : 0
  return Math.max(0, Math.min(4, combat.round - combat.momentumFrom)) + bonus
}

function penalty(f: Fighter): number {
  return (f.conditions['frightened'] ?? 0) + (f.conditions['sickened'] ? 1 : 0)
}

function buff(f: Fighter, to: 'attack' | 'defence' | 'damage'): number {
  return f.buffs.filter((b) => b.to === to).reduce((s, b) => s + b.value, 0)
}

function contextFor(arena: Arena, combat: Combat, f: Fighter, target: Fighter | undefined, melee: boolean): Context {
  return {
    melee,
    ranged: !melee,
    quarry: Boolean(target && f.quarry === target.id),
    vs_spirit: Boolean(target && (target.kind === 'spirit' || target.kind === 'undead')),
    first_round: combat.round === 1,
    front: f.row === 'front',
    shield: Boolean(f.shieldUp),
    ...(arena.where ?? {}),
  }
}

/** The defence of a fighter against an attacker: armour, shield, cover and conditions. */
export function defenceOf(arena: Arena, combat: Combat, target: Fighter, attacker: Fighter | undefined, ranged: boolean): number {
  let d = target.defence
  if (target.id === 'player' && arena.character) {
    d = characterDefence(arena.content, arena.character, { ...contextFor(arena, combat, target, attacker, !ranged), shield: Boolean(target.shieldUp), ranged, vs_spirit: Boolean(attacker && (attacker.kind === 'spirit' || attacker.kind === 'undead')) })
  } else if (target.shieldUp) d += 2
  if (ranged && target.cover) d += 2
  if (target.conditions['off_guard'] || target.conditions['prone'] || target.conditions['grabbed']) d -= 2
  if (target.fleeing) d += 1
  return d + buff(target, 'defence') - (target.conditions['frightened'] ?? 0)
}

function attackBonus(arena: Arena, combat: Combat, f: Fighter, attack: FightAttack, target: Fighter): { bonus: number; damage: string } {
  let bonus = attack.bonus
  let dice = attack.dice
  if (f.id === 'player' && arena.character) {
    const ctx = contextFor(arena, combat, f, target, attack.kind === 'melee')
    const w = weaponStats(arena.content, { ...arena.character, conditions: {} }, ctx)
    bonus = w.attack
    dice = `${w.dice.count}d${w.dice.sides}${w.damage ? (w.damage > 0 ? `+${w.damage}` : `${w.damage}`) : ''}`
  }
  if (f.side === 'party') bonus += momentum(arena, combat)
  bonus += buff(f, 'attack') - penalty(f)
  if (f.conditions['prone'] || f.conditions['grabbed']) bonus -= 2
  if (f.conditions['blinded']) bonus -= 4
  if (combat.subdue && f.id === 'player') bonus -= 2
  if (f.recalled?.includes(target.creature ?? '')) bonus += 1
  const light = f.id === 'player' && arena.character ? weaponStats(arena.content, arena.character).light : false
  const map = f.strikes === 0 ? 0 : f.strikes === 1 ? (light ? 4 : 5) : light ? 8 : 10
  return { bonus: bonus - map, damage: dice }
}

function savingThrow(arena: Arena, target: Fighter, save: Save, dc: number): { roll: number; total: number; degree: 0 | 1 | 2 | 3 } {
  const roll = arena.rng.int(STREAM, 1, 20)
  const total = roll + target.saves[save] - penalty(target)
  return { roll, total, degree: degreeOf(roll, total, dc) }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const theName = (f: Fighter) => f.name
const verbS = (f: Fighter, you: string, other: string) => (f.id === 'player' ? you : other)

// ---------------------------------------------------------------- harm

function hurt(arena: Arena, combat: Combat, target: Fighter, amount: number, lines: Line[], crit = false, source?: Fighter): void {
  if (amount <= 0 || target.state === 'dead') return
  // Protect: an ally beside you takes the blow (Shield Wall, Shelter).
  const guard = combat.fighters.find((g) => g.id !== target.id && g.side === target.side && active(g) && g.protecting === target.id && !g.reactionUsed && distance(g, target) === 0)
  if (guard && target.state === 'up') {
    guard.reactionUsed = true
    lines.push({ kind: 'narration', text: `${cap(guard.name)} ${verbS(guard, 'step', 'steps')} in and ${verbS(guard, 'take', 'takes')} the blow meant for ${target.name}.` })
    target = guard
  }
  // Shield Block: a raised shield soaks some of it.
  if (target.shieldUp && !target.reactionUsed && target.state === 'up') {
    target.reactionUsed = true
    const soak = Math.min(amount, SHIELD_HARDNESS)
    amount -= soak
    lines.push({ kind: 'narration', text: `${cap(target.name)} ${verbS(target, 'catch', 'catches')} it on the shield (${soak} less).` })
  }
  if (target.state === 'dying') {
    target.dying = Math.min(4, (target.dying ?? 1) + (crit ? 2 : 1))
    if (target.dying >= 4) die(combat, target, lines)
    return
  }
  target.hp -= amount
  if (target.hp > 0) return
  target.hp = 0
  if (target.side === 'party') {
    target.state = 'dying'
    target.dying = crit ? 2 : 1
    lines.push({ kind: 'narration', text: target.id === 'player' ? 'You go down. The world tilts, and the mud comes up to meet you.' : `${cap(target.name)} goes down.` })
    lines.push({ kind: 'system', text: target.id === 'player' ? `You are dying (${target.dying} of 4).` : `${cap(target.name)} is dying (${target.dying} of 4).` })
    return
  }
  if ((combat.subdue && source?.side === 'party' && target.kind !== 'spirit' && target.kind !== 'undead') || (target.kind === 'npc' && combat.subdue)) {
    target.state = 'unconscious'
    lines.push({ kind: 'narration', text: `${cap(target.name)} crumples, senseless but alive.` })
  } else {
    target.state = 'dead'
    lines.push({ kind: 'narration', text: fill(target.says.down, target) ?? `${cap(target.name)} falls and does not get up.` })
  }
  for (const other of standing(combat, target.side)) other.conditions['shaken'] = 1
}

function die(combat: Combat, target: Fighter, lines: Line[]): void {
  target.state = 'dead'
  target.hp = 0
  lines.push({ kind: 'narration', text: target.id === 'player' ? 'The cold comes up out of the ground and takes you.' : `${cap(target.name)} is dead.` })
  void combat
}

export function fill(template: string | undefined, f: Fighter, target?: Fighter): string | undefined {
  if (!template) return undefined
  return template
    .replace(/\{target\}/g, target ? (target.id === 'player' ? 'you' : target.name) : 'you')
    .replace(/\{Name\}/g, cap(f.name))
    .replace(/\{name\}/g, f.name)
}

function applyCondition(arena: Arena, target: Fighter, name: string, value: number, rounds: number | undefined, lines: Line[]): void {
  if (target.immune.includes(name) || target.state !== 'up') return
  if (name === 'fen_fever' && arena.character && target.id === 'player') {
    const immune = arena.content.rules?.ancestries.find((a) => a.id === arena.character!.ancestry)?.immune ?? []
    if (immune.includes(name)) return
  }
  const before = target.conditions[name] ?? 0
  target.conditions[name] = Math.max(before, value)
  if (rounds) target.timers[name] = Math.max(target.timers[name] ?? 0, rounds)
  const label = arena.content.rules?.conditions.find((c) => c.id === name)?.name ?? name
  const shown = ['frightened', 'bleeding'].includes(name) ? `${label} ${target.conditions[name]}` : label
  lines.push({ kind: 'system', text: `${cap(target.name)} ${verbS(target, 'are', 'is')} ${shown}.` })
}

// ---------------------------------------------------------------- attacks

/** One strike: the attack roll, the damage, and on a critical the weapon's effect. */
export function strike(arena: Arena, combat: Combat, f: Fighter, target: Fighter, extra: { bonus?: number; dice?: string } = {}, attackIndex = 0): Line[] {
  const lines: Line[] = []
  const attack = f.attacks[attackIndex] ?? f.attacks[0]
  if (!attack) return [{ kind: 'system', text: `${cap(f.name)} has nothing to strike with.` }]
  const { bonus, damage } = attackBonus(arena, combat, f, attack, target)
  const roll = arena.rng.int(STREAM, 1, 20)
  const total = roll + bonus + (extra.bonus ?? 0)
  const dc = defenceOf(arena, combat, target, f, attack.kind === 'ranged')
  const degree = degreeOf(roll, total, dc)
  f.strikes++
  const who = f.id === 'player' ? 'You' : cap(f.name)
  lines.push({ kind: 'check', text: `(${who === 'You' ? 'Your' : `${who}'s`} ${attack.name} ${total} vs defence ${dc}: ${degree >= 2 ? (degree === 3 ? 'critical hit' : 'hit') : 'miss'})` })
  if (degree < 2) {
    if (f.side === 'foes') lines.push({ kind: 'narration', text: `${fill(f.says.hit, f, target) ?? `${cap(f.name)} attacks ${target.id === 'player' ? 'you' : target.name}.`} It misses.` })
    return lines
  }
  let amount = rollDice(arena.rng, damage) + (extra.dice ? rollDice(arena.rng, extra.dice) : 0) + buff(f, 'damage')
  if (combat.subdue && f.id === 'player') amount = Math.max(1, amount)
  if (degree === 3) amount *= 2
  if (attack.iron && target.weak['iron']) amount = Math.round(amount * target.weak['iron'])
  amount = Math.max(1, amount)
  if (f.side === 'foes') lines.push({ kind: 'narration', text: `${fill(f.says.hit, f, target) ?? `${cap(f.name)} hits ${target.id === 'player' ? 'you' : target.name}.`} ${amount} damage.` })
  else lines.push({ kind: 'narration', text: `You hit ${target.name}${degree === 3 ? ' hard' : ''}: ${amount} damage.` })
  const crit = degree === 3
  if (crit && attack.crit && target.state === 'up') {
    if (attack.crit === 'push') {
      target.pos += target.side === 'foes' ? -1 : 1
      delete target.conditions['grabbed']
      delete target.timers['grabbed']
      lines.push({ kind: 'narration', text: `${cap(target.name)} ${verbS(target, 'are', 'is')} driven back.` })
    } else applyCondition(arena, target, attack.crit, attack.crit === 'bleeding' ? 2 : 1, attack.crit === 'blinded' ? 1 : undefined, lines)
  }
  hurt(arena, combat, target, amount, lines, crit, f)
  if (attack.effect && target.state === 'up') {
    const s = savingThrow(arena, target, attack.effect.save, attack.effect.dc)
    if (s.degree <= 1) applyCondition(arena, target, attack.effect.condition, attack.effect.value + (s.degree === 0 ? 1 : 0), undefined, lines)
  }
  return lines
}

// ---------------------------------------------------------------- abilities

export function abilityTargets(combat: Combat, f: Fighter, ability: FightAbility, chosen?: Fighter): Fighter[] {
  const enemies = combat.fighters.filter((x) => x.side !== f.side && active(x) && inRange(f, x, ability.range))
  const allies = combat.fighters.filter((x) => x.side === f.side && (active(x) || x.state === 'dying') && inRange(f, x, ability.range === 'engaged' ? 'engaged' : ability.range))
  switch (ability.target) {
    case 'self':
      return [f]
    case 'enemy':
      return chosen && enemies.includes(chosen) ? [chosen] : enemies.slice(0, 1)
    case 'enemies':
      return enemies
    case 'ally':
      return chosen && allies.includes(chosen) ? [chosen] : allies.slice(0, 1)
    case 'allies':
      return allies
  }
}

function healBonus(arena: Arena, f: Fighter): number {
  return f.id === 'player' && arena.character ? characterBonus(arena.content, arena.character, 'heal') : 0
}

export function heal(target: Fighter, amount: number, lines: Line[]): void {
  if (target.state === 'dying') {
    target.state = 'up'
    target.dying = 0
    lines.push({ kind: 'narration', text: `${cap(target.name)} ${verbS(target, 'come', 'comes')} round.` })
  }
  const before = target.hp
  target.hp = Math.min(target.maxHp, target.hp + amount)
  lines.push({ kind: 'narration', text: `${cap(target.name)} ${verbS(target, 'heal', 'heals')} ${target.hp - before} hit points.` })
}

const CURE_ORDER = ['bleeding', 'grabbed', 'frightened', 'blinded', 'sickened', 'slowed', 'off_guard', 'prone']

function runStep(arena: Arena, combat: Combat, f: Fighter, ability: FightAbility, step: Step, target: Fighter, lines: Line[]): void {
  if ('strike' in step) {
    if (target.state !== 'up') return
    lines.push(...strike(arena, combat, f, target, { bonus: step.strike.bonus, ...(step.strike.damage ? { dice: step.strike.damage } : {}) }))
  } else if ('damage' in step) {
    if (target.state !== 'up') return
    const dice = scaledDice(step.damage.dice, f.level, ability.from)
    let amount = rollDice(arena.rng, dice)
    const spiritBonus = f.id === 'player' && arena.character && (target.kind === 'spirit' || target.kind === 'undead') ? characterBonus(arena.content, arena.character, 'damage', { vs_spirit: true }) - characterBonus(arena.content, arena.character, 'damage') : 0
    amount += spiritBonus
    if (step.damage.save) {
      const s = savingThrow(arena, target, step.damage.save, ability.dc)
      lines.push({ kind: 'check', text: `(${cap(target.name)} ${step.damage.save} ${s.total} vs DC ${ability.dc}: ${DEGREE_NAMES[s.degree]})` })
      amount = s.degree === 3 ? 0 : s.degree === 2 ? Math.floor(amount / 2) : s.degree === 0 ? amount * 2 : amount
    } else {
      const roll = arena.rng.int(STREAM, 1, 20)
      const total = roll + ability.dc - 10 + (f.side === 'party' ? momentum(arena, combat) : 0) - penalty(f)
      const dc = defenceOf(arena, combat, target, f, true)
      const d = degreeOf(roll, total, dc)
      lines.push({ kind: 'check', text: `(${ability.name} ${total} vs defence ${dc}: ${d >= 2 ? (d === 3 ? 'critical hit' : 'hit') : 'miss'})` })
      amount = d === 3 ? amount * 2 : d === 2 ? amount : 0
    }
    if (amount > 0) {
      lines.push({ kind: 'narration', text: `${cap(target.name)} ${verbS(target, 'take', 'takes')} ${amount} damage.` })
      hurt(arena, combat, target, amount, lines, false, f)
    }
  } else if ('condition' in step) {
    if (target.state !== 'up') return
    const c = step.condition
    let value = c.value
    if (c.save) {
      const dc = c.dc ?? ability.dc
      const s = savingThrow(arena, target, c.save, dc)
      lines.push({ kind: 'check', text: `(${cap(target.name)} ${c.save} ${s.total} vs DC ${dc}: ${DEGREE_NAMES[s.degree]})` })
      if (s.degree >= 2) return
      if (s.degree === 0) value += 1
    }
    applyCondition(arena, target, c.name, value, c.rounds, lines)
  } else if ('heal' in step) {
    heal(target, rollDice(arena.rng, scaledDice(step.heal.dice, f.level, ability.from)) + healBonus(arena, f), lines)
  } else if ('cure' in step) {
    const name = step.cure.name === 'any' ? CURE_ORDER.find((c) => target.conditions[c]) : step.cure.name
    if (name && target.conditions[name]) {
      delete target.conditions[name]
      delete target.timers[name]
      lines.push({ kind: 'narration', text: `${cap(target.name)} ${verbS(target, 'are', 'is')} no longer ${name.replace('_', '-')}.` })
    }
  } else if ('buff' in step) {
    target.buffs.push({ ...step.buff })
    lines.push({ kind: 'system', text: `${cap(target.name)}: +${step.buff.value} ${step.buff.to} for ${step.buff.rounds} round${step.buff.rounds === 1 ? '' : 's'}.` })
  } else if ('mark' in step) {
    f.quarry = target.id
    lines.push({ kind: 'narration', text: `${f.id === 'player' ? 'You mark' : `${cap(f.name)} marks`} ${target.name} as quarry.` })
  } else if ('protect' in step) {
    f.protecting = target.id
    lines.push({ kind: 'narration', text: `${f.id === 'player' ? 'You stand ready' : `${cap(f.name)} stands ready`} to take the blows meant for ${target.name}.` })
  } else if ('move' in step) {
    stepMove(arena, combat, f, step.move, lines, true)
  }
}

export function useAbility(arena: Arena, combat: Combat, f: Fighter, ability: FightAbility, chosen?: Fighter): Line[] {
  const targets = abilityTargets(combat, f, ability, chosen)
  if (targets.length === 0) return [{ kind: 'system', text: `There is nobody in reach for ${ability.name}.` }]
  ability.used++
  const lines: Line[] = [{ kind: 'narration', text: `${f.id === 'player' ? 'You use' : `${cap(f.name)} uses`} ${ability.name}.` }]
  for (const target of targets) for (const step of ability.do) runStep(arena, combat, f, ability, step, target, lines)
  return lines
}

export function canUse(f: Fighter, ability: FightAbility): boolean {
  return ability.uses === 'at_will' || ability.used === 0
}

// ---------------------------------------------------------------- moving

export function stepMove(arena: Arena, combat: Combat, f: Fighter, way: 'forward' | 'back', lines: Line[], quiet = false): boolean {
  if (f.conditions['grabbed']) {
    lines.push({ kind: 'system', text: `${cap(f.name)} ${verbS(f, 'are', 'is')} held fast and cannot move.` })
    return false
  }
  if (f.conditions['prone']) {
    lines.push({ kind: 'system', text: `${cap(f.name)} must get up first.` })
    return false
  }
  const toward = f.side === 'party' ? -1 : 1
  f.pos += way === 'forward' ? toward : -toward
  if (f.side === 'party') f.pos = Math.max(-2, Math.min(2, f.pos))
  if (way === 'back' && f.side === 'party') combat.momentumFrom = combat.round
  if (!quiet) {
    const foe = standing(combat, f.side === 'party' ? 'foes' : 'party')[0]
    const where = foe ? ['engaged with', 'near', 'far from'][Math.min(2, distance(f, foe))] : ''
    lines.push({ kind: 'narration', text: `${f.id === 'player' ? 'You step' : `${cap(f.name)} steps`} ${way === 'forward' ? 'in' : 'back'}${foe ? `, ${where} ${foe.name}` : ''}.` })
  }
  void arena
  return true
}

// ---------------------------------------------------------------- turns

export function rollInitiative(arena: Arena, combat: Combat, ambush = false): void {
  for (const f of combat.fighters) f.initiative = arena.rng.int(STREAM, 1, 20) + f.perception + (ambush && f.side === 'foes' ? 2 : 0)
  combat.order = [...combat.fighters].sort((a, b) => b.initiative - a.initiative || (a.side === 'party' ? -1 : 1)).map((f) => f.id)
}

/** Starts a fighter's turn: shields go down, the dying roll against death, late comers arrive. */
export function startTurn(arena: Arena, combat: Combat, f: Fighter, lines: Line[]): void {
  f.shieldUp = false
  f.cover = false
  f.strikes = 0
  f.reactionUsed = false
  if (f.protecting) delete f.protecting
  if (f.state === 'waiting' && f.joinsAt !== undefined && combat.round >= f.joinsAt) {
    f.state = 'up'
    lines.push({ kind: 'narration', text: `${cap(f.name)} comes out of the reeds and joins in.` })
  }
  if (f.state === 'dying') recoveryCheck(arena, f, lines)
  // Unbroken (Baduhenna): once a day the player shakes off fear, the mire or a grip.
  if (f.id === 'player' && f.state === 'up' && ['frightened', 'grabbed', 'mired'].some((c) => f.conditions[c]) && useBlessing(arena.content, arena.character, 'Unbroken', arena.now ?? 0, ONCE.day)) {
    for (const c of ['frightened', 'grabbed', 'mired']) delete f.conditions[c]
    lines.push({ kind: 'narration', text: 'Something old and stubborn rises in you, and you shake yourself free.' })
  }
}

/** Dying: a flat check against 10 + dying; success brings it down, failure up; at 4 you die. */
export function recoveryCheck(arena: Arena, f: Fighter, lines: Line[]): void {
  // Safe Harbour (the Lantern): once a week the player steadies without a roll.
  if (f.id === 'player' && useBlessing(arena.content, arena.character, 'Safe Harbour', arena.now ?? 0, ONCE.week)) {
    f.dying = 0
    f.state = 'unconscious'
    lines.push({ kind: 'narration', text: 'A light like a lantern in a window, far off, and your breathing steadies. You will live.' })
    return
  }
  const dying = f.dying ?? 1
  const roll = arena.rng.int(STREAM, 1, 20)
  const d = degreeOf(roll, roll, 10 + dying)
  const next = dying + [2, 1, -1, -2][d]!
  lines.push({ kind: 'check', text: `(Recovery ${roll} vs DC ${10 + dying}: ${DEGREE_NAMES[d]})` })
  if (next >= 4) {
    f.dying = 4
    f.state = 'dead'
    lines.push({ kind: 'narration', text: f.id === 'player' ? 'The cold comes up out of the ground and takes you.' : `${cap(f.name)} dies.` })
  } else if (next <= 0) {
    f.dying = 0
    f.state = 'unconscious'
    lines.push({ kind: 'narration', text: f.id === 'player' ? 'Your breathing steadies. You are out cold, but you will live.' : `${cap(f.name)} is out cold, but breathing.` })
  } else {
    f.dying = next
    lines.push({ kind: 'system', text: `Dying ${next} of 4.` })
  }
}

/** Ends a fighter's turn: bleeding hurts, fear fades, short conditions run out. */
export function endTurn(arena: Arena, combat: Combat, f: Fighter, lines: Line[]): void {
  if (f.state === 'up' && f.conditions['bleeding']) {
    lines.push({ kind: 'narration', text: `${cap(f.name)} ${verbS(f, 'bleed', 'bleeds')}: ${f.conditions['bleeding']} damage.` })
    hurt(arena, combat, f, f.conditions['bleeding']!, lines)
  }
  if (f.conditions['frightened']) {
    // Comfort (the Lantern): fear fades one step faster for the player's whole side.
    f.conditions['frightened']! -= f.side === 'party' && blessed(arena.content, arena.character, 'Comfort') ? 2 : 1
    if (f.conditions['frightened']! <= 0) delete f.conditions['frightened']
  }
  for (const [name, left] of Object.entries(f.timers)) {
    if (left <= 1) {
      delete f.timers[name]
      delete f.conditions[name]
    } else f.timers[name] = left - 1
  }
  delete f.conditions['shaken']
  f.buffs = f.buffs.map((b) => ({ ...b, rounds: b.rounds - 1 })).filter((b) => b.rounds > 0)
  if (f.fleeing && f.state === 'up' && Math.abs(f.pos) >= FLED_AT) {
    f.state = 'fled'
    lines.push({ kind: 'narration', text: fill(f.says.flee, f) ?? `${cap(f.name)} is gone.` })
  }
}

/** Whether the fight is over, and how. */
export function settle(combat: Combat): Combat['over'] {
  if (combat.over) return combat.over
  const foesLeft = combat.fighters.some((f) => f.side === 'foes' && (f.state === 'up' || f.state === 'waiting'))
  const partyLeft = combat.fighters.some((f) => f.side === 'party' && f.state === 'up')
  if (!foesLeft) combat.over = 'won'
  else if (!partyLeft) combat.over = 'lost'
  return combat.over
}

/** Actions a fighter has in a turn: three, one fewer when slowed, none when mired. */
export function actionsFor(f: Fighter): number {
  if (f.conditions['mired']) return 0
  return f.conditions['slowed'] ? 2 : 3
}

// ---------------------------------------------------------------- the player's other actions

/** Talk in a fight: demand surrender (Intimidation) against the Will of those who can give up. */
export function demandSurrender(arena: Arena, combat: Combat, lines: Line[]): void {
  const foes = standing(combat, 'foes')
  const talking = foes.filter((f) => f.kind === 'human' || f.kind === 'npc')
  if (talking.length === 0) {
    lines.push({ kind: 'narration', text: foes[0]?.kind === 'spirit' || foes[0]?.kind === 'undead' ? 'Your words fall into the cold without an answer.' : 'Beasts do not bargain.' })
    return
  }
  const bonus = arena.character ? skillBonus(arena.content, arena.character, 'intimidation') : 4
  for (const f of talking) {
    const dc = 10 + f.saves.will + f.morale.courage * 2 - (f.hp < f.maxHp / 2 ? 2 : 0)
    const roll = arena.rng.int(STREAM, 1, 20)
    const total = roll + bonus + (f.hp < f.maxHp / 2 ? 2 : 0)
    const d = degreeOf(roll, total, dc)
    lines.push({ kind: 'check', text: `(Intimidation ${total} vs ${f.name}'s Will DC ${dc}: ${DEGREE_NAMES[d]})` })
    if (d >= 2 && f.morale.surrenders && (d === 3 || f.hp < f.maxHp * 0.75 || f.conditions['frightened'])) {
      f.state = 'surrendered'
      lines.push({ kind: 'narration', text: fill(f.says.surrender, f) ?? `${cap(f.name)} gives up.` })
    } else if (d >= 2) applyCondition(arena, f, 'frightened', d === 3 ? 2 : 1, undefined, lines)
    else lines.push({ kind: 'narration', text: `${cap(f.name)} laughs at you.` })
  }
}

/** Grapple, shove or trip: Athletics against Fortitude or Reflex. */
export function manoeuvre(arena: Arena, combat: Combat, f: Fighter, target: Fighter, kind: 'grapple' | 'shove' | 'trip', lines: Line[]): void {
  const save: Save = kind === 'trip' ? 'reflex' : 'fortitude'
  const bonus = (f.id === 'player' && arena.character ? skillBonus(arena.content, arena.character, 'athletics') : f.level + 4) + (f.side === 'party' ? momentum(arena, combat) : 0)
  const map = f.strikes === 0 ? 0 : f.strikes === 1 ? 5 : 10
  f.strikes++
  const roll = arena.rng.int(STREAM, 1, 20)
  const total = roll + bonus - map - penalty(f)
  const dc = 10 + target.saves[save]
  const d = degreeOf(roll, total, dc)
  lines.push({ kind: 'check', text: `(Athletics ${total} vs ${target.name}'s ${save} DC ${dc}: ${DEGREE_NAMES[d]})` })
  if (d < 2) {
    if (d === 0) applyCondition(arena, f, 'prone', 1, undefined, lines)
    else lines.push({ kind: 'narration', text: `${cap(target.name)} ${verbS(target, 'shrug', 'shrugs')} you off.` })
    return
  }
  if (kind === 'grapple') applyCondition(arena, target, 'grabbed', 1, d === 3 ? 2 : 1, lines)
  else if (kind === 'trip') applyCondition(arena, target, 'prone', 1, undefined, lines)
  else {
    target.pos += target.side === 'foes' ? -(d === 3 ? 2 : 1) : d === 3 ? 2 : 1
    lines.push({ kind: 'narration', text: `${cap(target.name)} ${verbS(target, 'stagger', 'staggers')} back.` })
  }
}

/** Breaking a grip: Athletics or Thievery against the grip's DC. */
export function breakFree(arena: Arena, combat: Combat, f: Fighter, lines: Line[]): void {
  const holder = standing(combat, f.side === 'party' ? 'foes' : 'party').find((x) => distance(x, f) === 0)
  const dc = holder ? 10 + holder.level + 5 : 12
  const bonus = f.id === 'player' && arena.character ? Math.max(skillBonus(arena.content, arena.character, 'athletics'), skillBonus(arena.content, arena.character, 'thievery')) : f.level + 4
  const roll = arena.rng.int(STREAM, 1, 20)
  const total = roll + bonus - penalty(f)
  const d = degreeOf(roll, total, dc)
  lines.push({ kind: 'check', text: `(Break free ${total} vs DC ${dc}: ${DEGREE_NAMES[d]})` })
  if (d >= 2) {
    delete f.conditions['grabbed']
    delete f.timers['grabbed']
    lines.push({ kind: 'narration', text: `${f.id === 'player' ? 'You wrench' : `${cap(f.name)} wrenches`} free.` })
  }
}

/** Recall (FO, chapter 12): a Lore check to remember what the stories say about a creature. */
export function recall(arena: Arena, combat: Combat, f: Fighter, target: Fighter, lines: Line[]): void {
  const creature = target.creature ? arena.content.creatures.get(target.creature) : undefined
  const lore = creature?.lore
  const dc = lore?.dc ?? 10 + target.level + 2
  const bonus = arena.character ? skillBonus(arena.content, arena.character, 'lore') : 2
  const roll = arena.rng.int(STREAM, 1, 20)
  const total = roll + bonus
  const d = degreeOf(roll, total, dc)
  lines.push({ kind: 'check', text: `(Lore ${total} vs DC ${dc}: ${DEGREE_NAMES[d]})` })
  if (d >= 2) {
    const recalled = (f.recalled ??= [])
    if (creature && !recalled.includes(creature.id)) recalled.push(creature.id)
    lines.push({ kind: 'narration', text: lore?.text ?? `You know ${target.name}'s kind: you see where it is weak. (+1 to hit it)` })
  } else lines.push({ kind: 'narration', text: 'Nothing comes to mind that helps.' })
  void combat
}

/** Using a remedy from the pack: herbs heal and cure bleeding and sickness. */
export function useRemedy(arena: Arena, combat: Combat, f: Fighter, itemId: string, lines: Line[]): boolean {
  const item = arena.content.items.get(itemId)
  if (!item?.remedy || !arena.items || arena.items.count(itemId) < 1) return false
  arena.items.take(itemId)
  lines.push({ kind: 'narration', text: `You use the ${item.name}.` })
  if (item.remedy.heal) heal(f, rollDice(arena.rng, item.remedy.heal), lines)
  for (const c of item.remedy.cures) {
    if (f.conditions[c]) {
      delete f.conditions[c]
      delete f.timers[c]
      lines.push({ kind: 'narration', text: `You are no longer ${c}.` })
    }
  }
  void combat
  return true
}

/** Fleeing (FO, chapter 12): two actions and a check; the party runs together. */
export function tryFlee(arena: Arena, combat: Combat, dc: number, lines: Line[]): boolean {
  const bonus = arena.character ? Math.max(skillBonus(arena.content, arena.character, 'athletics'), skillBonus(arena.content, arena.character, 'stealth')) : 3
  const engaged = standing(combat, 'foes').some((x) => distance(x, fighter(combat, 'player')) === 0)
  const roll = arena.rng.int(STREAM, 1, 20)
  const total = roll + bonus - (engaged ? 2 : 0)
  const d = degreeOf(roll, total, dc)
  lines.push({ kind: 'check', text: `(Flee ${total} vs DC ${dc}: ${DEGREE_NAMES[d]})` })
  if (d >= 2) {
    combat.over = 'fled'
    lines.push({ kind: 'narration', text: 'You turn and run, and do not stop until the sounds of the fight are far behind you.' })
    return true
  }
  lines.push({ kind: 'narration', text: 'You try to break away, but they are on you.' })
  return false
}
