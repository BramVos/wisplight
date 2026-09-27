import { agree, knowsTheDayOf, thinksIsAt, type AgreementInput } from '../agreements'
import { minuteOfDay } from '../clock'
import type { Output } from '../commands'
import { areaTopicId, callName } from '../content'
import { itemName, withArticle } from '../items'
import { routineNow } from '../npc/brain'
import { dangerOf } from '../social/companions'
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

export type OfferKind = 'lead' | 'fetch' | 'wait' | 'meet' | 'give' | 'lend' | 'sell' | 'message'

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
  if (npc.child) score += Math.max(0, npc.values['adventure'] ?? 0) * 5
  const here = world.npcState(npcId).location
  const day = routineNow(world, npcId)
  if (day?.activity === 'work' && kind !== 'give' && kind !== 'message') {
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
    const minutes = world.route(here, to)?.minutes ?? Infinity
    if (npc.child && (world.route(npc.home, to)?.minutes ?? Infinity) > CHILD_RANGE) return { yes: false, reasons: ['you are not allowed so far from home', ...reasons] }
    if (minutes === Infinity) return { yes: false, reasons: [`you do not know the way to ${nameOf(world, to)}`] }
    if (minutes > 60) {
      score -= (minutes - 60) / 2
      reasons.push(`${nameOf(world, to)} is a long way`)
    }
  }
  const need = kind === 'wait' || kind === 'message' ? 0 : 10
  const yes = score >= need
  if (yes) reasons.unshift(band.band === 'Warm' || band.band === 'Devoted' ? 'you like the stranger' : npc.personality.curiosity >= 2 ? 'you are curious about the stranger' : 'it is little trouble')
  else if (!reasons.length) reasons.push('you hardly know the stranger')
  return { yes, reasons }
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
  const count = world.npcState(npcId).inventory[item] ?? 0
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
  return [
    { key: `give:${item}`, kind: 'give', item, what: `give the stranger ${a} of your own`, intent: `be given ${a}`, deed: `give the stranger ${a}`, decision: yes(!lacking.length && !cold && !need && (value <= spare || plenty)), reasons: give },
    { key: `lend:${item}`, kind: 'lend', item, at: world.now + days * DAY, what: `lend the stranger ${a}, to be back ${clockWords(world, world.now + days * DAY)}; it stays yours`, intent: `borrow ${a}`, deed: `bring ${callName(npc)}'s ${thing} back, ${clockWords(world, world.now + days * DAY)}`, decision: yes(!lacking.length && !cold && trusted), reasons: lend },
    { key: `sell:${item}`, kind: 'sell', item, price, what: `sell the stranger ${a} of your own for ${world.money(price)}`, intent: `buy ${a} from you`, deed: `sell the stranger ${a} for ${world.money(price)}`, decision: yes(!lacking.length && !(need && count <= 1) && world.state.player.money >= price), reasons: sell },
  ]
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
      return o.what
  }
}

/** The offers for the prompt, with the game's decision and why. */
export function offerLines(world: World, npcId: string, offers: Offer[]): string[] {
  if (!offers.length) return []
  const people = [...new Set(offers.flatMap((o) => (o.person ? [o.person] : [])))]
  const days = people
    .filter((p) => knowsTheDayOf(world, npcId, p))
    .map((p) => ({ p, day: routineNow(world, p) }))
    .filter((x) => x.day)
    .map(({ p, day }) => `${nameOf(world, p)} is usually ${day!.activity === 'work' ? 'at work' : day!.activity === 'sleep' ? 'asleep' : ''} at ${nameOf(world, day!.place)} until ${clockWords(world, day!.until)}`.replace('usually  at', 'usually at'))
  return [
    ...(days.length ? [`WHERE THEY USUALLY ARE (you know their day): ${days.join('; ')}.`] : []),
    'OFFERS (what you can do for the stranger now; the game decided each):',
    ...offers.map((o) => `  ${o.key}: ${o.what}. DECISION: ${o.decision}, because ${o.reasons.join('; ')}.`),
    'If the player asks for one of these, put its key in action and follow the DECISION: a yes you do, a no you refuse with the reason. You may also propose one with DECISION yes (propose); it happens only if the player agrees. Never promise anything that is not a yes here.',
  ]
}

/** Which offer the player's words ask for, by rules: the same for the model's check and the game without a model. */
export function askedFor(offers: Offer[], text: string): Offer | undefined {
  const t = text.toLowerCase()
  const wants = (kind: OfferKind) => offers.filter((o) => o.kind === kind)
  if (/\b(bring|fetch|get|call|haal|roep)\b.*\b(here|him|her|them|over)\b/.test(t) || /\b(fetch|haal)\b/.test(t)) return wants('fetch')[0]
  if (/\b(meet|see you|find you|afspreken|zie je)\b/.test(t) && wants('meet')[0]) return wants('meet')[0]
  if (/\b(tell|let .* know|pass .* on|word to|zeg|vertel)\b/.test(t) && wants('message')[0]) return wants('message')[0]
  if (/\b(lend|borrow|loan|leen|lenen)\b/.test(t) && wants('lend')[0]) return wants('lend')[0]
  if (/\b(sell|buy|how much|what do you want for|verkoop|koop|hoeveel)\b/.test(t) && wants('sell')[0]) return wants('sell')[0]
  if (/\b(give|spare|have one|may i have|can i have|geef|mag ik)\b/.test(t) && wants('give')[0]) return wants('give')[0]
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
  if (offer.kind === 'lead') input = { ...base, kind: 'lead', terms: { place: offer.place!, ...(offer.person ? { person: offer.person } : {}), ahead: true, ifAbsent: 'wait', waits: 30 } }
  if (offer.kind === 'fetch') input = { ...base, kind: 'lead', due: world.now + (world.route(here, offer.place!)?.minutes ?? 60) * 2 + 60, terms: { place: offer.place!, person: offer.person!, bring: here, ifAbsent: 'return' } }
  if (offer.kind === 'wait') input = { ...base, kind: 'wait', due: offer.at ?? world.now + 60, terms: { place: here, ...(offer.person ? { person: offer.person } : {}) } }
  if (offer.kind === 'meet') input = { ...base, kind: 'meet', terms: { place: offer.place!, at: offer.at! } }
  if (offer.kind === 'message') input = { ...base, kind: 'message', terms: { recipient: offer.person!, about: offer.what.replace(/^tell \S+ about /, ''), facts: offer.facts ?? [] } }
  if (offer.kind === 'give' || offer.kind === 'lend' || offer.kind === 'sell') {
    const state = world.npcState(npcId)
    const item = offer.item!
    const a = withArticle(itemName(world.content, item))
    if ((state.inventory[item] ?? 0) <= 0) return { outputs: [], ends: false }
    if (offer.kind === 'sell' && world.state.player.money < (offer.price ?? 0)) return { outputs: [{ kind: 'system', text: `You cannot pay ${world.money(offer.price ?? 0)}.` }], ends: false }
    state.inventory[item]! -= 1
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
    return { outputs: [{ kind: 'system', text }], ends: false }
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
  }
  return `${callName(npc)}: ${said[offer.kind]}`
}

/** The words a proposal is shown with: a click or YES makes it happen. */
export function proposalText(world: World, npcId: string, offer: Offer): string {
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
