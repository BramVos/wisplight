import { z } from 'zod'

// The voice kit of a world (M10.10; FO, chapters 10 and 16): how people here
// swear, what they say, how they call a stranger, how they tell time and
// distance, and what does not exist here. Content, in
// content/<world>/data/voice.yaml; the prompt, the guard, the chronicler and
// the writing help all read it.

const Id = z.string().regex(/^[a-z0-9_]+$/)

/** A form of address: one for all, or "she/he/they" by the listener's pronoun: "goodwife/goodman/good traveller". */
const Address = z.array(z.string()).default([])

export const VoiceSchema = z
  .object({
    oaths: z.record(z.string(), z.array(z.string())).default({}).describe('Exclamations and oaths per faith (the faith ids of world.yaml): the only ones people here swear by.'),
    sayings: z.array(z.string()).default([]).describe('Sayings and proverbs of the whole region.'),
    groups: z
      .array(
        z
          .object({
            id: Id,
            name: z.string(),
            sayings: z.array(z.string()).default([]),
            oaths: z.array(z.string()).default([]).describe('What this group exclaims, next to the oaths of their faith (M10.20: the technicians of The Quiet Reach say "Hull and vacuum").'),
            areas: z.array(z.string()).default([]).describe('Who lives in these areas speaks so, unless their trade puts them in another group.'),
            professions: z.array(z.string()).default([]),
          })
          .strict(),
      )
      .default([]).describe('Groups who speak their own way: by where they live or what they do, or an NPC\'s own `voice`.'),
    default_group: z.string().optional().describe('The group of everyone else.'),
    address: z.object({ stranger: Address, known: Address, friend: Address, high: Address }).strict().default({ stranger: [], known: [], friend: [], high: [] }).describe('How people call the listener: a stranger, someone they know, a friend, someone of standing.'),
    time: z.array(z.string()).default([]).describe('How people here tell the time: "at the third bell". Money comes from world.yaml.'),
    distance: z.array(z.string()).default([]).describe('How people here tell distance: "an hour\'s walk", "two locks on".'),
    measures: z.array(z.string()).default([]).describe('The measures people here use for weight, length and volume.'),
    not_here: z.array(z.object({ word: z.string().min(1), instead: z.string().optional() }).strict()).default([]).describe('What does not exist here, and what people say instead. A word with a capital (a month, a weekday) is only that word with its capital; one without an alternative makes the game ask the reply again.'),
  })
  .strict()
export type Voice = z.infer<typeof VoiceSchema>
