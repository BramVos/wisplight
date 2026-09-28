import { minuteOfDay } from '../clock'
import { isNight } from '../npc/execute'
import { callName } from '../content'
import type { World } from '../world'
import type { Act } from './acts'
import type { Packet } from './knowledge'
import { isNear, noun, ownWords, tieTo } from '../people'
import { relation, type Attitude } from './relations'

// Without a model, or when a reply fails the checks, NPCs still answer from
// designer text: the facts in their knowledge packet and these templates
// (FO, chapter 10). Everything is picked deterministically.

const WARM: Attitude[] = ['Friendly', 'Warm', 'Devoted']
const COLD: Attitude[] = ['Hostile', 'Unfriendly', 'Wary']

function pick<T>(world: World, list: T[]): T {
  return list[Math.floor(world.rng.next('fallback') * list.length)]!
}

/** The acts that ask something: only these get "Can't say I know" when the topic is unknown (M10.8). */
const ASKING = new Set<Act>(['AskAbout', 'AskDirections', 'AskOpinion', 'AskStory', 'AskRumors', 'AskAboutSelf', 'AskWork'])

export function fallbackReply(world: World, npcId: string, act: Act, packet: Packet, attitude: Attitude, text = ''): string {
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
      // A hidden trade stays hidden (M10.8): the cover, not the facts.
      if (npc.hidden && npc.cover) return `${name} straightens a little. ${quote(`I'm ${name}. Just ${npc.cover}.`)}`
      return `${name} straightens a little. ${quote(`I'm ${npc.name}. ${npc.public_facts[0] ? firstPerson(npc.public_facts[0], npc.name) : ''}`.trim())}`
    case 'AskWork': {
      if (npc.hidden && npc.cover) return `${name} shrugs. ${quote(`Me? ${npc.cover.charAt(0).toUpperCase()}${npc.cover.slice(1)}. That's all there is to it.`)}`
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

  // Where someone is, asked as such: where the speaker thinks they are comes first (M10.6).
  if (known?.where && act === 'AskDirections') return `${name} ${pick(world, ['thinks a moment.', 'nods slowly.', 'scratches an ear.'])} ${quote(known.where)}`
  if (known) {
    // Someone else's first-person story cannot be read out as one's own; fall back to the plain facts.
    // Read in the speaker's own words (M10.8): "my daughter Fenna", not the content's "Fenna Visser, the daughter of Jan".
    const fact = act === 'AskStory' && known.story && !known.toldBy ? known.story.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ') : ownWords(world, npcId, known.facts.slice(0, 2).join(' '))
    return `${name} ${pick(world, ['thinks a moment.', 'nods slowly.', 'scratches an ear.'])} ${quote(fact)}`
  }
  if (packet.unknown.length > 0) {
    // A wish, a statement or a request about something they do not know is no question (M10.8): a nod, not a shrug.
    if (!ASKING.has(act) && !/\?\s*$/.test(text)) return acknowledge(world, name, text, warm, cold)
    const referral = packet.referral ? ` Ask ${packet.referral.call}, maybe.` : ''
    return `${name} shrugs. ${quote(`Can't say I know.${referral}`)}`
  }
  if (act === 'AskRumors') return `${name} shakes ${npc.pronoun === 'she' ? 'her' : npc.pronoun === 'he' ? 'his' : 'their'} head. ${quote('Nothing you would care about.')}`
  return `${name} ${pick(world, ['nods.', 'shrugs.', 'grunts.'])} ${quote(pick(world, npc.examples.length ? npc.examples : ['Hm.']))}`
}

/** Said, not asked: a hope is hoped along with, anything else nodded or grunted at. */
function acknowledge(world: World, name: string, text: string, warm: boolean, cold: boolean): string {
  if (/^(i hope|i wish|i trust|let'?s hope|may the|god willing|ik hoop|hopelijk|laten we hopen)\b/i.test(text.trim())) return `${name} nods. "${warm ? "Let's hope so." : 'We will see.'}"`
  if (cold) return `${name} grunts.`
  return `${name} ${pick(world, ['nods.', 'nods slowly.', 'makes a noise that might mean yes.'])}${warm ? ' "Mm. Maybe so."' : ''}`
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
