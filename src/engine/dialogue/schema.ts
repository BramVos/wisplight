import { z } from 'zod'
import { ACTS } from './acts'
import type { JsonSchema } from './llm'

// The reply schema is built per call: mentioned_topics may only hold topics
// the NPC was allowed to talk about (FO, chapter 10).

export const FAR_KINDS = ['city', 'land', 'sea', 'river', 'lake'] as const

/** Why a talk goes on (M10.8): a quest or a request between you, something new to tell, an offer, a story; or no. */
export const KEEP_TALKING = ['no', 'quest', 'request', 'news', 'offer', 'story'] as const

export const ReplySchema = z.object({
  // The act is the engine's own (it classifies what the player said); older recorded replies still carry one (M10.27).
  act: z.enum(ACTS).optional(),
  reply: z.string().min(1),
  // Older recorded replies have no names; they still replay.
  names: z.array(z.object({ text: z.string(), new_kind: z.enum(['none', ...FAR_KINDS]) })).default([]),
  mentioned_topics: z.array(z.string()),
  effects: z.array(z.object({ type: z.enum(['affinity', 'trust', 'fear']), delta: z.number().int(), reason: z.string() })),
  memory_note: z.string(),
  ends_conversation: z.boolean(),
  // Whether the talk is still about something (M10.8), and what: past the turns a talk starts with, it goes on while so.
  keep_talking: z.enum(KEEP_TALKING).default('no'),
  // A quest action the player's words meant (M7.2); older recorded replies have none.
  quest_action: z.string().default('none'),
  // An offer the player asked for, and one the NPC proposes (M10.3); older replies have neither.
  action: z.string().default('none'),
  propose: z.string().default('none'),
  // One thing the NPC does of its own after the talk (M10.3): tell someone, or go somewhere.
  after: z.object({ kind: z.enum(['none', 'tell', 'visit']), target: z.string() }).default({ kind: 'none', target: 'none' }),
  // What the stranger claims, when the rules could not read it (M10.3, left over): the engine judges it.
  claim: z.object({ subject: z.string(), key: z.string(), value: z.string() }).optional(),
  // Someone new the speaker named (M10.9): a first name, a bond and a place from the lists; name empty for nobody.
  person: z.object({ name: z.string(), pronoun: z.string().default('they'), bond: z.string(), place: z.string(), what: z.string().default('') }).optional(),
})
export type Reply = z.infer<typeof ReplySchema>

export function replyJsonSchema(allowedTopics: string[], questActions: string[] = [], offers: { key: string; decision: 'yes' | 'no' }[] = [], after = false, claim?: { subjects: string[]; keys: readonly string[] }, sketch?: { bonds: string[]; places: string[] }): JsonSchema {
  const yes = offers.filter((o) => o.decision === 'yes').map((o) => o.key)
  return {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'names', 'mentioned_topics', 'effects', 'memory_note', 'ends_conversation', 'keep_talking', ...(questActions.length ? ['quest_action'] : []), ...(offers.length ? ['action', 'propose'] : []), ...(after ? ['after'] : []), ...(sketch ? ['person'] : [])],
    properties: {
      ...(sketch
        ? {
            person: {
              type: 'object',
              additionalProperties: false,
              required: ['name', 'pronoun', 'bond', 'place', 'what'],
              description: 'Someone new you named in reply (see SOMEONE NEW), or name empty and bond none.',
              properties: {
                name: { type: 'string', description: 'A first name only, as in reply; empty for nobody.' },
                pronoun: { type: 'string', enum: ['she', 'he', 'they'] },
                bond: { type: 'string', enum: ['none', ...sketch.bonds] },
                place: { type: 'string', enum: ['none', ...sketch.places] },
                what: { type: 'string', description: 'What they are, in a few words: a bargeman, a weaver.' },
              },
            },
          }
        : {}),
      ...(claim
        ? {
            claim: {
              type: 'object',
              additionalProperties: false,
              required: ['subject', 'key', 'value'],
              description: 'Only if the stranger just told you something is so about a person or place named in this talk: who or what (subject), which key, and the value in the words of the world. Otherwise subject none.',
              properties: { subject: { type: 'string', enum: ['none', ...claim.subjects] }, key: { type: 'string', enum: ['none', ...claim.keys] }, value: { type: 'string' } },
            },
          }
        : {}),
      ...(after
        ? {
            after: {
              type: 'object',
              additionalProperties: false,
              required: ['kind', 'target'],
              description: 'One thing you will do of your own after this talk, or kind none.',
              properties: { kind: { type: 'string', enum: ['none', 'tell', 'visit'] }, target: { type: 'string', enum: ['none', ...allowedTopics] } },
            },
          }
        : {}),
      ...(questActions.length ? { quest_action: { type: 'string', enum: ['none', ...questActions] } } : {}),
      ...(offers.length
        ? {
            action: { type: 'string', enum: ['none', ...offers.map((o) => o.key)], description: 'The offer the player asked for, or none.' },
            propose: { type: 'string', enum: ['none', ...yes], description: 'An offer with decision yes that you suggest yourself, or none.' },
          }
        : {}),
      // No act (M10.27): the engine classifies what the player said and gives it in the prompt; 27 values on every line
      // for nothing the game reads.
      reply: { type: 'string', description: 'As it appears on screen.' },
      names: {
        type: 'array',
        description: 'Every name in reply.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['text', 'new_kind'],
          properties: { text: { type: 'string' }, new_kind: { type: 'string', enum: ['none', ...FAR_KINDS] } },
        },
      },
      mentioned_topics: { type: 'array', items: { type: 'string', enum: allowedTopics.length ? allowedTopics : ['none'] } },
      effects: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'delta', 'reason'],
          properties: {
            type: { type: 'string', enum: ['affinity', 'trust', 'fear'] },
            delta: { type: 'integer' },
            reason: { type: 'string' },
          },
        },
      },
      memory_note: { type: 'string', description: 'One short sentence the character will remember, in the first person.' },
      ends_conversation: { type: 'boolean' },
      keep_talking: { type: 'string', enum: [...KEEP_TALKING], description: 'What this talk is still about between you, or no.' },
    },
  }
}

/** Parses a reply, tolerating a code fence around the JSON. */
export function parseReply(text: string): Reply | undefined {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  try {
    const result = ReplySchema.safeParse(JSON.parse(cleaned))
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

// The brain role picks goals (used from M3). Defined now so the model advice
// can test it.
export function goalJsonSchema(goalTypes: string[], ids: string[]): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['goals', 'mood', 'note'],
    properties: {
      goals: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'target', 'priority', 'why'],
          properties: {
            type: { type: 'string', enum: goalTypes },
            target: { type: 'string', enum: ids.length ? ids : ['none'] },
            priority: { type: 'number' },
            why: { type: 'string' },
          },
        },
      },
      mood: { type: 'string' },
      note: { type: 'string' },
    },
  }
}

export const GoalReplySchema = z.object({
  goals: z.array(z.object({ type: z.string(), target: z.string(), priority: z.number(), why: z.string() })).max(5),
  mood: z.string(),
  note: z.string(),
})
