import { minuteOfDay } from './clock'
import type { Output } from './commands'
import { callName, CRAFT_RANKS, type Affordance, type Craft, type ObjectInstance } from './content'
import { check as rollCheck, succeeded, type CheckResult } from './dialogue/checks'
import { applyEffect, attitude } from './dialogue/relations'
import { setTie } from './layer'
import { recordFact } from './news'
import { tieTo } from './people'
import { practise } from './rules/character'
import { character, gainXp, notice, playerSkill } from './rules/player'
import { queueSignal } from './signals'
import type { CraftProgress } from './state'
import type { World } from './world'

// Crafts (M10.5; FO, chapter 11, "Gepland (M10.5)"). A craft is content:
// baking, milling, smithing, each with techniques and four ranks. It grows by
// doing and by learning, not with points. Routine teaches the basics and then
// less and less: only a recipe not yet mastered, or harder than the rank,
// counts. Expert asks for more than one technique or a harder recipe, master
// for a masterwork. A bad failure is a lesson too. A rank is more than a
// bonus: it opens recipes, fetches better prices for the stranger's own work,
// and is known in the village, a signal for the brains.

const DAY = 24 * 60
/** Past this many successes a recipe is routine: it counts only while it is harder than the rank. */
export const MASTERED = 5
/** Practice a day's lesson from a master gives, on top of the day's limit. */
export const LESSON_PRACTICE = 4
/** Experience for reaching journeyman, expert and master. */
const RANK_XP = [0, 40, 80, 150]

export const rankIndex = (name: (typeof CRAFT_RANKS)[number] | undefined): number => (name ? CRAFT_RANKS.indexOf(name) : 0)

/** The rank a recipe of this difficulty is for: easy loaves for a novice, feast bread for an expert. */
export function recipeTier(dc: number): number {
  return dc <= 12 ? 0 : dc <= 16 ? 1 : dc <= 20 ? 2 : 3
}

/** The stranger's progress in a craft, made at the first use. */
export function craftProgress(world: World, craft: string): CraftProgress {
  const crafts = (world.state.player.crafts ??= {})
  return (crafts[craft] ??= { rank: 0, practice: 0, techniques: [], recipes: {}, best: 0 })
}

export function craftRank(world: World, craft: string): number {
  return world.state.player.crafts?.[craft]?.rank ?? 0
}

/** "a journeyman baker". */
export function craftTitle(craft: Craft, rank: number): string {
  const name = `${CRAFT_RANKS[rank]} ${craft.maker}`
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`
}

/**
 * The bonus for a recipe: the skill the craft leans on, until the craft's own
 * rank is higher than the skill's; then the craft's rank counts.
 */
export function craftBonus(world: World, craft: Craft): number {
  const c = character(world)
  const skillRank = c?.ranks[craft.skill] ?? 0
  return playerSkill(world, craft.skill) + Math.max(0, craftRank(world, craft.id) - skillRank) * 2
}

/** A check at a recipe: d20 + the craft's bonus against its difficulty; a success is practice for the skill too. */
export function craftCheck(world: World, craft: Craft, dc: number): CheckResult {
  const result = rollCheck(world.rng, craft.skill, dc, craftBonus(world, craft))
  const c = character(world)
  if (c && succeeded(result)) practise(c, craft.skill)
  return result
}

/** The craft whose recipe this is, and the craft a trade has. */
export function craftOf(world: World, affordance: Pick<Affordance, 'craft'>): Craft | undefined {
  return affordance.craft ? world.content.crafts.get(affordance.craft) : undefined
}

export function craftOfTrade(world: World, profession: string): Craft | undefined {
  return [...world.content.crafts.values()].find((c) => c.professions.includes(profession))
}

/**
 * What a check at a recipe teaches (M10.5). A success counts while the
 * recipe is not yet mastered or harder than the rank; a bad failure is a
 * lesson; never more than the day's limit. Then whether a rank is reached.
 */
export function learnFrom(world: World, craft: Craft, affordance: Affordance, key: string, result: CheckResult): Output[] {
  const p = craftProgress(world, craft.id)
  const tier = recipeTier(result.dc)
  let gain = 0
  if (succeeded(result)) {
    p.recipes[key] = (p.recipes[key] ?? 0) + 1
    if (affordance.technique && !p.techniques.includes(affordance.technique)) p.techniques.push(affordance.technique)
    p.best = Math.max(p.best, tier)
    if (p.recipes[key]! <= MASTERED || tier > p.rank) gain = 1
    if (affordance.masterwork && !p.masterwork) p.masterwork = affordance.label
  } else if (result.degree === 'critical failure') gain = 1
  gain = Math.min(gain, dayLeft(world, craft, p))
  const out: Output[] = []
  if (gain > 0) {
    addToday(world, p, gain)
    p.practice += gain
    if (succeeded(result) && affordance.xp) gainXp(world, affordance.xp, affordance.label)
    if (result.degree === 'critical failure') out.push({ kind: 'system', text: 'It went badly, but you see now what you did wrong.' })
  } else if (succeeded(result) && p.recipes[key]! > MASTERED) {
    out.push({ kind: 'system', text: `${cap(affordance.label)} is routine for you now: it no longer teaches you anything.` })
  } else if (dayLeft(world, craft, p) <= 0) {
    out.push({ kind: 'system', text: `That is enough to learn in ${craft.name} for one day; the rest is only work.` })
  }
  return [...out, ...rankUp(world, craft)]
}

function day(world: World): number {
  return Math.floor(world.now / DAY)
}

function dayLeft(world: World, craft: Craft, p: CraftProgress): number {
  const done = p.today && p.today[0] === day(world) ? p.today[1] : 0
  return Math.max(0, craft.per_day - done)
}

function addToday(world: World, p: CraftProgress, gain: number): void {
  const today = day(world)
  p.today = p.today && p.today[0] === today ? [today, p.today[1] + gain] : [today, gain]
}

/** What the next rank asks, in words; nothing once master. */
export function nextRank(craft: Craft, p: CraftProgress): string | undefined {
  if (p.rank >= 3) return undefined
  const need = craft.practice[p.rank]!
  const parts = [`practice ${p.practice}/${need}`]
  if (p.rank === 1 && p.techniques.length < 2 && p.best < 2) parts.push('a second technique or a harder recipe')
  if (p.rank === 2 && !p.masterwork) parts.push(`a masterwork${craft.masterwork ? ` (${craft.masterwork})` : ''}`)
  return `${CRAFT_RANKS[p.rank + 1]}: ${parts.join(', ')}`
}

/**
 * A rank reached: journeyman on practice alone, expert with more than one
 * technique or a harder recipe, master with a masterwork. The village hears
 * of it: a fact, and a signal for whoever of the craft is near.
 */
export function rankUp(world: World, craft: Craft): Output[] {
  const p = craftProgress(world, craft.id)
  const out: Output[] = []
  for (;;) {
    if (p.rank >= 3 || p.practice < craft.practice[p.rank]!) break
    if (p.rank === 1 && p.techniques.length < 2 && p.best < 2) break
    if (p.rank === 2 && !p.masterwork) break
    p.rank++
    const title = craftTitle(craft, p.rank)
    out.push({ kind: 'system', text: `You are ${title} now.` })
    gainXp(world, RANK_XP[p.rank]!, `becoming ${title}`)
    known(world, craft, p.rank)
  }
  return out
}

/** The village hears a stranger has become a baker: a fact about the stranger, and a signal for the bakers near. */
function known(world: World, craft: Craft, rank: number): void {
  const here = world.state.player.location
  const title = craftTitle(craft, rank)
  const area = world.location(here).area
  const makers = [...world.content.npcs.values()].filter((n) => craft.professions.includes(world.npc(n.id).profession) && world.alive(n.id) && world.location(world.npc(n.id).home).area === area).map((n) => n.id)
  const who = makers.length ? makers : world.npcsAt(here).slice(0, 1)
  const fact = recordFact(world, {
    kind: 'craft_rank',
    about: who,
    place: here,
    belang: rank >= 3 ? 2 : 1,
    title: `the stranger becoming ${title}`,
    text: { precise: `The stranger is ${title} now.`, village: `That stranger knows ${craft.name} now: ${title}, they say.`, far: `A stranger who knows ${craft.name}.` },
    claim: { subject: 'player', key: 'craft', value: title },
  })
  if (who.length) queueSignal(world, { kind: 'craft_rank', who, place: here, cause: [fact.id], belang: fact.belang, claim: { subject: 'player', key: 'craft', value: title }, watcher: 'rules' })
}

/**
 * A hard commission done (M10.5): something the stranger made by their own
 * hand with a recipe for an expert or better, brought to someone who asked
 * for it. It counts as a masterwork, as the feast bread does.
 */
export function commissionDone(world: World, npcId: string, item: string): void {
  for (const [id, p] of Object.entries(world.state.player.crafts ?? {})) {
    const craft = world.content.crafts.get(id)
    if (!craft || p.masterwork || (p.made?.[item] ?? 0) <= 0) continue
    const hard = [...world.content.objectTypes.values()].some((t) => t.affordances.some((a) => a.craft === id && (a.produces[item] ?? 0) > 0 && recipeTier(a.check?.dc ?? 0) >= 2))
    if (!hard) continue
    p.masterwork = `${world.content.items.get(item)?.name ?? item} for ${callName(world.npc(npcId))}`
    for (const line of rankUp(world, craft)) notice(world, line.text)
  }
}

/** The stranger's crafts for the sheet: rank, and what the next asks. */
export function craftLines(world: World): string[] {
  const crafts = world.state.player.crafts ?? {}
  return Object.entries(crafts)
    .filter(([id]) => world.content.crafts.has(id))
    .map(([id, p]) => {
      const craft = world.content.crafts.get(id)!
      const techniques = p.techniques.map((t) => craft.techniques.find((x) => x.id === t)?.name ?? t)
      const next = nextRank(craft, p)
      return `${cap(craft.name)}: ${CRAFT_RANKS[p.rank]}${techniques.length ? ` (${techniques.join(', ')})` : ''}.${next ? ` Next, ${next}.` : ''}${p.masterwork ? ` Masterwork: ${p.masterwork}.` : ''}`
    })
}

/** How much more the stranger's own work fetches, by rank: a tenth per rank above novice. */
export function ownWorkBonus(world: World, item: string): number {
  for (const [id, p] of Object.entries(world.state.player.crafts ?? {})) {
    if ((p.made?.[item] ?? 0) > 0 && world.content.crafts.has(id)) return p.rank / 10
  }
  return 0
}

/** One of the stranger's own things is sold: it no longer counts as theirs to sell dearer. */
export function soldOwn(world: World, item: string, qty: number): void {
  for (const p of Object.values(world.state.player.crafts ?? {})) {
    if ((p.made?.[item] ?? 0) > 0) {
      p.made![item] = Math.max(0, p.made![item]! - qty)
      return
    }
  }
}

// ---------------------------------------------------------------- the workplace

/** Those who may give leave to use an object: the owner, the household, the staff. */
function holders(world: World, instance: ObjectInstance, affordance: Affordance): string[] {
  const owner = instance.owner ? [instance.owner] : []
  if (affordance.access === 'household' && instance.household) return [...owner, ...[...world.content.npcs.values()].filter((n) => world.npc(n.id).household === instance.household).map((n) => n.id)]
  if (affordance.access === 'staff') return [...owner, ...instance.staff]
  return owner
}

export const objectKey = (location: string, object: string) => `object:${location}/${object}`

/**
 * Leave to use someone's workplace (M10.5): a pupil may use the master's; a
 * leave given today holds until evening; otherwise whoever it belongs to and
 * is here says yes or no, from their attitude and whether they need it now,
 * for the fee (fuel and wear) unless the stranger is a friend.
 */
export function workplaceLeave(world: World, location: string, instance: ObjectInstance, affordance: Affordance): { ok: true; fee: number; to?: string; text?: string } | { ok: false; text: string } {
  if (affordance.access === 'public') return { ok: true, fee: 0 }
  const key = objectKey(location, instance.id)
  if ((world.state.player.permits?.[key] ?? 0) > world.now) return { ok: true, fee: 0 }
  const who = holders(world, instance, affordance)
  const typeName = world.content.objectTypes.get(instance.type)?.name ?? instance.id
  const theirs = instance.owner ? `${callName(world.npc(instance.owner))}'s ${typeName}` : `the ${typeName}`
  const master = who.find((id) => tieTo(world, id, 'player')?.role === 'pupil')
  const here = who.filter((id) => world.npcsAt(location).includes(id) && world.npcState(id).activity !== 'asleep')
  if (master && !here.length) return { ok: true, fee: 0 }
  if (!here.length) return { ok: false, text: `That is ${theirs}. Ask first; there is nobody here to ask.` }
  const holder = here.find((id) => id === master) ?? here[0]!
  const name = callName(world.npc(holder))
  const busy = here.find((id) => world.npcState(id).pending?.objectKey === `${location}/${instance.id}` && world.npcState(id).busyUntil > world.now)
  if (busy) return { ok: false, text: world.say(`{name} doesn't look up from the ${typeName}. "Not now. Can't you see I'm using it?"`, busy) }
  const band = attitude(world, holder).band
  if (!master && (band === 'Hostile' || band === 'Unfriendly' || band === 'Wary')) return { ok: false, text: world.say(`{name} shakes {their} head. "Not my ${typeName}. Not for you."`, holder) }
  const friend = master || ['friend', 'spouse', 'sweetheart', 'parent', 'child', 'sibling'].includes(tieTo(world, holder, 'player')?.role ?? '') || band === 'Warm' || band === 'Devoted'
  const fee = friend ? 0 : affordance.fee
  if (fee > world.state.player.money) return { ok: false, text: world.say(`{name} looks at you. "It costs ${world.money(fee)} for the fire and the wear. Have you got it?" You haven't.`, holder) }
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  const until = hour < 6 || hour >= 21 ? world.now + 3 * 60 : world.now - minuteOfDay(world.now) + 21 * 60
  ;(world.state.player.permits ??= {})[key] = until
  const said = master ? `{name} nods at the ${typeName}. "Go on. Let me see what you've learnt."` : friend ? `{name} waves at the ${typeName}. "Help yourself."` : `{name} wipes {their} hands. "Go on, then. Mind you leave it as you found it."`
  return { ok: true, fee, to: holder, text: `${world.say(said, holder)}${fee ? ` You pay ${name} ${world.money(fee)}.` : ''}` }
}

/**
 * What stops work half done (M10.5): a fight; whoever it belongs to coming to
 * use it; someone come to have it out with the stranger.
 */
export function interruption(world: World, location: string, instance: ObjectInstance): string | undefined {
  if (world.state.combat) return 'A fight breaks out. You leave the work.'
  const key = `${location}/${instance.id}`
  const user = world.npcsAt(location).find((id) => world.npcState(id).pending?.objectKey === key && world.npcState(id).busyUntil > world.now)
  if (user) return world.say(`{name} needs the ${world.content.objectTypes.get(instance.type)?.name ?? 'place'} and shoos you off it.`, user)
  const angry = world.npcsAt(location).find((id) => world.npcState(id).grievance && world.npcState(id).seeking)
  if (angry) return world.say('{name} comes up to you with a face like thunder. You put down your work.', angry)
  return undefined
}

// ---------------------------------------------------------------- learning from a master

/**
 * A day's lesson from a master of the craft (M10.5): practice on top of the
 * day's limit, and a technique the stranger does not know yet; the stranger
 * is the master's pupil from then on, and may use the workplace today.
 */
export function lesson(world: World, npcId: string, craft: Craft): Output[] {
  const p = craftProgress(world, craft.id)
  p.practice += LESSON_PRACTICE
  const fresh = craft.techniques.find((t) => !p.techniques.includes(t.id))
  if (fresh) p.techniques.push(fresh.id)
  const c = character(world)
  if (c) practise(c, craft.skill)
  if (tieTo(world, npcId, 'player')?.role !== 'pupil') setTie(world, npcId, 'player', 'pupil', 1)
  applyEffect(world, npcId, 'affinity', 3)
  // The master's own workplace of the craft: the oven in the yard, the forge.
  const isBench = (o: ObjectInstance) => world.content.objectTypes.get(o.type)?.affordances.some((a) => a.craft === craft.id && a.actors.includes('player'))
  const place = [...world.content.locations.values()].find((l) => l.objects.some((o) => o.owner === npcId && isBench(o))) ?? world.content.locations.get(world.npc(npcId).work ?? world.npc(npcId).home)
  const bench = place?.objects.find((o) => (o.owner === npcId || !o.owner) && isBench(o))
  if (place && bench) {
    const hour = Math.floor(minuteOfDay(world.now) / 60)
    const until = hour >= 21 ? world.now + 3 * 60 : world.now - minuteOfDay(world.now) + 21 * 60
    ;(world.state.player.permits ??= {})[objectKey(place.id, bench.id)] = until
  }
  world.state.player.spend = { minutes: 180, why: `a lesson in ${craft.name}` }
  const name = callName(world.npc(npcId))
  const out: Output[] = [{ kind: 'narration', text: `${name} takes you through ${craft.name} step by step, and lets you try until your hands begin to understand.${fresh ? ` You learn ${fresh.name}.` : ''}` }]
  out.push({ kind: 'system', text: `${cap(craft.name)}: practice ${p.practice}. You are ${name}'s pupil now${bench && place ? `, and may use the ${world.content.objectTypes.get(bench.type)?.name} today` : ''}.` })
  notice(world, `A lesson in ${craft.name} with ${name}.`)
  return [...out, ...rankUp(world, craft)]
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
