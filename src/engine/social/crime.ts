import { callName } from '../content'
import type { Output } from '../commands'
import { itemName, matchItem, withArticle } from '../items'
import { recordFact } from '../news'
import { remember } from '../npc/execute'
import { playerCheck } from '../rules/player'
import { upper, type World } from '../world'
import { approve } from './companions'
import { deed, setMood, shiftBond } from './deeds'
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
  /** Who did it, when it was an NPC and not the player (M7.2). */
  offender?: string
  /** Nobody saw it (M7.2): found out later, with a suspect in the rumours, and looked into by the schout. */
  unseen?: boolean
  discoverAt?: number
  discovered?: boolean
  suspect?: string
  investigated?: boolean
  t: number
  place: string
  victim?: string
  item?: string
  value: number
  grave: boolean
  witnesses: string[]
  reported: string[]
  law: string
  fine: number
  fact?: string
}

/** The id of the land's law in saves and factions; towns have their own (world.yaml). */
export const LAND_LAW = 'count'

/** Where the law locks someone up for a day: the office of the world's law, or else the officer's own house. */
export function lawCell(world: World): string | undefined {
  const law = world.words.law
  if (law.office && world.content.locations.has(law.office)) return law.office
  return law.npc && world.content.npcs.has(law.npc) ? world.npc(law.npc).home : undefined
}

export function lawAt(world: World, location: string): string {
  const area = world.content.locations.get(location)?.area
  return world.content.world.towns.find((t) => t.area === area)?.id ?? LAND_LAW
}

/** A town with rights of its own, by the id of its law. */
export function townLaw(world: World, law: string) {
  return world.content.world.towns.find((t) => t.id === law)
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
  const crimes = (world.state.crimes ??= [])
  if (c.witnesses.length === 0) {
    // Nobody saw it: the loss is noticed later, and people will have their own ideas (M7.2).
    crimes.push({ ...c, id: `crime_${crimes.length + 1}`, t: world.now, reported: [], law: lawAt(world, c.place), fine: fineFor(c.kind, c.value), unseen: true, discoverAt: world.now + 60 + world.rng.int('witness', 0, 120) })
    return out
  }
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
    const law = world.words.law
    const town = townLaw(world, entry.law)
    out.push({ kind: 'system', text: `${who} will tell the ${town ? town.officer : law.officer}. You are wanted ${town ? town.where : law.where}: a fine of ${world.money(wanted.fine)}.` })
    if (!town && law.npc && world.content.npcs.has(law.npc)) grievance(world, law.npc, 'the law', `"You're wanted, stranger. ${world.money(wanted.fine)}${law.lord ? ` to ${law.lord}` : ''}, or you come with me."`)
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
        out.push({ kind: 'text', text: amount ? `You lift ${world.money(amount)} from ${callName(npc)}'s purse.` : `${callName(npc)}'s purse is empty.` })
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
    far: `A stranger has been stealing in ${world.words.region}.`,
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
  const keeper = world.words.law
  const town = townLaw(world, law)
  const townName = town ? (world.content.areas.get(town.area)?.name ?? town.id) : ''
  const office = town?.offices[0] ? world.location(town.offices[0]).name.replace(/^The /, 'the ') : ''
  if (!debt) return [{ kind: 'error', text: town ? `${townName} wants nothing from you.` : keeper.lord ? `${upper(keeper.lord)}'s men want nothing from you.` : `The ${keeper.officer} wants nothing from you.` }]
  const at = town ? town.offices.includes(here) : Boolean(keeper.npc && world.npcsAt(here).includes(keeper.npc)) || here === keeper.office
  if (!at) return [{ kind: 'error', text: town ? `Fines to the town are paid at ${office || `the ${town.officer}`}.` : keeper.lord ? `Fines to ${keeper.lord} are paid to the ${keeper.officer}.` : `Fines are paid to the ${keeper.officer}.` }]
  if (world.state.player.money < debt.fine) return [{ kind: 'error', text: `The fine is ${world.money(debt.fine)}; you have ${world.money(world.state.player.money)}.` }]
  world.state.player.money -= debt.fine
  delete wanted[law]
  if (!town && keeper.npc && world.content.npcs.has(keeper.npc)) delete world.npcState(keeper.npc).grievance
  return [{ kind: 'text', text: `You pay ${world.money(debt.fine)}. ${town ? (town.cleared ?? `The ${town.officer} writes you out of the book.`) : `The ${keeper.officer} counts it twice and puts it away. "That settles it."`}` }]
}

/** In Waagdam, traders will not deal with someone the town wants. */
export function refusedTrade(world: World, location: string): string | undefined {
  const law = lawAt(world, location)
  const town = townLaw(world, law)
  if (!town?.trade_ban || !world.state.wanted?.[law]) return undefined
  const office = town.offices[0] ? world.location(town.offices[0]).name.replace(/^The /, 'the ') : `the ${town.officer}`
  return `Nobody ${town.where} will trade with you until you have paid your fine at ${office}.`
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

// ---------------------------------------------------------------- unseen crimes and the schout (M7.2)

const HOUR = 60

/** Whether anyone saw this person at the place around the time. */
function seenNear(world: World, who: string, crime: Crime): boolean {
  return Object.values(world.state.npcs).some((s) => {
    const seen = s.sightings?.[who]
    return seen !== undefined && seen.where === crime.place && seen.t >= crime.t - 2 * HOUR && seen.t <= crime.t + HOUR
  })
}

/**
 * Once an hour: a loss nobody saw is noticed, and people name a suspect: the
 * one who was seen there, or someone the victim never liked. The rumour may be
 * wrong. The schout goes to look.
 */
export function crimesHour(world: World): void {
  for (const crime of world.state.crimes ?? []) {
    if (!crime.unseen || crime.discovered || (crime.discoverAt ?? 0) > world.now) continue
    crime.discovered = true
    const culprit = crime.offender ?? 'player'
    const victim = crime.victim
    const disliked = victim
      ? Object.entries(world.state.bonds?.[victim] ?? {})
          .filter(([id, b]) => b.affinity < -10 && id !== victim && world.alive(id) && !world.npc(id).child)
          .sort((a, b) => a[1].affinity - b[1].affinity)[0]?.[0]
      : undefined
    crime.suspect = seenNear(world, culprit, crime) ? culprit : seenNear(world, 'player', crime) ? 'player' : disliked
    const who = victim ? callName(world.npc(victim)) : 'someone'
    const where = world.location(crime.place).name
    const what = crime.item ? withArticle(itemName(world.content, crime.item, 1)) : 'money'
    const suspect = crime.suspect === 'player' ? 'the stranger' : crime.suspect ? callName(world.npc(crime.suspect)) : undefined
    recordFact(world, {
      kind: 'crime',
      about: [...(victim ? [victim] : []), ...(crime.suspect && crime.suspect !== 'player' ? [crime.suspect] : [])],
      place: crime.place,
      belang: 2,
      juice: 0.9,
      truth: crime.suspect === culprit,
      title: `the theft at ${where}`,
      text: {
        precise: `${what.charAt(0).toUpperCase()}${what.slice(1)} went missing from ${who} at ${where}.${suspect ? ` Some say it was ${suspect}.` : ' Nobody knows who took it.'}`,
        village: `Someone took ${what} from ${who}!${suspect ? ` My money's on ${suspect}.` : ''}`,
        far: `There was a theft in ${world.words.region}.`,
      },
      ...(victim ? { witnesses: [victim] } : {}),
    })
    if (victim && crime.suspect && crime.suspect !== 'player') shiftBond(world, victim, crime.suspect, -10, -10)
    // The schout goes to look, if it is his to look into.
    const officerId = world.words.law.npc
    const schout = officerId && world.content.npcs.has(officerId) && world.alive(officerId) && crime.law === LAND_LAW ? world.state.npcs[officerId] : undefined
    if (schout && !schout.following) {
      schout.goals = schout.goals.filter((g) => g.id !== `investigate_${crime.id}`)
      schout.goals.push({ id: `investigate_${crime.id}`, type: 'Investigate', target: crime.place, priority: 1, source: 'ai', created: world.now, until: world.now + 24 * HOUR })
      schout.plan = []
      schout.planGoal = undefined
    }
  }
}

/** The schout has looked round the place: with someone seen there, he acts; without, the rumour is all there is. */
export function investigated(world: World, officer: string, place: string): void {
  if (world.npc(officer).profession !== 'schout') return
  for (const crime of world.state.crimes ?? []) {
    if (!crime.unseen || !crime.discovered || crime.investigated || crime.place !== place) continue
    crime.investigated = true
    const culprit = crime.offender ?? 'player'
    if (!seenNear(world, culprit, crime)) {
      recordFact(world, { kind: 'investigation', about: [officer], place, belang: 1, title: `the ${world.words.law.officer} found nothing`, text: { precise: `${callName(world.npc(officer))} looked into the theft at ${world.location(place).name} and found nothing.`, village: `The ${world.words.law.officer} poked about and found nothing. As usual.`, far: 'A theft went unsolved.' } })
      continue
    }
    if (culprit === 'player') {
      const wanted = ((world.state.wanted ??= {})[crime.law] ??= { fine: 0, since: world.now })
      wanted.fine += crime.fine
      grievance(world, officer, 'the law', `"A word, stranger. Things went missing at ${world.location(place).name}, and you were seen there. ${world.money(crime.fine)}${world.words.law.lord ? ` to ${world.words.law.lord}` : ' in fines'}, and we say no more about it."`)
    } else {
      const s = world.state.npcs[culprit]
      const cell = lawCell(world)
      if (s && !s.dead && cell) {
        s.stayAt = { where: cell, until: world.now + 24 * HOUR }
        s.plan = []
        s.planGoal = undefined
        s.activity = `locked up by the ${world.words.law.officer}`
      }
    }
  }
}
