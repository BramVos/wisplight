import { homeOf } from '../layer'
import { tierOf } from '../lod'
import { holds } from '../quests/engine'
import type { Intention } from '../quests/planschema'
import type { Signal } from '../state'
import type { World } from '../world'
import { bindValue, type PlanContext } from '../aftermath'

// Intentions (M8.2; design: signalen en nasleep, "Van doel naar voornemen" and
// "Bijsturing na de review"). An intention is a plan in the content, like the
// standard aftermath, that a brain may choose for a signal about itself: the
// model gets the handful that fit this signal and this person, chooses none
// or one, and fills in its open bindings (who should mediate, where to go).
// The validator only checks the choice and the bindings; the steps are
// content. The chosen intention is a plan with source brain; the daily
// choice takes its next step first. Without a model, custom decides.

const DAY = 24 * 60

/** The bindings of a signal, as the standard aftermath has them. */
export function signalBindings(world: World, signal: Signal): Record<string, string> {
  const bind: Record<string, string> = { signal: signal.id, place: signal.place }
  signal.who.forEach((id, i) => (bind[String.fromCharCode(97 + i)] = id))
  if (signal.who[0]) bind['who'] = signal.who[0]
  if (signal.claim) {
    bind['subject'] = signal.claim.subject
    bind['key'] = signal.claim.key
    bind['value'] = signal.claim.value
    if (signal.claim.subject.includes('#')) bind['at'] = signal.claim.subject.split('#')[0]!
  }
  const area = world.content.locations.get(signal.place)?.area
  if (area) bind['area'] = area
  return bind
}

/** The intentions of the content this person may choose for this signal. */
export function offered(world: World, signal: Signal, npcId: string): Intention[] {
  const bind = { ...signalBindings(world, signal), a: npcId, who: npcId }
  const ctx: PlanContext = { plan: { plan: '', started: world.now, phase: 0, cause: '', groups: {} }, bind, host: { pass: () => [] }, out: [] }
  return [...world.content.intentions.values()]
    .filter((i) => i.signal === signal.kind && (!i.event || i.event === signal.event))
    .filter((i) => i.when.every((c) => holds(world, bindValue(world, c, ctx))))
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** Whether this person's brain gets a turn at a signal: a model, near the player, small news about one person or household. */
export function brainMayChoose(world: World, signal: Signal, npcId: string): boolean {
  return world.aiLive && !signal.rules && signal.scope !== 'many' && signal.belang <= 2 && world.content.npcs.has(npcId) && tierOf(world, npcId) === 'full'
}

/** The lines of the goal request about the signal and the intentions to choose from, with short keys. */
export function intentionLines(world: World, npcId: string, signal: Signal, keyOf: (id: string) => string): string[] {
  const list = offered(world, signal, npcId)
  const name = (id: string) => (id === 'player' ? 'the stranger' : world.content.npcs.has(id) ? world.npc(id).short : (world.content.locations.get(id)?.name ?? id))
  return [
    `WHAT CHANGED FOR YOU: ${signal.kind.replace(/_/g, ' ')}${signal.event ? ` (${signal.event})` : ''}${signal.who.length ? `, about ${signal.who.map(name).join(' and ')}` : ''}, at ${name(signal.place)}.`,
    'YOU MAY TAKE ONE OF THESE INTENTIONS FOR THE COMING DAYS, OR none (then custom decides):',
    ...list.map((i) => `  ${i.id}: ${i.choice.name}. ${i.choice.line}${Object.keys(i.choice.open).length ? ` Fill in: ${Object.entries(i.choice.open).map(([k, kind]) => `${k} (a ${kind} key)`).join(', ')}.` : ''}`),
    ...(list.some((i) => Object.values(i.choice.open).includes('house')) ? [`FREE HOUSES: ${freeHouses(world).map((h) => `${keyOf(h)} ${name(h)}`).join(', ') || 'none'}`] : []),
  ]
}

/** The goal schema with the choice of an intention beside the goals. */
export function withIntention(schema: Record<string, unknown>, choices: string[], keys: string[]): Record<string, unknown> {
  const properties = { ...(schema['properties'] as Record<string, unknown>) }
  properties['intention'] = {
    type: 'object',
    additionalProperties: false,
    required: ['choice', 'fill'],
    properties: {
      choice: { type: 'string', enum: ['none', ...choices] },
      fill: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'key'], properties: { name: { type: 'string' }, key: { type: 'string', enum: keys.length ? keys : ['none'] } } } },
    },
  }
  return { ...schema, properties, required: [...((schema['required'] as string[]) ?? []), 'intention'] }
}

export function freeHouses(world: World): string[] {
  return Object.keys(world.state.layer?.empty ?? {}).sort()
}

/**
 * The brain's choice for a signal: an intention it may choose, with every
 * open binding filled by a person or place it knows or a free house. Starts
 * it as a plan of the brain; anything else is custom's to decide.
 */
export function applyIntention(world: World, npcId: string, signalId: string, reply: unknown, known: { people: string[]; places: string[] }): string[] {
  const signal = signalOf(world, signalId)
  if (!signal) return []
  const answer = reply as { choice?: unknown; fill?: unknown } | undefined
  const choice = typeof answer?.choice === 'string' ? answer.choice : 'none'
  if (choice === 'none') {
    backToRules(world, signalId)
    return []
  }
  const intention = offered(world, signal, npcId).find((i) => i.id === choice)
  if (!intention) {
    backToRules(world, signalId)
    return [`intention ${choice}: not one offered`]
  }
  const fill = Array.isArray(answer?.fill) ? (answer.fill as { name?: unknown; key?: unknown }[]) : []
  const bind: Record<string, string> = { ...signalBindings(world, signal), a: npcId, who: npcId }
  const problems: string[] = []
  for (const [name, kind] of Object.entries(intention.choice.open)) {
    const value = fill.find((f) => f.name === name)?.key
    const ok = typeof value === 'string' && (kind === 'person' ? known.people.includes(value) || value === 'player' : kind === 'place' ? known.places.includes(value) : freeHouses(world).includes(value) || value === homeOf(world, npcId))
    if (!ok) problems.push(`intention ${choice}: ${name} is not a ${kind} they know`)
    else bind[name] = value
  }
  if (problems.length) {
    backToRules(world, signalId)
    return problems
  }
  const subjects = intention.about === 'first' ? [npcId] : signal.who
  ;(world.state.plans ??= []).push({ plan: `intention:${intention.id}`, id: `plan_${(world.state.planSeq = (world.state.planSeq ?? 0) + 1)}`, started: world.now, phase: 0, cause: signal.kind, groups: {}, source: 'brain', topic: intention.topic, subjects, signal: signal.id, steps: {}, expires: world.now + intention.expires * DAY, bind })
  signal.handled = 'brain'
  return []
}

/** The brain made no choice: the signal goes to the standard aftermath after all. */
export function backToRules(world: World, signalId: string): void {
  const signal = signalOf(world, signalId)
  const state = world.state.signals
  if (!signal || !state || state.queue.some((s) => s.id === signalId)) return
  state.queue.push({ ...signal, rules: true, handled: undefined })
}

export function signalOf(world: World, id: string): Signal | undefined {
  return world.state.signals?.log.find((s) => s.id === id) ?? world.state.signals?.queue.find((s) => s.id === id)
}
