import { GameClock } from './clock'
import { describeRoom, runCommand, type CommandHost, type Output } from './commands'
import type { Content } from './content'
import { formatMoney } from './items'
import { parseCommand } from './parser'
import { advance } from './simulation'
import { createInitialState, type GameState } from './state'
import { World } from './world'

export type { Output, OutputKind } from './commands'

// The engine owns the game state. Every input is written to a log, so a run
// can be rebuilt exactly: same content, same seed, same inputs, same world.

export type LogEntry = { t: number; k: 'cmd'; v: string } | { t: number; k: 'tick'; v: number }

export interface SaveData {
  version: 1
  world: string
  state: GameState
  log: LogEntry[]
}

export interface Status {
  location: string
  area: string
  time: string
  money: string
  paused: boolean
}

export interface EngineOptions {
  seed?: number
  state?: GameState
  log?: LogEntry[]
}

export class Engine {
  readonly world: World
  private readonly log: LogEntry[]
  private readonly host: CommandHost

  constructor(
    readonly content: Content,
    options: EngineOptions = {},
  ) {
    const state = options.state ?? createInitialState(content, options.seed ?? 1)
    this.world = new World(content, state)
    this.log = options.log ? [...options.log] : []
    this.host = { world: this.world, pass: (minutes) => this.pass(minutes) }
  }

  get state(): GameState {
    return this.world.state
  }

  get clock(): GameClock {
    return new GameClock(this.world.now)
  }

  start(): Output[] {
    const intro = this.content.world.intro?.trim()
    return [...(intro ? [{ kind: 'text' as const, text: intro }] : []), describeRoom(this.world)]
  }

  async handle(input: string): Promise<Output[]> {
    const text = input.trim().slice(0, 500)
    if (!text) return []
    this.log.push({ t: this.world.now, k: 'cmd', v: text })
    return runCommand(this.host, parseCommand(text))
  }

  /** Lets game time pass without a command (the real-time clock). Returns what the player sees. */
  tick(minutes = 1): Output[] {
    if (minutes <= 0) return []
    const last = this.log.at(-1)
    if (last?.k === 'tick') last.v += minutes
    else this.log.push({ t: this.world.now, k: 'tick', v: minutes })
    return this.pass(minutes)
  }

  status(): Status {
    const location = this.world.location(this.state.player.location)
    return {
      location: location.name,
      area: this.content.areas.get(location.area)?.name ?? location.area,
      time: this.clock.format(),
      money: formatMoney(this.state.player.money),
      paused: false,
    }
  }

  save(): SaveData {
    return JSON.parse(JSON.stringify({ version: 1, world: this.content.world.id, state: this.state, log: this.log })) as SaveData
  }

  static fromSave(content: Content, save: SaveData): Engine {
    if (save.world !== content.world.id) throw new Error(`This save belongs to world "${save.world}"`)
    const copy = JSON.parse(JSON.stringify(save)) as SaveData
    return new Engine(content, { state: copy.state, log: copy.log })
  }

  /** Rebuilds a game from its seed and input log. */
  static async replay(content: Content, seed: number, log: LogEntry[]): Promise<Engine> {
    const engine = new Engine(content, { seed })
    for (const entry of log) {
      if (entry.k === 'cmd') await engine.handle(entry.v)
      else engine.tick(entry.v)
    }
    return engine
  }

  /** Runs the world for some minutes and returns the events the player could see. */
  private pass(minutes: number): Output[] {
    advance(this.world, minutes)
    const here = this.state.player.location
    const seen = this.state.events.filter((e) => e.seq > this.state.seenSeq && e.location === here)
    this.state.seenSeq = this.state.eventSeq
    return seen.map((e) => ({ kind: 'narration' as const, text: e.text }))
  }
}
