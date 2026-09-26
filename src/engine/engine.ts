import { GameClock } from './clock'
import type { Content, Direction, Location, Npc } from './content'
import { parseCommand, parseDirection } from './parser'

// The engine owns the game state and answers every command without AI.
// Conversations are stubbed until the AI layer arrives in phase 0.

export type OutputKind = 'room' | 'text' | 'system' | 'error'

export interface Output {
  kind: OutputKind
  text: string
}

export interface Status {
  location: string
  time: string
  paused: boolean
}

const HELP = [
  'Commands:',
  '  look (l, kijk)              look around',
  '  north, east, ... (n, e, ...) walk that way; also: go <direction>',
  '  exits                       list the ways out',
  '  time                        what time it is',
  '  wait [minutes]              let time pass (default 10)',
  "  say <text>, 'text           speak",
  '  talk <name>, ask <name> about <topic>',
  '  help                        this list',
].join('\n')

export class Engine {
  readonly clock: GameClock
  private here: string

  constructor(private readonly content: Content) {
    const start = content.world.start
    this.clock = GameClock.from(start.year, start.month, start.day, start.hour, start.minute)
    this.here = start.location
  }

  get location(): Location {
    return this.content.locations.get(this.here)!
  }

  start(): Output[] {
    const intro = this.content.world.intro?.trim()
    return [...(intro ? [{ kind: 'text' as const, text: intro }] : []), this.look()]
  }

  status(): Status {
    return { location: this.location.name, time: this.clock.format(), paused: false }
  }

  handle(input: string): Output[] {
    const command = parseCommand(input)
    switch (command.verb) {
      case '':
        return []
      case 'look':
        return [this.look()]
      case 'go':
        return [this.go(command.args[0])]
      case 'exits':
        return [{ kind: 'text', text: this.exitLine() }]
      case 'time':
        return [{ kind: 'text', text: `It is ${this.clock.format()}.` }]
      case 'wait': {
        const minutes = Math.min(600, Math.max(1, Number(command.args[0]) || 10))
        this.clock.advance(minutes)
        return [{ kind: 'text', text: `Time passes. It is now ${this.clock.format()}.` }]
      }
      case 'help':
        return [{ kind: 'system', text: HELP }]
      case 'say':
      case 'talk':
      case 'ask':
        return [
          {
            kind: 'system',
            text: 'Conversations arrive with the AI layer in phase 0. For now, nobody answers.',
          },
        ]
      default:
        return [{ kind: 'error', text: `You can't "${command.raw}" here. Type HELP for a list of commands.` }]
    }
  }

  private go(word: string | undefined): Output {
    const direction = parseDirection(word)
    if (!direction) return { kind: 'error', text: 'Go where? Try north, east, south or west.' }
    const exit = this.location.exits[direction]
    if (!exit) return { kind: 'error', text: `You can't go ${direction} from here.` }
    this.clock.advance(exit.minutes)
    this.here = exit.to
    return this.look()
  }

  private look(): Output {
    const location = this.location
    const description =
      this.clock.isNight && location.description.night ? location.description.night : location.description.day
    const people = this.npcsHere().map((npc) => npc.short)
    const lines = [location.name, description.trim(), this.exitLine()]
    if (people.length > 0) lines.push(`Here: ${people.join(', ')}.`)
    return { kind: 'room', text: lines.join('\n') }
  }

  private exitLine(): string {
    const directions = Object.keys(this.location.exits) as Direction[]
    return directions.length > 0 ? `Exits: ${directions.join(', ')}` : 'There is no obvious way out.'
  }

  // Placeholder for schedules: NPCs are at work by day and at home by night.
  private npcsHere(): Npc[] {
    const { hour } = this.clock.parts
    const working = hour >= 5 && hour < 21
    return this.content.npcs.filter((npc) => (working ? (npc.work ?? npc.home) : npc.home) === this.here)
  }
}
