import type { Output } from './commands'
import { parseDirection } from './parser'
import { itemName, matchItem, withArticle } from './items'
import { maxHp } from './rules/character'
import { weather } from './weather'
import type { World } from './world'

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
  if (outside && (w === 'rain' || w === 'storm')) states.push('soaked to the skin')
  return states.length ? `You are ${list(states)}.` : 'You are well enough.'
}

/**
 * LOOK SOUTH, LOOK AT THE TIDEPOOLS: what lies that way, in short, and the
 * way there. Nothing when the words name no way out or place in sight.
 */
export function lookThere(world: World, words: string): Output | undefined {
  const here = world.content.locations.get(world.state.player.location)
  if (!here) return undefined
  const direction = parseDirection(words.split(/\s+/)[0])
  const wanted = words.toLowerCase().replace(/^(the|to)\s+/, '').trim()
  const exits = Object.entries(here.exits) as [string, { to: string; minutes: number }][]
  const found = direction ? exits.find(([dir]) => dir === direction) : exits.find(([, exit]) => {
    const target = world.location(exit.to)
    return [target.name, ...target.aliases].some((n) => n.toLowerCase() === wanted || n.toLowerCase().replace(/^the\s+/, '') === wanted)
  })
  if (!found) return undefined
  const [dir, exit] = found
  const target = world.location(exit.to)
  const about = target.summary ?? firstSentence(target.description.day)
  const way = exit.minutes <= 1 ? 'a few steps' : exit.minutes < 60 ? `${exit.minutes} minutes on foot` : `${Math.round(exit.minutes / 60)} hours on foot`
  return text(`${dir === 'in' || dir === 'out' || dir === 'up' || dir === 'down' ? capital(dir) : `To the ${dir}`}: ${target.name}. ${about} It is ${way}.`)
}

/**
 * LOOK <thing>: the thing of an object here first (the apple on the stone),
 * then what you carry and what lies here, and where it is.
 */
export function lookThing(world: World, words: string): Output | undefined {
  const here = world.state.player.location
  const detail = detailHere(world, words)
  if (detail) return text(detail.look)
  const inventory = world.state.player.inventory
  const ground = world.state.ground[here] ?? {}
  const gear = world.state.player.character?.gear
  const item = matchItem(world.content, words, new Set([...Object.keys(inventory).filter((i) => (inventory[i] ?? 0) > 0), ...Object.keys(ground).filter((i) => (ground[i] ?? 0) > 0)]))
  if (!item) return undefined
  const def = world.content.items.get(item)!
  const where = gear && [gear.weapon, gear.shield].includes(item) ? 'in your hand' : gear?.armour === item ? 'you wear it' : (inventory[item] ?? 0) > 0 ? 'in your pack' : 'here'
  return text(`${capital(withArticle(itemName(world.content, item, 1)))} (${where}). ${def.description}`)
}

/** A thing that belongs to an object here, by the words for it. */
export function detailHere(world: World, words: string): { look: string; take?: string } | undefined {
  const wanted = words.toLowerCase().replace(/^(the|a|an|some)\s+/, '').trim()
  for (const object of world.location(world.state.player.location).objects) {
    const type = world.content.objectTypes.get(object.type)
    const detail = type?.details.find((d) => d.words.some((w) => w.toLowerCase() === wanted))
    if (detail) return detail
  }
  return undefined
}

function firstSentence(text: string): string {
  return (text.replace(/\s+/g, ' ').trim().match(/^.*?[.!?](\s|$)/)?.[0] ?? text).trim()
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function list(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}
