import type { Content } from '../content'
import type { Output } from '../commands'
import type { LlmRequest } from './llm'

// The read score (M10.28; Bram, 29 September 2026: the situation set scores
// words and facts, oaths, names, numbers and restraint, not whether the lines
// read well). One call on the brain per series of answers reads them all and
// gives each 0 to 3 points on four questions, and names the three weakest
// with why. It sits beside the character score in the voice comparison and
// in the model advice; a model clearly below the other on it does not become
// the voice, even when it is cheaper.

/** One answer to read: who spoke (a few lines of their card), what the player said, what came back. */
export interface ReadItem {
  card: string
  said: string
  answer: string
  /** What the speaker was given for this answer (M10.33 W): the facts an answer may hold; the rest is made up. */
  given?: string
}

export interface ReadScore {
  /** The mean of all points over all answers, 0 to 1. */
  score: number
  /** The mean per question, 0 to 3. */
  byQuestion: { person: number; natural: number; answers: number; onward: number }
  /** The three weakest answers, by their number from 1, with why. */
  weakest: { n: number; why: string }[]
  /**
   * Made-up facts per answer (M10.33 W; Bram: "de NPC's verzinnen er op los"): events, decisions, plans, times and
   * reasons that neither what the speaker was given nor the card holds, on average. Only answers read with GIVEN count.
   */
  invented?: number
}

export const READ_QUESTIONS = {
  person: 'sounds like this person of this card, not like anyone',
  natural: 'natural, readable English without filler or a repeated tic',
  answers: 'answers what was asked and adds one thing of its own',
  onward: 'keeps the talk going with a question back or a hook',
} as const

const points = { type: 'integer', minimum: 0, maximum: 3 }

export const READ_SCORE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['answers', 'weakest'],
  properties: {
    answers: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['n', 'person', 'natural', 'answers', 'onward', 'invented'], properties: { n: { type: 'integer' }, person: points, natural: points, answers: points, onward: points, invented: { type: 'integer', minimum: 0, maximum: 9 } } },
    },
    weakest: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'why'], properties: { n: { type: 'integer' }, why: { type: 'string' } } } },
  },
}

const SYSTEM = [
  'You read the answers a character in a text game gave to the player, as an editor who cares how dialogue reads. For each numbered answer give 0 to 3 points on four questions:',
  ...Object.entries(READ_QUESTIONS).map(([key, question]) => `  ${key}: ${question}.`),
  '0 is not at all, 1 barely, 2 mostly, 3 fully. A short answer can score 3 when it fits. Judge these four by the words only.',
  'invented: how many facts the answer states that its GIVEN and the card do not hold: an event, a decision, a plan, a time, a reason. Colour of the speaker\'s own work and of this place does not count. Without GIVEN, 0.',
  'Then name the three weakest answers by number, each with why in one plain sentence.',
  'JSON only.',
].join('\n')

/** The request for one series of answers, on the brain's model at low effort. */
export function readScoreRequest(items: ReadItem[]): LlmRequest {
  const cards = [...new Set(items.map((i) => i.card))]
  return {
    role: 'brain',
    system: SYSTEM,
    // Once a series, and nothing reads it back in five minutes: no mark (M10.27).
    cacheBreak: 0,
    prompt: [
      'THE PEOPLE:',
      ...cards.map((c, i) => `  [${i + 1}] ${c}`),
      '',
      'THE ANSWERS:',
      ...items.map((item, n) => `${n + 1}. [${cards.indexOf(item.card) + 1}] The player: "${item.said}"\n   Answer: ${item.answer}${item.given ? `\n   GIVEN: ${item.given}` : ''}`),
    ].join('\n'),
    schemaName: 'read_score',
    schema: READ_SCORE_SCHEMA,
    maxTokens: 400 + 48 * items.length,
    effort: 'low',
    meta: { count: items.length },
  }
}

/** Reads the reply: the score, or undefined when it cannot be read or skips answers. */
export function readScoreReply(text: string, count: number, given?: boolean[]): ReadScore | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  const r = raw as { answers?: { n?: unknown; person?: unknown; natural?: unknown; answers?: unknown; onward?: unknown }[]; weakest?: { n?: unknown; why?: unknown }[] }
  const keys = ['person', 'natural', 'answers', 'onward'] as const
  const valid = (r.answers ?? []).filter((a) => typeof a.n === 'number' && a.n >= 1 && a.n <= count && keys.every((k) => typeof a[k] === 'number' && (a[k] as number) >= 0 && (a[k] as number) <= 3))
  const seen = new Set(valid.map((a) => a.n))
  if (count === 0 || seen.size < count) return undefined
  const mean = (k: (typeof keys)[number]) => valid.reduce((s, a) => s + (a[k] as number), 0) / valid.length
  const byQuestion = { person: mean('person'), natural: mean('natural'), answers: mean('answers'), onward: mean('onward') }
  const score = (byQuestion.person + byQuestion.natural + byQuestion.answers + byQuestion.onward) / 12
  const weakest = (r.weakest ?? []).filter((w) => typeof w.n === 'number' && typeof w.why === 'string').slice(0, 3).map((w) => ({ n: w.n as number, why: w.why as string }))
  // Made up (M10.33 W): the mean over the answers that were read with what they were given.
  const counted = valid.filter((a) => typeof (a as { invented?: unknown }).invented === 'number' && (given?.[(a.n as number) - 1] ?? false))
  const invented = counted.length ? counted.reduce((s, a) => s + ((a as { invented: number }).invented), 0) / counted.length : undefined
  return { score, byQuestion, weakest, ...(invented !== undefined ? { invented } : {}) }
}

/** Who speaks, in a few lines for the reader: name, who they are, how they speak. */
export function readCard(content: Content, npcId: string): string {
  const npc = content.npcs.get(npcId)
  if (!npc) return npcId
  return [`${npc.name}, ${npc.short}, ${npc.age}.`, npc.speech ? `Speaks: ${npc.speech}` : '', npc.examples?.length ? `Sounds like: "${npc.examples[0]}"` : ''].filter(Boolean).join(' ')
}

/** What came back to a line, as the player read it; a line the rules answered is marked so (M10.28). */
export function answerOf(outputs: Output[]): { answer: string; byModel: boolean } {
  const speech = outputs.filter((o) => o.kind === 'speech')
  return { answer: speech.map((o) => o.text).join(' ') || outputs.map((o) => o.text).join(' ').slice(0, 300), byModel: speech.some((o) => o.source === 'model') }
}
