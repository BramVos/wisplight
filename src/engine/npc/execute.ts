import { minuteOfDay } from '../clock'
import { callName, type Direction, type Need } from '../content'
import { applyEffect, relation } from '../dialogue/relations'
import { add, hasAll, itemName, withArticle } from '../items'
import { meet, recordFact } from '../news'
import { objectKey, type Step } from '../state'
import type { World } from '../world'

// Carries out one plan step. A step either finishes now ('done'), keeps the
// NPC busy for a while ('busy', the same step is looked at again later), or
// cannot be done ('failed', the brain replans).

export type StepResult = 'done' | 'busy' | 'failed'

const FROM: Record<Direction, string> = {
  north: 'the south',
  south: 'the north',
  east: 'the west',
  west: 'the east',
  northeast: 'the southwest',
  northwest: 'the southeast',
  southeast: 'the northwest',
  southwest: 'the northeast',
  up: 'below',
  down: 'above',
  in: 'outside',
  out: 'inside',
}

const MAX_WAIT = 3 * 60

export function executeStep(world: World, npcId: string, step: Step): StepResult {
  const npc = world.npcState(npcId)
  const now = world.now

  switch (step.kind) {
    case 'move': {
      if (npc.location === step.to) {
        if (npc.travelFrom && npc.travelFrom !== step.to) remember(world, npcId, `walked from ${world.location(npc.travelFrom).name} to ${world.location(step.to).name}`)
        npc.travelFrom = undefined
        npc.passing = false
        return 'done'
      }
      const route = world.route(npc.location, step.to)
      const direction = route?.directions[0]
      const exit = direction && world.location(npc.location).exits[direction]
      if (!route || !direction || !exit) return 'failed'
      npc.travelFrom ??= npc.location
      // Someone only passing through gets one line on the way in and a short one on the way out.
      world.emit('depart', npc.location, world.say(npc.passing ? '{name} walks on.' : `{name} ${leaving(direction)}.`, npcId), npcId)
      npc.location = exit.to
      npc.passing = exit.to !== step.to
      const destination = world.location(step.to).name
      world.emit('arrive', exit.to, world.say(npc.passing ? `{name} comes from ${FROM[direction]}, on {their} way to ${destination}.` : `{name} arrives from ${FROM[direction]}.`, npcId), npcId)
      npc.busyUntil = now + exit.minutes
      npc.activity = `on the way to ${destination}`
      const linger = exit.to === world.state.player.location && !world.state.talk ? attention(world, npcId) : 0
      if (linger > 0) {
        npc.noticedPlayerAt = now
        npc.busyUntil = now + Math.max(linger, exit.minutes)
        npc.activity = 'stopping to look at the stranger'
        remember(world, npcId, 'stopped to look at the stranger')
        const line = world.npc(npcId).personality.warmth >= 1 ? '{name} stops and gives you a nod, curious about the stranger.' : '{name} stops and looks you over.'
        world.emit('notice', exit.to, world.say(line, npcId), npcId)
      }
      return 'busy'
    }

    case 'waitOpen': {
      const location = step.location
      const service = step.service ? world.service(location, step.service) : undefined
      const object = step.object ? world.object(location, step.object)?.instance : undefined
      const open = service ? world.serviceOpen(location, service) : object ? world.objectOpen(location, object) : true
      if (open) {
        npc.waitSince = undefined
        return 'done'
      }
      npc.waitSince ??= now
      if (now - npc.waitSince > MAX_WAIT) {
        npc.waitSince = undefined
        return 'failed'
      }
      npc.busyUntil = now + 5
      npc.activity = 'waiting for the doors to open'
      return 'busy'
    }

    case 'buy': {
      const service = world.service(step.location, step.service)
      if (!service || npc.location !== step.location || !world.serviceOpen(step.location, service)) return 'failed'
      const stock = world.stock(step.location, step.service)
      const price = world.price(step.location, service, step.item)
      const qty = Math.min(step.qty, stock[step.item] ?? 0, Math.floor(npc.money / price))
      if (qty <= 0) return 'failed'
      npc.money -= qty * price
      world.npcState(service.provider).money += qty * price
      add(stock, step.item, -qty)
      add(npc.inventory, step.item, qty)
      const seller = callName(world.npc(service.provider))
      remember(world, npcId, `bought ${qtyName(world, step.item, qty)} from ${seller}`)
      meet(world, npcId, service.provider)
      world.emit('trade', step.location, world.say(`{name} buys ${qtyName(world, step.item, qty)} from ${seller}.`, npcId), npcId)
      npc.busyUntil = now + 5
      npc.activity = 'buying'
      return qty < step.qty ? 'failed' : 'done'
    }

    case 'use': {
      const found = world.object(step.location, step.object)
      const affordance = found?.type.affordances.find((a) => a.id === step.affordance)
      if (!found || !affordance || npc.location !== step.location) return 'failed'
      const state = world.objectState(step.location, step.object)
      if (!Object.entries(affordance.requires_state).every(([k, v]) => state[k] === v)) return 'failed'
      if (found.instance.provider && !world.objectOpen(step.location, found.instance)) return 'failed'
      if (!hasAll(npc.inventory, affordance.consumes, step.times)) return 'failed'
      const fee = affordance.fee * step.times
      if (fee > npc.money) return 'failed'
      if (fee > 0 && found.instance.provider) {
        npc.money -= fee
        world.npcState(found.instance.provider).money += fee
      }
      for (const [item, qty] of Object.entries(affordance.consumes)) add(npc.inventory, item, -qty * step.times)
      npc.pending = {
        produces: Object.fromEntries(Object.entries(affordance.produces).map(([item, qty]) => [item, qty * step.times])),
        satisfies: scale(affordance.satisfies, step.times),
        narrate: affordance.narrate_end && world.say(affordance.narrate_end, npcId),
        location: step.location,
      }
      if (affordance.narrate_start) world.emit('work', step.location, world.say(affordance.narrate_start, npcId), npcId)
      remember(world, npcId, `started ${affordance.label}`)
      npc.busyUntil = now + affordance.duration * step.times
      npc.activity = affordance.label
      return 'done'
    }

    case 'stock': {
      const qty = Math.min(step.qty, npc.inventory[step.item] ?? 0)
      if (npc.location !== step.location) return 'failed'
      if (qty > 0) {
        add(npc.inventory, step.item, -qty)
        add(world.stock(step.location, step.service), step.item, qty)
        world.emit('stock', step.location, world.say(`{name} sets out ${qtyName(world, step.item, qty)} for sale.`, npcId), npcId)
      }
      npc.busyUntil = now + 5
      npc.activity = 'arranging the goods for sale'
      return 'done'
    }

    case 'repair': {
      const found = world.object(step.location, step.object)
      const repair = found?.type.repair
      if (!found || !repair || npc.location !== step.location || !hasAll(npc.inventory, step.consumes)) return 'failed'
      for (const [item, qty] of Object.entries(step.consumes)) add(npc.inventory, item, -qty)
      npc.pending = {
        setState: repair.sets,
        objectKey: objectKey(step.location, step.object),
        narrate: repair.narrate_end && world.say(repair.narrate_end, npcId),
        location: step.location,
        satisfies: { work: 30 },
      }
      npc.busyUntil = now + repair.duration
      npc.activity = `repairing the ${found.instance.name ?? found.type.name}`
      return 'done'
    }

    case 'eat': {
      const food = Object.keys(npc.inventory)
        .map((item) => ({ item, food: world.content.items.get(item)?.food ?? 0 }))
        .filter((f) => f.food > 0)
        .sort((a, b) => b.food - a.food || a.item.localeCompare(b.item))[0]
      let gain = 0
      if (food) {
        add(npc.inventory, food.item, -1)
        gain = food.food
      } else if (npc.location === world.npc(npcId).home) {
        gain = 50
      } else {
        return 'failed'
      }
      npc.pending = { satisfies: { hunger: gain } }
      npc.busyUntil = now + 30
      npc.activity = 'eating'
      remember(world, npcId, 'sat down to eat')
      return 'done'
    }

    case 'sleep': {
      // Going to bed takes a little while, so someone who just came home can still be spoken to.
      if (!step.ready) {
        step.ready = true
        npc.activity = 'getting ready for bed'
        npc.busyUntil = now + 10
        return 'busy'
      }
      const minutes = Math.max(30, step.until - now)
      npc.pending = { satisfies: { rest: Math.round((minutes / 60) * 12) } }
      npc.busyUntil = now + minutes
      npc.activity = 'asleep'
      npc.sleepSince = now
      remember(world, npcId, 'went to bed')
      world.emit('sleep', npc.location, world.say('{name} puts out the lamp and goes to bed.', npcId), npcId)
      return 'done'
    }

    case 'spend': {
      const gains: Record<typeof step.activity, Partial<Record<Need, number>>> = {
        work: { work: Math.round(step.minutes / 4) },
        socialize: { social: Math.round(step.minutes / 2) },
        play: { social: Math.round(step.minutes / 2) },
        pray: { faith: Math.round(step.minutes * 0.6) },
        idle: {},
      }
      const gain = { ...gains[step.activity] }
      // Time spent where people gather counts as company, whatever you came for.
      if (world.location(npc.location).tags.includes('social') && step.activity !== 'socialize') {
        gain.social = (gain.social ?? 0) + Math.round(step.minutes / 4)
      }
      npc.pending = { satisfies: gain }
      npc.busyUntil = now + step.minutes
      npc.activity = { work: 'at work', socialize: 'chatting', play: 'playing', pray: 'praying', idle: 'taking it easy' }[step.activity]
      return 'done'
    }

    case 'askHelp': {
      const open = world.state.requests.find((r) => r.npc === npcId && r.item === step.item && r.status === 'open')
      if (!open) {
        world.state.requests.push({ id: `req_${world.state.requests.length + 1}`, npc: npcId, item: step.item, qty: step.qty, created: now, status: 'open' })
        const name = callName(world.npc(npcId))
        const goods = itemName(world.content, step.item, 2).replace(/^2 /, '')
        const area = world.content.areas.get(world.location(npc.location).area)?.name ?? 'the village'
        recordFact(world, {
          kind: 'needs',
          about: [npcId, `item_${step.item}`],
          place: npc.location,
          belang: 1,
          title: `${name} needing ${goods}`,
          text: {
            precise: `${name} needs ${qtyName(world, step.item, step.qty)} and doesn't know where to get ${step.qty === 1 ? 'it' : 'them'}.`,
            village: `${name} is looking for ${goods}.`,
            far: `Someone in ${area} is looking for ${goods}, they say.`,
          },
        })
      }
      npc.lastAskHelp[step.item] = now
      world.emit(
        'ask',
        npc.location,
        world.say(`{name} sighs that {they} could do with ${qtyName(world, step.item, step.qty)}, if only {they} knew where to get it.`, npcId),
        npcId,
      )
      return 'done'
    }
  }
}

/** Applies what a finished activity yields. */
export function resolvePending(world: World, npcId: string): void {
  const npc = world.npcState(npcId)
  const pending = npc.pending
  if (!pending) return
  npc.pending = undefined
  for (const [item, qty] of Object.entries(pending.produces ?? {})) add(npc.inventory, item, qty)
  for (const [need, gain] of Object.entries(pending.satisfies ?? {})) {
    const key = need as Need
    npc.needs[key] = clamp(npc.needs[key] + (gain ?? 0))
  }
  if (pending.setState && pending.objectKey) {
    const wasBroken = world.state.objects[pending.objectKey]?.['broken'] === true
    world.state.objects[pending.objectKey] = { ...world.state.objects[pending.objectKey], ...pending.setState }
    if (wasBroken && pending.setState['broken'] === false) repairedNews(world, npcId, pending.objectKey)
  }
  if (pending.narrate && pending.location) world.emit('work', pending.location, pending.narrate, npcId)
}

const RECENT = 5

export function isNight(minutes: number): boolean {
  const hour = Math.floor(minuteOfDay(minutes) / 60)
  return hour >= 22 || hour < 6
}

/**
 * The player wakes a sleeping NPC. The rest so far still counts, the NPC stays
 * up for a while and then goes back to bed, and it costs goodwill, more at night.
 */
export function wakeNpc(world: World, npcId: string): void {
  const npc = world.npcState(npcId)
  const now = world.now
  const rest = npc.pending?.satisfies?.rest
  if (npc.pending?.satisfies && rest !== undefined && npc.sleepSince !== undefined && npc.busyUntil > npc.sleepSince) {
    npc.pending.satisfies.rest = Math.round(rest * Math.min(1, (now - npc.sleepSince) / (npc.busyUntil - npc.sleepSince)))
  }
  npc.busyUntil = now + 20
  npc.plan = []
  npc.activity = 'awake after being woken by the stranger'
  npc.wokenAt = now
  applyEffect(world, npcId, 'affinity', isNight(now) ? -3 : -1)
  remember(world, npcId, 'were woken by the stranger')
}

/** Keeps a short note of what the NPC just did, for the RECENTLY line in conversations. */
export function remember(world: World, npcId: string, text: string): void {
  const recent = (world.npcState(npcId).recent ??= [])
  recent.push({ t: world.now, text })
  if (recent.length > RECENT) recent.splice(0, recent.length - RECENT)
}

/**
 * Whether someone passing the player stops for a while, and for how many minutes.
 * Curiosity, company and business count; hunger, tiredness and night do not help.
 */
export function attention(world: World, npcId: string): number {
  const npc = world.npcState(npcId)
  const def = world.npc(npcId)
  if (npc.noticedPlayerAt !== undefined && world.now - npc.noticedPlayerAt < 6 * 60) return 0
  if (npc.needs.hunger < 25 || npc.needs.rest < 20) return 0
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  if (hour >= 22 || hour < 5) return 0
  let score = def.personality.curiosity + def.personality.warmth / 2
  if (relation(world.state, npcId).familiarity < 10) score += 1
  if (npc.needs.social < 50) score += 1
  const sells = [...world.content.locations.values()].some((l) => l.services.some((s) => s.provider === npcId && Object.keys(s.sells).length > 0))
  if (sells) score += 1
  if (world.state.requests.some((r) => r.npc === npcId && r.status === 'open')) score += 2
  const goingToWork = npc.plan[0]?.kind === 'move' && npc.plan[0].to === def.work
  if (goingToWork) score -= 1
  if (score < 2) return 0
  return score >= 3.5 ? 30 : 15
}

/** A repair people will talk about: the mill turning again is news for the whole streek. */
function repairedNews(world: World, npcId: string, key: string): void {
  const [location, objectId] = key.split('/') as [string, string]
  const found = world.object(location, objectId)
  if (!found) return
  const thing = found.instance.name ?? `the ${found.type.name}`
  const place = world.location(location)
  const area = world.content.areas.get(place.area)?.name ?? place.name
  const name = callName(world.npc(npcId))
  recordFact(world, {
    kind: 'repaired',
    about: [location, npcId, `area_${place.area}`],
    place: location,
    belang: found.type.id === 'windmill' ? 3 : 2,
    title: `${thing} working again`,
    text: {
      precise: `${name} has mended ${thing} at ${area}; it works again.`,
      village: `${thing} at ${area} works again.`,
      far: `They say ${thing} at ${area} is working again.`,
    },
  })
}

export function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10))
}

function scale(values: Partial<Record<Need, number>>, times: number): Partial<Record<Need, number>> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, (v ?? 0) * times]))
}

function leaving(direction: Direction): string {
  if (direction === 'in') return 'goes inside'
  if (direction === 'out') return 'goes outside'
  if (direction === 'up') return 'goes upstairs'
  if (direction === 'down') return 'goes downstairs'
  return `leaves ${direction}`
}

export function qtyName(world: World, item: string, qty: number): string {
  return qty === 1 ? withArticle(itemName(world.content, item)) : itemName(world.content, item, qty)
}
