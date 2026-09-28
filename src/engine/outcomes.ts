import type { Output } from './commands'
import { callName, type Affordance, type Craft, type CraftFailure, type ObjectInstance, type ObjectType } from './content'
import type { CheckResult } from './dialogue/checks'
import { applyEffect } from './dialogue/relations'
import { add } from './items'
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
