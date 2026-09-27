import { z } from 'zod'
import { ACTS } from './acts'
import type { JsonSchema } from './llm'

// The reply schema is built per call: mentioned_topics may only hold topics
// the NPC was allowed to talk about (FO, chapter 10).

export const FAR_KINDS = ['city', 'land', 'sea', 'river', 'lake'] as const

export const ReplySchema = z.object({
  act: z.enum(ACTS),
  reply: z.string().min(1),
  // Older recorded replies have no names; they still replay.
  names: z.array(z.object({ text: z.string(), new_kind: z.enum(['none', ...FAR_KINDS]) })).default([]),
  mentioned_topics: z.array(z.string()),
  effects: z.array(z.object({ type: z.enum(['affinity', 'trust', 'fear']), delta: z.number().int(), reason: z.string() })),
  memory_note: z.string(),
  ends_conversation: z.boolean(),
  // A quest action the player's words meant (M7.2); older recorded replies have none.
  quest_action: z.string().default('none'),
  // An offer the player asked for, and one the NPC proposes (M10.3); older replies have neither.
  action: z.string().default('none'),
  propose: z.string().default('none'),
})
export type Reply = z.infer<typeof ReplySchema>

export function replyJsonSchema(allowedTopics: string[], questActions: string[] = [], offers: { key: string; decision: 'yes' | 'no' }[] = []): JsonSchema {
  const yes = offers.filter((o) => o.decision === 'yes').map((o) => o.key)
  return {
    type: 'object',
    additionalProperties: false,
    required: ['act', 'reply', 'names', 'mentioned_topics', 'effects', 'memory_note', 'ends_conversation', ...(questActions.length ? ['quest_action'] : []), ...(offers.length ? ['action', 'propose'] : [])],
    properties: {
      ...(questActions.length ? { quest_action: { type: 'string', enum: ['none', ...questActions] } } : {}),
      ...(offers.length
        ? {
            action: { type: 'string', enum: ['none', ...offers.map((o) => o.key)], description: 'The offer the player asked for, or none.' },
            propose: { type: 'string', enum: ['none', ...yes], description: 'An offer with decision yes that you suggest yourself, or none.' },
          }
        : {}),
      act: { type: 'string', enum: [...ACTS] },
      reply: { type: 'string', description: 'What the player sees: an optional short action, then speech in double quotes.' },
      names: {
        type: 'array',
        description: 'Every name of a person, place or thing in reply, as written.',
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
