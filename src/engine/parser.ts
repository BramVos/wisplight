import type { Direction } from './content'

// Turns a line of player input into a command. English is the game language;
// a few Dutch aliases are accepted as agreed in the design (FO, chapter 9).

export interface Command {
  verb: string
  args: string[]
  raw: string
}

const DIRECTION_ALIASES: Record<string, Direction> = {
  n: 'north',
  north: 'north',
  noord: 'north',
  s: 'south',
  south: 'south',
  zuid: 'south',
  e: 'east',
  east: 'east',
  oost: 'east',
  w: 'west',
  west: 'west',
  ne: 'northeast',
  northeast: 'northeast',
  noordoost: 'northeast',
  nw: 'northwest',
  northwest: 'northwest',
  noordwest: 'northwest',
  se: 'southeast',
  southeast: 'southeast',
  zuidoost: 'southeast',
  sw: 'southwest',
  southwest: 'southwest',
  zuidwest: 'southwest',
  u: 'up',
  up: 'up',
  d: 'down',
  down: 'down',
  in: 'in',
  out: 'out',
}

const VERB_ALIASES: Record<string, string> = {
  l: 'look',
  look: 'look',
  kijk: 'look',
  go: 'go',
  ga: 'go',
  walk: 'go',
  exits: 'exits',
  uitgangen: 'exits',
  time: 'time',
  tijd: 'time',
  wait: 'wait',
  wacht: 'wait',
  help: 'help',
  '?': 'help',
  say: 'say',
  zeg: 'say',
  talk: 'talk',
  praat: 'talk',
  ask: 'ask',
  vraag: 'ask',
}

export function parseDirection(word: string | undefined): Direction | undefined {
  return word ? DIRECTION_ALIASES[word.toLowerCase()] : undefined
}

export function parseCommand(input: string): Command {
  const raw = input.trim()
  if (raw.startsWith("'")) {
    return { verb: 'say', args: [raw.slice(1).trim()], raw }
  }

  const [first = '', ...rest] = raw.split(/\s+/)
  const word = first.toLowerCase()

  const direction = parseDirection(word)
  if (direction) return { verb: 'go', args: [direction], raw }

  const verb = VERB_ALIASES[word] ?? word
  if (verb === 'go') {
    const target = parseDirection(rest[0])
    return { verb, args: target ? [target] : rest, raw }
  }
  if (verb === 'say') return { verb, args: [rest.join(' ')], raw }
  return { verb, args: rest, raw }
}
