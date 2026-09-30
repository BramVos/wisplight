import type { Output } from './commands'
import { exitLockId, objectLockId } from './social/access'
import type { World } from './world'

// A word as a key (M10.30, Bram: can the engine take codes or passwords?).
// What the stranger says to someone, says aloud at a place or types at a
// panel is kept a while: a condition `said` asks for it, for any quest or
// plan, and a lock may take a word as well as a key (`lock.word`), for any
// door or chest. The world's own word for picking a lock (hack, bypass) is
// in its voice kit.

/** How many lines the game keeps. */
const KEPT = 40

/** Words as the game compares them: small letters and digits, one space between. */
export function wordsOf(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Keeps what the stranger said, to whom and where. */
export function noteSaid(world: World, text: string, to?: string): void {
  const words = wordsOf(text)
  if (!words) return
  const said = (world.state.said ??= [])
  said.push({ t: world.now, text: words, ...(to ? { to } : {}), at: world.state.player.location })
  if (said.length > KEPT) said.splice(0, said.length - KEPT)
}

/** Whether the stranger said the word: whole words, to that person, at that place or area, within the hours. */
export function saidHolds(world: World, c: { said: string; to?: string; at?: string; hours?: number }): boolean {
  const word = wordsOf(c.said)
  if (!word) return false
  return (world.state.said ?? []).some(
    (s) =>
      ` ${s.text} `.includes(` ${word} `) &&
      (!c.to || s.to === c.to) &&
      (!c.at || s.at === c.at || world.content.locations.get(s.at)?.area === c.at) &&
      (c.hours === undefined || world.now - s.t <= c.hours * 60),
  )
}

/**
 * Whether the stranger talked with someone (M10.30, retroactive stories): in
 * the talks the game keeps of that person, and with words, about one of them,
 * from either side, as whole words.
 */
export function talkedHolds(world: World, c: { talked: string; about?: string[] }): boolean {
  const lines = world.state.pastTalks?.[c.talked] ?? []
  const words = (c.about ?? []).map(wordsOf).filter(Boolean)
  if (!words.length) return lines.length > 0
  return lines.some((l) => {
    const text = ` ${wordsOf(l.text)} `
    return words.some((w) => text.includes(` ${w} `))
  })
}

/** The locks here that take a word: the doors of this place and the things in it. */
function wordLocks(world: World): { id: string; word: string; text?: string }[] {
  const here = world.state.player.location
  const place = world.content.locations.get(here)
  if (!place) return []
  const doors = Object.entries(place.exits).flatMap(([dir, exit]) => (exit.lock?.word ? [{ id: exitLockId(here, dir), word: exit.lock.word, ...(exit.lock.word_text ? { text: exit.lock.word_text } : {}) }] : []))
  const things = place.objects.flatMap((o) => (o.lock?.word ? [{ id: objectLockId(here, o.id), word: o.lock.word, ...(o.lock.word_text ? { text: o.lock.word_text } : {}) }] : []))
  return [...doors, ...things]
}

/** Whether a lock here takes a word: the game says so at the door. */
export function takesWord(world: World): boolean {
  return wordLocks(world).length > 0
}

/**
 * TYPE 4471, SAY ORISON (M10.30): kept as said, and every lock here that takes
 * those words opens. Nothing when no lock here takes a word, so SAY goes on as
 * it always did; a wrong word at such a lock is said.
 */
export function giveWord(world: World, text: string, typed: boolean): Output[] | undefined {
  noteSaid(world, text)
  const locks = wordLocks(world)
  if (!locks.length) return typed ? [{ kind: 'text', text: 'You type it in. Nothing here takes it.' }] : undefined
  const words = wordsOf(text)
  const opened = locks.filter((l) => wordsOf(l.word) === words || ` ${words} `.includes(` ${wordsOf(l.word)} `))
  if (!opened.length) return [{ kind: 'text', text: typed ? 'Nothing gives. That is not the code.' : 'Nothing gives. That is not the word.' }]
  const out: Output[] = []
  for (const lock of opened) {
    const was = world.state.locks?.[lock.id]
    ;(world.state.locks ??= {})[lock.id] = 'open'
    out.push({ kind: 'text', text: was === 'open' ? 'It is open already.' : (lock.text ?? (typed ? 'It takes the code, and the lock gives.' : 'At the word, the lock gives.')) })
  }
  return out
}

/** The world's own word for a verb of the game, or the verb (M10.30): HACK where the world says so, else PICK. */
export function verbWord(world: World, verb: string): string {
  return world.content.voice?.verb_words[verb]?.[0] ?? verb
}

/** The verb of the game a word of this world stands for, if it is one (HACK is PICK in The Quiet Reach). */
export function gameVerb(world: World, word: string): string | undefined {
  const w = word.toLowerCase()
  return Object.entries(world.content.voice?.verb_words ?? {}).find(([, words]) => words.some((x) => x.toLowerCase() === w))?.[0]
}
