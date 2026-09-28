import { knob } from './knobs'
import type { LlmRequest } from './dialogue/llm'
import type { Output } from './commands'
import { callName } from './content'
import { attitude } from './dialogue/relations'
import { factById, heardBy, juiceNow, passOn, versionOf } from './news'
import { tieTo } from './people'
import { mayLie } from './social/gates'
import type { Fact } from './state'
import type { World } from './world'
import { swearRight } from './dialogue/guard'
import { fixNotHere, oathsFor, strangeWords } from './dialogue/voice'

// Greetings and chats where the player is (M8.2, task 11; design: signalen en
// nasleep, "Vreemden, geloof en vergeten", part 6). Only at the player's
// place: two people who meet greet each other by their bond, and if both
// have time, like each other well enough and one has news the other has not
// heard, they stop for a chat, and the passing on of that news happens in it.
// A player who walks in sees it; LISTEN catches the gist; TALK breaks it off.
// About the player or a secret they lower their voices, or change the
// subject. Templates only. Far from the player nothing changes.

const HOUR = 60

export interface Chat {
  teller: string
  listener: string
  place: string
  fact: string
  started: number
  until: number
  /** How often the player listened in (M9.1): who stays to listen may hear a line in the listener's own voice. */
  heard?: number
  /** What the player caught: for that line. */
  said?: string
}

function chatter(world: World) {
  return (world.state.chatter ??= { greeted: {}, chats: [] })
}

/** Every five minutes: greetings and chats at the player's place, and chats that end. */
export function chatterNearPlayer(world: World): void {
  const state = world.state.chatter
  // Chats that are over: the news is passed on.
  if (state?.chats.length) {
    for (const chat of state.chats.filter((c) => world.now >= c.until)) passOn(world, chat.teller, chat.listener, chat.fact)
    state.chats = state.chats.filter((c) => world.now < c.until && world.present(c.teller) && world.present(c.listener))
  }
  const here = world.state.player.location
  const people = world.npcsAt(here).filter((id) => {
    const s = world.state.npcs[id]!
    return s.activity !== 'asleep' && world.state.talk?.npc !== id && !world.npc(id).quirks.includes('spirit')
  })
  if (people.length < 2) return
  const store = chatter(world)
  for (const [key, t] of Object.entries(store.greeted)) if (world.now - t >= knob(world, 'chatter.greet_every_hours') * HOUR) delete store.greeted[key]
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      const [a, b] = [people[i]!, people[j]!]
      // They meet: one of them has just come in. A greeting at once; a chat once they have time.
      const key = `${a}|${b}`
      const last = store.greeted[key]
      if ((justCame(world, a, here, 6) || justCame(world, b, here, 6)) && (last === undefined || world.now - last >= knob(world, 'chatter.greet_every_hours') * HOUR)) {
        store.greeted[key] = world.now
        world.emit('greeting', here, greeting(world, a, b), a)
      }
      const talked = store.greeted[`chat:${key}`]
      if ((justCame(world, a, here, 20) || justCame(world, b, here, 20)) && (talked === undefined || world.now - talked >= knob(world, 'chatter.greet_every_hours') * HOUR) && startChat(world, a, b, here)) store.greeted[`chat:${key}`] = world.now
    }
  }
}

/** Came to this place in the last so many minutes. */
function justCame(world: World, id: string, place: string, minutes: number): boolean {
  const left = world.state.npcs[id]!.left
  return Boolean(left && left.location !== place && world.now - left.t <= minutes)
}

/** One line by their bond: warm, a nod, nothing, or out of each other's way. */
function greeting(world: World, a: string, b: string): string {
  const [na, nb] = [callName(world.npc(a)), callName(world.npc(b))]
  const bond = world.state.bonds?.[a]?.[b]
  const tie = tieTo(world, a, b)
  if (tie?.role === 'rival' || bond?.grudge !== undefined || (bond?.fear ?? 0) >= 40) return `${na} and ${nb} keep out of each other's way.`
  if (tie && (tie.kind === 'family' || tie.kind === 'love')) return `${na} and ${nb} greet each other warmly.`
  if ((bond?.affinity ?? 0) >= 50 || (tie?.kind === 'friend' && tie.bond >= 2)) return `${na} claps ${nb} on the shoulder.`
  const home = (id: string) => world.content.locations.get(world.npc(id).home)?.area
  if ((bond?.affinity ?? 0) >= 10 || home(a) === home(b)) return `${na} nods to ${nb}.`
  return `${na} and ${nb} pass each other without a word.`
}

/** Free for a chat: not on the way somewhere, not at work, not in one already. */
function hasTime(world: World, id: string): boolean {
  const s = world.state.npcs[id]!
  const step = s.plan[0]
  // Walking on is no time for a chat; having arrived here is.
  if ((step?.kind === 'move' && (step.to !== s.location || s.passing)) || (step?.kind === 'spend' && step.activity === 'work') || s.following) return false
  return !(world.state.chatter?.chats ?? []).some((c) => c.teller === id || c.listener === id)
}

/** Whether they like each other well enough to stop and talk. */
function friendly(world: World, a: string, b: string): boolean {
  const bond = world.state.bonds?.[a]?.[b]
  const tie = tieTo(world, a, b)
  if (tie?.role === 'rival' || bond?.grudge !== undefined) return false
  return (bond?.affinity ?? 0) >= 20 || Boolean(tie && tie.bond >= 1) || (world.npc(a).household !== undefined && world.npc(a).household === world.npc(b).household)
}

/** The juiciest news one of them has that the other has not heard. */
function newsBetween(world: World, a: string, b: string): { teller: string; listener: string; fact: Fact } | undefined {
  let best: { teller: string; listener: string; fact: Fact; juice: number } | undefined
  for (const [teller, listener] of [
    [a, b],
    [b, a],
  ] as const) {
    const known = heardBy(world, teller)
    const theirs = heardBy(world, listener)
    const quiet = world.state.silenced?.[teller] ?? []
    for (const [id, h] of Object.entries(known)) {
      const fact = factById(world, id)
      if (!fact || theirs[id] || quiet.includes(id) || h.stance === 'rejects') continue
      const juice = juiceNow(world, fact)
      if (juice >= 0.1 && (!best || juice > best.juice || (juice === best.juice && id < best.fact.id))) best = { teller, listener, fact, juice }
    }
  }
  return best
}

function startChat(world: World, a: string, b: string, place: string): boolean {
  if (!hasTime(world, a) || !hasTime(world, b) || !friendly(world, a, b) || world.npc(a).child !== world.npc(b).child) return false
  const news = newsBetween(world, a, b)
  if (!news) return false
  const minutes = 10 + Math.floor(world.rng.next('chatter') * 21)
  for (const [id, other] of [
    [a, b],
    [b, a],
  ] as const) {
    const s = world.npcState(id)
    s.plan = [{ kind: 'spend', minutes, activity: 'socialize', label: `talking with ${callName(world.npc(other))}` }]
    s.planGoal = undefined
    s.busyUntil = world.now
  }
  chatter(world).chats.push({ teller: news.teller, listener: news.listener, place, fact: news.fact.id, started: world.now, until: world.now + minutes })
  world.emit('chat', place, `${callName(world.npc(a))} and ${callName(world.npc(b))} stand talking in ${world.location(place).name}.`, a)
  return true
}

/** The chats at a place, for the description of the room. */
export function chatsAt(world: World, place: string): string[] {
  return (world.state.chatter?.chats ?? []).filter((c) => c.place === place && world.now < c.until).map((c) => `${callName(world.npc(c.teller))} and ${callName(world.npc(c.listener))} stand talking.`)
}

/** About the player, or something kept quiet: not for the player's ears. */
function private_(world: World, chat: Chat, fact: Fact): boolean {
  const aboutPlayer = fact.about.includes('player') || /\bthe stranger\b/i.test(fact.text.precise)
  const secret = fact.truth === false || (world.state.silenced?.[chat.teller] ?? []).includes(fact.id) || fact.kind.startsWith('secret')
  return aboutPlayer || secret
}

/**
 * LISTEN: the gist of a chat here, one level vaguer than the teller knows it.
 * About the player or a secret they lower their voices; one who lies easily
 * changes the subject to something else.
 */
export function listen(world: World): Output[] {
  const chat = (world.state.chatter?.chats ?? []).find((c) => c.place === world.state.player.location && world.now < c.until)
  if (!chat) return [{ kind: 'narration', text: 'Nobody here is talking about anything worth listening to.' }]
  const [teller, listener] = [callName(world.npc(chat.teller)), callName(world.npc(chat.listener))]
  let fact = factById(world, chat.fact)
  if (!fact) return [{ kind: 'narration', text: `${teller} and ${listener} are talking about nothing much.` }]
  if (private_(world, chat, fact)) {
    if (!mayLie(world, chat.teller)) return [{ kind: 'narration', text: `${teller} sees you and lowers ${world.say('{their}', chat.teller)} voice. You catch nothing but "... later."` }]
    // Someone who lies easily changes the subject.
    const other = Object.keys(heardBy(world, chat.teller))
      .map((id) => factById(world, id))
      .filter((f): f is Fact => Boolean(f) && !private_(world, chat, f!))
      .sort((x, y) => juiceNow(world, y) - juiceNow(world, x))[0]
    if (!other) return [{ kind: 'narration', text: `${teller} breaks off as you come near, and talks about the weather.` }]
    fact = other
  }
  const theirs = heardBy(world, chat.teller)[fact.id]
  const level = Math.max(1, (theirs?.level ?? 2) - 1) as 1 | 2 | 3
  const mine = heardBy(world, 'player')
  mine[fact.id] ??= { level, reliability: 0.7, from: chat.teller, t: world.now }
  ;(world.state.player.journal ??= {})[fact.id] ??= world.now
  const said = versionOf(fact, { level, reliability: 0.7, from: chat.teller, t: world.now })
  const noticed = attitude(world, chat.teller).band === 'Hostile' || attitude(world, chat.teller).band === 'Unfriendly' ? ` ${teller} gives you a look.` : ''
  chat.heard = (chat.heard ?? 0) + 1
  chat.said = said
  if (chat.heard > 1) return [{ kind: 'narration', text: `You stay where you are. ${teller} is still going on about it to ${listener}: "${said}"${noticed}` }]
  return [{ kind: 'narration', text: `You stand close enough to hear ${teller} telling ${listener}: "${said}"${noticed}` }]
}

/** A chat the player has listened to for a while, still going on here: one line of the listener's own may be heard (M9.1). */
export function longListen(world: World): Chat | undefined {
  return (world.state.chatter?.chats ?? []).find((c) => c.place === world.state.player.location && world.now < c.until && (c.heard ?? 0) > 1 && c.said)
}

/**
 * The request for that one line (M9.1; design "Groeten en praatjes"): the
 * small model, the listener's card, what was said, one sentence back in their
 * voice. Optional: without a model the template is all there is.
 */
export function chatLineRequest(world: World, chat: Chat, frame: string): LlmRequest {
  const listener = world.npc(chat.listener)
  const teller = world.npc(chat.teller)
  return {
    role: 'brain',
    system: `${frame}\n\nYou write one line of speech in a text game: what a villager says back in a chat the player overhears. One sentence, at most 20 words, in their own voice. Only what the line itself says; no names but the two of them. JSON only.`,
    prompt: `${listener.name} (${listener.short}; ${listener.speech ?? 'plain speech'}) hears ${callName(teller)} say: "${chat.said}"\nWhat does ${callName(listener)} say back?`,
    schemaName: 'chat_line',
    schema: { type: 'object', additionalProperties: false, required: ['line'], properties: { line: { type: 'string' } } },
    maxTokens: 80,
    meta: { listener: callName(listener), teller: callName(teller), said: chat.said },
  }
}

/** The line as it may be shown: one sentence of at most 25 words, or nothing. */
export function chatLine(world: World, chat: Chat, text: string): Output[] {
  let line: string | undefined
  try {
    line = (JSON.parse(text) as { line?: unknown }).line as string | undefined
  } catch {
    return []
  }
  if (typeof line !== 'string' || !line.trim() || line.split(/\s+/).length > 25 || /[\n{}]/.test(line)) return []
  // The world's own guard (M10.10): the listener's oaths, what people here say instead, and nothing that is not here.
  const fitted = fixNotHere(world, swearRight(line.trim(), oathsFor(world, chat.listener))).text
  if (strangeWords(world, fitted).length) return []
  return [{ kind: 'narration', text: `${callName(world.npc(chat.listener))} says: "${fitted.replace(/^"|"$/g, '')}"` }]
}

/** TALK breaks a chat off: whoever is spoken to turns to the player. */
export function breakOff(world: World, npcId: string): void {
  const state = world.state.chatter
  if (!state) return
  for (const chat of state.chats.filter((c) => c.teller === npcId || c.listener === npcId)) {
    for (const id of [chat.teller, chat.listener]) {
      const s = world.state.npcs[id]
      if (s) s.plan = []
    }
  }
  state.chats = state.chats.filter((c) => c.teller !== npcId && c.listener !== npcId)
}
