import { GameClock } from './clock'
import { describeRoom, findNpcAnywhere, findNpcHere, runCommand, type CommandHost, type Output } from './commands'
import { callName, type Content } from './content'
import { Dialogue, QUICK_OPTIONS } from './dialogue/conversation'
import { Knowledge } from './dialogue/knowledge'
import type { ChronicleOutput, ChroniclerRequest } from '../chronicler'
import { applyRun, settleRuns, writeRun } from './chronicler'
import { applyChoice, goalRequest, settleChoices } from './npc/goals'
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './dialogue/llm'
import { attitude } from './dialogue/relations'
import { TopicRegistry } from './dialogue/topics'
import { formatMoney } from './items'
import { chronicleText } from './chronicle'
import { journalPage, type JournalPage } from './journal'
import { die } from './life'
import { knownRequests, requestName } from './requests'
import { recordFact, seedNews } from './news'
import { parseCommand, parseDirection } from './parser'
import { advance } from './simulation'
import { createInitialState, type GameState, type WorldEvent } from './state'
import { World } from './world'

export type { Output, OutputKind } from './commands'

// The engine owns the game state. Every input and every model reply is
// written to a log, so a run can be rebuilt exactly: same content, same seed,
// same log, same world.

export type LogEntry =
  | { t: number; k: 'cmd'; v: string }
  | { t: number; k: 'tick'; v: number }
  | { t: number; k: 'ai'; v: string | null }
  // Whether a model was connected from this point on, so a replay makes the same calls.
  | { t: number; k: 'llm'; v: 'on' | 'off' }
  // A chronicler run, applied at this point: what the model wrote (checked later again), or null for templates.
  | { t: number; k: 'chron'; run: string; v: ChronicleOutput | null }
  // A goal choice of the brain, applied at this point: the model's reply (validated again), or null.
  | { t: number; k: 'goals'; choice: string; v: unknown }

export interface SaveData {
  version: 1
  world: string
  state: GameState
  log: LogEntry[]
  /** Where this save sits in the game log (FO, chapter 3): which game, which branch, which line. */
  session?: { game: string; branch: number; logId: number }
}

/** Everything the game log records, as it happens: input, output, world events and what a replay needs. */
export type GameLogLine =
  | { kind: 'in'; t: number; text: string }
  | { kind: 'out'; t: number; output: Output }
  | { kind: 'event'; t: number; event: WorldEvent }
  | { kind: 'replay'; t: number; entry: LogEntry }

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
  journal: { people: JournalEntry[]; places: JournalEntry[]; events: JournalEntry[]; lore: JournalEntry[]; things: JournalEntry[]; quests: JournalEntry[] }
}

export interface EngineOptions {
  seed?: number
  state?: GameState
  log?: LogEntry[]
  llm?: LlmClient
  /** The world builder's @ commands (FO, chapter 15), for playtesting in a development build. */
  builder?: boolean
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
  private readonly listeners = new Set<(line: GameLogLine) => void>()
  private eventMark: number
  /** The world builder's @ commands are on (a development build). */
  builder: boolean
  /** True while a log is played back: build commands in it ran once, so they run again. */
  private replaying = false
  private chronicling = false
  private thinking = false

  constructor(
    readonly content: Content,
    options: EngineOptions = {},
  ) {
    const state = options.state ?? createInitialState(content, options.seed ?? 1)
    this.world = new World(content, state)
    this.log = options.log ? [...options.log] : []
    this.builder = options.builder ?? false
    this.host = { world: this.world, pass: (minutes) => this.pass(minutes) }
    this.topics = new TopicRegistry(content)
    for (const far of state.lore?.far ?? []) this.topics.addDuringPlay({ id: far.id, kind: 'place', name: far.name, aliases: [far.name] })
    this.dialogue = new Dialogue(this.world, this.topics, new Knowledge(this.world, this.topics), () => this.recorder)
    this.dialogue.syncNews()
    this.eventMark = state.eventSeq
    this.setLlm(options.llm)
    if (!options.state) {
      seedNews(this.world)
      this.arrive()
    }
    this.dialogue.learn(state.player.location, `area_${this.world.location(state.player.location).area}`)
  }

  get state(): GameState {
    return this.world.state
  }

  /** When the game began: the start of the world. */
  private get startMinute(): number {
    const s = this.content.world.start
    return GameClock.from(s.year, s.month, s.day, s.hour, s.minute).minutes
  }

  get clock(): GameClock {
    return new GameClock(this.world.now)
  }

  /** The first time the player comes to an area, the people there have something to talk about. */
  private arrive(): void {
    const location = this.world.location(this.state.player.location)
    const seen = (this.state.player.seen ??= [])
    if (!seen.includes(location.id)) seen.push(location.id)
    const visited = (this.state.player.visited ??= [])
    if (visited.includes(location.area)) return
    visited.push(location.area)
    const area = this.content.areas.get(location.area)
    if (!area || area.kind === 'route') return
    const clock = new GameClock(this.world.now).parts
    recordFact(this.world, {
      kind: 'stranger',
      about: [`area_${area.id}`],
      place: location.id,
      belang: 1,
      juice: 0.7,
      title: `the stranger in ${area.name}`,
      text: {
        precise: `A stranger from Graafhaven came to ${area.name} on ${clock.weekday}, in the ${clock.dayPart}.`,
        village: `There's a stranger about in ${area.name}, come from Graafhaven.`,
        far: `A stranger has come to the Holleveen, they say.`,
      },
    })
  }

  /** Everything that really happened, for the end of a game. */
  chronicle(): string {
    return chronicleText(this.world, this.startMinute)
  }

  /** A page of the journal: what the player knows about a topic, with sources and links. */
  page(id: string): JournalPage | undefined {
    this.dialogue.syncNews()
    return journalPage(this.world, this.topics, id)
  }

  /** Follows everything that happens, for the game log. Returns a function that stops following. */
  onLog(listener: (line: GameLogLine) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private record(entry: LogEntry): void {
    this.log.push(entry)
    for (const listener of this.listeners) listener({ kind: 'replay', t: entry.t, entry })
  }

  private shown(outputs: Output[]): Output[] {
    const t = this.world.now
    for (const listener of this.listeners) {
      for (const output of outputs) listener({ kind: 'out', t, output })
      for (const event of this.state.events) if (event.seq > this.eventMark) listener({ kind: 'event', t: event.t, event })
    }
    this.eventMark = this.state.eventSeq
    return outputs
  }

  /** Swap the model at runtime, for instance after the player picks one in the settings. */
  setLlm(llm: LlmClient | undefined): void {
    if (Boolean(llm) !== Boolean(this.llm)) this.record({ t: this.world.now, k: 'llm', v: llm ? 'on' : 'off' })
    this.llm = llm
    this.world.aiLive = Boolean(llm)
  }

  /** Storylines waiting for the chronicler. */
  get chroniclerWaiting(): number {
    return this.state.chronicle?.pending.length ?? 0
  }

  /** Everything waiting for a model: goal choices and chronicler runs. */
  get modelsWaiting(): number {
    return (this.state.brain?.pending.length ?? 0) + this.chroniclerWaiting
  }

  /** Lets the models do their waiting work in the background: goal choices first, they are short. */
  async runModels(): Promise<void> {
    await this.runBrain()
    await this.runChronicler()
  }

  /**
   * The brain's goal choices (FO, chapter 7), one after the other. The NPC goes
   * on with its schedule meanwhile. The reply is recorded where it lands in the
   * log, so a replay applies the same goals at the same moment.
   */
  async runBrain(): Promise<{ choice: string; accepted: number; rejected: string[] }[]> {
    if (this.thinking) return []
    this.thinking = true
    const done: { choice: string; accepted: number; rejected: string[] }[] = []
    try {
      while (this.state.brain?.pending.length) {
        const choice = this.state.brain.pending[0]!
        const llm = this.llm
        let reply: unknown = null
        if (llm) {
          try {
            const response = await llm.complete(goalRequest(this.world, choice))
            reply = JSON.parse(response.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''))
          } catch {
            reply = null
          }
        }
        if (!this.state.brain.pending.some((p) => p.id === choice.id)) continue
        this.record({ t: this.world.now, k: 'goals', choice: choice.id, v: reply })
        const result = applyChoice(this.world, choice.id, reply)
        if (reply !== null && result.rejected.length) llm?.report?.({ reason: 'goal' })
        done.push({ choice: choice.id, accepted: result.accepted.length, rejected: result.rejected })
      }
    } finally {
      this.thinking = false
    }
    return done
  }

  /**
   * Lets the chronicler write the waiting runs, one after the other, in the
   * background: the game goes on meanwhile (design, "Wanneer hij schrijft").
   * The result is recorded where it lands in the log, so a replay applies the
   * same at the same moment without calling the model again.
   */
  async runChronicler(): Promise<{ run: string; problems: string[] }[]> {
    if (this.chronicling) return []
    this.chronicling = true
    const done: { run: string; problems: string[] }[] = []
    try {
      while (this.state.chronicle?.pending.length) {
        const run = this.state.chronicle.pending[0]!
        let output: ChronicleOutput | null = null
        let problems: string[] = []
        const llm = this.llm
        if (llm) {
          try {
            const model = { complete: async (r: ChroniclerRequest) => llm.complete({ ...(r as LlmRequest), priority: 'low' }) }
            ;({ output, problems } = await writeRun(this.world, run, model))
          } catch (error) {
            problems = [error instanceof Error ? error.message : String(error)]
          }
        }
        // The run may have been settled meanwhile (the model was switched off).
        if (!this.state.chronicle.pending.some((r) => r.id === run.id)) continue
        this.record({ t: this.world.now, k: 'chron', run: run.id, v: output })
        problems.push(...applyRun(this.world, run.id, output))
        this.dialogue.syncNews()
        done.push({ run: run.id, problems })
      }
    } finally {
      this.chronicling = false
    }
    return done
  }

  /** Records every model reply (or failure) in the log, for replays. */
  private get recorder(): LlmClient | undefined {
    const llm = this.llm
    if (!llm) return undefined
    return {
      complete: async (request: LlmRequest): Promise<LlmResponse> => {
        try {
          const response = await llm.complete(request)
          this.record({ t: this.world.now, k: 'ai', v: response.text })
          return response
        } catch (error) {
          this.record({ t: this.world.now, k: 'ai', v: null })
          throw error
        }
      },
      report: (rejection) => llm.report?.(rejection),
    }
  }

  start(): Output[] {
    const intro = this.content.world.intro?.trim()
    return [
      ...(intro ? [{ kind: 'text' as const, text: intro }] : []),
      describeRoom(this.world),
      { kind: 'system', text: 'The pace of events is normal. Type TEMPO CALM or TEMPO DRAMATIC for less or more happening in the world.' },
    ]
  }

  async handle(input: string): Promise<Output[]> {
    const text = input.trim().slice(0, 500)
    if (!text) return []
    this.record({ t: this.world.now, k: 'cmd', v: text })
    for (const listener of this.listeners) listener({ kind: 'in', t: this.world.now, text })
    const outputs = await this.route(text)
    const talk = this.state.talk
    if (talk && this.state.npcs[talk.npc]?.location !== this.state.player.location) this.state.talk = undefined
    this.dialogue.learn(this.state.player.location, `area_${this.world.location(this.state.player.location).area}`)
    this.arrive()
    settleRuns(this.world)
    settleChoices(this.world)
    return this.shown(outputs)
  }

  private async route(text: string): Promise<Output[]> {
    if (text.startsWith('@')) return this.build(text.slice(1))
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
        // Start the conversation first, so the NPC stays put during the minute it takes.
        const opening = this.dialogue.start(npc)
        this.pass(1)
        return opening
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
    for (const listener of this.listeners) listener({ kind: 'replay', t: this.world.now, entry: { t: this.world.now, k: 'tick', v: minutes } })
    return this.shown(this.pass(minutes))
  }

  status(): Status {
    const location = this.world.location(this.state.player.location)
    const talk = this.state.talk
    this.dialogue.syncNews()
    // Lore of this game goes in the journal once the player heard the news it came from.
    const heard = this.state.news?.heard['player'] ?? {}
    for (const lore of this.state.chronicle?.lore ?? []) if (lore.facts.some((f) => heard[f])) this.dialogue.learn(lore.id)
    const journal: Status['journal'] = { people: [], places: [], events: [], lore: [], things: [], quests: [] }
    for (const request of knownRequests(this.world)) {
      const state = request.status === 'done' ? ' (done)' : request.status === 'failed' ? ' (too late)' : ''
      journal.quests.push({ id: request.id, name: `${requestName(this.world, request)}${state}` })
    }
    for (const id of Object.keys(this.state.player.journal ?? {}).sort()) {
      const kind = this.topics.kind(id)
      if (id.startsWith('fact_')) {
        journal.events.push({ id, name: this.topics.name(id) })
        continue
      }
      const entry = { id, name: id.startsWith('far_') ? `${this.topics.name(id)} (heard of)` : this.topics.name(id) }
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
    const engine = new Engine(content, { seed })
    await engine.apply(log)
    return engine
  }

  /**
   * Picks up a game exactly where its log ends: the last snapshot plus everything
   * recorded after it, with the recorded model replies. Then hands over to the live model.
   */
  static async resume(content: Content, save: SaveData, tail: LogEntry[], llm?: LlmClient): Promise<Engine> {
    const engine = Engine.fromSave(content, save)
    const last = save.log.findLast((e) => e.k === 'llm')
    await engine.apply(tail, llm, last?.v === 'on')
    engine.setLlm(llm)
    return engine
  }

  /** Plays log entries in order; model calls get the recorded replies first, then the live model. */
  private async apply(entries: LogEntry[], live?: LlmClient, modelOn = false): Promise<void> {
    const replies = entries.filter((e): e is Extract<LogEntry, { k: 'ai' }> => e.k === 'ai').map((e) => e.v)
    const recorded: LlmClient = {
      complete: async (request) => {
        if (replies.length === 0) {
          if (!live) throw new LlmError('config', 'no model')
          return live.complete(request)
        }
        const text = replies.shift()
        if (text === undefined || text === null) throw new LlmError('network', 'recorded failure')
        return { text, provider: 'replay', model: 'replay', usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }, latencyMs: 0 }
      },
    }
    this.llm = modelOn ? recorded : undefined
    this.world.aiLive = modelOn
    this.replaying = true
    try {
      for (const entry of entries) {
        if (entry.k === 'cmd') await this.handle(entry.v)
        else if (entry.k === 'tick') this.tick(entry.v)
        else if (entry.k === 'llm') this.setLlm(entry.v === 'on' ? recorded : undefined)
        else if (entry.k === 'chron') {
          this.log.push(entry)
          applyRun(this.world, entry.run, entry.v)
          this.dialogue.syncNews()
        } else if (entry.k === 'goals') {
          this.log.push(entry)
          applyChoice(this.world, entry.choice, entry.v)
        }
      }
    } finally {
      this.replaying = false
    }
  }

  /** Build commands (FO, chapter 15, "Bouwcommando's in het spel"), for playtesting. */
  private build(text: string): Output[] {
    if (!this.builder && !this.replaying) return [{ kind: 'error', text: 'Build commands only work in the world builder (npm run dev).' }]
    const [verb = '', ...rest] = text.trim().split(/\s+/)
    switch (verb.toLowerCase()) {
      case 'kill': {
        // @kill harmen drowned in the Blackmere
        const words = rest.join(' ')
        const npcId = [...Array(rest.length).keys()]
          .map((n) => rest.length - n)
          .map((n) => ({ id: findNpcAnywhere(this.world, rest.slice(0, n).join(' ')), n }))
          .find((x) => x.id)
        if (!npcId?.id) return [{ kind: 'error', text: `@kill whom? Nobody called "${words}".` }]
        const cause = rest.slice(npcId.n).join(' ') || 'died suddenly'
        const fact = die(this.world, npcId.id, { cause })
        if (!fact) return [{ kind: 'error', text: `${this.world.npc(npcId.id).name} is already dead.` }]
        return [{ kind: 'system', text: `[build] ${fact.text.precise} Belang ${fact.belang}.` }, ...this.pass(0)]
      }
      case 'who-knows': {
        // @who-knows haakman: every NPC with the chance and the level (FO, chapter 15).
        const topic = this.topics.find(rest.join(' '))
        if (!topic) return [{ kind: 'error', text: `@who-knows what? No topic "${rest.join(' ')}".` }]
        const knowledge = new Knowledge(this.world, this.topics)
        const rows = [...this.content.npcs.keys()].sort().map((id) => {
          const odds = knowledge.chance(id, topic)
          return `${callName(this.world.npc(id)).padEnd(10)} level ${knowledge.level(id, topic)}${odds ? `  chance ${Math.round(odds.chance * 100)}%` : ''}`
        })
        return [{ kind: 'system', text: [`[build] Who knows ${this.topics.name(topic)}:`, ...rows].join('\n') }]
      }
      default:
        return [{ kind: 'error', text: 'Build commands: @kill <person> [how], @who-knows <topic>.' }]
    }
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
