import { minuteOfDay } from '../clock'
import { isNight } from '../npc/execute'
import { callName } from '../content'
import type { World } from '../world'
import type { Act } from './acts'
import type { Packet } from './knowledge'
import { isNear, noun, tieTo } from '../people'
import { relation, type Attitude } from './relations'

// Without a model, or when a reply fails the checks, NPCs still answer from
// designer text: the facts in their knowledge packet and these templates
// (FO, chapter 10). Everything is picked deterministically.

const WARM: Attitude[] = ['Friendly', 'Warm', 'Devoted']
const COLD: Attitude[] = ['Hostile', 'Unfriendly', 'Wary']

function pick<T>(world: World, list: T[]): T {
  return list[Math.floor(world.rng.next('fallback') * list.length)]!
}

export function fallbackReply(world: World, npcId: string, act: Act, packet: Packet, attitude: Attitude): string {
  const npc = world.npc(npcId)
  const name = callName(npc)
  const warm = WARM.includes(attitude)
  const cold = COLD.includes(attitude)
  const quote = (text: string) => `"${text}"`
  const known = packet.known[0]

  const woken = world.npcState(npcId).wokenAt
  if (act === 'Greet' && woken !== undefined && world.now - woken < 60) {
    return `${name} rubs ${npc.pronoun === 'she' ? 'her' : npc.pronoun === 'he' ? 'his' : 'their'} eyes. ${quote(isNight(world.now) ? "What is it? It's the middle of the night." : 'What is it?')}`
  }

  switch (act) {
    case 'Greet':
      return cold ? `${name} gives you a short nod.` : warm ? `${name} smiles. ${quote('There you are again.')}` : `${name} nods. ${quote(timeGreeting(world.now))}`
    case 'Farewell':
      return `${name} lifts a hand. ${quote(warm ? 'Mind how you go.' : 'Go on, then.')}`
    case 'Insult':
      return `${name} gives you a long, cold look and says nothing.`
    case 'Apologize':
      return `${name} shrugs. ${quote("Well. Let's leave it.")}`
    case 'Compliment':
    case 'Flirt':
      return `${name} looks at you a moment. ${quote(warm ? "You're kind." : 'Hm.')}`
    case 'OffTopic':
      return `${name} frowns at you. ${quote("You've a strange way of talking, stranger.")}`
    case 'AskAboutSelf':
      return `${name} straightens a little. ${quote(`I'm ${npc.name}. ${npc.public_facts[0] ? firstPerson(npc.public_facts[0], npc.name) : ''}`.trim())}`
    case 'AskWork': {
      const profession = world.content.professions.get(npc.profession)?.name ?? npc.profession
      return `${name} gestures around. ${quote(`I'm the ${profession} here. It keeps me busy.`)}`
    }
    case 'Recruit':
      return `${name} laughs. ${quote("Me? I've work to do, and you're a stranger.")}`
    case 'Trade':
      return `${name} points at the goods. ${quote('Have a look. Ask what you like.')}`
  }

  // Grief is not for strangers: a dead husband or child is not something to tell a passer-by.
  const tie = known ? tieTo(world, npcId, known.topic) : undefined
  const rel = relation(world.state, npcId)
  if (tie && isNear(tie) && tie.status === 'dead' && rel.familiarity < 20 && rel.trust < 30) {
    const them = tie.pronoun === 'she' ? 'her' : tie.pronoun === 'he' ? 'him' : 'them'
    return `${name} looks away. ${quote(`My ${noun(tie)}. I'd rather not speak of ${them} to a stranger.`)}`
  }

  if (known) {
    // Someone else's first-person story cannot be read out as one's own; fall back to the plain facts.
    const fact = act === 'AskStory' && known.story && !known.toldBy ? known.story.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ') : known.facts.slice(0, 2).join(' ')
    return `${name} ${pick(world, ['thinks a moment.', 'nods slowly.', 'scratches an ear.'])} ${quote(fact)}`
  }
  if (packet.unknown.length > 0) {
    const referral = packet.referral ? ` Ask ${packet.referral.call}, maybe.` : ''
    return `${name} shrugs. ${quote(`Can't say I know.${referral}`)}`
  }
  if (act === 'AskRumors') return `${name} shakes ${npc.pronoun === 'she' ? 'her' : npc.pronoun === 'he' ? 'his' : 'their'} head. ${quote('Nothing you would care about.')}`
  return `${name} ${pick(world, ['nods.', 'shrugs.', 'grunts.'])} ${quote(pick(world, npc.examples.length ? npc.examples : ['Hm.']))}`
}

export function closingLine(world: World, npcId: string): string {
  const woken = world.npcState(npcId).wokenAt
  if (woken !== undefined && world.now - woken < 60) return world.say(`{name} yawns. "That's enough. Let me get back to my bed."`, npcId)
  return world.say(`{name} turns back to {their} own business. "That's enough talk for now. I've things to do."`, npcId)
}

/** A plain greeting that fits the hour. */
export function timeGreeting(minutes: number): string {
  const hour = Math.floor(minuteOfDay(minutes) / 60)
  if (hour >= 5 && hour < 12) return 'Morning.'
  if (hour >= 12 && hour < 18) return 'Afternoon.'
  if (hour >= 18 && hour < 23) return 'Evening.'
  return "You're up late."
}

/** "Wenna Dray fishes the water" as she would say it: "I fish the water". Only the verb after the name changes. */
export function firstPerson(fact: string, name: string): string {
  const own = fact.replace(name, 'I')
  const plain = (verb: string) =>
    verb === 'is' ? 'am' : verb === 'has' ? 'have' : verb === 'does' ? 'do' : verb === 'goes' ? 'go' : /(?:ss|sh|ch|x|z)es$/.test(verb) ? verb.slice(0, -2) : /[^aeiou]ies$/.test(verb) ? `${verb.slice(0, -3)}y` : /[^s]s$/.test(verb) ? verb.slice(0, -1) : verb
  return own.replace(/^I ([a-z]+)\b/, (_match, verb: string) => `I ${plain(verb)}`)
}
