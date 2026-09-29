import { GameClock, weekdayName } from './clock'
import type { Output } from './commands'
import { callName } from './content'
import { knob } from './knobs'
import type { PastTalkLine } from './state'
import type { World } from './world'

// Earlier talks (M10.29 J; Bram's playtest: what did Tessa say yesterday?).
// Per person a ring of the lines of their talks with the stranger, in the
// save: what the stranger said and what came back. The talk window shows the
// last lines of the talk before, faded above the new one, and the person's
// page in the journal has them by day. They never go to the model: the cost
// of a talk stays the same.

/** The last lines of the talk before this one, for the talk window. */
export interface EarlierTalk {
  when: string
  lines: PastTalkLine[]
}

/** How many lines of the talk before the window shows. */
const EARLIER_LINES = 6

/** A command, not words: TALK itself, a goodbye, a number of the quick options. */
const NOT_WORDS = /^(?:talk|bye|goodbye|farewell|\d+)\b/i

/** The day as the journal says it: the weekday and the day of the month. */
export function talkDay(world: World, t: number): string {
  return `${weekdayName(t, world.calendar)} ${new GameClock(t).parts.day}`
}

/** A turn of a talk into the ring of that person: the stranger's words and what they said back, within the knob. */
export function keepPastLines(world: World, npcId: string, typed: string, outputs: Output[]): void {
  const most = knob(world, 'talk.kept_lines')
  const all = (world.state.pastTalks ??= {})
  if (most <= 0) {
    delete all[npcId]
    return
  }
  const ring = (all[npcId] ??= [])
  const words = typed.trim().replace(/^['"]/, '')
  if (words && !NOT_WORDS.test(words)) ring.push({ t: world.now, you: true, text: words })
  for (const o of outputs) if (o.kind === 'speech') ring.push({ t: world.now, you: false, text: o.text })
  if (ring.length > most) ring.splice(0, ring.length - most)
}

/** The last lines of the talk before the one begun at `began`, with its day; nothing when there was none. */
export function earlierTalk(world: World, npcId: string, began: number | undefined): EarlierTalk | undefined {
  const before = (world.state.pastTalks?.[npcId] ?? []).filter((l) => began === undefined || l.t < began)
  const last = before.at(-1)
  if (!last) return undefined
  return { when: talkDay(world, last.t), lines: before.slice(-EARLIER_LINES) }
}

/** The earlier talks by day for the journal (M10.29 J): the newest days first, a few lines of each. */
export function talksByDay(world: World, npcId: string, days = 3, perDay = 6): string[] {
  const ring = world.state.pastTalks?.[npcId] ?? []
  const byDay = new Map<string, PastTalkLine[]>()
  for (const line of ring) {
    const day = talkDay(world, line.t)
    byDay.set(day, [...(byDay.get(day) ?? []), line])
  }
  const who = callName(world.npc(npcId))
  return [...byDay.entries()]
    .slice(-days)
    .reverse()
    // Their line names them already ("Mirte nods.", "Mirte: ..."); the stranger's own words in quotes.
    .flatMap(([day, lines]) => [`${day}:`, ...lines.slice(-perDay).map((l) => `  ${l.you ? `You: "${l.text}"` : l.text.startsWith(who) ? l.text : `${who}: ${l.text}`}`)])
}
