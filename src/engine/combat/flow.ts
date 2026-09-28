import type { Encounter } from '../rules/schema'
import { skillBonus } from '../rules/character'
import { autoTurn, foeTurn } from './ai'
import {
  abilityTargets,
  actionsFor,
  active,
  breakFree,
  canUse,
  creatureFighter,
  degreeOf,
  DEGREE_NAMES,
  demandSurrender,
  distance,
  endTurn,
  fighter,
  foeNames,
  manoeuvre,
  momentum,
  playerFighter,
  recall,
  recoveryCheck,
  rollInitiative,
  settle,
  standing,
  startTurn,
  stepMove,
  strike,
  tryFlee,
  useAbility,
  useRemedy,
  type Arena,
} from './combat'
import type { Combat, FightAbility, Fighter, Line } from './types'

// The course of a fight (FO, chapter 12, "Verloop"): who acts when, what the
// player's words do, and how it ends. The clock stands still while the player
// chooses; the engine lets the round's seconds pass afterwards.

export interface FightSetup {
  id: string
  place: string
  from?: string
  encounter?: Encounter
  foes: { creature: string; count: number; range: 'engaged' | 'near' | 'far'; joins?: number }[]
  now: number
  ambush?: boolean
  /** People on the foes' side (an NPC the player attacked, or who attacked the player). */
  foeFighters?: Fighter[]
  /** Companions on the player's side. */
  allies?: Fighter[]
  startedBy?: 'player' | 'npc'
}

const POS = { engaged: 0, near: -1, far: -2 }
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function beginFight(arena: Arena, setup: FightSetup): { combat: Combat; lines: Line[] } {
  if (!arena.character) throw new Error('A fight needs a character')
  const names = foeNames(arena.content, setup.foes)
  const fighters: Fighter[] = [playerFighter(arena.content, arena.character), ...(setup.allies ?? [])]
  let n = 0
  for (const group of setup.foes) {
    for (let i = 0; i < group.count; i++) {
      fighters.push(creatureFighter(arena.content, group.creature, `foe${n + 1}`, names[n]!, POS[group.range], group.joins))
      n++
    }
  }
  for (const f of setup.foeFighters ?? []) fighters.push(f)
  const combat: Combat = {
    id: setup.id,
    ...(setup.startedBy ? { started_by: setup.startedBy } : {}),
    ...(setup.encounter ? { encounter: setup.encounter.id } : {}),
    place: setup.place,
    ...(setup.from ? { from: setup.from } : {}),
    round: 0,
    order: [],
    turn: 0,
    actions: 0,
    fighters,
    momentumFrom: 1,
    subdue: false,
    started: setup.now,
    xp: 0,
  }
  rollInitiative(arena, combat, setup.ambush)
  const lines: Line[] = []
  if (setup.encounter?.opening) lines.push({ kind: 'narration', text: setup.encounter.opening })
  if (setup.encounter?.demand) {
    combat.parley = { ...setup.encounter.demand }
    lines.push({ kind: 'narration', text: setup.encounter.demand.text })
    lines.push({ kind: 'system', text: 'PAY, REFUSE (and fight), TALK <words> to talk your way past, or FLEE.' })
    return { combat, lines }
  }
  lines.push(...startFight(arena, combat))
  return { combat, lines }
}

/** Blows begin: round 1, in the order of initiative. */
function startFight(arena: Arena, combat: Combat, surprised = false): Line[] {
  delete combat.parley
  combat.round = 1
  combat.turn = 0
  const lines: Line[] = [{ kind: 'system', text: `Round 1. Initiative: ${combat.order.map((id) => { const f = fighter(combat, id); return `${f.id === 'player' ? 'you' : f.name} ${f.initiative}` }).join(', ')}.` }]
  if (surprised) fighter(combat, 'player').conditions['off_guard'] = 1
  const first = fighter(combat, combat.order[0]!)
  startTurn(arena, combat, first, lines)
  if (first.id === 'player') combat.actions = actionsFor(first)
  lines.push(...runOthers(arena, combat))
  return lines
}

/** Plays everyone else's turns until it is the player's turn again, or the fight is over. */
export function runOthers(arena: Arena, combat: Combat, auto = false, fleeDc?: number): Line[] {
  const lines: Line[] = []
  let guard = 0
  while (!settle(combat) && guard++ < 500) {
    const f = fighter(combat, combat.order[combat.turn]!)
    if (f.id === 'player' && f.state === 'up') {
      if (!auto && combat.actions > 0) return lines
      if (auto) autoTurn(arena, combat, f, lines, fleeDc !== undefined ? { fleeDc } : {})
    } else if (f.side === 'foes' && f.state === 'up') foeTurn(arena, combat, f, lines)
    else if (f.side === 'party' && f.state === 'up') autoTurn(arena, combat, f, lines)
    if (settle(combat)) break
    endTurn(arena, combat, f, lines)
    nextTurn(arena, combat, lines)
  }
  if (combat.over === 'lost') lines.push(...downed(arena, combat))
  return lines
}

function nextTurn(arena: Arena, combat: Combat, lines: Line[]): void {
  combat.turn++
  if (combat.turn >= combat.order.length) {
    combat.turn = 0
    combat.round++
    const m = momentum(arena, combat)
    lines.push({ kind: 'system', text: `Round ${combat.round}.${m > 0 ? ` Momentum +${m}.` : ''}` })
  }
  const next = fighter(combat, combat.order[combat.turn]!)
  startTurn(arena, combat, next, lines)
  if (next.id === 'player') combat.actions = next.state === 'up' ? actionsFor(next) : 0
}

/**
 * The player is down and nobody stands for them. Robbers take what they came
 * for and go; beasts lose interest; spirits and the dead finish what they began.
 * Then the dying roll until they live or die.
 */
function downed(arena: Arena, combat: Combat): Line[] {
  const lines: Line[] = []
  // Companions who lie dying roll too; nobody is left standing to help them.
  for (const f of combat.fighters) {
    if (f.side !== 'party' || f.id === 'player') continue
    for (let i = 0; i < 40 && f.state === 'dying'; i++) recoveryCheck(arena, f, lines)
  }
  const player = fighter(combat, 'player')
  const foes = standing(combat, 'foes')
  const cruel = foes.find((f) => f.kind === 'spirit' || f.kind === 'undead')
  if (foes.some((f) => f.kind === 'human')) lines.push({ kind: 'narration', text: 'Through the ringing in your ears you feel hands going through your pockets. Then footsteps, going away.' })
  else if (!cruel && foes.length) lines.push({ kind: 'narration', text: 'Whatever it was loses interest in you and is gone.' })
  let rounds = 0
  while (player.state === 'dying' && rounds++ < 40) {
    recoveryCheck(arena, player, lines)
    if (player.state === 'dying' && cruel) {
      const roll = arena.rng.int('combat', 1, 20)
      if (roll + (cruel.attacks[0]?.bonus ?? 0) >= player.defence - 2) {
        player.dying = Math.min(4, (player.dying ?? 1) + (roll === 20 ? 2 : 1))
        lines.push({ kind: 'narration', text: `${cap(cruel.name)} is not done with you.` })
        if (player.dying >= 4) {
          player.state = 'dead'
          lines.push({ kind: 'narration', text: 'The cold comes up out of the ground and takes you.' })
        }
      }
    }
  }
  return lines
}

// ---------------------------------------------------------------- the player's words

function findFoe(combat: Combat, words: string): Fighter | undefined {
  const foes = combat.fighters.filter((f) => f.side === 'foes' && active(f))
  const w = words.toLowerCase().replace(/^(the|at|on)\s+/, '').trim()
  if (!w) return foes.sort((a, b) => distance(fighter(combat, 'player'), a) - distance(fighter(combat, 'player'), b))[0]
  const ord = /\b(first|second|third|fourth|1|2|3|4)\b/.exec(w)
  const n = ord ? ['first', 'second', 'third', 'fourth'].indexOf(ord[1]!) + 1 || Number(ord[1]) : 0
  const named = foes.filter((f) => f.name.toLowerCase().includes(w.replace(/\b(first|second|third|fourth|1|2|3|4)\b/, '').trim().split(' ').pop() ?? ''))
  if (n && named.length) return named.find((f) => f.name.includes(['first', 'second', 'third', 'fourth'][n - 1]!)) ?? named[n - 1]
  return named[0]
}

function findAbility(f: Fighter, words: string): { ability: FightAbility; rest: string } | undefined {
  const w = words.toLowerCase().trim()
  for (const a of [...f.abilities].sort((x, y) => y.name.length - x.name.length)) {
    const name = a.name.toLowerCase()
    if (w === name || w.startsWith(`${name} `) || w === a.id || w.startsWith(`${a.id} `)) return { ability: a, rest: w.slice(w.startsWith(name) ? name.length : a.id.length).trim().replace(/^(on|at)\s+/, '') }
  }
  return undefined
}

/**
 * ORDER <companion> TO <attack|shoot|strike> <foe>, TO HOLD, TO PROTECT <name>,
 * TO HEAL: free, and refused by a badly hurt companion of low loyalty who is
 * told to take on a stronger foe (FO, chapter 13).
 */
function orderInFight(combat: Combat, words: string): Line[] {
  const m = /^(\S+)\s+(?:to\s+)?(attack|shoot|strike|hit|hold|protect|heal|support|defend|follow)\s*(.*)$/.exec(words.trim())
  if (!m) return [{ kind: 'system', text: 'ORDER <companion> TO ATTACK <foe>, TO HOLD, TO PROTECT <name>, or TO HEAL.' }]
  const who = combat.fighters.find((f) => f.side === 'party' && f.id !== 'player' && f.name.toLowerCase().startsWith(m[1]!))
  if (!who) return [{ kind: 'system', text: `Nobody called "${m[1]}" fights beside you.` }]
  if (who.state !== 'up') return [{ kind: 'system', text: `${cap(who.name)} cannot.` }]
  const verb = m[2]!
  if (verb === 'hold' || verb === 'defend') {
    who.stance = verb === 'hold' ? 'hold' : 'defensive'
    return [{ kind: 'narration', text: `${cap(who.name)} holds back, guarding.` }]
  }
  if (verb === 'heal' || verb === 'support') {
    who.stance = 'support'
    return [{ kind: 'narration', text: `${cap(who.name)} turns to tending the wounded.` }]
  }
  if (verb === 'protect') {
    const guard = combat.fighters.find((f) => f.side === 'party' && (m[3] === 'me' ? f.id === 'player' : f.name.toLowerCase().startsWith(m[3] ?? '')))
    who.stance = 'protect'
    who.guard = guard?.id ?? 'player'
    return [{ kind: 'narration', text: `${cap(who.name)} moves to cover ${guard && guard.id !== 'player' ? guard.name : 'you'}.` }]
  }
  if (verb === 'follow') {
    who.stance = 'follow'
    return [{ kind: 'narration', text: `${cap(who.name)} will go for whoever you go for.` }]
  }
  const target = findFoe(combat, m[3] ?? '')
  if (!target) return [{ kind: 'system', text: `${cap(who.name)} looks at you: at whom?` }]
  if (who.hp < who.maxHp * 0.3 && (who.loyalty ?? 100) < 60 && target.level > who.level + 1) return [{ kind: 'speech', text: `${cap(who.name)}: "Not like this. Not alone, not against ${target.name}."` }]
  who.orderTarget = target.id
  return [{ kind: 'narration', text: `${cap(who.name)} goes for ${target.name}.` }]
}

export const FIGHT_HELP =
  'In a fight: STRIKE [foe], ADVANCE / STEP BACK, RAISE SHIELD, TAKE COVER, USE <herbs>, RECALL [foe], TALK (demand surrender), GRAPPLE / SHOVE / TRIP <foe>, BREAK FREE, STAND, your abilities by name, TOGETHER <companion> [ON <foe>] (a joint strike, 2 actions, from band 1), FLEE (2 actions), SURRENDER, SUBDUE (fight not to kill), END (end your turn).'

export interface PlayerResult {
  lines: Line[]
  /** The player paid, talked their way out, fled or gave up: the engine settles money and news. */
  outcome?: Combat['over']
}

/** One command from the player in a fight. */
export function playerCommand(arena: Arena, combat: Combat, text: string, fleeDc = 15): PlayerResult {
  const lines: Line[] = []
  const player = fighter(combat, 'player')
  const words = text.trim().toLowerCase().replace(/[.!]+$/, '')
  const [verb = '', ...restWords] = words.split(/\s+/)
  const rest = restWords.join(' ')

  if (combat.parley) {
    if (/^(pay|betaal)/.test(words)) {
      combat.over = 'paid'
      lines.push({ kind: 'narration', text: combat.parley.paid })
      return { lines, outcome: 'paid' }
    }
    if (/^(talk|say|tell|threaten|persuade|intimidate|')/.test(words) || verb.startsWith("'")) {
      const threat = /\b(kill|hurt|leave|go|or else|regret|blood|run|die|break|nothing)\b/.test(words)
      const skill = threat || verb === 'intimidate' ? 'intimidation' : 'persuasion'
      const bonus = skillBonus(arena.content, arena.character!, skill)
      const foes = combat.fighters.filter((f) => f.side === 'foes')
      const dc = 10 + Math.max(...foes.map((f) => f.saves.will)) + (foes.length - 1)
      const roll = arena.rng.int('combat', 1, 20)
      const total = roll + bonus
      const d = degreeOf(roll, total, dc)
      lines.push({ kind: 'check', text: `(${skill === 'intimidation' ? 'Intimidation' : 'Persuasion'} ${total} vs Will DC ${dc}: ${DEGREE_NAMES[d]})` })
      if (d >= 2) {
        combat.over = 'talked'
        lines.push({ kind: 'narration', text: skill === 'intimidation' ? `${cap(foes[0]!.name)} looks at you a long moment, then spits and steps back. "Not worth it."` : `${cap(foes[0]!.name)} shrugs. "Go on, then. Today's your lucky day."` })
        return { lines, outcome: 'talked' }
      }
      lines.push({ kind: 'narration', text: d === 0 ? `${cap(foes[0]!.name)} is on you before you have finished speaking.` : `${cap(foes[0]!.name)} laughs. "Brave words."` })
      lines.push(...startFight(arena, combat, d === 0))
      return { lines }
    }
    if (/^(flee|run|vlucht)/.test(words)) {
      const bonus = Math.max(skillBonus(arena.content, arena.character!, 'athletics'), skillBonus(arena.content, arena.character!, 'stealth'))
      const roll = arena.rng.int('combat', 1, 20)
      const d = degreeOf(roll, roll + bonus + 2, fleeDc)
      lines.push({ kind: 'check', text: `(Flee ${roll + bonus + 2} vs DC ${fleeDc}: ${DEGREE_NAMES[d]})` })
      if (d >= 2) {
        combat.over = 'fled'
        lines.push({ kind: 'narration', text: 'You turn and run back the way you came, and nobody follows far.' })
        return { lines, outcome: 'fled' }
      }
      lines.push({ kind: 'narration', text: 'You turn to run, but they cut you off.' })
      lines.push(...startFight(arena, combat))
      return { lines }
    }
    if (/^(refuse|attack|fight|strike|hit|no)\b/.test(words)) {
      lines.push({ kind: 'narration', text: 'You refuse.' })
      lines.push(...startFight(arena, combat))
      return { lines }
    }
    return { lines: [{ kind: 'system', text: 'PAY, REFUSE, TALK <words> or FLEE.' }] }
  }

  if (combat.over) return { lines: [{ kind: 'system', text: 'The fight is over.' }] }
  if (player.state !== 'up') return { lines: [{ kind: 'system', text: 'You can do nothing now.' }] }

  const spend = (n: number): boolean => {
    if (combat.actions < n) {
      lines.push({ kind: 'system', text: `That takes ${n} actions; you have ${combat.actions} left. END to end your turn.` })
      return false
    }
    combat.actions -= n
    return true
  }

  if (/^(help|\?)$/.test(verb)) return { lines: [{ kind: 'system', text: FIGHT_HELP }] }
  // TOGETHER <companion> [on <foe>]: a joint strike, once a fight per companion from band 1 (FO, chapter 13).
  if (verb === 'together' || words.startsWith('with ')) {
    const [who = '', on = ''] = rest.replace(/^with\s+/, '').split(/\s+(?:on|at|against)\s+/)
    const mate = combat.fighters.find((f) => f.side === 'party' && f.id !== 'player' && f.name.toLowerCase().startsWith(who.trim().split(' ')[0] ?? ''))
    if (!mate || !who.trim()) lines.push({ kind: 'system', text: 'Together with whom? TOGETHER <companion> [ON <foe>].' })
    else if ((arena.bonds?.[mate.id] ?? 0) < 1) lines.push({ kind: 'system', text: `You and ${mate.name} are not that close yet: a joint action needs band 1.` })
    else if ((combat.joint ?? []).includes(mate.id)) lines.push({ kind: 'system', text: `You and ${mate.name} have done that once this fight.` })
    else if (mate.state !== 'up') lines.push({ kind: 'system', text: `${cap(mate.name)} cannot.` })
    else {
      const target = findFoe(combat, on)
      const reach = (f: Fighter) => (f.attacks[0]?.kind === 'melee' ? distance(f, target!) === 0 : true)
      if (!target) lines.push({ kind: 'system', text: 'Against whom?' })
      else if (!reach(player) || !reach(mate)) lines.push({ kind: 'system', text: `You both need to reach ${target.name}.` })
      else if (spend(2)) {
        ;(combat.joint ??= []).push(mate.id)
        combat.playerTarget = target.id
        lines.push({ kind: 'narration', text: `You catch ${mate.name}'s eye, and you go in together.` })
        for (const f of [player, mate]) f.buffs.push({ to: 'attack', value: 2, rounds: 1 })
        lines.push(...strike(arena, combat, player, target))
        if (target.state === 'up' && mate.state === 'up') lines.push(...strike(arena, combat, mate, target))
      }
    }
    if (!settle(combat) && combat.actions <= 0) {
      endTurn(arena, combat, player, lines)
      nextTurn(arena, combat, lines)
      lines.push(...runOthers(arena, combat))
    } else if (combat.over === 'lost') lines.push(...downed(arena, combat))
    return { lines }
  }
  if (verb === 'order') return { lines: orderInFight(combat, rest) }
  if (/^(subdue|lethal|nonlethal)$/.test(verb)) {
    combat.subdue = verb === 'lethal' ? false : !(rest === 'off')
    return { lines: [{ kind: 'system', text: combat.subdue ? 'You fight to subdue, not to kill (-2 to hit).' : 'You fight to kill.' }] }
  }
  const own = findAbility(player, words)
  if (/^(end|done|pass|wait)$/.test(verb)) {
    combat.actions = 0
  } else if (/^(strike|attack|hit|stab|shoot|s|a|slaan|val)$/.test(verb)) {
    const target = findFoe(combat, rest)
    if (!target) lines.push({ kind: 'system', text: 'Strike whom?' })
    else {
      const attack = player.attacks[0]!
      const reach = () => (attack.kind === 'melee' ? distance(player, target) === 0 : attack.range === 'far' || distance(player, target) <= 1)
      // Out of reach with a weapon for close work: step in first, if there are actions for it.
      if (!reach() && attack.kind === 'melee' && distance(player, target) === 1 && !player.conditions['grabbed'] && !player.conditions['prone'] && spend(1)) stepMove(arena, combat, player, 'forward', lines)
      if (!reach()) lines.push({ kind: 'system', text: `${cap(target.name)} is out of reach.` })
      else if (combat.actions > 0 && spend(1)) {
        combat.playerTarget = target.id
        lines.push(...strike(arena, combat, player, target))
      }
    }
  } else if (/^(advance|close|forward|charge|stride)$/.test(verb) || words === 'step in') {
    if (spend(1)) stepMove(arena, combat, player, 'forward', lines)
  } else if (/^(back|retreat|withdraw)$/.test(verb) || words.startsWith('step back')) {
    if (spend(1)) stepMove(arena, combat, player, 'back', lines)
  } else if (words.startsWith('raise shield') || verb === 'shield' || words === 'raise') {
    if (!arena.character?.gear.shield) lines.push({ kind: 'system', text: 'You have no shield in hand.' })
    else if (spend(1)) {
      player.shieldUp = true
      lines.push({ kind: 'narration', text: 'You raise your shield.' })
    }
  } else if (words.startsWith('take cover') || verb === 'cover') {
    if (spend(1)) {
      player.cover = true
      lines.push({ kind: 'narration', text: 'You get down behind what cover there is.' })
    }
  } else if (verb === 'use' || verb === 'eat' || verb === 'drink') {
    const item = [...arena.content.items.values()].find((i) => i.remedy && (rest.includes(i.id) || i.aliases.some((a) => rest.includes(a)) || rest.includes(i.name)))
    if (!item) lines.push({ kind: 'system', text: 'In a fight you can use remedies, such as herbs.' })
    else if (!arena.items || arena.items.count(item.id) < 1) lines.push({ kind: 'system', text: `You have no ${item.name}.` })
    else if (spend(1)) useRemedy(arena, combat, player, item.id, lines)
  } else if (verb === 'recall') {
    const target = findFoe(combat, rest)
    if (target && spend(1)) recall(arena, combat, player, target, lines)
  } else if (/^(talk|say|yield\?|surrender\?)$/.test(verb) || verb.startsWith("'") || words.startsWith('demand')) {
    if (spend(1)) demandSurrender(arena, combat, lines)
  } else if (/^(grapple|shove|trip|push|grab)$/.test(verb)) {
    const target = findFoe(combat, rest)
    const kind = verb === 'grab' ? 'grapple' : verb === 'push' ? 'shove' : (verb as 'grapple' | 'shove' | 'trip')
    if (!target || distance(player, target) !== 0) lines.push({ kind: 'system', text: 'You must be engaged with them.' })
    else if (spend(1)) manoeuvre(arena, combat, player, target, kind, lines)
  } else if (words.startsWith('break free') || verb === 'escape') {
    if (!player.conditions['grabbed']) lines.push({ kind: 'system', text: 'Nothing holds you.' })
    else if (spend(1)) breakFree(arena, combat, player, lines)
  } else if (verb === 'stand' || words === 'get up') {
    if (!player.conditions['prone']) lines.push({ kind: 'system', text: 'You are on your feet.' })
    else if (spend(1)) {
      delete player.conditions['prone']
      lines.push({ kind: 'narration', text: 'You get up out of the mud.' })
    }
  } else if (/^(flee|run|vlucht)$/.test(verb)) {
    if (spend(2) && tryFlee(arena, combat, fleeDc, lines)) return { lines, outcome: 'fled' }
  } else if (/^(surrender|yield|give)$/.test(verb)) {
    const foes = standing(combat, 'foes')
    if (!foes.some((f) => f.kind === 'human' || f.kind === 'npc')) lines.push({ kind: 'narration', text: 'There is nobody here who takes a surrender.' })
    else if (spend(1)) {
      combat.over = 'surrendered'
      lines.push({ kind: 'narration', text: 'You throw down your weapon and hold up your hands.' })
      return { lines, outcome: 'surrendered' }
    }
  } else if (verb === 'pay') {
    const e = combat.encounter ? arena.content.encounters.get(combat.encounter) : undefined
    if (!e?.demand) lines.push({ kind: 'system', text: 'Nobody here wants your money.' })
    else if (spend(1)) {
      combat.over = 'paid'
      lines.push({ kind: 'narration', text: 'You hold out your purse. They take twice the toll for the trouble, and go.' })
      return { lines, outcome: 'paid' }
    }
  } else if (own) {
    const a = own.ability
    if (!canUse(player, a)) lines.push({ kind: 'system', text: `You have used ${a.name} in this fight already.` })
    else {
      const chosen = a.target === 'enemy' ? findFoe(combat, own.rest) : a.target === 'ally' ? player : undefined
      if (abilityTargets(combat, player, a, chosen).length === 0) lines.push({ kind: 'system', text: `Nobody is in reach for ${a.name} (${a.range}).` })
      else if (spend(a.actions)) lines.push(...useAbility(arena, combat, player, a, chosen))
    }
  } else {
    return { lines: [{ kind: 'system', text: `You are in a fight. ${FIGHT_HELP}` }] }
  }
  if (!settle(combat) && combat.actions <= 0) {
    endTurn(arena, combat, player, lines)
    nextTurn(arena, combat, lines)
    lines.push(...runOthers(arena, combat))
  } else if (combat.over === 'lost') lines.push(...downed(arena, combat))
  return { lines }
}

/** What the player sees of the fight: for the panel and for STATUS. */
export function fightView(arena: Arena, combat: Combat): {
  round: number
  momentum: number
  actions: number
  subdue: boolean
  parley?: string
  fighters: { id: string; name: string; side: string; hp: number; maxHp: number; state: string; distance: string; conditions: string[]; reachable: boolean }[]
  abilities: { id: string; name: string; actions: number; ready: boolean; range: string }[]
} {
  const player = fighter(combat, 'player')
  const dist = (f: Fighter) => (f.side === 'party' ? '' : ['engaged', 'near', 'far'][Math.min(2, distance(player, f))]!)
  const attack = player.attacks[0]
  // A strike reaches with a step in for close work, or as far as the bow or sling carries.
  const reachable = (f: Fighter) => f.side === 'foes' && f.state === 'up' && Boolean(attack) && (attack!.kind === 'melee' ? distance(player, f) <= 1 : attack!.range === 'far' || distance(player, f) <= 1)
  return {
    round: combat.round,
    momentum: momentum(arena, combat),
    actions: combat.actions,
    subdue: combat.subdue,
    ...(combat.parley ? { parley: combat.parley.text } : {}),
    fighters: combat.fighters
      .filter((f) => f.state !== 'waiting')
      .map((f) => ({
        id: f.id,
        name: f.id === 'player' ? (arena.character?.name ?? 'You') : cap(f.name),
        side: f.side,
        hp: f.hp,
        maxHp: f.maxHp,
        state: f.state === 'dying' ? `dying ${f.dying}` : f.state,
        distance: dist(f),
        conditions: Object.entries(f.conditions)
          .filter(([c]) => c !== 'shaken')
          .map(([c, v]) => (['frightened', 'bleeding'].includes(c) ? `${c} ${v}` : c)),
        reachable: reachable(f),
      })),
    abilities: player.abilities.map((a) => ({ id: a.id, name: a.name, actions: a.actions, ready: canUse(player, a) && inRangeAny(combat, player, a), range: a.range })),
  }
}

function inRangeAny(combat: Combat, f: Fighter, a: FightAbility): boolean {
  return abilityTargets(combat, f, a).length > 0 || a.target === 'self'
}
