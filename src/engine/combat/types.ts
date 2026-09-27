import type { Save, Step } from '../rules/schema'

// A fight in turns (FO, chapter 12): three actions a turn, distances instead of
// a grid, Momentum from round two, morale, surrender and the Way of the Grey
// Rider. The whole fight is plain JSON in the game state, so it saves and
// replays like everything else.

export type Side = 'party' | 'foes'
export type FighterState = 'up' | 'waiting' | 'dying' | 'unconscious' | 'dead' | 'fled' | 'surrendered'

export interface FightAttack {
  name: string
  bonus: number
  dice: string
  kind: 'melee' | 'ranged'
  crit?: string
  effect?: { condition: string; value: number; save: Save; dc: number }
  iron?: boolean
  range: 'near' | 'far'
}

export interface FightAbility {
  id: string
  name: string
  actions: number
  uses: 'fight' | 'day' | 'at_will'
  target: 'enemy' | 'ally' | 'self' | 'enemies' | 'allies'
  range: 'engaged' | 'near' | 'far'
  do: Step[]
  dc: number
  /** The level the ability opened at, for how its dice grow. */
  from: number
  used: number
}

export interface Fighter {
  id: string
  name: string
  side: Side
  kind: 'player' | 'beast' | 'human' | 'spirit' | 'undead' | 'fey' | 'npc'
  creature?: string
  npc?: string
  level: number
  hp: number
  maxHp: number
  defence: number
  saves: Record<Save, number>
  perception: number
  attacks: FightAttack[]
  abilities: FightAbility[]
  /** Frightened, Bleeding, Grabbed, Prone, Off-guard, Slowed, Blinded, Sickened: the value. */
  conditions: Record<string, number>
  /** Rounds left for conditions that wear off. */
  timers: Record<string, number>
  buffs: { to: 'attack' | 'defence' | 'damage'; value: number; rounds: number }[]
  /** Where on the line: the party's front row stands at 0, foes come from below zero. */
  pos: number
  row: 'front' | 'back'
  state: FighterState
  joinsAt?: number
  dying?: number
  morale: { courage: number; fleesBelow?: number; surrenders: boolean; never: boolean }
  immune: string[]
  weak: Record<string, number>
  initiative: number
  shieldUp?: boolean
  cover?: boolean
  quarry?: string
  protecting?: string
  reactionUsed?: boolean
  strikes: number
  says: { hit?: string; flee?: string; surrender?: string; down?: string }
  /** Hard to hit while fleeing: it is getting away. */
  fleeing?: boolean
  /** Creatures whose weakness this fighter remembered (Recall). */
  recalled?: string[]
}

export interface Combat {
  id: string
  encounter?: string
  place: string
  /** Where the player came from: fleeing goes back there. */
  from?: string
  round: number
  order: string[]
  turn: number
  /** Actions the player has left this turn. */
  actions: number
  fighters: Fighter[]
  /** Momentum counts from this round; stepping back starts it again. */
  momentumFrom: number
  subdue: boolean
  /** Before blows: a demand the player can pay. */
  parley?: { amount: number; text: string; paid: string }
  over?: 'won' | 'fled' | 'surrendered' | 'lost' | 'paid' | 'talked'
  /** After a win: foes who gave up or lie senseless, waiting for the player's word. */
  prisoners?: string[]
  started: number
  xp: number
}

export interface Line {
  kind: 'narration' | 'check' | 'system'
  text: string
}
