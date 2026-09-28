import { knob } from './knobs'
import { GameClock } from './clock'
import { callName, type RelationRole } from './content'
import type { Act } from './dialogue/acts'
import type { Packet } from './dialogue/knowledge'
import { INVERSE, ties } from './people'
import type { SketchFigure } from './state'
import type { World } from './world'

// Sketch figures (M10.9, part B; design: lore and world change, "De wereld
// buiten de kaart"). Beside a far place, the voice may name one new person in
// a talk about the speaker's family, trade or past: a cousin in Graafhaven, an
// old master in Stavermouth. Only with a bond from the world's list, a place
// that exists and one line; the engine checks it and keeps it within bounds,
// as it does far places. The figure is part of this game's lore: a page in
// the journal under the speaker, one of the speaker's own people from then on,
// and in the chronicler's input, who may make them a person when the stranger
// comes to their place, or bring them in a storyline (a letter, a visit).

const DAY = 24 * 60
const SEASON = 91 * DAY
const MAX_SKETCHES = 60

/** The bonds of a world without its own list: what someone new is to the speaker. */
const DEFAULT_BONDS: Record<string, RelationRole> = {
  cousin: 'kin',
  aunt: 'kin',
  uncle: 'kin',
  'old master': 'teacher',
  'old pupil': 'pupil',
  'trading partner': 'acquaintance',
  'old friend': 'friend',
  debtor: 'debtor',
  creditor: 'creditor',
}

/** Acts that are about the speaker: who they are, their trade, a story of theirs. */
const OWN_ACTS: Act[] = ['AskAboutSelf', 'AskWork', 'AskStory']
/** Words of family, trade and the past, in English and Dutch: the stranger asked about them. */
const DOMAIN_WORDS =
  /\b(family|kin|kinsfolk|relatives?|cousins?|brothers?|sisters?|mother|father|parents?|uncles?|aunts?|sons?|daughters?|wife|husband|trade|trading|partners?|business|customers?|goods|owes?|owed|debts?|master|apprentice|learn(?:ed|t)|young|youth|grew up|born|came from|used to|familie|neef|nicht|broer|zus|moeder|vader|oom|tante|handel|klanten|schuld|meester|leerling|vroeger|jong)\b/i

export function sketches(world: World): SketchFigure[] {
  return world.state.lore?.people ?? []
}

export function sketchById(world: World, id: string): SketchFigure | undefined {
  return world.state.lore?.people?.find((s) => s.id === id)
}

/** The world's bonds for someone new, as what they are to the speaker. */
export function sketchBonds(world: World): Record<string, RelationRole> {
  return world.content.world.sketch?.bonds ?? DEFAULT_BONDS
}

/**
 * Whether this turn of a talk is about the speaker's family, trade or past:
 * the stranger asks who they are, what they do or for a story of theirs; the
 * packet names the speaker or one of their people; or the stranger's words do.
 */
export function sketchOpen(world: World, npcId: string, act: Act, packet: Packet, text: string): boolean {
  if (!world.content.npcs.has(npcId)) return false
  if (OWN_ACTS.includes(act)) return true
  const own = new Set(ties(world, npcId).map((t) => t.id).filter(Boolean))
  if (packet.known.some((k) => k.topic === npcId || own.has(k.topic))) return true
  return DOMAIN_WORDS.test(text)
}

/** The places someone new may live: the speaker's own area first, the region's villages, and the far places the speaker knows. */
export function sketchPlaces(world: World, npcId: string): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = []
  const add = (id: string, name: string) => {
    if (!out.some((p) => p.id === id || p.name.toLowerCase() === name.toLowerCase())) out.push({ id, name })
  }
  const home = world.content.locations.get(world.npc(npcId).home)?.area
  // People live in villages and towns; not on a road, in the wild or at an inn.
  const settled = (kind: string) => kind !== 'wilderness' && kind !== 'route' && kind !== 'inn'
  const own = home ? world.content.areas.get(home) : undefined
  if (own && settled(own.kind) && !own.topic) add(`area_${own.id}`, own.name)
  for (const a of [...world.content.areas.values()].sort((x, y) => x.id.localeCompare(y.id))) if (settled(a.kind) && !a.topic) add(`area_${a.id}`, a.name)
  // Far places: the world's own (topics with a place on the map beyond it), the realms' trading towns, and those named in this game.
  for (const t of [...world.content.topics.values()].sort((x, y) => x.id.localeCompare(y.id))) if (t.kind === 'place' && t.pos && !world.content.areas.has(t.id)) add(t.id, t.name)
  for (const o of [...world.content.outlands.values()].sort((x, y) => x.id.localeCompare(y.id))) add(o.topic ?? o.id, o.name)
  for (const f of world.state.lore?.far ?? []) if (f.known_by.includes(npcId)) add(f.id, f.name)
  return out.slice(0, 24)
}

/** What the voice gives for someone new (the reply's `person`). */
export interface NamedPerson {
  name: string
  pronoun: string
  bond: string
  place: string
  what: string
}

/** Whether a reply names someone new (an empty name or bond none is nobody). */
export function namesSomeone(person: NamedPerson | undefined): person is NamedPerson {
  return Boolean(person && person.name.trim() && person.bond !== 'none' && person.place !== 'none')
}

/**
 * Why someone new cannot stand, or undefined when they can. `taken` says
 * whether a name is already a word of the world (a topic, a person, a place).
 */
export function checkSketch(world: World, npcId: string, person: NamedPerson, reply: string, open: boolean, sketchedThisTalk: boolean, taken: (name: string) => boolean): string | undefined {
  const name = person.name.trim()
  if (!open) return 'you named someone new, but this talk is not about your family, your trade or your past. Name only people you know.'
  if (sketchedThisTalk) return 'you already named someone new in this talk. Name only people you know.'
  if (!/^\p{Lu}\p{Ll}+(?:-\p{Lu}?\p{Ll}+)?$/u.test(name)) return `"${name}" is not a first name. Give only a first name, without a family name.`
  if (!new RegExp(`(^|[^\\p{L}])${name}(?=$|[^\\p{L}])`, 'u').test(reply)) return `you gave ${name} in person, but not in your reply.`
  if (taken(name) || [...world.content.npcs.values()].some((n) => n.name === name || callName(n) === name) || sketches(world).some((s) => s.name === name)) return `${name} is already someone in this world. Name someone else, or only people you know.`
  if (!(person.bond in sketchBonds(world))) return `"${person.bond}" is not a bond you may give. Use one of: ${Object.keys(sketchBonds(world)).join(', ')}.`
  if (!sketchPlaces(world, npcId).some((p) => p.name === person.place)) return `"${person.place}" is not a place you may give.`
  if (!sketchRoom(world, npcId)) return 'you may not name anyone new now. Name only people you know.'
  return undefined
}

/** Whether there is room for someone new from this speaker: two a day, a few in all, a handful in their area a season, and a ceiling. */
export function sketchRoom(world: World, npcId: string): boolean {
  const all = sketches(world)
  const mine = all.filter((s) => s.of === npcId)
  const area = world.content.locations.get(world.npc(npcId).home)?.area
  const inArea = all.filter((s) => world.now - s.t < SEASON && world.content.npcs.has(s.of) && world.content.locations.get(world.npc(s.of).home)?.area === area)
  return mine.filter((s) => world.now - s.t < DAY).length < knob(world, 'sketches.per_day') && mine.length < knob(world, 'sketches.per_speaker') && inArea.length < knob(world, 'sketches.per_area_season') && all.length < MAX_SKETCHES
}

/** Someone new, fixed in this game's lore; the talk puts them in the journal and the speaker's words. */
export function registerSketch(world: World, npcId: string, person: NamedPerson, reply: string, idTaken: (id: string) => boolean): SketchFigure {
  const lore = (world.state.lore ??= { far: [] })
  const name = person.name.trim()
  const base = `sketch_${name.toLowerCase().replace(/[^\p{L}]+/gu, '_')}_${npcId.replace(/^npc_/, '')}`
  let id = base
  for (let n = 2; idTaken(id); n++) id = `${base}_${n}`
  const place = sketchPlaces(world, npcId).find((p) => p.name === person.place)!
  const line = reply.split(/(?<=[.!?])\s+/).find((s) => s.includes(name)) ?? reply
  const pronoun = person.pronoun === 'she' || person.pronoun === 'he' ? person.pronoun : 'they'
  const what = person.what.replace(/["“”.]/g, '').trim().slice(0, 60)
  const sketch: SketchFigure = { id, name, pronoun, bond: person.bond, of: npcId, place: place.id, placeName: place.name, what, line: line.replace(/["“”]/g, '').trim().slice(0, 200), t: world.now, known_by: [npcId] }
  ;(lore.people ??= []).push(sketch)
  // From now on one of the speaker's own people.
  world.tieCache.delete(npcId)
  return sketch
}

/** "Gerrit's cousin, a bargeman in Graafhaven": who they are, in one phrase. */
export function sketchPhrase(world: World, s: SketchFigure): string {
  const speaker = world.content.npcs.has(s.of) ? callName(world.npc(s.of)) : 'someone'
  return `${speaker}'s ${s.bond}${s.what ? `, ${s.what}` : ''} in ${s.placeName}`
}

/** The journal page of someone named: who they are, from whom and when; no family name and no map. */
export function sketchLines(world: World, s: SketchFigure): string[] {
  const p = new GameClock(s.t).parts
  const speaker = world.content.npcs.has(s.of) ? callName(world.npc(s.of)) : 'someone'
  const letters = (s.letters ?? []).map((l) => `A letter came from ${s.name}: ${l.text}`)
  return [`${sketchPhrase(world, s)}; heard from ${speaker}, ${p.day} ${world.calendar.months[p.month - 1]}.`, `"${s.line}"`, ...letters]
}

/** What someone new is to the speaker, as a tie while they are only named (once a person, their own relation says it). */
export function sketchTies(world: World, npcId: string): { name: string; pronoun: 'she' | 'he' | 'they'; role: RelationRole; note: string }[] {
  const bonds = sketchBonds(world)
  return sketches(world)
    .filter((s) => s.of === npcId && !s.npc)
    .map((s) => ({ name: s.name, pronoun: s.pronoun, role: bonds[s.bond] ?? 'acquaintance', note: `Your ${s.bond}${s.what ? `, ${s.what}` : ''} in ${s.placeName}; you spoke of ${{ she: 'her', he: 'him', they: 'them' }[s.pronoun]} to the stranger` }))
}

/** For the speaker and those who heard: who someone named is, and what was said. */
export function sketchFacts(world: World, s: SketchFigure, npcId: string): string[] {
  const them = { she: 'her', he: 'him', they: 'them' }[s.pronoun]
  if (s.of === npcId) return [`${s.name} is your ${s.bond}${s.what ? `, ${s.what}` : ''} in ${s.placeName}.`, `What you said of ${them}: "${s.line}"`]
  return [`${s.name} is ${sketchPhrase(world, s)}.`, `What was said: "${s.line}"`]
}

/**
 * The raw content of someone named, made a person (M10.9): their first name
 * and a family name of the world, what they were said to be, and the bond as
 * a relation to the speaker, so both keep the same story. The same shape as
 * the people of a far place; checked like any content before it enters.
 */
export function sketchNpc(world: World, s: SketchFigure, at: { id: string; home: string; work: string; area: string; profession: string }, words?: { name?: string; looks?: string; speech?: string; fact?: string }): Record<string, unknown> {
  const rng = (lo: number, hi: number) => world.rng.int('growth', lo, hi)
  const family = world.content.world.names?.family ?? ['Smit']
  const surname = words?.name?.trim().split(/\s+/).slice(1).join(' ')
  const fullName = surname && /^[\p{L}' -]{2,30}$/u.test(surname) ? `${s.name} ${surname}` : `${s.name} ${family[rng(0, family.length - 1)]}`
  const pronoun = s.pronoun === 'they' ? (rng(0, 1) ? 'she' : 'he') : s.pronoun
  const speaker = world.npc(s.of)
  const role = sketchBonds(world)[s.bond] ?? 'acquaintance'
  return {
    id: at.id,
    name: fullName,
    short: `${s.name}${s.what ? `, ${s.what.replace(/^(a|an) /, '')}` : ''}`.slice(0, 60),
    pronoun,
    age: Math.max(18, Math.min(80, speaker.age + rng(-15, 15))),
    profession: at.profession,
    home: at.home,
    work: at.work,
    fame: 0,
    appearance: words?.looks && words.looks.length < 300 ? words.looks : `A ${pronoun === 'she' ? 'woman' : 'man'} of ${s.placeName} with a look of ${callName(speaker)} about ${pronoun === 'she' ? 'her' : 'him'}.`,
    personality: { warmth: rng(-1, 2), courage: rng(-1, 1), honesty: rng(-1, 1), temper: rng(-1, 1), curiosity: rng(0, 2), diligence: rng(0, 2) },
    aliases: [s.name.toLowerCase()],
    public_facts: [words?.fact && words.fact.length < 200 ? words.fact : `${s.name} is ${sketchPhrase(world, s)}.`],
    ...(words?.speech && words.speech.length < 200 ? { speech: words.speech } : {}),
    // What the speaker is to them: the other side of the bond.
    relations: [{ to: s.of, role: INVERSE[role], bond: 1 }],
    money: 30,
    inventory: {},
    knows_areas: [at.area],
    portrait: 'generic',
    ...(speaker.faith ? { faith: speaker.faith } : {}),
  }
}

/** The trade someone named has, from what they were said to be: "a bargeman" is a boatman where the world has no bargemen. */
export function sketchProfession(world: World, s: SketchFigure, fallback: string): string {
  const said = s.what.toLowerCase()
  const trades = [...world.content.professions.values()].sort((a, b) => a.id.localeCompare(b.id))
  const found = trades.find((p) => said.includes(p.name.toLowerCase()) || said.includes(p.id.replace(/_/g, ' ')))
  return found?.id ?? fallback
}
