import { knob } from '../knobs'
import type { Output } from '../commands'
import { callName } from '../content'
import { rollDice } from '../combat/combat'
import { npcFighter } from '../combat/npc'
import type { Fighter } from '../combat/types'
import { applyEffect } from '../dialogue/relations'
import { setMood } from './deeds'
import { setTie } from '../layer'
import { recordFact } from '../news'
import { playerCheck } from '../rules/player'
import type { Agreement } from '../state'
import type { World } from '../world'
import { mayReport } from './gates'

// A fight between two people of the world (M10.3, left over; decided with
// Bram on 28 September 2026). The agreement attack may have someone else than
// the stranger as its target. Out of sight, the rules play it out in one go,
// with the same fighters as the combat system (combat/npc.ts): hurt, gives
// in, or runs. Nobody dies of it; only a plan that says kill kills. With the
// stranger there it is a scene: they can step in (ATTACK one of the two, or
// PERSUADE or INTIMIDATE them to stop), or let it run. Whoever sees it is a
// witness; it is a fact about both, the loser bears a grudge, and the law
// hears of it the way it hears of an attack on the stranger.

/** A fight in front of the stranger, waiting for their next move. */
export interface BrawlScene {
  agreement: string
  by: string
  target: string
  place: string
  reason: string
  shown?: boolean
}

export interface BrawlOutcome {
  winner: string
  loser: string
  how: 'hurt' | 'gave in' | 'ran'
  text: string
}


function strike(world: World, a: Fighter, b: Fighter): void {
  const attack = a.attacks[0]
  if (!attack) return
  const roll = world.rng.d20('brawl')
  if (roll + attack.bonus < b.defence && roll !== 20) return
  b.hp -= Math.max(1, rollDice(world.rng, attack.dice, 'brawl') * (roll === 20 ? 2 : 1))
}

/** Plays it out, in one go: blow for blow until one is down, gives in or runs. */
export function fightOut(world: World, by: string, target: string): { outcome: BrawlOutcome; hp: Record<string, number> } {
  const a = npcFighter(world, by, 'party')
  const b = npcFighter(world, target, 'foes')
  let loser: Fighter | undefined
  let how: BrawlOutcome['how'] = 'hurt'
  for (let round = 0; round < knob(world, 'rules.brawl_rounds') && !loser; round++) {
    for (const [x, y] of [
      [a, b],
      [b, a],
    ] as const) {
      strike(world, x, y)
      if (y.hp <= 0) {
        loser = y
        how = 'hurt'
        break
      }
      // Faint hearts give in or run before they are down.
      const courage = world.npc(y.npc!).personality.courage
      if (y.hp <= y.maxHp * 0.25) {
        loser = y
        how = 'ran'
        break
      }
      if (y.hp <= y.maxHp * 0.5 && courage <= 0) {
        loser = y
        how = 'gave in'
        break
      }
    }
  }
  // Nobody down after all that: whoever is worse off gives in.
  if (!loser) {
    loser = a.hp / a.maxHp < b.hp / b.maxHp ? a : b
    how = 'gave in'
  }
  const winner = loser === a ? b : a
  const w = callName(world.npc(winner.npc!))
  const l = callName(world.npc(loser.npc!))
  const text = how === 'hurt' ? `${w} knocked ${l} down, and ${l} was hurt.` : how === 'ran' ? `${l} broke away and ran from ${w}.` : `${l} gave in to ${w}.`
  return { outcome: { winner: winner.npc!, loser: loser.npc!, how, text }, hp: { [a.npc!]: Math.max(1, a.hp), [b.npc!]: Math.max(1, b.hp) } }
}

/**
 * What a fight leaves: wounds on both (nobody dies of it), a fact about both
 * with its witnesses, the loser's grudge, and the law told by whoever would.
 */
export function afterFight(world: World, by: string, target: string, place: string, reason: string, outcome: BrawlOutcome, hp: Record<string, number>, witnesses: string[]): Output[] {
  for (const id of [by, target]) {
    const f = npcFighter(world, id, 'party')
    const left = hp[id] ?? f.hp
    const s = world.npcState(id)
    s.wounds = Math.min(f.maxHp - 1, (s.wounds ?? 0) + Math.max(0, f.hp - left))
  }
  const a = callName(world.npc(by))
  const b = callName(world.npc(target))
  const seen = witnesses.filter((w) => w !== by && w !== target)
  recordFact(world, {
    kind: 'fight',
    about: [by, target],
    place,
    belang: 2,
    loud: true,
    title: `${a} going for ${b}`,
    text: { precise: `${a} went for ${b} at ${world.location(place).name} over ${reason}. ${outcome.text}`, village: `${a} and ${b} came to blows over ${reason}, they say.`, far: 'Two men came to blows.' },
    witnesses: [...seen, by, target],
  })
  // The loser bears a grudge; both remember it.
  const loser = outcome.loser
  const winner = outcome.winner
  setTie(world, loser, winner, 'rival', 1)
  setMood(world, loser, -8, 24, `the fight with ${callName(world.npc(winner))}`)
  for (const [who, other] of [
    [by, target],
    [target, by],
  ] as const) {
    const memory = (world.npcState(who).memory ??= [])
    memory.push({ t: world.now, note: who === loser ? `${callName(world.npc(other))} beat me in a fight over ${reason}. I won't forget it.` : `I fought ${callName(world.npc(other))} over ${reason}.`, topics: [other], valence: -1 })
    if (memory.length > 30) memory.splice(0, memory.length - 30)
  }
  // Running away takes them home.
  if (outcome.how === 'ran') {
    const s = world.npcState(loser)
    s.goals = s.goals.filter((g) => g.id !== `flee_${loser}`)
    s.goals.push({ id: `flee_${loser}`, type: 'Visit', target: world.npc(loser).home, priority: 1, source: 'ai', created: world.now, until: world.now + 6 * 60 })
    s.plan = []
    s.planGoal = undefined
    s.busyUntil = Math.min(s.busyUntil, world.now)
  }
  // The law hears it the way it hears of an attack on the stranger: a witness who would tell, tells; the officer fines the one who started it.
  const law = world.words.law
  const officer = law.npc && world.content.npcs.has(law.npc) && world.alive(law.npc) ? law.npc : undefined
  const told = officer && seen.find((w) => w === officer || (world.content.npcs.has(w) && mayReport(world, w, false)))
  const out: Output[] = []
  if (officer && told && by !== officer) {
    const fine = 16
    const purse = world.npcState(by)
    const paid = Math.min(fine, Math.max(0, purse.money))
    purse.money -= paid
    world.npcState(officer).money += paid
    recordFact(world, {
      kind: 'fined',
      about: [by, officer],
      place,
      belang: 1,
      title: `${a} fined for the fight`,
      text: { precise: `The ${law.officer} fined ${a} ${world.money(paid)} for going for ${b}; ${told === officer ? `${callName(world.npc(officer))} saw it` : `${callName(world.npc(told))} told`}.`, village: `${a} was fined for the fight with ${b}.`, far: 'A brawler fined.' },
      witnesses: [officer, ...(told !== officer ? [told] : [])],
    })
    out.push({ kind: 'system', text: `${told === officer ? callName(world.npc(officer)) : `${callName(world.npc(told))} will tell the ${law.officer}, and`} ${a} will be fined for it.` })
  }
  return out
}

/** Whether both are here, awake and themselves: a fight can start. */
function together(world: World, a: string, b: string): string | undefined {
  const x = world.state.npcs[a]
  const y = world.state.npcs[b]
  if (!x || !y || x.location !== y.location || !world.present(a) || !world.present(b)) return undefined
  if (x.activity === 'asleep' || y.activity === 'asleep' || x.following || y.following) return undefined
  return x.location
}

/**
 * An attack on someone else than the stranger (from agreementsTick): the one
 * who means it goes to the other; together, out of sight it is played out at
 * once, and in the stranger's sight it is a scene for them to answer.
 */
export function brawlTick(world: World, a: Agreement, settle: (text: string) => void, go: (place: string) => void): void {
  const target = a.terms.target!
  const place = together(world, a.by, target)
  if (!place) {
    const where = world.state.npcs[target]?.location
    if (where && !a.effects.some((e) => e.kind === 'plan')) go(where)
    return
  }
  if (world.state.brawl) return
  if (world.state.player.location === place && !world.state.combat) {
    world.state.brawl = { agreement: a.id, by: a.by, target, place, reason: a.terms.reason ?? 'an old grudge' }
    return
  }
  const { outcome, hp } = fightOut(world, a.by, target)
  afterFight(world, a.by, target, place, a.terms.reason ?? 'an old grudge', outcome, hp, world.npcsAt(place).filter((id) => world.npcState(id).activity !== 'asleep'))
  settle(`${callName(world.npc(a.by))} went for ${callName(world.npc(target))}: ${outcome.text}`)
}

/** The scene, the first time the stranger sees it. */
export function brawlShown(world: World): Output[] {
  const b = world.state.brawl
  if (!b || b.shown) return []
  b.shown = true
  const a = callName(world.npc(b.by))
  const t = callName(world.npc(b.target))
  return [
    { kind: 'narration', text: `${a} goes for ${t} over ${b.reason}! They are at each other, fists and elbows.` },
    { kind: 'system', text: `Step in? PERSUADE or INTIMIDATE them to stop, ATTACK one of them, or let it run its course.` },
  ]
}

/**
 * The stranger's next move with a fight in front of them. Persuading or
 * threatening them apart is a check; attacking one of the two ends their
 * fight and starts the stranger's own; anything else lets it run.
 * Undefined when there is no fight, or the move is the stranger's own
 * attack (the engine starts that fight after this has ended theirs).
 */
export function brawlAnswer(world: World, verb: string, target: string | undefined, settle: (a: Agreement, status: 'kept' | 'cancelled', text: string) => void): Output[] | undefined {
  const b = world.state.brawl
  if (!b || !b.shown) return undefined
  const agreement = world.state.agreements?.list.find((x) => x.id === b.agreement)
  const a = callName(world.npc(b.by))
  const t = callName(world.npc(b.target))
  world.state.brawl = undefined
  if (verb === 'attack' && (target === b.by || target === b.target)) {
    if (agreement) settle(agreement, 'cancelled', `the stranger stepped into ${a}'s fight with ${t}`)
    return []
  }
  if ((verb === 'persuade' || verb === 'intimidate') && (!target || target === b.by || target === b.target)) {
    const temper = Math.max(world.npc(b.by).personality.temper, world.npc(b.target).personality.temper)
    const result = playerCheck(world, verb === 'persuade' ? 'persuasion' : 'intimidation', 14 + temper * 2)
    const out: Output[] = [{ kind: 'check', text: `(${verb === 'persuade' ? 'Persuasion' : 'Intimidation'} ${result.total} vs DC ${result.dc}: ${result.degree})` }]
    if (result.degree === 'success' || result.degree === 'critical success') {
      out.push({ kind: 'narration', text: verb === 'persuade' ? `You get between them and talk them down. ${a} lets go of ${t}, breathing hard.` : `You roar at them to stop, and they do. ${a} lets go of ${t}.` })
      for (const id of [b.by, b.target]) applyEffect(world, id, verb === 'persuade' ? 'trust' : 'fear', 5)
      recordFact(world, { kind: 'fight_stopped', about: [b.by, b.target], place: b.place, belang: 1, title: `the stranger stopping ${a} and ${t}`, text: { precise: `The stranger stepped between ${a} and ${t} and stopped the fight.`, village: `The stranger broke up a fight between ${a} and ${t}, they say.`, far: 'A stranger who broke up a fight.' } })
      if (agreement) settle(agreement, 'cancelled', `the stranger stopped ${a}'s fight with ${t}`)
      return out
    }
    out.push({ kind: 'narration', text: `They shove you aside and go on.` })
    return [...out, ...runOut(world, b, agreement, settle)]
  }
  // Anything else: it runs its course in front of the stranger.
  return runOut(world, b, agreement, settle)
}

function runOut(world: World, b: BrawlScene, agreement: Agreement | undefined, settle: (a: Agreement, status: 'kept' | 'cancelled', text: string) => void): Output[] {
  const { outcome, hp } = fightOut(world, b.by, b.target)
  const witnesses = world.npcsAt(b.place).filter((id) => world.npcState(id).activity !== 'asleep')
  const out: Output[] = [{ kind: 'narration', text: outcome.text }]
  out.push(...afterFight(world, b.by, b.target, b.place, b.reason, outcome, hp, witnesses))
  if (agreement) settle(agreement, 'kept', `${callName(world.npc(b.by))} went for ${callName(world.npc(b.target))}: ${outcome.text}`)
  return out
}
