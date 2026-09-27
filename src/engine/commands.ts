import { GameClock, isOpenAt, MINUTES_PER_DAY, parseHours, startOfDay } from './clock'
import { callName, type Affordance, type Direction, type Npc, type ObjectInstance, type ObjectType, type Service } from './content'
import { add, formatMoney, hasAll, itemName, listItems, matchItem, withArticle } from './items'
import { applyEffect } from './dialogue/relations'
import { canSetOut, crossCountryLine, describeHex, hexOfId, isHexId, walk, waysLine } from './map/travel'
import { regionMap } from './map/region'
import { recordFact } from './news'
import { fulfil } from './requests'
import { giveBack, stories, type Tempo } from './stories'
import { isNight, qtyName, wakeNpc } from './npc/execute'
import { parseDirection, splitQuantity, type Command } from './parser'
import type { World } from './world'
import { rest } from './rules/player'
import { widowTurnsBack } from './quests/antagonists'
import { closedBetween, placeStateLine } from './quests/plans'
import { approve, restParty } from './social/companions'
import { deed } from './social/deeds'
import { refusedTrade } from './social/crime'

// Player commands that need no AI. Each returns lines of output; commands that
// take time call `pass(minutes)`, which runs the world and returns what the
// player sees happen meanwhile.

export type OutputKind = 'room' | 'text' | 'system' | 'error' | 'narration' | 'speech' | 'check'

export interface Output {
  kind: OutputKind
  text: string
}

export interface CommandHost {
  world: World
  pass(minutes: number): Output[]
}

const HELP = [
  'Moving: north, south, east, west, up, down, in, out (n, s, e, w, ...). Also: go <place>, exits.',
  'Across country: head <direction>, walk to <place>, follow <the tow path, the road, the fen path>. Map: map.',
  'Looking: look (l), examine <thing or person> (x).',
  'Things: inventory (i), take, drop, give <thing> to <person>, use <object>, eat <food>.',
  'Trade: list (what is for sale here), buy <thing> [amount], sell <thing> [amount], rent a room.',
  'Time: time, wait [minutes], sleep. At night: knock (on a door), wake <person>.',
  'Pace: tempo calm, tempo normal or tempo dramatic (how much happens in the world).',
  "Talking: talk <person>, ask <person> about <topic>, say <text> or 'text.",
  'You: sheet, create (make your character), level up, train <skill>, wield <weapon>, wear <armour>, devote to <patron>, pray, rite.',
  'Fights: strike, advance, step back, raise shield, use herbs, recall, talk, flee, surrender, end. HELP in a fight says more.',
  'Game: save, load, continue (exactly where you stopped), log [lines], log export, help.',
  'Dutch works too: kijk, pak, koop, praat met, vraag ... over ...',
].join('\n')

const text = (value: string): Output => ({ kind: 'text', text: value })
const error = (value: string): Output => ({ kind: 'error', text: value })

export function runCommand(host: CommandHost, command: Command): Output[] {
  const { world } = host
  switch (command.verb) {
    case '':
      return []
    case 'look':
      return [describeRoom(world)]
    case 'examine':
      return [examine(world, command.args.join(' '))]
    case 'go':
      return go(host, command.args)
    case 'exits': {
      const hex = hexOfId(world.state.player.location)
      const map = regionMap(world.content)
      return [text(hex && map ? waysLine(world, map, hex) : exitLine(world))]
    }
    case 'inventory':
      return [text(`You carry ${listItems(world.content, world.state.player.inventory)}, and ${formatMoney(world.state.player.money)}.`)]
    case 'take':
      return take(host, command.args)
    case 'drop':
      return drop(host, command.args)
    case 'give':
      return give(host, command.args)
    case 'list':
      return list(world)
    case 'buy':
      return buy(host, command.args)
    case 'sell':
      return sell(host, command.args)
    case 'rent':
      return rent(host)
    case 'use':
      return use(host, command.args)
    case 'eat':
      return eat(host, command.args)
    case 'sleep':
      return sleep(host)
    case 'wait': {
      const minutes = Math.min(600, Math.max(1, Number(command.args[0]) || 10))
      if (minutes >= 120) approve(world, 'long_wait')
      const seen = host.pass(minutes)
      return [...seen, text(`Time passes. It is ${clockText(world)}.`)]
    }
    case 'time':
      return [text(`It is ${clockText(world)}.`)]
    case 'tempo':
      return tempo(world, command.args[0])
    case 'wake':
      return wake(host, command.args)
    case 'knock':
      return knock(host, command.args)
    case 'help':
      return [{ kind: 'system', text: HELP }]
    default:
      return [error(`You can't "${command.raw}" here. Type HELP for a list of commands.`)]
  }
}

export function clockText(world: World): string {
  return new GameClock(world.now).format()
}

// ---------------------------------------------------------------- looking

export function describeRoom(world: World): Output {
  const hex = hexOfId(world.state.player.location)
  if (hex) return describeHex(world, hex)
  const location = world.location(world.state.player.location)
  const night = new GameClock(world.now).isNight
  const variant = [...location.variants].reverse().find((v) => world.state.flags?.[v.flag])
  const shown = variant ?? location.description
  const description = (night && shown.night ? shown.night : shown.day).trim()
  const lines = [location.name, description]
  const state = placeStateLine(world, location.id)
  if (state) lines.push(state)
  const ground = world.state.ground[location.id]
  if (ground && Object.keys(ground).length > 0) lines.push(`On the ground: ${listItems(world.content, ground)}.`)
  lines.push(exitLine(world))
  const people = world.npcsAt(location.id).map((id) => {
    const npc = world.npc(id)
    const activity = world.npcState(id).activity
    return activity && !['taking it easy', 'at home'].includes(activity) ? `${npc.short} (${activity})` : npc.short
  })
  if (people.length > 0) lines.push(`Here: ${people.join(', ')}.`)
  return { kind: 'room', text: lines.join('\n') }
}

export function exitLine(world: World): string {
  const exits = Object.keys(world.location(world.state.player.location).exits) as Direction[]
  const across = crossCountryLine(world, world.state.player.location)
  if (exits.length === 0) return across ?? 'There is no obvious way out.'
  return `Exits: ${exits.join(', ')}${across ? `\n${across}` : ''}`
}

function examine(world: World, target: string): Output {
  if (!target.trim()) return describeRoom(world)
  const here = world.state.player.location
  const npcId = findNpcHere(world, target)
  if (npcId) {
    const npc = world.npc(npcId)
    const activity = world.npcState(npcId).activity
    return text(`${npc.short}. ${npc.appearance}${activity ? ` ${capital(world.say('{they}', npcId))} ${isOrAre(npc)} ${activity}.` : ''}`)
  }
  const object = findObjectHere(world, target)
  if (object) {
    const state = world.objectState(here, object.instance.id)
    const notes = Object.entries(object.instance.state_text)
      .filter(([key]) => state[key.split('=')[0]!] === parseValue(key.split('=')[1]))
      .map(([, note]) => note)
    const uses = object.type.affordances.filter((a) => a.actors.includes('player')).map((a) => a.verb)
    const hint = uses.length > 0 ? ` (You could ${uses.map((u) => `USE ${(object.instance.name ?? object.type.name).toUpperCase()} ${u.toUpperCase()}`).join(' or ')}.)` : ''
    return text(`${object.instance.description ?? object.type.description}${notes.length ? ` ${notes.join(' ')}` : ''}${hint}`)
  }
  const inventory = world.state.player.inventory
  const ground = world.state.ground[here] ?? {}
  const item = matchItem(world.content, target, new Set([...Object.keys(inventory), ...Object.keys(ground)]))
  if (item) return text(world.content.items.get(item)!.description)
  return error(`You see no "${target}" here.`)
}

// ---------------------------------------------------------------- moving

function go(host: CommandHost, args: string[]): Output[] {
  const { world } = host
  const player = world.state.player
  const location = world.location(player.location)
  let direction = parseDirection(args[0])
  if (!direction && args.length > 0) {
    const wanted = args.join(' ').toLowerCase().replace(/^(the|to)\s+/, '')
    direction = (Object.entries(location.exits) as [Direction, { to: string }][]).find(([, exit]) => {
      const target = world.location(exit.to)
      return [target.name, ...target.aliases].some((name) => name.toLowerCase().includes(wanted))
    })?.[0]
  }
  if (!direction) return [error('Go where? Try a direction such as north, or the name of a place you can see.')]
  const exit = location.exits[direction]
  // Out on the land, or at the edge of a place, a direction is one hex that way (FO, chapter 4).
  if (!exit && (isHexId(player.location) || canSetOut(world, player.location)) && direction !== 'up' && direction !== 'down' && direction !== 'in' && direction !== 'out') {
    const result = walk(world, { kind: 'head', wind: direction, steps: 1 }, (minutes) => host.pass(minutes))
    if (Array.isArray(result)) return result
    return [...result.outputs.slice(1), describeRoom(world)]
  }
  if (!exit) return [error(`You can't go ${direction} from here.`)]
  const closed = closedBetween(world, player.location, exit.to)
  if (closed) return [error(`You can't go that way: ${closed}`)]
  const mist = widowTurnsBack(world, exit.to)
  if (mist) return [text(mist), ...host.pass(30)]
  if (shutForNight(world, exit.to)) return [text(`The door of ${world.location(exit.to).name} is shut for the night. KNOCK to wake whoever lives there.`)]
  player.location = exit.to
  const seen = host.pass(exit.minutes)
  return [describeRoom(world), ...seen]
}

// ---------------------------------------------------------------- doors and sleepers

function owners(world: World, location: string): string[] {
  return [...world.content.npcs.values()].filter((npc) => npc.home === location).map((npc) => npc.id)
}

/** Private homes are shut at night, except where the player has a room. */
export function shutForNight(world: World, location: string): boolean {
  const place = world.location(location)
  if (!place.tags.includes('private') || owners(world, location).length === 0) return false
  if (world.state.player.lodging?.location === location) return false
  return isNight(world.now)
}

function wake(host: CommandHost, args: string[]): Output[] {
  const { world } = host
  const npcId = findNpcHere(world, args.join(' '))
  if (!npcId) return [error(args.length ? `There is nobody called "${args.join(' ')}" here.` : 'Wake whom?')]
  if (world.npcState(npcId).activity !== 'asleep') return [text(`${callName(world.npc(npcId))} is awake.`)]
  wakeNpc(world, npcId)
  host.pass(1)
  return [{ kind: 'narration', text: world.say('You shake {name} by the shoulder. {name} wakes with a start and glares at you, bleary-eyed.', npcId) }]
}

function knock(host: CommandHost, args: string[]): Output[] {
  const { world } = host
  const here = world.location(world.state.player.location)
  const doors = (Object.entries(here.exits) as [Direction, { to: string }][]).filter(([, exit]) => world.location(exit.to).tags.includes('private') && owners(world, exit.to).length > 0)
  const wanted = args.join(' ').toLowerCase().replace(/^(on|at|the|door|of)\s+/g, '')
  const door = wanted ? doors.find(([dir, exit]) => dir === parseDirection(wanted) || world.location(exit.to).name.toLowerCase().includes(wanted)) : doors.length === 1 ? doors[0] : undefined
  if (!door) return [error(doors.length === 0 ? "There's no door to knock on here." : `Knock on which door? ${doors.map(([dir, exit]) => `${world.location(exit.to).name} (${dir})`).join(', ')}.`)]
  const home = door[1].to
  const inside = owners(world, home).filter((id) => world.npcState(id).location === home && !world.npc(id).child)
  host.pass(2)
  if (inside.length === 0) return [text(`You knock on the door of ${world.location(home).name}. Nobody answers.`)]
  const npcId = inside.sort()[0]!
  const npc = world.npcState(npcId)
  const asleep = npc.activity === 'asleep'
  if (asleep) wakeNpc(world, npcId)
  else if (isNight(world.now)) applyEffect(world, npcId, 'affinity', -1)
  // The one who answers stands in the doorway, on the player's side of it.
  npc.location = here.id
  npc.plan = []
  npc.busyUntil = world.now + 20
  npc.activity = 'standing in the doorway'
  npc.passing = false
  const line = asleep ? '{name} opens the door a crack after a long while, blinking at you.' : '{name} opens the door and looks out at you.'
  return [text(`You knock on the door of ${world.location(home).name}.`), { kind: 'narration', text: world.say(line, npcId) }]
}

// ---------------------------------------------------------------- things

function take(host: CommandHost, args: string[]): Output[] {
  const { world } = host
  const here = world.state.player.location
  const ground = world.state.ground[here] ?? {}
  const { qty, text: name } = splitQuantity(args)
  const item = matchItem(world.content, name, Object.keys(ground))
  if (!item) return [error(name ? `There is no "${name}" here to take.` : 'Take what?')]
  const amount = qty === 'all' ? ground[item]! : Math.min(qty, ground[item]!)
  add(ground, item, -amount)
  add(world.state.player.inventory, item, amount)
  return [text(`You pick up ${qtyName(world, item, amount)}.`)]
}

function drop(host: CommandHost, args: string[]): Output[] {
  const { world } = host
  const inventory = world.state.player.inventory
  const { qty, text: name } = splitQuantity(args)
  const item = matchItem(world.content, name, Object.keys(inventory))
  if (!item) return [error(name ? `You don't have "${name}".` : 'Drop what?')]
  const amount = qty === 'all' ? inventory[item]! : Math.min(qty, inventory[item]!)
  add(inventory, item, -amount)
  const here = world.state.player.location
  world.state.ground[here] ??= {}
  add(world.state.ground[here], item, amount)
  return [text(`You put down ${qtyName(world, item, amount)}.`)]
}

function give(host: CommandHost, args: string[]): Output[] {
  const { world } = host
  const joined = args.join(' ')
  const match = joined.match(/^(.*?)\s+(?:to|aan)\s+(.+)$/i)
  if (!match) return [error('Give what to whom? For example: give apple to mirte.')]
  const npcId = findNpcHere(world, match[2]!)
  if (!npcId) return [error(`There is nobody called "${match[2]}" here.`)]
  const inventory = world.state.player.inventory
  const { qty, text: name } = splitQuantity(match[1]!.split(/\s+/))
  const item = matchItem(world.content, name, Object.keys(inventory))
  if (!item) return [error(`You don't have "${name}".`)]
  const amount = qty === 'all' ? inventory[item]! : Math.min(qty, inventory[item]!)
  add(inventory, item, -amount)
  add(world.npcState(npcId).inventory, item, amount)
  world.emit('gift', world.state.player.location, `You give ${qtyName(world, item, amount)} to ${callName(world.npc(npcId))}.`)
  world.state.seenSeq = world.state.eventSeq
  const returned = giveBack(world, npcId, item) ?? fulfil(world, npcId, item, amount)
  if (!returned) {
    // A gift moves someone a little, less with every gift that week (FO, chapter 8).
    deed(world, npcId, 'gift', { amount: world.basePrice(item) * amount })
    approve(world, 'generosity')
    const receiver = callName(world.npc(npcId))
    recordFact(world, {
      kind: 'gift',
      about: [npcId],
      place: world.state.player.location,
      belang: 1,
      title: `the stranger's gift to ${receiver}`,
      text: {
        precise: `The stranger gave ${receiver} ${qtyName(world, item, amount)}.`,
        village: `The stranger has been giving things to ${receiver}.`,
        far: `That stranger hands out gifts, they say.`,
      },
    })
  }
  return [text(`You give ${qtyName(world, item, amount)} to ${firstName(world.npc(npcId))}.`), { kind: 'narration', text: returned ?? world.say('{name} takes it and nods {their} thanks.', npcId) }]
}

function eat(host: CommandHost, args: string[]): Output[] {
  const { world } = host
  const inventory = world.state.player.inventory
  const item = matchItem(world.content, args.join(' '), Object.keys(inventory))
  if (!item) return [error(args.length ? `You don't have "${args.join(' ')}".` : 'Eat what?')]
  if (!world.content.items.get(item)?.food) return [error(`You can't eat ${withArticle(itemName(world.content, item))}.`)]
  add(inventory, item, -1)
  const seen = host.pass(10)
  return [text(`You eat ${withArticle(itemName(world.content, item))}. It does you good.`), ...seen]
}

function sleep(host: CommandHost): Output[] {
  const { world } = host
  const player = world.state.player
  const hour = Math.floor((world.now - startOfDay(world.now)) / 60)
  const lodging = player.lodging
  const inRoom = lodging && world.now < lodging.until && premisesOf(world, lodging.location).includes(player.location)
  if (hour >= 8 && hour < 20) {
    const seen = host.pass(60)
    return [text(inRoom ? 'You doze for an hour in your room.' : 'You close your eyes for an hour. It is not a real rest.'), ...seen]
  }
  const nextMorning = startOfDay(world.now) + (hour >= 20 ? MINUTES_PER_DAY : 0) + 7 * 60
  const seen = host.pass(nextMorning - world.now)
  // A night's sleep heals (FO, chapter 11); sleeping rough heals too, but it is a cold night.
  rest(world, 0, true)
  restParty(world)
  const how = inRoom ? 'You sleep under a heavy quilt that smells of peat smoke.' : 'You sleep rough, and badly. The damp gets into your bones.'
  return [text(`${how} You wake at first light.`), ...seen.slice(-3), describeRoom(world)]
}

// ---------------------------------------------------------------- trade

function openServices(world: World): { service: Service; location: string }[] {
  const here = world.state.player.location
  const result: { service: Service; location: string }[] = []
  for (const location of world.content.locations.values()) {
    for (const service of location.services) {
      if (location.id === here || service.premises.includes(here)) result.push({ service, location: location.id })
    }
  }
  return result
}

function list(world: World): Output[] {
  const refused = refusedTrade(world, world.state.player.location)
  if (refused) return [error(refused)]
  const services = openServices(world)
  if (services.length === 0) return [error('Nobody sells anything here.')]
  return services.map(({ service, location }) => {
    const provider = firstName(world.npc(service.provider))
    if (!world.serviceOpen(location, service)) {
      if (isOpenAt(world.now, service.hours, service.days)) return text(`Nobody is minding ${provider}'s trade right now. Try again later.`)
      const [from, to] = parseHours(service.hours)
      return text(`${provider}'s trade is closed now. Hours: ${hhmm(from)} to ${hhmm(to)}${service.days ? `, ${service.days.join(', ')}` : ''}.`)
    }
    const stock = world.stock(location, service.id)
    const goods = Object.keys(service.sells).map((item) =>
      (stock[item] ?? 0) > 0 ? `${itemName(world.content, item)} ${formatMoney(world.price(location, service, item))} (${stock[item]} left)` : `${itemName(world.content, item)} (sold out)`,
    )
    const lines = [`${provider} sells: ${goods.length ? goods.join('; ') : 'nothing today'}.`]
    if (service.buys.length) lines.push(`${provider} buys: ${service.buys.map((i) => `${itemName(world.content, i)} for ${formatMoney(world.offer(i))}`).join('; ')}.`)
    if (service.lodging) lines.push(`A room for the night: ${formatMoney(service.lodging)} (RENT ROOM).`)
    return text(lines.join('\n'))
  })
}

function buy(host: CommandHost, args: string[]): Output[] {
  const { world } = host
  const refused = refusedTrade(world, world.state.player.location)
  if (refused) return [error(refused)]
  const { qty, text: name } = splitQuantity(args)
  const open = openServices(world).filter(({ service, location }) => world.serviceOpen(location, service))
  if (open.length === 0) return [error('There is nobody here to buy from right now.')]
  for (const { service, location } of open) {
    const item = matchItem(world.content, name, Object.keys(service.sells))
    if (!item) continue
    const stock = world.stock(location, service.id)
    const price = world.price(location, service, item)
    const wanted = qty === 'all' ? stock[item] ?? 0 : qty
    const amount = Math.min(wanted, stock[item] ?? 0)
    if (amount <= 0) return [error(`${firstName(world.npc(service.provider))} has no ${itemName(world.content, item, 2).replace(/^2 /, '')} left.`)]
    if (amount * price > world.state.player.money) return [error(`That costs ${formatMoney(amount * price)}. You have ${formatMoney(world.state.player.money)}.`)]
    world.state.player.money -= amount * price
    world.npcState(service.provider).money += amount * price
    add(stock, item, -amount)
    add(world.state.player.inventory, item, amount)
    const seen = host.pass(2)
    return [text(`You buy ${qtyName(world, item, amount)} from ${firstName(world.npc(service.provider))} for ${formatMoney(amount * price)}.`), ...seen]
  }
  return [error(name ? `Nobody here sells "${name}". Type LIST to see what is for sale.` : 'Buy what?')]
}

function sell(host: CommandHost, args: string[]): Output[] {
  const { world } = host
  const refused = refusedTrade(world, world.state.player.location)
  if (refused) return [error(refused)]
  const inventory = world.state.player.inventory
  const { qty, text: name } = splitQuantity(args)
  const item = matchItem(world.content, name, Object.keys(inventory))
  if (!item) return [error(name ? `You don't have "${name}".` : 'Sell what?')]
  const buyer = openServices(world).find(({ service, location }) => service.buys.includes(item) && world.serviceOpen(location, service))
  if (!buyer) return [error(`Nobody here wants to buy ${itemName(world.content, item, 2).replace(/^2 /, '')} right now.`)]
  const amount = qty === 'all' ? inventory[item]! : Math.min(qty, inventory[item]!)
  const provider = world.npcState(buyer.service.provider)
  const price = world.offer(item)
  const affordable = Math.min(amount, Math.floor(provider.money / price))
  if (affordable <= 0) return [error(`${firstName(world.npc(buyer.service.provider))} can't afford it.`)]
  add(inventory, item, -affordable)
  provider.money -= affordable * price
  world.state.player.money += affordable * price
  const stock = world.stock(buyer.location, buyer.service.id)
  if (item in buyer.service.sells) add(stock, item, affordable)
  const seen = host.pass(2)
  return [text(`You sell ${qtyName(world, item, affordable)} to ${firstName(world.npc(buyer.service.provider))} for ${formatMoney(affordable * price)}.`), ...seen]
}

function rent(host: CommandHost): Output[] {
  const { world } = host
  const inn = openServices(world).find(({ service, location }) => service.lodging && world.serviceOpen(location, service))
  if (!inn) return [error('There is no room to rent here, or nobody to rent it from.')]
  const price = inn.service.lodging!
  if (world.state.player.money < price) return [error(`A room costs ${formatMoney(price)}. You have ${formatMoney(world.state.player.money)}.`)]
  world.state.player.money -= price
  world.npcState(inn.service.provider).money += price
  const hour = Math.floor((world.now - startOfDay(world.now)) / 60)
  world.state.player.lodging = { location: inn.location, until: startOfDay(world.now) + (hour >= 6 ? MINUTES_PER_DAY : 0) + 12 * 60 }
  return [text(`You pay ${formatMoney(price)} for a room until noon tomorrow. Go up and SLEEP when you are ready.`)]
}

// ---------------------------------------------------------------- objects

function use(host: CommandHost, args: string[]): Output[] {
  const { world } = host
  const here = world.state.player.location
  const words = args.join(' ').toLowerCase()
  const candidates = world.location(here).objects.flatMap((instance) => {
    const type = world.content.objectTypes.get(instance.type)
    return type ? [{ instance, type }] : []
  })
  const object = candidates.find(({ instance, type }) => nameMatches(words, instance, type)) ?? (candidates.length === 1 && !words ? candidates[0] : undefined)
  if (!object) return [error(words ? `There is no "${words}" here to use.` : 'Use what?')]
  const usable = object.type.affordances.filter((a) => a.actors.includes('player'))
  const affordance = usable.find((a) => words.includes(a.verb)) ?? usable[0]
  if (!affordance) return [error(`You can't do much with the ${label(object.instance, object.type)}.`)]
  const problem = cannotUse(world, here, object.instance, affordance)
  if (problem) return [error(problem)]
  if (affordance.fee > 0 && object.instance.provider) {
    world.state.player.money -= affordance.fee
    world.npcState(object.instance.provider).money += affordance.fee
  }
  for (const [item, qty] of Object.entries(affordance.consumes)) add(world.state.player.inventory, item, -qty)
  for (const [item, qty] of Object.entries(affordance.produces)) add(world.state.player.inventory, item, qty)
  const seen = host.pass(affordance.duration)
  const produced = Object.entries(affordance.produces)
  const result = affordance.player_text ?? `You ${affordance.verb} at the ${label(object.instance, object.type)}.${produced.length ? ` You now have ${produced.map(([i, q]) => qtyName(world, i, q)).join(' and ')}.` : ''}`
  return [text(result), ...seen]
}

function cannotUse(world: World, here: string, instance: ObjectInstance, affordance: Affordance): string | undefined {
  const state = world.objectState(here, instance.id)
  if (!Object.entries(affordance.requires_state).every(([k, v]) => state[k] === v)) {
    return affordance.broken_text ?? `The ${instance.name ?? instance.type} can't be used right now.`
  }
  if (affordance.access !== 'public') {
    const owner = instance.owner ? firstName(world.npc(instance.owner)) : 'someone'
    return `That is ${owner}'s. You can't just use it.`
  }
  if (instance.provider && !world.objectOpen(here, instance)) return `Nobody is here to work it for you right now.`
  if (!hasAll(world.state.player.inventory, affordance.consumes)) {
    return `You need ${Object.entries(affordance.consumes).map(([i, q]) => qtyName(world, i, q)).join(' and ')} for that.`
  }
  if (affordance.fee > world.state.player.money) return `That costs ${formatMoney(affordance.fee)}.`
  return undefined
}

// ---------------------------------------------------------------- helpers

const TEMPOS: Record<string, Tempo> = { calm: 'calm', rustig: 'calm', normal: 'normal', gewoon: 'normal', dramatic: 'dramatic', dramatisch: 'dramatic' }
const TEMPO_WORDS: Record<Tempo, string> = { calm: 'calm: little happens', normal: 'normal', dramatic: 'dramatic: a lot happens' }

/** How much happens in the world (design: lore and world change, "Tempo en toeval"). */
function tempo(world: World, word: string | undefined): Output[] {
  const state = stories(world)
  const chosen = word ? TEMPOS[word.toLowerCase()] : undefined
  if (word && !chosen) return [error('Tempo is calm, normal or dramatic.')]
  if (chosen) state.tempo = chosen
  return [{ kind: 'system', text: `The pace of events is ${TEMPO_WORDS[state.tempo]}.${chosen ? '' : ' Type TEMPO CALM, TEMPO NORMAL or TEMPO DRAMATIC to change it.'}` }]
}

/** Anyone in the world by name, wherever they are: for the world builder. */
export function findNpcAnywhere(world: World, words: string): string | undefined {
  const wanted = words.trim().toLowerCase().replace(/^(the|de|het)\s+/, '')
  if (!wanted) return undefined
  const all = [...world.content.npcs.keys()].sort()
  return (
    all.find((id) => namesOf(world.npc(id)).some((name) => name === wanted)) ??
    all.find((id) => namesOf(world.npc(id)).some((name) => name.startsWith(wanted) || name.includes(` ${wanted}`)))
  )
}

export function findNpcHere(world: World, words: string): string | undefined {
  const wanted = words.trim().toLowerCase().replace(/^(the|de|het)\s+/, '')
  if (!wanted) return undefined
  const here = world.npcsAt(world.state.player.location)
  return (
    here.find((id) => namesOf(world.npc(id)).some((name) => name === wanted)) ??
    here.find((id) => namesOf(world.npc(id)).some((name) => name.startsWith(wanted) || name.includes(` ${wanted}`)))
  )
}

export function namesOf(npc: Npc): string[] {
  const first = npc.name.split(' ')[0] ?? npc.name
  return [npc.name, first, npc.short, npc.profession.replace(/_/g, ' '), ...npc.aliases].map((n) => n.toLowerCase())
}

function findObjectHere(world: World, words: string): { instance: ObjectInstance; type: ObjectType } | undefined {
  const wanted = words.trim().toLowerCase()
  for (const instance of world.location(world.state.player.location).objects) {
    const type = world.content.objectTypes.get(instance.type)
    if (type && nameMatches(wanted, instance, type)) return { instance, type }
  }
  return undefined
}

function nameMatches(words: string, instance: ObjectInstance, type: ObjectType): boolean {
  if (!words) return false
  const names = [instance.name, type.name, instance.id.replace(/_/g, ' '), ...type.aliases].filter(Boolean).map((n) => n!.toLowerCase())
  return names.some((name) => words.includes(name) || name.includes(words.split(' ')[0]!))
}

function premisesOf(world: World, location: string): string[] {
  const services = world.location(location).services.filter((s) => s.lodging)
  return [location, ...services.flatMap((s) => s.premises)]
}

function label(instance: ObjectInstance, type: ObjectType): string {
  return (instance.name ?? type.name).toLowerCase()
}

function firstName(npc: Npc): string {
  return callName(npc)
}

function capital(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function isOrAre(npc: Npc): string {
  return npc.pronoun === 'they' ? 'are' : 'is'
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function parseValue(value: string | undefined): string | number | boolean | undefined {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value !== undefined && /^\d+$/.test(value)) return Number(value)
  return value
}

