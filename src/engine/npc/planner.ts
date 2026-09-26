import { nextOpening } from '../clock'
import type { Affordance, ObjectInstance, Service } from '../content'
import { add } from '../items'
import type { Counts, Goal, Step } from '../state'
import type { World } from '../world'

// The planner turns a goal into steps without any AI. It only uses places the
// NPC knows (World.knownLocations). Obtaining an item is a small backward
// search: buy it from a known seller, or produce it with an affordance whose
// inputs are obtained the same way. The cheapest option wins, where cost is
// minutes plus money weighted by personality (FO, chapter 7).

const MAX_DEPTH = 3
const MAX_WAIT = 8 * 60

interface Cursor {
  location: string
  time: number
  money: number
  inventory: Counts
}

interface Option {
  steps: Step[]
  cost: number
  cursor: Cursor
}

export interface PlanResult {
  steps: Step[]
  cost: number
}

export interface PlanFailure {
  missing: { item: string; qty: number }
}

export class Planner {
  private readonly moneyWeight: number
  private readonly known: Set<string>
  private missing?: { item: string; qty: number }
  private missingDepth = Infinity

  constructor(
    private readonly world: World,
    private readonly npcId: string,
  ) {
    const npc = world.npc(npcId)
    this.moneyWeight = 1 + (npc.quirks.includes('counts_every_duit') ? 0.5 : 0)
    this.known = world.knownLocations(npcId)
  }

  plan(goal: Goal): PlanResult | PlanFailure {
    const state = this.world.npcState(this.npcId)
    const cursor: Cursor = {
      location: state.location,
      time: this.world.now,
      money: state.money,
      inventory: { ...state.inventory },
    }
    const option = this.planGoal(goal, cursor)
    if (option) return { steps: option.steps, cost: option.cost }
    return { missing: this.missing ?? { item: goal.item ?? 'unknown', qty: goal.qty ?? 1 } }
  }

  private planGoal(goal: Goal, cursor: Cursor): Option | undefined {
    switch (goal.type) {
      case 'Produce':
        return this.planProduce(goal, cursor)
      case 'Obtain':
        return goal.item ? this.obtain(goal.item, goal.qty ?? 1, cursor, 0, []) : undefined
      case 'Repair':
        return this.planRepair(goal, cursor)
      default:
        return undefined
    }
  }

  private planProduce(goal: Goal, cursor: Cursor): Option | undefined {
    if (!goal.item || !goal.qty) return undefined
    const produced = this.produce(goal.item, goal.qty, cursor, 0, [])
    if (!produced) return undefined
    if (!goal.service) return produced
    const shop = this.findOwnService(goal.service)
    if (!shop) return produced
    const tail = this.travel(produced.cursor, shop.location)
    if (!tail) return produced
    const qty = produced.cursor.inventory[goal.item] ?? 0
    add(tail.cursor.inventory, goal.item, -qty)
    return {
      steps: [...produced.steps, ...tail.steps, { kind: 'stock', location: shop.location, service: goal.service, item: goal.item, qty }],
      cost: produced.cost + tail.cost,
      cursor: tail.cursor,
    }
  }

  private planRepair(goal: Goal, cursor: Cursor): Option | undefined {
    if (!goal.target || !goal.object) return undefined
    const found = this.world.object(goal.target, goal.object)
    const repair = found?.type.repair
    if (!found || !repair) return undefined
    let current: Option = { steps: [], cost: 0, cursor: clone(cursor) }
    for (const [item, qty] of Object.entries(repair.consumes)) {
      const got = this.obtain(item, qty, current.cursor, 0, [])
      if (!got) return undefined
      current = { steps: [...current.steps, ...got.steps], cost: current.cost + got.cost, cursor: got.cursor }
    }
    const trip = this.travel(current.cursor, goal.target)
    if (!trip) return undefined
    for (const [item, qty] of Object.entries(repair.consumes)) add(trip.cursor.inventory, item, -qty)
    trip.cursor.time += repair.duration
    return {
      steps: [...current.steps, ...trip.steps, { kind: 'repair', location: goal.target, object: goal.object, consumes: repair.consumes }],
      cost: current.cost + trip.cost + repair.duration,
      cursor: trip.cursor,
    }
  }

  /** Make sure the cursor holds qty of item, buying or producing the rest. */
  obtain(item: string, qty: number, cursor: Cursor, depth: number, stack: string[]): Option | undefined {
    const have = cursor.inventory[item] ?? 0
    if (have >= qty) return { steps: [], cost: 0, cursor: clone(cursor) }
    const need = qty - have
    if (depth > MAX_DEPTH || stack.includes(item)) return undefined

    const options = [...this.buyOptions(item, need, cursor), this.produce(item, need, cursor, depth, [...stack, item])].filter(
      (o): o is Option => o !== undefined,
    )
    const best = options.sort((a, b) => a.cost - b.cost)[0]
    // Remember the shallowest thing we could not get: that is what the NPC asks for.
    if (!best && depth < this.missingDepth) {
      this.missing = { item, qty: need }
      this.missingDepth = depth
    }
    return best
  }

  private buyOptions(item: string, need: number, cursor: Cursor): Option[] {
    const options: Option[] = []
    for (const locationId of [...this.known].sort()) {
      for (const service of this.world.location(locationId).services) {
        if (!(item in service.sells) || service.provider === this.npcId) continue
        const stock = this.world.stock(locationId, service.id)[item] ?? 0
        if (stock < need) continue
        const price = this.world.price(locationId, service, item) * need
        if (price > cursor.money) continue
        const trip = this.travel(cursor, locationId, service)
        if (!trip) continue
        trip.cursor.money -= price
        add(trip.cursor.inventory, item, need)
        trip.cursor.time += 5
        options.push({
          steps: [...trip.steps, { kind: 'buy', location: locationId, service: service.id, item, qty: need }],
          cost: trip.cost + 5 + this.moneyWeight * price,
          cursor: trip.cursor,
        })
      }
    }
    return options
  }

  private produce(item: string, need: number, cursor: Cursor, depth: number, stack: string[]): Option | undefined {
    let best: Option | undefined
    for (const { locationId, object, affordance } of this.producers(item)) {
      const perUse = affordance.produces[item] ?? 0
      const times = Math.ceil(need / perUse)
      let current: Option = { steps: [], cost: 0, cursor: clone(cursor) }
      let feasible = true
      for (const [input, perInput] of Object.entries(affordance.consumes)) {
        const got = this.obtain(input, perInput * times, current.cursor, depth + 1, stack)
        if (!got) {
          feasible = false
          break
        }
        current = { steps: [...current.steps, ...got.steps], cost: current.cost + got.cost, cursor: got.cursor }
      }
      if (!feasible) continue
      const fee = affordance.fee * times
      if (fee > current.cursor.money) continue
      const trip = this.travel(current.cursor, locationId, undefined, object)
      if (!trip) continue
      for (const [input, perInput] of Object.entries(affordance.consumes)) add(trip.cursor.inventory, input, -perInput * times)
      for (const [output, perOutput] of Object.entries(affordance.produces)) add(trip.cursor.inventory, output, perOutput * times)
      trip.cursor.money -= fee
      trip.cursor.time += affordance.duration * times
      const option: Option = {
        steps: [...current.steps, ...trip.steps, { kind: 'use', location: locationId, object: object.id, affordance: affordance.id, times }],
        cost: current.cost + trip.cost + affordance.duration * times + this.moneyWeight * fee,
        cursor: trip.cursor,
      }
      if (!best || option.cost < best.cost) best = option
    }
    return best
  }

  private producers(item: string): { locationId: string; object: ObjectInstance; affordance: Affordance }[] {
    const npc = this.world.npc(this.npcId)
    const result: { locationId: string; object: ObjectInstance; affordance: Affordance }[] = []
    for (const locationId of [...this.known].sort()) {
      for (const object of this.world.location(locationId).objects) {
        const type = this.world.content.objectTypes.get(object.type)
        if (!type) continue
        const state = this.world.objectState(locationId, object.id)
        for (const affordance of type.affordances) {
          if (!affordance.actors.includes('npc') || !(affordance.produces[item] ?? 0)) continue
          if (!Object.entries(affordance.requires_state).every(([k, v]) => state[k] === v)) continue
          const allowed =
            affordance.access === 'public' ||
            (affordance.access === 'owner' && object.owner === this.npcId) ||
            (affordance.access === 'household' && (object.owner === this.npcId || (!!npc.household && object.household === npc.household))) ||
            (affordance.access === 'staff' && (object.owner === this.npcId || object.staff.includes(this.npcId)))
          if (allowed) result.push({ locationId, object, affordance })
        }
      }
    }
    return result
  }

  private findOwnService(serviceId: string): { location: string; service: Service } | undefined {
    for (const location of this.world.content.locations.values()) {
      const service = location.services.find((s) => s.id === serviceId)
      if (service && (service.provider === this.npcId || service.staff.includes(this.npcId))) return { location: location.id, service }
    }
    return undefined
  }

  /** Walk to a location and, if it keeps hours, wait for it to open. */
  private travel(cursor: Cursor, to: string, service?: Service, object?: ObjectInstance): Option | undefined {
    const route = this.world.route(cursor.location, to)
    if (!route) return undefined
    const next = clone(cursor)
    next.location = to
    next.time += route.minutes
    const steps: Step[] = route.minutes > 0 ? [{ kind: 'move', to }] : []
    let cost = route.minutes
    const hours = service?.hours ?? object?.hours
    const days = service?.days ?? object?.days
    if (hours) {
      const opening = nextOpening(next.time, hours, days)
      if (opening === undefined || opening - next.time > MAX_WAIT) return undefined
      if (opening > next.time || service || object?.provider) {
        steps.push({ kind: 'waitOpen', location: to, service: service?.id, object: object?.id })
      }
      cost += (opening - next.time) * 0.5
      next.time = opening
    }
    return { steps, cost, cursor: next }
  }
}

function clone(cursor: Cursor): Cursor {
  return { ...cursor, inventory: { ...cursor.inventory } }
}

export function isFailure(result: PlanResult | PlanFailure): result is PlanFailure {
  return 'missing' in result
}
