import { GameClock } from './clock'
import { describeRoom, findNpcAnywhere, findNpcHere, runCommand, type CommandHost, type Output } from './commands'
import { areaTopicId, callName, type Content } from './content'
import { Dialogue, parseMoney, QUICK_OPTIONS } from './dialogue/conversation'
import { Knowledge } from './dialogue/knowledge'
import type { ChronicleOutput, ChroniclerRequest, Outline } from '../chronicler'
import { applyOutline, farWhere, runOutline, wantOutline } from './outlines'
import { applyRun, settleRuns, writeRun } from './chronicler'
import { applyChoice, goalRequest, settleChoices } from './npc/goals'
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './dialogue/llm'
import { attitude, relation } from './dialogue/relations'
import { TopicRegistry } from './dialogue/topics'
import { add, formatMoney, itemName, matchItem } from './items'
import { chronicleText } from './chronicle'
import { journalPage, type JournalPage } from './journal'
import { die } from './life'
import { goAway, tierOf } from './lod'
import { knownEntrance, knownPlace, landLines, walkTarget, type KnownPlace } from './map/known'
import { takeBarge, travelTo } from './map/journey'
import { mapText, mapView, type MapView } from './map/view'
import { regionMap } from './map/region'
import { canSetOut, followWay, isHexId, look, playerHex, walk, windOf, type WalkPlan } from './map/travel'
import { knownRequests, requestName } from './requests'
import { recordFact, seedNews } from './news'
import { parseCommand, parseDirection } from './parser'
import { advance } from './simulation'
import { createInitialState, fitStateToContent, type GameState, type WorldEvent } from './state'
import { World } from './world'
import { beginFight, fightView, playerCommand } from './combat/flow'
import { foeXp } from './combat/balance'
import type { Arena } from './combat/combat'
import type { Combat, Fighter } from './combat/types'
import { maxHp, type CreationData } from './rules/character'
import { npcFighter } from './combat/npc'
import { approve, arrived, campfire, companionOf, companions, leave, order, partyLines, recruit, restParty, setStance, sharedFight, syncLevels, withPlayer } from './social/companions'
import { confronting, settleGrievance } from './social/confront'
import { crime, payFine, steal } from './social/crime'
import { deed, noticeCarried, seedBonds } from './social/deeds'
import { factionLines, join, rankOf, repute } from './social/factions'
import { fightsBack, mayAttackFirst, mayLend } from './social/gates'
import { flirt, marry } from './social/romance'
import { evaluate, expireConditions, questAction, questlog, questPage, questsOnDeath, setPlaceState, startQuest, triggers, type QuestHost } from './quests/engine'
import { PlaceState } from './quests/schema'
import { antagonists } from './quests/antagonists'
import { plansDue, startPlan } from './quests/plans'
import { realmLines } from './social/realms'
import {
  character,
  clockLine,
  createCommand,
  creationHelp,
  equipCommand,
  favour,
  findPurse,
  gainXp,
  greyRider,
  levelCommand,
  makeCharacter,
  patronCommand,
  pray,
  rest,
  rite,
  sheetLines,
  trainCommand,
  XP,
  type Clock,
} from './rules/player'

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
  // A far place worked out to its outline, or null for what the world book says.
  | { t: number; k: 'outline'; topic: string; v: Outline | null }

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
  /** The map round the player: rows of characters, and a class code per character (FO, chapter 4). */
  map?: { rows: string[]; classes: string[] }
  /** The character in short, for the side panel (FO, chapter 11). */
  character?: { name: string; title: string; level: number; hp: number; maxHp: number; xp: number; next: number; made: boolean; canLevel: boolean; shield: boolean }
  /** The fight in progress (FO, chapter 12). */
  combat?: ReturnType<typeof fightView> & { over?: string; prisoners?: string[] }
  /** The companions (FO, chapter 13). */
  party?: { npc: string; name: string; title: string; hp: number; maxHp: number; loyalty: number; bond: number; stance: string; away?: string }[]
  /** Standing with the factions that know the player (FO, chapter 8). */
  factions?: { id: string; name: string; rank: string; score: number; member: boolean }[]
  /** Fines the player owes, per law. */
  wanted?: string[]
}

const MAP_CODES: Record<string, string> = { fen: 'f', water: 'w', woods: 't', heath: 'h', fields: 'd', way: 'y', place: 'p', zone: 'z', you: '@', unknown: 'u' }

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
  /** Quests that began with the game, told after the opening. */
  private opening: Output[] = []
  private thinking = false
  private outlining = false

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
    character(this.world)
    if (!state.bonds) seedBonds(this.world)
    if (!options.state) {
      seedNews(this.world)
      this.arrive()
      this.lookAround()
      this.opening = triggers(this.world, this.questHost, { newGame: true })
    }
    this.dialogue.learn(state.player.location, areaTopicId(content, this.world.location(state.player.location).area))
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
    if (!seen.includes(location.id)) {
      seen.push(location.id)
      // A discovery is experience (FO, chapter 11); the start does not count.
      if (seen.length > 1 && this.content.locations.has(location.id)) gainXp(this.world, XP.place, `you found ${location.name}`)
    }
    const visited = (this.state.player.visited ??= [])
    if (visited.includes(location.area)) return
    visited.push(location.area)
    const area = this.content.areas.get(location.area)
    if (visited.length > 1 && area && area.kind !== 'route') gainXp(this.world, XP.area, `you came to ${area.name}`)
    if (!area || area.kind === 'route' || area.kind === 'wilderness') return
    const clock = new GameClock(this.world.now).parts
    recordFact(this.world, {
      kind: 'stranger',
      about: [areaTopicId(this.content, area.id)],
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

  /** What the player can see from where they stand goes on their map. */
  private lookAround(): void {
    const map = regionMap(this.content)
    const hex = map && playerHex(this.world)
    if (map && hex) look(this.world, map, hex, isHexId(this.state.player.location) || canSetOut(this.world, this.state.player.location))
  }

  /** Everything that really happened, for the end of a game. */
  chronicle(): string {
    return chronicleText(this.world, this.startMinute)
  }

  /** A page of the journal: what the player knows about a topic, with sources and links. */
  page(id: string): JournalPage | undefined {
    if (id === 'map') return { id, kind: 'map', name: 'The Holleveen as you know it', lines: this.mapText().split('\n'), sources: [], links: [] }
    if (id.startsWith('quest_')) {
      const page = questPage(this.world, id.slice(6))
      return page ? { id, kind: 'quest', name: page.name, lines: page.lines, sources: [], links: [] } : undefined
    }
    if (id === 'factions') return { id, kind: 'lore', name: 'Factions', lines: factionLines(this.world).length ? factionLines(this.world) : ['No faction knows you yet.'], sources: [], links: [] }
    if (id === 'lands') return { id, kind: 'lore', name: 'The lands', lines: realmLines(this.world), sources: [], links: [] }
    if (id === 'party') return { id, kind: 'lore', name: 'Your companions', lines: partyLines(this.world).length ? [...partyLines(this.world), ...companions(this.world).flatMap((m) => m.approvals.slice(-3).map((a) => `  ${callName(this.world.npc(m.npc))}: ${a.text}`))] : ['You travel alone.'], sources: [], links: [] }
    if (id === 'sheet') return { id, kind: 'sheet', name: this.state.player.character?.name ?? 'You', lines: [...sheetLines(this.world), ...this.clockLines()], sources: [], links: [] }
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
    return (this.state.brain?.pending.length ?? 0) + this.chroniclerWaiting + this.outlinesWaiting
  }

  /** Lets the models do their waiting work in the background: goal choices first, they are short. */
  async runModels(): Promise<void> {
    await this.runBrain()
    await this.runChronicler()
    await this.runOutlines()
  }

  /** Far places waiting to be worked out to their outline, one at a time. */
  async runOutlines(): Promise<void> {
    if (this.outlining) return
    this.outlining = true
    try {
      while (this.state.outlines?.pending.length) {
        const topic = this.state.outlines.pending[0]!
        const llm = this.llm
        let written: Outline | null = null
        if (llm) {
          try {
            const model = { complete: async (r: ChroniclerRequest) => llm.complete({ ...(r as LlmRequest), priority: 'low' }) }
            written = (await runOutline(this.world, topic, model)).outline ?? null
          } catch {
            written = null
          }
        }
        if (!this.state.outlines.pending.includes(topic)) continue
        this.record({ t: this.world.now, k: 'outline', topic, v: written })
        applyOutline(this.world, topic, written)
      }
    } finally {
      this.outlining = false
    }
  }

  get outlinesWaiting(): number {
    return this.state.outlines?.pending.length ?? 0
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
      ...this.opening,
    ]
  }

  /** What the quest engine may ask of the engine: time, effect plans and encounters. */
  private get questHost(): QuestHost {
    return {
      pass: (minutes) => this.pass(minutes),
      plan: (id) => void this.world.notices.push(...startPlan(this.world, this.questHost, id, 'quest').map((o) => o.text)),
      encounter: (id) => (this.content.encounters.has(id) ? this.startEncounter(id) : []),
    }
  }

  /** After time passed: deaths reach the quests, plans run their phases, stages and endings are checked. */
  private questsTick(): Output[] {
    const out: Output[] = []
    for (const id of this.world.deaths.splice(0)) out.push(...questsOnDeath(this.world, this.questHost, id))
    expireConditions(this.world)
    out.push(...antagonists(this.world, this.questHost))
    out.push(...plansDue(this.world, this.questHost))
    out.push(...evaluate(this.world, this.questHost))
    return out
  }

  async handle(input: string): Promise<Output[]> {
    const text = input.trim().slice(0, 500)
    if (!text) return []
    this.record({ t: this.world.now, k: 'cmd', v: text })
    for (const listener of this.listeners) listener({ kind: 'in', t: this.world.now, text })
    const before = this.state.player.location
    const quest = this.state.combat ? undefined : questAction(this.world, this.questHost, text)
    const outputs = quest ?? (this.state.combat ? await this.inFight(text) : await this.route(text))
    const talk = this.state.talk
    if (talk && this.state.npcs[talk.npc]?.location !== this.state.player.location) this.state.talk = undefined
    this.dialogue.learn(this.state.player.location, areaTopicId(this.content, this.world.location(this.state.player.location).area))
    this.arrive()
    this.lookAround()
    if (before !== this.state.player.location) {
      arrived(this.world)
      outputs.push(...triggers(this.world, this.questHost, { at: this.state.player.location }))
      outputs.push(...findPurse(this.world), ...this.maybeEncounter(before))
    }
    noticeCarried(this.world)
    outputs.push(...this.questsTick())
    outputs.push(...this.confrontations())
    settleRuns(this.world)
    settleChoices(this.world)
    outputs.push(...this.world.notices.splice(0).map((text) => ({ kind: 'system' as const, text })))
    return this.shown(outputs)
  }

  private async route(text: string): Promise<Output[]> {
    if (text.startsWith('@')) return this.build(text.slice(1))
    const barge = /^(?:take|catch|board)\s+(?:the\s+)?barge(?:\s+to\s+(.+))?$|^travel\s+by\s+barge(?:\s+to\s+(.+))?$/i.exec(text)
    if (barge && !this.state.talk) return takeBarge(this.world, (barge[1] ?? barge[2])?.toLowerCase().replace(/^the\s+/, '').trim(), (minutes) => this.pass(minutes))
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
        if (/^(party|group|everyone|all)$/i.test(command.args.join(' '))) return this.dialogue.party('')
        const npc = findNpcHere(this.world, command.args.join(' '))
        if (!npc) return [{ kind: 'error', text: command.args.length ? `There is nobody called "${command.args.join(' ')}" here.` : 'Talk to whom?' }]
        // Start the conversation first, so the NPC stays put during the minute it takes.
        const opening = this.dialogue.start(npc)
        this.pass(1)
        return [...opening, ...triggers(this.world, this.questHost, { talk: npc })]
      }
      case 'bye':
        return this.dialogue.end()
      case 'ask':
      case 'tell':
      case 'where': {
        const party = /^(?:party|group|everyone|all)\s+(?:about|over)\s+(.+)$/i.exec(command.args.join(' '))
        if (command.verb === 'ask' && party) return this.dialogue.party(party[1]!)
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
      case 'head': {
        const wind = windOf(command.args.join('-')) ?? windOf(command.args[0])
        if (!wind) return [{ kind: 'error', text: 'Head which way? For example: head south-east.' }]
        return this.walkPlan({ kind: 'head', wind })
      }
      case 'walk': {
        const to = /^(?:to|naar|towards|richting)\s+(.+)$/i.exec(command.args.join(' '))
        if (!to) return runCommand(this.host, { verb: 'go', args: command.args, raw: command.raw })
        const topic = this.topics.find(to[1]!)
        if (topic && this.beyond(topic)) return this.setOffBeyond(topic)
        const place = topic ? knownPlace(this.world, topic) : undefined
        if (!topic || !place) return [{ kind: 'error', text: topic ? `You don't know where ${this.topics.name(topic)} is. Ask someone, or look for it.` : `You don't know a place called "${to[1]}".` }]
        const target = walkTarget(this.world, place)
        if (!target) return [{ kind: 'error', text: `${place.name} lies beyond the Holleveen.` }]
        return this.walkPlan({ kind: 'to', target, name: place.name }, place)
      }
      case 'travel': {
        const to = /^(?:to|naar)\s+(.+)$/i.exec(command.args.join(' '))
        if (!to) return [{ kind: 'error', text: 'Travel where? For example: travel to Waagdam.' }]
        const topic = this.topics.find(to[1]!)
        if (topic && this.beyond(topic)) return this.setOffBeyond(topic)
        const place = topic ? knownPlace(this.world, topic) : undefined
        if (!place?.hex) return [{ kind: 'error', text: place ? `You have only heard of ${place.name}. Walk there first.` : `You don't know a place called "${to[1]}".` }]
        return [...travelTo(this.world, place.hex, place.name, (minutes) => this.pass(minutes)), describeRoom(this.world)]
      }
      case 'map':
        return [{ kind: 'system', text: this.mapText() }]
      case 'sheet':
        return [{ kind: 'system', text: sheetLines(this.world).join('\n') }]
      case 'create':
        return createCommand(this.world, command.args)
      case 'level':
        return levelCommand(this.world, command.args)
      case 'train':
        return trainCommand(this.world, command.args.join(' '))
      case 'wield':
        return equipCommand(this.world, command.args.join(' ').replace(/^(the|a|an|my)\s+/i, ''))
      case 'devote':
        return patronCommand(this.world, command.args.join(' '))
      case 'pray':
        return pray(this.world)
      case 'rite':
        return rite(this.world)
      case 'clocks':
        return [{ kind: 'system', text: this.clockLines().join('\n') || 'No clocks are running that you know of.' }]
      case 'attack': {
        const target = findNpcHere(this.world, command.args.join(' ').replace(/^(the)\s+/i, ''))
        if (!target) return [{ kind: 'error', text: command.args.length ? `There is nobody called "${command.args.join(' ')}" here.` : 'Attack whom?' }]
        return this.attackNpc(target)
      }
      case 'steal':
        return steal(this.world, command.args.join(' '))
      case 'recruit': {
        const m = /^(.+?)(?:\s+(?:to|as far as)\s+(.+))?$/i.exec(command.args.join(' '))
        const npc = m ? findNpcHere(this.world, m[1]!) : undefined
        if (!npc) return [{ kind: 'error', text: 'Recruit whom? They must be here.' }]
        const place = m?.[2] ? this.topics.find(m[2]) : undefined
        return recruit(this.world, npc, place && this.content.locations.has(place) ? place : undefined)
      }
      case 'dismiss': {
        const npc = findNpcHere(this.world, command.args.join(' '))
        if (!npc || !companionOf(this.world, npc)) return [{ kind: 'error', text: 'Dismiss whom?' }]
        return leave(this.world, npc, 'nods, and goes home.')
      }
      case 'order': {
        const m = /^(\S+)\s+(?:to\s+)?(.+)$/i.exec(command.args.join(' '))
        const npc = m ? companions(this.world).map((c) => c.npc).find((id) => callName(this.world.npc(id)).toLowerCase() === m[1]!.toLowerCase()) : undefined
        if (!npc) return [{ kind: 'error', text: 'Order whom? ORDER <companion> TO <order>.' }]
        return order(this.world, npc, m![2]!)
      }
      case 'stance': {
        const [who = '', ...rest] = command.args
        const npc = companions(this.world).map((c) => c.npc).find((id) => callName(this.world.npc(id)).toLowerCase() === who.toLowerCase())
        if (!npc) return [{ kind: 'error', text: 'STANCE <companion> aggressive|defensive|support|hold|protect <name>|follow' }]
        return setStance(this.world, npc, rest.join(' '))
      }
      case 'party': {
        const words = command.args.join(' ').replace(/^(about|over)\s+/i, '')
        if (!command.args.length) return [{ kind: 'system', text: partyLines(this.world).join('\n') || 'You travel alone.' }]
        return this.dialogue.party(words)
      }
      case 'camp':
        return campfire(this.world, (minutes) => this.pass(minutes))
      case 'join':
        return join(this.world, command.args.join(' '))
      case 'factions':
        return [{ kind: 'system', text: factionLines(this.world).join('\n') || 'No faction knows you yet.' }]
      case 'lands':
        return [{ kind: 'system', text: realmLines(this.world).join('\n') }]
      case 'pay': {
        if (/^fine/i.test(command.args.join(' '))) return payFine(this.world)
        return [{ kind: 'error', text: 'Pay what? PAY FINE, or give money to someone.' }]
      }
      case 'borrow':
        return this.borrow(command.args.join(' '))
      case 'repay':
        return this.repay(command.args.join(' '))
      case 'flirt': {
        const npc = findNpcHere(this.world, command.args.join(' '))
        if (!npc) return [{ kind: 'error', text: 'Flirt with whom?' }]
        return flirt(this.world, npc)
      }
      case 'marry': {
        const npc = findNpcHere(this.world, command.args.join(' '))
        if (!npc) return [{ kind: 'error', text: 'Marry whom? They must be here.' }]
        return marry(this.world, npc)
      }
      case 'follow': {
        const words = command.args.join(' ').toLowerCase()
        const windWord = command.args.at(-1)
        const wind = windOf(windWord)
        const name = (wind ? command.args.slice(0, -1).join(' ') : words).toLowerCase().replace(/^(the|de|het)\s+/, '').trim()
        const way = followWay(this.content, name)
        if (!way) return [{ kind: 'error', text: 'Follow what? The tow path, the road, the fen path, or a ridge you know.' }]
        if (way === 'ridge' && (this.state.player.journal ?? {})['the_dry_ridge'] === undefined) return [{ kind: 'error', text: "You don't know of any ridge here." }]
        return this.walkPlan({ kind: 'follow', way, ...(wind ? { wind } : {}) })
      }
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
    // The clock stands still while the player chooses in a fight (FO, chapter 12).
    if (minutes <= 0 || this.state.combat) return []
    const last = this.log.at(-1)
    if (last?.k === 'tick') last.v += minutes
    else this.log.push({ t: this.world.now, k: 'tick', v: minutes })
    for (const listener of this.listeners) listener({ kind: 'replay', t: this.world.now, entry: { t: this.world.now, k: 'tick', v: minutes } })
    const passed = this.pass(minutes)
    noticeCarried(this.world)
    const outputs = [...passed, ...this.questsTick(), ...this.confrontations()]
    outputs.push(...this.world.notices.splice(0).map((text) => ({ kind: 'system' as const, text })))
    return this.shown(outputs)
  }

  status(): Status {
    const location = this.world.location(this.state.player.location)
    const talk = this.state.talk
    this.dialogue.syncNews()
    // Lore of this game goes in the journal once the player heard the news it came from.
    const heard = this.state.news?.heard['player'] ?? {}
    for (const lore of this.state.chronicle?.lore ?? []) if (lore.facts.some((f) => heard[f])) this.dialogue.learn(lore.id)
    const journal: Status['journal'] = { people: [], places: [], events: [], lore: [], things: [], quests: [] }
    for (const [id, q] of Object.entries(questlog(this.world)).sort((a, b) => a[1].started - b[1].started)) {
      const quest = this.content.quests.get(id)
      if (quest) journal.quests.push({ id: `quest_${id}`, name: `${quest.name}${q.ended ? ' (over)' : ''}` })
    }
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
      map: this.compactMap(),
      ...this.characterStatus(),
    }
  }

  private characterStatus(): Pick<Status, 'character' | 'combat' | 'party' | 'factions' | 'wanted'> {
    const c = this.state.player.character
    const out: Pick<Status, 'character' | 'combat' | 'party' | 'factions' | 'wanted'> = {}
    const party = companions(this.world)
    if (party.length) {
      out.party = party.map((m) => ({
        npc: m.npc,
        name: callName(this.world.npc(m.npc)),
        title: `${this.content.rules?.classes.find((k) => k.id === m.character.class)?.name ?? m.character.class} ${m.character.level}`,
        hp: m.character.hp,
        maxHp: maxHp(this.content, m.character),
        loyalty: m.loyalty,
        bond: m.bond,
        stance: m.stance,
        ...(m.away ? { away: `${m.away.kind === 'scout' ? 'scouting' : 'waiting'} at ${this.world.location(m.away.where).name}` } : {}),
      }))
    }
    const rep = this.state.reputation ?? {}
    const members = this.state.memberships ?? []
    const known = [...this.content.factions.values()].filter((f) => rep[f.id] !== undefined || members.includes(f.id))
    if (known.length) out.factions = known.map((f) => ({ id: f.id, name: f.name, rank: rankOf(rep[f.id] ?? 0), score: rep[f.id] ?? 0, member: members.includes(f.id) }))
    const wanted = Object.entries(this.state.wanted ?? {}).map(([law, w]) => `${law === 'waagdam' ? 'Waagdam' : "the Count's land"}: ${formatMoney(w.fine)}`)
    if (wanted.length) out.wanted = wanted
    if (c && this.content.rules) {
      const klass = this.content.rules.classes.find((k) => k.id === c.class)
      const next = c.level * this.content.rules.xp_per_level
      out.character = { name: c.name, title: `${klass?.name ?? c.class} ${c.level}`, level: c.level, hp: c.hp, maxHp: maxHp(this.content, c), xp: c.xp, next, made: Boolean(c.made), canLevel: c.level < 10 && c.xp >= next, shield: Boolean(c.gear.shield) }
    }
    const combat = this.state.combat
    if (combat) out.combat = { ...fightView(this.arena(), combat), ...(combat.over ? { over: combat.over } : {}), ...(combat.prisoners ? { prisoners: combat.prisoners } : {}) }
    return out
  }

  private compactMap(): Status['map'] {
    const view = this.mapView()
    if (!view) return undefined
    return { rows: view.rows.map((row) => row.map((c) => c.ch).join('')), classes: view.rows.map((row) => row.map((c) => MAP_CODES[c.cls] ?? 'u').join('')) }
  }

  save(): SaveData {
    return JSON.parse(JSON.stringify({ version: 1, world: this.content.world.id, state: this.state, log: this.log })) as SaveData
  }

  static fromSave(content: Content, save: SaveData, llm?: LlmClient): Engine {
    if (save.world !== content.world.id) throw new Error(`This save belongs to world "${save.world}"`)
    const copy = JSON.parse(JSON.stringify(save)) as SaveData
    fitStateToContent(content, copy.state)
    return new Engine(content, { state: copy.state, log: copy.log, llm })
  }

  /** The same game on changed content: what the world builder saves is in play at once (FO, chapter 15, "Live herladen"). */
  withContent(content: Content): Engine {
    const next = Engine.fromSave(content, this.save(), this.llm)
    next.builder = this.builder
    return next
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
        } else if (entry.k === 'outline') {
          this.log.push(entry)
          applyOutline(this.world, entry.topic, entry.v)
        }
      }
    } finally {
      this.replaying = false
    }
  }

  /** The region as the player knows it, and what they know of the land beyond. */
  mapText(): string {
    return [mapText(this.world), ...landLines(this.world)].join('\n')
  }

  /** The map for the side panel (a window round the player) or the journal (the whole region). */
  mapView(whole = false): MapView | undefined {
    return mapView(this.world, whole ? { width: 60, height: 20, whole: true } : { width: 34, height: 12 })
  }

  /** A place the player knows of that lies beyond the region map. */
  private beyond(topic: string): boolean {
    const pos = this.content.topics.get(topic)?.pos
    const map = regionMap(this.content)
    return Boolean(pos && map && !map.inside(map.hexOf(pos)) && (this.state.player.journal ?? {})[topic] !== undefined)
  }

  /**
   * Setting off for a far place: the roads out of the region stop at its edge
   * for now, but the place is worked out to its outline, once (design, "De
   * wereld buiten de kaart", level 2).
   */
  private setOffBeyond(topic: string): Output[] {
    wantOutline(this.world, topic)
    const name = this.topics.name(topic)
    return [
      { kind: 'text', text: `${name.charAt(0).toUpperCase()}${name.slice(1)} lies beyond the Holleveen. ${farWhere(this.world, topic) ?? ''} The roads out of the region stop at its edge for now.` },
      { kind: 'system', text: `What is known of ${name} is in your journal${this.state.outlines?.pending.includes(topic) ? '; the chronicler is working it out' : ''}.` },
    ]
  }

  /** Walks across the region, then shows where the walk ended (FO, chapter 4). */
  private walkPlan(plan: WalkPlan, place?: KnownPlace): Output[] {
    const result = walk(this.world, plan, (minutes) => this.pass(minutes))
    if (Array.isArray(result)) return result
    const outputs = [...result.outputs, describeRoom(this.world)]
    // Walking to a place you only heard of ends where the tellers said it was.
    if (place?.status === 'heard' && isHexId(this.state.player.location)) {
      const again = knownPlace(this.world, place.topic)
      outputs.push({ kind: 'narration', text: again?.status === 'seen' ? `There it is: ${place.name}, close by now.` : `Somewhere around here, they said. You see no sign of ${place.name} yet.` })
    }
    return outputs
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
      case 'send': {
        // @send wouter kattenbroek 2: away for two days, as a note while far from the player.
        const npcId = findNpcAnywhere(this.world, rest[0] ?? '')
        const days = Number(rest.at(-1))
        const place = this.topics.find(rest.slice(1, Number.isFinite(days) ? -1 : undefined).join(' '))
        if (!npcId || !place) return [{ kind: 'error', text: '@send <person> <place> [days]' }]
        const map = regionMap(this.content)
        const where = map && map.locations.has(place) ? place : (knownEntrance(this.world, place) ?? place)
        goAway(this.world, npcId, where, Number.isFinite(days) ? days : 1)
        return [{ kind: 'system', text: `[build] ${callName(this.world.npc(npcId))} goes to ${this.world.content.locations.has(where) ? this.world.location(where).name : this.topics.name(place)}.` }]
      }
      case 'where': {
        const npcId = findNpcAnywhere(this.world, rest.join(' '))
        if (!npcId) return [{ kind: 'error', text: '@where <person>' }]
        const npc = this.state.npcs[npcId]!
        return [{ kind: 'system', text: `[build] ${callName(this.world.npc(npcId))}: ${tierOf(this.world, npcId)}, at ${this.world.location(npc.location).name}${npc.note ? `, note: ${npc.note.activity} (${npc.note.unrest})` : ''}.` }]
      }
      case 'fight': {
        // @fight goat_riders_toll, or @fight veenlijk 2: a fight here and now, for playtesting.
        const id = rest[0] ?? ''
        if (this.content.encounters.has(id)) return this.startEncounter(id)
        if (!this.content.creatures.has(id)) return [{ kind: 'error', text: `@fight <encounter or creature> [count]: ${[...this.content.encounters.keys(), ...this.content.creatures.keys()].join(', ')}` }]
        return this.startFight({ foes: [{ creature: id, count: Number(rest[1] ?? 1) || 1, range: 'near' }] })
      }
      case 'like': {
        // @like wouter 60 40: set how someone feels about the player (affinity, trust), for playtesting.
        const npcId = findNpcAnywhere(this.world, rest[0] ?? '')
        if (!npcId) return [{ kind: 'error', text: '@like <person> <affinity> [trust]' }]
        const rel = relation(this.state, npcId)
        rel.affinity = Math.max(-100, Math.min(100, Number(rest[1] ?? rel.affinity)))
        rel.trust = Math.max(-100, Math.min(100, Number(rest[2] ?? rel.trust)))
        rel.familiarity = Math.max(rel.familiarity, 40)
        return [{ kind: 'system', text: `[build] ${callName(this.world.npc(npcId))}: affinity ${rel.affinity}, trust ${rel.trust}, ${attitude(this.world, npcId).band}.` }]
      }
      case 'xp': {
        gainXp(this.world, Number(rest[0]) || 0, 'the world builder says so')
        return this.world.notices.splice(0).map((text) => ({ kind: 'system' as const, text }))
      }
      case 'goto': {
        // @goto loc_kattenbroek_hut, or @goto the widow's hut: the player is there at once.
        const place = this.findLocation(rest.join(' '))
        if (!place) return [{ kind: 'error', text: '@goto <place>' }]
        this.state.player.location = place
        return [{ kind: 'system', text: `[build] You are at ${this.world.location(place).name}.` }, describeRoom(this.world), ...triggers(this.world, this.questHost, { at: place })]
      }
      case 'bring': {
        // @bring aaltje: someone comes to where the player is, and stays an hour.
        const npcId = findNpcAnywhere(this.world, rest.join(' '))
        const npc = npcId ? this.state.npcs[npcId] : undefined
        if (!npcId || !npc || npc.dead) return [{ kind: 'error', text: '@bring <person>' }]
        Object.assign(npc, { location: this.state.player.location, plan: [], planGoal: undefined, busyUntil: this.world.now + 60, activity: 'waiting' })
        return [{ kind: 'system', text: `[build] ${callName(this.world.npc(npcId))} is here.` }]
      }
      case 'give': {
        // @give moon_water 2
        const item = this.content.items.has(rest[0] ?? '') ? rest[0]! : matchItem(this.content, rest.slice(0, Number(rest.at(-1)) ? -1 : undefined).join(' '))
        if (!item) return [{ kind: 'error', text: '@give <item> [count]' }]
        add(this.state.player.inventory, item, Number(rest.at(-1)) || 1)
        return [{ kind: 'system', text: `[build] You have ${itemName(this.content, item)}.` }]
      }
      case 'flag': {
        // @flag widow_price_known, @flag survey_quiet_days 7, @flag -stakes_pulled_today
        const name = rest[0] ?? ''
        if (!name) return [{ kind: 'error', text: '@flag <name> [value], or @flag -<name> to clear it' }]
        const flags = (this.state.flags ??= {})
        if (name.startsWith('-')) delete flags[name.slice(1)]
        else flags[name] = rest[1] === undefined ? true : Number.isFinite(Number(rest[1])) ? Number(rest[1]) : rest[1]
        return [{ kind: 'system', text: `[build] Flag ${name}.` }, ...this.pass(0)]
      }
      case 'quest': {
        const id = rest[0] ?? ''
        if (!this.content.quests.get(id)?.stages?.length) return [{ kind: 'error', text: `@quest <id>: ${[...this.content.quests.values()].filter((q) => q.stages?.length).map((q) => q.id).join(', ')}` }]
        return [...startQuest(this.world, this.questHost, id), ...this.pass(0)]
      }
      case 'plan': {
        const id = rest[0] ?? ''
        if (!this.content.plans.has(id)) return [{ kind: 'error', text: `@plan <id>: ${[...this.content.plans.keys()].join(', ')}` }]
        return [...startPlan(this.world, this.questHost, id, 'builder'), ...this.pass(0)]
      }
      case 'place': {
        // @place loc_visser_house flooded
        const place = this.findLocation(rest.slice(0, -1).join(' '))
        const state = PlaceState.safeParse(rest.at(-1))
        if (!place || !state.success) return [{ kind: 'error', text: `@place <place> <${PlaceState.options.join('|')}>` }]
        const out: Output[] = []
        setPlaceState(this.world, this.questHost, place, state.data, out)
        return [{ kind: 'system', text: `[build] ${this.world.location(place).name} is ${state.data}.` }, ...out, ...this.pass(0)]
      }
      case 'money': {
        // @money 300: the purse holds this many duiten.
        const amount = Number(rest[0])
        if (!Number.isInteger(amount) || amount < 0) return [{ kind: 'error', text: '@money <duiten>' }]
        this.state.player.money = amount
        return [{ kind: 'system', text: `[build] You have ${formatMoney(amount)}.` }]
      }
      case 'time': {
        // @time 23: wait until the next time it is eleven at night.
        const hour = Number(rest[0])
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) return [{ kind: 'error', text: '@time <hour 0-23>' }]
        const minute = this.world.now % (24 * 60)
        const wait = (hour * 60 - minute + 24 * 60) % (24 * 60) || 24 * 60
        return [{ kind: 'system', text: `[build] ${wait} minutes pass.` }, ...this.pass(wait)]
      }
      default:
        return [{ kind: 'error', text: 'Build commands: @kill <person> [how], @who-knows <topic>, @send <person> <place> [days], @where <person>, @fight <encounter or creature> [count], @xp <amount>, @like <person> <affinity> [trust], @goto <place>, @bring <person>, @give <item> [count], @flag <name> [value], @quest <id>, @plan <id>, @place <place> <state>, @time <hour>, @money <duiten>.' }]
    }
  }

  /** A location by id, or by name or alias. */
  private findLocation(words: string): string | undefined {
    const w = words.trim().toLowerCase()
    if (!w) return undefined
    if (this.content.locations.has(w)) return w
    return [...this.content.locations.values()].find((l) => l.name.toLowerCase() === w || l.aliases.includes(w))?.id ?? [...this.content.locations.values()].find((l) => l.name.toLowerCase().includes(w))?.id
  }

  // ------------------------------------------------------------ fights (FO, chapter 12)

  /** The arena of a fight: the world's dice, the character, the pack, and where it is. */
  private arena(): Arena {
    const inventory = this.state.player.inventory
    const here = this.world.location(this.state.player.location)
    const hour = this.clock.parts.hour
    return {
      content: this.content,
      rng: this.world.rng,
      character: character(this.world)!,
      items: {
        count: (id) => inventory[id] ?? 0,
        take: (id) => {
          inventory[id] = (inventory[id] ?? 0) - 1
          if (inventory[id]! <= 0) delete inventory[id]
        },
      },
      where: { outdoors: !here.tags.includes('indoors'), fen: here.tags.some((t) => t === 'hazard:bog' || t === 'wilderness'), night: hour < 6 || hour >= 20 },
    }
  }

  /** An encounter can start when the player comes to one of its places (FO, chapter 12, "Verloop"). */
  private maybeEncounter(from: string): Output[] {
    if (this.state.combat || this.state.talk || !this.content.rules) return []
    const here = this.state.player.location
    const area = this.content.locations.get(here)?.area
    const hour = this.clock.parts.hour
    for (const e of [...this.content.encounters.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      if (!e.places.includes(here) && !(area && e.places.includes(area))) continue
      if (e.when_flag && !this.state.flags?.[e.when_flag]) continue
      if (e.unless_flag && this.state.flags?.[e.unless_flag]) continue
      if (e.hours && !(e.hours[0] <= e.hours[1] ? hour >= e.hours[0] && hour < e.hours[1] : hour >= e.hours[0] || hour < e.hours[1])) continue
      const last = this.state.player.encounters?.[e.id]
      if (last !== undefined && this.world.now - last < e.again_after * 24 * 60) continue
      if (this.world.rng.next('encounters') >= e.chance) continue
      return this.startEncounter(e.id, from)
    }
    return []
  }

  private startEncounter(id: string, from?: string): Output[] {
    const e = this.content.encounters.get(id)!
    ;(this.state.player.encounters ??= {})[id] = this.world.now
    return this.startFight({ encounter: e.id, ...(from ? { from } : {}), foes: e.foes.map((f) => ({ creature: f.creature, count: f.count, range: f.range, ...(f.joins ? { joins: f.joins } : {}) })) })
  }

  private startFight(setup: { encounter?: string; from?: string; foes: { creature: string; count: number; range: 'engaged' | 'near' | 'far'; joins?: number }[]; foeFighters?: Fighter[]; startedBy?: 'player' | 'npc' }): Output[] {
    if (!character(this.world)) return [{ kind: 'error', text: 'This world has no rules for fights.' }]
    this.state.talk = undefined
    const encounter = setup.encounter ? this.content.encounters.get(setup.encounter) : undefined
    // Companions at the player's side fight too, unless it is against someone they hold dear (FO, chapter 13).
    const out: Output[] = []
    const allies: Fighter[] = []
    const against = (setup.foeFighters ?? []).map((f) => f.npc).filter((x): x is string => Boolean(x))
    for (const c of withPlayer(this.world)) {
      const dear = against.find((id) => (this.state.bonds?.[c.npc]?.[id]?.affinity ?? 0) >= 50)
      if (dear) {
        c.loyalty = Math.max(0, c.loyalty - 5)
        out.push({ kind: 'narration', text: `${callName(this.world.npc(c.npc))} will not raise a hand against ${callName(this.world.npc(dear))}, and stands aside.` })
        continue
      }
      allies.push(npcFighter(this.world, c.npc, 'party'))
    }
    const { combat, lines } = beginFight(this.arena(), {
      id: `fight_${this.world.now}`,
      place: this.state.player.location,
      ...(setup.from ? { from: setup.from } : {}),
      ...(encounter ? { encounter } : {}),
      foes: setup.foes,
      ...(setup.foeFighters ? { foeFighters: setup.foeFighters } : {}),
      allies,
      ...(setup.startedBy ? { startedBy: setup.startedBy } : {}),
      now: this.world.now,
    })
    this.state.combat = combat
    return [...out, ...lines, ...this.afterFight()]
  }

  /** A fight with people: an NPC the player attacks, or one who attacks the player (FO, chapter 8, gates). */
  private startNpcFight(npcId: string, startedBy: 'player' | 'npc', helpers: string[] = []): Output[] {
    const foeFighters = [npcId, ...helpers].map((id) => npcFighter(this.world, id, 'foes'))
    return this.startFight({ foes: [], foeFighters, startedBy })
  }

  /** ATTACK <person>: violence, with every bystander a witness; the victim fights back, yields or runs. */
  private attackNpc(target: string): Output[] {
    const npc = this.world.npc(target)
    const name = callName(npc)
    if (npc.child) return [{ kind: 'error', text: "You won't raise a hand against a child." }]
    if (companionOf(this.world, target)) return [{ kind: 'error', text: `${name} is with you. DISMISS them first, if it has come to that.` }]
    if (!character(this.world)) return [{ kind: 'error', text: 'There is nothing here to fight.' }]
    const here = this.state.player.location
    const witnesses = this.world.npcsAt(here).filter((id) => !this.world.npcState(id).dead && this.world.npcState(id).activity !== 'asleep')
    const out: Output[] = []
    const reaction = fightsBack(this.world, target)
    out.push(
      ...crime(this.world, { kind: 'assault', place: here, victim: target, value: 0, grave: false, witnesses }, {
        title: `the stranger attacked ${name}`,
        precise: `The stranger attacked ${name} at ${this.world.location(here).name}.`,
        village: `The stranger went for ${name}, at ${this.world.location(here).name}.`,
        far: 'A stranger has been starting fights in the Holleveen.',
      }),
    )
    if (reaction === 'yield') {
      out.push({ kind: 'narration', text: this.world.say(`{name} does not fight you. {They} throws up {their} hands and backs away, staring at you.`, target).replace('{They}', npc.pronoun === 'she' ? 'She' : npc.pronoun === 'he' ? 'He' : 'They') })
      return out
    }
    if (reaction === 'flee') {
      this.world.npcState(target).location = npc.home
      this.world.npcState(target).plan = []
      out.push({ kind: 'narration', text: `${name} runs.` })
      return out
    }
    // Family and close friends who are there take the victim's side, if they have the courage.
    const helpers = witnesses.filter((id) => id !== target && !companionOf(this.world, id) && !this.world.npc(id).child && this.world.npc(id).personality.courage >= 1 && (this.state.bonds?.[id]?.[target]?.affinity ?? 0) >= 50)
    return [...out, { kind: 'narration', text: `You go for ${name}.` }, ...this.startNpcFight(target, 'player', helpers)]
  }

  /** Someone with a grievance finds the player: words, or blows if the gate allows it. */
  private confrontations(): Output[] {
    if (this.state.combat) return []
    const out: Output[] = []
    for (const id of confronting(this.world)) {
      const g = this.world.npcState(id).grievance!
      const law = g.reason === 'the law'
      const name = callName(this.world.npc(id))
      if (law && !this.state.wanted?.['count']) {
        settleGrievance(this.world, id)
        continue
      }
      out.push({ kind: 'speech', text: `${name}: ${g.line}` })
      if (mayAttackFirst(this.world, id, { provoked: true, factionOrder: law })) {
        settleGrievance(this.world, id)
        out.push(...this.startNpcFight(id, 'npc'))
        return out
      }
      if (law) {
        // The schout waits for the fine; he will ask again another day.
        g.t = this.world.now
        this.world.npcState(id).goals = this.world.npcState(id).goals.filter((goal) => goal.id !== `confront_${id}`)
        out.push({ kind: 'system', text: 'PAY FINE, or face the consequences.' })
      } else settleGrievance(this.world, id)
      if (!this.state.talk) this.dialogue.start(id, true)
    }
    return out
  }

  /** BORROW <amount> FROM <person>: Warm and trust 30 or more (FO, chapter 8); the debt is due in a week. */
  private borrow(words: string): Output[] {
    const m = /^(.+?)\s+from\s+(.+)$/i.exec(words)
    const amount = m ? parseMoney(m[1]!) : undefined
    const npc = m ? findNpcHere(this.world, m[2]!) : undefined
    if (!m || !amount || !npc) return [{ kind: 'error', text: 'BORROW <amount> FROM <person>, for example: borrow 5 stuivers from mirte.' }]
    const name = callName(this.world.npc(npc))
    if (!mayLend(this.world, npc)) return [{ kind: 'speech', text: `${name} shakes ${this.world.npc(npc).pronoun === 'she' ? 'her' : this.world.npc(npc).pronoun === 'he' ? 'his' : 'their'} head. "I don't lend money. Not to you, not yet."` }]
    const state = this.world.npcState(npc)
    if (state.money < amount) return [{ kind: 'speech', text: `${name}: "I haven't got that much to spare."` }]
    state.money -= amount
    this.state.player.money += amount
    ;(this.state.ledger ??= []).push({ id: `debt_${(this.state.ledger?.length ?? 0) + 1}`, from: 'player', to: npc, amount, kind: 'money', t: this.world.now, due: this.world.now + 7 * 24 * 60 })
    return [{ kind: 'text', text: `${name} counts out ${formatMoney(amount)}. "A week. I'll hold you to it."` }]
  }

  /** REPAY <person> [amount]: a debt paid on time is a promise kept. */
  private repay(words: string): Output[] {
    const [who = '', ...rest] = words.split(/\s+/)
    const npc = findNpcHere(this.world, who)
    const debt = npc ? (this.state.ledger ?? []).find((d) => d.from === 'player' && d.to === npc) : undefined
    if (!npc || !debt) return [{ kind: 'error', text: 'You owe nobody here anything.' }]
    const amount = Math.min(debt.amount, parseMoney(rest.join(' ')) ?? debt.amount)
    if (this.state.player.money < amount) return [{ kind: 'error', text: `You only have ${formatMoney(this.state.player.money)}.` }]
    this.state.player.money -= amount
    this.world.npcState(npc).money += amount
    debt.amount -= amount
    const name = callName(this.world.npc(npc))
    if (debt.amount <= 0) {
      this.state.ledger = (this.state.ledger ?? []).filter((d) => d !== debt)
      if (debt.due === undefined || this.world.now <= debt.due) deed(this.world, npc, 'promise_kept')
      return [{ kind: 'text', text: `You pay ${name} back, all of it. ${name} nods. "Good as your word."` }]
    }
    return [{ kind: 'text', text: `You pay ${name} ${formatMoney(amount)}. ${formatMoney(debt.amount)} still to go.` }]
  }

  /** A command while a fight is on: fight commands, a look at the fight, or the sheet. */
  private async inFight(text: string): Promise<Output[]> {
    const combat = this.state.combat!
    const words = text.trim().toLowerCase()
    if (combat.over) return this.prisoners(words)
    if (/^(sheet|character|char|stats|i|inv|inventory)$/.test(words)) {
      if (words.startsWith('i')) return runCommand(this.host, parseCommand(words))
      return [{ kind: 'system', text: sheetLines(this.world).join('\n') }]
    }
    if (/^(l|look|status)$/.test(words)) return [{ kind: 'system', text: this.fightLines().join('\n') }]
    const encounter = combat.encounter ? this.content.encounters.get(combat.encounter) : undefined
    const result = playerCommand(this.arena(), combat, text, encounter?.flee_dc ?? 15)
    const out: Output[] = [...result.lines]
    if (combat.over) out.push(...this.afterFight())
    else if (combat.actions > 0 && combat.round > 0 && fightView(this.arena(), combat).fighters.find((f) => f.id === 'player')?.state === 'up') out.push({ kind: 'system', text: `${combat.actions} action${combat.actions === 1 ? '' : 's'} left.` })
    return out
  }

  fightLines(): string[] {
    const combat = this.state.combat
    if (!combat) return []
    const view = fightView(this.arena(), combat)
    return [
      combat.parley ? 'Before blows.' : `Round ${view.round}.${view.momentum ? ` Momentum +${view.momentum}.` : ''} ${view.actions} action${view.actions === 1 ? '' : 's'} left.${view.subdue ? ' Fighting to subdue.' : ''}`,
      ...view.fighters.map((f) => `  ${f.name.padEnd(24)} ${String(f.hp).padStart(3)}/${f.maxHp} ${f.state === 'up' ? '' : f.state}${f.distance ? ` [${f.distance}]` : ''}${f.conditions.length ? ` (${f.conditions.join(', ')})` : ''}`),
    ]
  }

  /**
   * After a fight: time passes, wounds are bound, experience and news. Those
   * who gave up wait for the player's word; a death is a walk with the Grey Rider.
   */
  private afterFight(): Output[] {
    const combat = this.state.combat
    if (!combat?.over || combat.prisoners) return []
    const c = character(this.world)!
    const player = combat.fighters.find((f) => f.id === 'player')!
    const encounter = combat.encounter ? this.content.encounters.get(combat.encounter) : undefined
    const out: Output[] = []
    const foes = combat.fighters.filter((f) => f.side === 'foes')
    const names = foes.length ? [...new Set(foes.map((f) => this.content.creatures.get(f.creature ?? '')?.plural ?? f.name))] : []
    const who = foes.length > 1 ? `the ${names[0]?.replace(/^the\s+/i, '')}` : (foes[0]?.name ?? 'them')
    c.hp = player.state === 'up' ? player.hp : 0
    for (const k of Object.keys(c.conditions)) if (k !== 'sickened' && k !== 'cursed' && k !== 'fen_fever' && k !== 'catform') delete c.conditions[k]
    const minutes = Math.max(1, Math.ceil((combat.round * 6) / 60))
    let fact: { title: string; precise: string; village: string; far: string; belang: number } | undefined
    const place = this.world.location(combat.place)
    const where = place.name
    const belang = encounter?.news?.belang ?? 1
    const people = combat.started_by !== undefined
    out.push(...this.afterPeople(combat))
    switch (combat.over) {
      case 'won': {
        if (encounter?.win_flag) (this.state.flags ??= {})[encounter.win_flag] = true
        // Overcoming a challenge is experience; beating up a villager you went for is not.
        const xp = combat.started_by === 'player' ? 0 : foes.reduce((sum, f) => sum + foeXp(f.level, c.level), 0)
        if (xp) gainXp(this.world, xp, `you overcame ${who}`)
        favour(this.world, 'fight_won')
        approve(this.world, 'courage')
        if (foes.some((f) => f.creature === 'goat_rider' || f.creature === 'black_mathijs')) {
          repute(this.world, 'goat_riders', -5, 'you beat their men')
          repute(this.world, 'veenhoek_villagers', 3, 'you stood up to the Goat-Riders')
        }
        fact = { title: `the stranger and ${who}`, precise: `The stranger fought ${who} at ${where} and won.`, village: `The stranger saw off ${who} at ${where}, they say.`, far: `Someone beat ${who} in the Holleveen.`, belang }
        const prisoners = foes.filter((f) => (f.state === 'surrendered' || f.state === 'unconscious') && (f.kind === 'human' || f.kind === 'npc') && !people)
        if (prisoners.length) {
          combat.prisoners = prisoners.map((f) => f.id)
          const list = prisoners.map((f) => f.name).join(' and ')
          out.push({ kind: 'system', text: `${list.charAt(0).toUpperCase()}${list.slice(1)} ${prisoners.length > 1 ? 'are' : 'is'} at your mercy. LET GO, BIND (for the schout) or KILL.` })
        }
        break
      }
      case 'talked': {
        approve(this.world, 'trick')
        gainXp(this.world, Math.round(foes.reduce((sum, f) => sum + foeXp(f.level, c.level), 0) / 2), `you talked your way past ${who}`)
        fact = { title: `the stranger and ${who}`, precise: `The stranger talked ${who} out of a fight at ${where}.`, village: `The stranger faced down ${who} at ${where} with words alone.`, far: `Someone talked their way past ${who}.`, belang: Math.max(1, belang - 1) }
        break
      }
      case 'paid': {
        approve(this.world, 'back_down')
        repute(this.world, 'goat_riders', 2, 'you paid their toll')
        const amount = Math.min(this.state.player.money, (encounter?.demand?.amount ?? 0) * (combat.round > 0 ? 2 : 1))
        this.state.player.money -= amount
        out.push({ kind: 'system', text: `You pay ${formatMoney(amount)}.` })
        fact = { title: `the stranger paid ${who}`, precise: `The stranger paid ${who} ${formatMoney(amount)} to pass at ${where}.`, village: `${who.charAt(0).toUpperCase() + who.slice(1)} took toll from the stranger at ${where}.`, far: `${who.charAt(0).toUpperCase() + who.slice(1)} are taking toll again.`, belang: Math.max(1, belang - 1) }
        break
      }
      case 'fled': {
        favour(this.world, 'fled')
        approve(this.world, 'back_down')
        if (combat.from && this.content.locations.has(combat.from)) this.state.player.location = combat.from
        fact = { title: `the stranger ran from ${who}`, precise: `The stranger ran from ${who} at ${where}.`, village: `The stranger ran from ${who} at ${where}, they say.`, far: `${who.charAt(0).toUpperCase() + who.slice(1)} were seen in the Holleveen.`, belang: Math.max(1, belang - 1) }
        break
      }
      case 'surrendered':
      case 'lost': {
        const take = encounter?.surrender.take ?? (foes.some((f) => f.kind === 'human') ? 'half_money' : 'nothing')
        const amount = take === 'all_money' ? this.state.player.money : take === 'half_money' ? Math.floor(this.state.player.money / 2) : 0
        if (amount) {
          this.state.player.money -= amount
          out.push({ kind: 'system', text: `They take ${formatMoney(amount)}.` })
        }
        if (combat.over === 'surrendered' && encounter) out.push({ kind: 'narration', text: encounter.surrender.text })
        fact = { title: `${who} and the stranger`, precise: `${who.charAt(0).toUpperCase() + who.slice(1)} beat the stranger at ${where}${amount ? ` and took ${formatMoney(amount)}` : ''}.`, village: `${who.charAt(0).toUpperCase() + who.slice(1)} robbed the stranger at ${where}.`, far: `${who.charAt(0).toUpperCase() + who.slice(1)} are robbing travellers in the Holleveen.`, belang }
        break
      }
    }
    if (withPlayer(this.world).length && (combat.over === 'won' || combat.over === 'fled' || combat.over === 'talked')) sharedFight(this.world)
    if (fact && !people) {
      recordFact(this.world, {
        kind: 'fight',
        about: ['goat_riders', areaTopicId(this.content, place.area)].filter((t) => this.content.topics.has(t) && (t !== 'goat_riders' || foes.some((f) => f.creature === 'goat_rider' || f.creature === 'black_mathijs'))),
        place: combat.place,
        belang: fact.belang,
        juice: 0.8,
        title: fact.title,
        text: { precise: fact.precise, village: fact.village, far: fact.far },
      })
    }
    const dead = player.state === 'dead'
    const down = !dead && player.state !== 'up'
    if (!combat.prisoners) this.state.combat = undefined
    out.push(...this.pass(minutes))
    if (dead) {
      this.state.combat = undefined
      out.push(...greyRider(this.world, combat.place, (m) => this.pass(m)))
      out.push(describeRoom(this.world))
    } else if (down) {
      c.hp = 1
      out.push(...this.pass(60))
      out.push({ kind: 'narration', text: 'You come round in the mud an hour later, aching, alive.' })
    } else if (combat.over === 'fled') out.push(describeRoom(this.world))
    return out
  }

  /**
   * After a fight with people: companions keep their wounds or die for real
   * (FO, chapter 13), an NPC who fell is dead, and one the player went for and
   * killed is a murder with witnesses.
   */
  private afterPeople(combat: Combat): Output[] {
    const out: Output[] = []
    const here = combat.place
    for (const f of combat.fighters) {
      if (!f.npc) continue
      const npcId = f.npc
      const name = callName(this.world.npc(npcId))
      const companion = companionOf(this.world, npcId)
      if (companion) {
        companion.character.hp = f.state === 'dead' ? 0 : f.state === 'up' ? f.hp : 1
        if (f.state === 'dead') {
          leave(this.world, npcId, 'is dead.')
          die(this.world, npcId, { cause: 'fell fighting beside the stranger', place: here })
          out.push({ kind: 'narration', text: `${name} is dead. There is nothing more you can do.` })
        }
        continue
      }
      if (f.side !== 'foes') continue
      const state = this.world.npcState(npcId)
      if (f.state === 'dead') {
        const fact = die(this.world, npcId, { cause: combat.started_by === 'player' ? 'killed by the stranger' : 'killed by the stranger, who they attacked', place: here })
        if (combat.started_by === 'player') {
          const witnesses = this.world.npcsAt(here).filter((id) => id !== npcId && !this.world.npcState(id).dead)
          out.push(
            ...crime(this.world, { kind: 'murder', place: here, victim: npcId, value: 0, grave: true, witnesses }, {
              title: `the stranger killed ${name}`,
              precise: `The stranger killed ${name} at ${this.world.location(here).name}.`,
              village: `The stranger killed ${name}!`,
              far: 'A stranger has killed someone in the Holleveen.',
            }),
          )
        }
        void fact
      } else {
        state.wounds = Math.max(0, f.maxHp - f.hp)
        if (f.state === 'fled') {
          state.location = this.world.npc(npcId).home
          state.plan = []
        }
        if (f.state === 'unconscious') state.activity = 'lying senseless'
      }
    }
    return out
  }

  /** The player's word on those who gave up (FO, chapter 12, "Moreel en overgave"). */
  private async prisoners(words: string): Promise<Output[]> {
    const combat = this.state.combat!
    const ids = combat.prisoners ?? []
    const names = ids.map((id) => combat.fighters.find((f) => f.id === id)!.name)
    const them = names.length > 1 ? 'them' : names[0]!
    const place = this.world.location(combat.place)
    const about = ['goat_riders', areaTopicId(this.content, place.area)].filter((t) => this.content.topics.has(t))
    this.state.combat = undefined
    const fact = (title: string, precise: string, village: string, belang: number) =>
      recordFact(this.world, { kind: 'prisoners', about, place: combat.place, belang, juice: 0.8, title, text: { precise, village, far: village } })
    if (/^(kill|finish|slay|dood)/.test(words)) {
      favour(this.world, 'killed_surrendered')
      approve(this.world, 'kill_prisoner')
      repute(this.world, 'counts_men', -5, 'you killed a prisoner')
      fact(`the stranger killed a prisoner`, `The stranger killed ${them} after ${names.length > 1 ? 'they' : 'he'} had given up, at ${place.name}.`, `The stranger killed a man who had given up, at ${place.name}.`, 3)
      return [{ kind: 'narration', text: `You do it. It is quick, and it is not clean, and ${them} will not get up again.` }]
    }
    if (/^(bind|tie|arrest|hand|take)/.test(words)) {
      const rope = this.state.player.inventory['rope'] ?? 0
      if (rope < 1) {
        combat.prisoners = ids
        this.state.combat = combat
        return [{ kind: 'error', text: 'You have no rope to bind them with. LET GO or KILL.' }]
      }
      this.state.player.inventory['rope'] = rope - 1
      if (this.state.player.inventory['rope'] === 0) delete this.state.player.inventory['rope']
      favour(this.world, 'spared')
      approve(this.world, 'hand_over_to_schout')
      repute(this.world, 'counts_men', 10, 'you brought a robber to the schout')
      repute(this.world, 'goat_riders', -10, 'you brought one of theirs to the schout')
      fact(`the stranger brought in a Goat-Rider`, `The stranger bound ${them} at ${place.name} and sent word to the schout, whose men came for ${names.length > 1 ? 'them' : 'him'}.`, `The stranger caught a robber on the tow path and handed him to the schout.`, 3)
      return [{ kind: 'narration', text: `You bind ${them} with your rope and send a boy running for the schout's men. They come within the hour and take ${names.length > 1 ? 'them' : 'him'} away.` }]
    }
    favour(this.world, 'spared')
    approve(this.world, 'mercy')
    approve(this.world, 'spare_prisoner')
    repute(this.world, 'goat_riders', 3, 'you let one of theirs go')
    fact(`the stranger let a Goat-Rider go`, `The stranger let ${them} go at ${place.name}.`, `The stranger let one of the robbers go, they say.`, 1)
    const released = /^(let|release|spare|free|go)/.test(words)
    const out: Output[] = [{ kind: 'narration', text: released ? `You let ${them} go. ${names.length > 1 ? 'They go' : 'He goes'} without looking back.` : `While you turn away, ${names.join(' and ')} slip${names.length > 1 ? '' : 's'} off into the reeds.` }]
    return released ? out : [...out, ...(await this.route(words))]
  }

  private clockLines(): string[] {
    return Object.values(this.state.clocks ?? {}).map((c) => clockLine(c as Clock))
  }

  /** What the creation screen needs: the rules and the gear's names (FO, chapter 11, "Personage maken"). */
  creationData(): CreationData | undefined {
    const rules = this.content.rules
    if (!rules) return undefined
    const gear = new Set(rules.classes.flatMap((k) => Object.keys(k.gear)))
    return { rules, items: Object.fromEntries([...gear].map((id) => [id, this.content.items.get(id)!])) }
  }

  /** Runs the world for some minutes and returns the events the player could see. */
  private pass(minutes: number): Output[] {
    // A long wait is lived hour by hour: the opponents, big events and quests keep pace with the people.
    const between: Output[] = []
    for (let left = minutes; left > 0; ) {
      const step = Math.min(60, left)
      advance(this.world, step)
      rest(this.world, step)
      left -= step
      if (left > 0) between.push(...this.questsTick())
    }
    const here = this.state.player.location
    const seen = this.state.events.filter((e) => e.seq > this.state.seenSeq && e.location === here)
    this.state.seenSeq = this.state.eventSeq
    return [...between, ...seen.map((e) => ({ kind: 'narration' as const, text: e.text }))]
  }
}
