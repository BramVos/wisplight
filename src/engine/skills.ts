import { GameClock, minuteOfDay } from './clock'
import type { CommandHost, Output } from './commands'
import { callName, type ObjectInstance } from './content'
import { itemName, withArticle } from './items'
import { recordFact } from './news'
import { maxHp } from './rules/character'
import { gainXp, playerCheck, XP } from './rules/player'
import { deed } from './social/deeds'
import { weather } from './weather'
import type { World } from './world'

// What the other skills do (M10.5): Medicine treats, Survival gathers and
// reads tracks, Lore reads an old inscription, Perception finds what lies
// hidden. Thievery picks locks (social/access.ts). Each is a check against a
// difficulty that belongs to the world: the fever, the ground, the worn
// letters. A success is practice; where it is an obstacle overcome or
// something learnt, experience too. The content of both worlds has the uses.

const DAY = 24 * 60
const text = (value: string): Output => ({ kind: 'text', text: value })
const error = (value: string): Output => ({ kind: 'error', text: value })
const checkLine = (r: { skill: string; total: number; dc: number; degree: string }): Output => ({ kind: 'check', text: `(${r.skill.charAt(0).toUpperCase()}${r.skill.slice(1)} ${r.total} vs DC ${r.dc}: ${r.degree})` })
const good = (degree: string) => degree === 'success' || degree === 'critical success'

// ---------------------------------------------------------------- medicine

/** How hard an ailment is to treat. */
const AILMENT_DC: Record<string, number> = { fen_fever: 15, sickened: 13, bleeding: 12, wounds: 12, sickness: 15 }

/** Herbs or a salve help: +2, and one is used. */
function remedyAtHand(world: World): string | undefined {
  const inventory = world.state.player.inventory
  return Object.keys(inventory).find((i) => (inventory[i] ?? 0) > 0 && (world.content.items.get(i)?.remedy?.cures.length ?? 0) > 0)
}

/**
 * TREAT <someone> (M10.5): Medicine against the ailment. Yourself: fen
 * fever, sickness, bleeding, wounds. Someone here: a fever that keeps them
 * in bed, or wounds from a fight. Herbs help. Done well, the fever breaks
 * by evening; they remember who sat with them.
 */
export function treat(host: CommandHost, words: string, npc: string | undefined): Output[] {
  const { world } = host
  const who = words.trim().toLowerCase()
  const self = !who || ['me', 'myself', 'self', 'mezelf', 'mij'].includes(who)
  if (!self && !npc) return [error(`There is nobody called "${words}" here to treat.`)]
  const herbs = remedyAtHand(world)
  const bonus = herbs ? 2 : 0
  if (self || !npc) {
    const c = world.state.player.character
    if (!c) return [error('You have no body to speak of, in this world.')]
    const ailment = ['fen_fever', 'sickened', 'bleeding'].find((a) => c.conditions[a]) ?? (c.hp < maxHp(world.content, c) ? 'wounds' : undefined)
    if (!ailment) return [text('There is nothing wrong with you that a good night will not mend.')]
    const result = playerCheck(world, 'medicine', AILMENT_DC[ailment]! - bonus)
    if (herbs) world.state.player.inventory[herbs]! -= 1
    const seen = host.pass(20)
    const out: Output[] = [checkLine(result)]
    if (good(result.degree)) {
      if (ailment === 'wounds') c.hp = Math.min(maxHp(world.content, c), c.hp + Math.max(4, c.level * 2) + (result.degree === 'critical success' ? 4 : 0))
      else delete c.conditions[ailment]
      out.push(text(ailment === 'wounds' ? 'You clean and bind your cuts. It stings, then it is better.' : `You see to the ${ailment.replace(/_/g, ' ')}${herbs ? ` with ${withArticle(itemName(world.content, herbs, 1))}` : ''}, and it lets go of you.`))
    } else {
      if (result.degree === 'critical failure' && ailment === 'bleeding') c.conditions['bleeding'] = (c.conditions['bleeding'] ?? 1) + 1
      out.push(text(result.degree === 'critical failure' ? 'Your hands shake, and you make it worse.' : 'You do what you can, but it does not help much.'))
    }
    return [...out, ...seen]
  }
  const state = world.npcState(npc)
  const name = callName(world.npc(npc))
  const sick = (state.sickUntil ?? 0) > world.now
  const hurt = (state.wounds ?? 0) > 0
  if (!sick && !hurt) return [text(`${name} is well; there is nothing to treat.`)]
  const ailment = sick ? 'sickness' : 'wounds'
  const result = playerCheck(world, 'medicine', AILMENT_DC[ailment]! - bonus)
  if (herbs) world.state.player.inventory[herbs]! -= 1
  const seen = host.pass(30)
  const out: Output[] = [checkLine(result)]
  if (good(result.degree)) {
    if (sick) state.sickUntil = Math.min(state.sickUntil!, world.now + 6 * 60)
    else state.wounds = Math.max(0, state.wounds! - (result.degree === 'critical success' ? 8 : 4))
    deed(world, npc, 'help', { amount: 10 })
    out.push(text(sick ? `You sit with ${name}, cool the fever${herbs ? ` and brew ${withArticle(itemName(world.content, herbs, 1))}` : ''}. By evening it will break.` : `You clean ${name}'s wounds and bind them tight.`))
    recordFact(world, { kind: 'tended', about: [npc], place: world.state.player.location, belang: 1, title: `the stranger tending ${name}`, text: { precise: `The stranger tended ${name} when ${world.npc(npc).pronoun === 'she' ? 'she' : world.npc(npc).pronoun === 'he' ? 'he' : 'they'} was ${sick ? 'ill' : 'hurt'}.`, village: `The stranger sat with ${name} when ${sick ? 'the fever' : 'it'} was bad, they say.`, far: 'A stranger who knows some healing.' } })
    const tended = (world.state.player.found ??= [])
    const key = `tended:${npc}:${Math.floor(world.now / DAY)}`
    if (!tended.includes(key)) {
      tended.push(key)
      gainXp(world, 20, `tending ${name}`)
    }
  } else {
    out.push(text(result.degree === 'critical failure' ? `You fumble, and ${name} winces and pushes your hands away.` : `You do what you can for ${name}, but it does not help much.`))
  }
  return [...out, ...seen]
}

// ---------------------------------------------------------------- survival

/**
 * GATHER [what] (M10.5): Survival against the ground. Where a place names a
 * ground of its zone (the fen's herbs, the shore's kelp), in its months, once
 * a day. The first time from a ground is a discovery.
 */
export function gather(host: CommandHost, words: string): Output[] {
  const { world } = host
  const here = world.state.player.location
  const place = world.location(here)
  const month = monthOf(world)
  const grounds = place.forage.map((id) => world.content.resources.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r?.gather))
  if (!grounds.length) return [error('There is nothing here to gather by hand.')]
  const w = words.trim().toLowerCase()
  const ground = w ? grounds.find((r) => r.name.toLowerCase().includes(w) || itemName(world.content, r.gather!.item, 1).toLowerCase().includes(w) || w.includes(itemName(world.content, r.gather!.item, 1).toLowerCase())) : grounds[0]
  if (!ground) return [error(`There is no ${w} to gather here. Here: ${grounds.map((r) => itemName(world.content, r.gather!.item, 2).replace(/^2 /, '')).join(', ')}.`)]
  const g = ground.gather!
  if (ground.months && !ground.months.includes(month)) return [error(`Not in ${world.calendar.months[month - 1] ?? 'this month'}: there is no ${itemName(world.content, g.item, 2).replace(/^2 /, '')} to be had now.`)]
  const key = `${here}/${ground.id}`
  const today = Math.floor(world.now / DAY)
  const gathered = (world.state.player.gathered ??= {})
  if (gathered[key] === today) return [error('You have taken what there is to take here today.')]
  gathered[key] = today
  const result = playerCheck(world, 'survival', g.dc)
  const seen = host.pass(g.minutes)
  const out: Output[] = [checkLine(result)]
  if (good(result.degree)) {
    const qty = g.qty + (result.degree === 'critical success' ? 1 : 0)
    world.state.player.inventory[g.item] = (world.state.player.inventory[g.item] ?? 0) + qty
    out.push(text(`${g.text} You have ${itemName(world.content, g.item, qty)}.`))
    const first = (world.state.player.found ??= [])
    if (!first.includes(`ground:${ground.id}`)) {
      first.push(`ground:${ground.id}`)
      gainXp(world, XP.place, `learning where ${itemName(world.content, g.item, 2).replace(/^2 /, '')} can be found`)
    }
  } else out.push(text(`You search and pick for a while, but find little worth taking.`))
  return [...out, ...seen]
}

/**
 * TRACK <someone> (M10.5): Survival, to read which way someone went from
 * here, while the trail is fresh (half a day). Harder in the dark and the rain.
 */
export function track(host: CommandHost, words: string, npc: string | undefined): Output[] {
  const { world } = host
  if (!npc) return [error(`Track whom? Nobody called "${words}".`)]
  const here = world.state.player.location
  const state = world.npcState(npc)
  const name = callName(world.npc(npc))
  if (state.location === here) return [text(`${name} is right here.`)]
  const left = state.left
  if (!left || left.location !== here || world.now - left.t > 12 * 60) return [text(`You find no sign that ${name} passed this way lately.`)]
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  const dc = 13 + (hour >= 21 || hour < 6 ? 2 : 0) + (['rain', 'storm'].includes(weather(world)) ? 2 : 0)
  const result = playerCheck(world, 'survival', dc)
  const seen = host.pass(10)
  const out: Output[] = [checkLine(result)]
  const route = world.route(here, state.location)
  const direction = route?.directions[0]
  if (good(result.degree) && direction) {
    const ago = Math.max(1, Math.round((world.now - left.t) / 60))
    const next = world.location(route!.nodes[1]!).name
    out.push(text(`Footprints in the soft ground, the heel pressed deep: ${name} went ${direction}, towards ${next}, ${ago <= 1 ? 'not an hour ago' : `about ${ago} hours ago`}.`))
  } else out.push(text(`There are too many tracks, or too few. You can't tell which way ${name} went.`))
  return [...out, ...seen]
}

// ---------------------------------------------------------------- perception

/**
 * SEARCH (M10.5): Perception against what lies hidden here, each thing once.
 * What is found is on the ground, or known; finding it is a small secret.
 */
export function searchHere(host: CommandHost): Output[] {
  const { world } = host
  const here = world.state.player.location
  const found = (world.state.player.found ??= [])
  const hidden = world.location(here).hidden.filter((h) => !found.includes(`${here}/${h.id}`))
  const result = playerCheck(world, 'perception', hidden.length ? Math.min(...hidden.map((h) => h.dc)) : 15)
  const seen = host.pass(15)
  const out: Output[] = [checkLine(result)]
  const now = hidden.filter((h) => result.total >= h.dc || result.degree === 'critical success')
  if (!now.length) return [...out, text(hidden.length || !world.location(here).hidden.length ? 'You look high and low, and find nothing out of the ordinary.' : 'You search again, but there is nothing more to find here.'), ...seen]
  for (const h of now) {
    found.push(`${here}/${h.id}`)
    out.push(text(h.text))
    if (h.item) {
      const ground = (world.state.ground[here] ??= {})
      ground[h.item] = (ground[h.item] ?? 0) + h.qty
    }
    if (h.topic) learnTopic(world, h.topic)
    gainXp(world, 20, 'finding what was hidden')
  }
  return [...out, ...seen]
}

// ---------------------------------------------------------------- lore

/** An object here with words on it, by its name. */
export function inscribedHere(world: World, words: string): ObjectInstance | undefined {
  const w = words.toLowerCase().replace(/^(the|a|an)\s+/, '').replace(/^(inscription|runes|words|letters)\s+(on|of)\s+(the\s+)?/, '').trim()
  return world.location(world.state.player.location).objects.find((o) => {
    const type = world.content.objectTypes.get(o.type)
    if (!type?.inscription) return false
    return !w || [o.name, o.id, type.name, ...type.aliases, 'inscription', 'runes', 'writing', 'letters'].some((n) => n && n.toLowerCase() === w)
  })
}

/**
 * READ <stone> (M10.5): Lore against the worn letters. Read, it says what it
 * says, and what it is about goes in the journal: something learnt.
 */
export function readInscription(host: CommandHost, object: ObjectInstance): Output[] {
  const { world } = host
  const here = world.state.player.location
  const type = world.content.objectTypes.get(object.type)!
  const inscription = type.inscription!
  const key = `read:${here}/${object.id}`
  const found = (world.state.player.found ??= [])
  if (found.includes(key)) return [text(`It says: ${inscription.text}`)]
  const result = playerCheck(world, 'lore', inscription.dc)
  const seen = host.pass(10)
  const out: Output[] = [checkLine(result)]
  if (good(result.degree)) {
    found.push(key)
    out.push(text(`You trace the marks with a finger until they make sense. It says: ${inscription.text}`))
    if (inscription.topic) learnTopic(world, inscription.topic)
    else gainXp(world, XP.lore, `reading the ${type.name}`)
  } else out.push(text(inscription.look ? `${inscription.look} You can't make them out.` : 'The marks are worn, or in a hand you do not know. You can not make them out.'))
  return [...out, ...seen]
}

/** A topic learnt by the stranger's own eyes: in the journal; lore is experience. */
function learnTopic(world: World, id: string): void {
  const journal = (world.state.player.journal ??= {})
  if (journal[id] !== undefined || !world.content.topics.has(id)) return
  journal[id] = world.now
  const topic = world.content.topics.get(id)!
  if (topic.kind === 'lore') gainXp(world, XP.lore, `you learned of ${topic.name}`)
}

function monthOf(world: World): number {
  return new GameClock(world.now).parts.month
}
