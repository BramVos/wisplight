import type { Output } from './commands'
import { callName, type Affordance, type Craft, type CraftFailure, type ObjectInstance, type ObjectType } from './content'
import type { CheckResult } from './dialogue/checks'
import { applyEffect, attitude } from './dialogue/relations'
import { queueSignal } from './signals'
import { add } from './items'
import { recordFact } from './news'
import { qtyName } from './npc/execute'
import { objectKey } from './state'
import type { World } from './world'

// Failure that plays on (M10.14; the review of 28 September 2026). A failed
// attempt at a recipe is not only "the material is gone": the content of the
// craft says what it leaves. A poorer thing that is good for something else,
// the workplace damaged so that it needs mending before anyone can use it
// again, or part of the material back. A master who is there says what went
// wrong. A damage the stranger does not mend, the owner mends the next
// morning, and minds who did it.

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** Who of the craft is here and awake to say what went wrong. */
function masterHere(world: World, craft: Craft): string | undefined {
  const here = world.state.player.location
  return world.npcsAt(here).find((id) => craft.professions.includes(world.npc(id).profession) && world.npcState(id).activity !== 'asleep')
}

function objectName(instance: ObjectInstance, type: ObjectType): string {
  return (instance.name ?? type.name).toLowerCase()
}

/**
 * What a failed recipe leaves, by the failure of the recipe or its craft and the
 * degree: the material is already used up when this is called.
 */
export function failedMake(world: World, instance: ObjectInstance, type: ObjectType, craft: Craft, affordance: Affordance, result: CheckResult): Output[] {
  const failure: CraftFailure | undefined = affordance.failure ?? craft.failure
  const critical = result.degree === 'critical failure'
  const outcome = !failure ? 'lost' : critical ? failure.critical : failure.outcome
  const lost = Object.entries(affordance.consumes).map(([i, q]) => qtyName(world, i, q)).join(' and ')
  const out: Output[] = []
  const name = objectName(instance, type)
  switch (outcome) {
    case 'poor': {
      const first = Object.values(affordance.produces)[0] ?? 2
      const qty = failure!.qty ?? Math.max(1, Math.floor(first / 2))
      add(world.state.player.inventory, failure!.item!, qty)
      out.push({ kind: 'text', text: `It doesn't come right. What you have is ${qtyName(world, failure!.item!, qty)}: not what you meant, but not nothing.` })
      break
    }
    case 'leftover': {
      const back = Object.entries(affordance.consumes).map(([i, q]) => [i, Math.floor(q * failure!.share)] as const).filter(([, q]) => q > 0)
      for (const [i, q] of back) add(world.state.player.inventory, i, q)
      out.push({ kind: 'text', text: back.length ? `It doesn't come right, but not all is lost: ${back.map(([i, q]) => qtyName(world, i, q)).join(' and ')} can go in again.` : `It doesn't come right: nothing worth keeping.` })
      break
    }
    case 'damaged': {
      world.objectState(world.state.player.location, instance.id)['damaged'] = 'player'
      const owner = instance.owner && world.content.npcs.has(instance.owner) ? callName(world.npc(instance.owner)) : undefined
      out.push({ kind: 'text', text: `Something gives: the ${name} is damaged${lost ? `, and ${lost} with it` : ''}. It must be mended before anyone can use it again: REPAIR THE ${name.toUpperCase()}${owner ? `, or leave it to ${owner}, who will know who did it` : ''}.` })
      break
    }
    default:
      out.push({ kind: 'text', text: critical ? `It goes wrong from the start, and you only see why at the end. ${capital(lost)} wasted.` : `It doesn't come right: nothing worth keeping.${lost ? ` ${capital(lost)} gone.` : ''}` })
  }
  // What went wrong: from a master who is here, or what you can see yourself.
  if (failure?.why) {
    const master = masterHere(world, craft)
    out.push(master ? { kind: 'speech', text: `${callName(world.npc(master))} looks at it. "${failure.why}"` } : { kind: 'text', text: `Looking at it, you can guess why: ${lower(failure.why)}` })
  }
  return out
}

/** Why a damaged workplace cannot be used, or undefined (M10.14). */
export function damagedBlock(world: World, here: string, instance: ObjectInstance, type: ObjectType, affordance: Affordance): string | undefined {
  const damaged = world.objectState(here, instance.id)['damaged']
  if (!damaged || (!Object.keys(affordance.produces).length && !affordance.craft)) return undefined
  const name = objectName(instance, type)
  const owner = instance.owner && world.content.npcs.has(instance.owner) ? callName(world.npc(instance.owner)) : undefined
  return `The ${name} is damaged and must be mended first.${type.repair ? ` REPAIR THE ${name.toUpperCase()}` : ''}${type.repair && owner ? `, or leave it to ${owner}.` : owner ? ` ${owner} will see to it.` : type.repair ? '.' : ''}`
}

/**
 * REPAIR <thing> (M10.14): mend what the stranger damaged, with what the
 * object needs for it and its time. Only damage like that: the mill that
 * broke is work for the millwright (the plots of a world rest on it).
 */
export function repair(world: World, pass: (minutes: number) => Output[], words: string): Output[] {
  const here = world.state.player.location
  const w = words.toLowerCase().replace(/^the\s+/, '').trim()
  const found = world.location(here).objects.flatMap((instance) => {
    const type = world.content.objectTypes.get(instance.type)
    return type && world.objectState(here, instance.id)['damaged'] ? [{ instance, type }] : []
  })
  const pick = found.find(({ instance, type }) => !w || objectName(instance, type).includes(w) || type.aliases.some((a) => a.toLowerCase() === w) || instance.id === w) ?? (found.length === 1 && !w ? found[0] : undefined)
  if (!pick) return [{ kind: 'error', text: found.length ? `Repair what? ${found.map(({ instance, type }) => `the ${objectName(instance, type)}`).join(', ')}.` : 'Nothing here needs mending that you could mend.' }]
  const { instance, type } = pick
  const name = objectName(instance, type)
  if (!type.repair) return [{ kind: 'error', text: `Mending the ${name} is more than you can do.${instance.owner ? ` ${callName(world.npc(instance.owner))} will see to it.` : ''}` }]
  const inv = world.state.player.inventory
  const missing = Object.entries(type.repair.consumes).filter(([i, q]) => (inv[i] ?? 0) < q)
  if (missing.length) return [{ kind: 'error', text: `To mend the ${name} you need ${Object.entries(type.repair.consumes).map(([i, q]) => qtyName(world, i, q)).join(' and ')}.` }]
  for (const [i, q] of Object.entries(type.repair.consumes)) add(inv, i, -q)
  const seen = pass(type.repair.duration)
  delete world.objectState(here, instance.id)['damaged']
  return [{ kind: 'narration', text: `You mend the ${name}. It is not pretty, but it will do, and nobody need know.` }, ...seen]
}

/**
 * In the morning (M10.14): what the stranger damaged and left, its owner
 * mends, and minds. A thought and a little less warmth; the object is whole.
 */
export function mendOvernight(world: World): void {
  for (const location of world.content.locations.values()) {
    for (const instance of location.objects) {
      const state = world.state.objects[objectKey(location.id, instance.id)]
      if (!state?.['damaged']) continue
      const by = state['damaged']
      delete state['damaged']
      const owner = instance.owner
      if (!owner || by !== 'player' || !world.content.npcs.has(owner) || !world.alive(owner)) continue
      const type = world.content.objectTypes.get(instance.type)
      const name = type ? objectName(instance, type) : instance.id
      applyEffect(world, owner, 'affinity', -4)
      const s = world.npcState(owner)
      s.thoughts = [...(s.thoughts ?? []).filter((t) => t.until > world.now), { text: `The stranger damaged your ${name} and left it for you to mend.`, t: world.now, until: world.now + 5 * 24 * 60 }].slice(-3)
    }
  }
}

/** Places with a roof and, as a rule, a fire: where wet clothes dry. */
const ROOFED = ['indoors', 'private', 'shop', 'social', 'workshop', 'holy']

/** On the hour (M10.14): an hour under a roof dries the stranger who came out of the water wet and cold. */
export function dryOut(world: World): void {
  const c = world.state.player.character
  if (!c?.conditions['wet']) return
  const place = world.content.locations.get(world.state.player.location)
  if (!place || !place.tags.some((t) => ROOFED.includes(t))) return
  delete c.conditions['wet']
  world.notices.push('You have dried out, and the cold has gone out of you.')
}

// ---------------------------------------------------------------- good outcomes (M10.14)

/** What the stranger made with their own hands and gave away: who has it, since when (M10.14). */
function ownWork(world: World): { given: Record<string, { item: string; t: number }[]>; seen: Record<string, number> } {
  return (world.state.player.ownWork ??= { given: {}, seen: {} })
}

/** Whether the stranger made this thing themselves and still counts it as theirs (M10.5). */
export function isOwnWork(world: World, item: string): boolean {
  return Object.values(world.state.player.crafts ?? {}).some((p) => (p.made?.[item] ?? 0) > 0)
}

/** The stranger gives something they made (M10.14): whoever has it uses it, and it shows. */
export function gaveOwnWork(world: World, npcId: string, item: string): void {
  const list = (ownWork(world).given[npcId] ??= [])
  if (!list.some((g) => g.item === item)) list.push({ item, t: world.now })
  if (list.length > 3) list.splice(0, list.length - 3)
}

/** Of what the stranger made for them, the first they still have. */
function inUse(world: World, npcId: string): string | undefined {
  const inventory = world.npcState(npcId).inventory
  return (ownWork(world).given[npcId] ?? []).find((g) => (inventory[g.item] ?? 0) > 0)?.item
}

/** A line under a place (M10.14): someone here uses what the stranger made, once a day each, one a look. */
export function ownWorkLines(world: World, location: string): string[] {
  const state = ownWork(world)
  const today = Math.floor(world.now / (24 * 60))
  for (const id of world.npcsAt(location)) {
    if (state.seen[id] === today || world.npcState(id).activity === 'asleep') continue
    const item = inUse(world, id)
    if (!item) continue
    state.seen[id] = today
    const def = world.content.items.get(item)
    const name = def?.name ?? item
    return [world.say(def?.used ?? `{name} has the ${name} you made close to hand, and it has seen use.`, id).replace('{item}', name)]
  }
  return []
}

/** For the prompt of whoever has it (M10.14): what they use that the stranger made them. */
export function ownWorkPrompt(world: World, npcId: string): string | undefined {
  const item = inUse(world, npcId)
  return item ? `You have and use the ${world.content.items.get(item)?.name ?? item} the stranger made with their own hands and gave you. It may come up.` : undefined
}

/** Lessons a pupil needs, on as many days, before they can do it on their own. */
export const LESSONS = 3

/**
 * TEACH <person> [craft] (M10.14): the stranger, a journeyman or better,
 * teaches someone their craft, two hours a day. After three lessons on three
 * days the pupil can do it on their own: a signal (pupil_learnt), and what
 * follows is content. Whom the stranger teaches must think well enough of them.
 */
export function teach(world: World, pass: (minutes: number) => Output[], npcId: string | undefined, craftWords: string): Output[] {
  if (!npcId) return [{ kind: 'error', text: 'Teach whom? They must be here.' }]
  const npc = world.npc(npcId)
  const name = callName(npc)
  const mine = Object.entries(world.state.player.crafts ?? {}).filter(([id, p]) => world.content.crafts.has(id) && p.rank >= 1)
  if (!mine.length) return [{ kind: 'error', text: 'You have no craft you know well enough to teach: a journeyman can, a novice cannot.' }]
  const w = craftWords.toLowerCase().trim()
  const pick = w ? mine.find(([id]) => id === w || world.content.crafts.get(id)!.name.toLowerCase() === w || world.content.crafts.get(id)!.maker.toLowerCase() === w) : mine.sort((a, b) => b[1].rank - a[1].rank)[0]
  if (!pick) return [{ kind: 'error', text: `You know ${mine.map(([id]) => world.content.crafts.get(id)!.name).join(' and ')} well enough to teach, not that.` }]
  const craft = world.content.crafts.get(pick[0])!
  const s = world.npcState(npcId)
  if (s.activity === 'asleep') return [{ kind: 'error', text: `${name} is asleep.` }]
  if (craft.professions.includes(npc.profession) || (s.crafts?.[craft.id] ?? -1) >= 0) return [{ kind: 'error', text: `${name} knows ${craft.name} already.` }]
  const lessons = ((world.state.player.pupils ??= {})[npcId] ??= {})
  const p = (lessons[craft.id] ??= { lessons: 0, day: -1 })
  const today = Math.floor(world.now / (24 * 60))
  if (p.day === today) return [{ kind: 'error', text: `You taught ${name} today already. Tomorrow.` }]
  const band = attitude(world, npcId).band
  if (band === 'Hostile' || band === 'Unfriendly') return [{ kind: 'error', text: `${name} does not want to learn anything from you.` }]
  const seen = pass(120)
  p.lessons += 1
  p.day = today
  applyEffect(world, npcId, 'affinity', 2)
  if (p.lessons < LESSONS) return [{ kind: 'narration', text: `You spend two hours showing ${name} how ${craft.name} is done. ${name} is getting the hang of it: lesson ${p.lessons} of ${LESSONS}.` }, ...seen]
  // Learnt: they can do it on their own now. What follows is content.
  ;(s.crafts ??= {})[craft.id] = 0
  delete lessons[craft.id]
  queueSignal(world, { kind: 'pupil_learnt', who: [npcId], place: s.location, cause: [], belang: 2, claim: { subject: npcId, key: 'craft', value: craft.name }, watcher: 'rules' })
  return [{ kind: 'narration', text: `The third lesson. At the end ${name} does it without you, start to finish, and looks up grinning. ${name} can do ${craft.name} now, on ${npc.pronoun === 'she' ? 'her' : npc.pronoun === 'he' ? 'his' : 'their'} own.` }, ...seen]
}

/** For the prompt of a pupil (M10.14): the craft they learnt from the stranger. */
export function pupilPrompt(world: World, npcId: string): string | undefined {
  const learnt = Object.keys(world.state.npcs[npcId]?.crafts ?? {}).map((id) => world.content.crafts.get(id)?.name).filter(Boolean)
  return learnt.length ? `The stranger taught you ${learnt.join(' and ')}; you can do it on your own now, and you are proud of it.` : undefined
}

/**
 * The stranger gives someone what a repair of theirs needs (M10.14): the
 * sailcloth for the mill. A small fact, so that when it turns again, the
 * repair names the stranger, and what follows can thank them.
 */
export function helpedRepair(world: World, npcId: string, item: string): void {
  const npc = world.npc(npcId)
  const goals = world.content.professions.get(npc.profession)?.daily_goals ?? []
  for (const g of goals) {
    if (g.type !== 'Repair' || !('object' in g) || !g.object) continue
    const [location, objectId] = g.object.split('/') as [string, string]
    const found = world.object(location, objectId)
    if (!found?.type.repair || !(item in found.type.repair.consumes)) continue
    const thing = found.instance.name ?? `the ${found.type.name}`
    recordFact(world, {
      kind: 'helped_repair',
      about: [npcId, 'player', location],
      place: world.state.player.location,
      belang: 1,
      title: `the stranger bringing what ${thing} needs`,
      text: { precise: `The stranger brought ${callName(npc)} what ${thing} needed to be mended.`, village: `The stranger's been helping ${callName(npc)} with ${thing}.`, far: `A stranger helping with a repair.` },
    })
    return
  }
}

/** Whether the stranger helped with the repair of what stands at this place, lately (M10.14). */
export function strangerHelped(world: World, location: string): boolean {
  return (world.state.news?.facts ?? []).some((f) => f.kind === 'helped_repair' && f.about.includes(location) && world.now - f.t <= 30 * 24 * 60)
}
