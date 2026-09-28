import { minuteOfDay } from '../clock'
import type { Output } from '../commands'
import { callName, type ObjectInstance } from '../content'
import { applyEffect, attitude } from '../dialogue/relations'
import { itemName, matchItem, withArticle } from '../items'
import { recordFact } from '../news'
import { tieTo } from '../people'
import { playerCheck } from '../rules/player'
import type { World } from '../world'
import { crime, whoNoticed } from './crime'
import { householdOf, isSomeonesHome, ownerOf } from './ownership'

// Access as a right (M10.3, "Eigendom en betrapt worden"). A door or a chest
// can have a lock with a key id: it opens with the key, by force (Athletics,
// and loud, so there are witnesses), or later with PICK (M10.5). Whoever lets
// the stranger in gives permission, for a while; being in someone's home
// without it is trespass, which whoever sees remembers.

/** The state of a lock: opened with its key, or broken; without an entry, locked. */
function lockState(world: World, id: string): 'open' | 'broken' | undefined {
  return world.state.locks?.[id]
}

export const exitLockId = (from: string, direction: string) => `exit:${from}:${direction}`
export const objectLockId = (location: string, object: string) => `object:${location}/${object}`

/** Through a locked door: with the key it opens; without, it does not. */
export function passLock(world: World, from: string, direction: string, lock: { key: string; dc: number } | undefined): { ok: boolean; text?: string } {
  if (!lock) return { ok: true }
  const id = exitLockId(from, direction)
  if (lockState(world, id)) return { ok: true }
  if ((world.state.player.inventory[lock.key] ?? 0) > 0) {
    ;(world.state.locks ??= {})[id] = 'open'
    return { ok: true, text: `You unlock the door with the ${itemName(world.content, lock.key, 1)}.` }
  }
  return { ok: false, text: `The door is locked. You have no key to it. (FORCE ${direction.toUpperCase()} to break it open.)` }
}

/** An object here by its name: a chest, a strongbox. */
function objectHere(world: World, words: string): ObjectInstance | undefined {
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
    if (!lockState(world, id)) {
      if ((world.state.player.inventory[object.lock.key] ?? 0) <= 0) return [{ kind: 'error', text: `${cap(theName(name))} is locked. (FORCE ${name.toUpperCase()} to break it open.)` }]
      ;(world.state.locks ??= {})[id] = 'open'
    }
  }
  const inside = Object.entries(contentsOf(world, here, object)).filter(([, n]) => n > 0)
  return [{ kind: 'text', text: inside.length ? `In ${theName(name)}: ${inside.map(([i, n]) => itemName(world.content, i, n)).join(', ')}.` : `${cap(theName(name))} is empty.` }]
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
  if (object.lock && !lockState(world, objectLockId(here, object.id))) return [{ kind: 'error', text: `${cap(theName(name))} is locked.` }]
  const contents = contentsOf(world, here, object)
  const item = matchItem(world.content, thingWords, Object.keys(contents).filter((i) => (contents[i] ?? 0) > 0))
  if (!item) return [{ kind: 'error', text: `There is no ${thingWords} in ${theName(name)}.` }]
  contents[item]! -= 1
  world.state.player.inventory[item] = (world.state.player.inventory[item] ?? 0) + 1
  const out: Output[] = [{ kind: 'text', text: `You take ${withArticle(itemName(world.content, item, 1))} from ${theName(name)}.` }]
  const owner = ownerOf(world, here, { object: object.id })
  if (owner.kind === 'person' || owner.kind === 'household') {
    const seen = whoNoticed(world, here, [], owner.id ? { [owner.id]: 2 } : {})
    if (seen.noticed.length) out.push({ kind: 'narration', text: `${seen.noticed.map((w) => callName(world.npc(w))).join(' and ')} saw it.` })
    const who = owner.id ? callName(world.npc(owner.id)) : 'someone'
    out.push(...crime(world, { kind: 'theft', place: here, ...(owner.id ? { victim: owner.id } : {}), item, value: world.basePrice(item), grave: false, witnesses: seen.noticed }, { title: `the stranger stole from ${who}`, precise: `The stranger took ${withArticle(itemName(world.content, item, 1))} from ${who}'s ${name}.`, village: `The stranger went into ${who}'s ${name}!`, far: 'A stranger has been stealing.' }))
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
  if (lockState(world, id)) return [{ kind: 'error', text: 'It is not locked.' }]
  const check = playerCheck(world, 'athletics', lock.dc)
  const won = check.degree === 'success' || check.degree === 'critical success'
  const what = exit ? `the door of ${world.location(exit.to).name}` : theName(object!.name ?? world.content.objectTypes.get(object!.type)?.name ?? object!.id)
  const out: Output[] = [{ kind: 'check', text: `(Athletics ${check.total} vs DC ${lock.dc}: ${check.degree})` }]
  if (won) (world.state.locks ??= {})[id] = 'broken'
  out.push({ kind: 'narration', text: won ? `With a crack of splitting wood, ${what} gives.` : `You throw yourself at ${what}. It holds, and the noise carries.` })
  // Loud either way: whoever is here or next door hears it.
  const owner = exit ? ownerOf(world, exit.to) : ownerOf(world, here, { object: object!.id })
  const heard = whoNoticed(world, here, [], owner.id ? { [owner.id]: 4 } : {}).noticed
  recordFact(world, { kind: 'break_in', about: owner.id ? [owner.id] : [], place: here, belang: 1, loud: true, title: `someone breaking ${what}`, text: { precise: `Someone tried to break ${what}${won ? ', and did' : ''}.`, village: `Somebody was breaking in at ${place.name}!`, far: 'A break-in.' } })
  if (won && owner.id) {
    out.push(...crime(world, { kind: 'theft', place: here, victim: owner.id, value: 16, grave: false, witnesses: heard }, { title: `the stranger breaking into ${callName(world.npc(owner.id))}'s`, precise: `The stranger broke ${what}, which is ${callName(world.npc(owner.id))}'s.`, village: `The stranger broke into ${callName(world.npc(owner.id))}'s!`, far: 'A stranger broke in somewhere.' }))
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
