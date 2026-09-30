import { hasCharacters } from './rules/character'
import { regionMap } from './map/region'
import { verbWord } from './said'
import type { World } from './world'

// HELP of this world (M10.33 H). The cause of what the review found (PRAY and
// DEVOTE in a world without faith, USE OVEN BAKE where nothing is baked,
// "Dutch works too" in an English world): HELP was one fixed text for every
// world. Now it is built from what the world has: first five things to start
// with, then a part per subject (HELP MOVING, HELP TALK, ...), each line only
// where the world has what it is about, and with the world's own words for a
// verb (HACK for PICK in the Quiet Reach).

/** The subjects HELP <subject> knows, with the words that ask for them. */
const SUBJECTS: Record<string, string[]> = {
  moving: ['moving', 'move', 'go', 'walking', 'travel', 'map'],
  talk: ['talk', 'talking', 'people', 'conversation'],
  journal: ['journal', 'looking', 'look', 'recall', 'quests'],
  things: ['things', 'thing', 'items', 'trade', 'crafts', 'work'],
  you: ['you', 'me', 'character', 'self'],
  fights: ['fights', 'fight', 'combat'],
  game: ['game', 'time', 'pace', 'save'],
}

function parts(world: World): Record<string, string[]> {
  const c = world.content
  const pick = verbWord(world, 'pick')
  const force = verbWord(world, 'force')
  const map = Boolean(regionMap(c))
  const lines = [...c.passages.values()].map((p) => p.name)
  const hires = [...c.npcs.values()].some((n) => (n.hires ?? []).length > 0)
  const benches = [...c.objectTypes.values()].some((t) => t.affordances.some((a) => a.actors.includes('player') && (a.craft || Object.keys(a.produces).length > 0)))
  const faith = c.world.faiths.length > 0
  const characters = hasCharacters(c)
  const clothes = [...c.items.values()].some((i) => i.tags.includes('clothing'))
  const rooms = [...c.locations.values()].some((l) => l.services.some((s) => s.lodging !== undefined))
  return {
    moving: [
      'Moving: north, south, east, west, up, down, in, out (n, s, e, w, ...), or a way by what it is called (down the ladder). Also: go <place>, exits, walk to <a place of here you have seen or heard of>, plan (the plan of this settlement as you know it), follow <person> (the way they went).',
      ...(map ? ['Across country: head <direction>, walk to <place>, follow <a road or path>. Map: map.'] : []),
      ...(lines.length ? [`Lines: travel to <place> (on foot, or by a line that runs there), take <the line> to <place>, wait for <the line>. Lines here: ${lines.join(', ')}.`] : []),
      ...(hires ? ['Hire: hire <what someone hires out>.'] : []),
    ],
    talk: [
      "Talking: talk <person> (t), then just type what you say; ask <person> about <topic>, say <text> or 'text. Two people talking: listen.",
      'In a talk: persuade, deceive, intimidate, bribe, insight, ask for <thing>, and bye. Your word and theirs: promises.',
    ],
    journal: [
      'Looking: look (l), examine <thing or person> (x), look me. What you know of something: recall <topic> (what everyone here knows is in your journal from the start).',
      'Your journal: journal (j), journal <name> (a page), journal <person> history (every talk with them), quests (what you took up, and what to do now).',
    ],
    things: [
      `Things: inventory (i), take, drop, give <thing> to <person>, use <object>, eat <food>, read <thing>, open <thing>, search (here, or search <spot>), ${pick} <door or chest> (the lock), ${force} <door or chest>.${clothes ? ' Clothes: wear <clothes>, take off <clothes>.' : ''}`,
      `Trade: list (what is for sale here), buy <thing> (or buy 3 <thing>), sell <thing>${rooms ? ', rent a room (a night), rent the room for a week (with a chest)' : ''}.`,
      ...(benches ? ['Crafts: use <workplace> <what to make>, and in a talk with a craftsman: teach me. Also: treat <person or me>, gather <what>, track <person>.'] : ['Also: treat <person or me>, gather <what>, track <person>.']),
      'Work: work (for a day\'s pay), invest <amount>, loads, haul <goods> to <place>, deliver.',
    ],
    you: [
      ...(characters ? ['You: sheet, create (make your character), level up, train <skill>, wield <weapon>, wear <armour>.'] : ['You: look me (how you are), background (who you came as).']),
      ...(faith ? [characters ? 'Faith: pray, devote to <patron>, rite.' : 'Faith: pray.'] : []),
    ],
    fights: characters ? ['Fights: strike, advance, step back, raise shield, use herbs, recall, talk, flee, surrender, end. HELP in a fight says more.'] : [],
    game: [
      'Time: time, wait <minutes>, wait for <person>, sleep. At night: knock (on a door), wake <person>.',
      'Pace: tempo calm, tempo normal or tempo dramatic. The frames of this game: frames. A word to the chronicler: chronicler <one line>. What waits: hooks, proposals, accept, reject.',
      'Game: save, load, continue, new stranger, years later, log <lines>, log export, help.',
    ],
  }
}

/** HELP, or HELP <subject>: five things to start with, then the subjects; or one subject's lines. */
export function helpText(world: World, words = ''): string {
  const all = parts(world)
  const asked = words.trim().toLowerCase()
  const subject = asked ? Object.entries(SUBJECTS).find(([, names]) => names.includes(asked))?.[0] : undefined
  if (subject && all[subject]!.length) return all[subject]!.join('\n')
  const more = Object.keys(SUBJECTS).filter((s) => all[s]!.length).map((s) => `HELP ${s.toUpperCase()}`)
  return [
    ...(asked && !subject ? [`There is no help on "${words.trim()}".`] : []),
    'Five things to start with:',
    '  LOOK (L) to see where you are, and a direction (N, E, IN, UP) to go on.',
    '  TALK <person> (T) to speak with someone; then just type what you say.',
    '  JOURNAL (J) for what you know, and QUESTS for what you took up and what to do now.',
    '  EXAMINE <thing> (X), SEARCH, and USE or READ what a place offers.',
    '  TIME, WAIT and SLEEP to let the day go by.',
    `More: ${more.join(', ')}.`,
  ].join('\n')
}
