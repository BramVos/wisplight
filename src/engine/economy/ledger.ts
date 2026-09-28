import { knob } from '../knobs'
import { GameClock } from '../clock'
import { recordFact } from '../news'
import type { Content } from '../content'
import type { World } from '../world'
import type { Route, Settlement } from './schema'

// The ledger of a settlement (M8.4; design: signalen en nasleep, "Economie").
// Once a game day, before the shops open: the workshops make what their hands
// and inputs allow, the routes bring and take, and the nameless use what they
// need. The counters of the settlement fill from its store for every good the
// ledger carries; for the rest their fixed supply stays the fallback. Named
// people near the player still make things for real, as before. Money only
// moves: the nameless pay from the settlement's purse, which work, trade and
// travellers fill, and the shopkeepers pay the purse for what they take.

const DAY = 24 * 60

export interface Ledger {
  stock: Record<string, number>
  purse: number
  /** Days in a row a good fell short of what the nameless needed. */
  short: Record<string, number>
  /** Days in a row a good was over twice what the settlement keeps. */
  surplus: Record<string, number>
  /** A workshop with nobody to work it, since which day. */
  idle: Record<string, number>
  /** Goods a counter wanted today and the store could not give. */
  missed: Record<string, boolean>
  /** For a good made only in its season: what lay in store when the season's making stopped (M9.1). */
  peak?: Record<string, number>
  /** The last day: what was made and used, what came in and went out. */
  last: { made: Record<string, number>; used: Record<string, number>; came: Record<string, number>; went: Record<string, number> }
}

export interface EconomyState {
  /** The last day the ledgers were worked out. */
  day: number
  ledgers: Record<string, Ledger>
  /** Per route: closed or not (else as the content says), and the last day it ran. */
  routes: Record<string, { closed?: boolean; last?: number }>
  /** What was taken from a ground that can run out: by settlement and resource. */
  drawn: Record<string, number>
  /** Goods sent for, arriving on a day (M8.4, verb order). */
  orders: { item: string; qty: number; to: string; arrives: number; by: string }[]
}

const round = (n: number) => Math.round(n * 100) / 100

function emptyLast(): Ledger['last'] {
  return { made: {}, used: {}, came: {}, went: {} }
}

/** The economy of the game: made at the first use, with every ledger at what its settlement keeps. */
export function economy(world: World): EconomyState {
  const state = (world.state.economy ??= { day: -1, ledgers: {}, routes: {}, drawn: {}, orders: [] })
  for (const s of world.content.settlements.values()) state.ledgers[s.id] ??= { stock: { ...s.keep, ...s.stock }, purse: s.people * 4, short: {}, surplus: {}, idle: {}, missed: {}, last: emptyLast() }
  return state
}

export function ledgerOf(world: World, settlement: string): Ledger | undefined {
  return world.content.settlements.has(settlement) ? economy(world).ledgers[settlement] : undefined
}

/** The settlement a place belongs to, if its area is one. */
export function settlementAt(world: World, location: string): Settlement | undefined {
  const area = world.content.locations.get(location)?.area
  return area ? world.content.settlements.get(area) : undefined
}

const carriedCache = new WeakMap<object, Map<string, Set<string>>>()

/** The goods a settlement's ledger carries: made there, brought there, used or kept there. Its counters fill from the store for these. */
export function carried(world: World, settlement: string): Set<string> {
  let byWorld = carriedCache.get(world.content)
  if (!byWorld) carriedCache.set(world.content, (byWorld = new Map()))
  const hit = byWorld.get(settlement)
  if (hit) return hit
  const s = world.content.settlements.get(settlement)
  const goods = new Set<string>()
  if (s) {
    for (const w of s.workshops) for (const item of Object.keys(w.makes)) goods.add(item)
    for (const item of [...Object.keys(s.use), ...Object.keys(s.keep)]) goods.add(item)
    for (const r of world.content.routes.values()) {
      if (r.to === settlement) for (const item of Object.keys(r.carries)) goods.add(item)
      if (r.from === settlement) for (const item of Object.keys(r.returns)) goods.add(item)
    }
  }
  byWorld.set(settlement, goods)
  return goods
}

/** Whether a settlement makes this good only in its season (peat in summer, rye at harvest). */
export function seasonal(world: Pick<World, 'content'>, s: Settlement, item: string): boolean {
  return s.workshops.some((w) => item in w.makes && w.from !== undefined && world.content.resources.get(w.from)?.months !== undefined)
}

/** What a settlement aims to hold of a good: its keep, or three days of its use. */
export function aimOf(world: World, s: Settlement, item: string): number {
  return s.keep[item] ?? (s.use[item] ?? 0) * knob(world, 'economy.days_of_use')
}

const value = (world: Pick<World, 'content'>, item: string) => world.content.items.get(item)?.value ?? 1
/** What a shopkeeper pays the settlement for a good: half its worth. */
export const wholesale = (world: World, item: string) => Math.floor(value(world, item) / 2)

/** Whether a route runs now: not closed by a plan or from the start, and its way open. */
export function routeOpen(world: World, route: Route): boolean {
  const state = world.state.economy?.routes[route.id]
  if (state?.closed ?? route.closed) return false
  if (route.via) {
    const key = [...route.via].sort().join('|')
    if (world.state.closed?.[key]) return false
  }
  return true
}

/** A route closes or opens again (verbs close_route and open_route): news, and a claim the watchers see. */
export function setRoute(world: World, id: string, closed: boolean, why?: string): boolean {
  const route = world.content.routes.get(id)
  if (!route) return false
  const state = (economy(world).routes[id] ??= {})
  if ((state.closed ?? route.closed) === closed) return true
  state.closed = closed
  const to = world.content.areas.get(route.to)?.name ?? route.to
  const from = world.content.outlands.get(route.from)?.name ?? world.content.areas.get(route.from)?.name ?? route.from
  const goods = Object.keys(route.carries).map((i) => world.content.items.get(i)?.name ?? i)
  recordFact(world, {
    kind: 'route',
    about: [route.to],
    place: placeOf(world, route.to),
    belang: 2,
    claim: { subject: id, key: 'route', value: closed ? 'closed' : 'open' },
    title: closed ? `${route.name} closed` : `${route.name} open again`,
    text: closed
      ? { precise: `Nothing comes through from ${from} any more${why ? `: ${why}` : ''}. That means no ${list(goods)}.`, village: `No more ${goods[0] ?? 'goods'} from ${from}, they say. The ${route.by} has stopped coming.`, far: `The way to ${to} is shut.` }
      : { precise: `The ${route.by} comes through from ${from} again, with ${list(goods)}.`, village: `The ${route.by} from ${from} is running again.`, far: `Trade runs to ${to} again.` },
  })
  return true
}

/** Where news about a settlement is: its first place tagged social, or its first place. */
export function placeOf(world: World, settlement: string): string {
  const places = [...world.content.locations.values()].filter((l) => l.area === settlement).sort((a, b) => a.id.localeCompare(b.id))
  return (places.find((l) => l.tags.includes('social')) ?? places[0])?.id ?? world.content.world.start.location
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

function list(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? 'goods') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`
}

/** Someone who can work: alive, in the world, not travelling with the player. */
function around(world: World, id: string): boolean {
  const s = world.state.npcs[id]
  return Boolean(s && !s.dead && !s.absent && !s.following)
}

/** Once a day, before the shops open: make, bring, take, use. */
export function ledgerHour(world: World): void {
  if (world.content.settlements.size === 0) return
  const today = Math.floor(world.now / DAY)
  const state = economy(world)
  if (state.day >= today || Math.floor((world.now % DAY) / 60) < knob(world, 'economy.ledger_hour')) return
  state.day = today
  const settlements = [...world.content.settlements.values()].sort((a, b) => a.id.localeCompare(b.id))
  for (const s of settlements) state.ledgers[s.id]!.last = emptyLast()
  // Each place makes and uses its own first; what is left over goes out on the routes.
  for (const s of settlements) produce(world, s, today)
  const unmet = new Map(settlements.map((s) => [s.id, consume(world, s)]))
  // What comes from beyond the map first, so a town can pass it on the same day.
  const outside = (r: Route) => (world.content.outlands.has(r.from) ? 0 : 1)
  for (const r of [...world.content.routes.values()].sort((a, b) => outside(a) - outside(b) || a.id.localeCompare(b.id))) travel(world, r, today)
  for (const o of state.orders.filter((o) => o.arrives <= today)) {
    const l = state.ledgers[o.to]
    if (!l) continue
    move(l, undefined, o.item, o.qty)
    const goods = world.content.items.get(o.item)?.plural ?? o.item
    const area = world.content.areas.get(o.to)?.name ?? o.to
    recordFact(world, { kind: 'goods', about: [o.to], place: placeOf(world, o.to), belang: 1, title: `${goods} came in to ${area}`, text: { precise: `${cap(o.by)} came in to ${area} with ${o.qty} ${goods}.`, village: `There are ${goods} to be had again; ${o.by} brought them.`, far: `Goods came in to ${area}.` } })
  }
  state.orders = state.orders.filter((o) => o.arrives > today)
  for (const s of settlements) weigh(world, s, unmet.get(s.id)!)
}

function produce(world: World, s: Settlement, today: number): void {
  const l = economy(world).ledgers[s.id]!
  const month = new GameClock(world.now).parts.month
  // Travellers, rents and the market bring money in every day.
  l.purse += s.income
  for (const w of s.workshops) {
    if (w.requires) {
      const [loc, obj] = w.requires.object.split('/')
      const state = loc && obj ? world.objectState(loc, obj) : {}
      if (!Object.entries(w.requires.state).every(([k, v]) => (state[k] ?? false) === v)) continue
    }
    const ground = w.from ? world.content.resources.get(w.from) : undefined
    if (w.from && (!ground || !s.resources.includes(w.from) || (ground.months && !ground.months.includes(month)))) continue
    const drawnKey = `${s.id}:${w.from}`
    if (ground?.amount !== undefined && (economy(world).drawn[drawnKey] ?? 0) >= ground.amount) continue
    // Those who came to take up the trade work it as well (M8.5).
    const named = [...w.named, ...(world.state.growth?.hands[`${s.id}:${w.id}`] ?? [])]
    const hands = w.workers + named.filter((id) => around(world, id)).length
    if (hands === 0) {
      l.idle[w.id] ??= today
      continue
    }
    delete l.idle[w.id]
    const total = w.workers + named.length
    let scale = hands / Math.max(1, total)
    for (const [item, n] of Object.entries(w.uses)) scale = Math.min(scale, (l.stock[item] ?? 0) / n)
    if (scale <= 0) continue
    for (const [item, n] of Object.entries(w.uses)) {
      const q = round(n * scale)
      l.stock[item] = round((l.stock[item] ?? 0) - q)
      l.last.used[item] = round((l.last.used[item] ?? 0) + q)
    }
    for (const [item, n] of Object.entries(w.makes)) {
      const q = round(n * scale)
      l.stock[item] = round((l.stock[item] ?? 0) + q)
      // The season's store: what there is while it is being made.
      if (ground?.months) (l.peak ??= {})[item] = l.stock[item]!
      l.last.made[item] = round((l.last.made[item] ?? 0) + q)
      // The work is paid: half of what it is worth stays in the settlement.
      l.purse += Math.floor((q * value(world, item)) / 2)
      if (ground?.amount !== undefined) economy(world).drawn[drawnKey] = round((economy(world).drawn[drawnKey] ?? 0) + q)
    }
  }
}

/** Room at a settlement for a good that comes in: up to half again what it aims to hold. */
function room(world: World, s: Settlement | undefined, l: Ledger, item: string, offered: number): number {
  if (!s) return offered
  const aim = aimOf(world, s, item)
  return aim > 0 ? Math.max(0, aim * 1.5 - (l.stock[item] ?? 0)) : offered
}

/** What a settlement can spare of a good: what it has above what it aims to hold. */
function spare(world: World, s: Settlement, l: Ledger, item: string): number {
  return Math.max(0, (l.stock[item] ?? 0) - aimOf(world, s, item))
}

function move(to: Ledger, from: Ledger | undefined, item: string, qty: number): void {
  if (qty <= 0) return
  to.stock[item] = round((to.stock[item] ?? 0) + qty)
  to.last.came[item] = round((to.last.came[item] ?? 0) + qty)
  if (from) {
    from.stock[item] = round((from.stock[item] ?? 0) - qty)
    from.last.went[item] = round((from.last.went[item] ?? 0) + qty)
  }
}

function travel(world: World, r: Route, today: number): void {
  const state = economy(world)
  const run = (state.routes[r.id] ??= {})
  if (run.last !== undefined && today - run.last < r.every) return
  if (!routeOpen(world, r)) return
  run.last = today
  const toS = world.content.settlements.get(r.to)
  const to = state.ledgers[r.to]
  if (!toS || !to) return
  const fromS = world.content.settlements.get(r.from)
  const from = state.ledgers[r.from]
  const outland = world.content.outlands.get(r.from)
  const prices = outland?.prices ?? 1
  for (const [item, n] of Object.entries(r.carries)) {
    // Scarcity from a plan (market): only a share of it comes.
    let qty = n * (world.state.market?.[item] ?? 1)
    if (fromS && from) qty = Math.min(qty, spare(world, fromS, from, item))
    qty = round(Math.min(qty, room(world, toS, to, item, qty)))
    move(to, from, item, qty)
    const cost = Math.round(qty * value(world, item) * (outland ? prices : 0.5))
    to.purse = Math.max(0, to.purse - cost)
    if (from) from.purse += cost
  }
  for (const [item, n] of Object.entries(r.returns)) {
    if (outland && !outland.asks.includes(item)) continue
    let qty = Math.min(n, spare(world, toS, to, item))
    if (fromS && from) qty = Math.min(qty, room(world, fromS, from, item, qty))
    qty = round(qty)
    if (qty <= 0) continue
    to.stock[item] = round((to.stock[item] ?? 0) - qty)
    to.last.went[item] = round((to.last.went[item] ?? 0) + qty)
    if (from) move(from, undefined, item, qty)
    const paid = Math.round(qty * value(world, item) * (outland ? prices : 0.5))
    to.purse += paid
    if (from) from.purse = Math.max(0, from.purse - paid)
  }
}

/**
 * The nameless use what they need; what they could not get is short. A crowd
 * that came (M10.22: refugees, a crew, pilgrims) eats with them, as many more
 * mouths as it counts.
 */
function consume(world: World, s: Settlement): Set<string> {
  const l = economy(world).ledgers[s.id]!
  const unmet = new Set<string>()
  const guests = (world.state.crowds ?? []).filter((c) => (c.until === undefined || c.until > world.now) && world.content.locations.get(c.at)?.area === s.id).reduce((sum, c) => sum + c.count, 0)
  const share = guests > 0 ? 1 + guests / Math.max(1, s.people) : 1
  for (const [item, used] of Object.entries(s.use)) {
    const n = round(used * share)
    const took = round(Math.min(Math.max(0, l.stock[item] ?? 0), n))
    l.stock[item] = round((l.stock[item] ?? 0) - took)
    l.last.used[item] = round((l.last.used[item] ?? 0) + took)
    if (took < n) unmet.add(item)
  }
  return unmet
}

/** After the day's trade: how many days in a row a good has been short, or a surplus. */
function weigh(world: World, s: Settlement, unmet: Set<string>): void {
  const l = economy(world).ledgers[s.id]!
  for (const item of carried(world, s.id)) {
    // Short: the nameless did not get what they need, or a counter found the store empty since yesterday.
    l.short[item] = unmet.has(item) || l.missed[item] ? (l.short[item] ?? 0) + 1 : 0
    const aim = aimOf(world, s, item)
    // What is made in its season (peat, the harvest) is the store for the year, not a surplus (M9.1).
    l.surplus[item] = !seasonal(world, s, item) && aim > 0 && (l.stock[item] ?? 0) > aim * 2 ? (l.surplus[item] ?? 0) + 1 : 0
  }
  l.missed = {}
}

/**
 * A counter fills from its settlement's store (M8.4): for a good the ledger
 * carries, what comes in is what the store has, and the shopkeeper pays the
 * settlement for it. Undefined when the ledger does not carry the good: then
 * the fixed supply is the fallback.
 */
export function fillFromLedger(world: World, location: string, provider: string, item: string, want: number): number | undefined {
  const s = settlementAt(world, location)
  if (!s || !carried(world, s.id).has(item)) return undefined
  const l = economy(world).ledgers[s.id]!
  // Below half of what the place wants to hold, the store is rationed (M9.1): the counter gets its share, and the price climbs.
  // A good made only in its season is rationed once two thirds of the season's store is gone: through the winter it gets dearer.
  const have = Math.max(0, l.stock[item] ?? 0)
  const line = seasonal(world, s, item) ? ((l.peak ??= {})[item] ??= Math.max(have, aimOf(world, s, item))) * (2 / 3) : aimOf(world, s, item) / 2
  const share = line > 0 && have < line ? have / line : 1
  const qty = Math.floor(Math.min(want * share, have))
  // Less in store than the counter wants: that is short too.
  if (qty < want) l.missed[item] = true
  if (qty <= 0) return 0
  l.stock[item] = round((l.stock[item] ?? 0) - qty)
  l.last.went[item] = round((l.last.went[item] ?? 0) + qty)
  const shop = world.npcState(provider)
  // Paid as far as the shopkeeper can; the rest is on the slate.
  const cost = Math.min(Math.max(0, shop.money), qty * wholesale(world, item))
  shop.money -= cost
  l.purse += cost
  return qty
}

/** The nameless buy at a counter with the settlement's money (M8.4): as many as the purse allows. Without a ledger, as before. */
export function nameless(world: World, location: string, qty: number, price: number): number {
  const s = settlementAt(world, location)
  if (!s) return qty
  const l = economy(world).ledgers[s.id]!
  const can = Math.min(qty, Math.floor(l.purse / Math.max(1, price)))
  l.purse -= can * price
  return can
}

/** Goods sent for (verb order): they come in so many days, paid now at twice their worth. */
export function orderGoods(world: World, to: string, item: string, qty: number, days: number, by: string): boolean {
  const l = ledgerOf(world, to)
  if (!l || !world.content.items.has(item) || qty <= 0) return false
  l.purse = Math.max(0, l.purse - qty * value(world, item) * 2)
  economy(world).orders.push({ item, qty, to, arrives: Math.floor(world.now / DAY) + Math.max(1, days), by })
  return true
}

/**
 * What a settlement lives on (M8.4, "Karakter per nederzetting"): the good
 * its workshops make that is worth most, or trade when more comes in over its
 * routes, by the piece, than it makes itself. A place that makes nothing
 * lives on what its tags say.
 */
const livingCache = new WeakMap<object, Map<string, string | undefined>>()

export function livesOn(world: Pick<World, 'content'>, settlement: string): string | undefined {
  let byWorld = livingCache.get(world.content)
  if (!byWorld) livingCache.set(world.content, (byWorld = new Map()))
  if (!byWorld.has(settlement)) byWorld.set(settlement, workOutLiving(world, settlement))
  return byWorld.get(settlement)
}

function workOutLiving(world: Pick<World, 'content'>, settlement: string): string | undefined {
  const s = world.content.settlements.get(settlement)
  if (!s) return undefined
  const worth = new Map<string, number>()
  let made = 0
  for (const w of s.workshops) {
    // A harvest counts as its share of the year (M9.1).
    const months = w.from ? world.content.resources.get(w.from)?.months : undefined
    const year = months ? months.length / 13 : 1
    for (const [item, n] of Object.entries(w.makes)) {
      worth.set(item, (worth.get(item) ?? 0) + n * year * value(world, item))
      made += n * year
    }
  }
  if (made === 0) return undefined
  let brought = 0
  for (const r of world.content.routes.values()) {
    if (r.to === settlement) for (const n of Object.values(r.carries)) brought += n / r.every
    if (r.from === settlement) for (const n of Object.values(r.returns)) brought += n / r.every
  }
  if (brought > made) return 'trade'
  return [...worth.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0]
}

const foodCache = new WeakMap<object, Set<string>>()

/** What people eat, and what that is made from, two steps back along the recipes and workshops: bread, flour, rye. */
export function foodGoods(world: World): Set<string> {
  const hit = foodCache.get(world.content)
  if (hit) return hit
  const food = new Set([...world.content.items.values()].filter((i) => (i.food ?? 0) > 0).map((i) => i.id))
  const recipes = [
    ...[...world.content.objectTypes.values()].flatMap((t) => t.affordances.map((a) => ({ makes: a.produces, uses: a.consumes }))),
    ...[...world.content.settlements.values()].flatMap((s) => s.workshops.map((w) => ({ makes: w.makes, uses: w.uses }))),
  ]
  for (let round = 0; round < 2; round++) for (const r of recipes) if (Object.keys(r.makes).some((p) => food.has(p))) for (const c of Object.keys(r.uses)) food.add(c)
  foodCache.set(world.content, food)
  return food
}

/** What a region beyond the map trades, in words (M8.4): for the chronicler, so what he says of it fits the stub. */
export function tradeLine(world: Pick<World, 'content'>, id: string): string | undefined {
  const o = world.content.outlands.get(id)
  if (!o) return undefined
  const goods = (ids: string[]) => list(ids.map((i) => world.content.items.get(i)?.plural ?? world.content.items.get(i)?.name ?? i))
  const routes = [...world.content.routes.values()].filter((r) => r.from === id).map((r) => world.content.areas.get(r.to)?.name ?? r.to)
  const prices = o.prices > 1.05 ? `its prices are ${o.prices >= 1.5 ? 'much' : 'a little'} above ours` : o.prices < 0.95 ? 'its prices are below ours' : 'its prices are like ours'
  return `${o.name} sends ${goods(o.sends)}${routes.length ? ` to ${list(routes)}` : ''}, by ${o.by}, every ${o.every === 1 ? 'day' : `${o.every} days`}${o.asks.length ? `, and asks for ${goods(o.asks)}` : ''}; ${prices}.`
}

/** A settlement's character: what it lives on and its tags, for conditions. */
export function characterOf(world: Pick<World, 'content'>, settlement: string): string[] {
  const s = world.content.settlements.get(settlement)
  if (!s) return []
  const living = livesOn(world, settlement)
  // Its rank too (M9.1): { character: $area, is: city }.
  const kind = world.content.areas.get(settlement)?.kind
  return [...(living ? [living] : []), ...s.tags, ...(kind ? [kind] : [])]
}

/** How much more open a settlement is to strangers from its character: its own measure, and a little more for a trading place. */
export function opennessOf(world: Pick<World, 'content'>, settlement: string): number {
  const s = world.content.settlements.get(settlement)
  if (!s) return 0
  return s.openness + (livesOn(world, settlement) === 'trade' ? 0.1 : 0)
}

/** A settlement as the editor shows it (M8.4): what it lives on, its character, what it makes, and its routes. */
export interface SettlementView {
  id: string
  name: string
  livesOn?: string
  tags: string[]
  openness: number
  people: number
  makes: string[]
  routes: string[]
}

export function economyOverview(content: Content): SettlementView[] {
  const world = { content }
  const goods = (g: Record<string, number>) => Object.entries(g).map(([i, n]) => `${n} ${i}`).join(', ')
  return [...content.settlements.values()].map((s) => ({
    id: s.id,
    name: content.areas.get(s.id)?.name ?? s.id,
    ...(livesOn(world, s.id) ? { livesOn: livesOn(world, s.id)! } : {}),
    tags: s.tags,
    openness: Math.round(opennessOf(world, s.id) * 100) / 100,
    people: s.people,
    makes: s.workshops.map((w) => `${w.name}: ${goods(w.makes)} a day${Object.keys(w.uses).length ? ` from ${goods(w.uses)}` : ''}${w.named.length ? ` (${w.named.join(', ')})` : ''}`),
    routes: [...content.routes.values()]
      .filter((r) => r.to === s.id || r.from === s.id)
      .map((r) => `${r.name}: ${r.to === s.id ? `in ${goods(r.carries)} from ${r.from}` : `out ${goods(r.carries)} to ${r.to}`}${Object.keys(r.returns).length ? `, ${r.to === s.id ? 'out' : 'in'} ${goods(r.returns)}` : ''}, every ${r.every === 1 ? 'day' : `${r.every} days`} by ${r.by}`),
  }))
}
