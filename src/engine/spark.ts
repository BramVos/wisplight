import { emptyOutput } from '../chronicler/run'
import type { ChronicleOutput, PlanOp } from '../chronicler/types'
import { minuteOfDay } from './clock'
import { callName } from './content'
import { cachedSystem, type LlmRequest } from './dialogue/llm'
import { worldFrame } from './dialogue/prompt'
import { knob } from './knobs'
import { rulePulse, type HookKind } from './pulse'
import { crossesLimits, worldText } from './safety'
import type { ChronicleRun, Storyline } from './state'
import { chronicleState } from './storylines'
import { tideState } from './tides'
import type { World } from './world'

// The spark of a quiet night (M10.27; Bram, 29 September 2026: no call when
// nothing is new is too risky, the stranger must not get bored, certainly not
// when stuck). A night with news does the whole round. A quiet night does not,
// but gets a chance of a small spark round that rises with each quiet night
// in a row (the world knob story.quiet_ladder), a step faster when the
// stranger's quest has not moved for days (story.stuck_days). The spark is
// one small call on the brain model with only the open storylines, the great
// lines and the people near the stranger: one unexpected thing that follows
// from those lines. Someone comes to find them and asks them along, someone
// asks them to go and see someone, a tiding goes round the area, or something
// stays on someone's mind. It is one step of the chronicler's, checked like
// every other (planning.ts), and like a night's work it waits as a proposal in
// the director's play mode. Without a model the rule's pulse does it, from
// the content's own pulse watchers, on the same ladder.

const DAY = 24 * 60

/** What a spark may do: the verbs of the chronicler that bring something to the stranger. */
export const SPARK_VERBS = ['invite', 'request', 'area_news', 'thought'] as const

const RUNGS = ['first', 'second', 'third', 'fourth'] as const

/** Whether the stranger's quest has stood still for days: their newest step in an open quest, that long ago. */
function stuck(world: World): boolean {
  const open = Object.values(world.state.questlog ?? {}).filter((q) => !q.outcome)
  if (!open.length) return false
  return world.now - Math.max(...open.map((q) => q.stageAt)) >= knob(world, 'story.stuck_days') * DAY
}

/** The open storylines a spark may follow from: those with people or places near the stranger first, four at most. */
export function sparkLines(world: World): Storyline[] {
  const area = world.content.locations.get(world.state.player.location)?.area
  const near = (l: Storyline) => l.places.some((p) => world.content.locations.get(p)?.area === area) || l.people.some((n) => world.content.npcs.has(n) && world.content.locations.get(world.npc(n).home)?.area === area)
  const open = chronicleState(world).lines.filter((l) => l.open && l.status !== 'closed')
  return [...open.filter(near), ...open.filter((l) => !near(l))].slice(0, 4)
}

/**
 * At four in the night, after the night round and the pulse (M10.27): a night
 * with news started the whole round, and the ladder starts again. A quiet
 * night climbs it; on a spark the stranger gets one thing, by the model or by
 * the rule. Nothing while the stranger is not playing, or when the pulse
 * brought or asked for something tonight.
 */
export function quietNight(world: World, news: boolean): void {
  if (minuteOfDay(world.now) !== 4 * 60) return
  const state = chronicleState(world)
  const p = world.state.pulse
  if (news || !p) {
    state.quiet = 0
    return
  }
  // The world comes to the stranger while they play (M10.24): someone who has done something since the game began, and
  // lately; not someone who waits out the days. And never in a world that wants no hook to come unasked
  // (story.hooks_per_week at nought).
  if (!p.acted || p.acted <= p.since || world.now - p.acted > 2 * DAY || knob(world, 'story.hooks_per_week') <= 0) return
  if (p.fired.at(-1)?.t === world.now || p.asked === world.now) {
    state.quiet = 0
    return
  }
  state.quiet = (state.quiet ?? 0) + 1
  const rung = Math.min(RUNGS.length, state.quiet + (stuck(world) ? 1 : 0))
  const chance = knob(world, 'story.quiet_ladder')[RUNGS[rung - 1]!]
  if (world.rng.next('spark') >= chance) return
  state.quiet = 0
  const lines = sparkLines(world)
  if (world.aiLive && (lines.length || world.content.tides.size)) {
    state.pending.push({ id: `run_${++state.seq}`, t: world.now, reason: 'spark', lines: lines.map((l) => l.id) })
    return
  }
  rulePulse(world, p.fired.at(-1)?.kind as HookKind | undefined)
}

/**
 * The spark's reply, the same every night (M10.28: a schema that changes from
 * call to call breaks what the cache holds). The keys are in the prompt;
 * readSpark takes only those.
 */
export const SPARK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['line', 'verb', 'who', 'target', 'detail'],
  properties: {
    line: { type: 'string', description: 'A key from STORYLINES.' },
    verb: { type: 'string', enum: [...SPARK_VERBS] },
    who: { type: 'string', description: 'A key from PEOPLE, or none.' },
    target: { type: 'string', description: 'A key from PEOPLE, PLACES or AREAS, or none.' },
    detail: { type: 'string' },
  },
}

/** The short keys of a spark: storylines, people, places and areas, so the model answers in keys. */
interface SparkKeys {
  lines: Record<string, string>
  people: Record<string, string>
  places: Record<string, string>
  areas: Record<string, string>
}

/**
 * The spark's call (M10.27): on the brain model, small, with no cache mark
 * (one a night at most). The frame and the task first; then the storylines,
 * the great lines, the people and places near the stranger, and what came
 * their way lately.
 */
export function sparkRequest(world: World, run: ChronicleRun): { request: LlmRequest; keys: SparkKeys } {
  const here = world.content.locations.get(world.state.player.location)
  const area = here?.area
  const lines = run.lines.map((id) => chronicleState(world).lines.find((l) => l.id === id)).filter((l): l is Storyline => Boolean(l))
  const people = Object.keys(world.state.npcs)
    .sort()
    .filter((id) => {
      if (!world.content.npcs.has(id) || !world.alive(id)) return false
      const npc = world.npc(id)
      const s = world.state.npcs[id]!
      return !npc.child && !npc.creature && !s.absent && (world.content.locations.get(s.location)?.area === area || lines.some((l) => l.people.includes(id)))
    })
    .slice(0, 12)
  const places = [...new Set([...[...world.content.locations.values()].filter((l) => l.area === area && l.tags.includes('public')).map((l) => l.id), ...lines.flatMap((l) => l.places)])].filter((id) => world.content.locations.has(id)).slice(0, 10)
  const areas = [...new Set([area, ...places.map((p) => world.content.locations.get(p)?.area)].filter((a): a is string => Boolean(a && world.content.areas.has(a))))]
  const keyed = (ids: string[], prefix: string) => Object.fromEntries(ids.map((id, i) => [`${prefix}${i + 1}`, id]))
  const keys: SparkKeys = { lines: keyed(lines.map((l) => l.id), 's'), people: keyed(people, 'p'), places: keyed(places, 'l'), areas: keyed(areas, 'a') }
  const back = (map: Record<string, string>) => Object.fromEntries(Object.entries(map).map(([k, id]) => [id, k]))
  const [lineKey, personKey, placeKey, areaKey] = [back(keys.lines), back(keys.people), back(keys.places), back(keys.areas)]
  const tides = [...world.content.tides.values()].map((t) => `${t.name}: ${tideState(world, t.id).stage}`)
  const lately = (world.state.pulse?.fired ?? []).slice(-3).map((f) => f.kind)
  return {
    keys,
    request: {
      role: 'brain',
      ...cachedSystem(
        [
          worldText(worldFrame(world.content, world.land)),
          '',
          'A QUIET NIGHT in a text game: nothing new has happened near the stranger. You bring ONE small unexpected thing that follows from the storylines below, so the stranger has something to go after in the morning. Choose one verb:',
          '- invite: someone (who) finds the stranger and asks them along to a place (target); detail: what they say, one sentence.',
          '- request: someone (who) asks the stranger to go and see someone (target); detail: what they say, one sentence.',
          '- area_news: a tiding goes round an area (target); detail: the news as people there say it, one sentence.',
          '- thought: something stays on someone\'s mind (who) that they may tell the stranger; detail: the thought, addressed to them.',
          'Only people and places from the lists, and nothing that did not happen: it follows from what the storylines say is open. Never a death. Plain words, the tone of the world. JSON only.',
        ].join('\n'),
        '',
        '',
        'none',
      ),
      prompt: [
        `NOW: the stranger is at ${here?.name ?? 'a place'}${area ? ` in ${world.content.areas.get(area)?.name ?? area}` : ''}.`,
        'STORYLINES:',
        ...lines.map((l) => `  ${lineKey[l.id]} "${l.title}"${l.phase ? ` (${l.phase})` : ''}: ${l.summary.join(' ')}${l.hooks.length ? ` Open: ${l.hooks.join('; ')}.` : ''}${l.next ? ` Next: ${l.next}` : ''}`),
        ...(tides.length ? [`GREAT LINES: ${tides.join('; ')}.`] : []),
        `PEOPLE: ${people.map((id) => `${personKey[id]} ${callName(world.npc(id))} (${world.npc(id).short}, at ${world.content.locations.get(world.state.npcs[id]!.location)?.name ?? '?'})`).join('; ') || 'nobody'}.`,
        `PLACES: ${places.map((id) => `${placeKey[id]} ${world.content.locations.get(id)!.name}`).join('; ') || 'none'}.`,
        `AREAS: ${areas.map((id) => `${areaKey[id]} ${world.content.areas.get(id)!.name}`).join('; ')}.`,
        ...(lately.length ? [`LATELY THE STRANGER GOT: ${lately.join(', ')}. Bring something else.`] : []),
      ].join('\n'),
      schemaName: 'spark',
      schema: SPARK_SCHEMA,
      maxTokens: 250,
      meta: { lines: Object.keys(keys.lines), people: Object.keys(keys.people), places: Object.keys(keys.places), areas: Object.keys(keys.areas) },
    },
  }
}

/**
 * The spark's answer as the chronicler's output (M10.27): one beat of the
 * storyline it follows from, with one step. The engine then checks and starts
 * it as it does every step of the chronicler's; null when it cannot be read
 * or does not fit.
 */
export function readSpark(text: string, keys: SparkKeys): { output: ChronicleOutput | null; problems: string[] } {
  let reply: { line?: string; verb?: string; who?: string; target?: string; detail?: string }
  try {
    reply = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as typeof reply
  } catch {
    return { output: null, problems: ['the spark is not JSON'] }
  }
  const line = keys.lines[reply.line ?? '']
  const verb = SPARK_VERBS.find((v) => v === reply.verb)
  const who = keys.people[reply.who ?? '']
  const target = keys.people[reply.target ?? ''] ?? keys.places[reply.target ?? ''] ?? keys.areas[reply.target ?? '']
  const detail = (reply.detail ?? '').trim()
  const problems: string[] = []
  if (!line) problems.push('the spark follows from no storyline of the list')
  if (!verb) problems.push(`the spark's verb ${reply.verb} is not one it may use`)
  if (verb !== 'area_news' && !who) problems.push('the spark names nobody from the list')
  if (verb !== 'thought' && !target) problems.push('the spark has no target from the list')
  if (!detail || detail.length > 300) problems.push('the spark says nothing, or too much')
  const crossed = crossesLimits(detail)
  if (crossed) problems.push(`the spark crosses the hard limits (${crossed})`)
  if (problems.length) return { output: null, problems }
  const plan: PlanOp = { line, name: 'a spark on a quiet night', phases: [], steps: [{ after: 1, verb: verb!, who: who ? [who] : [], ...(target ? { target } : {}), detail }] }
  return { output: { ...emptyOutput(), plans: [plan] }, problems: [] }
}
