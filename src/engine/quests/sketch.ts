import type { Location } from '../content'
import { idWordsIn } from '../idwords'
import { crossesLimits, readsAsInstruction } from '../safety'
import type { World } from '../world'

// A quest as the chronicler writes it (M10.25, pulled out for M10.30): words
// and choices, with people and places by the keys the prompt gave, never the
// shape. The engine builds the quest from it: ids, flags, stages that follow
// each other, one deed a stage, the conditions and the way it ends, and what
// each person knows at each stage and may say (M10.30: goal, knows, truths).
// The story round of a new region writes one, the step Stories of the world
// build writes a world's lines, and the night round one made in play; all of
// them read it here, so there is one form.

type Raw = Record<string, unknown>

/** The kinds of quest a sketch may be; `main` is the world's main line (M10.30). */
export const SKETCH_KINDS = ['main', 'request', 'mystery', 'bargain', 'discovery', 'social', 'trial', 'conflict', 'personal'] as const

/** A stage: its journal line, the one deed that completes it, and (M10.30) what to do now and who knows what. */
export interface SketchStage {
  text: string
  /** The command the player types, three to six plain words, a verb first. */
  say: string
  /** The key of the place where it is done. */
  at: string
  /** The key of a person who must be there, or empty. */
  with: string
  /** A skill the deed asks for, or empty. */
  skill: string
  /** What the deed brings, one or two sentences. */
  done: string
  /** What the stranger can do now, one line, for the journal's "Now: ...". */
  goal?: string
  /** What each person knows at this stage and may say, by key. */
  knows?: { who: string; line: string }[]
}

export interface QuestSketch {
  name: string
  kind: string
  summary: string
  /** The key of the one who asks. */
  giver: string
  /** What they say when asking, in their voice. */
  ask: string
  stages: SketchStage[]
  outcome: { name: string; text: string }
  /** How it begins: when the giver is spoken to (talk, the default), when the stranger comes to the first deed's place (place), or from the start of the game (start: the main line). */
  begins?: string
  /** What the world does when the stranger does nothing (M10.30): after so many days, far from its people, it lapses with this line. */
  lapses?: { days: number; text: string }
  /** What the story keeps hidden until a stage (M10.30): the words that give it away, and the stage from which it may be said. */
  truths?: { text: string; words: string[]; from: number }[]
}

const text = { type: 'string' }
const object = (properties: Record<string, unknown>, optional: string[] = []) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties).filter((k) => !optional.includes(k)),
  properties,
})

/**
 * The JSON schema of one sketch, the same for every call that writes one (a
 * schema per kind never changes, M10.28). What came with M10.30 is optional,
 * so the replies recorded before it still read.
 */
export function sketchSchema(): Record<string, unknown> {
  return object(
    {
      name: text,
      kind: { type: 'string', enum: [...SKETCH_KINDS] },
      summary: text,
      giver: text,
      ask: text,
      stages: {
        type: 'array',
        items: object({ text, say: text, at: text, with: text, skill: text, done: text, goal: text, knows: { type: 'array', items: object({ who: text, line: text }) } }, ['goal', 'knows']),
      },
      outcome: object({ name: text, text }),
      begins: { type: 'string', enum: ['talk', 'place', 'start'] },
      lapses: object({ days: { type: 'integer' }, text }),
      truths: { type: 'array', items: object({ text, words: { type: 'array', items: text }, from: { type: 'integer' } }) },
    },
    ['begins', 'lapses', 'truths'],
  )
}

/** A sketch from a model's reply, when it has the parts that matter; else null. */
export function readSketch(value: unknown): QuestSketch | null {
  const v = value as Partial<QuestSketch> | null
  if (!v || typeof v !== 'object' || typeof v.name !== 'string' || typeof v.giver !== 'string' || !Array.isArray(v.stages) || !v.outcome) return null
  return v as QuestSketch
}

/** A line of the chronicler's, when it is fit to keep: short, within the limits, no instruction to a model, and never an id (M10.29 M). */
export function fit(value: unknown, most: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim().replace(/\s+/g, ' ')
  if (!t || t.length > most || crossesLimits(t) || readsAsInstruction(t) || idWordsIn(t).length) return undefined
  return t
}

/** A command as a pattern: the words in order, "the", "a" and "an" optional, and any spacing. */
export function sayPattern(say: string): string | undefined {
  const words = say
    .toLowerCase()
    .replace(/[^a-z0-9' ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const content = words.filter((w) => !['the', 'a', 'an'].includes(w))
  if (content.length < 2 || content.length > 7) return undefined
  const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return content.map(escape).join(' (?:(?:the|a|an) )?')
}

/** What a sketch may use, and how it is built: the keys, the places deeds may move to, the skills, and the bounds. */
export interface SketchScope {
  person: (key: string | undefined) => string | undefined
  place: (key: string | undefined) => string | undefined
  /** The places of the region or world: a deed with someone moves to where they live or work, when that is one of these. */
  places: readonly Pick<Location, 'id'>[]
  skills: ReadonlySet<string>
  dc: number
  minStages: number
  mostStages: number
}

/**
 * A quest from a sketch, as content (QuestSchema), or none when too little of
 * it is fit to keep: the stages that have a journal line, a deed and a place,
 * at least `minStages` of them; each deed sets a flag, the next stage waits
 * for it, the last one ends it.
 */
export function questFromSketch(world: Pick<World, 'content'>, sketch: QuestSketch, id: string, scope: SketchScope): Raw | undefined {
  const content = world.content
  const giver = scope.person(sketch.giver)
  if (!giver) return undefined
  const good = sketch.stages.slice(0, scope.mostStages).filter((s) => fit(s.text, 240) && fit(s.done, 400) && sayPattern(s.say) && scope.place(s.at))
  if (good.length < scope.minStages) return undefined
  const stages: Raw[] = []
  const actions: Raw[] = []
  good.forEach((s, i) => {
    const flag = `${id}_${i + 1}`
    const next = i + 1 < good.length ? [{ when: [{ flag }], to: `s${i + 2}` }] : []
    // What each person knows at this stage and may say (M10.30), by id.
    const knows = Object.fromEntries((s.knows ?? []).flatMap((k) => (scope.person(k.who) && fit(k.line, 300) ? [[scope.person(k.who)!, fit(k.line, 300)!]] : [])))
    const goal = fit(s.goal, 160)
    stages.push({ id: `s${i + 1}`, text: fit(s.text, 240)!, ...(goal ? { goal } : {}), ...(Object.keys(knows).length ? { knows } : {}), next })
    const withWho = scope.person(s.with)
    const skill = s.skill && scope.skills.has(s.skill.trim()) ? s.skill.trim() : undefined
    // Someone who must be there is met where they live or work (M10.25: the harness found a deed at the market
    // with an innkeeper who never leaves the inn): the deed moves to them, or it could never be done.
    const who = withWho ? content.npcs.get(withWho) : undefined
    const at = scope.place(s.at)!
    const where = who && ![who.home, who.work].includes(at) ? (who.work && scope.places.some((l) => l.id === who.work) ? who.work : who.home) : at
    actions.push({
      id: `a${i + 1}`,
      say: [sayPattern(s.say)!],
      intent: fit(s.say, 80)!,
      at: [where],
      ...(withWho ? { with: withWho } : {}),
      when: [...(i > 0 ? [{ flag: `${id}_${i}` }] : []), { not_flag: flag }],
      ...(skill ? { check: { skill, dc: scope.dc }, fail_text: 'It does not come right this time. You may try again.' } : {}),
      effects: [{ set: flag }],
      text: fit(s.done, 400)!,
      once: false,
    })
  })
  const name = fit(sketch.name, 80)
  const summary = fit(sketch.summary, 240)
  const ask = fit(sketch.ask, 400)
  const end = fit(sketch.outcome?.name, 80)
  const endText = fit(sketch.outcome?.text, 400)
  if (!name || !summary || !ask || !end || !endText) return undefined
  // What the story keeps hidden (M10.30): the words that give it away, as patterns, from a stage there is.
  const escape = (w: string) => w.trim().toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  const truths = (sketch.truths ?? []).flatMap((t) => {
    const words = (t.words ?? []).map((w) => fit(w, 40)).filter((w): w is string => Boolean(w) && w!.length >= 3).map(escape)
    const said = fit(t.text, 300)
    const from = Number.isInteger(t.from) && t.from >= 1 && t.from <= good.length ? `s${t.from}` : undefined
    // Without a stage it may be said from, it stays hidden until the quest has ended.
    return said && words.length ? [{ text: said, words, ...(from ? { from } : {}) }] : []
  })
  const lapseText = fit(sketch.lapses?.text, 300)
  const lapses = lapseText && Number.isInteger(sketch.lapses?.days) && sketch.lapses!.days >= 1 && sketch.lapses!.days <= 120 ? { after_days: sketch.lapses!.days, when_far: true, text: lapseText } : undefined
  return {
    id,
    name,
    kind: (SKETCH_KINDS as readonly string[]).includes(sketch.kind) ? sketch.kind : 'request',
    summary,
    givers: [giver],
    // It lies ready until the start, a talk with the giver, or the first deed's place wakes it.
    starts: sketch.begins === 'start' ? { at_start: true } : sketch.begins === 'place' ? { at: [scope.place(good[0]!.at)!], talk: [giver] } : { talk: [giver] },
    ask,
    stages,
    actions,
    outcomes: [{ id: 'done', name: end, text: endText, when: [{ flag: `${id}_${good.length}` }] }],
    ...(truths.length ? { truths } : {}),
    // What the world does when nobody takes it up: it lapses, far from its people, after so many days.
    ...(lapses ? { lapses } : {}),
  }
}
