import { isOpenAt, MINUTES_PER_DAY, minuteOfDay, weekdayOf } from './clock'
import type { Need } from './content'
import { add } from './items'
import { spreadNews } from './news'
import { storyHour } from './stories'
import { nightly } from './storylines'
import { settleRuns } from './chronicler'
import { settleChoices } from './npc/goals'
import { clamp } from './npc/execute'
import { think } from './npc/brain'
import type { World } from './world'

// The world clock. Every game minute, NPCs that are free decide and act;
// every game hour, needs decay and the economy moves (supply and demand).

const DECAY: Record<Need, number> = { hunger: 3, rest: 3, social: 1, safety: 0, work: 2, faith: 0.25 }

export function advance(world: World, minutes: number): void {
  const ids = Object.keys(world.state.npcs).sort()
  for (let i = 0; i < minutes; i++) {
    world.state.minutes++
    if (minuteOfDay(world.now) % 60 === 0) hourly(world)
    if (minuteOfDay(world.now) % 15 === 0) spreadNews(world)
    // Someone in a conversation with the player stays put until it ends.
    for (const id of ids) if (world.state.talk?.npc !== id && !world.state.npcs[id]!.dead) think(world, id)
    settleRuns(world)
    settleChoices(world)
  }
}

function hourly(world: World): void {
  decayNeeds(world)
  supply(world)
  demand(world)
  storyHour(world)
  nightly(world)
  const lodging = world.state.player.lodging
  if (lodging && world.now >= lodging.until) world.state.player.lodging = undefined
}

function decayNeeds(world: World): void {
  const workday = weekdayOf(world.now) !== 'Rustdag'
  for (const id of Object.keys(world.state.npcs).sort()) {
    const npc = world.state.npcs[id]!
    if (npc.dead) continue
    const def = world.npc(id)
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
        if (room > 0) add(stock, rule.item, Math.min(room, rule.amount))
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
