import { LAND_LAW } from './crime'
import { minuteOfDay } from '../clock'
import type { Output } from '../commands'
import { areaTopicId, callName } from '../content'
import { attitude } from '../dialogue/relations'
import { recordFact } from '../news'
import { autoLevelChoice, createCharacter, levelUp, maxHp, skillBonus, suggestChoice, xpForLevel, type Character } from '../rules/character'
import { gainXp, readyMade } from '../rules/player'
import type { World } from '../world'
import { mayJoin } from './gates'

// Companions (FO, chapter 13): up to three NPCs travel with the player. A
// formula decides whether someone comes, and on what terms; the model only
// puts the terms in words. A companion stays an NPC with a will of its own:
// it has an opinion on what the player does, can refuse an order, and can go.

export type Stance = 'aggressive' | 'defensive' | 'support' | 'hold' | 'protect' | 'follow'

export interface Companion {
  npc: string
  since: number
  /** 0 to 100: whether orders are followed and whether they stay. */
  loyalty: number
  /** 0 to 3, from shared events; the points behind it. */
  bond: number
  bondPoints: number
  stance: Stance
  protect?: string
  conditions: { until?: number; untilPlace?: string; wage: number; limits: string[] }
  /** The last day the wage was paid, and days it was not. */
  paidDay: number
  unpaid: number
  approvals: { t: number; text: string; delta: number }[]
  /** The companion as a character: class, level and hit points (FO, chapter 13: they rise with the group). */
  character: Character
  lastCampfire?: number
  told: number
  /** Away on an order: scouting, waiting somewhere, gone to meet the player. */
  away?: { kind: 'scout' | 'wait' | 'meet'; where: string; until?: number; report?: string[] }
  lastOrder?: { text: string; t: number }
  lastShared?: number
  betrayal?: number
  personalOpen?: boolean
}

export const MAX_COMPANIONS = 3
const DAY = 24 * 60

export function companions(world: World): Companion[] {
  return world.state.companions ?? []
}

export function companionOf(world: World, npcId: string): Companion | undefined {
  return companions(world).find((c) => c.npc === npcId)
}

/** The companions who are with the player right now (not away on an order). */
export function withPlayer(world: World): Companion[] {
  return companions(world).filter((c) => !c.away)
}

// ---------------------------------------------------------------- danger and recruiting

/** How dangerous a place is to an NPC, 0 to 5: its labels, the night, and what the NPC knows of it. */
export function dangerOf(world: World, place: string, npcId?: string): number {
  const location = world.content.locations.get(place)
  const area = location ? world.content.areas.get(location.area) : world.content.areas.get(place)
  const tags = location?.tags ?? []
  let danger = 0
  if (tags.includes('haunted') || tags.includes('cursed')) danger += 2
  if (tags.includes('lair')) danger += 2
  if (tags.includes('fae')) danger += 1
  danger += tags.filter((t) => t.startsWith('hazard:')).length
  if (tags.includes('wilderness') || area?.kind === 'wilderness') danger += 1
  if (npcId && area) {
    const topic = areaTopicId(world.content, area.id)
    const legend = world.content.topics.get(topic)
    // The Kattenbroek is more dangerous for those who know the legend (FO, chapter 13).
    if (legend && (legend.known_by.includes(npcId) || (legend.fame ?? 0) >= 2)) danger += 1
  }
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  if (hour >= 21 || hour < 5) danger += 1
  return Math.min(5, danger)
}

export interface Offer {
  decision: 'refuse' | 'terms' | 'join'
  willingness: number
  reasons: string[]
  terms: Companion['conditions']
}

/**
 * The recruiting formula (FO, chapter 13): attitude, whether the journey fits
 * the NPC's own goals, danger, work and family, and the wage. Below 0 the NPC
 * refuses and says why; up to 30 it comes on terms; above 30 it comes.
 */
export function offer(world: World, npcId: string, destination?: string): Offer {
  const npc = world.npc(npcId)
  const def = npc.companion
  const reasons: string[] = []
  const terms: Companion['conditions'] = { wage: def?.wage ?? 32, limits: [...(def?.limits ?? [])] }
  const fears = npc.quirks.includes('afraid_of_deep_water') ? ['the fen and its deep water frighten me'] : []
  if (!def) return { decision: 'refuse', willingness: -100, reasons: ['my life is here, not on the road with a stranger', ...fears], terms }
  if (!mayJoin(world, npcId)) return { decision: 'refuse', willingness: -50, reasons: ['I hardly know this stranger, and do not trust them enough', ...(npc.work ? [`my work at ${world.location(npc.work).name} needs me`] : []), ...fears], terms }
  if (companions(world).length >= MAX_COMPANIONS) return { decision: 'refuse', willingness: -50, reasons: ['you have three people with you already'], terms }
  const score = attitude(world, npcId).score
  let goalMatch = 0
  const patron = world.state.player.character?.patron?.id
  const rep = world.state.reputation ?? {}
  const factions = [...world.content.factions.values()].filter((f) => f.members.includes(npcId))
  if ((patron && patron === npc.patron) || factions.some((f) => (rep[f.id] ?? 0) >= 20)) goalMatch = 1
  if ((world.state.wanted?.[LAND_LAW] && (npc.values['law'] ?? 0) >= 1) || factions.some((f) => (rep[f.id] ?? 0) < -20)) goalMatch = -1
  const danger = destination ? dangerOf(world, destination, npcId) : 1
  const duty = npc.work ? Math.max(0, npc.personality.diligence) * 5 : 0
  const family = Math.max(0, npc.values['family'] ?? 0) * 5
  const canPay = world.state.player.money >= terms.wage * 3
  const reward = canPay ? 10 : -5
  const willingness = Math.round(score - 15 + goalMatch * 20 - danger * 8 - duty - family + reward)
  if (goalMatch < 0) reasons.push('what you are doing does not sit well with me')
  if (danger >= 3) reasons.push(`${destination ? world.content.locations.get(destination)?.name ?? 'that place' : 'the way'} is dangerous`)
  if (duty >= 10) reasons.push(`my work at ${npc.work ? world.location(npc.work).name : 'home'} needs me`)
  if (family >= 10) reasons.push('my family needs me')
  if (!canPay) reasons.push(`you cannot pay ${world.money(terms.wage)} a day for long`)
  reasons.push(...fears)
  if (willingness < 0) return { decision: 'refuse', willingness, reasons: reasons.length ? reasons : ['it does not suit me now'], terms }
  if (willingness <= 30) {
    terms.until = world.now + (3 + Math.floor(willingness / 10)) * DAY
    if (destination) terms.untilPlace = destination
    if (npc.personality.courage <= 0) terms.limits.push('haunted')
  }
  return { decision: willingness <= 30 ? 'terms' : 'join', willingness, reasons, terms }
}

/** The companion as a character of its class, at its own level or one under the player's. */
export function characterFor(world: World, npcId: string): Character {
  const npc = world.npc(npcId)
  const klass = npc.fighter?.class ?? readyMade(world.content).class
  const made = createCharacter(world.content, suggestChoice(world.content, klass, callName(npc)))
  if ('problems' in made) throw new Error(made.problems.join(' '))
  const c = made.character
  const target = Math.max(npc.fighter?.level ?? 1, (world.state.player.character?.level ?? 1) - 1)
  while (c.level < target) {
    c.xp = xpForLevel(world.content, c.level + 1)
    levelUp(world.content, c, autoLevelChoice(world.content, c))
  }
  c.hp = maxHp(world.content, c)
  return c
}

/** RECRUIT <person> [to <place>]: asks someone to come along. */
export function recruit(world: World, npcId: string, destination?: string): Output[] {
  const npc = world.npc(npcId)
  const name = callName(npc)
  if (companionOf(world, npcId)) return [{ kind: 'error', text: `${name} is already with you.` }]
  const o = offer(world, npcId, destination)
  if (o.decision === 'refuse') return [{ kind: 'speech', text: world.say(`{name} shakes {their} head. "No. ${capitalise(o.reasons[0]!)}${o.reasons[1] ? `, and ${o.reasons[1]}` : ''}."`, npcId) }]
  const c: Companion = {
    npc: npcId,
    since: world.now,
    loyalty: Math.max(20, Math.min(80, 30 + o.willingness)),
    bond: 0,
    bondPoints: 0,
    // Who heals by their calling stands behind (M9.1: from the class's core, not a list of names).
    stance: supports(world, npc.fighter?.class) ? 'support' : 'aggressive',
    conditions: o.terms,
    paidDay: Math.floor(world.now / DAY) - 1,
    unpaid: 0,
    approvals: [],
    character: characterFor(world, npcId),
    told: 0,
  }
  ;(world.state.companions ??= []).push(c)
  follow(world, npcId)
  payWages(world)
  const terms = [
    `${world.money(o.terms.wage)} a day`,
    ...(o.terms.until ? [`for ${Math.round((o.terms.until - world.now) / DAY)} days`] : []),
    ...(o.terms.untilPlace ? [`as far as ${world.content.locations.get(o.terms.untilPlace)?.name ?? 'there'}`] : []),
    ...o.terms.limits.map((l) => (l === 'haunted' ? 'not into haunted places' : `not into ${world.content.locations.get(l)?.name ?? world.content.areas.get(l)?.name ?? l}`)),
  ]
  const line = o.decision === 'join' ? `"All right. I'm with you."` : `"I'll come. ${capitalise(terms.join(', '))}. That's my price."`
  return [{ kind: 'speech', text: `${name}: ${line}` }, { kind: 'system', text: `${name} travels with you now (loyalty ${c.loyalty}). Terms: ${terms.join('; ')}.` }]
}

function follow(world: World, npcId: string): void {
  const state = world.npcState(npcId)
  state.following = true
  state.location = world.state.player.location
  state.plan = []
  state.goals = state.goals.filter((g) => g.source !== 'ai')
  state.activity = 'with you'
  delete state.note
}

/** A companion goes: home to its own life. */
export function leave(world: World, npcId: string, why: string): Output[] {
  const list = companions(world)
  const c = list.find((x) => x.npc === npcId)
  if (!c) return []
  world.state.companions = list.filter((x) => x !== c)
  const state = world.npcState(npcId)
  state.following = false
  state.activity = 'going home'
  state.busyUntil = world.now
  const name = callName(world.npc(npcId))
  return [{ kind: 'narration', text: `${name} ${why}` }]
}

// ---------------------------------------------------------------- every minute and every day

/** Companions go where the player goes; the simulation leaves them be meanwhile. */
export function keepUp(world: World): void {
  for (const c of companions(world)) {
    const state = world.npcState(c.npc)
    if (c.away) {
      if (c.away.until !== undefined && world.now >= c.away.until) comeBack(world, c)
      continue
    }
    state.location = world.state.player.location
    state.following = true
    state.activity = world.state.combat ? 'fighting beside you' : 'with you'
    state.busyUntil = world.now + 30
  }
}

/** Once an hour: wages at dawn, the terms, loyalty, going home, and betrayal (FO, chapter 13, "Vertrek en verraad"). */
export function companionsHour(world: World): void {
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  for (const c of [...companions(world)]) {
    const npc = world.npc(c.npc)
    const state = world.npcState(c.npc)
    // Needs: a companion eats when the party is somewhere with food, and sleeps when you sleep.
    if (state.needs.hunger < 40 && !c.away) feed(world, c)
    if (hour !== 6) continue
    payWages(world)
    if (state.needs.hunger < 20) adjust(world, c, -3, `${callName(npc)} is hungry and it shows.`)
    const name = callName(npc)
    if (c.loyalty < 20) world.notices.push(...leave(world, c.npc, 'has had enough, and goes home without a word.').map((o) => o.text))
    else if (c.unpaid >= 2) world.notices.push(...leave(world, c.npc, 'has not been paid for two days, and goes home.').map((o) => o.text))
    else if (c.conditions.until !== undefined && world.now >= c.conditions.until) world.notices.push(...leave(world, c.npc, 'says the days you agreed are up, and goes home. Ask again if you want them along.').map((o) => o.text))
    else if (homeTrouble(world, c.npc)) world.notices.push(...leave(world, c.npc, 'hears bad news from home and goes, at once.').map((o) => o.text))
    else betrayal(world, c, name)
  }
}

/** Arriving where the terms end: the companion asks to go home. */
export function arrived(world: World): void {
  const here = world.state.player.location
  const area = world.content.locations.get(here)?.area
  for (const c of [...companions(world)]) {
    if (c.conditions.untilPlace && (c.conditions.untilPlace === here || c.conditions.untilPlace === area)) {
      world.notices.push(...leave(world, c.npc, `asks if they may go home now; you said as far as here. They go.`).map((o) => o.text))
    }
  }
}

function homeTrouble(world: World, npcId: string): boolean {
  const heard = world.state.news?.heard[npcId] ?? {}
  return (world.state.news?.facts ?? []).some((f) => (f.kind === 'death' || f.kind === 'missing') && heard[f.id] && world.now - f.t < DAY && world.npc(npcId).relations.some((r) => r.to && f.about.includes(r.to) && ['parent', 'child', 'spouse', 'sibling', 'sweetheart'].includes(r.role)))
}

function payWages(world: World): void {
  const today = Math.floor(world.now / DAY)
  for (const c of companions(world)) {
    if (c.paidDay >= today) continue
    const wage = attitude(world, c.npc).band === 'Devoted' ? 0 : c.conditions.wage
    if (world.state.player.money >= wage) {
      world.state.player.money -= wage
      // The wage goes into the companion's purse (M8.4: it no longer vanishes).
      world.npcState(c.npc).money += wage
      c.paidDay = today
      if (c.unpaid > 0) c.unpaid = 0
      if (wage > 0 && today % 7 === 0) approve(world, 'fair_wage', [c.npc])
    } else {
      c.unpaid++
      world.notices.push(`You cannot pay ${callName(world.npc(c.npc))} today (${world.money(wage)}).`)
    }
  }
}

function feed(world: World, c: Companion): void {
  const state = world.npcState(c.npc)
  for (const location of world.content.locations.values()) {
    if (location.id !== world.state.player.location) continue
    for (const service of location.services) {
      const food = Object.keys(service.sells).find((i) => world.content.items.get(i)?.food && (world.stock(location.id, service.id)[i] ?? 0) > 0)
      if (!food || !world.serviceOpen(location.id, service)) continue
      const price = world.price(location.id, service, food)
      if (state.money < price) continue
      state.money -= price
      world.npcState(service.provider).money += price
      world.stock(location.id, service.id)[food]! -= 1
      state.needs.hunger = Math.min(100, state.needs.hunger + (world.content.items.get(food)!.food ?? 30))
      return
    }
  }
}

/** Rest for the party when the player sleeps. */
export function restParty(world: World): void {
  for (const c of withPlayer(world)) {
    const state = world.npcState(c.npc)
    state.needs.rest = 100
    c.character.hp = maxHp(world.content, c.character)
  }
}

function betrayal(world: World, c: Companion, name: string): void {
  const npc = world.npc(c.npc)
  // Rare, and always announced: low loyalty, a dishonest heart, and an offer from the other side.
  const offered = Boolean(world.state.player.encounters?.['goat_riders_toll'])
  if (c.betrayal === undefined && c.loyalty < 10 && npc.personality.honesty <= -1 && offered) {
    c.betrayal = world.now + DAY
    world.npcState(c.npc).mood = { value: -3, until: world.now + DAY, reason: 'counting coins they did not have yesterday' }
    return
  }
  if (c.betrayal !== undefined && world.now >= c.betrayal) {
    const taken = Math.floor(world.state.player.money / 3)
    world.state.player.money -= taken
    world.npcState(c.npc).money += taken
    world.notices.push(...leave(world, c.npc, `is gone in the night, and so is ${world.money(taken)} of your money.`).map((o) => o.text))
    recordFact(world, { kind: 'betrayal', about: [c.npc], place: world.state.player.location, belang: 2, title: `${name} robbed the stranger`, text: { precise: `${name} left the stranger in the night with ${world.money(taken)} of their money.`, village: `${name} ran off with the stranger's money, they say.`, far: `A companion robbed a traveller in ${world.words.region}.` } })
  }
}

// ---------------------------------------------------------------- approval and bond

const APPROVE = ['{name} nods slowly.', '{name} gives you a look of respect.', '{name} grins.']
const DISAPPROVE = ["{name}'s mouth tightens.", '{name} looks away.', '{name} says nothing, pointedly.']

/** Companions react to what the player does, through their values (FO, chapter 13, "Goedkeuring"). */
export function approve(world: World, tag: string, only?: string[]): void {
  for (const c of withPlayer(world)) {
    if (only && !only.includes(c.npc)) continue
    const def = world.npc(c.npc).companion
    if (!def) continue
    const sign = def.approves.includes(tag) ? 1 : def.disapproves.includes(tag) ? -1 : 0
    if (!sign) continue
    const lines = sign > 0 ? APPROVE : DISAPPROVE
    const text = lines[(c.approvals.length + tag.length) % lines.length]!.replace('{name}', callName(world.npc(c.npc)))
    adjust(world, c, sign > 0 ? 3 : -4, text)
    c.approvals.push({ t: world.now, text: `${sign > 0 ? '+' : '-'} ${tag.replace(/_/g, ' ')}`, delta: sign > 0 ? 3 : -4 })
    if (c.approvals.length > 30) c.approvals.splice(0, c.approvals.length - 30)
  }
}

function adjust(world: World, c: Companion, delta: number, text: string): void {
  c.loyalty = Math.max(0, Math.min(100, c.loyalty + delta))
  world.notices.push(text)
}

/** Shared events make a bond, 0 to 3 (FO, chapter 11, "Banden met gezellen"). */
export function share(world: World, npcId: string, points: number, why: string): void {
  const c = companionOf(world, npcId)
  if (!c) return
  const before = c.bond
  c.bondPoints += points
  c.bond = c.bondPoints >= 9 ? 3 : c.bondPoints >= 5 ? 2 : c.bondPoints >= 2 ? 1 : 0
  if (c.bond > before) {
    c.loyalty = Math.min(100, c.loyalty + 5)
    const name = callName(world.npc(npcId))
    world.notices.push(`You and ${name} are closer now (bond ${c.bond}): ${why}.`)
    if (c.bond === 3 && !c.personalOpen) openPersonal(world, c)
  }
}

/** Surviving a fight together, once a day per companion. */
export function sharedFight(world: World): void {
  const today = Math.floor(world.now / DAY)
  for (const c of withPlayer(world)) {
    if (c.lastShared === today) continue
    c.lastShared = today
    share(world, c.npc, 1, 'you came through a fight together')
  }
}

/** Bond 3 opens the companion's personal quest (Wereldboek, "Persoonlijke quests van de gezellen"). */
function openPersonal(world: World, c: Companion): void {
  c.personalOpen = true
  const quest = world.npc(c.npc).companion?.quest
  const q = quest ? world.content.quests.get(quest) : undefined
  if (!q) return
  // The quest itself begins the next time the player talks to them (quests/engine.ts).
  ;(world.state.flags ??= {})[`personal_${quest}`] = true
  world.notices.push(`${callName(world.npc(c.npc))} wants to talk to you about something of their own: ${q.name}. Talk to them.`)
}

/** Companions rise with the group: one level under the player, or their own if higher. */
export function syncLevels(world: World): void {
  const level = world.state.player.character?.level ?? 1
  for (const c of companions(world)) {
    while (c.character.level < level - 1) {
      c.character.xp = xpForLevel(world.content, c.character.level + 1)
      const result = levelUp(world.content, c.character, autoLevelChoice(world.content, c.character))
      if ('problems' in result) break
    }
  }
}

// ---------------------------------------------------------------- orders outside a fight

/**
 * ORDER <companion> TO <order> (FO, chapter 13, "Bevelen buiten gevecht"):
 * wait here, follow me, go home, meet me at <place>, scout <place>, distract
 * <person>. An order that clashes with the companion's character is refused
 * unless loyalty is high enough: an honest one steals only at 80, a dangerous
 * place needs 60 less five for each point of courage.
 */
export function order(world: World, npcId: string, what: string): Output[] {
  const c = companionOf(world, npcId)
  const npc = world.npc(npcId)
  const name = callName(npc)
  if (!c) return [{ kind: 'error', text: `${name} is not with you.` }]
  const w = what.toLowerCase().trim().replace(/^to\s+/, '')
  const pointless = c.lastOrder && c.lastOrder.text === w && world.now - c.lastOrder.t < 10
  c.lastOrder = { text: w, t: world.now }
  if (pointless) approve(world, 'pointless_order', [npcId])
  if (/^(wait|stay|hold)( here)?$/.test(w) || w.startsWith('guard')) {
    c.away = { kind: 'wait', where: world.state.player.location }
    world.npcState(npcId).activity = 'waiting for you'
    return [{ kind: 'speech', text: `${name}: "I'll be here."` }]
  }
  if (/^(follow|come)( me)?$/.test(w)) {
    if (c.away && c.away.where !== world.state.player.location) return [{ kind: 'error', text: `${name} is not here to follow you.` }]
    delete c.away
    follow(world, npcId)
    return [{ kind: 'speech', text: `${name}: "Right behind you."` }]
  }
  if (/^(go home|leave|dismiss)/.test(w)) return leave(world, npcId, 'nods and goes home.')
  const place = /^(?:meet me at|meet me in|scout|explore|go to)\s+(.+)$/.exec(w)
  if (place) {
    const target = findPlace(world, place[1]!)
    if (!target) return [{ kind: 'error', text: `${name} does not know a place called "${place[1]}".` }]
    const refusal = refuses(world, c, target, 'place')
    if (refusal) return [{ kind: 'speech', text: `${name}: "${refusal}"` }]
    const route = world.route(world.state.player.location, target)
    const minutes = route ? route.minutes : 90
    if (w.startsWith('meet')) {
      c.away = { kind: 'meet', where: target }
      world.npcState(npcId).location = target
      world.npcState(npcId).activity = 'waiting for you'
      return [{ kind: 'speech', text: `${name}: "At ${world.location(target).name}, then."` }]
    }
    c.away = { kind: 'scout', where: target, until: world.now + minutes * 2 + 30, report: scout(world, c, target) }
    world.npcState(npcId).location = target
    world.npcState(npcId).activity = 'scouting'
    return [{ kind: 'speech', text: `${name}: "I'll have a look. Back in ${Math.round((minutes * 2 + 30) / 60) || 1} hours or so."` }]
  }
  const distract = /^(?:distract)\s+(.+)$/.exec(w)
  if (distract) {
    const target = world.npcsAt(world.state.player.location).find((id) => world.npc(id).name.toLowerCase().includes(distract[1]!) || callName(world.npc(id)).toLowerCase() === distract[1])
    if (!target) return [{ kind: 'error', text: `There is nobody called "${distract[1]}" here.` }]
    ;(world.state.distracted ??= {})[target] = world.now + 30
    return [{ kind: 'narration', text: `${name} strikes up a conversation with ${callName(world.npc(target))}, all smiles and questions.` }]
  }
  if (/^(steal|take|lift|pinch)\b/.test(w)) {
    const refusal = refuses(world, c, undefined, 'theft')
    if (refusal) return [{ kind: 'speech', text: `${name}: "${refusal}"` }]
    return [{ kind: 'system', text: `${name} is willing. (For now you do the stealing yourself: STEAL <thing>; ${name} can distract someone first.)` }]
  }
  return [{ kind: 'error', text: `Order ${name} to what? wait here, follow me, go home, meet me at <place>, scout <place>, distract <person>.` }]
}

/** Why a companion will not do it, or nothing. */
export function refuses(world: World, c: Companion, place: string | undefined, kind: 'place' | 'theft' | 'fight'): string | undefined {
  const npc = world.npc(c.npc)
  if (kind === 'theft' && npc.personality.honesty >= 1 && c.loyalty < 80) return "I'm no thief. Ask someone else."
  if (kind === 'place' && place) {
    const location = world.content.locations.get(place)
    const limits = c.conditions.limits
    if (limits.includes(place) || (location && limits.includes(location.area)) || (limits.includes('haunted') && location?.tags.includes('haunted'))) return `I said I wouldn't set foot in ${location?.name ?? 'there'}, and I won't.`
    const danger = dangerOf(world, place, c.npc)
    const needed = Math.max(40, 60 - 5 * npc.personality.courage)
    if (danger >= 3 && c.loyalty < needed) return `${location?.name ?? 'There'}? Not for all the eels in the Blackmere. Not for you, not yet.`
  }
  return undefined
}

/** What a scout finds: who is there, and what the place holds (Survival or Stealth against 12 + danger). */
function scout(world: World, c: Companion, target: string): string[] {
  const name = callName(world.npc(c.npc))
  const danger = dangerOf(world, target, c.npc)
  const bonus = Math.max(skillBonus(world.content, c.character, 'survival'), skillBonus(world.content, c.character, 'stealth'))
  const roll = world.rng.d20('scout')
  const total = roll + bonus
  const dc = 12 + danger
  const location = world.location(target)
  if (total < dc) {
    if (total <= dc - 10 && danger >= 3) {
      c.character.hp = Math.max(1, Math.floor(c.character.hp * 0.6))
      c.loyalty = Math.max(0, c.loyalty - 5)
      return [`${name} comes back muddy and hurt, and found nothing at ${location.name} but trouble. (Scouting ${total} vs DC ${dc})`]
    }
    return [`${name} comes back from ${location.name} with nothing much to tell. (Scouting ${total} vs DC ${dc})`]
  }
  const people = world.npcsAt(target).filter((id) => id !== c.npc).map((id) => world.npc(id).short)
  const lines = [`${name} is back from ${location.name}. (Scouting ${total} vs DC ${dc})`]
  lines.push(people.length ? `"${people.join(', ')} ${people.length > 1 ? 'were' : 'was'} there."` : '"Nobody about."')
  if ([...world.content.encounters.values()].some((e) => e.places.includes(target))) lines.push('"Keep your eyes open there. There are men in the reeds who take toll."')
  if (danger >= 3) lines.push(`"It's a bad place, ${location.name}. I wouldn't go at night."`)
  const journal = (world.state.player.journal ??= {})
  journal[target] ??= world.now
  gainXp(world, 5, `${name} scouted ${location.name}`)
  return lines
}

function comeBack(world: World, c: Companion): void {
  const report = c.away?.report ?? []
  delete c.away
  follow(world, c.npc)
  world.notices.push(...report)
}

function findPlace(world: World, words: string): string | undefined {
  const w = words.toLowerCase().replace(/^the\s+/, '').trim()
  for (const l of world.content.locations.values()) if (l.name.toLowerCase().includes(w) || l.aliases.some((a) => a.toLowerCase() === w)) return l.id
  for (const a of world.content.areas.values()) {
    if (a.name.toLowerCase().includes(w)) return [...world.content.locations.values()].find((l) => l.area === a.id && l.tags.includes('edge'))?.id ?? [...world.content.locations.values()].find((l) => l.area === a.id)?.id
  }
  return undefined
}

// ---------------------------------------------------------------- the campfire

/**
 * CAMP: resting by a fire or at the inn, one companion tells something: a
 * memory, a story, or a hook to their own quest. At most one bond step, and
 * once in three days per companion (FO, chapter 13, "Groepsgesprek en kampvuur").
 */
export function campfire(world: World, pass: (minutes: number) => Output[]): Output[] {
  const party = withPlayer(world)
  if (!party.length) return [{ kind: 'error', text: 'There is nobody with you to sit by a fire with.' }]
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  const here = world.location(world.state.player.location)
  if (hour >= 6 && hour < 18) return [{ kind: 'error', text: 'A campfire is for the evening.' }]
  if (here.tags.includes('private')) return [{ kind: 'error', text: "You can't make a fire in someone's house." }]
  const ready = party.filter((c) => c.lastCampfire === undefined || world.now - c.lastCampfire >= 3 * DAY).sort((a, b) => (a.lastCampfire ?? 0) - (b.lastCampfire ?? 0))
  const out: Output[] = [{ kind: 'narration', text: here.tags.includes('indoors') ? 'You sit together by the hearth while the room empties.' : 'You get a fire going out of peat and dry reed, and sit close to it.' }]
  const teller = ready[0]
  if (!teller) {
    out.push({ kind: 'narration', text: 'Nobody has much to say tonight. The fire says it for you.' })
    return [...out, ...pass(60)]
  }
  const lines = world.npc(teller.npc).companion?.campfire ?? []
  const line = lines[teller.told % Math.max(1, lines.length)]
  teller.told++
  teller.lastCampfire = world.now
  const name = callName(world.npc(teller.npc))
  if (line) out.push({ kind: 'speech', text: `${name}, looking into the fire: ${line}` })
  share(world, teller.npc, teller.bondPoints >= 5 ? 1 : 2, 'an evening by the fire')
  for (const c of party) world.npcState(c.npc).needs.social = 100
  return [...out, ...pass(60)]
}

// ---------------------------------------------------------------- the party in the panel

export function partyLines(world: World): string[] {
  return companions(world).map((c) => {
    const npc = world.npc(c.npc)
    const where = c.away ? ` (${c.away.kind === 'scout' ? 'scouting' : 'waiting'} at ${world.location(c.away.where).name})` : ''
    return `${callName(npc)}, ${npc.fighter?.class ?? 'companion'} ${c.character.level}: ${c.character.hp}/${maxHp(world.content, c.character)} hp, loyalty ${c.loyalty}, bond ${c.bond}, ${c.stance}${where}`
  })
}

export function setStance(world: World, npcId: string, words: string): Output[] {
  const c = companionOf(world, npcId)
  if (!c) return [{ kind: 'error', text: 'They are not with you.' }]
  const w = words.toLowerCase().trim()
  const m = /^(aggressive|defensive|support|hold|protect|follow)(?:\s+(?:my target|me|(.+)))?$/.exec(w)
  if (!m) return [{ kind: 'error', text: 'Stance: aggressive, defensive, support, hold, protect <name>, or follow my target.' }]
  c.stance = m[1] as Stance
  if (c.stance === 'protect') c.protect = m[3] ? (world.npcsAt(world.state.player.location).find((id) => callName(world.npc(id)).toLowerCase() === m[3]) ?? 'player') : 'player'
  return [{ kind: 'system', text: `${callName(world.npc(npcId))} will fight ${c.stance === 'follow' ? 'your target' : c.stance}${c.stance === 'protect' ? ` for ${c.protect === 'player' ? 'you' : callName(world.npc(c.protect!))}` : ''}.` }]
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** A class whose core talent heals: it stands behind the others in a fight. */
function supports(world: World, klass: string | undefined): boolean {
  const c = klass ? world.content.rules?.classes.find((k) => k.id === klass) : undefined
  return Boolean(c?.core.effects.some((e) => 'ability' in e && e.ability.do.some((d) => 'heal' in d)))
}
