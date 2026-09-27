import type { Output } from '../commands'
import { recordFact } from '../news'
import { gainXp } from '../rules/player'
import type { World } from '../world'
import { aimOf, economy, placeOf, settlementAt } from './ledger'
import type { Route } from './schema'

// Hauling (M9.1; design: signalen en nasleep, "Werk, investeren, vervoeren").
// Where a settlement has more of something than it keeps, and the other end
// of a route wants it, the player may carry a load there for pay: out of the
// store of one, into the store of the other, paid from the other's purse.
// The road has its risks: a toll gate on the route takes its due, and those
// who rob travellers take part of the load of whoever gives in to them.

/** What a player can carry in one go, in the units of the goods. */
export const MAX_LOAD = 20

export interface Load {
  item: string
  qty: number
  from: string
  to: string
  route: string
  pay: number
  t: number
  /** Tolls already paid on the way, by where. */
  paid?: string[]
}

export interface LoadOffer {
  item: string
  qty: number
  to: string
  route: string
  pay: number
}

const value = (world: World, item: string) => world.content.items.get(item)?.value ?? 1
const areaName = (world: World, id: string) => world.content.areas.get(id)?.name ?? id
const goods = (world: World, item: string, qty: number) => {
  const i = world.content.items.get(item)
  return `${qty} ${qty === 1 ? (i?.name ?? item) : (i?.plural ?? i?.name ?? item)}`
}

/** The loads the settlement where the player is has for other settlements, along its routes. */
export function loadsHere(world: World): LoadOffer[] {
  const s = settlementAt(world, world.state.player.location)
  if (!s) return []
  const state = economy(world)
  const mine = state.ledgers[s.id]
  if (!mine) return []
  const offers: LoadOffer[] = []
  const lanes = (r: Route): [string, Record<string, number>][] => [
    ...(r.from === s.id ? [[r.to, r.carries] as [string, Record<string, number>]] : []),
    ...(r.to === s.id && world.content.settlements.has(r.from) ? [[r.from, r.returns] as [string, Record<string, number>]] : []),
  ]
  for (const r of [...world.content.routes.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const [to, carried] of lanes(r)) {
      const there = world.content.settlements.get(to)
      const theirs = state.ledgers[to]
      if (!there || !theirs) continue
      for (const item of Object.keys(carried).sort()) {
        const spare = Math.floor((mine.stock[item] ?? 0) - aimOf(s, item))
        const wanted = Math.ceil(aimOf(there, item) * 1.5 - (theirs.stock[item] ?? 0))
        const qty = Math.min(MAX_LOAD, spare, wanted)
        if (qty < 1) continue
        // Half again when the other side is short of it.
        const pay = Math.max(6, Math.round(qty * value(world, item) * 0.3 * (theirs.short[item] ? 1.5 : 1)))
        offers.push({ item, qty, to, route: r.id, pay })
      }
    }
  }
  return offers
}

/** LOADS: what there is to carry from here. */
export function listLoads(world: World): Output[] {
  const load = world.state.player.load
  if (load) return [{ kind: 'system', text: `You are carrying ${goods(world, load.item, load.qty)} to ${areaName(world, load.to)}, for ${world.money(load.pay)}. DELIVER it there.` }]
  const offers = loadsHere(world)
  if (!offers.length) return [{ kind: 'system', text: settlementAt(world, world.state.player.location) ? 'Nobody here has a load to send anywhere just now.' : 'There is no trade here to carry for.' }]
  return [{ kind: 'system', text: ['Loads to carry from here (HAUL <goods> TO <place>):', ...offers.map((o) => `  ${goods(world, o.item, o.qty)} to ${areaName(world, o.to)}, for ${world.money(o.pay)}`)].join('\n') }]
}

/** HAUL <goods> TO <place>: the load comes out of the store here. */
export function takeLoad(world: World, what: string, where: string): Output[] {
  if (world.state.player.load) return [{ kind: 'error', text: 'You are carrying a load already. DELIVER it first.' }]
  const words = (s: string) => s.toLowerCase().replace(/^(?:the|a|some)\s+/, '').trim()
  const w = words(what)
  const p = words(where)
  const offer = loadsHere(world).find((o) => {
    const item = world.content.items.get(o.item)
    const area = world.content.areas.get(o.to)
    const itemNames = [o.item, item?.name, item?.plural, ...(item?.aliases ?? [])].filter(Boolean).map((n) => n!.toLowerCase())
    const areaNames = [o.to, area?.name, ...(area?.aliases ?? [])].filter(Boolean).map((n) => n!.toLowerCase().replace(/^the\s+/, ''))
    return (!w || itemNames.some((n) => n === w || n.includes(w))) && areaNames.some((n) => n === p || n.includes(p))
  })
  if (!offer) return [{ kind: 'error', text: `There is no such load to take from here. LOADS shows what there is.` }]
  const s = settlementAt(world, world.state.player.location)!
  const ledger = economy(world).ledgers[s.id]!
  ledger.stock[offer.item] = Math.round(((ledger.stock[offer.item] ?? 0) - offer.qty) * 100) / 100
  world.state.player.load = { item: offer.item, qty: offer.qty, from: s.id, to: offer.to, route: offer.route, pay: offer.pay, t: world.now }
  return [{ kind: 'narration', text: `You load ${goods(world, offer.item, offer.qty)} for ${areaName(world, offer.to)}. You will be paid ${world.money(offer.pay)} when you DELIVER them there.` }]
}

/** DELIVER: the load goes into the store of the settlement it was for, and its purse pays. */
export function deliverLoad(world: World): Output[] {
  const load = world.state.player.load
  if (!load) return [{ kind: 'error', text: 'You are not carrying a load.' }]
  const here = settlementAt(world, world.state.player.location)
  if (here?.id !== load.to) return [{ kind: 'error', text: `This load is for ${areaName(world, load.to)}.` }]
  const ledger = economy(world).ledgers[load.to]!
  ledger.stock[load.item] = Math.round(((ledger.stock[load.item] ?? 0) + load.qty) * 100) / 100
  const paid = Math.max(0, Math.min(load.pay, Math.floor(ledger.purse)))
  ledger.purse -= paid
  world.state.player.money += paid
  world.state.player.load = undefined
  gainXp(world, 5, `a load carried to ${areaName(world, load.to)}`)
  recordFact(world, {
    kind: 'goods',
    about: [load.to],
    place: placeOf(world, load.to),
    belang: 1,
    title: `the stranger brought ${goods(world, load.item, load.qty)} from ${areaName(world, load.from)}`,
    text: { precise: `The stranger carried ${goods(world, load.item, load.qty)} from ${areaName(world, load.from)} to ${areaName(world, load.to)}.`, village: `The stranger brought ${world.content.items.get(load.item)?.plural ?? load.item} in from ${areaName(world, load.from)}.`, far: `Goods came in to ${areaName(world, load.to)}.` },
  })
  const short = paid < load.pay ? ` It is all there is in the purse; the rest is owed.` : ''
  return [{ kind: 'narration', text: `You hand over ${goods(world, load.item, load.qty)}. You are paid ${world.money(paid)}.${short}` }]
}

/**
 * A toll gate on the way (a route's `toll`): whoever passes with a load of
 * that route pays, once. Without the money, the tollkeeper takes goods worth it.
 */
export function payToll(world: World): Output[] {
  const load = world.state.player.load
  const here = world.state.player.location
  const toll = load ? world.content.routes.get(load.route)?.toll : undefined
  if (!load || !toll || toll.at !== here || load.paid?.includes(here)) return []
  ;(load.paid ??= []).push(here)
  if (world.state.player.money >= toll.amount) {
    world.state.player.money -= toll.amount
    return [{ kind: 'narration', text: `${cap(toll.by)} stops you and your load. You pay the toll, ${world.money(toll.amount)}.` }]
  }
  const taken = Math.min(load.qty, Math.ceil(toll.amount / value(world, load.item)))
  load.qty -= taken
  load.pay = Math.round((load.pay * load.qty) / (load.qty + taken))
  if (load.qty <= 0) world.state.player.load = undefined
  return [{ kind: 'narration', text: `${cap(toll.by)} stops you and your load. You cannot pay the toll, so ${goods(world, load.item, taken)} stay${taken === 1 ? 's' : ''} behind instead.` }]
}

/** Robbed on the road: those who robbed the player take a share of the load. */
export function robLoad(world: World, share: number): Output[] {
  const load = world.state.player.load
  if (!load || share <= 0) return []
  const taken = Math.max(1, Math.round(load.qty * share))
  load.qty -= taken
  load.pay = Math.round((load.pay * load.qty) / (load.qty + taken))
  if (load.qty <= 0) world.state.player.load = undefined
  return [{ kind: 'system', text: `They take ${goods(world, load.item, taken)} of your load.` }]
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
