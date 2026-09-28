import { callName } from '../content'
import { queueSignal } from '../signals'
import { ownerOf } from './ownership'
import type { Output } from '../commands'
import { itemName, matchItem, withArticle } from '../items'
import { recordFact } from '../news'
import { remember } from '../npc/execute'
import { playerCheck } from '../rules/player'
import { upper, type World } from '../world'
import { approve } from './companions'
import { applyEffect } from '../dialogue/relations'
import { deed, setMood, shiftBond } from './deeds'
import { reputeFor } from './factions'
import { mayAttackFirst, mayReport } from './gates'
import { agree } from '../agreements'

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
  /** The thief brought it back to the victim (M9.4). */
  returned?: boolean
  /** Proven against the stranger by a trace (M10.3): the thing seen on them, or sold to someone who knew it. */
  proven?: boolean
  /** The village was told who it suspected (M10.3): colder once, not twice. */
  cooled?: boolean
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
  /** No fine buys it off (M10.20): the stranger is held and heard. */
  hearing?: boolean
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

/**
 * The fine for a crime, in the smallest coin: the world's own (world.yaml law.fines), or by its coins (M10.17):
 * twenty of the largest for a death, five for a beating, and three times the value of what was taken, at least two of
 * the second coin. In the Nethermarch that is twenty guilders, five guilders and two stuivers, as before.
 */
export function fineFor(world: World, kind: Crime['kind'], value: number): number {
  const own = world.content.world.law?.fines
  const coins = world.coins
  const large = coins[0]!.value
  const small = (coins[1] ?? coins[0]!).value
  if (heardFor(world, kind)) return 0
  if (kind === 'murder') return typeof own?.murder === 'number' ? own.murder : 20 * large
  if (kind === 'assault') return typeof own?.assault === 'number' ? own.assault : 5 * large
  return Math.max(own?.least ?? 2 * small, value * 3)
}

/** Whether no fine buys a crime off in this world, but a hearing (world.yaml law.fines: "hearing", M10.20). */
export function heardFor(world: World, kind: Crime['kind']): boolean {
  const own = world.content.world.law?.fines
  return (kind === 'murder' && own?.murder === 'hearing') || (kind === 'assault' && own?.assault === 'hearing')
}

/** What the stranger is wanted for, in words: a fine, a hearing, or both (M10.20). */
function wantedFor(world: World, wanted: { fine: number; hearing?: string[] }, officer: string): string {
  const fine = wanted.fine > 0 ? `a fine of ${world.money(wanted.fine)}` : ''
  if (!wanted.hearing?.length) return fine
  return `${fine ? `${fine}, and ` : ''}no fine buys the rest off: the ${officer} will hold you for a hearing`
}

/** What the law's own officer says to someone wanted: pay, or come along (M10.20: only come along, when no fine will do). */
function lawLine(world: World, wanted: { fine: number; hearing?: string[] }): string {
  const law = world.words.law
  return wanted.hearing?.length ? `"You're wanted, stranger. You'll come with me and be heard."` : `"You're wanted, stranger. ${world.money(wanted.fine)}${law.lord ? ` to ${law.lord}` : ''}, or you come with me."`
}

/**
 * A crime someone saw: the fact goes round from the witnesses, the victim and
 * those who like the victim think less of the player, and a witness who may
 * report it does, to the schout or the town watch.
 */
/**
 * The stranger gives back what they stole (M9.4): the one it was taken from
 * knows it at once, and so knows who took it. Found in the playtest: Maren
 * thanked the thief for her own pot of pitch.
 */
export function returnStolen(world: World, npcId: string, item: string): string | undefined {
  const theft = (world.state.crimes ?? []).find((c) => c.kind === 'theft' && !c.offender && !c.returned && c.victim === npcId && c.item === item)
  if (!theft) return undefined
  theft.returned = true
  // Whoever was suspected is not any more.
  delete theft.suspect
  const name = callName(world.npc(npcId))
  const thing = itemName(world.content, item, 1)
  // What it makes up is content (M10.3): less when the stranger was caught first than of their own accord.
  mended(world, theft, 'returned')
  recordFact(world, {
    kind: 'returned',
    about: [npcId],
    place: world.state.player.location,
    belang: 2,
    title: `the stranger bringing back ${name}'s ${thing}`,
    text: {
      precise: `The stranger brought back the ${thing} they had taken from ${name}.`,
      village: `It was the stranger who took ${name}'s ${thing}, and then brought it back. Make of that what you will.`,
      far: `A stranger stole, and then brought it back, they say.`,
    },
    witnesses: [npcId],
  })
  return world.say(`{name} turns it over in {their} hands. "That's mine. From my own shelf." A long look at you, and it goes back where it belongs.`, npcId)
}

export function crime(world: World, c: Omit<Crime, 'id' | 't' | 'reported' | 'law' | 'fine' | 'fact'>, texts: { title: string; precise: string; village: string; far: string }): Output[] {
  const out: Output[] = []
  const crimes = (world.state.crimes ??= [])
  if (c.witnesses.length === 0) {
    // Nobody saw it: the loss is noticed later, and people will have their own ideas (M7.2).
    crimes.push({ ...c, id: `crime_${crimes.length + 1}`, t: world.now, reported: [], law: lawAt(world, c.place), fine: fineFor(world, c.kind, c.value), unseen: true, discoverAt: world.now + 60 + world.rng.int('witness', 0, 120) })
    return out
  }
  const entry: Crime = { ...c, id: `crime_${crimes.length + 1}`, t: world.now, reported: [], law: lawAt(world, c.place), fine: fineFor(world, c.kind, c.value), ...(heardFor(world, c.kind) ? { hearing: true } : {}) }
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
  // Caught in the act (M10.3): what the one robbed does is the engine's call.
  if (c.kind === 'theft' && c.victim && c.witnesses.includes(c.victim)) out.push(...caughtInTheAct(world, entry))
  // Reporting: whoever the gate allows tells the law.
  for (const w of c.witnesses) {
    if (companions.has(w)) continue
    // The law's own officer, seeing it, always acts on it (M10.3).
    if (mayReport(world, w, c.grave) || w === world.words.law.npc) entry.reported.push(w)
  }
  if (entry.reported.length) {
    const wanted = ((world.state.wanted ??= {})[entry.law] ??= { fine: 0, since: world.now })
    wanted.fine += entry.fine
    if (entry.hearing) (wanted.hearing ??= []).push(entry.id)
    const who = callName(world.npc(entry.reported[0]!))
    const law = world.words.law
    const town = townLaw(world, entry.law)
    out.push({ kind: 'system', text: `${who} will tell the ${town ? town.officer : law.officer}. You are wanted ${town ? town.where : law.where}: ${wantedFor(world, wanted, town ? town.officer : law.officer)}.` })
    if (!town && law.npc && world.content.npcs.has(law.npc)) grievance(world, law.npc, 'the law', lawLine(world, wanted))
  }
  if (c.victim) reputeFor(world, c.victim, c.grave ? -15 : -5, `${c.kind} against ${callName(world.npc(c.victim))}`)
  approve(world, c.kind === 'theft' ? 'theft' : 'cruelty')
  return out
}

/**
 * Caught in the act (M10.3): from character, attitude and who is there, the
 * one robbed demands it back, grabs the thief's wrist (the combat gate: a
 * fight), or shouts so everyone near becomes a witness; someone runs for the
 * law; and the law, if it is there, steps in at once.
 */
function caughtInTheAct(world: World, entry: Crime): Output[] {
  const victim = entry.victim!
  const here = entry.place
  const name = callName(world.npc(victim))
  const officer = world.words.law.npc
  const out: Output[] = []
  // The law is here: it steps in, now.
  if (officer && officer !== victim && world.content.npcs.has(officer) && world.npcsAt(here).includes(officer) && world.npcState(officer).activity !== 'asleep' && entry.law === LAND_LAW) {
    // Reported by the one who saw it: the fine and the law's grievance follow below, and he is here to have it out.
    if (!entry.witnesses.includes(officer)) entry.witnesses.push(officer)
    out.push({ kind: 'narration', text: `${callName(world.npc(officer))} steps in between you and ${name}.` })
    return out
  }
  // Hot enough to go for the thief: a hand on the wrist, and a fight if it comes to it.
  if (mayAttackFirst(world, victim, { provoked: true })) {
    const made = agree(world, { kind: 'attack', by: victim, to: 'player', source: 'rules', what: `stop the thief`, terms: { target: 'player', reason: 'the theft' } })
    if ('id' in made) {
      out.push({ kind: 'narration', text: `${name} grabs your wrist and does not let go.` })
      return out
    }
  }
  const others = world.npcsAt(here).filter((id) => id !== victim && world.npcState(id).activity !== 'asleep')
  // Timid: a shout, and everyone near is a witness now.
  if (world.npc(victim).personality.courage <= 0) {
    for (const id of others) if (!entry.witnesses.includes(id)) entry.witnesses.push(id)
    recordFact(world, { kind: 'shout', about: [victim], place: here, belang: 1, loud: true, title: `${name} shouting "thief"`, text: { precise: `${name} shouted "thief!" at the stranger.`, village: `${name} caught the stranger thieving and shouted the place down.`, far: 'A thief was caught.' } })
    out.push({ kind: 'narration', text: `${name} shouts "Thief! Thief!" loud enough to fetch the whole street.` })
  } else {
    grievance(world, victim, 'theft', `"You'll give that back, thief, or I'll know why."`)
    out.push({ kind: 'narration', text: `${name} holds out a hand. "Give that back. Now."` })
  }
  // Someone runs for the law, if the gate lets them and the law is not here.
  const runner = others.find((id) => !world.npc(id).child && world.npc(id).personality.courage >= 0 && mayReport(world, id, false) && !(world.state.companions ?? []).some((c) => c.npc === id))
  if (runner) out.push({ kind: 'narration', text: `${callName(world.npc(runner))} runs off to fetch the ${townLaw(world, entry.law)?.officer ?? world.words.law.officer}.` })
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
    if (caught) out.push({ kind: 'narration', text: `${callName(npc)} feels your hand in ${npc.pronoun === 'she' ? 'her' : npc.pronoun === 'he' ? 'his' : 'their'} pocket.` })
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
      const owner = ownerOf(world, here, { service: service.id }).id ?? service.provider
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
  // What lies in someone's home is the household's: the one owner function says so (M10.3).
  const owned = ownerOf(world, here)
  if (item && (owned.kind === 'household' || owned.kind === 'person')) {
    const owner = owned.id
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
  // No fine buys off what wants a hearing (M10.20): the stranger gives themselves up instead.
  if (debt.hearing?.length) return [{ kind: 'error', text: `No fine buys this off. GIVE YOURSELF UP to the ${town ? town.officer : keeper.officer}: you will be held, and heard.` }]
  if (world.state.player.money < debt.fine) return [{ kind: 'error', text: `The fine is ${world.money(debt.fine)}; you have ${world.money(world.state.player.money)}.` }]
  world.state.player.money -= debt.fine
  delete wanted[law]
  if (!town && keeper.npc && world.content.npcs.has(keeper.npc)) delete world.npcState(keeper.npc).grievance
  return [{ kind: 'text', text: `You pay ${world.money(debt.fine)}. ${town ? (town.cleared ?? `The ${town.officer} writes you out of the book.`) : `The ${keeper.officer} counts it twice and puts it away. "That settles it."`}` }]
}

/**
 * GIVE YOURSELF UP (M10.20): to the officer, or at the office, when what the
 * stranger is wanted for wants a hearing. The engine holds them in the cell
 * for the hours the world gives, then the hearing settles the whole matter.
 */
export function surrenderTo(world: World): { error: string } | { law: string; hours: number; cell?: string; held: string } {
  const here = world.state.player.location
  const law = lawAt(world, here)
  const debt = world.state.wanted?.[law]
  const keeper = world.words.law
  const town = townLaw(world, law)
  const officer = town ? town.officer : keeper.officer
  if (!debt) return { error: `The ${officer} wants nothing from you.` }
  if (!debt.hearing?.length) return { error: `The ${officer} wants a fine, not you: PAY FINE settles it.` }
  const at = town ? town.offices.includes(here) : Boolean(keeper.npc && world.npcsAt(here).includes(keeper.npc)) || here === keeper.office
  if (!at) return { error: town ? `You give yourself up at ${town.offices[0] ? world.location(town.offices[0]).name : `the ${officer}'s`}.` : `You give yourself up to the ${officer}${keeper.office ? `, at ${world.location(keeper.office).name}` : ''}.` }
  const own = world.content.world.law?.hearing
  const cell = lawCell(world)
  return { law, hours: own?.hours ?? 24, ...(cell ? { cell } : {}), held: own?.held ?? `The ${officer} takes you in, and you are held until the case can be heard.` }
}

/** The hearing (M10.20): the matter is settled, fines and all; the officer's grievance goes, and the village hears of it. */
export function hearing(world: World, law: string): Output[] {
  delete world.state.wanted?.[law]
  const keeper = world.words.law
  if (!townLaw(world, law) && keeper.npc && world.content.npcs.has(keeper.npc)) delete world.npcState(keeper.npc).grievance
  const own = world.content.world.law?.hearing
  recordFact(world, { kind: 'hearing', about: keeper.npc && world.content.npcs.has(keeper.npc) ? [keeper.npc] : [], place: world.state.player.location, belang: 3, title: 'the stranger held and heard', text: { precise: `The stranger gave themselves up to the ${keeper.officer} and was held and heard.`, village: `The stranger was locked up and brought before a hearing!`, far: 'A stranger was held and heard.' } })
  return [{ kind: 'narration', text: own?.heard ?? `The case is heard. It is written down, and you are let go.` }]
}

/** In Waagdam, traders will not deal with someone the town wants. */
export function refusedTrade(world: World, location: string): string | undefined {
  // Insulted today, a trader keeps their trade shut to the stranger (M10.3).
  const sulking = [...world.content.locations.values()].flatMap((l) => l.services.filter((s) => l.id === location || s.premises.includes(location))).map((s) => s.provider).find((id) => (world.state.npcs[id]?.noService ?? 0) > world.now)
  if (sulking) return `${callName(world.npc(sulking))} won't serve you today, not after what you said.`
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
          if (wanted.hearing) wanted.hearing = wanted.hearing.filter((id) => id !== c.id)
          if (wanted.fine <= 0 && !wanted.hearing?.length) delete world.state.wanted![c.law]
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
    // Suspicion is no proof (M10.3): the stranger suspected, the village is colder, and that is all.
    if (crime.suspect === 'player') coolVillage(world, crime)
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

/**
 * Repair (M10.3): the stranger gives back or pays for what they took. It is a
 * signal, and the standard aftermath of the content says what it makes up:
 * less when they were caught or proven first than of their own accord.
 */
function mended(world: World, theft: Crime, how: 'returned' | 'paid'): void {
  if (!theft.victim) return
  const caught = Boolean(theft.proven || theft.witnesses.includes(theft.victim))
  queueSignal(world, { kind: 'theft_mended', event: caught ? 'after_caught' : 'own_accord', who: [theft.victim], place: world.state.npcs[theft.victim]?.location ?? theft.place, cause: theft.fact ? [theft.fact] : [], belang: 1, claim: { subject: theft.victim, key: 'mended', value: how }, watcher: 'rules' })
}

/** PAY <person>: paying for what the stranger took from them (M10.3), its worth. */
export function payFor(world: World, npcId: string): Output[] | undefined {
  const theft = (world.state.crimes ?? []).find((c) => c.kind === 'theft' && !c.offender && !c.returned && c.victim === npcId && (!c.unseen || c.proven || c.discovered))
  if (!theft) return undefined
  const name = callName(world.npc(npcId))
  if (world.state.player.money < theft.value) return [{ kind: 'error', text: `What you took from ${name} was worth ${world.money(theft.value)}. You have ${world.money(world.state.player.money)}.` }]
  world.state.player.money -= theft.value
  world.npcState(npcId).money += theft.value
  theft.returned = true
  delete theft.suspect
  mended(world, theft, 'paid')
  return [{ kind: 'text', text: `You pay ${name} ${world.money(theft.value)} for what you took.` }, { kind: 'narration', text: world.say('{name} takes the money without a word, and counts it.', npcId) }]
}

/** The stranger is suspected (M10.3): the victim's village trusts them a little less, once per theft. */
function coolVillage(world: World, crime: Crime): void {
  if (crime.cooled || !crime.victim) return
  crime.cooled = true
  const area = world.location(world.npc(crime.victim).home).area
  for (const id of Object.keys(world.state.npcs).sort()) {
    if (!world.alive(id) || world.npc(id).child || !world.content.locations.has(world.npc(id).home) || world.location(world.npc(id).home).area !== area) continue
    applyEffect(world, id, 'trust', -3)
  }
}

/**
 * A trace that proves it (M10.3): the one robbed sees the thing on the
 * stranger, or someone who knows whose it is is offered it. Proof gives a
 * fine and a name: the theft is news with the stranger in it, and the law
 * hears of it.
 */
export function proveTheft(world: World, crime: Crime, witness: string, how: string): Output[] {
  if (crime.proven || crime.returned) return []
  crime.proven = true
  crime.unseen = false
  crime.discovered = true
  crime.suspect = 'player'
  if (!crime.witnesses.includes(witness)) crime.witnesses.push(witness)
  const victim = crime.victim
  const who = victim ? callName(world.npc(victim)) : 'someone'
  const what = crime.item ? withArticle(itemName(world.content, crime.item, 1)) : 'money'
  const fact = recordFact(world, { kind: 'crime', about: [...(victim ? [victim] : []), witness], place: world.state.player.location, belang: 2, juice: 0.9, title: `the stranger's theft from ${who}`, text: { precise: `It was the stranger who stole ${what} from ${who}: ${how}.`, village: `So it was the stranger who took ${who}'s ${crime.item ? itemName(world.content, crime.item, 1) : 'money'}!`, far: `A stranger was caught with stolen goods.` }, witnesses: [witness, ...(victim && world.npcsAt(world.state.player.location).includes(victim) ? [victim] : [])] })
  crime.fact = fact.id
  if (victim) {
    deed(world, victim, 'theft', { note: fact.text.precise })
    grievance(world, victim, 'theft', `"You'll give me back my ${crime.item ? itemName(world.content, crime.item, 1) : 'money'}, thief."`)
  }
  const out: Output[] = []
  if (mayReport(world, witness, false) || witness === victim || witness === world.words.law.npc) {
    crime.reported.push(witness)
    const wanted = ((world.state.wanted ??= {})[crime.law] ??= { fine: 0, since: world.now })
    wanted.fine += crime.fine
    const town = townLaw(world, crime.law)
    out.push({ kind: 'system', text: `${callName(world.npc(witness))} will tell the ${town ? town.officer : world.words.law.officer}. You are wanted ${town ? town.where : world.words.law.where}: ${wantedFor(world, wanted, town ? town.officer : world.words.law.officer)}.` })
    const law = world.words.law
    if (!town && law.npc && world.content.npcs.has(law.npc)) grievance(world, law.npc, 'the law', lawLine(world, wanted))
  }
  return out
}

/**
 * After each of the stranger's commands (M10.3): whoever was robbed and is
 * here, awake, sees their own thing on the stranger.
 */
export function stolenSeen(world: World): Output[] {
  const here = world.state.player.location
  const out: Output[] = []
  for (const crime of world.state.crimes ?? []) {
    if (crime.kind !== 'theft' || crime.offender || crime.returned || crime.proven || !crime.item || !crime.victim) continue
    if ((world.state.player.inventory[crime.item] ?? 0) <= 0 || crime.witnesses.includes(crime.victim)) continue
    // Openly: what the stranger wields or wears, not what is in their pack.
    const gear = world.state.player.character?.gear
    if (!gear || ![gear.weapon, gear.armour, gear.shield].includes(crime.item)) continue
    if (!world.npcsAt(here).includes(crime.victim) || world.npcState(crime.victim).activity === 'asleep') continue
    out.push({ kind: 'narration', text: `${callName(world.npc(crime.victim))} stares at what you carry. "That's my ${itemName(world.content, crime.item, 1)}!"` }, ...proveTheft(world, crime, crime.victim, `${callName(world.npc(crime.victim))} saw it on the stranger`))
  }
  return out
}

/** Offered a stolen thing by the stranger, someone who knows whose it is recognises it (M10.3). */
export function recognisedSale(world: World, buyer: string, item: string): Output[] | undefined {
  const crime = (world.state.crimes ?? []).find((c) => c.kind === 'theft' && !c.offender && !c.returned && !c.proven && c.item === item && c.victim)
  if (!crime) return undefined
  const victim = crime.victim!
  const area = (id: string) => world.location(world.npc(id).home).area
  const knows = buyer === victim || area(buyer) === area(victim) || Boolean(world.state.bonds?.[buyer]?.[victim])
  if (!knows) return undefined
  return [{ kind: 'narration', text: `${callName(world.npc(buyer))} turns it over and goes still. "This is ${callName(world.npc(victim))}'s. Where did you get it?"` }, ...proveTheft(world, crime, buyer, `${callName(world.npc(buyer))} knew it for ${callName(world.npc(victim))}'s when the stranger tried to sell it`)]
}

/** The officer of the law has looked round the place: with someone seen there, they act; without, the rumour is all there is. */
export function investigated(world: World, officer: string, place: string): void {
  // Only the officer of the law, or one of the same trade (M10.17: the world's law.npc, before the schout by name).
  const lawNpc = world.words.law.npc
  if (officer !== lawNpc && (!lawNpc || !world.content.npcs.has(lawNpc) || world.npc(officer).profession !== world.npc(lawNpc).profession)) return
  for (const crime of world.state.crimes ?? []) {
    if (!crime.unseen || !crime.discovered || crime.investigated || crime.place !== place) continue
    crime.investigated = true
    const culprit = crime.offender ?? 'player'
    if (!seenNear(world, culprit, crime)) {
      recordFact(world, { kind: 'investigation', about: [officer], place, belang: 1, title: `the ${world.words.law.officer} found nothing`, text: { precise: `${callName(world.npc(officer))} looked into the theft at ${world.location(place).name} and found nothing.`, village: `The ${world.words.law.officer} poked about and found nothing. As usual.`, far: 'A theft went unsolved.' } })
      continue
    }
    if (culprit === 'player') {
      // Seen there is suspicion, not proof (M10.3): no fine, but the law keeps an eye on the stranger.
      applyEffect(world, officer, 'trust', -5)
      const memory = (world.npcState(officer).memory ??= [])
      memory.push({ t: world.now, note: `Things went missing at ${world.location(place).name}, and the stranger was seen there. I have no proof. Yet.`, topics: [place], valence: -1 })
      coolVillage(world, crime)
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
