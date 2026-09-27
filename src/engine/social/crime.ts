import { callName } from '../content'
import type { Output } from '../commands'
import { formatMoney, itemName, matchItem, withArticle } from '../items'
import { recordFact } from '../news'
import { remember } from '../npc/execute'
import { playerCheck } from '../rules/player'
import type { World } from '../world'
import { approve } from './companions'
import { deed, setMood } from './deeds'
import { reputeFor } from './factions'
import { mayReport } from './gates'

// Witnesses and crime (FO, chapter 8, "Getuigen en misdaad"). A crime only
// counts when someone sees it: every NPC in the scene rolls Perception against
// the player's Stealth. Witnesses make it a fact that spreads as a rumour; one
// who reports it sets the law on the player, per jurisdiction: the Count's land
// and the town rights of Waagdam are separate.

export interface Crime {
  id: string
  kind: 'theft' | 'assault' | 'murder'
  t: number
  place: string
  victim?: string
  item?: string
  value: number
  grave: boolean
  witnesses: string[]
  reported: string[]
  law: 'count' | 'waagdam'
  fine: number
  fact?: string
}

export function lawAt(world: World, location: string): 'count' | 'waagdam' {
  return world.content.locations.get(location)?.area === 'waagdam' ? 'waagdam' : 'count'
}

/** An NPC's Perception: its character's when it has one, else curiosity and a little for lawmen. */
export function perceptionOf(world: World, npcId: string): number {
  const npc = world.npc(npcId)
  const level = npc.fighter?.level ?? 1
  return 2 + npc.personality.curiosity + Math.floor(level / 2) + ((npc.values['law'] ?? 0) >= 2 ? 1 : 0) + (npc.quirks.includes('watchful') ? 2 : 0)
}

/** Who is there to see it: awake, alive, in the same place. */
export function bystanders(world: World, place: string, except: string[] = []): string[] {
  return Object.keys(world.state.npcs)
    .sort()
    .filter((id) => {
      const s = world.state.npcs[id]!
      return s.location === place && !s.dead && s.activity !== 'asleep' && !s.note && !except.includes(id)
    })
}

/** The player's Stealth against every bystander's Perception; returns who noticed. */
export function whoNoticed(world: World, place: string, except: string[] = [], extra: Record<string, number> = {}): { noticed: string[]; roll: string } {
  const check = playerCheck(world, 'stealth', 0)
  const noticed: string[] = []
  for (const id of bystanders(world, place, except)) {
    const distracted = world.state.distracted?.[id] && world.state.distracted[id]! > world.now ? -4 : 0
    if (world.rng.d20('witness') + perceptionOf(world, id) + (extra[id] ?? 0) + distracted >= check.total) noticed.push(id)
  }
  return { noticed, roll: `(Stealth ${check.total})` }
}

export function fineFor(kind: Crime['kind'], value: number): number {
  if (kind === 'murder') return 20 * 20 * 8
  if (kind === 'assault') return 5 * 20 * 8
  return Math.max(16, value * 3)
}

/**
 * A crime someone saw: the fact goes round from the witnesses, the victim and
 * those who like the victim think less of the player, and a witness who may
 * report it does, to the schout or the town watch.
 */
export function crime(world: World, c: Omit<Crime, 'id' | 't' | 'reported' | 'law' | 'fine' | 'fact'>, texts: { title: string; precise: string; village: string; far: string }): Output[] {
  const out: Output[] = []
  if (c.witnesses.length === 0) return out
  const crimes = (world.state.crimes ??= [])
  const entry: Crime = { ...c, id: `crime_${crimes.length + 1}`, t: world.now, reported: [], law: lawAt(world, c.place), fine: fineFor(c.kind, c.value) }
  crimes.push(entry)
  const area = world.location(c.place).area
  const areaTopic = world.content.areas.get(area)?.topic ?? `area_${area}`
  const about = [...(c.victim ? [c.victim] : []), ...(world.content.topics.has(areaTopic) || areaTopic.startsWith('area_') ? [areaTopic] : [])]
  const fact = recordFact(world, { kind: 'crime', about, place: c.place, belang: c.grave ? 3 : 2, juice: 0.9, title: texts.title, text: { precise: texts.precise, village: texts.village, far: texts.far }, witnesses: c.witnesses })
  entry.fact = fact.id
  const companions = new Set((world.state.companions ?? []).map((m) => m.npc))
  for (const w of c.witnesses) {
    if (w === c.victim) continue
    if (companions.has(w)) continue
    if (c.victim) {
      const liked = world.state.bonds?.[w]?.[c.victim]?.affinity ?? 0
      if (c.kind !== 'theft' && liked > 20) deed(world, w, 'violence_to_liked', { victim: c.victim })
      else deed(world, w, 'value', { tag: c.kind === 'theft' ? 'theft' : 'cruelty' })
    }
    remember(world, w, `I saw the stranger ${texts.village.replace(/^The stranger /, '').replace(/\.$/, '')}.`)
  }
  if (c.victim && c.witnesses.includes(c.victim)) {
    deed(world, c.victim, c.kind === 'theft' ? 'theft' : 'violence', { note: texts.precise })
    setMood(world, c.victim, -10, 24, texts.title)
  }
  // Reporting: whoever the gate allows tells the law.
  for (const w of c.witnesses) {
    if (companions.has(w)) continue
    if (mayReport(world, w, c.grave)) entry.reported.push(w)
  }
  if (entry.reported.length) {
    const wanted = ((world.state.wanted ??= {})[entry.law] ??= { fine: 0, since: world.now })
    wanted.fine += entry.fine
    const who = callName(world.npc(entry.reported[0]!))
    out.push({ kind: 'system', text: `${who} will tell the ${entry.law === 'waagdam' ? 'town watch' : 'schout'}. You are wanted ${entry.law === 'waagdam' ? 'in Waagdam' : "in the Count's land"}: a fine of ${formatMoney(wanted.fine)}.` })
    if (entry.law === 'count' && world.content.npcs.has('npc_everhard')) grievance(world, 'npc_everhard', 'the law', `"You're wanted, stranger. ${formatMoney(wanted.fine)} to the Count, or you come with me."`)
  }
  if (c.victim) reputeFor(world, c.victim, c.grave ? -15 : -5, `${c.kind} against ${callName(world.npc(c.victim))}`)
  approve(world, c.kind === 'theft' ? 'theft' : 'cruelty')
  return out
}

/** A grudge to have out with the player: the NPC will look for them (the goal Confront). */
export function grievance(world: World, npcId: string, reason: string, line: string): void {
  const state = world.npcState(npcId)
  state.grievance = { reason, t: world.now, line }
}

// ---------------------------------------------------------------- stealing

/**
 * STEAL <thing> [FROM <person>]: from a shop's stock, from what lies about in
 * someone's house, or from someone's pockets (Thievery against Perception).
 */
export function steal(world: World, words: string): Output[] {
  const player = world.state.player
  const here = player.location
  const m = /^(.+?)\s+from\s+(.+)$/i.exec(words.trim())
  const thingWords = (m ? m[1]! : words).trim().replace(/^(the|a|an|some)\s+/i, '')
  const out: Output[] = []

  if (m) {
    const target = findHere(world, m[2]!)
    if (!target) return [{ kind: 'error', text: `There is nobody called "${m[2]}" here.` }]
    const npc = world.npc(target)
    if (npc.child) return [{ kind: 'error', text: "You won't rob a child." }]
    const state = world.npcState(target)
    const money = /^(money|coins?|purse|geld)$/i.test(thingWords)
    const item = money ? undefined : matchItem(world.content, thingWords, Object.keys(state.inventory).filter((i) => (state.inventory[i] ?? 0) > 0))
    if (!money && !item) return [{ kind: 'error', text: `${callName(npc)} has no ${thingWords} you could lift.` }]
    const dc = 10 + perceptionOf(world, target) + (state.activity === 'asleep' ? -5 : 0) + (world.state.distracted?.[target] && world.state.distracted[target]! > world.now ? -4 : 0)
    const check = playerCheck(world, 'thievery', dc)
    out.push({ kind: 'check', text: `(Thievery ${check.total} vs DC ${dc}: ${check.degree})` })
    const caught = check.degree === 'failure' || check.degree === 'critical failure'
    if (check.degree !== 'critical failure') {
      if (money) {
        const amount = Math.min(state.money, 8 + world.rng.int('witness', 0, 24))
        state.money -= amount
        player.money += amount
        out.push({ kind: 'text', text: amount ? `You lift ${formatMoney(amount)} from ${callName(npc)}'s purse.` : `${callName(npc)}'s purse is empty.` })
      } else if (!caught) {
        state.inventory[item!]! -= 1
        if (!state.inventory[item!]) delete state.inventory[item!]
        player.inventory[item!] = (player.inventory[item!] ?? 0) + 1
        out.push({ kind: 'text', text: `You lift ${withArticle(itemName(world.content, item!, 1))} from ${callName(npc)}.` })
      }
    }
    const seen = whoNoticed(world, here, [target])
    const witnesses = [...(caught ? [target] : []), ...seen.noticed]
    if (caught) out.push({ kind: 'narration', text: `${callName(npc)} feels your hand and grabs your wrist. "Thief!"` })
    else if (seen.noticed.length) out.push({ kind: 'narration', text: `${seen.noticed.map((w) => callName(world.npc(w))).join(' and ')} saw it.` })
    const what = money ? 'money' : withArticle(itemName(world.content, item!, 1))
    out.push(...crime(world, { kind: 'theft', place: here, victim: target, ...(item ? { item } : {}), value: item ? world.basePrice(item) : 16, grave: false, witnesses }, stolenTexts(world, target, what, here)))
    return out
  }

  // From a shop, or from a house.
  for (const location of world.content.locations.values()) {
    for (const service of location.services) {
      if (location.id !== here && !service.premises.includes(here)) continue
      const item = matchItem(world.content, thingWords, Object.keys(service.sells))
      if (!item) continue
      const stock = world.stock(location.id, service.id)
      if (!stock[item]) return [{ kind: 'error', text: `There is no ${itemName(world.content, item, 1)} left to take.` }]
      stock[item] -= 1
      player.inventory[item] = (player.inventory[item] ?? 0) + 1
      const owner = service.provider
      const seen = whoNoticed(world, here, [], { [owner]: 2 })
      out.push({ kind: 'text', text: `You slip ${withArticle(itemName(world.content, item, 1))} under your coat.` }, { kind: 'check', text: seen.roll })
      if (seen.noticed.length) out.push({ kind: 'narration', text: seen.noticed.includes(owner) ? `${callName(world.npc(owner))} saw that. "Hey! Put that back, thief!"` : `${seen.noticed.map((w) => callName(world.npc(w))).join(' and ')} saw it.` })
      out.push(...crime(world, { kind: 'theft', place: here, victim: owner, item, value: world.basePrice(item), grave: false, witnesses: seen.noticed }, stolenTexts(world, owner, withArticle(itemName(world.content, item, 1)), here)))
      return out
    }
  }
  const ground = world.state.ground[here] ?? {}
  const item = matchItem(world.content, thingWords, Object.keys(ground).filter((i) => (ground[i] ?? 0) > 0))
  const loc = world.location(here)
  if (item && loc.tags.includes('private')) {
    const owner = Object.keys(world.state.npcs).sort().find((id) => world.npc(id).home === here)
    ground[item]! -= 1
    if (!ground[item]) delete ground[item]
    player.inventory[item] = (player.inventory[item] ?? 0) + 1
    const seen = whoNoticed(world, here)
    out.push({ kind: 'text', text: `You pocket ${withArticle(itemName(world.content, item, 1))}.` }, { kind: 'check', text: seen.roll })
    if (seen.noticed.length) out.push({ kind: 'narration', text: `${seen.noticed.map((w) => callName(world.npc(w))).join(' and ')} saw it.` })
    out.push(...crime(world, { kind: 'theft', place: here, ...(owner ? { victim: owner } : {}), item, value: world.basePrice(item), grave: false, witnesses: seen.noticed }, stolenTexts(world, owner, itemName(world.content, item, 1), here)))
    return out
  }
  return [{ kind: 'error', text: item ? 'That is yours to take; no need to steal it.' : `There is no ${thingWords} here to steal.` }]
}

function stolenTexts(world: World, victim: string | undefined, what: string, place: string) {
  const who = victim ? callName(world.npc(victim)) : 'someone'
  const where = world.location(place).name
  return {
    title: `the stranger stole from ${who}`,
    precise: `The stranger stole ${what} from ${who} at ${where}.`,
    village: `The stranger stole ${what} from ${who}, at ${where}.`,
    far: `A stranger has been stealing in the Holleveen.`,
  }
}

function findHere(world: World, words: string): string | undefined {
  const w = words.toLowerCase().replace(/^the\s+/, '').trim()
  return world.npcsAt(world.state.player.location).find((id) => {
    const npc = world.npc(id)
    return npc.name.toLowerCase().includes(w) || callName(npc).toLowerCase() === w || npc.aliases.some((a) => a.toLowerCase() === w) || npc.short.toLowerCase().includes(w)
  })
}

// ---------------------------------------------------------------- the law

/** PAY FINE: to the schout, or at the Waag for the town of Waagdam. */
export function payFine(world: World): Output[] {
  const wanted = world.state.wanted ?? {}
  const here = world.state.player.location
  const law = lawAt(world, here)
  const debt = wanted[law]
  if (!debt) return [{ kind: 'error', text: law === 'waagdam' ? 'Waagdam wants nothing from you.' : "The Count's men want nothing from you." }]
  const at = law === 'waagdam' ? ['loc_waagdam_waag', 'loc_waagdam_weighing_room'].includes(here) : world.npcsAt(here).includes('npc_everhard') || here === 'loc_schout_house'
  if (!at) return [{ kind: 'error', text: law === 'waagdam' ? 'Fines to the town are paid at the Waag.' : 'Fines to the Count are paid to the schout.' }]
  if (world.state.player.money < debt.fine) return [{ kind: 'error', text: `The fine is ${formatMoney(debt.fine)}; you have ${formatMoney(world.state.player.money)}.` }]
  world.state.player.money -= debt.fine
  delete wanted[law]
  if (law === 'count' && world.content.npcs.has('npc_everhard')) delete world.npcState('npc_everhard').grievance
  return [{ kind: 'text', text: `You pay ${formatMoney(debt.fine)}. ${law === 'waagdam' ? 'The clerk writes you out of the book.' : 'The schout counts it twice and puts it away. "That settles it."'}` }]
}

/** In Waagdam, traders will not deal with someone the town wants. */
export function refusedTrade(world: World, location: string): string | undefined {
  if (lawAt(world, location) !== 'waagdam' || !world.state.wanted?.['waagdam']) return undefined
  return 'Nobody in Waagdam will trade with you until you have paid your fine at the Waag.'
}

/**
 * A witness can be paid, scared or talked into silence (FO, chapter 8): they
 * no longer spread the fact, and do not report it if they had not yet.
 */
export function silenceWitness(world: World, npcId: string, how: 'bribe' | 'intimidate' | 'persuade'): string | undefined {
  const crimes = (world.state.crimes ?? []).filter((c) => c.witnesses.includes(npcId) && c.fact)
  if (!crimes.length) return undefined
  const silenced = ((world.state.silenced ??= {})[npcId] ??= [])
  for (const c of crimes) {
    if (!silenced.includes(c.fact!)) silenced.push(c.fact!)
    // Not yet at the law: then it will not get there from this witness.
    if (c.reported.includes(npcId) && world.now - c.t < 60) {
      c.reported = c.reported.filter((r) => r !== npcId)
      if (c.reported.length === 0) {
        const wanted = world.state.wanted?.[c.law]
        if (wanted) {
          wanted.fine -= c.fine
          if (wanted.fine <= 0) delete world.state.wanted![c.law]
        }
      }
    }
  }
  if (how === 'intimidate') deed(world, npcId, 'threat')
  return `${callName(world.npc(npcId))} will keep quiet about what they saw.`
}

/** Whether an NPC saw the player commit a crime. */
export function witnessed(world: World, npcId: string): boolean {
  return (world.state.crimes ?? []).some((c) => c.witnesses.includes(npcId) && !(world.state.silenced?.[npcId] ?? []).includes(c.fact ?? ''))
}

