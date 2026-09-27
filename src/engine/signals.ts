import { commonFaith, faithOf } from './faith'
import type { Output } from './commands'
import { startAftermath } from './aftermath'
import { allHold, type QuestHost } from './quests/engine'
import type { Watcher } from './quests/planschema'
import type { Condition } from './quests/schema'
import type { Claim, Fact, Signal, SignalState } from './state'
import { tieTo } from './people'
import { planCauses, planOf } from './quests/plans'
import { openness } from './belief'
import { attitude } from './dialogue/relations'
import { carried, foodGoods, placeOf } from './economy/ledger'
import type { World } from './world'
import { householdKey, householdPurses, standingOf } from './standing'

// Signals (M8.1; design: signalen en nasleep, "Signalen"). A watcher in the
// content says when a change in the world is a signal: a new fact with a
// claim (a wedding, peace, a place open again), conditions that come true
// (in the language of quest conditions), or a state the system works out (a
// house nobody lives in). Signals are data, merged per subject per hour, and
// go to the cheapest handler that can take them: in M8.1 the standard
// aftermath of the content. Watchers of facts see them at once; the others
// look on the hour. What they start runs where the effect plans run.

const DAY = 24 * 60
const KEEP = 200

export function signalState(world: World): SignalState {
  return (world.state.signals ??= { seq: 0, queue: [], log: [], seen: {} })
}

/** Puts a signal in the queue, or adds its cause to one about the same people in the same hour. */
export function queueSignal(world: World, input: Omit<Signal, 'id' | 't' | 'scope'> & { scope?: Signal['scope'] }): Signal {
  const state = signalState(world)
  const hour = Math.floor(world.now / 60)
  const same = (s: Signal) => s.kind === input.kind && s.event === input.event && Math.floor(s.t / 60) === hour && [...s.who].sort().join() === [...input.who].sort().join() && s.place === input.place
  const twin = state.queue.find(same) ?? state.log.find(same)
  if (twin) {
    twin.cause = [...new Set([...twin.cause, ...input.cause])]
    return twin
  }
  const signal: Signal = { ...input, id: `sig_${++state.seq}`, t: world.now, scope: input.scope ?? scopeOf(world, input.who) }
  state.queue.push(signal)
  return signal
}

/** One person, one household, or more. */
function scopeOf(world: World, who: string[]): Signal['scope'] {
  const people = who.filter((id) => id === 'player' || world.content.npcs.has(id))
  if (people.length <= 1) return 'person'
  const houses = new Set(people.map((id) => (id === 'player' ? world.state.player.home : (world.npc(id).household ?? world.npc(id).home))))
  return houses.size === 1 || people.includes('player') ? 'household' : houses.size === 2 ? 'pair' : 'many'
}

/** A new fact: every watcher of facts that it fits gives its signal. */
export function watchFact(world: World, fact: Fact): void {
  for (const w of watchers(world)) {
    const f = w.fact
    if (!f) continue
    if (f.key && fact.claim?.key !== f.key) continue
    if (f.value !== undefined && !(Array.isArray(f.value) ? f.value : [f.value]).includes(fact.claim?.value ?? '')) continue
    if (f.not !== undefined && (Array.isArray(f.not) ? f.not : [f.not]).includes(fact.claim?.value ?? '')) continue
    if (f.kind && fact.kind !== f.kind && !fact.kind.startsWith(`${f.kind}:`)) continue
    if (!f.key && !f.kind) continue
    const people = (id: string | undefined) => (id && (id === 'player' || world.content.npcs.has(id)) ? [id] : [])
    const bound = (sel: string): string[] => {
      if (sel === '$subject') return people(fact.claim?.subject)
      if (sel === '$value') return people(fact.claim?.value)
      if (sel === '$about') return fact.about.flatMap(people)
      return people(sel)
    }
    const who = w.who ? w.who.flatMap(bound) : [...people(fact.claim?.subject), ...people(fact.claim?.value)]
    const place = w.place && w.place !== '$place' ? w.place : fact.place
    queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who: [...new Set(who)], place, cause: [fact.id], belang: w.belang ?? fact.belang, ...(fact.claim ? { claim: fact.claim } : {}), watcher: w.id })
  }
}

/** Someone came to believe a claim (M8.2): watchers of beliefs give their signal, once per person and fact. */
export function watchBelief(world: World, who: string, fact: Fact, teller: string): void {
  const seen = signalState(world).seen
  for (const w of watchers(world)) {
    const b = w.belief
    if (!b || fact.claim?.key !== b.key) continue
    if (b.value !== undefined && !(Array.isArray(b.value) ? b.value : [b.value]).includes(fact.claim.value)) continue
    if (b.kind && fact.kind !== b.kind) continue
    const key = `${w.id}:${who}:${fact.claim.subject}`
    if (seen[key]) continue
    seen[key] = true
    const people = [who, ...(world.content.npcs.has(teller) ? [teller] : [])]
    queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who: people, place: world.state.npcs[who]?.location ?? fact.place, cause: [fact.id], belang: w.belang ?? fact.belang, claim: fact.claim, watcher: w.id })
  }
}

/** On the hour: conditions that came true, and the states the system works out. */
export function watchHour(world: World): void {
  const seen = signalState(world).seen
  for (const w of watchers(world)) {
    if (w.when) {
      const now = allHold(world, w.when)
      const before = seen[w.id]
      seen[w.id] = now
      if (now && before === false) queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who: w.who ?? [], place: w.place ?? placeIn(world, w.when) ?? world.content.world.start.location, cause: [], belang: w.belang ?? 1, watcher: w.id })
    } else if (w.probe && 'house_empty' in w.probe) emptyHouses(world, w, w.probe.house_empty)
    else if (w.probe && 'standing_rise' in w.probe) risen(world, w, w.probe.standing_rise)
    else if (w.probe && 'befriended' in w.probe) befriended(world, w, w.probe.befriended)
    else if (w.probe && 'grudge' in w.probe) grudges(world, w, w.probe.grudge)
    else if (w.probe && 'strangers_stay' in w.probe) strangersStay(world, w, w.probe.strangers_stay)
    else if (w.probe && 'friction' in w.probe) friction(world, w, w.probe.friction)
    else if (w.probe && 'shortage' in w.probe) ledgerSpell(world, w, 'short', w.probe.shortage)
    else if (w.probe && 'surplus' in w.probe) ledgerSpell(world, w, 'surplus', w.probe.surplus)
    else if (w.probe && 'price_doubled' in w.probe) dearCounters(world, w, w.probe.price_doubled)
    else if (w.probe && 'missing_trade' in w.probe) missingTrades(world, w, w.probe.missing_trade)
  }
}

/** Who sells a good in a settlement, and where: the counters of its area. */
function sellersOf(world: World, settlement: string, item: string): { who: string; where: string }[] {
  return [...world.content.locations.values()]
    .filter((l) => l.area === settlement)
    .flatMap((l) => l.services.filter((s) => item in s.sells && world.alive(s.provider)).map((s) => ({ who: s.provider, where: l.id })))
    .sort((a, b) => a.where.localeCompare(b.where) || a.who.localeCompare(b.who))
}

/**
 * A shortage or a surplus that has lasted so many days in a settlement's
 * ledger (M8.4): once a spell, a signal for those who sell the good there,
 * with a claim the aftermath can bind ($subject the settlement, $value the good).
 */
/**
 * Why a settlement is short of something (M9.2): the closing of a route that
 * brought it, when that is what shut it off. Cause and effect, as facts.
 */
function routeCauses(world: World, settlement: string, item: string): string[] {
  const routes = [...world.content.routes.values()].filter((r) => (r.to === settlement && item in r.carries) || (r.from === settlement && item in r.returns))
  const closed = routes.filter((r) => world.state.economy?.routes[r.id]?.closed ?? r.closed)
  const facts = world.state.news?.facts ?? []
  const shut = closed.flatMap((r) => {
    const fact = [...facts].reverse().find((f) => f.claim?.subject === r.id && f.claim.key === 'route' && f.claim.value === 'closed')
    return fact ? [fact.id] : []
  })
  // A shortage that lasts comes from the shortage told before it.
  const told = [...facts].reverse().find((f) => f.claim?.subject === settlement && f.claim.key === 'short' && f.claim.value === item)
  return [...shut, ...(told ? [told.id] : [])]
}

function ledgerSpell(world: World, w: Watcher, spell: 'short' | 'surplus', days: number): void {
  const state = world.state.economy
  if (!state) return
  const seen = signalState(world).seen
  // The ledger's day, not the calendar's: the counts change at the ledger hour, not at midnight.
  const day = state.day
  for (const [settlement, ledger] of Object.entries(state.ledgers).sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const [item, n] of Object.entries(ledger[spell]).sort((a, b) => a[0].localeCompare(b[0]))) {
      const key = `${w.id}:${settlement}:${item}`
      if (n !== days || seen[key] === day) continue
      seen[key] = day
      const sellers = sellersOf(world, settlement, item)
      const makers = spell === 'surplus' ? (world.content.settlements.get(settlement)?.workshops ?? []).filter((x) => item in x.makes).flatMap((x) => x.named.filter((id) => world.alive(id))) : []
      const who = [...new Set([...sellers.map((s) => s.who), ...makers])].slice(0, 3)
      queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who, place: sellers[0]?.where ?? placeOf(world, settlement), cause: spell === 'short' ? routeCauses(world, settlement, item) : [], belang: w.belang ?? 2, claim: { subject: settlement, key: spell, value: item }, watcher: w.id, ...(who.length ? {} : { scope: 'many' as const }) })
    }
  }
}

/**
 * A price at a counter that climbs to so many times its worth (M8.4): for a
 * good the counter fills from its settlement's store, when it crosses the
 * line, at most once a week, for the shopkeeper. What stood there at the start
 * is no news.
 */
function dearCounters(world: World, w: Watcher, factor: number): void {
  const seen = signalState(world).seen
  for (const settlement of [...world.content.settlements.keys()].sort()) {
    const goods = carried(world, settlement)
    for (const l of [...world.content.locations.values()].filter((x) => x.area === settlement).sort((a, b) => a.id.localeCompare(b.id))) {
      for (const s of l.services) {
        for (const item of s.supply.map((r) => r.item).filter((i, n, all) => goods.has(i) && all.indexOf(i) === n).sort()) {
          const key = `${w.id}:${l.id}:${s.id}:${item}`
          const over = world.price(l.id, s, item) >= world.basePrice(item, s) * factor
          const was = seen[`${key}:over`]
          seen[`${key}:over`] = over
          if (!over || was !== false || world.now - Number(seen[key] ?? -Infinity) < 7 * DAY) continue
          seen[key] = world.now
          queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who: world.alive(s.provider) ? [s.provider] : [], place: l.id, cause: routeCauses(world, settlement, item), belang: w.belang ?? 2, claim: { subject: settlement, key: 'price', value: item }, watcher: w.id })
        }
      }
    }
  }
}

/** A workshop nobody has worked for so many days (M8.4): the trade is missing, and the whole place feels it. */
function missingTrades(world: World, w: Watcher, days: number): void {
  const state = world.state.economy
  if (!state) return
  const seen = signalState(world).seen
  const today = Math.floor(world.now / DAY)
  for (const s of [...world.content.settlements.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const x of s.workshops) {
      const since = state.ledgers[s.id]?.idle[x.id]
      const key = `${w.id}:${s.id}:${x.id}`
      if (since === undefined || today - since < days || seen[key] === since) continue
      seen[key] = since
      queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who: [], place: x.at, cause: [], belang: w.belang ?? 3, claim: { subject: s.id, key: 'trade', value: x.id }, watcher: w.id, scope: 'many' })
    }
  }
}

/**
 * People who fled here or stay here from elsewhere, for so many days (M8.2):
 * once a week per village, a signal for the one of the village who likes them
 * least, with what drove them from home (the claim their return waits on).
 */
function strangersStay(world: World, w: Watcher, days: number): void {
  const seen = signalState(world).seen
  const byArea = new Map<string, { id: string; where: string }[]>()
  for (const id of Object.keys(world.state.npcs).sort()) {
    const s = world.state.npcs[id]!
    const where = s.stayAt?.where ?? (s.note?.unrest !== 'travelling' ? s.note?.where : undefined)
    const area = where ? world.content.locations.get(where)?.area : undefined
    const key = `${w.id}:since:${id}`
    if (!where || !area || s.dead || !world.content.npcs.has(id) || world.location(world.npc(id).home).area === area) {
      delete seen[key]
      continue
    }
    const since = Number((seen[key] ??= world.now))
    if (world.now - since >= days * DAY) byArea.set(area, [...(byArea.get(area) ?? []), { id, where }])
  }
  for (const [area, guests] of [...byArea.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const last = Number(seen[`${w.id}:${area}`] ?? -Infinity)
    if (world.now - last < 7 * DAY) continue
    const ids = new Set(guests.map((g) => g.id))
    const liking = (who: string) => guests.reduce((sum, g) => sum + (world.state.bonds?.[who]?.[g.id]?.affinity ?? 0), 0) / guests.length
    const host = Object.keys(world.state.npcs)
      .sort()
      .filter((id) => !ids.has(id) && world.present(id) && world.content.npcs.has(id) && !world.npc(id).child && !world.npc(id).quirks.includes('spirit') && world.location(world.npc(id).home).area === area)
      .filter((id) => !guests.some((g) => ['family', 'love'].includes(tieTo(world, id, g.id)?.kind ?? '')))
      .sort((a, b) => liking(a) - liking(b) || a.localeCompare(b))[0]
    if (!host) continue
    seen[`${w.id}:${area}`] = world.now
    const place = guests.map((g) => g.where).sort()[0]!
    queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who: [host], place, cause: [], belang: w.belang ?? 1, ...(causeOf(world, [...ids]) ? { claim: causeOf(world, [...ids]) } : {}), watcher: w.id })
  }
}

/** People staying in a place from elsewhere, by area. */
function newcomersByArea(world: World): Map<string, string[]> {
  const byArea = new Map<string, string[]>()
  for (const id of Object.keys(world.state.npcs).sort()) {
    const s = world.state.npcs[id]!
    const where = s.stayAt?.where ?? (s.note?.unrest !== 'travelling' ? s.note?.where : undefined)
    const area = where ? world.content.locations.get(where)?.area : undefined
    if (!area || s.dead || !world.content.npcs.has(id) || world.location(world.npc(id).home).area === area) continue
    byArea.set(area, [...(byArea.get(area) ?? []), id])
  }
  return byArea
}

/** Beyond this, a newcomer is from far off (km between areas). */
const FAR_KM = 30

/**
 * The pressure of newcomers on a village (M8.3, M9.1): their share, where one
 * from far off (another dialect, other ways) or of another faith than most of
 * the village weighs half again, each; against how open the place is, and
 * half again when food is short.
 */
export function frictionPressure(world: World, area: string, guests: string[], residents: string[], place: string, short: boolean): number {
  const here = world.content.areas.get(area)?.pos
  const faith = commonFaith(world, residents)
  const weight = (id: string) => {
    const there = world.content.areas.get(world.location(world.npc(id).home).area)?.pos
    const far = here && there && Math.hypot(here[0] - there[0], here[1] - there[1]) > FAR_KM
    const other = faith !== undefined && faithOf(world, id) !== faith
    return 1 + (far ? 0.5 : 0) + (other ? 0.5 : 0)
  }
  const share = guests.reduce((sum, id) => sum + weight(id), 0) / Math.max(1, guests.length + residents.length)
  return (share / Math.max(0.1, openness(world, place))) * (short ? 1.5 : 1)
}

/**
 * Friction in a village (M8.3; design: "Wrijving in een dorp"): the share of
 * newcomers against how open the place is, half again as heavy when food is
 * short or they come from far. Over the threshold (0.6 in the content: with
 * food short, about a third newcomers in a village), once a fortnight per
 * village: a signal about the villagers who mind them most. It touches many
 * households.
 */
function friction(world: World, w: Watcher, threshold: number): void {
  const seen = signalState(world).seen
  const short = foodShort(world)
  for (const [area, guests] of [...newcomersByArea(world).entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const last = Number(seen[`${w.id}:${area}`] ?? -Infinity)
    // Two guests are no crowd: an inn lives on them.
    if (guests.length < 3 || world.now - last < 14 * DAY) continue
    const residents = Object.keys(world.state.npcs)
      .sort()
      .filter((id) => world.present(id) && world.content.npcs.has(id) && !world.npc(id).child && !world.npc(id).quirks.includes('spirit') && world.location(world.npc(id).home).area === area && !guests.includes(id))
    if (!residents.length) continue
    const place = world.state.npcs[guests[0]!]!.stayAt?.where ?? world.npc(residents[0]!).home
    const pressure = frictionPressure(world, area, guests, residents, place, short)
    if (pressure < threshold) continue
    seen[`${w.id}:${area}`] = world.now
    const liking = (who: string) => guests.reduce((sum, g) => sum + (world.state.bonds?.[who]?.[g]?.affinity ?? 0), 0) / guests.length + world.npc(who).personality.warmth * 10
    const averse = residents.filter((id) => !guests.some((g) => ['family', 'love'].includes(tieTo(world, id, g)?.kind ?? ''))).sort((a, b) => liking(a) - liking(b) || a.localeCompare(b)).slice(0, 3)
    if (!averse.length) continue
    // What brought the newcomers is what the friction comes from (M9.2).
    const brought = (world.state.plans ?? []).filter((p) => Object.values(p.groups).flat().some((id) => guests.includes(id))).flatMap((p) => planCauses(world, p))
    queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who: averse, place, cause: [...new Set(brought)], belang: w.belang ?? 3, scope: 'many', watcher: w.id })
  }
}

/** Food is short: less comes in of something people eat, or of what it is made from (two steps back along the recipes). */
export function foodShort(world: World): boolean {
  return [...foodGoods(world)].some((id) => (world.state.market?.[id] ?? 1) < 0.9)
}

/** What drove people from home: the claim a step of their plan waits to know otherwise. */
export function causeOf(world: World, people: string[]): Claim | undefined {
  for (const p of world.state.plans ?? []) {
    if (p.ended !== undefined || !Object.values(p.groups).flat().some((id) => people.includes(id))) continue
    for (const step of planOf(world, p.plan)?.steps ?? []) {
      for (const c of step.when) if ('knows' in c && typeof c.knows !== 'string' && c.knows.not !== undefined) return { subject: c.knows.subject, key: c.knows.key, value: Array.isArray(c.knows.not) ? c.knows.not[0]! : c.knows.not }
    }
  }
  return undefined
}

/** A grudge between two that has lasted so many days, once per grudge: a feud (M8.2). */
function grudges(world: World, w: Watcher, days: number): void {
  const seen = signalState(world).seen
  for (const [a, row] of Object.entries(world.state.bonds ?? {}).sort((x, y) => x[0].localeCompare(y[0]))) {
    for (const [b, bond] of Object.entries(row).sort((x, y) => x[0].localeCompare(y[0]))) {
      if (bond.grudge === undefined || a > b || world.now - bond.grudge < days * DAY) continue
      const key = `${w.id}:${a}|${b}:${bond.grudge}`
      if (seen[key] || !world.alive(a) || !world.alive(b)) continue
      seen[key] = true
      queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who: [a, b], place: world.npc(a).home, cause: [], belang: w.belang ?? 2, watcher: w.id })
    }
  }
}

/**
 * A household that rose so many standings since it was last seen (M8.2):
 * once, and from then on the new standing is where it is measured from.
 * A fall is simply the new measure.
 */
/**
 * A friend of the stranger (M10.3): someone who has been Warm or better for so
 * many days and has shared something with them: a secret told, a favour
 * done, a journey together, gifts. Once each.
 */
function befriended(world: World, w: Watcher, days: number): void {
  const layer = (world.state.layer ??= {})
  const warm = (layer.warm ??= {})
  const seen = signalState(world).seen
  for (const id of Object.keys(world.state.relations ?? {}).sort()) {
    if (!world.content.npcs.has(id) || !world.alive(id) || world.npc(id).child) continue
    const band = attitude(world, id).band
    if (band !== 'Warm' && band !== 'Devoted') {
      delete warm[id]
      continue
    }
    warm[id] ??= world.now
    const key = `${w.id}:${id}`
    if (seen[key] || world.now - warm[id]! < days * 24 * 60) continue
    const flags = Object.keys(world.state.flags ?? {})
    const shared = flags.some((f) => f.startsWith(`secret:${id}:`)) || world.state.requests.some((r) => r.npc === id && r.status === 'done') || Boolean(world.state.companions?.some((c) => c.npc === id && c.bond >= 1)) || (world.state.gifts?.[id]?.count ?? 0) > 0
    if (!shared) continue
    seen[key] = true
    queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who: [id], place: world.state.npcs[id]!.location, cause: [], belang: w.belang ?? 1, watcher: w.id })
  }
}

function risen(world: World, w: Watcher, steps: number): void {
  const layer = (world.state.layer ??= {})
  const seen = (layer.standing ??= {})
  const purses = householdPurses(world)
  const heads = new Map<string, string[]>()
  for (const id of Object.keys(world.state.npcs).sort()) {
    const s = world.state.npcs[id]!
    if (s.dead || !world.content.npcs.has(id) || world.npc(id).child || world.npc(id).quirks.includes('spirit') || world.npc(id).creature) continue
    const key = householdKey(world, id)
    heads.set(key, [...(heads.get(key) ?? []), id])
  }
  for (const [key, members] of [...heads.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const level = standingOf(world, members[0]!, purses)
    const before = seen[key]
    if (!before) {
      seen[key] = { level, t: world.now }
      continue
    }
    if (level < before.level) seen[key] = { ...before, level, t: world.now }
    else if (level >= before.level + steps) {
      seen[key] = { level, from: before.level, t: world.now }
      // The one with the purse first: the head of the household.
      const who = [...members].sort((a, b) => world.state.npcs[b]!.money - world.state.npcs[a]!.money || a.localeCompare(b))
      queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who, place: world.npc(who[0]!).home, cause: [], belang: w.belang ?? 2, watcher: w.id })
    }
  }
}

/** The place a list of conditions is about, if one names a place (review, 27 September: not the player's place). */
function placeIn(world: World, list: Condition[]): string | undefined {
  for (const c of list) {
    const id = 'at' in c ? c.at : 'npc_at' in c ? c.place : 'place_state' in c ? c.place_state : 'object' in c ? c.object.split('/')[0] : undefined
    if (id && world.content.locations.has(id)) return id
    const nested = 'all' in c ? placeIn(world, c.all) : 'any' in c ? placeIn(world, c.any) : undefined
    if (nested) return nested
  }
  return undefined
}

/** What the watchers see at the start of a game (or of an old save): only what changes after that is a signal. */
export function primeWatchers(world: World): void {
  const seen = signalState(world).seen
  for (const w of watchers(world)) if (w.when) seen[w.id] = allHold(world, w.when)
}

/**
 * A house nobody lives in any more: the home of someone in the content, and
 * now nobody's home (the dead do not count, the absent still do). After so
 * many days it is a free house, and a signal once.
 */
function emptyHouses(world: World, w: Watcher, days: number): void {
  const state = signalState(world)
  const layer = (world.state.layer ??= {})
  const houses = new Set([...world.content.npcs.values()].map((n) => n.home))
  const lived = new Set<string>()
  for (const [id, s] of Object.entries(world.state.npcs)) if (!s.dead && world.content.npcs.has(id)) lived.add(world.npc(id).home)
  if (world.state.player.home) lived.add(world.state.player.home)
  for (const house of [...houses].sort()) {
    const key = `${w.id}:${house}`
    if (lived.has(house)) {
      if (layer.empty?.[house] !== undefined) delete layer.empty[house]
      state.seen[key] = false
      continue
    }
    const since = ((layer.empty ??= {})[house] ??= world.now)
    if (world.now - since >= days * DAY && state.seen[key] !== true) {
      state.seen[key] = true
      queueSignal(world, { kind: w.signal, ...(w.event ? { event: w.event } : {}), who: [], place: house, cause: [], belang: w.belang ?? 1, watcher: w.id })
    }
  }
}

/** The signals in the queue go to their handler: the standard aftermath (M8.1). */
export function processSignals(world: World, host: QuestHost): Output[] {
  const state = world.state.signals
  if (!state?.queue.length) return []
  const out: Output[] = []
  for (let round = 0; round < 5 && state.queue.length; round++) {
    for (const signal of state.queue.splice(0)) {
      out.push(...startAftermath(world, host, signal))
      // A signal back from a brain that made no plan replaces its first entry.
      const i = state.log.findIndex((s) => s.id === signal.id)
      if (i >= 0) state.log[i] = signal
      else state.log.push(signal)
    }
  }
  if (state.log.length > KEEP) state.log.splice(0, state.log.length - KEEP)
  return out
}

function watchers(world: World): Watcher[] {
  return [...world.content.watchers.values()].sort((a, b) => a.id.localeCompare(b.id))
}
