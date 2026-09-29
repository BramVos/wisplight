import { z } from 'zod'
import { GameClock } from './clock'
import type { Output } from './commands'
import type { Command } from './parser'
import type { ObjectInstance, ObjectType } from './content'
import { detailHere, sceneryHere } from './looking'
import type { LlmRequest } from './dialogue/llm'
import { worldFrame } from './dialogue/prompt'
import { strangeWords, voiceSummary } from './dialogue/voice'
import { hasOurOaths, outOfCharacter, vocabularyOf } from './dialogue/guard'
import { crossesLimits, worldText } from './safety'
import { add, itemName } from './items'
import { recordFact } from './news'
import { queueSignal } from './signals'
import { repute } from './social/factions'
import { hasWeather, weather } from './weather'
import type { World } from './world'

// Improvisation (M10.16; Bram, 28 September 2026). Some acts the engine does
// not know: milk on the offering tree, a name called into the river, a stone
// turned that nobody gave an affordance. Where the content says a thing, a
// place or an area matters (improvise), the model may step in: two to four
// sentences in the voice of the world, and at most one bounded effect from
// what the content allows; the engine checks it and carries it out. Where the
// rules have an answer, they give it. No count per day: the player's own
// hourly and monthly budget is the limit, as for a talk. Without a model, or
// with the budget spent, the thing's own line from the content, and the game
// says why. Every improvisation is a signal, and the chronicler sees them.

/** What an improvisation may do, as the content allows it. */
const MaySchema = z.union([
  /** Items of the world that may turn up, here or in hand: never a new one. */
  z.object({ item: z.array(z.string()).min(1) }).strict(),
  /** States of the object it may take, as "key:value" ("state:blessed"), from what the content knows. */
  z.object({ state: z.array(z.string()).min(1) }).strict(),
  /** Conditions of the rules the stranger may get: cursed, blessed, cold. */
  z.object({ condition: z.array(z.string()).min(1) }).strict(),
  /** A small shift with a spirit, a faith or a faction (a faction id), at most three either way. */
  z.object({ standing: z.string() }).strict(),
  /** A fact of little weight about it, that the chronicler sees. */
  z.object({ fact: z.literal(true) }).strict(),
])

export const ImproviseSchema = z
  .object({
    /** What it can mean: an offering, a curse, a spirit, lore, a craft. */
    domain: z.enum(['offering', 'curse', 'spirit', 'lore', 'craft']),
    /** What may happen at most, one of these per act; nothing else. */
    may: z.array(MaySchema).default([]),
    /** The line without a model, or with the budget spent: short, and no effect. */
    fallback: z.string(),
    /** Whether what the stranger offers may be spent (the milk poured out): only when the answer says so too. */
    takes: z.boolean().default(false),
  })
  .strict()
export type Improvise = z.infer<typeof ImproviseSchema>
type May = Improvise['may'][number]

/** What an act is done to: an object here, the place, or its area. */
export interface Target {
  kind: 'object' | 'place' | 'area'
  /** The object's key (location/object), the place's id, or the area's. */
  id: string
  /** For watchers of improvisations (the signal's event): the object's type, the place's or the area's id. */
  event: string
  name: string
  location: string
  description: string
}

export interface Improvisable {
  target: Target
  def: Improvise
  verb: string
  words: string
  /** The thing the stranger does it with, when they carry it: the milk they pour. */
  item?: string
}

/** An effect the model proposed. */
export interface ImprovisedEffect {
  kind: 'item' | 'state' | 'condition' | 'standing' | 'fact' | 'nothing'
  id?: string
  delta?: number
  title?: string
}

/** What was improvised, kept for the next act on the same thing and for the chronicler. */
export interface Improvisation {
  t: number
  target: string
  act: string
  narration: string
  effect: string
}

const PREPOSITIONS = /\s+(?:on|onto|at|to|into|in|over|under|beside|by|for|before|across|through)\s+/i

function nameMatches(words: string, instance: ObjectInstance, type: ObjectType): boolean {
  const w = words.toLowerCase().replace(/^(the|a|an)\s+/, '').trim()
  if (!w) return false
  const names = [instance.name, type.name, ...type.aliases].filter((n): n is string => Boolean(n)).map((n) => n.toLowerCase())
  return names.some((n) => n === w || n.endsWith(` ${w}`) || w.endsWith(n))
}

/**
 * Whether an act the rules do not know is one to improvise (M10.16): a verb
 * with a thing or place here, and that thing, the place or its area has an
 * improvise in the content. Undefined otherwise: the rules' own answer stands.
 */
export function improvisable(world: World, command: Command): Improvisable | undefined {
  const args = command.args.join(' ').trim()
  if (!command.verb || !args) return undefined
  const here = world.state.player.location
  const place = world.content.locations.get(here)
  if (!place) return undefined
  // "pour milk on the stone": the stone is what it is done to, the milk what it is done with.
  const parts = args.split(PREPOSITIONS)
  const onto = parts.length > 1 ? parts.at(-1)! : args
  const withWords = parts.length > 1 ? parts.slice(0, -1).join(' ') : ''
  const carried = Object.keys(world.state.player.inventory).find((id) => {
    const w = withWords.toLowerCase().replace(/^(the|a|an|some)\s+/, '')
    const def = world.content.items.get(id)
    return w && def && [def.name, ...(def.aliases ?? [])].some((n) => n.toLowerCase() === w || n.toLowerCase().includes(w))
  })
  const area = world.content.areas.get(place.area)
  const verb = command.raw.trim().split(/\s+/)[0]!.toLowerCase()
  const base = { verb, words: args, ...(carried ? { item: carried } : {}) }
  for (const instance of world.location(here).objects) {
    const type = world.content.objectTypes.get(instance.type)
    if (!type || !nameMatches(onto, instance, type)) continue
    const def = instance.improvise ?? type.improvise ?? place.improvise ?? area?.improvise
    if (!def) return undefined
    return { ...base, def, target: { kind: 'object', id: `${here}/${instance.id}`, event: type.id, name: instance.name ?? `the ${type.name}`, location: here, description: instance.description ?? type.description } }
  }
  const def = place.improvise ?? area?.improvise
  if (!def) return undefined
  const thing = detailHere(world, onto)?.name ?? sceneryHere(world, onto)?.name
  const itself = [place.name, ...place.aliases].some((n) => n.toLowerCase() === onto.toLowerCase().replace(/^(the|a|an)\s+/, ''))
  if (!thing && !itself) return undefined
  return { ...base, def, target: place.improvise ? { kind: 'place', id: here, event: here, name: thing ?? place.name, location: here, description: place.description.day } : { kind: 'area', id: place.area, event: place.area, name: thing ?? area!.name, location: here, description: area!.summary } }
}

/** What was improvised on this thing before (M10.16): the next act goes on from there. */
export function earlierOn(world: World, target: string): Improvisation[] {
  return (world.state.improvisations ?? []).filter((i) => i.target === target).slice(-3)
}

function mayLines(world: World, def: Improvise): string[] {
  return def.may.map((m) => {
    if ('item' in m) return `item: one of ${m.item.join(', ')} turns up (id)`
    if ('state' in m) return `state: the thing takes one of ${m.state.join(', ')} (key:value as id)`
    if ('condition' in m) return `condition: the stranger gets one of ${m.condition.join(', ')} (id)`
    if ('standing' in m) return `standing: ${world.content.factions.get(m.standing)?.name ?? m.standing} (${m.standing}) think a little better or worse of the stranger (id, delta -3 to 3)`
    return 'fact: something worth telling happened here (title)'
  })
}

const IMPROVISE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['narration', 'effect', 'spent'],
  properties: {
    narration: { type: 'string' },
    spent: { type: 'boolean' },
    effect: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'id', 'delta', 'title'],
      properties: { kind: { type: 'string', enum: ['item', 'state', 'condition', 'standing', 'fact', 'nothing'] }, id: { type: 'string' }, delta: { type: 'number' }, title: { type: 'string' } },
    },
  },
}

/** The call to the model: the thing, the act, what it may mean and do, and what happened here before. */
export function improviseRequest(world: World, imp: Improvisable): LlmRequest {
  const clock = new GameClock(world.now)
  const earlier = earlierOn(world, imp.target.id)
  const known = (world.state.player.journal ?? {})
  const lore = [...world.content.topics.values()].filter((t) => known[t.id] !== undefined && (t.id === imp.target.id || imp.target.description.toLowerCase().includes(t.name.toLowerCase()))).slice(0, 3)
  return {
    role: 'voice',
    system: [
      worldText([worldFrame(world.content, world.land), voiceSummary(world.content, world.land)].filter(Boolean).join('\n\n')),
      'YOU TELL WHAT HAPPENS when the stranger does something the game has no rule for, to a thing that matters. Two to four sentences, second person, present tense, in the voice of this world. Tell only what the stranger sees, hears and feels; never explain, never promise, name nobody who is not given here. Then at most one effect, only from MAY, or nothing: most acts change nothing that lasts. JSON only.',
    ].join('\n\n'),
    prompt: [
      `THE THING: ${imp.target.name}. ${imp.target.description.trim()}`,
      `WHAT IT CAN MEAN: ${imp.def.domain}.`,
      `THE STRANGER: ${imp.verb} ${imp.words}.${imp.item ? ` They use ${itemName(world.content, imp.item, 1)}.` : ''}`,
      `NOW: ${clock.parts.dayPart}${hasWeather(world) ? `, ${weather(world)}` : ''}.`,
      ...(lore.length ? [`WHAT THE STRANGER KNOWS OF IT: ${lore.map((t) => t.summary ?? t.name).join(' ')}`] : []),
      ...(earlier.length ? ['BEFORE, HERE (go on from this, do not repeat it):', ...earlier.map((e) => `- ${e.act}: ${e.narration} (${e.effect})`)] : []),
      `MAY (at most one): ${mayLines(world, imp.def).join('; ') || 'nothing'}.`,
      ...(imp.item && imp.def.takes ? [`What the stranger offers may be spent (left, poured out, taken): say so in spent.`] : []),
      'Answer: {"narration": "...", "effect": {"kind": "nothing", "id": "", "delta": 0, "title": ""}, "spent": false}',
    ].join('\n'),
    schemaName: 'improvise',
    schema: IMPROVISE_SCHEMA,
    maxTokens: 400,
    meta: { target: imp.target.id, verb: imp.verb, may: imp.def.may, domain: imp.def.domain },
  }
}

/** Whether an effect is one the content allows here: in MAY, and a thing the world has. */
function allowed(world: World, def: Improvise, e: ImprovisedEffect, target: Target): string | undefined {
  if (e.kind === 'nothing') return undefined
  const may = def.may.find((m): m is May => (e.kind === 'fact' ? 'fact' in m : e.kind in m))
  if (!may) return `${e.kind} is not something this may do`
  if ('item' in may && (!e.id || !may.item.includes(e.id) || !world.content.items.has(e.id))) return `item ${e.id} is not one that may turn up`
  if ('state' in may && (!e.id || !may.state.includes(e.id) || target.kind !== 'object')) return `state ${e.id} is not one it may take`
  if ('condition' in may && (!e.id || !may.condition.includes(e.id) || !world.content.rules?.conditions.some((c) => c.id === e.id))) return `condition ${e.id} is not one the rules allow here`
  if ('standing' in may && (e.id !== may.standing || !world.content.factions.has(may.standing))) return `standing with ${e.id} is not allowed here`
  return undefined
}

/**
 * Reads the model's answer and checks it (M10.16): a narration the guard lets
 * through, and at most one effect in MAY; what is outside is refused and only
 * the narration stays. A problem when the narration will not do: not JSON,
 * across the hard limits (M10.19), or out of the world.
 */
export function readImprovisation(world: World, imp: Improvisable, text: string): { narration: string; effect: ImprovisedEffect; spent: boolean; refused?: string } | { problem: 'schema' | 'limits' | 'invented' } {
  let parsed: { narration?: unknown; effect?: Partial<ImprovisedEffect>; spent?: unknown }
  try {
    parsed = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as typeof parsed
  } catch {
    return { problem: 'schema' }
  }
  const narration = typeof parsed.narration === 'string' ? parsed.narration.trim() : ''
  // The hard limits first (M10.19): such a narration is never shown.
  if (crossesLimits(narration, vocabularyOf(world.content.world, world.content.topics))) return { problem: 'limits' }
  const sentences = narration.split(/(?<=[.!?])\s+/).filter(Boolean).length
  if (!narration || sentences > 5 || narration.split(/\s+/).length > 110 || strangeWords(world, narration).length || outOfCharacter(narration) || hasOurOaths(narration)) return { problem: 'invented' }
  const raw = parsed.effect ?? {}
  const effect: ImprovisedEffect = {
    kind: (['item', 'state', 'condition', 'standing', 'fact', 'nothing'] as const).find((k) => k === raw.kind) ?? 'nothing',
    ...(raw.id ? { id: String(raw.id) } : {}),
    ...(typeof raw.delta === 'number' ? { delta: Math.max(-3, Math.min(3, Math.round(raw.delta))) } : {}),
    ...(raw.title ? { title: String(raw.title).slice(0, 80) } : {}),
  }
  const refused = allowed(world, imp.def, effect, imp.target)
  // What was offered goes only when the answer says so and the content lets it.
  const spent = parsed.spent === true && imp.def.takes && Boolean(imp.item)
  return refused ? { narration, effect: { kind: 'nothing' }, spent, refused } : { narration, effect, spent }
}

/**
 * Carries out an improvisation the engine accepted (M10.16): the effect, a
 * note for the next act here and for the chronicler, and the signal.
 */
export function applyImprovisation(world: World, imp: Improvisable, narration: string, effect: ImprovisedEffect, spent = false): Output[] {
  const out: Output[] = [{ kind: 'narration', text: narration }]
  const what = `${imp.verb} ${imp.words}`
  let fact: string | undefined
  switch (effect.kind) {
    case 'item':
      // A thing of the world, real: in the stranger's hand, found by them.
      add(world.state.player.inventory, effect.id!, 1)
      ;(world.state.player.found ??= []).push(`improvised:${effect.id}:${world.now}`)
      out.push({ kind: 'system', text: `You have ${itemName(world.content, effect.id!, 1)}.` })
      break
    case 'state': {
      const [key, value = 'true'] = effect.id!.split(':') as [string, string]
      const [location, objectId] = imp.target.id.split('/') as [string, string]
      world.objectState(location, objectId)[key] = value === 'true' ? true : value === 'false' ? false : value
      break
    }
    case 'condition': {
      const c = world.state.player.character
      if (c) {
        c.conditions[effect.id!] = 1
        ;(world.state.player.conditionsUntil ??= {})[effect.id!] = world.now + 3 * 24 * 60
      }
      break
    }
    case 'standing':
      repute(world, effect.id!, effect.delta ?? 1, `what you did at ${imp.target.name}`)
      break
    case 'fact': {
      const f = recordFact(world, {
        kind: 'improvised',
        about: [imp.target.kind === 'object' ? imp.target.location : imp.target.id].filter((id) => world.content.locations.has(id) || world.content.topics.has(id) || world.content.areas.has(id)),
        place: imp.target.location,
        belang: 2,
        title: effect.title ?? `the stranger at ${imp.target.name}`,
        text: { precise: `The stranger went to ${imp.target.name} and ${what}. ${narration}`, village: `The stranger was at ${imp.target.name}, doing something odd.`, far: 'A stranger doing odd things at an old place.' },
      })
      fact = f.id
      break
    }
    default:
      break
  }
  // The thing they did it with, spent where it was poured, left or given: when the answer said so and the content lets it.
  if (spent && imp.item) add(world.state.player.inventory, imp.item, -1)
  const list = (world.state.improvisations ??= [])
  list.push({ t: world.now, target: imp.target.id, act: what, narration, effect: effect.kind === 'nothing' ? 'nothing' : `${effect.kind}${effect.id ? ` ${effect.id}` : ''}${effect.delta ? ` ${effect.delta > 0 ? '+' : ''}${effect.delta}` : ''}` })
  if (list.length > 50) list.splice(0, list.length - 50)
  // A signal like any other: with a model, the chronicler has it first in his night run; what he leaves, the content's
  // own aftermath answers (the dog that barks in the night).
  queueSignal(world, { kind: 'improvised', event: imp.target.event, who: ['player'], place: imp.target.location, cause: fact ? [fact] : [], belang: 1, claim: { subject: imp.target.id, key: 'improvised', value: effect.kind }, watcher: 'rules' })
  return out
}

/** Without a model, or when the call failed: the thing's own line, and no effect (M10.16). */
export function improviseFallback(world: World, imp: Improvisable, why?: { kind: string; message: string }): Output[] {
  const own = `this is the game's own line for ${imp.target.name}`
  const note = !why ? undefined : why.kind === 'budget' ? `(The AI budget is used up: ${why.message}; ${own}.)` : why.kind === 'timeout' ? `(The AI took too long; ${own}.)` : why.kind === 'checks' ? `(The AI's answer did not pass the checks; ${own}.)` : `(No answer from the AI: ${why.message}; ${own}.)`
  return [{ kind: 'text', text: imp.def.fallback }, ...(note ? [{ kind: 'system' as const, text: note }] : [])]
}
