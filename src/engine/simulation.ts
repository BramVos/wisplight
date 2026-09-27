import { archiveDay } from './archive'
import { fillFromLedger, ledgerHour, nameless } from './economy/ledger'
import { projectsDay } from './growth/growth'
import { sawPerson } from './acquaintance'
import { isOpenAt, MINUTES_PER_DAY, minuteOfDay, weekdayOf } from './clock'
import type { Need } from './content'
import { add } from './items'
import { spreadNews } from './news'
import { storyHour } from './stories'
import { nightly } from './storylines'
import { weatherHour } from './weather'
import { settleRuns } from './chronicler'
import { settleNotes, thinksNow } from './lod'
import { settleChoices } from './npc/goals'
import { clamp } from './npc/execute'
import { think } from './npc/brain'
import type { World } from './world'
import { companionsHour, keepUp } from './social/companions'
import { pursue } from './social/confront'
import { noticeCoincidences } from './social/coincidence'
import { homeDay } from './social/romance'
import { crimesHour } from './social/crime'
import { conditionsDay } from './rules/player'
import { debtsDue, weeklyDrift } from './social/deeds'
import { realmsDay } from './social/realms'
import { watchHour } from './signals'
import { forgetWeek, longApart, metAgain } from './forgetting'
import { chatterNearPlayer } from './chatter'

// The world clock. Every game minute, NPCs that are free decide and act;
// every game hour, needs decay and the economy moves (supply and demand).

const DECAY: Record<Need, number> = { hunger: 3, rest: 3, social: 1, safety: 0, work: 2, faith: 0.25 }

export function advance(world: World, minutes: number): void {
  const ids = Object.keys(world.state.npcs).sort()
  for (let i = 0; i < minutes; i++) {
    world.state.minutes++
    if (minuteOfDay(world.now) % 60 === 0) hourly(world)
    // Where the player is, people greet each other and stop to talk (M8.2).
    if (minuteOfDay(world.now) % 5 === 0) chatterNearPlayer(world)
    if (minuteOfDay(world.now) % 15 === 0) {
      spreadNews(world)
      noticeCoincidences(world)
      noteSightings(world, ids)
    }
    keepUp(world)
    // Someone in a conversation with the player stays put until it ends.
    settleNotes(world)
    // Near the player every minute, further off every quarter of an hour; notes not at all (lod.ts).
    for (const id of ids) if (world.state.talk?.npc !== id && !world.state.npcs[id]!.dead && !world.state.npcs[id]!.following && !world.state.npcs[id]!.absent && thinksNow(world, id)) think(world, id)
    settleRuns(world)
    settleChoices(world)
  }
}

function hourly(world: World): void {
  decayNeeds(world)
  // The ledgers before the counters fill (M8.4), and a workday on what is being built (M8.5).
  const ran = world.state.economy?.day
  ledgerHour(world)
  if (world.state.economy && world.state.economy.day !== ran) projectsDay(world)
  supply(world)
  demand(world)
  storyHour(world)
  nightly(world)
  weatherHour(world)
  companionsHour(world)
  // What has been over for a month leaves the save for the game log (M9.1).
  if (minuteOfDay(world.now) === 4 * 60) {
    const archived = archiveDay(world)
    if (archived) world.archived.push(archived)
  }
  if (minuteOfDay(world.now) === 6 * 60) {
    debtsDue(world)
    homeDay(world)
    conditionsDay(world)
  }
  pursue(world)
  crimesHour(world)
  healWounds(world)
  watchHour(world)
  if (minuteOfDay(world.now) === 0) {
    realmsDay(world)
    if (Math.floor(world.now / MINUTES_PER_DAY) % 7 === 0) {
      weeklyDrift(world)
      forgetWeek(world)
    }
  }
  const lodging = world.state.player.lodging
  if (lodging && world.now >= lodging.until) world.state.player.lodging = undefined
}

/** Wounds from a fight heal a little every hour. */
function healWounds(world: World): void {
  for (const npc of Object.values(world.state.npcs)) if (npc.wounds) npc.wounds = Math.max(0, npc.wounds - 1) || undefined
}

function decayNeeds(world: World): void {
  const workday = weekdayOf(world.now) !== 'Rustdag'
  for (const id of Object.keys(world.state.npcs).sort()) {
    const npc = world.state.npcs[id]!
    if (npc.dead || npc.absent) continue
    const def = world.npc(id)
    // Spirits and the fair folk neither hunger nor tire.
    if (def.quirks.includes('spirit')) continue
    const asleep = npc.activity === 'asleep'
    for (const need of Object.keys(DECAY) as Need[]) {
      let loss = DECAY[need]
      if (need === 'rest' && asleep) loss = 0
      if (need === 'hunger' && asleep) loss = 1
      if (need === 'social') loss += Math.max(0, def.personality.curiosity) * 0.25
      if (need === 'work' && (!workday || def.child)) loss = 0
      npc.needs[need] = clamp(npc.needs[need] - loss)
    }
  }
}

function supply(world: World): void {
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  const weekday = weekdayOf(world.now)
  for (const location of world.content.locations.values()) {
    for (const service of location.services) {
      for (const rule of service.supply) {
        if (rule.at !== hour) continue
        if (rule.every === 'week' && rule.weekday && rule.weekday !== weekday) continue
        if (rule.requires) {
          const [loc, obj] = rule.requires.object.split('/')
          const state = loc && obj ? world.objectState(loc, obj) : {}
          if (!Object.entries(rule.requires.state).every(([k, v]) => state[k] === v)) continue
        }
        const stock = world.stock(location.id, service.id)
        const target = service.sells[rule.item]?.target ?? rule.amount
        const room = Math.max(0, target - (stock[rule.item] ?? 0))
        if (room <= 0) continue
        // From the settlement's store for a good its ledger carries (M8.4); otherwise the fixed supply.
        const want = Math.min(room, rule.amount)
        let fromStore = fillFromLedger(world, location.id, service.provider, rule.item, want)
        // Food first (M9.1): whatever the store says, a kitchen or a tap scrapes a quarter together, so nobody goes hungry by a sum.
        if (fromStore !== undefined && (world.content.items.get(rule.item)?.food ?? 0) > 0) fromStore = Math.max(fromStore, Math.min(want, Math.ceil(rule.amount / 4)))
        // Scarcity from an effect plan: only a share comes in.
        const share = world.state.market?.[rule.item] ?? 1
        add(stock, rule.item, fromStore ?? Math.floor(want * share))
      }
    }
  }
}

/** Villagers who are not simulated one by one still buy bread, peat and beer. */
function demand(world: World): void {
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  for (const location of [...world.content.locations.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const service of location.services) {
      if (!world.serviceOpen(location.id, service)) continue
      for (const rule of service.demand) {
        if (hour < rule.from || hour >= rule.to) continue
        if (rule.days && !rule.days.includes(weekdayOf(world.now))) continue
        const perHour = rule.amount / Math.max(1, rule.to - rule.from)
        let qty = Math.floor(perHour)
        if (world.rng.next(`demand:${location.id}`) < perHour - qty) qty++
        const stock = world.stock(location.id, service.id)
        qty = Math.min(qty, stock[rule.item] ?? 0)
        if (qty <= 0) continue
        const price = world.price(location.id, service, rule.item)
        // They pay from the settlement's purse, not from nothing (M8.4).
        qty = nameless(world, location.id, qty, price)
        if (qty <= 0) continue
        add(stock, rule.item, -qty)
        world.npcState(service.provider).money += qty * price
      }
    }
  }
}

export function isDaytime(minutes: number): boolean {
  return isOpenAt(minutes, '06-21')
}

export { MINUTES_PER_DAY }

/** People in the same place see each other: they can say later where they saw whom. */
function noteSightings(world: World, ids: string[]): void {
  const at = new Map<string, string[]>()
  for (const id of ids) {
    const s = world.state.npcs[id]!
    if (s.dead || s.absent || s.note) continue
    const here = at.get(s.location)
    if (here) here.push(id)
    else at.set(s.location, [id])
  }
  // The player is seen too: that is how a rumour finds a suspect.
  const player = world.state.player.location
  for (const id of at.get(player) ?? []) {
    ;(world.state.npcs[id]!.sightings ??= {})['player'] = { where: player, t: world.now }
    sawPerson(world, id, player)
  }
  for (const [where, here] of at) {
    if (here.length < 2) continue
    for (const a of here) {
      const seen = (world.state.npcs[a]!.sightings ??= {})
      for (const b of here) {
        if (a === b) continue
        // Together again after a long time (M8.2): known again, or a stranger now.
        if (longApart(world, seen[b]?.t)) metAgain(world, a, b)
        seen[b] = { where, t: world.now }
      }
    }
  }
}
