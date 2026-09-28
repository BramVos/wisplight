import { z } from 'zod'
import { APP_KNOBS, ENTITY_KINDS, type AppKnobId } from '../engine'

// What the window may send the main process, per channel (M10.19; the
// Electron security checklist). Every argument is checked here before a
// handler sees it, so a renderer that went astray cannot send a path, a
// command or a mountain of data where a world name or a number belongs. The
// handlers still read their arguments carefully; this is the gate in front.

/** A world folder: a name, never a path. */
const world = z.string().regex(/^[a-z0-9_-]{1,64}$/)
const id = z.string().min(1).max(200)
const text = (max: number) => z.string().max(max)
const provider = z.enum(['openai', 'anthropic'])
const role = z.enum(['voice', 'brain', 'chronicler'])
const model = z.string().min(1).max(200)
/** An amount or a number of seconds: the settings keep it within their own bounds; here only a real number passes, never NaN. */
const amount = z.number().finite()
const scope = z.union([z.object({ kind: z.literal('all') }), z.object({ kind: z.literal('loaded') }), z.object({ kind: z.literal('days'), days: z.number().int().min(1).max(100_000) })])
/** Structured data the handler reads with its own schema (edits, a draft, a palette): only its size is checked here. */
const data = (maxChars: number) => z.unknown().refine((value) => value === undefined || JSON.stringify(value).length <= maxChars, { message: `more than ${maxChars} characters` })

/** The arguments of every channel the main process handles. */
export const INPUTS: Record<string, z.ZodType<unknown[]>> = {
  'engine:worlds': z.tuple([]),
  'engine:start': z.tuple([z.union([world, z.literal('')]).optional()]),
  'engine:command': z.tuple([text(10_000)]),
  'engine:page': z.tuple([id]),
  'engine:picture': z.tuple([id]),
  'engine:creation': z.tuple([]),
  'engine:end': z.tuple([]),
  'engine:log-size': z.tuple([scope.optional()]),
  'engine:export-log': z.tuple([scope.optional()]),
  'engine:export-chronicle': z.tuple([]),
  'engine:export-discovered': z.tuple([]),
  // The knobs of the app (M10.20): a known id, a number or null for the default.
  'app:knobs': z.tuple([]),
  'app:set-knob': z.tuple([z.enum(Object.keys(APP_KNOBS) as [AppKnobId, ...AppKnobId[]]), z.number().finite().nullable()]),
  // The saves (M10.20).
  'engine:saves': z.tuple([]),
  'engine:continue': z.tuple([z.union([world, z.literal('')]).optional()]),
  'engine:load-save': z.tuple([z.number().int().nonnegative()]),
  'engine:name-save': z.tuple([z.number().int().nonnegative(), text(200).optional()]),
  'engine:export-save': z.tuple([z.number().int().nonnegative().nullable().optional()]),
  'engine:import-save': z.tuple([]),
  'transcript:get': z.tuple([]),
  'transcript:set': z.tuple([z.boolean(), text(2000).optional()]),
  'transcript:choose': z.tuple([]),
  'dev:view': z.tuple([z.enum(['people', 'background', 'chronicler']), id.optional()]),
  'editor:open': z.tuple([]),
  'editor:worlds': z.tuple([]),
  'editor:worldbook': z.tuple([world]),
  'editor:view': z.tuple([world]),
  'editor:entity': z.tuple([world, z.enum(ENTITY_KINDS), id]),
  'editor:save': z.tuple([world, z.array(z.unknown()).max(2000), z.boolean().optional()]).refine(([, edits]) => JSON.stringify(edits).length <= 5_000_000, { message: 'edits too large' }),
  // The designer types the folder: the editor says what a folder name may be, so any short text passes here.
  'editor:new-world': z.tuple([text(100), text(200)]),
  'editor:simulate': z.tuple([world, z.number().int().min(1).max(3650), z.number().finite()]),
  'editor:draft': z.tuple([world, text(100_000), z.object({ kind: z.enum(ENTITY_KINDS), id }).optional()]),
  'editor:world-step': z.tuple([world, text(200), text(100_000)]),
  'editor:world-fix': z.tuple([world, text(200), text(100_000), data(5_000_000), z.array(text(2000)).max(500)]),
  'editor:enhance': z.tuple([world, text(200), text(100_000)]),
  'editor:open-draft': z.tuple([world, text(200), data(5_000_000).nullable().optional()]),
  'editor:polish': z.tuple([world, z.object({ ids: z.array(id).max(500).optional(), light: z.boolean().optional() }).strict().optional()]),
  'editor:build': z.tuple([world, z.object({ limit: amount.optional(), reset: z.boolean().optional() }).strict().optional()]),
  'editor:design': z.tuple([world, data(200_000).optional()]),
  'editor:save-draft': z.tuple([world, data(5_000_000)]),
  'editor:palette': z.tuple([world, data(200_000).optional()]),
  'editor:save-palette': z.tuple([world, data(200_000)]),
  'editor:propose-palette': z.tuple([world, text(20_000)]),
  'editor:voice': z.tuple([world]),
  'editor:save-voice': z.tuple([world, text(500_000)]),
  'editor:propose-voice': z.tuple([world, text(20_000)]),
  'ai:overview': z.tuple([]),
  'ai:connect': z.tuple([provider, z.string().min(1).max(500)]),
  'ai:disconnect': z.tuple([provider]),
  'ai:models': z.tuple([provider]),
  'ai:refresh': z.tuple([]),
  'ai:advise': z.tuple([provider]),
  'ai:trial': z.tuple([provider, model, role]),
  'ai:compare': z.tuple([role, z.array(z.object({ provider, model })).max(10)]),
  'ai:choose': z.tuple([role, provider, model]),
  'ai:budget': z.tuple([amount]),
  'ai:reply-within': z.tuple([amount]),
  'ai:month-budget': z.tuple([amount.nullable()]),
  'ai:credit': z.tuple([provider, amount.nullable()]),
  'ai:csv': z.tuple([]),
  'ai:log': z.tuple([]),
  'ai:billing': z.tuple([provider]),
  'ai:image-models': z.tuple([provider]),
  'ai:pictures': z.tuple([provider.nullable(), model.optional(), z.enum(['low', 'medium']).optional()]),
  'ai:try-picture': z.tuple([provider, model]),
  // Sent, not asked (ipcMain.on).
  'engine:activity': z.tuple([]),
  'engine:hold': z.tuple([z.boolean()]),
}

/**
 * The arguments of a call, checked (M10.19). A channel without a schema, or
 * arguments that do not fit, throw before the handler runs. The error names
 * the channel and where the arguments went wrong, never what they were: an API
 * key must not end up in a message.
 */
export function checkInput(channel: string, args: unknown[]): unknown[] {
  const schema = INPUTS[channel]
  if (!schema) throw new Error(`No input rule for ${channel}`)
  // Trailing undefined arguments are the same as none.
  let end = args.length
  while (end > 0 && args[end - 1] === undefined) end--
  const parsed = schema.safeParse(args.slice(0, end))
  if (!parsed.success) throw new Error(`Refused input on ${channel}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'arguments'} ${i.code}`).join('; ')}`)
  return parsed.data
}
