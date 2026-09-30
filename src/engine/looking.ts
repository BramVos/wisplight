import { carried, couldLine, thingVerbs } from './carried'
import type { Output } from './commands'
import { parseDirection } from './parser'
import { itemName, matchItem, withArticle } from './items'
import { maxHp } from './rules/character'
import { weather } from './weather'
import { GameClock } from './clock'
import { allHold } from './quests/engine'
import type { Direction, Location } from './content'
import type { World } from './world'
import type { Deed } from './content'
import { exitShown } from './exits'
import { keptDry } from './carried'

// Looking (M10.4): at yourself, a way out, a place you can see, and a thing,
// with where it is. What lights up in a description can always be looked at.

const text = (value: string): Output => ({ kind: 'text', text: value })

/** LOOK ME: how the stranger looks, what they wear and hold, and how they are. */
export function describeSelf(world: World): Output {
  const player = world.state.player
  const c = player.character
  const rules = world.content.rules
  const lines: string[] = []
  if (c && rules) {
    const ancestry = rules.ancestries.find((a) => a.id === c.ancestry)
    const klass = rules.classes.find((k) => k.id === c.class)
    const an = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a')
    const kind = [ancestry?.name, klass?.name].filter(Boolean).join(' ').toLowerCase()
    lines.push(`You are ${c.name}${kind ? `, ${an(kind)} ${kind}` : ''}.${c.appearance ? ` ${capital(c.appearance.replace(/[.\s]*$/, '.'))}` : ancestry ? ` ${ancestry.text}` : ''}`)
  } else lines.push('You are a stranger here, and look it.')
  const worn = selfGear(world)
  if (worn) lines.push(worn)
  lines.push(selfState(world))
  return text(lines.join(' '))
}

/** What the stranger holds and wears, in words. */
export function selfGear(world: World): string | undefined {
  const gear = world.state.player.character?.gear
  if (!gear) return undefined
  const name = (id: string | undefined) => (id ? withArticle(itemName(world.content, id, 1)) : undefined)
  const held = [name(gear.weapon), name(gear.shield)].filter(Boolean)
  const parts = [...(held.length ? [`In your hand${held.length > 1 ? 's' : ''}: ${held.join(' and ')}.`] : []), ...(gear.armour ? [`You wear ${name(gear.armour)}.`] : [])]
  return parts.length ? parts.join(' ') : undefined
}

/** How the stranger is: hurt, tired, wet, ill. */
export function selfState(world: World): string {
  const player = world.state.player
  const c = player.character
  const states: string[] = []
  if (c) {
    const ratio = c.hp / Math.max(1, maxHp(world.content, c))
    if (ratio < 0.34) states.push('badly hurt')
    else if (ratio < 0.8) states.push('bruised and scraped')
    if (c.conditions['fen_fever'] || c.conditions['sickened']) states.push('feverish')
    if (c.conditions['cursed']) states.push('under a curse')
  }
  if (world.now - (player.sleptAt ?? world.now) > 18 * 60) states.push('tired')
  const place = world.content.locations.get(player.location)
  const outside = !place || !place.tags.some((t) => t === 'indoors' || t === 'private' || t === 'shop' || t === 'social')
  const w = weather(world)
  // A coat that keeps the rain out keeps the stranger dry (M10.33 AD).
  if (outside && (w === 'rain' || w === 'storm')) states.push(keptDry(world) ? `dry under your ${keptDry(world)}` : 'soaked to the skin')
  return states.length ? `You are ${list(states)}.` : 'You are well enough.'
}

/**
 * LOOK SOUTH, LOOK AT THE TIDEPOOLS: what lies that way, in short, and the
 * way there. Nothing when the words name no way out or place in sight. A
 * place the stranger has never stood in shows only what can be seen from
 * here (M10.29: looking at the hangar told of the ship behind its sealed
 * door): the way, a thing of this place its names find (the hangar door),
 * and its name only when they have heard of it.
 */
export function lookThere(world: World, words: string): Output | undefined {
  const here = world.content.locations.get(world.state.player.location)
  if (!here) return undefined
  const direction = parseDirection(words.split(/\s+/)[0])
  const wanted = words.toLowerCase().replace(/^(the|to)\s+/, '').trim()
  // A secret way not yet found is not there to look through (M10.31).
  const exits = (Object.entries(here.exits) as [Direction, { to: string; minutes: number }][]).filter(([d]) => exitShown(world, here.id, d))
  const found = direction ? exits.find(([dir]) => dir === direction) : exits.find(([, exit]) => {
    const target = world.location(exit.to)
    return [target.name, ...target.aliases].some((n) => n.toLowerCase() === wanted || n.toLowerCase().replace(/^the\s+/, '') === wanted)
  })
  if (!found) return undefined
  const [dir, exit] = found
  const target = world.location(exit.to)
  const way = exit.minutes <= 1 ? 'a few steps' : exit.minutes < 60 ? `${exit.minutes} minutes on foot` : `${Math.round(exit.minutes / 60)} hours on foot`
  const heading = dir === 'in' || dir === 'out' || dir === 'up' || dir === 'down' ? capital(dir) : `To the ${dir}`
  const player = world.state.player
  if ((player.seen ?? []).includes(target.id)) return text(`${heading}: ${target.name}. ${target.summary ?? firstSentence(target.description.day)} It is ${way}.`)
  const door = [target.name, ...target.aliases].map((n) => detailHere(world, n)).find((d) => d !== undefined)
  const seenFromHere = door ? `${door.look} ` : ''
  if (player.journal?.[target.id] !== undefined) return text(`${heading}: ${target.name}, as you have heard; you have not been there. ${seenFromHere}It is ${way}.`)
  return text(`${heading}: ${seenFromHere || 'a way you have not taken yet. '}It is ${way}.`)
}

/**
 * LOOK <thing>: the thing of an object here first (the apple on the stone),
 * then what you carry and what lies here, and where it is.
 */
export function lookThing(world: World, words: string): Output | undefined {
  const here = world.state.player.location
  const inventory = world.state.player.inventory
  const ground = world.state.ground[here] ?? {}
  const gear = world.state.player.character?.gear
  const described = (item: string) => {
    const def = world.content.items.get(item)!
    const where = gear && [gear.weapon, gear.shield].includes(item) ? 'in your hand' : gear?.armour === item ? 'you wear it' : (inventory[item] ?? 0) > 0 ? 'in your pack' : 'here'
    // What you can do with a thing you carry (M10.29 N): its own verbs and the ones that fit it.
    const could = (inventory[item] ?? 0) > 0 ? ` ${couldLine(thingVerbs(world, item))}` : ''
    return text(`${capital(withArticle(itemName(world.content, item, 1)))} (${where}). ${def.description}${could}`)
  }
  // What you carry comes first (M10.29: "l terminal" found the room before the pack).
  const mine = carried(world, words)
  if (mine) return described(mine)
  const detail = detailHere(world, words)
  if (detail) return text(detail.look)
  const item = matchItem(world.content, words, Object.keys(ground).filter((i) => (ground[i] ?? 0) > 0))
  return item ? described(item) : undefined
}

/** A thing a description names, found by its words (M10.4; places too after the M10 playtest). */
export interface DetailFound {
  /** What to call it: "the bowl of milk". */
  name: string
  look: string
  take?: string
  verbs?: Record<string, string | Deed>
  /** Its first word, for the deed it may do (M10.30). */
  key: string
}

/**
 * A thing of this place or of an object here, by the words for it: the
 * hollow between the roots, the apple on the stone. "The wooden bowl" finds
 * the bowl by its last word, and "hangar" the hangar door by any word of its
 * name (M10.29), after every whole name.
 */
export function detailHere(world: World, words: string): DetailFound | undefined {
  const wanted = words.toLowerCase().replace(/^(the|a|an|some|de|het|een)\s+/, '').trim()
  if (!wanted) return undefined
  const place = world.content.locations.get(world.state.player.location)
  const all = [...(place?.details ?? []), ...world.location(world.state.player.location).objects.flatMap((o) => world.content.objectTypes.get(o.type)?.details ?? [])]
  const last = wanted.split(/\s+/).at(-1)!
  const anyWord = (w: string) => !DETAIL_STOP.has(last) && w.toLowerCase().split(/\s+/).includes(last)
  // Last, a word cut short, three letters or more, that is nobody's name (M10.29 T: "cab" for the cabinet; M10.8: "count" is no counter).
  const someone = [...world.content.npcs.values()].some((n) => n.name.toLowerCase().split(/\s+/).includes(last))
  const cutShort = (w: string) => last.length >= 3 && !someone && w.toLowerCase().split(/\s+/).some((x) => x.startsWith(last))
  const found = all.find((d) => d.words.some((w) => w.toLowerCase() === wanted)) ?? all.find((d) => d.words.some((w) => w.toLowerCase() === last)) ?? all.find((d) => d.words.some(anyWord)) ?? all.find((d) => d.words.some(cutShort))
  return found ? { name: `the ${found.words[0]}`, look: found.look, take: found.take, verbs: found.verbs, key: found.words[0]! } : undefined
}

/** Small words that name no thing on their own: "of" does not find the bowl of milk. */
const DETAIL_STOP = new Set(['of', 'the', 'a', 'an', 'and', 'on', 'in', 'at', 'to', 'with', 'by', 'for', 'from', 'up', 'down', 'out'])

/** The description of a place as it reads now: its variant, by day or night. */
export function descriptionNow(world: World, location: Location): string {
  const night = new GameClock(world.now).isNight
  const variant = [...location.variants].reverse().find((v) => (v.flag === undefined || world.state.flags?.[v.flag]) && (v.when.length === 0 || allHold(world, v.when)))
  const shown = variant ?? location.description
  return (night && shown.night ? shown.night : shown.day).trim()
}

/**
 * What the description of this place names, when nothing else here goes by
 * those words (after the M10 playtest): the sentence it is in. What you read,
 * you can look at.
 */
export function sceneryHere(world: World, words: string): { name: string; sentence: string } | undefined {
  const significant = words
    .toLowerCase()
    .replace(/[^a-z' ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !SCENERY_STOP.has(w))
  if (!significant.length) return undefined
  const place = world.location(world.state.player.location)
  const sentences = descriptionNow(world, place).replace(/[[\]]/g, '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/)
  // A word or its singular, in the singular or plural: stones, stone; bushes, bush.
  const forms = (w: string) => [...new Set([w, w.replace(/s$/, ''), w.replace(/es$/, '')])].filter((f) => f.length > 2).join('|')
  const fits = (sentence: string) => significant.every((w) => new RegExp(`\\b(${forms(w)})(e?s)?\\b`, 'i').test(sentence))
  const sentence = sentences.find(fits)
  return sentence ? { name: `the ${significant.join(' ')}`, sentence: sentence.trim() } : undefined
}

const SCENERY_STOP = new Set(['the', 'and', 'some', 'with', 'from', 'into', 'onto', 'that', 'this', 'there', 'here', 'your', 'you'])

function firstSentence(text: string): string {
  return (text.replace(/\s+/g, ' ').trim().match(/^.*?[.!?](\s|$)/)?.[0] ?? text).trim()
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function list(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}
