import type { World } from '../world'

// A hint about the world is no guess (M10.35 B, sharpened by the researcher on 1 October 2026: "maybe there is something
// under that bench" sends the player looking all the same, and "Mara has the key" can be false while Mara and the key
// both exist). Who has a thing, where a thing is, and who lets the stranger in are told against the state of the game:
// what people carry, what lies where, and who keeps the words and keys of its locks. The names alone are not enough.

export interface FalseHint {
  /** The words of the reply that say it. */
  phrase: string
  /** What the game holds instead, for the AI log only: never told to the voice, which would tell it on. */
  why: string
}

/** The topic ids a text names: people, places and items among them. */
type Recognise = (text: string) => string[]

// A name, never with its 's: "Mara's permission" is Mara's.
const NAME = String.raw`(\p{Lu}\p{L}*(?:-\p{L}+)?(?:\s+\p{Lu}\p{L}*(?:-\p{L}+)?)?)`
// A thing as people say it, at the start of a sentence too ("The lamp is ..."), or someone's ("Niko's notebook").
const THING = String.raw`((?:[Tt]he|[Aa]n?|[Hh]is|[Hh]er|[Tt]heir|[Tt]hat|[Tt]hose|[Ss]ome|[Ii]ts|\p{Lu}\p{L}*'s)\s+[^,.;:!?"“”—–()]+)`
const PLACE = String.raw`([^,.;:!?"“”—–()]+)`
const CODE = /\b(?:code|key|keys|password|passphrase|word|combination|pass|card)\b/i
// Who has it: "Sorell has the code", "Mara keeps the key", "the key is with Mara".
const HAS = [new RegExp(String.raw`\b${NAME}\s+(?:has|holds|keeps|carries|has got|knows)\s+${THING}`, 'gu'), new RegExp(String.raw`\b${THING}\s+(?:is|are)\s+with\s+${NAME}`, 'gu')]
// Where it is: "the logs are in the Common Deck", "you'll find the lamp at the Waag".
const AT = [
  new RegExp(String.raw`\b${THING}\s+(?:is|are|lies|lie|sits|kept|stored|hidden|left)\s+(?:still\s+|right\s+|somewhere\s+)?(?:in|at|inside|on|under|behind|by)\s+${PLACE}`, 'gu'),
  new RegExp(String.raw`\byou(?:'ll| will| can| could)?\s+find\s+${THING}\s+(?:in|at|inside|on|under|behind|by)\s+${PLACE}`, 'giu'),
]
// Who lets the stranger in: "Mara can let you in", "you'll need Mara's permission", "ask Sorell for the code".
const ACCESS = [
  new RegExp(String.raw`\b${NAME}\s+(?:can|could|will|would)\s+(?:let you in|let you through|get you in|open (?:it|that|the [\p{L}-]+)|give you (?:the code|the key|access|the word)|sign you in)`, 'gu'),
  new RegExp(String.raw`\b[Yy]ou(?:'ll| will)?\s+need\s+${NAME}'s\s+(?:permission|say-so|sign-off|leave|code|key|word|approval)`, 'gu'),
  new RegExp(String.raw`\b[Aa]sk\s+${NAME}\s+for\s+(?:the code|the key|access|permission|the word)`, 'gu'),
]

/** Every lock of the world, with the place it guards: the way in, or the place of the thing it closes. */
function locks(world: World): { place: string; key?: string; word?: string }[] {
  return [...world.content.locations.values()].flatMap((loc) => [
    ...Object.values(loc.exits).flatMap((e) => (e?.lock ? [{ place: e.to, ...(e.lock.key ? { key: e.lock.key } : {}), ...(e.lock.word ? { word: e.lock.word } : {}) }] : [])),
    ...loc.objects.flatMap((o) => (o.lock ? [{ place: loc.id, ...(o.lock.key ? { key: o.lock.key } : {}), ...(o.lock.word ? { word: o.lock.word } : {}) }] : [])),
  ])
}

const plain = (s: string) => s.toLowerCase().replace(/[\s-]+/g, '')

/** Whether someone keeps a lock: carries its key, or knows its word (a secret of theirs, their facts or what a story has them know). */
function keeps(world: World, npcId: string, lock: { key?: string; word?: string }): boolean {
  if (lock.key && (world.npcState(npcId).inventory[lock.key] ?? 0) > 0) return true
  if (!lock.word) return false
  const npc = world.npc(npcId)
  const known = [...world.content.quests.values()].flatMap((q) => (q.stages ?? []).flatMap((s) => (s.knows?.[npcId] ? [s.knows[npcId]!] : [])))
  return [...npc.secrets.map((s) => s.text), ...npc.public_facts, ...known].some((t) => plain(t).includes(plain(lock.word!)))
}

/** Whether an item is at a place now: on its ground, or carried by someone there. */
function lies(world: World, item: string, place: string): boolean {
  if ((world.state.ground[place]?.[item] ?? 0) > 0) return true
  return Object.entries(world.state.npcs).some(([, s]) => s.location === place && (s.inventory[item] ?? 0) > 0)
}

/**
 * The first hint of a reply about the world that the game says is not so (M10.35 B): someone named who does not have
 * the thing, a thing at a place where it is not, or someone named who keeps no lock of the place (or of any). Only
 * what the game can tell is told: a thing that is no item and a place that is no place are left to unfoundedClaim.
 * The speaker's own word on themselves is left to the offers and the promise guard.
 */
export function falseHint(world: World, text: string, recognise: Recognise, speaker: string): FalseHint | undefined {
  const said = (text.match(/["“][^"”]*["”]?/g) ?? [text]).join(' ').replace(/["“”]/g, ' ')
  const person = (words: string) => recognise(words).find((id) => world.content.npcs.has(id) && id !== speaker)
  const item = (words: string) => recognise(words).flatMap((id) => (id.startsWith('item_') && world.content.items.has(id.slice(5)) ? [id.slice(5)] : []))[0]
  const place = (words: string) => recognise(words).find((id) => world.content.locations.has(id))
  const all = locks(world)
  for (const [i, pattern] of HAS.entries()) {
    for (const m of said.matchAll(pattern)) {
      const [who, what] = i === 0 ? [m[1]!, m[2]!] : [m[2]!, m[1]!]
      const npc = person(who)
      if (!npc || /\b(?:not|never|no)\b|n't\b/i.test(m[0])) continue
      const thing = item(what)
      if (thing) {
        if ((world.npcState(npc).inventory[thing] ?? 0) === 0 && !all.some((l) => l.key === thing && keeps(world, npc, l))) return { phrase: m[0].trim(), why: `${npc} carries no ${thing}` }
      } else if (CODE.test(what)) {
        const at = place(what)
        const guarding = all.filter((l) => !at || l.place === at)
        if (guarding.length && !guarding.some((l) => keeps(world, npc, l))) return { phrase: m[0].trim(), why: `${npc} keeps no ${at ? `lock of ${at}` : 'lock'}` }
      }
    }
  }
  for (const pattern of AT) {
    for (const m of said.matchAll(pattern)) {
      const thing = item(m[1]!)
      const where = place(m[2]!)
      if (thing && where && !/\b(?:not|never|no)\b|n't\b/i.test(m[0]) && !lies(world, thing, where)) return { phrase: m[0].trim(), why: `no ${thing} at ${where}` }
    }
  }
  for (const pattern of ACCESS) {
    for (const m of said.matchAll(pattern)) {
      const npc = person(m[1]!)
      if (!npc || /\b(?:not|never|no)\b|n't\b/i.test(m[0])) continue
      const sentence = said.slice(Math.max(0, said.lastIndexOf('.', m.index) + 1), said.indexOf('.', m.index + m[0].length) + 1 || undefined)
      const at = place(sentence)
      // Someone's own home is theirs to open.
      if (at && world.npc(npc).home === at) continue
      const guarding = all.filter((l) => !at || l.place === at)
      if (!guarding.some((l) => keeps(world, npc, l))) return { phrase: m[0].trim(), why: `${npc} keeps no ${at ? `lock of ${at}` : 'lock'}` }
    }
  }
  return undefined
}
