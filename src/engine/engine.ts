import { GameClock } from './clock'
import { describeRoom, findNpcHere, runCommand, type CommandHost, type Output } from './commands'
import { callName, type Content } from './content'
import { Dialogue, QUICK_OPTIONS } from './dialogue/conversation'
import { Knowledge } from './dialogue/knowledge'
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './dialogue/llm'
import { attitude } from './dialogue/relations'
import { TopicRegistry } from './dialogue/topics'
import { formatMoney } from './items'
import { parseCommand, parseDirection } from './parser'
import { advance } from './simulation'
import { createInitialState, type GameState } from './state'
import { World } from './world'

export type { Output, OutputKind } from './commands'

// The engine owns the game state. Every input and every model reply is
// written to a log, so a run can be rebuilt exactly: same content, same seed,
// same log, same world.

export type LogEntry = { t: number; k: 'cmd'; v: string } | { t: number; k: 'tick'; v: number } | { t: number; k: 'ai'; v: string | null }

export interface SaveData {
  version: 1
  world: string
  state: GameState
  log: LogEntry[]
}

export interface JournalEntry {
  id: string
  name: string
}

export interface Status {
  location: string
  area: string
  time: string
  money: string
  paused: boolean
  talk?: { npc: string; name: string; call: string; attitude: string; turnsLeft: number; options: string[] }
  journal: { people: JournalEntry[]; places: JournalEntry[]; lore: JournalEntry[]; things: JournalEntry[] }
}

export interface EngineOptions {
  seed?: number
  state?: GameState
  log?: LogEntry[]
  llm?: LlmClient
}

// In a conversation these words are commands; everything else is speech.
const TALK_COMMANDS = new Set([
  'look', 'examine', 'inventory', 'list', 'buy', 'sell', 'give', 'wait', 'time', 'help', 'ask', 'tell', 'where',
  'persuade', 'deceive', 'intimidate', 'bribe', 'insight', 'journal', 'topics', 'bye', 'talk', 'say', 'go',
])

/**
 * A command word can open an ordinary sentence: "Tell me the story of the Haakman.",
 * "Waar kan ik hier brood kopen?", "Wait, what?", "Give me a loaf." Those are speech.
 */
export function soundsLikeSpeech(verb: string, text: string): boolean {
  if (/^\S+[,!]/.test(text)) return true
  const whereIs = /^\S+\s+(is|are|lies|ligt|woont|zit|staat)\b/i
  if (/\?\s*$/.test(text) && !(verb === 'where' && whereIs.test(text)) && !/\s(about|over|naar)\s/i.test(text)) return true
  const second = text.split(/\s+/)[1]?.toLowerCase()
  if (verb !== 'say' && second && ['me', 'us', 'you', 'mij', 'me', 'ons', 'je', 'jij', 'u'].includes(second)) return true
  if (verb === 'where') return !whereIs.test(text)
  if (verb === 'ask' || verb === 'tell') return !/\s(about|over|naar)\s/i.test(text)
  return false
}

export class Engine {
  readonly world: World
  readonly topics: TopicRegistry
  readonly dialogue: Dialogue
  private readonly log: LogEntry[]
  private readonly host: CommandHost
  private llm?: LlmClient

  constructor(
    readonly content: Content,
    options: EngineOptions = {},
  ) {
    const state = options.state ?? createInitialState(content, options.seed ?? 1)
    this.world = new World(content, state)
    this.log = options.log ? [...options.log] : []
    this.host = { world: this.world, pass: (minutes) => this.pass(minutes) }
    this.topics = new TopicRegistry(content)
    this.dialogue = new Dialogue(this.world, this.topics, new Knowledge(this.world, this.topics), () => this.recorder)
    this.llm = options.llm
    this.dialogue.learn(state.player.location, `area_${this.world.location(state.player.location).area}`)
  }

  get state(): GameState {
    return this.world.state
  }

  get clock(): GameClock {
    return new GameClock(this.world.now)
  }

  /** Swap the model at runtime, for instance after the player picks one in the settings. */
  setLlm(llm: LlmClient | undefined): void {
    this.llm = llm
  }

  /** Records every model reply (or failure) in the log, for replays. */
  private get recorder(): LlmClient | undefined {
    const llm = this.llm
    if (!llm) return undefined
    return {
      complete: async (request: LlmRequest): Promise<LlmResponse> => {
        try {
          const response = await llm.complete(request)
          this.log.push({ t: this.world.now, k: 'ai', v: response.text })
          return response
        } catch (error) {
          this.log.push({ t: this.world.now, k: 'ai', v: null })
          throw error
        }
      },
      report: (rejection) => llm.report?.(rejection),
    }
  }

  start(): Output[] {
    const intro = this.content.world.intro?.trim()
    return [...(intro ? [{ kind: 'text' as const, text: intro }] : []), describeRoom(this.world)]
  }

  async handle(input: string): Promise<Output[]> {
    const text = input.trim().slice(0, 500)
    if (!text) return []
    this.log.push({ t: this.world.now, k: 'cmd', v: text })
    const outputs = await this.route(text)
    const talk = this.state.talk
    if (talk && this.state.npcs[talk.npc]?.location !== this.state.player.location) this.state.talk = undefined
    this.dialogue.learn(this.state.player.location, `area_${this.world.location(this.state.player.location).area}`)
    return outputs
  }

  private async route(text: string): Promise<Output[]> {
    const talk = this.state.talk
    const command = parseCommand(text.replace(/^\//, ''))
    const talking = talk && !text.startsWith('/')

    if (talking) {
      if (/^[1-8]$/.test(text)) return this.inConversation(() => this.dialogue.quick(Number(text)))
      if (/^(bye|goodbye|farewell|dag|doei|tot ziens)\b/i.test(text)) return this.dialogue.end()
      const direction = parseDirection(command.args[0])
      const isCommand = TALK_COMMANDS.has(command.verb) && !(command.verb === 'go' && !direction) && !soundsLikeSpeech(command.verb, text)
      if (!isCommand) return this.inConversation(() => this.dialogue.say(talk.npc, text))
    }

    switch (command.verb) {
      case 'talk': {
        const npc = findNpcHere(this.world, command.args.join(' '))
        if (!npc) return [{ kind: 'error', text: command.args.length ? `There is nobody called "${command.args.join(' ')}" here.` : 'Talk to whom?' }]
        this.pass(1)
        return this.dialogue.start(npc)
      }
      case 'bye':
        return this.dialogue.end()
      case 'ask':
      case 'tell':
      case 'where': {
        const parsed = this.target(command.args, command.verb === 'where' ? /^(?:is|are)\s+/i : /^(?:about|over|naar)\s+|\s+(?:about|over|naar)\s+/i)
        if ('error' in parsed) return [{ kind: 'error', text: parsed.error }]
        const run = command.verb === 'ask' ? this.dialogue.ask.bind(this.dialogue) : command.verb === 'tell' ? this.dialogue.tell.bind(this.dialogue) : this.dialogue.where.bind(this.dialogue)
        return this.inConversation(() => run(parsed.npc, parsed.rest))
      }
      case 'say': {
        const words = command.args.join(' ').trim()
        if (!words) return [{ kind: 'error', text: 'Say what?' }]
        const npc = talk?.npc ?? this.onlyNpcHere()
        if (!npc) return [{ kind: 'text', text: `You say: "${words}"` }, { kind: 'narration', text: 'Nobody answers you directly. Try TALK <name>.' }]
        return this.inConversation(() => this.dialogue.say(npc, words))
      }
      case 'persuade':
      case 'deceive':
      case 'intimidate':
      case 'bribe': {
        const parsed = this.target(command.args, /^(?:to|om)\s+|\s+(?:to|om)\s+|\s+(?=\d)/i)
        if ('error' in parsed) return [{ kind: 'error', text: parsed.error }]
        return this.inConversation(() => this.dialogue.influence(command.verb as 'persuade', parsed.npc, parsed.rest))
      }
      case 'insight': {
        const npc = command.args.length ? findNpcHere(this.world, command.args.join(' ')) : (talk?.npc ?? this.onlyNpcHere())
        if (!npc) return [{ kind: 'error', text: 'Read whom?' }]
        return this.dialogue.insight(npc)
      }
      case 'journal':
      case 'topics':
        return [this.dialogue.journal()]
      default: {
        const outputs = runCommand(this.host, command)
        if (command.verb === 'examine') {
          const npc = findNpcHere(this.world, command.args.join(' '))
          if (npc) this.dialogue.learn(npc)
        }
        return outputs
      }
    }
  }

  /** A turn in conversation costs one game minute (FO, chapter 3). */
  private async inConversation(turn: () => Promise<Output[]>): Promise<Output[]> {
    const seen = this.pass(1)
    const outputs = await turn()
    return [...outputs, ...seen]
  }

  /** "mirte about the mill" or, while talking, just "about the mill". */
  private target(args: string[], separator: RegExp): { npc: string; rest: string } | { error: string } {
    const joined = args.join(' ').trim()
    const talk = this.state.talk
    const split = joined.split(separator).filter((part) => part !== undefined)
    if (talk && (separator.test(` ${joined}`) === false || joined.match(separator)?.index === 0 || !findNpcHere(this.world, split[0] ?? ''))) {
      return { npc: talk.npc, rest: joined.replace(separator, '').trim() }
    }
    const npc = findNpcHere(this.world, split[0] ?? '')
    if (!npc) {
      const only = this.onlyNpcHere()
      if (only) return { npc: only, rest: joined.replace(separator, '').trim() }
      return { error: split[0] ? `There is nobody called "${split[0]}" here.` : 'Who do you mean?' }
    }
    return { npc, rest: split.slice(1).join(' ').trim() }
  }

  private onlyNpcHere(): string | undefined {
    const here = this.world.npcsAt(this.state.player.location)
    return here.length === 1 ? here[0] : undefined
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
    const talk = this.state.talk
    const journal: Status['journal'] = { people: [], places: [], lore: [], things: [] }
    for (const id of Object.keys(this.state.player.journal ?? {}).sort()) {
      const kind = this.topics.kind(id)
      const entry = { id, name: this.topics.name(id) }
      if (kind === 'person') journal.people.push(entry)
      else if (kind === 'place' || kind === 'area') journal.places.push(entry)
      else if (kind === 'lore' || kind === 'fact') journal.lore.push(entry)
      else if (kind === 'item') journal.things.push(entry)
    }
    return {
      location: location.name,
      area: this.content.areas.get(location.area)?.name ?? location.area,
      time: this.clock.format(),
      money: formatMoney(this.state.player.money),
      paused: false,
      talk: talk
        ? { npc: talk.npc, name: this.world.npc(talk.npc).short, call: callName(this.world.npc(talk.npc)), attitude: attitude(this.world, talk.npc).band, turnsLeft: talk.turnsLeft, options: QUICK_OPTIONS }
        : undefined,
      journal,
    }
  }

  save(): SaveData {
    return JSON.parse(JSON.stringify({ version: 1, world: this.content.world.id, state: this.state, log: this.log })) as SaveData
  }

  static fromSave(content: Content, save: SaveData, llm?: LlmClient): Engine {
    if (save.world !== content.world.id) throw new Error(`This save belongs to world "${save.world}"`)
    const copy = JSON.parse(JSON.stringify(save)) as SaveData
    return new Engine(content, { state: copy.state, log: copy.log, llm })
  }

  /** Rebuilds a game from its seed and log, feeding recorded model replies back in. */
  static async replay(content: Content, seed: number, log: LogEntry[]): Promise<Engine> {
    const replies = log.filter((e): e is Extract<LogEntry, { k: 'ai' }> => e.k === 'ai').map((e) => e.v)
    const llm: LlmClient | undefined =
      replies.length > 0
        ? {
            complete: async () => {
              const text = replies.shift()
              if (text === undefined || text === null) throw new LlmError('network', 'recorded failure')
              return { text, provider: 'replay', model: 'replay', usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }, latencyMs: 0 }
            },
          }
        : undefined
    const engine = new Engine(content, { seed, llm })
    for (const entry of log) {
      if (entry.k === 'cmd') await engine.handle(entry.v)
      else if (entry.k === 'tick') engine.tick(entry.v)
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
