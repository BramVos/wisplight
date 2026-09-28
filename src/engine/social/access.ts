import { minuteOfDay } from '../clock'
import type { Output } from '../commands'
import { callName, type Lock, type ObjectInstance } from '../content'
import { applyEffect, attitude } from '../dialogue/relations'
import { itemName, matchItem, withArticle } from '../items'
import { recordFact } from '../news'
import { tieTo } from '../people'
import { gainXp, playerCheck } from '../rules/player'
import { weather } from '../weather'
import { propById } from '../props'
import type { World } from '../world'
import { crime, whoNoticed } from './crime'
import { householdOf, isSomeonesHome, ownerOf } from './ownership'

// Access as a right (M10.3, "Eigendom en betrapt worden"). A door or a chest
// can have a lock with a key id: it opens with the key, by force (Athletics,
// and loud, so there are witnesses), or later with PICK (M10.5). Whoever lets
// the stranger in gives permission, for a while; being in someone's home
// without it is trespass, which whoever sees remembers.

/** Whether a lock is open: opened with its key, picked, or broken. Jammed is still shut (M10.5). */
function lockOpen(world: World, id: string): boolean {
  const state = world.state.locks?.[id]
  return state === 'open' || state === 'broken'
}

/** How hard a lock is by the work that went into it (M10.5). */
const QUALITY_DC: Record<Lock['quality'], number> = { crude: 10, common: 14, good: 17, fine: 20, masterwork: 24 }
/** What it is made of: wood splits, iron holds; brass is fine work to pick. */
const MATERIAL: Record<Lock['material'], { pick: number; force: number }> = { wood: { pick: -1, force: -3 }, iron: { pick: 0, force: 0 }, brass: { pick: 1, force: -1 } }

/**
 * How hard a lock is (M10.5): the lock's own, not the stranger's. The work
 * and the metal; picking in the dark without a lantern, or in the rain, is
 * harder. A simple lock stays simple for an old hand.
 */
export function lockDc(world: World, lock: Pick<Lock, 'dc' | 'quality' | 'material'>, how: 'pick' | 'force', outdoors = false): number {
  const base = lock.dc ?? QUALITY_DC[lock.quality ?? 'common']
  const material = MATERIAL[lock.material ?? 'iron'][how]
  if (how === 'force') return base + material
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  // A light carried (M10.17: anything tagged light, before the lantern by id).
  const lit = Object.entries(world.state.player.inventory).some(([id, n]) => n > 0 && world.content.items.get(id)?.tags.includes('light'))
  const dark = (hour >= 21 || hour < 6) && !lit ? 2 : 0
  const wet = outdoors && ['rain', 'storm'].includes(weather(world)) ? 1 : 0
  return base + material + dark + wet
}

export const exitLockId = (from: string, direction: string) => `exit:${from}:${direction}`
export const objectLockId = (location: string, object: string) => `object:${location}/${object}`

/** Through a locked door: with the key it opens; without, it does not. */
export function passLock(world: World, from: string, direction: string, lock: Pick<Lock, 'key'> | undefined): { ok: boolean; text?: string } {
  if (!lock) return { ok: true }
  const id = exitLockId(from, direction)
  if (lockOpen(world, id)) return { ok: true }
  if ((world.state.player.inventory[lock.key] ?? 0) > 0) {
    ;(world.state.locks ??= {})[id] = 'open'
    return { ok: true, text: `You unlock the door with the ${itemName(world.content, lock.key, 1)}.` }
  }
  return { ok: false, text: `The door is locked. You have no key to it. (PICK ${direction.toUpperCase()} to pick the lock, FORCE ${direction.toUpperCase()} to break it open.)` }
}

/** An object here by its name: a chest, a strongbox. */
export function objectHere(world: World, words: string): ObjectInstance | undefined {
  const here = world.location(world.state.player.location)
  const w = words.toLowerCase().replace(/^(the|a|an)\s+/, '').trim()
  return here.objects.find((o) => {
    const type = world.content.objectTypes.get(o.type)
    return [o.name, o.id, type?.name, ...(type?.aliases ?? [])].some((n) => n && n.toLowerCase() === w)
  })
}

/** What a chest holds, kept on the ground under its own key. */
function contentsOf(world: World, location: string, object: ObjectInstance): Record<string, number> {
  const key = `${location}/${object.id}`
  if (!world.state.ground[key]) world.state.ground[key] = { ...(object.contents ?? {}) }
  return world.state.ground[key]!
}

/** OPEN <chest>: with its key, or it is open already, or broken; then what it holds. */
export function openObject(world: World, words: string): Output[] {
  const here = world.state.player.location
  const object = objectHere(world, words)
  if (!object) return [{ kind: 'error', text: `There is no ${words} here to open.` }]
  const name = object.name ?? world.content.objectTypes.get(object.type)?.name ?? object.id
  if (object.lock) {
    const id = objectLockId(here, object.id)
    if (!lockOpen(world, id)) {
      if ((world.state.player.inventory[object.lock.key] ?? 0) <= 0) return [{ kind: 'error', text: `${cap(theName(name))} is locked. (PICK ${name.toUpperCase()} to pick the lock, FORCE ${name.toUpperCase()} to break it open.)` }]
      ;(world.state.locks ??= {})[id] = 'open'
    }
  }
  const inside = Object.entries(contentsOf(world, here, object)).filter(([, n]) => n > 0)
  const money = propById(world, object.id)?.money ?? 0
  const list = [...inside.map(([i, n]) => itemName(world.content, i, n)), ...(money ? [world.money(money)] : [])]
  return [{ kind: 'text', text: list.length ? `In ${theName(name)}: ${list.join(', ')}.` : `${cap(theName(name))} is empty.` }]
}

/**
 * TAKE <thing> FROM <chest>: only from one that is open. What is in someone
 * else's chest is theirs: taking it is theft, seen or unseen.
 */
export function takeFrom(world: World, thingWords: string, objectWords: string): Output[] {
  const here = world.state.player.location
  const object = objectHere(world, objectWords)
  if (!object) return [{ kind: 'error', text: `There is no ${objectWords} here.` }]
  const name = object.name ?? world.content.objectTypes.get(object.type)?.name ?? object.id
  if (object.lock && !lockOpen(world, objectLockId(here, object.id))) return [{ kind: 'error', text: `${cap(theName(name))} is locked.` }]
  const contents = contentsOf(world, here, object)
  // Money in a chest the chronicler placed (M10.5): from the owner's purse.
  const prop = propById(world, object.id)
  const money = prop && prop.money > 0 && /\b(money|coins?|purse|geld|munten)\b/i.test(thingWords) ? prop.money : 0
  const item = money ? undefined : matchItem(world.content, thingWords, Object.keys(contents).filter((i) => (contents[i] ?? 0) > 0))
  if (!item && !money) return [{ kind: 'error', text: `There is no ${thingWords} in ${theName(name)}.` }]
  if (item) {
    contents[item]! -= 1
    world.state.player.inventory[item] = (world.state.player.inventory[item] ?? 0) + 1
  } else {
    prop!.money = 0
    world.state.player.money += money
  }
  const out: Output[] = [{ kind: 'text', text: `You take ${item ? withArticle(itemName(world.content, item, 1)) : world.money(money)} from ${theName(name)}.` }]
  const owner = ownerOf(world, here, { object: object.id })
  // With the owner's leave (M10.5), it is no theft.
  const leave = (world.state.player.permits?.[objectLockId(here, object.id)] ?? 0) > world.now
  if (!leave && (owner.kind === 'person' || owner.kind === 'household')) {
    const seen = whoNoticed(world, here, [], owner.id ? { [owner.id]: 2 } : {})
    if (seen.noticed.length) out.push({ kind: 'narration', text: `${seen.noticed.map((w) => callName(world.npc(w))).join(' and ')} saw it.` })
    const who = owner.id ? callName(world.npc(owner.id)) : 'someone'
    const took = item ? withArticle(itemName(world.content, item, 1)) : world.money(money)
    out.push(...crime(world, { kind: 'theft', place: here, ...(owner.id ? { victim: owner.id } : {}), ...(item ? { item } : {}), value: item ? world.basePrice(item) : money, grave: false, witnesses: seen.noticed }, { title: `the stranger stole from ${who}`, precise: `The stranger took ${took} from ${who}'s ${name}.`, village: `The stranger went into ${who}'s ${name}!`, far: 'A stranger has been stealing.' }))
  }
  return out
}

/**
 * FORCE <direction or chest>: Athletics against the lock. Whether or not it
 * gives, it is loud: whoever is near hears, and breaking what is someone's
 * is a crime with those witnesses.
 */
export function force(world: World, words: string, direction?: string): Output[] {
  const here = world.state.player.location
  const place = world.location(here)
  const exit = direction ? place.exits[direction as keyof typeof place.exits] : undefined
  const object = exit ? undefined : objectHere(world, words)
  const lock = exit?.lock ?? object?.lock
  if (!lock) return [{ kind: 'error', text: exit || object ? 'There is no lock on it to force.' : `There is nothing called ${words} here to force.` }]
  const id = exit ? exitLockId(here, direction!) : objectLockId(here, object!.id)
  if (lockOpen(world, id)) return [{ kind: 'error', text: 'It is not locked.' }]
  const dc = lockDc(world, lock, 'force')
  const check = playerCheck(world, 'athletics', dc)
  const won = check.degree === 'success' || check.degree === 'critical success'
  const what = exit ? `the door of ${world.location(exit.to).name}` : theName(object!.name ?? world.content.objectTypes.get(object!.type)?.name ?? object!.id)
  const out: Output[] = [{ kind: 'check', text: `(Athletics ${check.total} vs DC ${dc}: ${check.degree})` }]
  if (won) (world.state.locks ??= {})[id] = 'broken'
  out.push({ kind: 'narration', text: won ? `With a crack of splitting wood, ${what} gives.` : `You throw yourself at ${what}. It holds, and the noise carries: whoever is near knows now that someone was at it. Better go before they come, or come back with its key.` })
  // Loud either way: whoever is here or next door hears it.
  const owner = exit ? ownerOf(world, exit.to) : ownerOf(world, here, { object: object!.id })
  const heard = whoNoticed(world, here, [], owner.id ? { [owner.id]: 4 } : {}).noticed
  recordFact(world, { kind: 'break_in', about: owner.id ? [owner.id] : [], place: here, belang: 1, loud: true, title: `someone breaking ${what}`, text: { precise: `Someone tried to break ${what}${won ? ', and did' : ''}.`, village: `Somebody was breaking in at ${place.name}!`, far: 'A break-in.' } })
  if (won && owner.id) {
    out.push(...crime(world, { kind: 'theft', place: here, victim: owner.id, value: 16, grave: false, witnesses: heard }, { title: `the stranger breaking into ${callName(world.npc(owner.id))}'s`, precise: `The stranger broke ${what}, which is ${callName(world.npc(owner.id))}'s.`, village: `The stranger broke into ${callName(world.npc(owner.id))}'s!`, far: 'A stranger broke in somewhere.' }))
  }
  return out
}

/** What will do to pick a lock with: something thin and stiff. */
const PICKS = ['lockpicks', 'iron_nails', 'iron_hook', 'knife']

/**
 * PICK <door or chest> (M10.5): Thievery against the lock, quiet. Picked, it
 * is open and nobody need know; whoever sees it, knows. A bad slip jams the
 * lock (only the key or force will do then) and may cost the pick. The first
 * time a lock gives is an obstacle overcome: experience. Undefined when the
 * words name no lock here, so PICK APPLES is still taking.
 */
export function pick(world: World, words: string, direction?: string): Output[] | undefined {
  const here = world.state.player.location
  const place = world.location(here)
  const w = words.toLowerCase().replace(/^(the\s+)?lock\s+(on|of)\s+/, '').replace(/\s+lock$/, '').trim()
  const locked = (Object.entries(place.exits) as [string, { to: string; lock?: Lock }][]).filter(([, e]) => e.lock)
  const door = direction ? locked.find(([d]) => d === direction) : /^(the\s+)?(door|lock)$/.test(w) && locked.length === 1 ? locked[0] : undefined
  const object = door ? undefined : objectHere(world, w)
  const lock = door?.[1].lock ?? object?.lock
  if (!lock) return door || object ? [{ kind: 'error', text: 'There is no lock on it to pick.' }] : undefined
  const id = door ? exitLockId(here, door[0]) : objectLockId(here, object!.id)
  if (lockOpen(world, id)) return [{ kind: 'error', text: 'It is not locked.' }]
  const what = door ? `the door of ${world.location(door[1].to).name}` : theName(object!.name ?? world.content.objectTypes.get(object!.type)?.name ?? object!.id)
  if (world.state.locks?.[id] === 'jammed') return [{ kind: 'error', text: `The lock of ${what} is jammed. Only its key, FORCE, or a smith who knows locks will open it now.` }]
  const tool = PICKS.find((i) => (world.state.player.inventory[i] ?? 0) > 0)
  if (!tool) return [{ kind: 'error', text: 'You have nothing thin and stiff enough to pick a lock with: a nail, a hook, the point of a knife.' }]
  const outdoors = !place.tags.some((t) => ['indoors', 'private', 'shop', 'social', 'workshop'].includes(t))
  const dc = lockDc(world, lock, 'pick', outdoors)
  const check = playerCheck(world, 'thievery', dc)
  const out: Output[] = [{ kind: 'check', text: `(Thievery ${check.total} vs DC ${dc}: ${check.degree})` }]
  const tool1 = itemName(world.content, tool, 1)
  const owner = door ? ownerOf(world, door[1].to) : ownerOf(world, here, { object: object!.id })
  if (check.degree === 'success' || check.degree === 'critical success') {
    ;(world.state.locks ??= {})[id] = 'open'
    out.push({ kind: 'narration', text: `You work the ${tool1} into the lock of ${what}, feel for the wards, and turn. It gives with a small click.` })
    const picked = (world.state.player.found ??= [])
    if (!picked.includes(`picked:${id}`)) {
      picked.push(`picked:${id}`)
      gainXp(world, 20, `picking the lock of ${what}`)
    }
  } else if (check.degree === 'critical failure') {
    ;(world.state.locks ??= {})[id] = 'jammed'
    const lost = tool !== 'knife'
    if (lost) world.state.player.inventory[tool] = (world.state.player.inventory[tool] ?? 1) - 1
    // What is now (M10.14): a jammed lock, and the ways that are left.
    out.push({ kind: 'narration', text: `Something inside the lock of ${what} shifts the wrong way and sticks.${lost ? ` The ${tool1} snaps off in it.` : ''} It is jammed now: no pick will turn it. Its key would, or FORCE, loud as that is, or a smith who knows locks.` })
  } else {
    out.push({ kind: 'narration', text: `You work at the lock of ${what} with the ${tool1}, but the wards won't give. The lock is as it was: you can try again, find its key, or leave it.` })
  }
  // Quiet, but not invisible: whoever sees the stranger at someone's lock knows what they saw.
  if (owner.id) {
    const seen = whoNoticed(world, here, [], { [owner.id]: 2 }).noticed
    if (seen.length) {
      const name = callName(world.npc(owner.id))
      out.push({ kind: 'narration', text: `${seen.map((s) => callName(world.npc(s))).join(' and ')} saw you at the lock.` })
      recordFact(world, { kind: 'break_in', about: [owner.id], place: here, belang: 1, title: `the stranger picking ${name}'s lock`, text: { precise: `The stranger was picking the lock of ${what}, which is ${name}'s.`, village: `The stranger was at ${name}'s lock with a bit of wire!`, far: 'A stranger who picks locks.' }, witnesses: seen })
      out.push(...crime(world, { kind: 'theft', place: here, victim: owner.id, value: 8, grave: false, witnesses: seen }, { title: `the stranger at ${name}'s lock`, precise: `The stranger picked at the lock of ${what}, which is ${name}'s.`, village: `The stranger was picking ${name}'s lock!`, far: 'A stranger who picks locks.' }))
    }
  }
  return out
}

/** Whether the stranger may be here: not someone's home, or they are let in, or welcome by day, or kin or friend. */
export function mayBeIn(world: World, location: string): boolean {
  if (!isSomeonesHome(world, location)) return true
  if ((world.state.player.permits?.[location] ?? 0) > world.now) return true
  // A shop in the house is open to anyone while it is open.
  const place = world.location(location)
  if (place.services.some((s) => world.serviceOpen(location, s))) return true
  const home = householdOf(world, location)
  if (home.some((id) => ['friend', 'spouse', 'sweetheart', 'parent', 'child', 'sibling'].includes(tieTo(world, id, 'player')?.role ?? ''))) return true
  // By day, whoever of the house is there and not against the stranger lets them in by not objecting.
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  const there = home.filter((id) => world.state.npcs[id]?.location === location && world.present(id) && world.npcState(id).activity !== 'asleep')
  const cold = (id: string) => ['Wary', 'Unfriendly', 'Hostile'].includes(attitude(world, id).band)
  return hour >= 6 && hour < 21 && there.length > 0 && !there.some(cold)
}

/**
 * Coming into someone's home without leave (M10.3): if someone of the house
 * sees it, it is trespass, which they remember; they tell the stranger to
 * get out. Unseen, nobody knows, for now.
 */
export function entered(world: World, location: string): Output[] {
  if (mayBeIn(world, location)) return []
  const home = householdOf(world, location)
  const seeing = home.filter((id) => world.state.npcs[id]?.location === location && world.present(id) && world.npcState(id).activity !== 'asleep')
  if (!seeing.length) return []
  const who = seeing[0]!
  const name = callName(world.npc(who))
  for (const id of seeing) {
    applyEffect(world, id, 'trust', -5)
    const memory = (world.npcState(id).memory ??= [])
    memory.push({ t: world.now, note: `The stranger walked into my home without a by-your-leave.`, topics: [location], valence: -1 })
    if (memory.length > 30) memory.splice(0, memory.length - 30)
  }
  recordFact(world, { kind: 'trespass', about: [who], place: location, belang: 1, title: `the stranger in ${name}'s house`, text: { precise: `The stranger walked into ${name}'s house uninvited.`, village: `The stranger just walks into people's houses, ${name} says.`, far: 'A stranger with no manners.' }, witnesses: seeing })
  return [{ kind: 'speech', text: world.say(`{name} stares at you. "What are you doing in my house? Out, before I call for help."`, who) }]
}

/** "the strongbox", but "Lubbert's strongbox". */
function theName(name: string): string {
  return /'s\b/.test(name) || /^[A-Z]/.test(name) ? name : `the ${name}`
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Let in (M10.3): permission for a home, until then. */
export function letIn(world: World, location: string, until: number): void {
  ;(world.state.player.permits ??= {})[location] = until
}
