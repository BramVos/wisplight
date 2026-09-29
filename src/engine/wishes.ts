import { GameClock } from './clock'
import { crossesLimits, readsAsInstruction } from './safety'
import type { World } from './world'

// A word to the chronicler (M10.24; Bram, 28 September 2026: whoever wants a
// say gets one, in the world, without a menu or sliders). The player writes
// one line in plain words ("more of the sea, less of the Count", "no war this
// season"); it goes into the design log of this game, beside the world's
// (M10.18), and the chronicler reads the newest few at every round, in every
// play mode. It follows them within the frame, the facts and the limits, and
// says in a sentence what it did with each; the chronicle of the game keeps
// that. Without a model nobody reads them, and the page says so.

/** One line of the player's to the chronicler, and what the chronicler did with it, round by round. */
export interface Wish {
  id: string
  t: number
  text: string
  heard: { t: number; text: string }[]
  /** Set aside by the player: no longer read. */
  done?: boolean
}

export interface WishesState {
  seq: number
  notes: Wish[]
}

/** The longest a line may be: one sentence or two. */
export const WISH_CHARS = 200
/** How many of the newest lines the chronicler reads at a round. */
const READ = 3
/** How many of its answers a line keeps. */
const KEPT = 8

function wishes(world: World): WishesState {
  return (world.state.wishes ??= { seq: 0, notes: [] })
}

/** The lines the chronicler reads now: the newest few the player has not set aside. */
export function activeWishes(world: World): Wish[] {
  return (world.state.wishes?.notes ?? []).filter((w) => !w.done).slice(-READ)
}

/**
 * The command CHRONICLER: without words the lines and what came of them;
 * with words a new line; CHRONICLER FORGET sets them all aside.
 */
export function tellChronicler(world: World, words: string): { ok: boolean; text: string } {
  const text = words.trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim()
  if (!text) return { ok: true, text: wishLines(world).join('\n') }
  if (/^(forget|clear|vergeet)$/i.test(text)) {
    for (const w of world.state.wishes?.notes ?? []) w.done = true
    return { ok: true, text: 'The chronicler sets your words aside; the story goes on as it will.' }
  }
  if (text.length > WISH_CHARS) return { ok: false, text: `One line, at most ${WISH_CHARS} characters: what you would like more or less of.` }
  if (crossesLimits(text) || readsAsInstruction(text)) return { ok: false, text: 'The chronicler cannot take that: say what you would like more or less of in the story, within the limits of the game.' }
  const state = wishes(world)
  state.notes.push({ id: `w${++state.seq}`, t: world.now, text, heard: [] })
  return { ok: true, text: `The chronicler will read it at every round: "${text}"` }
}

/** What the chronicler said it did with a line, kept when it is fit to keep. */
export function applyHeard(world: World, heard: readonly { note: string; did: string }[]): number {
  let kept = 0
  for (const h of heard) {
    const wish = world.state.wishes?.notes.find((w) => w.id === h.note && !w.done)
    const text = h.did.trim()
    if (!wish || !text || text.length > 300 || crossesLimits(text) || readsAsInstruction(text)) continue
    wish.heard = [...wish.heard, { t: world.now, text }].slice(-KEPT)
    kept++
  }
  return kept
}

/** The journal page: each line, when it was written, and what the chronicler did with it. */
export function wishLines(world: World, withModel = true): string[] {
  const notes = world.state.wishes?.notes ?? []
  const day = (t: number) => new GameClock(t).short(world.calendar)
  const lines = notes.length
    ? notes.flatMap((w) => [
        `"${w.text}" (${day(w.t)}${w.done ? ', set aside' : ''})`,
        ...(w.heard.length ? w.heard.slice(-3).map((h) => `  ${day(h.t)}: ${h.text}`) : [`  ${w.done ? 'Not read.' : 'Not read yet: the chronicler reads it at its next round.'}`]),
      ])
    : ['You have said nothing to the chronicler.']
  return [
    ...lines,
    '',
    `Type CHRONICLER and one line (what you would like more or less of); the newest ${READ} are read at every round. CHRONICLER FORGET sets them aside.`,
    ...(withModel ? [] : ['Without a model nobody reads them: the world goes on by its rules.']),
  ]
}

/** For the chronicle of the game: every line and what came of it. */
export function wishesChronicle(world: World): string[] {
  const day = (t: number) => new GameClock(t).short(world.calendar)
  return (world.state.wishes?.notes ?? []).flatMap((w) => [`  "${w.text}" (${day(w.t)})`, ...w.heard.map((h) => `    ${day(h.t)}: ${h.text}`)])
}
