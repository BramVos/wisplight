import type { Direction } from './content'

// Turns a line of player input into a command. English is the game language;
// Dutch aliases are accepted as agreed in the design (FO, chapter 9).

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
  'north-east': 'northeast',
  'south-east': 'southeast',
  'south-west': 'southwest',
  'north-west': 'northwest',
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
  op: 'up',
  omhoog: 'up',
  d: 'down',
  down: 'down',
  af: 'down',
  omlaag: 'down',
  in: 'in',
  enter: 'in',
  binnen: 'in',
  out: 'out',
  leave: 'out',
  uit: 'out',
  buiten: 'out',
}

const VERB_ALIASES: Record<string, string> = {
  l: 'look',
  look: 'look',
  kijk: 'look',
  x: 'examine',
  examine: 'examine',
  inspect: 'examine',
  bekijk: 'examine',
  go: 'go',
  ga: 'go',
  enter: 'go',
  exits: 'exits',
  uitgangen: 'exits',
  i: 'inventory',
  inv: 'inventory',
  inventory: 'inventory',
  inventaris: 'inventory',
  take: 'take',
  get: 'take',
  pick: 'take',
  pak: 'take',
  drop: 'drop',
  leg: 'drop',
  give: 'give',
  geef: 'give',
  use: 'use',
  gebruik: 'use',
  buy: 'buy',
  koop: 'buy',
  sell: 'sell',
  verkoop: 'sell',
  list: 'list',
  wares: 'list',
  prices: 'list',
  prijzen: 'list',
  rent: 'rent',
  huur: 'rent',
  eat: 'eat',
  eet: 'eat',
  sleep: 'sleep',
  slaap: 'sleep',
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
  tell: 'tell',
  vertel: 'tell',
  where: 'where',
  waar: 'where',
  persuade: 'persuade',
  overtuig: 'persuade',
  deceive: 'deceive',
  lie: 'deceive',
  lieg: 'deceive',
  intimidate: 'intimidate',
  threaten: 'intimidate',
  bedreig: 'intimidate',
  bribe: 'bribe',
  insight: 'insight',
  read: 'insight',
  journal: 'journal',
  topics: 'journal',
  dagboek: 'journal',
  onderwerpen: 'journal',
  bye: 'bye',
  wake: 'wake',
  wek: 'wake',
  knock: 'knock',
  klop: 'knock',
  aankloppen: 'knock',
  save: 'save',
  bewaar: 'save',
  load: 'load',
  laad: 'load',
  head: 'head',
  walk: 'walk',
  loop: 'walk',
  follow: 'follow',
  volg: 'follow',
  travel: 'travel',
  reis: 'travel',
  map: 'map',
  kaart: 'map',
}

export function parseDirection(word: string | undefined): Direction | undefined {
  return word ? DIRECTION_ALIASES[word.toLowerCase()] : undefined
}

export function parseCommand(input: string): Command {
  const raw = input.trim()
  if (raw.startsWith("'") || raw.startsWith('"')) {
    return { verb: 'say', args: [raw.slice(1).replace(/"$/, '').trim()], raw }
  }

  let [first = '', ...rest] = raw.split(/\s+/)
  let word = first.toLowerCase()
  // "look at the oven", "pick up the knife", "praat met mirte"
  if ((word === 'look' || word === 'kijk') && ['at', 'naar'].includes(rest[0]?.toLowerCase() ?? '')) {
    word = 'examine'
    rest = rest.slice(1)
  } else if (word === 'pick' && rest[0]?.toLowerCase() === 'up') {
    rest = rest.slice(1)
  } else if ((word === 'talk' || word === 'praat') && ['to', 'with', 'met', 'tegen'].includes(rest[0]?.toLowerCase() ?? '')) {
    rest = rest.slice(1)
  }

  const direction = parseDirection(word)
  if (direction && rest.length === 0) return { verb: 'go', args: [direction], raw }

  const verb = VERB_ALIASES[word] ?? word
  if (verb === 'go') {
    const target = parseDirection(rest[0])
    return { verb, args: target ? [target] : rest, raw }
  }
  if (verb === 'look' && rest.length > 0) return { verb: 'examine', args: rest, raw }
  if (verb === 'say') return { verb, args: [rest.join(' ')], raw }
  return { verb, args: rest, raw }
}

/** Splits "2 loaves of bread" or "bread 2" into a quantity and the rest. */
export function splitQuantity(words: string[]): { qty: number | 'all'; text: string } {
  const list = [...words]
  let qty: number | 'all' = 1
  const first = list[0]?.toLowerCase()
  const last = list.at(-1)?.toLowerCase()
  if (first && /^\d+$/.test(first)) {
    qty = Number(first)
    list.shift()
  } else if (first === 'all' || first === 'alle') {
    qty = 'all'
    list.shift()
  } else if (last && /^\d+$/.test(last)) {
    qty = Number(last)
    list.pop()
  }
  return { qty, text: list.join(' ').replace(/^(a|an|the|some|een|de|het)\s+/i, '').replace(/^(loaves|loaf|sacks|sack|baskets|basket|mugs|mug|bundles|bundle|jugs|jug|handfuls|handful) of /i, '') }
}
