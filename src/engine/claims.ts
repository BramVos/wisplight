import { callName } from './content'
import { applyEffect } from './dialogue/relations'
import { factById, heardBy, recordFact } from './news'
import { heardClaim } from './belief'
import type { Claim, Fact, Heard } from './state'
import type { World } from './world'

// What the player says is a claim (M10.3; FO, chapter 10, "Gepland (M10.3)",
// point 1): subject, key and value, in the form facts already have, and only
// from the world's own words. The listener hears it "from the stranger" and
// believes, doubts or rejects it by their trust and what they already know;
// they pass it on as they would any news. The game knows whether it is true.
// A lie (DECEIVE, or saying what you know is not so) is recorded as one; when
// someone finds out, by seeing for themselves or asking around, their trust
// in the stranger falls, and a lie found out goes round.

/** The keys a player's claim can have, and what each says. */
export const CLAIM_KEYS = ['state', 'working', 'at', 'alive'] as const
export type ClaimKey = (typeof CLAIM_KEYS)[number]
const STATES = ['normal', 'flooded', 'damaged', 'occupied', 'leaking']

/** What is true of a subject and key now, from the world itself, or nothing when the world does not say. */
export function truthOf(world: World, subject: string, key: string): string | undefined {
  if (key === 'state' && world.content.locations.has(subject)) return world.state.places?.[subject]?.state ?? 'normal'
  if (key === 'working' && world.content.locations.has(subject)) {
    const objects = world.location(subject).objects.filter((o) => 'broken' in world.objectState(subject, o.id) || o.state?.['broken'] !== undefined)
    if (!objects.length) return undefined
    return objects.some((o) => world.objectState(subject, o.id)['broken'] === true) ? 'no' : 'yes'
  }
  if (key === 'at' && world.content.npcs.has(subject)) return world.state.npcs[subject]?.dead ? undefined : world.state.npcs[subject]?.location
  if (key === 'alive' && world.content.npcs.has(subject)) return world.state.npcs[subject]?.dead ? 'no' : 'yes'
  return undefined
}

/** Whether a claim is in the world's words: a subject of the right kind, a known key, a value it can have. */
export function claimValid(world: World, claim: Claim): boolean {
  const { subject, key, value } = claim
  if (key === 'state') return world.content.locations.has(subject) && STATES.includes(value)
  if (key === 'working') return world.content.locations.has(subject) && ['yes', 'no'].includes(value) && truthOf(world, subject, key) !== undefined
  if (key === 'at') return world.content.npcs.has(subject) && world.content.locations.has(value)
  if (key === 'alive') return world.content.npcs.has(subject) && ['yes', 'no'].includes(value)
  return false
}

/** A location a topic stands for: the place itself, or the one place of a workshop (the mill). */
function placeFor(world: World, topic: string): string | undefined {
  if (world.content.locations.has(topic)) return topic
  return undefined
}

/**
 * The claim in the player's words, by rules: "the mill turns again", "Harmen
 * is dead", "Sijbrand is at the Goose", "the Green is flooded". Only topics
 * the words name, only the world's keys. Nothing when the words say no such
 * thing.
 */
export function parseClaim(world: World, topics: string[], text: string): Claim | undefined {
  const t = text.toLowerCase()
  const people = topics.filter((id) => world.content.npcs.has(id))
  const places = topics.map((id) => placeFor(world, id)).filter((id): id is string => !!id)
  if (/\?\s*$/.test(t)) return undefined
  const person = people[0]
  if (person) {
    if (/\b(is dead|has died|died|drowned|is drowned|was killed|is gone for good|is dood|verdronken)\b/.test(t)) return { subject: person, key: 'alive', value: 'no' }
    if (/\b(is alive|still lives|is not dead|leeft nog)\b/.test(t)) return { subject: person, key: 'alive', value: 'yes' }
    if (places[0] && /\b(is at|is in|went to|has gone to|is down at|is up at|zit in|is naar)\b/.test(t)) return { subject: person, key: 'at', value: places[0] }
  }
  const place = places[0]
  if (place) {
    if (/\b(turns again|is turning|turning again|works again|is working|is running|runs again|is fixed|is mended|is repaired|draait weer|werkt weer)\b/.test(t)) return { subject: place, key: 'working', value: 'yes' }
    if (/\b(stands still|standing still|is broken|does not turn|doesn't turn|isn't working|is not working|staat stil|is kapot)\b/.test(t)) return { subject: place, key: 'working', value: 'no' }
    if (/\b(flooded|under water|overstroomd|onder water)\b/.test(t)) return { subject: place, key: 'state', value: 'flooded' }
    if (/\b(burned|burnt|destroyed|damaged|in ruins|verwoest|afgebrand)\b/.test(t)) return { subject: place, key: 'state', value: 'damaged' }
    if (/\b(leaking|leaks|lekt)\b/.test(t)) return { subject: place, key: 'state', value: 'leaking' }
    if (/\b(taken|occupied|bezet)\b/.test(t)) return { subject: place, key: 'state', value: 'occupied' }
  }
  return undefined
}

/** A claim in plain words: "the Mill is working again". */
export function claimWords(world: World, claim: Claim): string {
  const name = world.content.npcs.has(claim.subject) ? callName(world.npc(claim.subject)) : (world.content.locations.get(claim.subject)?.name ?? claim.subject)
  switch (claim.key) {
    case 'working':
      return claim.value === 'yes' ? `${name} is working again` : `${name} is standing still`
    case 'state':
      return claim.value === 'normal' ? `${name} is all right` : `${name} is ${claim.value}`
    case 'at':
      return `${name} is at ${world.content.locations.get(claim.value)?.name ?? claim.value}`
    case 'alive':
      return claim.value === 'yes' ? `${name} is alive` : `${name} is dead`
    default:
      return `${name}: ${claim.key} ${claim.value}`
  }
}

/** Whether the player believed otherwise when saying it: then it is a lie, not a mistake. */
function playerKnowsOtherwise(world: World, claim: Claim): boolean {
  const heard = world.state.news?.heard['player'] ?? {}
  return (world.state.news?.facts ?? []).some((f) => f.claim && f.claim.subject === claim.subject && f.claim.key === claim.key && f.claim.value !== claim.value && heard[f.id] && heard[f.id]!.from === 'witness')
}

/**
 * The player says it: a fact with the claim, the stranger as its source, heard
 * by the listener and whoever is there, each judging it by their trust in the
 * stranger. Returns the fact and how the listener took it.
 */
export function playerSays(world: World, listener: string, claim: Claim, opts: { lie?: boolean; bonus?: number } = {}): { fact: Fact; stance: 'believes' | 'doubts' | 'rejects'; lie: boolean } {
  const truth = truthOf(world, claim.subject, claim.key)
  const lie = opts.lie === true || (truth !== undefined && truth !== claim.value && playerKnowsOtherwise(world, claim))
  const words = claimWords(world, claim)
  const here = world.state.player.location
  const fact = recordFact(world, {
    kind: 'said',
    about: [claim.subject, ...(claim.key === 'at' ? [claim.value] : [])],
    place: here,
    belang: 1,
    title: `the stranger saying ${words}`,
    text: { precise: `The stranger says ${words}.`, village: `The stranger says ${words}.`, far: `A stranger says ${words}.` },
    claim,
    witnesses: [],
    ...(truth !== undefined && truth !== claim.value ? { truth: false } : {}),
  })
  // Said, not seen: nobody is a witness to what it says, not even the stranger.
  delete heardBy(world, 'player')[fact.id]
  if (world.state.player.journal) delete world.state.player.journal[fact.id]
  fact.by = 'player'
  if (lie) fact.lie = true
  const hearers = [listener, ...world.npcsAt(here).filter((id) => id !== listener && world.npcState(id).activity !== 'asleep')]
  let stance: 'believes' | 'doubts' | 'rejects' = 'believes'
  for (const id of hearers) {
    const h: Heard = { level: 2, reliability: 0.8, from: 'player', t: world.now }
    heardBy(world, id)[fact.id] = h
    heardClaim(world, id, fact, h, id === listener ? (opts.bonus ?? 0) : 0)
    if (id === listener) stance = h.stance ?? 'believes'
  }
  return { fact, stance, lie }
}

/**
 * Once an hour: whoever holds a claim the stranger made and is where it can
 * be seen (at the place, or with the person) sees what is true. If the
 * stranger's word was wrong, they know what it was worth.
 */
export function claimsHour(world: World): void {
  const said = (world.state.news?.facts ?? []).filter((f) => f.by === 'player' && f.claim && f.truth === false)
  for (const fact of said) {
    const claim = fact.claim!
    for (const [who, heard] of Object.entries(world.state.news!.heard)) {
      const h = heard[fact.id]
      if (!h || h.checked || who === 'player' || !world.content.npcs.has(who) || !world.present(who)) continue
      const at = world.state.npcs[who]!.location
      const sees = claim.key === 'at' || claim.key === 'alive' ? world.state.npcs[claim.subject]?.location === at : at === claim.subject
      if (sees) found(world, who, fact)
    }
  }
}

/**
 * Someone found out that what the stranger said was not so (claimsHour, or
 * asking around): they reject it, trust the stranger less, remember it, and a
 * lie found out is news of its own.
 */
export function found(world: World, who: string, fact: Fact): void {
  const h = heardBy(world, who)[fact.id]
  if (!h || h.checked) return
  h.checked = true
  h.stance = 'rejects'
  const words = claimWords(world, fact.claim!)
  applyEffect(world, who, 'trust', fact.lie ? -15 : -5)
  // A memory of the stranger, for the next time they talk.
  const memory = (world.npcState(who).memory ??= [])
  memory.push({ t: world.now, note: fact.lie ? `The stranger lied to me: said ${words}. It was not so.` : `The stranger told me ${words}. It was not so.`, topics: [fact.claim!.subject], valence: -1 })
  if (memory.length > 30) memory.splice(0, memory.length - 30)
  if (!fact.lie) return
  const name = callName(world.npc(who))
  recordFact(world, {
    kind: 'caught_lie',
    about: [who],
    place: world.state.npcs[who]!.location,
    belang: 2,
    title: `the stranger's lie to ${name}`,
    text: { precise: `The stranger told ${name} ${words}, and it was a lie.`, village: `That stranger lies: told ${name} ${words}.`, far: 'A stranger has been telling lies.' },
    witnesses: [who],
    cause: [fact.id],
  })
}

/** After asking around or looking (aftermath.ts, belief.ts): claims of the stranger that someone now rejects are found out. */
export function checkedClaims(world: World, who: string, subject: string, key: string): void {
  const heard = world.state.news?.heard[who] ?? {}
  for (const [id, h] of Object.entries(heard)) {
    if (h.checked || h.from !== 'player' || h.stance !== 'rejects') continue
    const fact = factById(world, id)
    if (fact?.by === 'player' && fact.claim?.subject === subject && fact.claim.key === key && fact.truth === false) found(world, who, fact)
  }
}
