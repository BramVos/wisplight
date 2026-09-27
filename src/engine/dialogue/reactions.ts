import { agree } from '../agreements'
import { minuteOfDay } from '../clock'
import { callName } from '../content'
import { recordFact } from '../news'
import { deed } from '../social/deeds'
import { mayAttackFirst } from '../social/gates'
import type { World } from '../world'
import type { Act } from './acts'
import { attitude } from './relations'

// Reactions after a turn (M10.3; FO, chapter 10, "Gepland (M10.3)", point 7).
// What an insult, a threat or a lie found out does is the engine's call, from
// attitude and character: walk away (the talk ends and they really go), no
// service for the rest of the day, a shout for help, or an attack through the
// same gate as a grievance. The voice gets it as a decision and words it. An
// insult is a deed that counts, in their regard and in gossip.

export type Reaction = 'walk_away' | 'no_service' | 'call_help' | 'attack' | 'let_pass'

const DAY = 24 * 60

/** What provoked it, if anything: an insult, a threat, or a lie found out. */
export function provocation(act: Act, opts: { caughtLie?: boolean; failedThreat?: boolean }): 'insult' | 'threat' | 'lie' | undefined {
  if (opts.caughtLie) return 'lie'
  if (act === 'Insult') return 'insult'
  if (act === 'Intimidate' && opts.failedThreat !== false) return 'threat'
  return undefined
}

/** Whether they keep a trade here: then an insult closes it to the stranger for the day. */
function servesHere(world: World, npcId: string): boolean {
  const here = world.npcState(npcId).location
  return [...world.content.locations.values()].some((l) => l.services.some((s) => s.provider === npcId && (l.id === here || s.premises.includes(here))))
}

/**
 * The engine decides, before the voice speaks: the deed counts, it is news
 * among whoever was there, and the reaction follows from who they are.
 */
export function react(world: World, npcId: string, what: 'insult' | 'threat' | 'lie'): { reaction: Reaction; decision: string } {
  const npc = world.npc(npcId)
  const name = callName(npc)
  const s = world.npcState(npcId)
  const here = s.location
  deed(world, npcId, what === 'insult' ? 'insult' : what === 'threat' ? 'threat' : 'caught_lying')
  const others = world.npcsAt(here).filter((id) => id !== npcId && world.npcState(id).activity !== 'asleep')
  const done = { insult: 'insulted', threat: 'threatened', lie: 'was caught lying to' }[what]
  // A shout for help is heard next door; anything else only by who was there.
  const help = what === 'threat' && npc.personality.courage <= 0 && !npc.child
  recordFact(world, {
    kind: what === 'insult' ? 'insulted' : what === 'threat' ? 'threatened' : 'lied_to',
    about: [npcId],
    place: here,
    belang: 1,
    loud: help,
    title: `the stranger and ${name}`,
    text: { precise: `The stranger ${done} ${name}${help ? `, and ${name} shouted for help` : ''}.`, village: `The stranger ${done} ${name}, they say.`, far: 'A stranger making trouble.' },
    ...(help ? {} : { witnesses: [npcId, ...others] }),
  })
  // The mood lasts the day.
  const endOfDay = world.now - minuteOfDay(world.now) + DAY
  s.mood = { value: -3, until: endOfDay, reason: `the stranger ${done} you` }
  if (help) return { reaction: 'call_help', decision: `The stranger threatened you. You shout for help, loud enough for the neighbours, and back away.` }
  if (mayAttackFirst(world, npcId, { provoked: true })) {
    const made = agree(world, { kind: 'attack', by: npcId, to: 'player', source: 'rules', what: `go for the stranger, who ${done} ${name}`, terms: { target: 'player', reason: what === 'insult' ? 'the insult' : what === 'threat' ? 'the threat' : 'the lie' } })
    if ('id' in made) return { reaction: 'attack', decision: 'That was one word too many. You go for the stranger. Say so in a few words.' }
  }
  if (servesHere(world, npcId)) {
    s.noService = endOfDay
    return { reaction: 'no_service', decision: `You will not serve the stranger again today. Say so, coldly.` }
  }
  const band = attitude(world, npcId).band
  if ((band === 'Warm' || band === 'Devoted') && npc.personality.temper <= 0) return { reaction: 'let_pass', decision: 'It hurts, but you let it pass. Say so.' }
  return { reaction: 'walk_away', decision: `You have heard enough. You turn your back on the stranger and walk off. Say one short last thing.` }
}

/** After the words: whoever walks away really goes, out of the place and away from it for an hour. */
export function walkAway(world: World, npcId: string): string {
  const s = world.npcState(npcId)
  const here = s.location
  const exits = Object.values(world.location(here).exits)
  const home = world.npc(npcId).home
  const toward = world.route(here, home)?.nodes[1] ?? exits[0]?.to
  s.avoid = { place: here, until: world.now + 60 }
  s.plan = []
  s.planGoal = undefined
  s.busyUntil = world.now
  if (toward) s.location = toward
  return world.say(`{name} turns on {their} heel and walks off.`, npcId)
}
