import { callName } from './content'
import { attitude, relation } from './dialogue/relations'
import type { PersonNote } from './state'
import type { World } from './world'

// What the player knows of someone from seeing and asking them (after the M8
// playtest): where they were last seen and where they are often, and their age,
// first as a guess from how they look and later as a fact when they tell it.
// It grows in the journal and beside a conversation, and never leaks: only what
// the player saw or was told.

const YEAR = 365 * 24 * 60
/** Only the places someone is seen most are kept. */
const KEEP_PLACES = 5

function note(world: World, npcId: string): PersonNote {
  return ((world.state.player.people ??= {})[npcId] ??= {})
}

/** The player and this person are in the same place (every quarter hour, from the simulation). */
export function sawPerson(world: World, npcId: string, where: string): void {
  const n = note(world, npcId)
  n.seen = { where, t: world.now }
  const places = (n.places ??= {})
  places[where] = (places[where] ?? 0) + 1
  const ranked = Object.entries(places).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (ranked.length > KEEP_PLACES) n.places = Object.fromEntries(ranked.slice(0, KEEP_PLACES))
}

/** The player asked someone's age and they answered: known from now on, and it grows with the years. */
export function toldAge(world: World, npcId: string): void {
  const age = world.npc(npcId).age
  if (typeof age === 'number') note(world, npcId).age = { value: age, t: world.now }
}

/** Whether the player's words ask for someone's age, and the person is willing to say. */
export function asksAge(world: World, npcId: string, text: string): boolean {
  if (!/\b(how old|your age|hoe oud|je leeftijd|uw leeftijd)\b/i.test(text)) return false
  return attitude(world, npcId).band !== 'Hostile'
}

export interface PersonView {
  name: string
  /** "about 30 to 40?" as a guess, "34" once told. */
  age?: { text: string; known: boolean }
  work?: string
  appearance?: string
  lastSeen?: { where: string; ago: string }
  often: string[]
  met: boolean
}

/** What the player knows of someone, for the journal and the conversation window. */
export function personView(world: World, npcId: string): PersonView {
  const npc = world.npc(npcId)
  const n = world.state.player.people?.[npcId]
  const met = relation(world.state, npcId).familiarity > 0
  const view: PersonView = { name: callName(npc), often: [], met }
  const age = npc.age
  if (typeof age === 'number') {
    if (n?.age) view.age = { text: String(n.age.value + Math.floor((world.now - n.age.t) / YEAR)), known: true }
    else if (met || n?.seen) view.age = { text: guess(npcId, age), known: false }
  }
  if (met) {
    view.work = world.content.professions.get(npc.profession)?.name ?? npc.profession
    view.appearance = npc.appearance
  }
  if (n?.seen) view.lastSeen = { where: world.location(n.seen.where).name, ago: ago(world.now - n.seen.t) }
  if (n?.places) {
    view.often = Object.entries(n.places)
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([where]) => world.location(where).name)
  }
  return view
}

/** A guess from how someone looks: a band of ten years, not always centred on the truth. */
function guess(npcId: string, age: number): string {
  if (age < 13) return 'a child?'
  let hash = 0
  for (const c of npcId) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  const low = Math.max(15, Math.floor((age - (hash % 2 ? 3 : 7)) / 5) * 5)
  return `about ${low} to ${low + 10}?`
}

function ago(minutes: number): string {
  if (minutes < 30) return 'just now'
  if (minutes < 120) return 'an hour ago'
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} hours ago`
  const days = Math.round(minutes / (24 * 60))
  return days === 1 ? 'yesterday' : `${days} days ago`
}
