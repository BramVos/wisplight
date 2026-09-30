import { personColour } from './colour'
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

/**
 * Whether the player knows of someone (M10.8): talked with them or knows them
 * from their background, saw them, or was told of them. Only these are under
 * People in the journal.
 */
export function knowsOfPerson(world: World, npcId: string): boolean {
  if ((world.state.relations?.[npcId]?.familiarity ?? 0) > 0) return true
  if (world.state.player.people?.[npcId]?.seen) return true
  return (world.state.player.sources?.[npcId]?.length ?? 0) > 0
}

/**
 * The name the player knows someone by (M10.8): the whole name once they
 * talked, as they heard it once they heard it ("Geesje"), else who they are to
 * see, "the steward" (M10.33 S: a name the stranger does not know stands nowhere).
 */
export function knownName(world: World, npcId: string): string {
  const npc = world.npc(npcId)
  if ((world.state.relations?.[npcId]?.familiarity ?? 0) > 0) return npc.name
  return world.knowsName(npcId) ? callName(npc) : publicShort(world, npcId)
}

/** The stranger knows what someone does now (M10.8): they said it, someone told, or the stranger saw them at it. */
export function learnWork(world: World, npcId: string): void {
  if (!world.content.npcs.has(npcId)) return
  note(world, npcId).work ??= world.now
}

/** Whether the stranger knows what someone does (M10.8). */
export function knowsWork(world: World, npcId: string): boolean {
  return world.state.player.people?.[npcId]?.work !== undefined
}

/** The short name the stranger may see (M10.8): a hidden trade stays out of it until it is known, "Old Tamsin". */
export function publicShort(world: World, npcId: string): string {
  const npc = world.npc(npcId)
  return npc.hidden && !knowsWork(world, npcId) ? (npc.short_public ?? callName(npc)) : npc.short
}

/**
 * Who someone is to the stranger in the talk window and the room (M10.29: the
 * name was never shown there once known): after a talk the name they know
 * and the role, "Niko Serrin, the signal technician"; before it the role alone.
 */
export function knownShort(world: World, npcId: string): string {
  const short = publicShort(world, npcId)
  // The name first once it is known, by a talk or by hearing it (M10.33 S).
  if (!world.knowsName(npcId)) return short
  const name = knownName(world, npcId)
  const call = callName(world.npc(npcId))
  if (short === name || short === call) return name
  // A short that begins with the name gives only its role after it (M10.33: "Mirte Bakker, Mirte the baker").
  const role = short.startsWith(`${call} `) ? short.slice(call.length + 1).replace(/^,\s*/, '') : short
  return `${name}, ${role}`
}

/** The player and this person are in the same place (every quarter hour, from the simulation). */
export function sawPerson(world: World, npcId: string, where: string): void {
  const n = note(world, npcId)
  n.seen = { where, t: world.now }
  // Seen at their work, at it (M10.8): the stranger knows what they do; a hidden trade shows only its cover.
  const npc = world.npc(npcId)
  const s = world.state.npcs[npcId]
  if (!npc.hidden && npc.work === where && s?.activity === 'at work') learnWork(world, npcId)
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

const UNITS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen']
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']

/** A number up to ninety-nine as words: "twenty-eight" (with a space or a hyphen). */
function numberWords(n: number): string | undefined {
  if (n <= 0 || n >= 100) return undefined
  if (n < 20) return UNITS[n]
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? `[- ]${UNITS[n % 10]}` : ''}`
}

/**
 * Whether someone said their own age in a reply (M10.29, Bram's playtest: Niko said "28" and the card still said
 * "ask"): the number, in digits or words, in a turn about them or about age.
 */
export function saysOwnAge(world: World, npcId: string, reply: string, about: boolean): boolean {
  const age = world.npc(npcId).age
  if (typeof age !== 'number' || !about) return false
  const words = numberWords(age)
  return new RegExp(`\\b(?:${age}${words ? `|${words}` : ''})\\b`, 'i').test(reply)
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
  /** Their colour (M10.29 I), as on the plan of here and in the talk window. */
  colour: string
}

/** What the player knows of someone, for the journal and the conversation window. */
export function personView(world: World, npcId: string): PersonView {
  const npc = world.npc(npcId)
  const n = world.state.player.people?.[npcId]
  const met = relation(world.state, npcId).familiarity > 0
  const view: PersonView = { name: callName(npc), often: [], met, colour: personColour(world, npcId) }
  const age = npc.age
  if (typeof age === 'number') {
    if (n?.age) view.age = { text: String(n.age.value + Math.floor((world.now - n.age.t) / YEAR)), known: true }
    else if (met || n?.seen) view.age = { text: guess(npcId, age), known: false }
  }
  // What they do, as far as the stranger knows (M10.8): the trade once known, a cover for a hidden one, else unknown.
  // A trade nobody hides is known as soon as the head of the talk says it (M10.33 F: "the medic" above, "Work ?" beside it).
  if (met || n?.seen) view.work = knowsWork(world, npcId) || !npc.hidden ? (world.content.professions.get(npc.profession)?.name ?? npc.profession) : npc.hidden && npc.cover ? npc.cover : '?'
  if (met) view.appearance = npc.appearance
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

/** The stranger now knows these two are family (M10.4): asked, told, or seen together. */
export function learnTie(world: World, a: string, b: string): void {
  const known = (world.state.player.knownTies ??= {})
  for (const [x, y] of [
    [a, b],
    [b, a],
  ] as const) {
    const list = (known[x] ??= [])
    if (!list.includes(y)) list.push(y)
  }
}

/** A child here with a parent here: the stranger sees they belong together (M10.4). */
export function seeFamily(world: World): void {
  const here = world.npcsAt(world.state.player.location)
  for (const id of here) {
    if (!world.npc(id).child) continue
    for (const tie of world.npc(id).relations) if (tie.role === 'parent' && tie.to && here.includes(tie.to)) learnTie(world, id, tie.to)
  }
}
