import { agree, knowsTheDayOf, thinksIsAt, type AgreementInput } from '../agreements'
import { minuteOfDay } from '../clock'
import type { Output } from '../commands'
import { areaTopicId, callName, type Craft, type ObjectInstance } from '../content'
import { letOpen } from '../props'
import { openRequest } from '../requests'
import { craftOfTrade, craftRank, craftTitle, lesson } from '../crafts'
import { itemName, withArticle } from '../items'
import { routineNow } from '../npc/brain'
import { isNear, ties, tieTo } from '../people'
import { dangerOf } from '../social/companions'
import { letIn } from '../social/access'
import { isSomeonesHome } from '../social/ownership'
import type { Fact, Request } from '../state'
import { atStake } from '../belief'
import { overland } from '../lod'
import type { World } from '../world'
import { attitude, relation } from './relations'

// Offers in a conversation (M10.3; FO, chapter 10, "Gepland (M10.3)"). An NPC
// never promises anything of its own accord. Before each call the game works
// out what this person can do now, and puts it in the prompt as OFFERS with a
// decision and the reasons in plain words, as it does for recruiting. The
// voice picks at most one key (action), or proposes one the decision allows
// (propose), which goes through only when the player says yes. Without a
// model, the rules pick from the same offers, so the game can do it all
// without AI. An offer that goes through is an agreement in the register.

export type OfferKind = 'lead' | 'fetch' | 'wait' | 'meet' | 'give' | 'lend' | 'sell' | 'message' | 'ask' | 'teach' | 'let_in' | 'open_lock' | 'let_open'

export interface Offer {
  key: string
  kind: OfferKind
  /** What the NPC would do, for the prompt: "walk ahead to the harbour". */
  what: string
  /** What the player would be asking, for the rules and the prompt. */
  intent: string
  /** What it is in the register and the journal: "take the stranger to the harbour". */
  deed: string
  decision: 'yes' | 'no'
  reasons: string[]
  place?: string
  person?: string
  item?: string
  at?: number
  facts?: string[]
  /** sell: the price, in the smallest coin. */
  price?: number
  /** ask: the request it is about. */
  request?: string
  /** teach: the skill, and a favour asked instead of money. */
  skill?: string
  favour?: string
  /** teach: the craft of the trade, for a day's lesson in it (M10.5). */
  craft?: string
  /** open_lock, let_open: the lock, as object:<location>/<object> (M10.5). */
  lock?: string
  /** lead: the NPC asked the stranger along (invite): a no is theirs to act on (M10.3, left over). */
  invite?: boolean
}

const DAY = 24 * 60
/** At most this many offers in a prompt: the ones this turn is about come first. */
const MAX_OFFERS = 5
/** Further than this from home, a child does not go (a boy runs to the beach, not across the island). */
const CHILD_RANGE = 45

const nameOf = (world: World, id: string): string => (world.content.npcs.has(id) ? callName(world.npc(id)) : (world.content.locations.get(id)?.name ?? world.content.items.get(id)?.name ?? id))

/** A clock time in words for the prompt: "18:00", or "tomorrow at 09:00". */
export function clockWords(world: World, t: number): string {
  const m = minuteOfDay(t)
  const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
  const days = Math.floor(t / DAY) - Math.floor(world.now / DAY)
  return days <= 0 ? hhmm : days === 1 ? `tomorrow at ${hhmm}` : `in ${days} days at ${hhmm}`
}

/**
 * When the player's words set a time: "tomorrow at noon", "tonight", "at six",
 * "in two hours". The next such moment from now, or nothing.
 */
export function parseWhen(text: string, now: number): number | undefined {
  const t = text.toLowerCase()
  const day = Math.floor(now / DAY) * DAY
  const numbers: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6, zeven: 7, acht: 8, negen: 9, tien: 10, elf: 11, twaalf: 12 }
  const inHours = /\bin (an|one|a|two|three|four|\d+) hours?\b/.exec(t)
  if (inHours) return now + (inHours[1] === 'an' || inHours[1] === 'a' ? 1 : (numbers[inHours[1]!] ?? Number(inHours[1]))) * 60
  const tomorrow = /\b(tomorrow|morgen)\b/.test(t)
  let hour: number | undefined
  const at = /\bat (\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:[:.](\d{2}))?(?: o'?clock)?\b/.exec(t)
  if (at) hour = numbers[at[1]!] ?? Number(at[1])
  if (/\b(noon|midday|middag)\b/.test(t)) hour = 12
  else if (/\b(tonight|this evening|vanavond|evening)\b/.test(t) && hour === undefined) hour = 19
  else if (/\b(morning|ochtend)\b/.test(t) && hour === undefined) hour = 9
  if (hour === undefined) return tomorrow ? day + DAY + 9 * 60 : undefined
  const base = tomorrow ? day + DAY : day
  // "At six": the next six o'clock, morning or evening, that is still to come.
  const candidates = (hour < 12 ? [hour, hour + 12] : [hour]).map((h) => base + (h % 24) * 60)
  const next = candidates.filter((c) => c > now).sort((a, b) => a - b)[0]
  return next ?? candidates[0]! + DAY
}

const KIN: { words: RegExp; role: string; pronoun?: string }[] = [
  { words: /\byour (father|dad|da|pa|papa)\b|\bje (vader|pa|papa)\b/i, role: 'parent', pronoun: 'he' },
  { words: /\byour (mother|mum|mom|ma|mama)\b|\bje (moeder|ma|mama)\b/i, role: 'parent', pronoun: 'she' },
  { words: /\byour (son|boy)\b|\bje zoon\b/i, role: 'child', pronoun: 'he' },
  { words: /\byour (daughter|girl)\b|\bje dochter\b/i, role: 'child', pronoun: 'she' },
  { words: /\byour (husband|man)\b|\bje man\b/i, role: 'spouse', pronoun: 'he' },
  { words: /\byour wife\b|\bje vrouw\b/i, role: 'spouse', pronoun: 'she' },
  { words: /\byour brother\b|\bje broer\b/i, role: 'sibling', pronoun: 'he' },
  { words: /\byour sister\b|\bje zus\b/i, role: 'sibling', pronoun: 'she' },
]

/** "Your father": the people the player's words name by their tie to this NPC (M10.3, Pip asked about his father). */
export function kinOf(world: World, npcId: string, text: string): string[] {
  const ties = world.npc(npcId).relations
  const found: string[] = []
  for (const kin of KIN) {
    if (!kin.words.test(text)) continue
    const tie = ties.find((r) => r.to && r.role === kin.role && world.content.npcs.has(r.to) && (!kin.pronoun || world.npc(r.to).pronoun === kin.pronoun))
    if (tie?.to) found.push(tie.to)
  }
  return found
}

/** A place a topic stands for: the location itself, or the way into an area. */
function placeOf(world: World, topic: string): string | undefined {
  if (world.content.locations.has(topic)) return topic
  const area = [...world.content.areas.values()].find((a) => a.id === topic || areaTopicId(world.content, a.id) === topic)
  if (!area) return undefined
  const inside = [...world.content.locations.values()].filter((l) => l.area === area.id)
  return (inside.find((l) => l.tags.includes('edge')) ?? inside.sort((x, y) => x.id.localeCompare(y.id))[0])?.id
}

/**
 * Whether this person would do it, and why, in plain words: the attitude and
 * trust, their work and day, the danger and the distance, and their age.
 */
function willing(world: World, npcId: string, kind: OfferKind, to?: string): { yes: boolean; reasons: string[] } {
  const npc = world.npc(npcId)
  const band = attitude(world, npcId)
  const trust = relation(world.state, npcId).trust
  const reasons: string[] = []
  if (band.band === 'Hostile' || band.band === 'Unfriendly') return { yes: false, reasons: ['you do not trust the stranger, and owe them nothing'] }
  let score = band.score / 2 + trust / 4 + npc.personality.warmth * 5
  // A friend helps sooner (M10.3).
  if (tieTo(world, npcId, 'player')?.role === 'friend') score += 15
  if (npc.child) score += Math.max(0, npc.values['adventure'] ?? 0) * 5
  const here = world.npcState(npcId).location
  // Something that cannot wait (M10.6, the dyke): a danger they believe where the stranger would go, or a place whose
  // state is theirs to know (a plan waits on it). Work and the road count for nothing then.
  const danger = to && (kind === 'lead' || kind === 'fetch') ? dangerThere(world, npcId, to) : undefined
  const urgent = danger ? `${danger.title}, and that cannot wait` : to && kind === 'lead' && atStake(world, npcId, to, 'state') ? `you want to see ${nameOf(world, to)} for yourself` : undefined
  if (urgent) score += 20
  const day = routineNow(world, npcId)
  if (day?.activity === 'work' && kind !== 'give' && kind !== 'message' && !urgent) {
    score -= 30
    reasons.push(`you are at work until ${clockWords(world, day.until)}`)
  }
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  if ((hour >= 21 || hour < 6) && (kind === 'lead' || kind === 'fetch')) {
    score -= 25
    reasons.push('it is dark out')
  }
  if (to) {
    const danger = dangerOf(world, to, npcId)
    if (danger >= (npc.child ? 2 : 3)) return { yes: false, reasons: [`${nameOf(world, to)} is a dangerous place`, ...reasons] }
    // Where the roads of the exits do not go, across country (M10.6: from Waagdam to Oude Zijl).
    const minutes = world.route(here, to)?.minutes ?? overland(world, here, to) ?? Infinity
    if (npc.child && (world.route(npc.home, to)?.minutes ?? Infinity) > CHILD_RANGE) return { yes: false, reasons: ['you are not allowed so far from home', ...reasons] }
    if (minutes === Infinity) return { yes: false, reasons: [`you do not know the way to ${nameOf(world, to)}`] }
    if (minutes > 60 && !urgent) {
      score -= (minutes - 60) / 2
      reasons.push(`${nameOf(world, to)} is a long way`)
    }
  }
  const need = kind === 'wait' || kind === 'message' ? 0 : 10
  const yes = score >= need
  if (yes) reasons.unshift(urgent ?? (band.band === 'Warm' || band.band === 'Devoted' ? 'you like the stranger' : npc.personality.curiosity >= 2 ? 'you are curious about the stranger' : 'it is little trouble'))
  else if (!reasons.length) reasons.push('you hardly know the stranger')
  return { yes, reasons }
}

/** Days a danger stays pressing, unless word came since that it is over. */
const DANGER_DAYS = 7

/**
 * A danger this person believes, in the settlement the stranger would take
 * them to (M10.6): "the dyke at Oude Zijl leaks". Not when later word says
 * otherwise (the leak shored).
 */
function dangerThere(world: World, npcId: string, to: string): Fact | undefined {
  const area = world.content.locations.get(to)?.area
  const heard = world.state.news?.heard[npcId] ?? {}
  const facts = world.state.news?.facts ?? []
  if (!area) return undefined
  for (let i = facts.length - 1; i >= 0 && world.now - facts[i]!.t <= DANGER_DAYS * DAY; i--) {
    const f = facts[i]!
    if (f.kind !== 'danger' || f.belang < 2 || !f.place || !heard[f.id] || heard[f.id]!.stance) continue
    if (world.content.locations.get(f.place)?.area !== area) continue
    const claim = f.claim
    if (claim && facts.slice(i + 1).some((g) => g.claim?.subject === claim.subject && g.claim.key === claim.key && g.claim.value !== claim.value && g.truth !== false)) continue
    return f
  }
  return undefined
}

/**
 * What this person can do for the player now, about what this turn is about:
 * the people and places named, a thing asked for, a time set. The game
 * decides each; the voice only chooses and words it.
 */
export function offersFor(world: World, npcId: string, topics: string[], text: string): Offer[] {
  const npc = world.npc(npcId)
  const state = world.npcState(npcId)
  const here = state.location
  const known = world.knownLocations(npcId)
  const offers: Offer[] = []
  const add = (o: Omit<Offer, 'decision' | 'reasons' | 'deed'>, to?: string) => {
    if (offers.some((x) => x.key === o.key)) return
    const w = willing(world, npcId, o.kind, to)
    offers.push({ ...o, deed: deedOf(world, o), decision: w.yes ? 'yes' : 'no', reasons: w.reasons })
  }
  const people = topics.filter((t) => world.content.npcs.has(t) && t !== npcId && world.alive(t))
  const places = topics.map((t) => placeOf(world, t)).filter((p): p is string => !!p && p !== here)
  // Things are topics as item_<id> in the journal.
  const items = topics.map((t) => (world.content.items.has(t) ? t : t.startsWith('item_') && world.content.items.has(t.slice(5)) ? t.slice(5) : undefined)).filter((t): t is string => !!t)
  const when = parseWhen(text, world.now)
  for (const person of people.slice(0, 2)) {
    const where = thinksIsAt(world, npcId, person)
    if (where === 'dead') continue
    const who = nameOf(world, person)
    if (where !== here && known.has(where)) {
      add({ key: `lead:${person}`, kind: 'lead', person, place: where, what: `walk ahead to ${nameOf(world, where)}, where you think ${who} is`, intent: `be taken to ${who}` }, where)
      add({ key: `fetch:${person}`, kind: 'fetch', person, place: where, what: `go to ${nameOf(world, where)} and bring ${who} here`, intent: `have ${who} fetched` }, where)
    }
    // Waiting here for someone who will come: by the day they know of them (Pip's father home from the harbour).
    const day = knowsTheDayOf(world, npcId, person) ? routineNow(world, person) : undefined
    if (day && day.place !== here && world.npc(person).home === here && day.until - world.now <= 6 * 60) {
      add({ key: `wait:${person}`, kind: 'wait', person, place: here, at: day.until, what: `wait here with the stranger until ${who} comes home, at about ${clockWords(world, day.until)}`, intent: `wait for ${who}` })
    }
    const about = topics.filter((t) => t !== person && world.state.news?.facts.some((f) => (f.about.includes(t) || f.claim?.subject === t) && world.state.news?.heard[npcId]?.[f.id] && world.state.news.heard[npcId]![f.id]!.stance !== 'rejects'))
    if (about[0] && world.npc(person).home && known.has(world.npc(person).home)) {
      const facts = (world.state.news?.facts ?? []).filter((f) => (f.about.includes(about[0]!) || f.claim?.subject === about[0]) && world.state.news?.heard[npcId]?.[f.id]).map((f) => f.id)
      add({ key: `message:${person}`, kind: 'message', person, facts, what: `tell ${who} about ${nameOf(world, about[0])}`, intent: `have word taken to ${who}` })
    }
  }
  for (const place of places.slice(0, 2)) {
    if (!known.has(place)) continue
    add({ key: `lead:${place}`, kind: 'lead', place, what: `walk ahead to ${nameOf(world, place)}`, intent: `be shown the way to ${nameOf(world, place)}` }, place)
    if (when !== undefined) add({ key: `meet:${place}`, kind: 'meet', place, at: when, what: `meet the stranger at ${nameOf(world, place)}, ${clockWords(world, when)}`, intent: `meet at ${nameOf(world, place)} then` }, place)
  }
  for (const item of items.slice(0, 1)) offers.push(...thingOffers(world, npcId, item))
  // "May I come in?" (M10.3): leave to be in their home, for the rest of the day.
  if (/\b(may i come in|can i come in|let me in|may i enter|could i come in|mag ik binnen)/i.test(text) && isSomeonesHome(world, npc.home)) {
    const hour = Math.floor(minuteOfDay(world.now) / 60)
    const band = attitude(world, npcId).band
    const night = hour < 6 || hour >= 21
    const ok = night ? band === 'Friendly' || band === 'Warm' || band === 'Devoted' : band !== 'Wary' && band !== 'Unfriendly' && band !== 'Hostile'
    offers.push({ key: 'let_in', kind: 'let_in', place: npc.home, what: `let the stranger into your home, ${night ? 'for a few hours' : 'for the day'}`, intent: 'come in', deed: `let the stranger into ${nameOf(world, npc.home)}`, decision: ok ? 'yes' : 'no', reasons: ok ? ['you do not mind the stranger'] : [night ? 'it is the middle of the night, and you hardly know the stranger' : 'you do not want the stranger in your house'] })
  }
  // A lock (M10.5): a smith opens it for money and then knows; its owner opens it and says why, for a good turn.
  if (/\b(open|unlock|lock|locked|chest|strongbox|box|kist|slot|key)\b/i.test(text)) offers.push(...lockOffers(world, npcId, text))
  if (/\b(teach|learn|show me how|leer me|leren)\b/i.test(text)) {
    const lesson = teachOffer(world, npcId)
    if (lesson) offers.push(lesson)
  }
  if (when !== undefined && !places.length) add({ key: `meet:${here}`, kind: 'meet', place: here, at: when, what: `meet the stranger here, ${clockWords(world, when)}`, intent: 'meet here then' })
  if (/\b(wait|stay)\b/i.test(text) && !offers.some((o) => o.kind === 'wait')) add({ key: 'wait:here', kind: 'wait', place: here, at: world.now + 60, what: 'wait here with the stranger for an hour', intent: 'have you wait here' })
  return offers.slice(0, MAX_OFFERS)
}

/** Days a thing is lent for; a day when they need it themselves. */
const LEND_DAYS = 3

/** Whether someone needs a thing themselves (what the brain knows): the only tool of their work, or what their trade uses. */
function needs(world: World, npcId: string, item: string): boolean {
  const npc = world.npc(npcId)
  const def = world.content.items.get(item)
  const count = world.npcState(npcId).inventory[item] ?? 0
  const trade = world.content.professions.get(npc.profession)
  // What their trade takes in, not what it makes: a baker sells her bread.
  const used = (trade?.daily_goals ?? []).some((g) => g.item === item && g.type !== 'Produce')
  return used || (Boolean(def?.tags.includes('tool')) && count <= 1 && Boolean(npc.work))
}

/**
 * Things through talk (M10.3): give, lend and sell, each with its own
 * decision. It weighs attitude and trust, whether they need it themselves,
 * its worth against what the stranger did for them, and their character.
 */
function thingOffers(world: World, npcId: string, item: string): Offer[] {
  const npc = world.npc(npcId)
  // What they carry, and what lies in their home: both theirs (the one owner function).
  const count = (world.npcState(npcId).inventory[item] ?? 0) + (world.state.ground[npc.home]?.[item] ?? 0)
  const def = world.content.items.get(item)
  const value = def?.value ?? 8
  const band = attitude(world, npcId).band
  const trust = relation(world.state, npcId).trust
  const done = world.state.requests.filter((r) => r.npc === npcId && r.status === 'done').length
  const thing = itemName(world.content, item)
  const a = withArticle(thing)
  const need = needs(world, npcId, item)
  const cold = band === 'Hostile' || band === 'Unfriendly' || band === 'Wary'
  const lacking = count <= 0 ? [`you have no ${thing}`] : []
  // Give: little worth, or more than they need; more for someone who did things for them.
  const spare = (band === 'Warm' || band === 'Devoted' ? 16 : band === 'Friendly' ? 4 : 0) + done * 4 + Math.max(0, npc.personality.warmth) * 2
  const plenty = count >= 3 && value <= 8
  const give = lacking.length ? lacking : cold ? ['you owe the stranger nothing'] : need ? ['you need it yourself'] : value > spare && !plenty ? ['you cannot spare it, not for nothing'] : [plenty ? 'you have more than you need' : done ? 'the stranger has done things for you' : 'it is little enough']
  // Lend: it stays theirs; trust, and a short time if they need it themselves.
  const days = need ? 1 : LEND_DAYS
  const trusted = trust + done * 10 + (band === 'Warm' || band === 'Devoted' ? 20 : band === 'Friendly' ? 10 : 0) >= (value > 40 ? 30 : 10)
  const lend = lacking.length ? lacking : cold ? ['you do not trust the stranger with your things'] : !trusted ? ['you hardly know the stranger, and it is worth something'] : [need ? `you need it back by ${clockWords(world, world.now + DAY)} for your work` : 'you can do without it for a few days']
  // Sell: out of their own stock, not over the counter, for a fair price to a friend and more to a stranger.
  const markup = band === 'Warm' || band === 'Devoted' ? 1 : band === 'Friendly' ? 1.25 : 1.5
  const price = Math.max(1, Math.round(value * markup * (npc.personality.honesty < 0 ? 1.3 : 1)))
  const sell = lacking.length ? lacking : need && count <= 1 ? ['you need it yourself'] : world.state.player.money < price ? [`the stranger cannot pay ${world.money(price)}`] : [`${world.money(price)} is a fair price`]
  const yes = (ok: boolean): 'yes' | 'no' => (ok ? 'yes' : 'no')
  // Or for a favour in return (M10.3): something they need, as the stranger's word in the register.
  const favour = world.state.requests.find((r) => r.npc === npcId && r.status === 'open' && r.item && r.item !== item)
  const forFavour = favour && !lacking.length && !cold && !need && !(value <= spare || plenty)
  return [
    ...(forFavour
      ? [{ key: `trade:${item}`, kind: 'give' as const, item, favour: favour.id, what: `give the stranger ${a} for a favour: ${itemName(world.content, favour.item!)} in return`, intent: `have ${a} for a favour`, deed: `give the stranger ${a} for a favour`, decision: 'yes' as const, reasons: [`the stranger could bring you ${withArticle(itemName(world.content, favour.item!))} in return`] }]
      : []),
    { key: `give:${item}`, kind: 'give', item, what: `give the stranger ${a} of your own`, intent: `be given ${a}`, deed: `give the stranger ${a}`, decision: yes(!lacking.length && !cold && !need && (value <= spare || plenty)), reasons: give },
    { key: `lend:${item}`, kind: 'lend', item, at: world.now + days * DAY, what: `lend the stranger ${a}, to be back ${clockWords(world, world.now + days * DAY)}; it stays yours`, intent: `borrow ${a}`, deed: `bring ${callName(npc)}'s ${thing} back, ${clockWords(world, world.now + days * DAY)}`, decision: yes(!lacking.length && !cold && trusted), reasons: lend },
    { key: `sell:${item}`, kind: 'sell', item, price, what: `sell the stranger ${a} of your own for ${world.money(price)}`, intent: `buy ${a} from you`, deed: `sell the stranger ${a} for ${world.money(price)}`, decision: yes(!lacking.length && !(need && count <= 1) && world.state.player.money >= price), reasons: sell },
  ]
}

/** What a lesson costs, per rank the stranger already has, in the smallest coin. */
const LESSON = 16

/**
 * A craftsman teaches the skill of their trade (M10.3, teach): for money, or
 * for a favour when they need one and the stranger is short. A lesson is two
 * practice marks; it will not go past what practice can give.
 */
export function teachOffer(world: World, npcId: string): Offer | undefined {
  const craft = craftOfTrade(world, world.npc(npcId).profession)
  if (craft && world.state.player.character) return craftLessonOffer(world, npcId, craft)
  const skill = world.content.professions.get(world.npc(npcId).profession)?.teaches
  const c = world.state.player.character
  const def = world.content.rules?.skills.find((s) => s.id === skill)
  if (!skill || !c || !def) return undefined
  const band = attitude(world, npcId).band
  const price = LESSON * ((c.ranks[skill] ?? 0) + 1)
  const favour = world.state.requests.find((r) => r.npc === npcId && r.status === 'open' && r.item)
  const full = (c.practice[skill] ?? 0) >= 3
  const cold = band === 'Hostile' || band === 'Unfriendly' || band === 'Wary'
  const pay = world.state.player.money >= price
  const decision = !full && !cold && (pay || Boolean(favour)) ? 'yes' : 'no'
  const reasons = full ? ['the stranger has learnt all practice can give; now they must train'] : cold ? ['you will not share your trade with the stranger'] : pay ? [`a lesson in ${def.name.toLowerCase()} is worth ${world.money(price)}`] : favour ? [`the stranger cannot pay, but could do you a favour: ${favour.item ? itemName(world.content, favour.item) : 'a thing you need'}`] : [`the stranger cannot pay ${world.money(price)}`]
  return { key: `teach:${skill}`, kind: 'teach', skill, price, ...(pay || !favour ? {} : { favour: favour.id }), what: `teach the stranger some ${def.name.toLowerCase()}, ${pay || !favour ? `for ${world.money(price)}` : 'for a favour'}`, intent: `learn ${def.name.toLowerCase()} from you`, deed: `teach the stranger some ${def.name.toLowerCase()}`, decision, reasons }
}

/**
 * A day's lesson in a craft from someone of the trade (M10.5): only from one
 * who trusts the stranger (Friendly or better, or trust earned, or a pupil
 * already); for money, or a favour. A master teaches up to expert; master
 * the stranger becomes by their own masterwork.
 */
function craftLessonOffer(world: World, npcId: string, craft: Craft): Offer {
  const rank = craftRank(world, craft.id)
  const band = attitude(world, npcId).band
  const pupil = tieTo(world, npcId, 'player')?.role === 'pupil'
  const trusted = pupil || ['Friendly', 'Warm', 'Devoted'].includes(band) || relation(world.state, npcId).trust >= 15
  const price = LESSON * (rank + 1)
  const favour = world.state.requests.find((r) => r.npc === npcId && r.status === 'open' && r.item)
  const pay = world.state.player.money >= price
  const done = rank >= 2
  const decision = !done && trusted && (pay || Boolean(favour)) ? 'yes' : 'no'
  const reasons = done
    ? [`the stranger is ${craftTitle(craft, rank)}: what is left is their own masterwork, not a lesson`]
    : !trusted
      ? [`you do not know the stranger well enough to let them near your ${craft.name}`]
      : pay
        ? [`a lesson in ${craft.name} is worth ${world.money(price)}`]
        : favour
          ? [`the stranger cannot pay, but could do you a favour: ${favour.item ? itemName(world.content, favour.item) : 'a thing you need'}`]
          : [`the stranger cannot pay ${world.money(price)}`]
  return { key: `teach:${craft.id}`, kind: 'teach', skill: craft.skill, craft: craft.id, price, ...(pay || !favour ? {} : { favour: favour.id }), what: `teach the stranger ${craft.name} for a few hours, ${pay || !favour ? `for ${world.money(price)}` : 'for a favour'}`, intent: `learn ${craft.name} from you`, deed: `teach the stranger ${craft.name}`, decision, reasons }
}

/** A locked thing the stranger knows of: one of theirs for its owner; for a smith, the one named, or the nearest the stranger has seen. */
function lockedThings(world: World): { lock: string; place: string; object: ObjectInstance }[] {
  const seen = new Set(world.state.player.seen ?? [])
  const out: { lock: string; place: string; object: ObjectInstance }[] = []
  for (const place of seen) {
    const loc = world.content.locations.get(place)
    for (const object of loc?.objects ?? []) {
      const lock = `object:${place}/${object.id}`
      const state = world.state.locks?.[lock]
      if (object.lock && state !== 'open' && state !== 'broken') out.push({ lock, place, object })
    }
  }
  return out
}

/** A price for a smith's walk and work: a little for the lock, and for every quarter hour of the way. */
function smithPrice(world: World, npcId: string, place: string): number {
  const minutes = world.route(world.npcState(npcId).location, place)?.minutes ?? 60
  return 12 + Math.ceil(minutes / 15) * 2
}

function lockOffers(world: World, npcId: string, text: string): Offer[] {
  const npc = world.npc(npcId)
  const band = attitude(world, npcId).band
  const cold = band === 'Hostile' || band === 'Unfriendly' || band === 'Wary'
  const words = text.toLowerCase()
  // The one the words name first, then one the chronicler placed, then any.
  const things = lockedThings(world).sort((a, b) => Number(words.includes((b.object.name ?? '').toLowerCase())) - Number(words.includes((a.object.name ?? '').toLowerCase())) || Number(b.object.id.startsWith('prop_')) - Number(a.object.id.startsWith('prop_')))
  const nameOfThing = (t: { object: ObjectInstance }) => t.object.name ?? `the ${world.content.objectTypes.get(t.object.type)?.name ?? 'chest'}`
  const offers: Offer[] = []
  // Its owner: opens it and tells what is in it and why, if the stranger does a good turn in return.
  const own = things.find((t) => t.object.owner === npcId)
  if (own) {
    const trusted = ['Friendly', 'Warm', 'Devoted'].includes(band) || relation(world.state, npcId).trust >= 15
    const thing = nameOfThing(own).replace(/^.*?'s /, 'your ')
    offers.push({ key: `let_open:${own.lock}`, kind: 'let_open', place: own.place, lock: own.lock, what: `open ${thing} for the stranger and tell them what is in it and why, if they do you a good turn in return`, intent: `see inside ${thing}`, deed: `open ${thing} for the stranger`, decision: trusted ? 'yes' : 'no', reasons: [trusted ? 'you trust the stranger enough, and a good turn is a good turn' : 'you do not know the stranger well enough to open it for them'] })
  }
  // A smith: comes to the lock and opens it, for money. Reliable, but then the smith knows.
  if (craftOfTrade(world, npc.profession)?.id === 'smithing') {
    const named = things.find((t) => words.includes((t.object.name ?? '').toLowerCase())) ?? things.find((t) => t.object.owner && words.includes(callName(world.npc(t.object.owner)).toLowerCase()))
    const nearest = [...things].sort((a, b) => (world.route(world.npcState(npcId).location, a.place)?.minutes ?? 999) - (world.route(world.npcState(npcId).location, b.place)?.minutes ?? 999))[0]
    const target = named ?? nearest
    if (target && target.object.owner !== npcId) {
      const price = smithPrice(world, npcId, target.place)
      const owner = target.object.owner && world.content.npcs.has(target.object.owner) ? target.object.owner : undefined
      const leave = (world.state.player.permits?.[target.lock] ?? 0) > world.now
      const scruples = Boolean(owner) && !leave && npc.personality.honesty >= 2
      const pay = world.state.player.money >= price
      const decision = !cold && !scruples && pay ? 'yes' : 'no'
      const reasons = cold ? ['you will not do the stranger a service'] : scruples ? [`it is ${callName(world.npc(owner!))}'s, and you will not open it without their say-so`] : pay ? [`it is your trade, and worth ${world.money(price)}; you will know what is in it, mind`] : [`the stranger cannot pay ${world.money(price)}`]
      offers.push({ key: `open_lock:${target.lock}`, kind: 'open_lock', place: target.place, lock: target.lock, price, what: `go to ${nameOf(world, target.place)} and open the lock of ${nameOfThing(target)} for the stranger, for ${world.money(price)}`, intent: `have the lock of ${nameOfThing(target)} opened`, deed: `open the lock of ${nameOfThing(target)} for the stranger`, decision, reasons })
    }
  }
  return offers
}

/** Days the stranger has to bring what someone asked for, once promised. */
const ASK_DAYS = 3

/**
 * What an NPC lacks, asked of the stranger (M10.3): an offer the other way
 * round. A YES is the stranger's word, an agreement in the register with a
 * time; the request is in the journal already.
 */
export function askOffer(world: World, npcId: string, request: Request): Offer | undefined {
  if (request.kind === 'visit' && request.target && world.content.npcs.has(request.target)) {
    const whom = callName(world.npc(request.target))
    return { key: `ask:${request.id}`, kind: 'ask', person: request.target, request: request.id, at: world.now + ASK_DAYS * DAY, what: `ask the stranger to look in on ${whom}`, intent: '', deed: `look in on ${whom} for ${callName(world.npc(npcId))}`, decision: 'yes', reasons: ['you are worried'] }
  }
  if (!request.item || request.kind === 'visit') return undefined
  const thing = request.qty > 1 ? itemName(world.content, request.item, request.qty) : withArticle(itemName(world.content, request.item))
  const at = world.now + ASK_DAYS * DAY
  return { key: `ask:${request.id}`, kind: 'ask', item: request.item, request: request.id, at, what: `ask the stranger to bring ${thing}`, intent: '', deed: `bring ${callName(world.npc(npcId))} ${thing}`, decision: 'yes', reasons: ['you need it'] }
}

/** What an offer is, in the register's plain words. */
function deedOf(world: World, o: Omit<Offer, 'decision' | 'reasons' | 'deed'>): string {
  const place = o.place ? nameOf(world, o.place) : 'there'
  const who = o.person ? nameOf(world, o.person) : ''
  switch (o.kind) {
    case 'lead':
      return `take the stranger to ${place}${who ? `, to ${who}` : ''}`
    case 'fetch':
      return `fetch ${who} for the stranger`
    case 'wait':
      return `wait with the stranger${who ? ` for ${who}` : ''}`
    case 'meet':
      return `meet the stranger at ${place}, ${o.at !== undefined ? clockWords(world, o.at) : 'as agreed'}`
    case 'message':
      return o.what.replace(/^tell/, 'tell')
    case 'give':
    case 'lend':
    case 'sell':
    case 'ask':
    case 'teach':
    case 'let_in':
    case 'open_lock':
    case 'let_open':
      return o.what
  }
}

/** The offers for the prompt, with the game's decision and why. */
export function offerLines(world: World, npcId: string, offers: Offer[]): string[] {
  if (!offers.length) return []
  return [
    'OFFERS (what you can do for the stranger now; the game decided each):',
    ...offers.map((o) => `  ${o.key}: ${o.what}. DECISION: ${o.decision}, because ${o.reasons.join('; ')}.`),
    'If the player asks for one of these, put its key in action and follow the DECISION: a yes you do, a no you refuse with the reason. You may also propose one with DECISION yes (propose); it happens only if the player agrees. Never promise anything that is not a yes here.',
  ]
}

/**
 * Time facts for the scene (M10.3, "Brannoc is back at six"): the NPC's own
 * day, and the day of the people the talk is about whose day they know.
 * What they think, by the schedules, so an agreement they make fits.
 */
export function dayLines(world: World, npcId: string, people: string[]): string[] {
  const own = routineNow(world, npcId)
  const days = [...new Set(people)]
    .filter((p) => p !== npcId && world.content.npcs.has(p) && world.alive(p) && knowsTheDayOf(world, npcId, p))
    .map((p) => ({ p, day: routineNow(world, p) }))
    .filter((x) => x.day)
    .map(({ p, day }) => `${nameOf(world, p)} is usually ${doing(day!.activity)}at ${nameOf(world, day!.place)} until ${clockWords(world, day!.until)}`)
  return [
    ...(own ? [`YOUR DAY: ${doing(own.activity)}at ${nameOf(world, own.place)} until ${clockWords(world, own.until)}.`] : []),
    ...(days.length ? [`WHERE THEY USUALLY ARE (you know their day): ${days.join('; ')}.`] : []),
  ]
}

function doing(activity: string): string {
  return activity === 'work' ? 'at work ' : activity === 'sleep' ? 'asleep ' : activity === 'eat' ? 'eating ' : activity === 'pray' ? 'praying ' : ''
}

/** Which offer the player's words ask for, by rules: the same for the model's check and the game without a model. */
export function askedFor(offers: Offer[], text: string): Offer | undefined {
  const t = text.toLowerCase()
  const wants = (kind: OfferKind) => offers.filter((o) => o.kind === kind)
  if (/\b(bring|fetch|get|call|haal|roep)\b.*\b(here|him|her|them|over)\b/.test(t) || /\b(fetch|haal)\b/.test(t)) return wants('fetch')[0]
  if (/\b(teach|learn|show me how|leer me|leren)\b/.test(t) && wants('teach')[0]) return wants('teach')[0]
  if (wants('let_in')[0]) return wants('let_in')[0]
  // A lock (M10.5): the owner's own opening first; a smith's service when it is theirs.
  if (/\b(open|unlock|lock|chest|strongbox|box|kist|slot)\b/.test(t) && (wants('let_open')[0] || wants('open_lock')[0])) return wants('let_open')[0] ?? wants('open_lock')[0]
  if (/\b(meet|see you|find you|afspreken|zie je)\b/.test(t) && wants('meet')[0]) return wants('meet')[0]
  if (/\b(tell|let .* know|pass .* on|word to|zeg|vertel)\b/.test(t) && wants('message')[0]) return wants('message')[0]
  if (/\b(lend|borrow|loan|leen|lenen)\b/.test(t) && wants('lend')[0]) return wants('lend')[0]
  if (/\b(sell|buy|how much|what do you want for|verkoop|koop|hoeveel)\b/.test(t) && wants('sell')[0]) return wants('sell')[0]
  if (/\b(give|spare|have one|may i have|can i have|could i have|geef|mag ik)\b/.test(t) && wants('give')[0]) return wants('give').find((o) => o.decision === 'yes') ?? wants('give')[0]
  if (/\b(wait|stay|wacht|blijf)\b/.test(t) && wants('wait')[0]) return wants('wait')[0]
  if (/\b(take me|show me|lead|bring me|the way|come with me to|walk me|breng me|wijs|laat .* zien)\b/.test(t)) return wants('lead')[0]
  return undefined
}

/** Something the rules would propose, without being asked: taking the stranger to the one they asked about. */
export function proposal(offers: Offer[], act: string): Offer | undefined {
  if (act !== 'AskAbout' && act !== 'AskDirections') return undefined
  return offers.find((o) => o.kind === 'lead' && o.decision === 'yes' && o.person) ?? offers.find((o) => o.kind === 'lead' && o.decision === 'yes' && act === 'AskDirections')
}

/**
 * An offer that goes through: an agreement in the register, and it starts.
 * Returns what the player sees, and whether the conversation ends with it.
 */
export function accept(world: World, npcId: string, offer: Offer): { outputs: Output[]; ends: boolean } {
  const name = callName(world.npc(npcId))
  const here = world.npcState(npcId).location
  const base = { by: npcId, to: 'player', source: 'conversation' as const, what: offer.deed }
  let input: AgreementInput | undefined
  // To someone who is not there (M10.6: Sijbrand just stepped out to the sluice): they look for them at their work.
  if (offer.kind === 'lead') input = { ...base, kind: 'lead', terms: { place: offer.place!, ...(offer.person ? { person: offer.person } : {}), ahead: true, ifAbsent: offer.person ? 'search' : 'wait', waits: offer.person ? 60 : 30 } }
  if (offer.kind === 'fetch') input = { ...base, kind: 'lead', due: world.now + (world.route(here, offer.place!)?.minutes ?? 60) * 2 + 60, terms: { place: offer.place!, person: offer.person!, bring: here, ifAbsent: 'return' } }
  if (offer.kind === 'wait') input = { ...base, kind: 'wait', due: offer.at ?? world.now + 60, terms: { place: here, ...(offer.person ? { person: offer.person } : {}) } }
  if (offer.kind === 'meet') input = { ...base, kind: 'meet', terms: { place: offer.place!, at: offer.at! } }
  if (offer.kind === 'message') input = { ...base, kind: 'message', terms: { recipient: offer.person!, about: offer.what.replace(/^tell \S+ about /, ''), facts: offer.facts ?? [] } }
  if (offer.kind === 'give' || offer.kind === 'lend' || offer.kind === 'sell') {
    const state = world.npcState(npcId)
    const item = offer.item!
    const a = withArticle(itemName(world.content, item))
    const home = world.state.ground[world.npc(npcId).home] ?? {}
    if ((state.inventory[item] ?? 0) <= 0 && (home[item] ?? 0) <= 0) return { outputs: [], ends: false }
    if (offer.kind === 'sell' && world.state.player.money < (offer.price ?? 0)) return { outputs: [{ kind: 'system', text: `You cannot pay ${world.money(offer.price ?? 0)}.` }], ends: false }
    // From their pocket, or from what lies in their home.
    if ((state.inventory[item] ?? 0) > 0) state.inventory[item]! -= 1
    else home[item]! -= 1
    world.state.player.inventory[item] = (world.state.player.inventory[item] ?? 0) + 1
    if (offer.kind === 'sell') {
      world.state.player.money -= offer.price!
      state.money += offer.price!
    }
    // A loan is the player's word to bring it back: open, with its time. A gift or a sale is done at once.
    const made = offer.kind === 'lend' ? agree(world, { by: 'player', to: npcId, source: 'conversation', kind: 'lend', what: offer.deed, due: offer.at!, terms: { item } }) : agree(world, { ...base, kind: 'give', terms: { item } })
    if ('id' in made && offer.kind !== 'lend') {
      made.status = 'kept'
      made.outcome = { t: world.now, text: offer.kind === 'sell' ? `${name} sold the stranger ${a} for ${world.money(offer.price!)}` : `${name} gave the stranger ${a}` }
    }
    const text = offer.kind === 'lend' ? `${name} lends you ${a}. Bring it back ${clockWords(world, offer.at!)}; it is in your journal.` : offer.kind === 'sell' ? `You pay ${world.money(offer.price!)}, and ${name} hands you ${a}.` : `${name} gives you ${a}.`
    const out: Output[] = [{ kind: 'system', text }]
    // For a favour: the stranger's word to do it.
    const request = offer.favour ? world.state.requests.find((r) => r.id === offer.favour) : undefined
    const ask = request ? askOffer(world, npcId, request) : undefined
    if (ask) out.push(...accept(world, npcId, ask).outputs)
    return { outputs: out, ends: false }
  }
  if (offer.kind === 'let_in') {
    const hour = Math.floor(minuteOfDay(world.now) / 60)
    const until = hour < 6 || hour >= 21 ? world.now + 3 * 60 : world.now - minuteOfDay(world.now) + 21 * 60
    letIn(world, offer.place!, until)
    const made = agree(world, { ...base, kind: 'wait', due: until, terms: { place: offer.place! } })
    if ('id' in made) {
      made.status = 'kept'
      made.outcome = { t: world.now, text: `${name} let the stranger in` }
    }
    return { outputs: [{ kind: 'system', text: `${name} lets you in. You may be in ${nameOf(world, offer.place!)} until ${clockWords(world, until)}.` }], ends: false }
  }
  if (offer.kind === 'open_lock' && offer.lock && offer.place) {
    // The smith's word to be there and open it: a meeting in the register, with the lock to open.
    if (world.state.player.money < (offer.price ?? 0)) return { outputs: [{ kind: 'system', text: `You cannot pay ${world.money(offer.price ?? 0)}.` }], ends: false }
    world.state.player.money -= offer.price ?? 0
    world.npcState(npcId).money += offer.price ?? 0
    const minutes = world.route(world.npcState(npcId).location, offer.place)?.minutes ?? 60
    const at = world.now + minutes + 15
    const made = agree(world, { ...base, kind: 'meet', due: at + 3 * 60, terms: { place: offer.place, at, open: offer.lock } })
    if ('rejected' in made) return { outputs: [], ends: false }
    return { outputs: [{ kind: 'system', text: `You pay ${name} ${world.money(offer.price ?? 0)}. ${name} will meet you at ${nameOf(world, offer.place)} ${clockWords(world, at)} and open it. It is in your journal.` }], ends: false }
  }
  if (offer.kind === 'let_open' && offer.lock && offer.place) {
    const out = letOpen(world, npcId, offer.lock, offer.place)
    // The good turn in return: what they have asked for already, or a visit to someone of theirs.
    const open = world.state.requests.find((r) => r.npc === npcId && r.status === 'open')
    const someone = (id: string | undefined) => Boolean(id && id !== npcId && world.content.npcs.has(id) && world.alive(id) && !world.npcState(id).absent)
    const known = ties(world, npcId).filter((t) => someone(t.id))
    const prop = offer.lock.split('/').at(-1) ?? ''
    const line = world.state.props?.list.find((p) => p.id === prop)?.line
    const inLine = world.state.chronicle?.lines.find((l) => l.id === line)?.people.find((p) => someone(p))
    const kin = known.find((t) => isNear(t))?.id ?? inLine ?? known[0]?.id
    const request = open ?? (kin ? openRequest(world, { npc: npcId, kind: 'visit', target: kin, source: 'motor' }, { asked: true }) : undefined)
    const ask = request ? askOffer(world, npcId, request) : undefined
    if (ask) out.push(...accept(world, npcId, ask).outputs)
    return { outputs: out, ends: false }
  }
  if (offer.kind === 'teach' && offer.craft) {
    const craft = world.content.crafts.get(offer.craft)
    if (!craft) return { outputs: [], ends: false }
    if (!offer.favour) {
      if (world.state.player.money < (offer.price ?? 0)) return { outputs: [{ kind: 'system', text: `You cannot pay ${world.money(offer.price ?? 0)}.` }], ends: false }
      world.state.player.money -= offer.price!
      world.npcState(npcId).money += offer.price!
      const paid = agree(world, { ...base, kind: 'give', terms: { amount: offer.price! } })
      if ('id' in paid) {
        paid.status = 'kept'
        paid.outcome = { t: world.now, text: `${name} taught the stranger ${craft.name} for ${world.money(offer.price!)}` }
      }
    }
    const out = lesson(world, npcId, craft)
    const request = offer.favour ? world.state.requests.find((r) => r.id === offer.favour) : undefined
    const ask = request ? askOffer(world, npcId, request) : undefined
    if (ask) out.push(...accept(world, npcId, ask).outputs)
    // The lesson takes the next hours: the talk ends here.
    return { outputs: out, ends: true }
  }
  if (offer.kind === 'teach') {
    const c = world.state.player.character
    const def = world.content.rules?.skills.find((s) => s.id === offer.skill)
    if (!c || !def) return { outputs: [], ends: false }
    if (!offer.favour) {
      if (world.state.player.money < (offer.price ?? 0)) return { outputs: [{ kind: 'system', text: `You cannot pay ${world.money(offer.price ?? 0)}.` }], ends: false }
      world.state.player.money -= offer.price!
      world.npcState(npcId).money += offer.price!
    }
    c.practice[offer.skill!] = Math.min(3, (c.practice[offer.skill!] ?? 0) + 2)
    // A lesson paid for is an offer that went through at once, as a sale is.
    if (!offer.favour) {
      const lesson = agree(world, { ...base, kind: 'give', terms: { amount: offer.price! } })
      if ('id' in lesson) {
        lesson.status = 'kept'
        lesson.outcome = { t: world.now, text: `${name} taught the stranger some ${def.name.toLowerCase()} for ${world.money(offer.price!)}` }
      }
    }
    const out: Output[] = [{ kind: 'system', text: `${name} shows you how it is done in the trade. ${def.name} practice: ${'|'.repeat(c.practice[offer.skill!]!)}.` }]
    // For a favour: the stranger's word to do it, as an ask.
    const request = offer.favour ? world.state.requests.find((r) => r.id === offer.favour) : undefined
    const ask = request ? askOffer(world, npcId, request) : undefined
    if (ask) out.push(...accept(world, npcId, ask).outputs)
    return { outputs: out, ends: false }
  }
  if (offer.kind === 'ask') {
    // The stranger's word: bring it, or go and see someone, by the time. The NPC expects it; the journal has it.
    const promised = offer.item ? agree(world, { by: 'player', to: npcId, source: 'conversation', kind: 'give', what: offer.deed, due: offer.at!, terms: { item: offer.item } }) : agree(world, { by: 'player', to: npcId, source: 'conversation', kind: 'errand', what: offer.deed, due: offer.at!, terms: { request: offer.request!, ...(offer.person ? { person: offer.person } : {}) } })
    if ('rejected' in promised) return { outputs: [], ends: false }
    return { outputs: [{ kind: 'system', text: `You give ${name} your word: ${offer.deed.replace(/^bring \S+ /, 'bring ').replace(/ for \S+$/, '')}, ${clockWords(world, offer.at!)}. It is in your journal.` }], ends: false }
  }
  if (!input) return { outputs: [], ends: false }
  const made = agree(world, input)
  if ('rejected' in made) return { outputs: [{ kind: 'system', text: `(${name} cannot after all: ${made.rejected}.)` }], ends: false }
  if (offer.kind === 'message') {
    // The report is carried as carry_word carries it: a goal to talk to the other, with what they know.
    const s = world.npcState(npcId)
    const goal = { id: `g${++world.state.goalSeq}`, type: 'Talk' as const, target: offer.person!, priority: 1, source: 'ai' as const, created: world.now, until: made.due, message: made.terms.facts ?? [], agreement: made.id }
    s.goals.push(goal)
    made.effects.push({ kind: 'plan', ref: goal.id })
  }
  const note = offer.kind === 'meet' ? ` Noted in your journal: ${nameOf(world, offer.place!)}, ${clockWords(world, offer.at!)}.` : ''
  // Going ahead or fetching someone ends the talk: they are off.
  const ends = offer.kind === 'lead' || offer.kind === 'fetch'
  return { outputs: [{ kind: 'system', text: `${name} agrees to ${offer.deed.replace(/\bthe stranger\b/g, 'you')}.${note}` }], ends }
}

/** What the NPC says without a model, for a yes or a no. */
export function offerLine(world: World, npcId: string, offer: Offer): string {
  const npc = world.npc(npcId)
  if (offer.decision === 'no') return world.say(`{name} shakes {their} head. "I can't. ${capitalise(firstPerson(offer.reasons[0] ?? 'not now'))}."`, npcId)
  const said: Record<OfferKind, string> = {
    lead: npc.child ? '"Come on, then! It\'s this way."' : '"Come along. I\'ll show you."',
    fetch: `"Wait here. I'll get ${offer.person ? nameOf(world, offer.person) : 'them'}."`,
    wait: '"I\'ll wait with you."',
    meet: `"${offer.at !== undefined ? capitalise(clockWords(world, offer.at)) : 'Then'}, at ${nameOf(world, offer.place!)}. I'll be there."`,
    give: '"Here. Take it."',
    lend: `"You can borrow it. ${offer.at !== undefined ? `I want it back ${clockWords(world, offer.at)}` : 'I want it back'}."`,
    sell: `"${offer.price !== undefined ? world.money(offer.price) : 'A fair price'}, and it's yours."`,
    message: `"I'll tell ${offer.person ? nameOf(world, offer.person) : 'them'}."`,
    ask: '"Good. I\'ll hold you to that."',
    let_in: '"Come in, then. Wipe your feet."',
    teach: '"Watch my hands, then. Like this."',
    open_lock: `"${offer.price !== undefined ? world.money(offer.price) : 'A fair price'}, and I'll come and open it. It's my trade."`,
    let_open: '"All right. I\'ll show you, and tell you why. But you\'ll do something for me in return."',
  }
  return `${callName(npc)}: ${said[offer.kind]}`
}

/** The words a proposal is shown with: a click or YES makes it happen. */
export function proposalText(world: World, npcId: string, offer: Offer): string {
  if (offer.kind === 'ask') return `${callName(world.npc(npcId))} asks you to ${offer.deed.replace(/^bring \S+ /, 'bring ').replace(/ for \S+$/, '')}. YES to give your word, NO to decline.`
  return `${callName(world.npc(npcId))} offers to ${offer.deed.replace(/\bthe stranger\b/g, 'you')}. YES to agree, NO to decline.`
}

/** A reason as the NPC says it: "you are at work" becomes "I am at work", "the stranger" becomes "you". */
function firstPerson(reason: string): string {
  return reason
    .replace(/\byourself\b/g, 'myself')
    .replace(/\byour\b/g, 'my')
    .replace(/\byou are\b/g, 'I am')
    .replace(/\byou\b/g, 'I')
    .replace(/\bthe stranger's\b/g, 'your')
    .replace(/\bthe stranger\b/g, 'you')
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
