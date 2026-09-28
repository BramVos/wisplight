import { lookSky } from './weather'
import { publicShort } from './acquaintance'
import { inSeason } from './content'
import { describeSelf, descriptionNow, detailHere, lookThere, lookThing, sceneryHere } from './looking'
import { choose, MAX_OPTIONS, offer, type ChoiceOption } from './choice'
import { force, objectHere, openObject, passLock, pick, takeFrom } from './social/access'
import { craftCheck, craftOf, craftProgress, craftRank, craftTitle, interruption, learnFrom, ownWorkBonus, rankIndex, soldOwn, workplaceLeave } from './crafts'
import { gather, searchHere, track, treat } from './skills'
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
import { parseCommand, parseDirection, splitQuantity, type Command } from './parser'
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

export type OutputKind = 'room' | 'text' | 'system' | 'error' | 'narration' | 'speech' | 'check' | 'card'

/**
 * A moment (M10.11): a card over the log for what deserves more than a line.
 * Arriving at a place worth it, seeing it rise from afar, a tiding that
 * changes things. The text of the output is the same, for the log and the
 * terminal; the interface shows the card.
 */
export interface Card {
  kind: 'arrival' | 'sighting' | 'tidings'
  title: string
  text: string
  /** The place a picture is of, when there is one. */
  picture?: string
  /** A page of the journal it leads to. */
  link?: string
  /** Who it came from: a tiding heard. */
  from?: string
}

export interface Output {
  kind: OutputKind
  text: string
  /**
   * Speech only (M10.8): from the model, or the game's own (a set line, a greeting, a stock line standing in). Set
   * only when a model is in play; without one every line is the game's own and nothing needs telling apart.
   */
  source?: 'model' | 'rules'
  /** A moment (M10.11), for kind card. */
  card?: Card
  /** A journey told in one paragraph (M10.11): with a model, the narrator may reword it. */
  journey?: boolean
}

export interface CommandHost {
  world: World
  pass(minutes: number): Output[]
  /** A place the stranger knows of but does not see from here (M10.8): what they know of it, and which way it lies. */
  knownPlace?(target: string): string | undefined
  /** Passes up to so many minutes, and stops early when stop() says so (M9.4: WAIT ends when someone you need comes by). */
  passUntil?(minutes: number, stop: () => string | undefined): Output[]
}

const HELP = [
  'Moving: north, south, east, west, up, down, in, out (n, s, e, w, ...). Also: go <place>, exits.',
  'Across country: head <direction>, walk to <place>, follow <the tow path, the road, the fen path>. Map: map.',
  'Looking: look (l), examine <thing or person> (x).',
  'Things: inventory (i), take, drop, give <thing> to <person>, use <object>, eat <food>, open <chest>, take <thing> from <chest>, pick <door or chest> (the lock), force <door or chest>. In a talk: ask <person> for <thing>.',
  'Crafts and skills: use <workplace> [what to make] (USE OVEN BAKE), treat <person or me>, gather [what], track <person>, search (here), read <inscription>. In a talk with a craftsman: teach me.',
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
  // DRINK MILK, CLIMB OAK (after the M10 playtest): a thing of this place with its own line for the verb.
  const own = detailVerb(world, command)
  if (own) return [text(own)]
  switch (command.verb) {
    case '':
      return []
    case 'look':
      return [describeRoom(world)]
    case 'examine':
      return examine(host, command.args.join(' '))
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
      // A chest named after its owner is the chest, even with the owner standing by (M10.5).
      if (from && (objectHere(world, from[2]!) || !findNpcHere(world, from[2]!))) return takeFrom(world, from[1]!, from[2]!)
      return each(command.args, (a) => take(host, a))
    }
    case 'open':
      return openObject(world, command.args.join(' '))
    // PICK <door or chest> (M10.5): the lock; PICK <thing> is still taking it.
    case 'pick': {
      const direction = parseDirection(command.args[0])
      const out = pick(world, command.args.join(' '), direction)
      if (!out) return each(command.args, (a) => take(host, a))
      host.pass(10)
      return out
    }
    // The other skills (M10.5): TREAT, GATHER, TRACK, SEARCH.
    case 'treat': {
      const words = command.args.join(' ')
      return treat(host, words, words && !/^(me|myself|self|mezelf|mij)$/i.test(words) ? findNpcHere(world, words) : undefined)
    }
    case 'gather':
      return gather(host, command.args.join(' '))
    case 'track': {
      const words = command.args.join(' ').replace(/^(down\s+)?/i, '')
      return track(host, words, words ? findNpcAnywhere(world, words) : undefined)
    }
    case 'search':
      return searchHere(host)
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
    default: {
      // Any other verb on a thing the description names: it stays as it is (after the M10 playtest).
      const words = command.args.join(' ')
      const thing = words ? (detailHere(world, words)?.name ?? sceneryHere(world, words)?.name) : undefined
      if (thing) return [text(`You think better of it, and leave ${thing} be.`)]
      return [error(`You can't "${command.raw}" here. Type HELP for a list of commands.`)]
    }
  }
}

/** The line a thing of this place has for this verb (DRINK MILK), if it has one. */
export function detailVerb(world: World, command: Command): string | undefined {
  if (!command.args.length || ['look', 'examine', 'take', 'go'].includes(command.verb)) return undefined
  const verbs = detailHere(world, command.args.join(' '))?.verbs
  if (!verbs) return undefined
  const said = command.raw.trim().split(/\s+/)[0]!.toLowerCase()
  return verbs[command.verb] ?? verbs[said]
}

/** Nested runs of a picked option: one is enough, so a choice never loops. */
let picking = 0

/**
 * What a command is about (after the M10 playtest): the one option that fits
 * is done at once; otherwise the options, numbered, after the line for what
 * was not found; with no options, only that line.
 */
function pickOrOffer(host: CommandHost, words: string, question: string, options: ChoiceOption[], missing: string): Output[] {
  if (!options.length) return [error(missing)]
  const picked = choose(host.world, words, question, options, missing)
  if ('run' in picked && picking === 0) {
    picking++
    try {
      return runCommand(host, parseCommand(picked.run))
    } finally {
      picking--
    }
  }
  const shown = 'show' in picked ? picked.show : offer(host.world, question, options)
  // Some options fit the words: they are the answer, not a miss.
  const narrowed = (host.world.state.choice?.options.length ?? 0) < Math.min(options.length, MAX_OPTIONS)
  return words && !narrowed ? [error(missing), ...shown] : shown
}

export function clockText(world: World): string {
  return world.date()
}

// ---------------------------------------------------------------- looking

export function describeRoom(world: World): Output {
  const hex = hexOfId(world.state.player.location)
  if (hex) return describeHex(world, hex)
  const location = world.location(world.state.player.location)
  const lines = [location.name, descriptionNow(world, location)]
  const state = placeStateLine(world, location.id)
  if (state) lines.push(state)
  const ground = world.state.ground[location.id]
  if (ground && Object.keys(ground).length > 0) lines.push(`On the ground: ${listItems(world.content, ground)}.`)
  lines.push(exitLine(world))
  const people = world.npcsAt(location.id).map((id) => {
    const activity = world.npcState(id).activity
    const short = publicShort(world, id)
    return activity && !['taking it easy', 'at home'].includes(activity) ? `${short} (${activity})` : short
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

function examine(host: CommandHost, target: string): Output[] {
  const { world } = host
  const found = examineHere(world, target)
  if (found) return [found]
  // The sky (M10.8): the weather and the wind, and what is coming, for who can read it.
  if (/^(?:at\s+)?(?:the\s+)?(?:sky|weather|clouds|heavens|lucht|wind)$/i.test(target.trim())) return [text(lookSky(world))]
  // A place the stranger knows of, out of sight (M10.8): Graafhaven from the tow path, before the sentence that names it.
  const known = target.trim() ? host.knownPlace?.(target) : undefined
  if (known) return [text(known)]
  // What the description names (after the M10 playtest): the sentence it is in.
  const scenery = sceneryHere(world, target)
  if (scenery) return [text(scenery.sentence)]
  return pickOrOffer(host, target, 'Look at what?', lookOptions(world), `You see no "${target}" here.`)
}

/** What you could look at here: who is here, the objects, the things the description names, what lies here. */
function lookOptions(world: World): ChoiceOption[] {
  const here = world.state.player.location
  const place = world.content.locations.get(here)
  const people = world.npcsAt(here).map((id) => callName(world.npc(id)))
  const objects = world.location(here).objects.flatMap((o) => {
    const type = world.content.objectTypes.get(o.type)
    return type ? [label(o, type)] : []
  })
  const details = [...(place?.details ?? []), ...world.location(here).objects.flatMap((o) => world.content.objectTypes.get(o.type)?.details ?? [])].map((d) => d.words[0]!)
  const ground = Object.keys(world.state.ground[here] ?? {}).filter((i) => (world.state.ground[here]![i] ?? 0) > 0).map((i) => itemName(world.content, i, 1))
  return [...new Set([...people, ...objects, ...details, ...ground])].map((name) => ({ label: name, command: `look ${name}` }))
}

function examineHere(world: World, target: string): Output | undefined {
  if (!target.trim()) return describeRoom(world)
  // LOOK ME (M10.4): yourself, as others see you.
  if (/^(me|myself|self|yourself|mij|mezelf|mijzelf)$/i.test(target.trim())) return describeSelf(world)
  const here = world.state.player.location
  const npcId = findNpcHere(world, target)
  if (npcId) {
    const npc = world.npc(npcId)
    const activity = world.npcState(npcId).activity
    return text(`${publicShort(world, npcId)}. ${npc.appearance}${activity ? ` ${capital(world.say('{they}', npcId))} ${isOrAre(npc)} ${activity}.` : ''}`)
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
  return lookThere(world, target)
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
  // What the description names, and is not a thing to carry (after the M10 playtest).
  const scenery = item || !name ? undefined : sceneryHere(world, name)
  if (scenery) return [text('That belongs where it is. You leave it.')]
  if (!item) {
    const lying = Object.keys(ground).filter((i) => (ground[i] ?? 0) > 0).sort()
    return pickOrOffer(host, name, 'Take what?', lying.map((i) => ({ label: itemName(world.content, i, 1), command: `take ${itemName(world.content, i, 1)}` })), name ? `There is no "${name}" here to take.` : 'There is nothing here to take.')
  }
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
  if (!item) {
    const carried = Object.keys(inventory).filter((i) => (inventory[i] ?? 0) > 0).sort()
    return pickOrOffer(host, name, 'Drop what?', carried.map((i) => ({ label: itemName(world.content, i, 1), command: `drop ${itemName(world.content, i, 1)}` })), name ? `You don't have "${name}".` : 'You carry nothing to put down.')
  }
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
  // The stranger's own work fetches more, by their rank in the craft (M10.5).
  const bonus = ownWorkBonus(world, item)
  const own = bonus > 0 ? Math.min(affordable, Object.values(world.state.player.crafts ?? {}).reduce((n, p) => n + (p.made?.[item] ?? 0), 0)) : 0
  const total = Math.min(provider.money, affordable * price + own * Math.ceil(price * bonus))
  add(inventory, item, -affordable)
  provider.money -= total
  world.state.player.money += total
  if (own) soldOwn(world, item, own)
  const stock = world.stock(buyer.location, buyer.service.id)
  if (item in buyer.service.sells) add(stock, item, affordable)
  const seen = host.pass(2)
  const praise = own ? ` ${firstName(world.npc(buyer.service.provider))} turns ${own === 1 ? 'it' : 'one'} over and nods: good work, and worth a little more.` : ''
  return [text(`You sell ${qtyName(world, item, affordable)} to ${firstName(world.npc(buyer.service.provider))} for ${world.money(total)}.${praise}`), ...seen]
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
  if (!object) {
    const usable = candidates.filter(({ type }) => type.affordances.some((a) => a.actors.includes('player')))
    return pickOrOffer(host, words, 'Use what?', usable.map(({ instance, type }) => ({ label: label(instance, type), command: `use ${label(instance, type)}` })), words ? `There is no "${words}" here to use.` : 'There is nothing here to use.')
  }
  const usable = object.type.affordances.filter((a) => a.actors.includes('player'))
  const affordance = pickAffordance(world, usable, words)
  if (!affordance) return [error(`You can't do much with the ${label(object.instance, object.type)}.`)]
  const problem = cannotUse(world, here, object.instance, affordance)
  if (problem) return [error(problem)]
  // Someone's workplace (M10.5): with their leave, or the master's for a pupil.
  const leave = affordance.access === 'public' ? undefined : workplaceLeave(world, here, object.instance, affordance)
  if (leave && !leave.ok) return [error(leave.text)]
  const leaveLine: Output[] = leave?.text ? [{ kind: 'speech', text: leave.text }] : []
  if (leave?.ok && leave.fee > 0 && leave.to) {
    world.state.player.money -= leave.fee
    world.npcState(leave.to).money += leave.fee
  }
  if (affordance.fee > 0 && object.instance.provider && affordance.access === 'public') {
    world.state.player.money -= affordance.fee
    world.npcState(object.instance.provider).money += affordance.fee
  }
  if (affordance.wage) return [...leaveLine, ...workForPay(host, object.instance, object.type, affordance)]
  if (affordance.craft) return [...leaveLine, ...makeWith(host, object.instance, object.type, affordance)]
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
  // Work of a craft is practice in it (M10.5): peat-cutting, brick-making.
  const craft = craftOf(world, affordance)
  const result = affordance.check ? (craft ? craftCheck(world, craft, affordance.check.dc) : playerCheck(world, affordance.check.skill ?? 'crafting', affordance.check.dc)) : undefined
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
  if (well && affordance.xp && !craft) gainXp(world, affordance.xp, `a day's ${affordance.label}`)
  const who = payer ? firstName(world.npc(payer)) : 'they'
  const done = affordance.player_text ?? `You work at the ${label(instance, type)} until the light goes.`
  const how = result ? (well ? ' It goes well.' : ' It goes badly; you get half done.') : ''
  const pay = paid ? ` ${payer ? who : 'They'} pay${payer ? 's' : ''} you ${world.money(paid)}.` : ` There is no money to pay you today.`
  const learnt = craft && result ? learnFrom(world, craft, affordance, `${type.id}:${affordance.id}`, result) : []
  return [...(result ? [{ kind: 'check' as const, text: checkLine(result) }] : []), text(`${done}${how}${pay}`), ...learnt, ...seen]
}

/** Which of an object's recipes the words mean: by verb, by what it makes, by technique; else the first. */
function pickAffordance(world: World, usable: Affordance[], words: string): Affordance | undefined {
  const w = words.split(/\s+/)
  const makes = (a: Affordance) => Object.keys(a.produces).some((i) => { const n = itemName(world.content, i, 2).toLowerCase(); const one = itemName(world.content, i, 1).toLowerCase(); return words.includes(one) || words.includes(n.replace(/^\d+ /, '')) })
  const technique = (a: Affordance) => Boolean(a.technique && craftOf(world, a)?.techniques.find((t) => t.id === a.technique && words.includes(t.name.toLowerCase())))
  return usable.find(makes) ?? usable.find(technique) ?? usable.find((a) => w.includes(a.verb) && !a.rank) ?? usable.find((a) => w.includes(a.verb)) ?? usable[0]
}

function checkLine(result: { skill: string; total: number; dc: number; degree: string }): string {
  return `(${result.skill.charAt(0).toUpperCase()}${result.skill.slice(1)} ${result.total} vs DC ${result.dc}: ${result.degree})`
}

/**
 * Making something at a recipe of a craft (M10.5): USE OVEN BAKE. It takes its
 * time, and something may stop it (half done, the material is spoilt). Then
 * a check: done well, what it makes (a little more on a fine day); a miss,
 * the material is gone. Either way the craft may learn from it.
 */
function makeWith(host: CommandHost, instance: ObjectInstance, type: ObjectType, affordance: Affordance): Output[] {
  const { world } = host
  const here = world.state.player.location
  const craft = craftOf(world, affordance)!
  const rank = craftRank(world, craft.id)
  const needs = rankIndex(affordance.rank)
  if (rank < needs) return [error(`${capital(affordance.label)} is work for ${craftTitle(craft, needs)}. You are ${craftTitle(craft, rank)}.`)]
  const minutes = craftTime(world, affordance)
  const start = world.now
  const seen = host.passUntil ? host.passUntil(minutes, () => interruption(world, here, instance)) : host.pass(minutes)
  const spent = world.now - start
  if (spent < minutes) {
    // Stopped: past half-way, what was in the work is spoilt.
    const spoilt = spent * 2 >= minutes
    if (spoilt) for (const [item, qty] of Object.entries(affordance.consumes)) add(world.state.player.inventory, item, -qty)
    return [...seen, text(`You stop ${affordance.label}.${spoilt ? ' What you had started is spoilt.' : ' Nothing is lost: you can start again later.'}`)]
  }
  const result = craftCheck(world, craft, affordance.check?.dc ?? 12)
  for (const [item, qty] of Object.entries(affordance.consumes)) add(world.state.player.inventory, item, -qty)
  const out: Output[] = [{ kind: 'check', text: checkLine(result) }]
  const well = result.degree === 'success' || result.degree === 'critical success'
  if (well) {
    const mine = (craftProgress(world, craft.id).made ??= {})
    const made: [string, number][] = Object.entries(affordance.produces).map(([item, qty]) => [item, result.degree === 'critical success' ? qty + Math.floor(qty / 4) : qty])
    for (const [item, qty] of made) {
      add(world.state.player.inventory, item, qty)
      mine[item] = (mine[item] ?? 0) + qty
    }
    const what = made.map(([i, q]) => qtyName(world, i, q)).join(' and ')
    out.push(text(`${affordance.player_text ?? `You ${affordance.verb} at the ${label(instance, type)}.`}${result.degree === 'critical success' ? ' It could hardly have gone better.' : ''} You have ${what}.`))
  } else {
    const lost = Object.entries(affordance.consumes).map(([i, q]) => qtyName(world, i, q)).join(' and ')
    out.push(text(result.degree === 'critical failure' ? `It goes wrong from the start, and you only see why at the end. ${capital(lost)} wasted.` : `It doesn't come right: nothing worth keeping.${lost ? ` ${capital(lost)} gone.` : ''}`))
  }
  out.push(...learnFrom(world, craft, affordance, `${type.id}:${affordance.id}`, result))
  return [...out, ...seen]
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
  // A whole word of the name (M10.8): "count" is no counter.
  const first = words.split(' ')[0]!
  return names.some((name) => words.includes(name) || name.split(/\s+/).some((w) => w === first || w === `${first}s` || `${w}s` === first || w.replace(/'s$/, '') === first))
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
