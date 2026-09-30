import type { Location } from '../content'
import { idWordsIn } from '../idwords'
import { crossesLimits, readsAsInstruction } from '../safety'
import { wordsOf } from '../said'
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
  /**
   * A stage the stranger has already lived in the game the step was shown
   * (M10.30, retroactive stories): the key of the person it was talked through
   * with, and words from that talk. The stage then also passes by that talk.
   */
  lived?: { who: string; words: string[] }
  /**
   * A word as the deed (M10.31 C): a code or a password the stranger says to
   * the person (with) in a talk, or says or types at the place (at), instead
   * of a command. The line gives it somewhere first: a deed, what someone
   * knows, a secret.
   */
  word?: string
}

/**
 * A way a line may end (M10.30: at least three, as the design asks of every
 * quest): the deed that ends it this way, what came of it, whether it is a
 * solution, and the way it goes (talking, giving or paying, doing something
 * with the world, or a way it goes wrong).
 */
export interface SketchEnding {
  name: string
  text: string
  solution: boolean
  way: string
  say: string
  at: string
  with: string
  skill: string
  /** A word as the deed that ends it (M10.31 C), as a stage's word. */
  word?: string
}

/** The ways an ending goes; `word` since M10.31: a code or a password said or typed. */
export const ENDING_WAYS = ['talk', 'give', 'deed', 'word', 'fail'] as const

export interface QuestSketch {
  name: string
  kind: string
  summary: string
  /** The key of the one who asks. */
  giver: string
  /** What they say when asking, in their voice. */
  ask: string
  stages: SketchStage[]
  /** The one way it ended before M10.30; with `endings`, those take its place. */
  outcome: { name: string; text: string }
  /** The ways it may end (M10.30): the last stage is done by one of their deeds, each to its own outcome. */
  endings?: SketchEnding[]
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
        items: object(
          { text, say: text, at: text, with: text, skill: text, done: text, goal: text, knows: { type: 'array', items: object({ who: text, line: text }) }, lived: object({ who: text, words: { type: 'array', items: text } }), word: text },
          ['goal', 'knows', 'lived', 'word'],
        ),
      },
      outcome: object({ name: text, text }),
      endings: { type: 'array', items: object({ name: text, text, solution: { type: 'boolean' }, way: { type: 'string', enum: [...ENDING_WAYS] }, say: text, at: text, with: text, skill: text, word: text }, ['word']) },
      begins: { type: 'string', enum: ['talk', 'place', 'start'] },
      lapses: object({ days: { type: 'integer' }, text }),
      truths: { type: 'array', items: object({ text, words: { type: 'array', items: text }, from: { type: 'integer' } }) },
    },
    ['endings', 'begins', 'lapses', 'truths'],
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

/** The word of a deed that is a word (M10.31 C): short, letters or digits, never an id; else none. */
export function deedWord(d: { word?: string }): string | undefined {
  const word = fit(d.word, 40)
  return word && wordsOf(word) ? word : undefined
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
 * for it, the last one ends it. With endings (M10.30), the last stage is done
 * by one of theirs instead, each to an outcome of its own.
 */
export function questFromSketch(world: Pick<World, 'content'>, sketch: QuestSketch, id: string, scope: SketchScope): Raw | undefined {
  const content = world.content
  const giver = scope.person(sketch.giver)
  if (!giver) return undefined
  // A word as the deed (M10.31 C): said to someone in a talk, or said or typed at a place.
  const spoken = (d: { at: string; with: string; word?: string }): Raw | undefined => {
    const word = deedWord(d)
    const to = scope.person(d.with)
    const at = scope.place(d.at)
    return word && (to || at) ? { said: word, ...(to ? { to } : { at }) } : undefined
  }
  const doable = (d: { say: string; at: string; with: string; word?: string; done?: string; text?: string }) => Boolean(fit(d.done ?? d.text, 400) && (spoken(d) || (sayPattern(d.say) && scope.place(d.at))))
  const endings = (sketch.endings ?? []).filter((e) => fit(e.name, 80) && doable(e)).slice(0, 5)
  const cut = sketch.stages.slice(0, scope.mostStages)
  // The last stage needs no deed of its own when the endings are its deeds.
  const good = cut.filter((s, i) => fit(s.text, 240) && ((endings.length && i === cut.length - 1) || doable(s)))
  if (good.length < scope.minStages) return undefined
  const stages: Raw[] = []
  const actions: Raw[] = []
  /** The action of one deed; someone who must be there is met where they live or work. */
  const deed = (key: string, d: { say: string; at: string; with: string; skill: string }, text: string, when: Raw[], effects: Raw[]): Raw => {
    const withWho = scope.person(d.with)
    const skill = d.skill && scope.skills.has(d.skill.trim()) ? d.skill.trim() : undefined
    // M10.25: the harness found a deed at the market with an innkeeper who never leaves the inn: it moves to them.
    const who = withWho ? content.npcs.get(withWho) : undefined
    const at = scope.place(d.at)!
    const where = who && ![who.home, who.work].includes(at) ? (who.work && scope.places.some((l) => l.id === who.work) ? who.work : who.home) : at
    return {
      id: key,
      say: [sayPattern(d.say)!],
      intent: fit(d.say, 80)!,
      at: [where],
      ...(withWho ? { with: withWho } : {}),
      when,
      ...(skill ? { check: { skill, dc: scope.dc }, fail_text: 'It does not come right this time. You may try again.' } : {}),
      effects,
      text,
      once: false,
    }
  }
  good.forEach((s, i) => {
    const flag = `${id}_${i + 1}`
    const last = i === good.length - 1
    // A stage lived in a game from before the story (M10.30): it passes by that talk too, and sets its flag, so the next deed opens.
    const livedWith = typeof s.lived?.who === 'string' ? scope.person(s.lived.who) : undefined
    const livedWords = (Array.isArray(s.lived?.words) ? s.lived.words : []).map((w) => fit(w, 40)).filter((w): w is string => Boolean(w) && w!.length >= 3).slice(0, 4)
    const lived = livedWith && livedWords.length ? [{ when: [{ talked: livedWith, about: livedWords }], to: `s${i + 2}`, effects: [{ set: flag }] }] : []
    // A word as the deed: the stage passes when it is said, with what the deed brings.
    const word = spoken(s)
    const next = !last ? [word ? { when: [word], to: `s${i + 2}`, effects: [{ set: flag }, { text: fit(s.done, 400)! }] } : { when: [{ flag }], to: `s${i + 2}` }, ...lived] : []
    // What each person knows at this stage and may say (M10.30), by id.
    const knows = Object.fromEntries((s.knows ?? []).flatMap((k) => (scope.person(k.who) && fit(k.line, 300) ? [[scope.person(k.who)!, fit(k.line, 300)!]] : [])))
    const goal = fit(s.goal, 160)
    stages.push({ id: `s${i + 1}`, text: fit(s.text, 240)!, ...(goal ? { goal } : {}), ...(Object.keys(knows).length ? { knows } : {}), next })
    if ((last && endings.length) || word) return
    actions.push(deed(`a${i + 1}`, s, fit(s.done, 400)!, [...(i > 0 ? [{ flag: `${id}_${i}` }] : []), { not_flag: flag }], [{ set: flag }]))
  })
  // The ways it ends: a deed each, after the stages before the last, to an outcome of its own; one ending only.
  const before = good.length > 1 ? [{ flag: `${id}_${good.length - 1}` }] : []
  const ended = endings.map((_, k) => ({ not_flag: `${id}_end_${k + 1}` }))
  endings.forEach((e, k) => {
    if (!spoken(e)) actions.push(deed(`e${k + 1}`, e, fit(e.text, 400)!, [...before, ...ended], [{ set: `${id}_end_${k + 1}` }]))
  })
  const name = fit(sketch.name, 80)
  const summary = fit(sketch.summary, 240)
  const ask = fit(sketch.ask, 400)
  const end = fit(sketch.outcome?.name, 80)
  const endText = fit(sketch.outcome?.text, 400)
  if (!name || !summary || !ask || (!endings.length && (!end || !endText))) return undefined
  const outcomes = endings.length
    ? endings.map((e, k) => ({ id: `end${k + 1}`, name: fit(e.name, 80)!, text: fit(e.text, 400)!, solution: e.solution !== false, when: spoken(e) ? [...before, spoken(e)!] : [{ flag: `${id}_end_${k + 1}` }] }))
    : [{ id: 'done', name: end, text: endText, when: spoken(good.at(-1)!) ? [...(good.length > 1 ? [{ flag: `${id}_${good.length - 1}` }] : []), spoken(good.at(-1)!)!] : [{ flag: `${id}_${good.length}` }] }]
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
    outcomes,
    ...(truths.length ? { truths } : {}),
    // What the world does when nobody takes it up: it lapses, far from its people, after so many days.
    ...(lapses ? { lapses } : {}),
  }
}

/**
 * What a made line lacks in ways to end (M10.30, the design's chapter 14: at
 * least three real endings per quest): at least three, the lapse counted; at
 * least two solutions by different ways (three for the main line); and at
 * least one where it goes wrong or runs out. A line of one stage, a small
 * request, is enough with two: a solution and one where it goes wrong or runs
 * out (Bram, 30 September 2026). None: it is enough.
 */
export function endingProblems(sketch: QuestSketch): string[] {
  const endings = (sketch.endings ?? []).filter((e) => fit(e.name, 80) && fit(e.text, 400) && (sayPattern(e.say) || deedWord(e)))
  const solutions = endings.filter((e) => e.solution)
  const ways = new Set(solutions.map((e) => e.way))
  const fails = endings.filter((e) => !e.solution).length + (sketch.lapses ? 1 : 0)
  const main = sketch.kind === 'main'
  const small = !main && (Array.isArray(sketch.stages) ? sketch.stages.length : 0) <= 1
  const least = small ? 2 : 3
  const most = main ? 3 : small ? 1 : 2
  const count = endings.length + (sketch.lapses ? 1 : 0)
  const problems: string[] = []
  if (count < least) problems.push(`${sketch.name}: ${count} ways to end, at least ${small ? 'two for a line of one stage' : 'three'} are needed (the lapse counts)`)
  if (solutions.length < most) problems.push(`${sketch.name}: ${solutions.length} solutions, at least ${most === 1 ? 'one is' : `${most} are`} needed${main ? ' for the main line' : ''}`)
  // Two solutions count as two only by different ways (talking, giving or paying, a deed), never as two versions of one talk.
  else if (!small && ways.size < 2) problems.push(`${sketch.name}: every solution goes the same way (${[...ways].join('')}); two ways at least: talking, giving or paying, doing something with the world`)
  if (!fails) problems.push(`${sketch.name}: no ending where it goes wrong or runs out (an ending that is no solution, or a lapse)`)
  return problems
}
