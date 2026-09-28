import { inSeason } from './content'
import { describeSelf, detailHere, lookThere, lookThing } from './looking'
import { force, openObject, passLock, takeFrom } from './social/access'
import { ownerOf, ownersHere } from './social/ownership'
import { returnLent } from './agreements'
import { crowdLines } from './growth/crowds'
import { blessed } from './rules/blessings'
import { ledgerOf, settlementAt } from './economy/ledger'
import { gainXp, playerCheck } from './rules/player'
import { GameClock, isOpenAt, MINUTES_PER_DAY, parseHours, startOfDay } from './clock'
import { callName, type Affordance, type Direction, type Npc, type ObjectInstance, type ObjectType, type Service } from './content'
import { add, hasAll, itemName, listItems, matchItem, withArticle } from './items'
import { applyEffect } from './dialogue/relations'
import { canSetOut, crossCountryLine, describeHex, hexOfId, isHexId, walk, waysLine } from './map/travel'
import { regionMap } from './map/region'
import { factById, recordFact } from './news'
import { chatsAt } from './chatter'
import { fulfil } from './requests'
import { giveBack, stories, type Tempo } from './stories'
import { isNight, qtyName, wakeNpc } from './npc/execute'
import { parseDirection, splitQuantity, type Command } from './parser'
import type { World } from './world'
import { nightOut, rest } from './rules/player'
import { widowTurnsBack } from './quests/antagonists'
import { ONCE, useBlessing } from './rules/blessings'
import { closedBetween, placeStateLine } from './quests/plans'
import { active } from './quests/engine'
import { approve, restParty } from './social/companions'
import { deed } from './social/deeds'
import { recognisedSale, refusedTrade, returnStolen } from './social/crime'

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
  /** Passes up to so many minutes, and stops early when stop() says so (M9.4: WAIT ends when someone you need comes by). */
  passUntil?(minutes: number, stop: () => string | undefined): Output[]
}

const HELP = [
  'Moving: north, south, east, west, up, down, in, out (n, s, e, w, ...). Also: go <place>, exits.',
  'Across country: head <direction>, walk to <place>, follow <the tow path, the road, the fen path>. Map: map.',
  'Looking: look (l), examine <thing or person> (x).',
  'Things: inventory (i), take, drop, give <thing> to <person>, use <object>, eat <food>, open <chest>, take <thing> from <chest>, force <door or chest>. In a talk: ask <person> for <thing>.',
  'Trade: list (what is for sale here), buy <thing> [amount], sell <thing> [amount], rent a room.',
  'Work: work (for a day\'s pay), invest <amount>, loads (what there is to carry from here), haul <goods> to <place>, deliver.',
  'Time: time, wait [minutes], wait for <person>, sleep. At night: knock (on a door), wake <person>.',
  'Pace: tempo calm, tempo normal or tempo dramatic (how much happens in the world).',
  "Talking: talk <person>, ask <person> about <topic>, say <text> or 'text.",
  'You: sheet, create (make your character), level up, train <skill>, wield <weapon>, wear <armour>, devote to <patron>, pray, rite. Your word and theirs: promises.',
  'Fights: strike, advance, step back, raise shield, use herbs, recall, talk, flee, surrender, end. HELP in a fight says more.',
  'Game: save, load, continue (exactly where you stopped), new stranger (the same world, a new character), years later (a new game with the old one as legend), log [lines], log export, help.',
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
      return [text(`You carry ${listItems(world.content, world.state.player.inventory)}, and ${world.money(world.state.player.money)}.`)]
    case 'take': {
      // TAKE <thing> FROM <chest> (M10.3): from an open chest; someone else's is theirs.
      const from = /^(.+?)\s+(?:from|out of|uit)\s+(.+)$/i.exec(command.args.join(' '))
      if (from && !findNpcHere(world, from[2]!)) return takeFrom(world, from[1]!, from[2]!)
      return each(command.args, (a) => take(host, a))
    }
    case 'open':
      return openObject(world, command.args.join(' '))
    case 'force': {
      const direction = parseDirection(command.args[0])
      const out = force(world, command.args.join(' '), direction)
      host.pass(5)
      return out
    }
    case 'drop':
      return each(command.args, (a) => drop(host, a))
    case 'give':
      return give(host, command.args)
    case 'list':
      return list(world)
    case 'buy':
      return each(command.args, (a) => buy(host, a))
    case 'sell':
      // SELL ALL: whatever someone here buys (M10.4).
      if (command.args.length === 1 && /^(all|everything|alles)$/i.test(command.args[0]!)) {
        const buys = new Set(openServices(world).filter(({ service, location }) => world.serviceOpen(location, service)).flatMap(({ service }) => service.buys))
        const sellable = Object.keys(world.state.player.inventory).filter((i) => buys.has(i) && (world.state.player.inventory[i] ?? 0) > 0).sort()
        if (!sellable.length) return [error('Nobody here buys anything you carry.')]
        return sellable.flatMap((i) => sell(host, ['all', ...itemName(world.content, i, 1).split(' ')]))
      }
      return each(command.args, (a) => sell(host, a))
    case 'rent':
      return rent(host)
    case 'use':
      return use(host, command.args)
    // WORK [at <object>] (M8.5): an object's work for pay, as USE with the verb.
    case 'work':
      return use(host, ['work', ...command.args])
    case 'eat':
      return eat(host, command.args)
    case 'sleep':
      return sleep(host)
    case 'wait': {
      // WAIT FOR SIJBRAND (M9.4): up to ten hours, until that one is here.
      if (/^(for|op)$/i.test(command.args[0] ?? '') && command.args.length > 1) {
        const who = findNpcAnywhere(world, command.args.slice(1).join(' '))
        if (!who) return [error(`Wait for whom? Nobody called "${command.args.slice(1).join(' ')}".`)]
        // Here and awake: someone asleep here is waited for until they wake.
        const ready = () => world.npcsAt(world.state.player.location).includes(who) && world.npcState(who).activity !== 'asleep'
        if (ready()) return [text(`${callName(world.npc(who))} is here.`)]
        const name = callName(world.npc(who))
        const seen = host.passUntil ? host.passUntil(600, () => (ready() ? `${name} is here.` : undefined)) : host.pass(600)
        const came = ready()
        return [...seen, text(came ? `It is ${clockText(world)}.` : `${name} has not come. It is ${clockText(world)}.`)]
      }
      // WAIT 30, WAIT 3 HOURS: minutes unless an hour is named, at most ten hours at a time.
      const amount = Number(command.args[0]) || 10
      const minutes = Math.min(600, Math.max(1, /^(h|hrs?|hours?|uur|uren)$/i.test(command.args[1] ?? '') ? amount * 60 : amount))
      if (minutes >= 120) approve(world, 'long_wait')
      // Someone a quest of yours needs comes by: you stop waiting (found in the M9.4 playtest: the widow came
      // home, looked the stranger over and left again, all within one wait).
      const here = world.state.player.location
      const before = new Set(world.npcsAt(here))
      const needed = questPeople(world)
      const seen = host.passUntil
        ? host.passUntil(minutes, () => {
            const come = world.npcsAt(world.state.player.location).filter((id) => !before.has(id) && needed.has(id) && world.npcState(id).activity !== 'asleep')
            return come.length ? `${come.map((id) => callName(world.npc(id))).join(' and ')} ${come.length === 1 ? 'is' : 'are'} here. You stop waiting.` : undefined
          })
        : host.pass(minutes)
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
  return world.date()
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
  lines.push(...crowdLines(world, location.id))
  lines.push(...chatsAt(world, location.id))
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
  // LOOK ME (M10.4): yourself, as others see you.
  if (/^(me|myself|self|yourself|mij|mezelf|mijzelf)$/i.test(target.trim())) return describeSelf(world)
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
    // Notices on a board (M8.1): whoever looks at it reads them.
    const pinned = object.type.id === 'notice_board' ? (world.state.boards?.[here] ?? []).map((id) => factById(world, id)).filter((f) => f !== undefined) : []
    for (const f of pinned) {
      ;((world.state.news!.heard['player'] ??= {})[f.id] ??= { level: 3, reliability: 1, from: 'board', t: world.now })
      ;(world.state.player.journal ??= {})[f.id] ??= world.now
    }
    const read = pinned.length ? ` Among the notes, newer than the rest: ${pinned.map((f) => `"${f.text.precise}"`).join(' ')}` : ''
    return text(`${object.instance.description ?? object.type.description}${notes.length ? ` ${notes.join(' ')}` : ''}${read}${hint}`)
  }
  // What belongs to an object here comes first (the apple on the stone), then what you carry and what lies here, with where (M10.4).
  const thing = lookThing(world, target)
  if (thing) return thing
  // LOOK SOUTH, LOOK AT THE TIDEPOOLS: what lies that way (M10.4).
  const there = lookThere(world, target)
  if (there) return there
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
  // A locked door opens with its key (M10.3).
  const lock = passLock(world, player.location, direction, exit.lock)
  if (!lock.ok) return [error(lock.text!)]
  const mist = widowTurnsBack(world, exit.to)
  if (mist) return [text(mist), ...host.pass(30)]
  if (shutForNight(world, exit.to)) return [text(`The door of ${world.location(exit.to).name} is shut for the night. KNOCK to wake whoever lives there.`)]
  player.location = exit.to
  const seen = host.pass(exit.minutes)
  return [...(lock.text ? [text(lock.text)] : []), describeRoom(world), ...seen]
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
  // TAKE ALL, GET EVERYTHING (M9.4): what lies here, all of it. The first thing a stranded player types.
  // What lies in someone's home is theirs (M10.3): not for the taking.
  const owner = ownerOf(world, here)
  if (owner.kind === 'household' || owner.kind === 'person') {
    const whose = callName(world.npc(owner.id!))
    const present = ownersHere(world, owner)
    const all = args.length === 1 && /^(all|everything|alles)$/i.test(args[0]!)
    const { text: wanted } = splitQuantity(args)
    const thing = all ? undefined : matchItem(world.content, wanted, Object.keys(ground))
    if (all || thing) {
      const what = thing ? `the ${itemName(world.content, thing, 1)}` : 'what lies here'
      return [error(present.length ? `That is ${whose}'s. Ask ${present.length && world.npc(present[0]!).pronoun === 'she' ? 'her' : world.npc(present[0]!).pronoun === 'he' ? 'him' : 'them'} for it (ASK ${callName(world.npc(present[0]!)).toUpperCase()} FOR ${thing ? itemName(world.content, thing, 1).toUpperCase() : 'IT'}), or STEAL it.` : `${what.charAt(0).toUpperCase()}${what.slice(1)} belongs to ${whose}'s household. STEAL it, if that is what you mean to do.`)]
    }
  }
  if (args.length === 1 && /^(all|everything|alles)$/i.test(args[0]!)) {
    const items = Object.keys(ground).filter((i) => (ground[i] ?? 0) > 0).sort()
    if (!items.length) return [error('There is nothing here to take.')]
    const taken = items.map((i) => {
      const n = ground[i]!
      add(ground, i, -n)
      add(world.state.player.inventory, i, n)
      return qtyName(world, i, n)
    })
    return [text(`You pick up ${taken.length > 1 ? `${taken.slice(0, -1).join(', ')} and ${taken.at(-1)}` : taken[0]}.`)]
  }
  const { qty, text: name } = splitQuantity(args)
  const item = matchItem(world.content, name, Object.keys(ground).filter((i) => (ground[i] ?? 0) > 0))
  // Something that belongs to an object here (M10.4): its own line, not "there is no apple here".
  const detail = item ? undefined : detailHere(world, name)
  if (detail) return [text(detail.take ?? `That belongs where it is. You leave it.`)]
  if (!item) return [error(name ? `There is no "${name}" here to take.` : 'Take what?')]
  const amount = qty === 'all' ? ground[item]! : Math.min(qty, ground[item]!)
  add(ground, item, -amount)
  add(world.state.player.inventory, item, amount)
  return [text(`You pick up ${qtyName(world, item, amount)}.`)]
}

/**
 * "cask, sailcloth and rope" (M10.4): several things in one command, each on
 * its own; one thing as before.
 */
function each(args: string[], one: (args: string[]) => Output[]): Output[] {
  const joined = args.join(' ')
  if (!/,|\s(and|en)\s/i.test(joined)) return one(args)
  const parts = joined.split(/\s*,\s*(?:and\s+|en\s+)?|\s+(?:and|en)\s+/i).map((p) => p.trim()).filter(Boolean)
  return parts.length > 1 ? parts.flatMap((p) => one(p.split(/\s+/))) : one(args)
}

function drop(host: CommandHost, args: string[]): Output[] {
  const { world } = host
  const inventory = world.state.player.inventory
  // DROP ALL (M10.4): everything carried, but not what you hold or wear.
  if (args.length === 1 && /^(all|everything|alles)$/i.test(args[0]!)) {
    const gear = world.state.player.character?.gear
    const worn = new Set([gear?.weapon, gear?.armour, gear?.shield].filter(Boolean))
    const items = Object.keys(inventory).filter((i) => (inventory[i] ?? 0) > 0 && !worn.has(i)).sort()
    if (!items.length) return [error('You carry nothing to put down.')]
    const here = world.state.player.location
    world.state.ground[here] ??= {}
    const names = items.map((i) => {
      const n = inventory[i]!
      add(inventory, i, -n)
      add(world.state.ground[here]!, i, n)
      return qtyName(world, i, n)
    })
    return [text(`You put down ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}.`)]
  }
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
  const returned = returnStolen(world, npcId, item) ?? returnLent(world, npcId, item) ?? giveBack(world, npcId, item) ?? fulfil(world, npcId, item, amount)
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
  const inRoom = (lodging && world.now < lodging.until && premisesOf(world, lodging.location).includes(player.location)) || (player.home !== undefined && player.location === player.home)
  if (hour >= 8 && hour < 20) {
    const seen = host.pass(60)
    return [text(inRoom ? 'You doze for an hour in your room.' : 'You close your eyes for an hour. It is not a real rest.'), ...seen]
  }
  const nextMorning = startOfDay(world.now) + (hour >= 20 ? MINUTES_PER_DAY : 0) + 7 * 60
  const seen = host.pass(nextMorning - world.now)
  // A night's sleep heals (FO, chapter 11); sleeping rough heals too, but it is a cold night.
  rest(world, 0, true)
  restParty(world)
  const home = player.home && player.location === player.home
  if (home) player.homeNight = world.now
  // A night out in the fen, with no roof: the damp may bring Fen Fever.
  const tags = world.content.locations.get(player.location)?.tags ?? ['wilderness']
  const fever = !inRoom && (tags.includes('wilderness') || tags.includes('edge') || isHexId(player.location)) ? nightOut(world) : []
  const how = home ? 'You sleep at home, in your own bed, and it smells of peat smoke and of the one you married.' : inRoom ? 'You sleep under a heavy quilt that smells of peat smoke.' : 'You sleep rough, and badly. The damp gets into your bones.'
  return [text(`${how} You wake at first light.`), ...fever, ...goldAtTheWell(world), ...seen.slice(-3), describeRoom(world)]
}

/** Gold at the Well (Mother Holle): once a season, a reward when you wake, gold or a dream that teaches. */
function goldAtTheWell(world: World): Output[] {
  const c = world.state.player.character
  if (!useBlessing(world.content, c, 'Gold at the Well', world.now, ONCE.season)) return []
  const unknown = [...world.content.topics.values()].filter((t) => t.kind === 'lore' && world.state.player.journal?.[t.id] === undefined).sort((a, b) => a.id.localeCompare(b.id))
  const dream = unknown.length && world.rng.next('blessing') < 0.5 ? unknown[world.rng.int('blessing', 0, unknown.length - 1)] : undefined
  if (dream) {
    ;(world.state.player.journal ??= {})[dream.id] = world.now
    return [{ kind: 'narration', text: `You dreamt of an old woman shaking out her featherbed, and snow falling, and in the snow a story: ${dream.summary} It is in your journal.` }]
  }
  world.state.player.money += 160
  return [{ kind: 'narration', text: 'When you wake there is a guilder in your shoe, bright as if it came out of a well.' }]
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
      (stock[item] ?? 0) > 0 ? `${itemName(world.content, item)} ${world.money(world.price(location, service, item))} (${stock[item]} left)` : `${itemName(world.content, item)} (sold out)`,
    )
    const lines = [`${provider} sells: ${goods.length ? goods.join('; ') : 'nothing today'}.`]
    if (service.buys.length) lines.push(`${provider} buys: ${service.buys.map((i) => `${itemName(world.content, i)} for ${world.money(world.offer(i))}`).join('; ')}.`)
    if (service.lodging) lines.push(`A room for the night: ${world.money(service.lodging)} (RENT ROOM).`)
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
    if (amount * price > world.state.player.money) return [error(`That costs ${world.money(amount * price)}. You have ${world.money(world.state.player.money)}.`)]
    world.state.player.money -= amount * price
    world.npcState(service.provider).money += amount * price
    add(stock, item, -amount)
    add(world.state.player.inventory, item, amount)
    const seen = host.pass(2)
    return [text(`You buy ${qtyName(world, item, amount)} from ${firstName(world.npc(service.provider))} for ${world.money(amount * price)}.`), ...seen]
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
  // A stolen thing offered to someone who knows whose it is (M10.3): not sold, recognised.
  const recognised = recognisedSale(world, buyer.service.provider, item)
  if (recognised) return recognised
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
  return [text(`You sell ${qtyName(world, item, affordable)} to ${firstName(world.npc(buyer.service.provider))} for ${world.money(affordable * price)}.`), ...seen]
}

function rent(host: CommandHost): Output[] {
  const { world } = host
  const inn = openServices(world).find(({ service, location }) => service.lodging && world.serviceOpen(location, service))
  if (!inn) return [error('There is no room to rent here, or nobody to rent it from.')]
  const price = inn.service.lodging!
  if (world.state.player.money < price) return [error(`A room costs ${world.money(price)}. You have ${world.money(world.state.player.money)}.`)]
  world.state.player.money -= price
  world.npcState(inn.service.provider).money += price
  const hour = Math.floor((world.now - startOfDay(world.now)) / 60)
  world.state.player.lodging = { location: inn.location, until: startOfDay(world.now) + (hour >= 6 ? MINUTES_PER_DAY : 0) + 12 * 60 }
  return [text(`You pay ${world.money(price)} for a room until noon tomorrow. Go up and SLEEP when you are ready.`)]
}

// ---------------------------------------------------------------- objects

function use(host: CommandHost, args: string[]): Output[] {
  const { world } = host
  const here = world.state.player.location
  const words = args.join(' ').toLowerCase()
  // A remedy of your own: herbs for Fen Fever, a bandage for bleeding (M7.2).
  const remedy = matchItem(world.content, words, Object.keys(world.state.player.inventory))
  const cure = remedy ? world.content.items.get(remedy)?.remedy : undefined
  const c = world.state.player.character
  if (remedy && cure && c) {
    add(world.state.player.inventory, remedy, -1)
    const cured = cure.cures.filter((name) => c.conditions[name])
    for (const name of cured) delete c.conditions[name]
    const seen = host.pass(10)
    return [text(`You use ${withArticle(itemName(world.content, remedy))}.${cured.length ? ` It helps: no more ${cured.map((n) => n.replace(/_/g, ' ')).join(' or ')}.` : ' You feel a little better, if only in spirit.'}`), ...seen]
  }
  const candidates = world.location(here).objects.flatMap((instance) => {
    const type = world.content.objectTypes.get(instance.type)
    return type ? [{ instance, type }] : []
  })
  const verbHere = (type: ObjectType) => type.affordances.some((a) => a.actors.includes('player') && words.split(/\s+/).includes(a.verb))
  const object = candidates.find(({ instance, type }) => nameMatches(words, instance, type)) ?? (candidates.length === 1 && !words ? candidates[0] : undefined) ?? candidates.find(({ type }) => verbHere(type))
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
  if (affordance.wage) return workForPay(host, object.instance, object.type, affordance)
  for (const [item, qty] of Object.entries(affordance.consumes)) add(world.state.player.inventory, item, -qty)
  for (const [item, qty] of Object.entries(affordance.produces)) add(world.state.player.inventory, item, qty)
  const seen = host.pass(craftTime(world, affordance))
  const produced = Object.entries(affordance.produces)
  const result = affordance.player_text ?? `You ${affordance.verb} at the ${label(object.instance, object.type)}.${produced.length ? ` You now have ${produced.map(([i, q]) => qtyName(world, i, q)).join(' and ')}.` : ''}`
  return [text(result), ...seen]
}

/**
 * Work for pay (M8.5): a day at the peat cuttings or the brick kiln. A check
 * of the player's decides how much gets done; the owner pays for what was
 * done, and it goes into the store of the settlement (or the owner's hands).
 * Done well, it is practice: experience.
 */
function workForPay(host: CommandHost, instance: ObjectInstance, type: ObjectType, affordance: Affordance): Output[] {
  const { world } = host
  const here = world.state.player.location
  const payer = instance.provider ?? instance.owner
  const result = affordance.check ? playerCheck(world, affordance.check.skill, affordance.check.dc) : undefined
  const well = !result || result.degree === 'success' || result.degree === 'critical success'
  const share = well ? 1 : 0.5
  const seen = host.pass(craftTime(world, affordance))
  const store = settlementAt(world, here) ? ledgerOf(world, settlementAt(world, here)!.id) : undefined
  for (const [item, qty] of Object.entries(affordance.produces)) {
    const made = Math.floor(qty * share)
    if (store) store.stock[item] = (store.stock[item] ?? 0) + made
    else if (payer) add(world.npcState(payer).inventory, item, made)
  }
  const owed = Math.round(affordance.wage! * share)
  const purse = payer ? world.npcState(payer) : undefined
  const paid = purse ? Math.min(owed, Math.max(0, purse.money)) : store ? Math.min(owed, store.purse) : 0
  if (purse) purse.money -= paid
  else if (store) store.purse -= paid
  world.state.player.money += paid
  if (well && affordance.xp) gainXp(world, affordance.xp, `a day's ${affordance.label}`)
  const who = payer ? firstName(world.npc(payer)) : 'they'
  const done = affordance.player_text ?? `You work at the ${label(instance, type)} until the light goes.`
  const how = result ? (well ? ' It goes well.' : ' It goes badly; you get half done.') : ''
  const pay = paid ? ` ${payer ? who : 'They'} pay${payer ? 's' : ''} you ${world.money(paid)}.` : ` There is no money to pay you today.`
  return [text(`${done}${how}${pay}`), ...seen]
}

/** How long the player's work takes: craft work (something is made) a quarter less with Busy Hands, Vrouw Holle's blessing (M9.1). */
function craftTime(world: World, affordance: Affordance): number {
  const crafts = Object.keys(affordance.produces).length > 0
  return crafts && blessed(world.content, world.state.player.character, 'Busy Hands') ? Math.round(affordance.duration * 0.75) : affordance.duration
}

function cannotUse(world: World, here: string, instance: ObjectInstance, affordance: Affordance): string | undefined {
  const state = world.objectState(here, instance.id)
  if (!inSeason(affordance, new GameClock(world.now).parts.month)) return `Not in ${world.calendar.months[new GameClock(world.now).parts.month - 1] ?? 'this month'}: that is done in ${affordance.months!.map((m) => world.calendar.months[m - 1]).join(', ')}.`
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
  if (affordance.fee > world.state.player.money) return `That costs ${world.money(affordance.fee)}.`
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
  // By id too (M10): @where npc_haakman, or @where haakman.
  if (world.content.npcs.has(wanted)) return wanted
  if (world.content.npcs.has(`npc_${wanted}`)) return `npc_${wanted}`
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


/** The people the player's quests need now: givers, helpers, opponents, and whoever an action is to be done with. */
function questPeople(world: World): Set<string> {
  const ids = new Set<string>()
  for (const [quest] of active(world)) for (const id of [...quest.givers, ...(quest.helpers ?? []), ...(quest.opponents ?? []), ...(quest.actions ?? []).map((a) => a.with).filter((w): w is string => Boolean(w))]) ids.add(id)
  return ids
}
