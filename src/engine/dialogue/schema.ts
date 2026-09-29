import { z } from 'zod'
import { ACTS } from './acts'
import type { JsonSchema } from './llm'

// The reply schema of a talk is the same for every call since M10.28; the
// engine checks that mentioned_topics holds only topics the NPC was allowed
// to talk about (FO, chapter 10), and every key against its list.

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

/**
 * The reply schema of a talk (M10.28): the same for every line and every
 * speaker. Anthropic caches the schema ahead of the system part, so a list
 * that changed from line to line (the topics, the offers, the quest actions)
 * made a line write the whole area block again: measured on 29 September
 * 2026, eleven of nineteen lines read nothing from the cache. The keys a line
 * may use are in its message; the engine checks each against them, as before.
 */
export const TALK_REPLY_SCHEMA: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'names', 'mentioned_topics', 'effects', 'memory_note', 'ends_conversation', 'keep_talking'],
  properties: {
    // No act (M10.27): the engine classifies what the player said and gives it in the prompt.
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
    mentioned_topics: { type: 'array', description: 'Ids from KNOWLEDGE or REFERRAL your reply talks about.', items: { type: 'string' } },
    effects: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['type', 'delta', 'reason'],
        properties: { type: { type: 'string', enum: ['affinity', 'trust', 'fear'] }, delta: { type: 'integer' }, reason: { type: 'string' } },
      },
    },
    memory_note: { type: 'string', description: 'One short sentence you will remember, first person: only what was said or done in this talk.' },
    ends_conversation: { type: 'boolean' },
    keep_talking: { type: 'string', enum: [...KEEP_TALKING], description: 'What this talk is still about between you, or no.' },
    quest_action: { type: 'string', description: 'Only with QUEST ACTIONS: its key, or none.' },
    action: { type: 'string', description: 'Only with OFFERS: the key of the offer the player asked for, or none.' },
    propose: { type: 'string', description: 'Only with OFFERS: the key of an offer with decision yes you suggest yourself, or none.' },
    after: {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'target'],
      description: 'Only with AFTER THE TALK: one thing you will do of your own after it, or kind none.',
      properties: { kind: { type: 'string', enum: ['none', 'tell', 'visit'] }, target: { type: 'string', description: 'An id from KNOWLEDGE, PEOPLE YOU KNOW or who is here, or none.' } },
    },
    claim: {
      type: 'object',
      additionalProperties: false,
      required: ['subject', 'key', 'value'],
      description: 'Only with CLAIM, as it says.',
      properties: { subject: { type: 'string' }, key: { type: 'string', enum: ['none', 'at', 'alive', 'state', 'working'] }, value: { type: 'string' } },
    },
    person: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'pronoun', 'bond', 'place', 'what'],
      description: 'Only with SOMEONE NEW, as it says.',
      properties: { name: { type: 'string' }, pronoun: { type: 'string', enum: ['she', 'he', 'they'] }, bond: { type: 'string' }, place: { type: 'string' }, what: { type: 'string' } },
    },
  },
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
// can test it. One schema for every person (M10.28): Anthropic caches the
// output schema ahead of the system part, so a schema with each person's own
// goals and keys was a new prefix every time and the shared part was never
// read back. The goal types are the whole catalogue and the target a plain
// key; what this person may choose and whom they know is in the prompt, and
// validateGoals checks both as it always did.
export function goalJsonSchema(goalTypes: string[], ids: string[] = []): JsonSchema {
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
            target: ids.length ? { type: 'string', enum: ids } : { type: 'string' },
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
