import { z } from 'zod'
import type { SaveData } from './engine'
import type { World } from './world'

// A save as a file (M10.20; Bram, 28 September 2026): one game to keep, to
// send or to bring back, beside the saves in the app's own store. The file is
// JSON: which world and content it was made with, what it is (who, where,
// when), the chronicle of the game as text so a person can read it, and the
// save itself, whole. Reading one checks it with zod and against the world;
// newer content loads it as an old save loads, with its tombstones.

/** What a save is, to choose it by: whose game, where they are, and the day in the world's own calendar. */
export interface SaveAbout {
  character?: string
  place: string
  day: string
}

export function saveAbout(world: World): SaveAbout {
  const character = world.state.player.character?.name
  let place = world.state.player.location
  try {
    place = world.location(place).name
  } catch {
    // A place the content no longer has: its id.
  }
  return { ...(character ? { character } : {}), place, day: world.date() }
}

export const SAVE_FILE_EXTENSION = 'wisplight'

export interface SaveFile {
  format: 'wisplight-save'
  version: 1
  /** The world's id, and its name when saved. */
  world: string
  worldName: string
  /** The content version it was made with (M9.3). */
  content?: string
  name?: string
  /** When it was saved, as an ISO time. */
  saved: string
  about: SaveAbout
  /** The chronicle of the game in Markdown, for people (in the file a line to a line); loading ignores it. */
  chronicle: string
  save: SaveData
}

const AboutSchema = z.object({ character: z.string().max(200).optional(), place: z.string().max(300), day: z.string().max(200) }).strict()

const SaveFileSchema = z
  .object({
    format: z.literal('wisplight-save'),
    version: z.literal(1),
    world: z.string().min(1).max(100),
    worldName: z.string().max(200),
    content: z.string().max(200).optional(),
    name: z.string().max(200).optional(),
    saved: z.string().max(40),
    about: AboutSchema,
    // The chronicle, a line to a line of JSON so the file reads as text (a single string is read as well).
    chronicle: z.union([z.string(), z.array(z.string())]).transform((c) => (Array.isArray(c) ? c.join('\n') : c)),
    save: z
      .object({
        version: z.union([z.literal(1), z.literal(2)]),
        world: z.string(),
        // The state and the log are the engine's own; loading checks them as it loads any save.
        state: z.record(z.string(), z.unknown()),
        log: z.array(z.record(z.string(), z.unknown())),
        tail: z.array(z.record(z.string(), z.unknown())).optional(),
        content: z.string().optional(),
      }),
  })
  .strict()

/**
 * The text of a save file: what it is and the chronicle first, laid out to be
 * read; the save itself on one line after them, as the engine wrote it.
 */
export function saveFileText(file: SaveFile): string {
  const { save, chronicle, ...head } = file
  // Where a save sat in this machine's game log means nothing on another.
  const { session: _, ...portable } = save
  const lines = Object.entries(head).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value, null, key === 'about' ? 2 : undefined).replace(/\n/g, '\n  ')}`)
  const told = chronicle.split('\n').map((line) => `    ${JSON.stringify(line)}`)
  return `{\n${lines.join(',\n')},\n  "chronicle": [\n${told.join(',\n')}\n  ],\n  "save": ${JSON.stringify(portable)}\n}\n`
}

/** A save file read back and checked (M10.20), or why not. */
export function readSaveFile(text: string): { file: SaveFile } | { problem: string } {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { problem: 'This is not a Wisplight save: it is not JSON.' }
  }
  const parsed = SaveFileSchema.safeParse(raw)
  if (!parsed.success) return { problem: `This is not a Wisplight save this version can read (${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.') || 'the file'}: ${i.message}`).join('; ')}).` }
  if (parsed.data.save.world !== parsed.data.world) return { problem: 'This save says it belongs to two worlds.' }
  return { file: parsed.data as unknown as SaveFile }
}

/** The file name of a save: <world>-<character>-<date>.wisplight, in plain letters. */
export function saveFileName(world: string, about: SaveAbout, date: Date): string {
  const plain = (s: string) => s.normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 40)
  const day = date.toISOString().slice(0, 10)
  return `${[plain(world), about.character ? plain(about.character) : '', day].filter(Boolean).join('-')}.${SAVE_FILE_EXTENSION}`
}
