import { faithOf } from '../faith'
import type { Content } from '../content'
import { allFaiths, frameOf } from '../lands'
import { middlePurse } from '../standing'
import type { World } from '../world'
import { relation } from './relations'
import { hasOurOaths } from './guard'
import { crossesLimits } from '../safety'
import type { Voice } from './voiceSchema'

// The voice kit at work (M10.10): the prompt's VOICE block, the oaths of a
// speaker, what the guard replaces or asks again, and a number the model made
// up. A world without a kit has no list of words that do not belong (M10.17: a
// computer is no anachronism on a mining colony); only the fixed core holds.

type Group = Voice['groups'][number]

/** The small fixed core every world keeps: a percent sign, and a model speaking of models (markup and emoji are out of character). */
const CORE = /%|\bAI\b|\b(?:chatgpt|openai|anthropic|claude|gpt-?\d)\b/i

/**
 * The kit where the stranger is (M10.23): the land's own, else the world's.
 * Where an area blends with another land, people there have the sayings and
 * oaths of both kits.
 */
export function kitOf(world: Pick<World, 'content'> & { land?: string; blend?: string }): Voice | undefined {
  const own = frameOf(world.content, world.land).voice
  const blend = world.blend
  if (!blend) return own
  const other = frameOf(world.content, blend === world.content.world.id ? undefined : blend).voice
  if (!own || !other || own === other) return own ?? other
  const oaths = { ...other.oaths }
  for (const [faith, list] of Object.entries(own.oaths)) oaths[faith] = [...new Set([...list, ...(other.oaths[faith] ?? [])])]
  return { ...own, oaths, sayings: [...own.sayings, ...other.sayings], groups: [...own.groups, ...other.groups.filter((g) => !own.groups.some((o) => o.id === g.id))] }
}

/** The group a speaker talks like: their own voice, their trade, where they live, or everyone else's. */
export function groupOf(world: World, npcId: string): Group | undefined {
  const kit = kitOf(world)
  if (!kit || !world.content.npcs.has(npcId)) return undefined
  const npc = world.npc(npcId)
  const byId = (id: string | undefined) => (id ? kit.groups.find((g) => g.id === id) : undefined)
  const area = world.content.locations.get(npc.home)?.area
  return byId(npc.voice) ?? kit.groups.find((g) => g.professions.includes(npc.profession)) ?? kit.groups.find((g) => area !== undefined && g.areas.includes(area)) ?? byId(kit.default_group)
}

/** What a speaker swears by: their faith's oaths from the kit, or from world.yaml as before, and their group's own. */
export function oathsFor(world: World, npcId: string): string[] {
  const faith = faithOf(world, npcId)
  const kit = kitOf(world)?.oaths[faith ?? '']
  const own = kit?.length ? kit : (allFaiths(world.content).find((f) => f.id === faith)?.oaths ?? [])
  return [...new Set([...own, ...(groupOf(world, npcId)?.oaths ?? [])])]
}

/** A small seeded pick: the same talk gives the same lines, another talk others. */
function pick<T>(list: readonly T[], n: number, seed: number): T[] {
  const out: T[] = []
  const pool = [...list]
  let s = seed >>> 0 || 1
  while (out.length < n && pool.length) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    out.push(pool.splice(s % pool.length, 1)[0]!)
  }
  return out
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** "goodwife/goodman/good traveller" by the listener's pronoun. */
function byPronoun(form: string, pronoun: 'she' | 'he' | 'they'): string {
  const parts = form.split('/').map((p) => p.trim())
  if (parts.length === 1) return parts[0]!
  return (pronoun === 'she' ? parts[0] : pronoun === 'he' ? parts[1] : parts[2] ?? parts[1])!
}

/** How the speaker calls the stranger: by how well they know them, and by the stranger's standing. */
export function addressFor(world: World, npcId: string, seed: number): string | undefined {
  const kit = kitOf(world)
  if (!kit) return undefined
  const rel = relation(world.state, npcId)
  const pronoun = world.state.player.character?.pronoun ?? 'they'
  const middle = middlePurse(world)
  const high = middle > 0 && world.state.player.money >= middle * 3 && kit.address.high.length > 0
  const forms = high ? kit.address.high : rel.familiarity >= 50 && kit.address.friend.length ? kit.address.friend : rel.familiarity >= 6 && kit.address.known.length ? kit.address.known : kit.address.stranger
  const form = pick(forms, 1, seed)[0]
  return form ? byPronoun(form, pronoun) : undefined
}

/**
 * The VOICE block of the prompt (M10.10), at most four lines. Character is
 * not a trick of sayings (Bram, 28 September 2026): a saying comes with one
 * talk in three, as one that may be used once if it truly fits, and none
 * after the speaker used a saying or an oath in this talk. How to call the
 * stranger, how time and distance go here, and what is not here, for when it
 * comes up.
 */
export function voiceLines(world: World, npcId: string, seed: number, flourished = false, part: 'all' | 'talk' = 'all'): string[] {
  const kit = kitOf(world)
  if (!kit) return []
  const group = groupOf(world, npcId)
  const saying = !flourished && seed % 3 === 0 ? pick([...(group?.sayings ?? []), ...kit.sayings], 1, seed)[0] : undefined
  // The form of address this talk began with stays (M10.28, the read score: Mirte went from lamb to neighbour to friend).
  const talk = world.state.talk?.npc === npcId ? world.state.talk : undefined
  const address = talk?.address ? undefined : addressFor(world, npcId, seed)
  // Words for time and distance are how people say them, never a time or a distance of their own (M10.28: "an hour's
  // walk" to the inn, then "half an hour").
  const words = [kit.time.length ? `time ${pick(kit.time, 3, seed + 1).join(', ')}` : '', kit.distance.length ? `distance ${pick(kit.distance, 2, seed + 2).join(', ')}` : ''].filter(Boolean)
  const telling = part === 'all' ? landTelling(world) : []
  return [
    flourished
      ? 'VOICE: you used a saying or an oath in this talk already; no more of either.'
      : saying
        ? `VOICE: a saying of ${group ? group.name : 'your people'}, only if it truly fits and at most once in this talk (most talks have none): "${saying}"`
        : '',
    talk?.address ? `You call the stranger "${talk.address.word}" in this talk, every time, until your attitude changes.` : address ? `If you call the stranger anything, it is "${address}" (or what your card says you call people), the same all through this talk, or their name once you know it.` : '',
    words.length ? `How people here say it, only for a time or a distance you were given: ${words.join('; ')}.` : '',
    telling.length ? `When it comes up: ${telling.join('; ')}.` : '',
    ...(part === 'all' ? notHereLine(world) : []),
  ].filter(Boolean)
}

/**
 * The words a speaker may call the stranger (M10.28): the forms of the voice
 * kit, and what their card says they call people ("Calls people 'lamb'").
 */
export function addressWords(world: World, npcId: string): string[] {
  const kit = kitOf(world)
  const forms = kit ? [...kit.address.stranger, ...kit.address.known, ...kit.address.friend, ...kit.address.high].flatMap((f) => f.split('/').map((p) => p.trim())) : []
  const speech = world.npc(npcId).speech ?? ''
  const own = [...speech.matchAll(/\bcalls? (?:people|everyone|folk|strangers)[^'"]*['"]([^'"]+)['"]/gi)].map((m) => m[1]!.trim())
  return [...new Set([...own, ...forms])].filter((w) => w && w.length > 1)
}

/** The form of address a reply uses (M10.28): one of the words, spoken to the stranger ("lamb," or ", lamb."). */
export function addressIn(reply: string, words: string[]): string | undefined {
  const spoken = (w: string) => new RegExp(`(?:["“]|[,;]\\s)${escape(w)}(?=[,.!?;"”])|["“]${escape(w)},`, 'i')
  return words.find((w) => spoken(w).test(reply))
}

/** A reply with another form of address put back to the one this talk keeps (M10.28), and which it was; unchanged when there is none. */
export function keepAddress(reply: string, kept: string, words: string[]): { text: string; was?: string } {
  const other = words.find((w) => w.toLowerCase() !== kept.toLowerCase() && addressIn(reply, [w]))
  if (!other) return { text: reply }
  const text = reply.replace(new RegExp(`((?:["“]|[,;]\\s))${escape(other)}(?=[,.!?;"”])`, 'gi'), (_m, lead: string) => `${lead}${kept}`)
  return { text, was: other }
}

/** Measures and money the land's way (M10.23: the coins where the stranger is): the same for every speaker there. */
function landTelling(world: World): string[] {
  const kit = kitOf(world)
  if (!kit) return []
  const money = world.coins.map((u) => u.plural ?? `${u.name}s`)
  return [kit.measures.length ? `measures ${kit.measures.join(', ')}` : '', money.length ? `money in ${money.join(', ')}` : ''].filter(Boolean)
}

function notHereLine(world: World): string[] {
  const absent = (kitOf(world)?.not_here ?? []).filter((n) => !/^\p{Lu}/u.test(n.word) && !/^(okay|ok)$/i.test(n.word)).slice(0, 8)
  return absent.length ? [`Not here: ${absent.map((n) => (n.instead ? `${n.word} (say ${n.instead})` : n.word)).join(', ')}.`] : []
}

/**
 * The voice kit's part that every speaker in the land shares (M10.28), for
 * the area block: measures, money and what is not here. The saying, the
 * address and the words for time stay with the talk, chosen per talk.
 */
export function landVoiceLines(world: World): string[] {
  const telling = landTelling(world)
  return [telling.length ? `HOW PEOPLE HERE SAY THINGS, when it comes up: ${telling.join('; ')}.` : '', ...notHereLine(world)].filter(Boolean)
}

/** Whether a reply used a saying or an oath of the kit (M10.10): then no more of either in this talk. */
export function flourishes(world: Pick<World, 'content'>, reply: string): number {
  const kit = kitOf(world)
  if (!kit) return 0
  const plain = (t: string) => t.toLowerCase().replace(/[^\p{L}\s']/gu, ' ').replace(/\s+/g, ' ').trim()
  const said = plain(reply)
  const sayings = [...kit.sayings, ...kit.groups.flatMap((g) => g.sayings)]
  const oaths = [...new Set([...Object.values(kit.oaths).flat(), ...kit.groups.flatMap((g) => g.oaths)])]
  const count = (t: string) => {
    const words = plain(t).split(' ')
    const head = words.slice(0, Math.min(5, words.length)).join(' ')
    return head.length > 3 && said.includes(head) ? 1 : 0
  }
  return sayings.reduce((n, s) => n + count(s), 0) + oaths.reduce((n, o) => n + count(o), 0)
}

/** The seed of a talk's voice: the speaker and when the talk began. */
export function talkSeed(npcId: string, began: number): number {
  return hash(`${npcId}:${began}`)
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A pattern for one word of `not_here`: a capital word only with its capital, any other in any case. */
function wordPattern(word: string): RegExp {
  const capital = /^\p{Lu}/u.test(word)
  return new RegExp(`(?<![\\p{L}'])${escape(word).replace(/\s+/g, '\\s+')}(?![\\p{L}'])`, capital ? 'gu' : 'giu')
}

function sameCase(found: string, instead: string): string {
  if (/^\p{Lu}/u.test(found) && !/^\p{Lu}/u.test(instead)) return instead.charAt(0).toUpperCase() + instead.slice(1)
  return instead
}

/** Puts what people here say in place of what is not here; what was put, as "potatoes > turnips". */
export function fixNotHere(world: Pick<World, 'content'>, text: string): { text: string; fixed: string[] } {
  const kit = kitOf(world)
  if (!kit) return { text, fixed: [] }
  const fixed: string[] = []
  let out = text
  for (const n of kit.not_here) {
    if (!n.instead) continue
    out = out.replace(wordPattern(n.word), (found: string, offset: number) => {
      fixed.push(`${found} > ${n.instead}`)
      // At the start of a sentence the word keeps its capital.
      const start = offset === 0 || /[.!?"]\s*$/.test(out.slice(0, offset))
      return start ? sameCase(found.charAt(0).toUpperCase() + found.slice(1), n.instead!) : sameCase(found, n.instead!)
    })
  }
  return { text: out, fixed }
}

/** Words of a reply that do not exist here and have nothing to stand in for them: the game asks again. */
export function strangeWords(world: Pick<World, 'content'>, text: string): string[] {
  const kit = kitOf(world)
  if (!kit) return CORE.test(text) ? [CORE.exec(text)![0]] : []
  const found = kit.not_here.filter((n) => !n.instead && new RegExp(wordPattern(n.word).source, wordPattern(n.word).flags.replace('g', '')).test(text)).map((n) => n.word)
  const core = CORE.exec(text)
  return [...found, ...(core ? [core[0]] : [])]
}

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'thousand']
const NUMBER = new RegExp(`\\b(\\d+(?:[.,]\\d+)?|${NUMBER_WORDS.join('|')})\\b`, 'gi')
/** Small words that are numbers only now and then: "one of them", "a day or two". */
const LOOSE = new Set(['one', 'two', 'three'])

/**
 * Numbers in a reply that were in nothing the model was given (M10.10): an
 * age, a price or a date it made up. Not replaced; noted in the AI log, so it
 * shows. "One" and "two" pass; so does a number the player said.
 */
export function strayNumbers(reply: string, given: string): string[] {
  const known = new Set([...given.matchAll(NUMBER)].map((m) => m[1]!.toLowerCase()))
  const out: string[] = []
  for (const m of reply.matchAll(NUMBER)) {
    const n = m[1]!.toLowerCase()
    if (LOOSE.has(n) || known.has(n)) continue
    out.push(m[1]!)
  }
  return [...new Set(out)]
}

/** The kit in a few lines for the chronicler and the writing help (M10.10), so new content comes in the same voice. */
export function voiceSummary(content: Pick<Content, 'voice' | 'world' | 'lands'>, land?: string): string {
  // A land's own kit (M10.23), else the world's.
  const kit = frameOf(content, land).voice
  if (!kit) return ''
  const oaths = [...new Set([...Object.values(kit.oaths).flat(), ...kit.groups.flatMap((g) => g.oaths)])].slice(0, 6)
  const sayings = [...kit.sayings, ...kit.groups.flatMap((g) => g.sayings)].slice(0, 4)
  const absent = kit.not_here.filter((n) => !/^\p{Lu}/u.test(n.word)).slice(0, 10)
  return [
    'VOICE OF THIS WORLD',
    oaths.length ? `People swear only by: ${oaths.map((o) => `"${o}"`).join(', ')}.` : '',
    sayings.length ? `Sayings: ${sayings.map((s) => `"${s}"`).join('; ')}.` : '',
    kit.time.length || kit.distance.length ? `Time and distance: ${[...kit.time.slice(0, 3), ...kit.distance.slice(0, 2)].join(', ')}.` : '',
    absent.length ? `Nothing of: ${absent.map((n) => (n.instead ? `${n.word} (${n.instead})` : n.word)).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

/** The rules' look at one answer (M10.10): each true is in character. */
export interface CharacterChecks {
  /** No oath of our world (Christ, God, hell). */
  oath: boolean
  /** No word of what is not here, even one the guard could put right. */
  words: boolean
  /** No name it could not know or made up (the game's own leak and invention checks). */
  names: boolean
  /** Its own people as its own: "my daughter", not "the daughter of Jan". */
  ownPeople: boolean
  /** No number that was not given. */
  numbers: boolean
  /** No more than one saying or oath in the reply: character is not a trick of sayings. */
  restraint: boolean
  /** Not thrown away by the guard (M10.19): the trial's score counts refusals. */
  kept: boolean
  /** Within the hard limits (M10.19). */
  limits: boolean
}

/** Checks one reply as the model gave it, against what it was given and why the game threw it away, if it did. */
export function characterChecks(content: { voice?: Voice }, reply: string, given: string, rejected?: string): CharacterChecks {
  const world = { content } as Pick<World, 'content'>
  const kit = content.voice
  const usedAbsent = kit ? kit.not_here.some((n) => new RegExp(wordPattern(n.word).source, wordPattern(n.word).flags.replace('g', '')).test(reply)) : strangeWords(world, reply).length > 0
  return {
    oath: !hasOurOaths(reply),
    words: !usedAbsent && !CORE.test(reply),
    names: rejected !== 'leak' && rejected !== 'invented',
    ownPeople: !/\bthe (?:son|daughter|wife|husband|mother|father|sister|brother|child) of \p{Lu}/u.test(reply),
    numbers: strayNumbers(reply, given).length === 0,
    restraint: flourishes(world, reply) <= 1,
    // Refused replies count against a model (M10.19): whatever the guard threw away, and anything across the hard limits.
    kept: rejected === undefined,
    limits: !crossesLimits(reply),
  }
}

/** The share of checks passed over all answers, 0 to 1 (M10.10). */
export function characterScore(all: CharacterChecks[]): number | undefined {
  if (!all.length) return undefined
  const checks = Object.keys(all[0]!).length
  const passed = all.reduce((sum, c) => sum + Object.values(c).filter(Boolean).length, 0)
  return passed / (all.length * checks)
}
