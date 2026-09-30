import { saveAbout } from './savefile'
import { questlog } from './quests/engine'
import type { World } from './world'

// Stories with hindsight (M10.30; Bram, 29 September 2026: a world that
// already has a game going gets its stories from where the stranger is, not
// from the beginning). What a game of the world has lived so far, for the
// step Stories: the talks the game keeps per person, what the stranger did
// that the game improvised, and the quests on the go. It reads a save; it
// changes nothing.

/** What a game has lived, for the step Stories. */
export interface PlayedGame {
  /** Where and when the game stands, for the editor: "Orison Listening Room, Restday 22 Rainfall 186 CR". */
  about: string
  /** Per person the stranger talked with (by npc id), the last lines of their talks, the stranger's marked. */
  talks: { npc: string; lines: { you: boolean; text: string }[] }[]
  /** What the stranger did at places that the game improvised: the place (by id) and the deed. */
  deeds: { at: string; act: string }[]
  /** Quests on the go or ended, by id. */
  quests: string[]
}

/** How many people, lines per person and deeds the step reads: enough to know where the stranger is, never the whole game. */
const MOST_PEOPLE = 6
/** The first lines of a person's talks (where they asked the stranger something) and the last (where it stands). */
const FIRST_LINES = 4
const LAST_LINES = 10
const MOST_DEEDS = 8
const LONGEST_LINE = 220

/** What a game has lived: the people talked with most, their last lines, the last deeds. */
export function playedOf(world: World): PlayedGame {
  const about = saveAbout(world)
  const talks = Object.entries(world.state.pastTalks ?? {})
    .filter(([npc, lines]) => lines.length && world.content.npcs.has(npc))
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, MOST_PEOPLE)
    .map(([npc, lines]) => {
      const kept = lines.length > FIRST_LINES + LAST_LINES ? [...lines.slice(0, FIRST_LINES), ...lines.slice(-LAST_LINES)] : lines
      return { npc, lines: kept.map((l) => ({ you: l.you, text: l.text.replace(/\s+/g, ' ').trim().slice(0, LONGEST_LINE) })) }
    })
  const deeds = (world.state.improvisations ?? []).slice(-MOST_DEEDS).map((d) => ({ at: d.target, act: d.act }))
  return { about: `${about.place}, ${about.day}`, talks, deeds, quests: Object.keys(questlog(world)) }
}

/** Whether a game has lived anything the step could begin from. */
export function hasPlayed(played: PlayedGame | undefined): played is PlayedGame {
  return Boolean(played && (played.talks.length || played.deeds.length))
}
