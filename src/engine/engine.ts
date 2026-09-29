import { personColour } from './colour'
import { planHere } from './plan'
import { applyFull, fullDue, fullFixRequest, fullLayer, fullRequest, mergeFull, readFull, wantFull, type FullRound } from './growth/regionfull'
import { applyStory, storyDue, storyReady, storyReply, storyRequest, wantStory, type StoryReply } from './growth/regionstory'
import { wishLines } from './wishes'
import { carried, doWithCarried } from './carried'
import { framesLines, framesView, secondsPerGameMinute } from './frames'
import { knob } from './knobs'
import { applyImprovisation, improviseFallback, improviseRequest, readImprovisation, type Improvisable } from './improvise'
import { soundNow, type SoundNow } from './sound'
import type { Archived } from './archive'
import { knownName, knownShort, knowsOfPerson, publicShort, seeFamily } from './acquaintance'
import { entered } from './social/access'
import { inscribedHere, readInscription } from './skills'
import { answerChoice, choose, MAX_OPTIONS, offer } from './choice'
import { answerAsk } from './asking'
import { brawlAnswer, brawlShown } from './social/brawl'
import { CHECKPOINT_ENTRIES, CHECKPOINT_MINUTES, contentVersion, type Checkpoint, type CheckpointedSave } from './checkpoint'
import { applyFarPlace, farPlaceOf, farRequest, farWords, wantFarPlace, type FarWords, farTopicAt } from './growth/far'
import { crossBorder } from './borders'
import { chartChoice, expansionChoice, expansionReply, expansionRequest, seaStop, settleExpansion, soundOutlines, unpend, wantExpansion, type ExpansionAsk, type ExpansionReply } from './growth/expansion'
import { wakePulse } from './pulse'
import { decide, holdHooks, hookChoice, morningHooks, PLAY_MODES, playModeOf, propose, proposalsText, takeHook, waitingLines, type PlayMode } from './modes'
import { applyLand, landRequest, landWords, wantLand, type LandWords } from './growth/landwrite'
import { applyDistrict, districtDue, districtRequest, districtsOf, districtWords, wantDistrict, type DistrictWords } from './growth/districts'
import { applyWeave, weaveReply, weaveRequest, type WeaveReply } from './growth/weave'
import { arrivedAt, buildingLine, onTheWay, setOff } from './growth/underway'
import { readSpark, sparkRequest } from './spark'
import { applyTides, tidesReply, tidesRequest, tidesState, type TidesReply } from './tides'
import { crowdHere, nameOne } from './growth/crowds'
import { applyLegendWords, legendRequest, legendsOf } from './legend'
import { answerLookup, parseLookup } from './lookups'
import { deliverLoad, listLoads, loadsHere, payToll, robLoad, takeLoad } from './economy/haul'
import { worldFrame } from './dialogue/prompt'
import { followTombstones, followTombstonesInLog, nameBook, withNames, type NameBook } from './ids'
import { shiftTension, tensionOf } from './social/realms'
import { grownContent, invest } from './growth/growth'
import { GameClock, weekdayName } from './clock'
import { completionsHere, couldInstead, describeRoom, detailVerb, findNpcAnywhere, findNpcHere, runCommand, walkWithin, whichOfThem, type CommandHost, type Output } from './commands'
import { areaTopicId, callName, firstName, type Content, type Quest } from './content'
import { Dialogue, QUICK_OPTIONS } from './dialogue/conversation'
import { Knowledge } from './dialogue/knowledge'
import type { ChronicleOutput, ChroniclerRequest, Outline } from '../chronicler'
import { applyOutline, engageFarPlace, farWhere, runOutline, wantOutline } from './outlines'
import { applyRun, settleRuns, writeRun } from './chronicler'
import { applyChoice, fromKeys, goalRequest, settleChoices } from './npc/goals'
import { LlmError, type LlmClient, type LlmRequest, type LlmResponse } from './dialogue/llm'
import { attitude, relation } from './dialogue/relations'
import { TopicRegistry } from './dialogue/topics'
import { add, itemName, matchItem } from './items'
import { chronicleMarkdown, chronicleText } from './chronicle'
import { tidesPage } from './tidepages'
import { mediateTide, tideBetween } from './tidemediation'
import { journalPage, type JournalPage } from './journal'
import { earlierTalk, keepPastLines, type EarlierTalk } from './pasttalks'
import { die } from './life'
import { agree, agreements, leadAhead, openAgreements, promiseLines, settle } from './agreements'
import { goAway, tierOf } from './lod'
import { hexOfTopic, knownEntrance, knownPlace, knownPlaces, landLines, landMapData, walkTarget, type KnownPlace } from './map/known'
import { hexMapData, type HexMapData } from './map/view'
import { distance as hexDistance } from './map/hexgrid'
import { travelTo } from './map/journey'
import { journeyOfDays, journeyLines, passagesNamed, takePassage, waitForPassage, waysTo } from './map/passages'
import { duration } from './map/journeyText'
import { mapText, mapView, type MapView } from './map/view'
import { regionMap } from './map/region'
import { terrainName } from './map/palette'
import { canSetOut, edgeOf, followWay, hasSeen, hexLocation, hexName, hexOfId, isHexId, knownRidgeNear, landmarkIn, look, playerHex, routeBetween, trailEndsAt, tread, type WalkPlan, walk, waysFrom, windOf } from './map/travel'
import { knownRequests, requestName } from './requests'
import { recordFact, seedNews } from './news'
import { parseCommand, parseDirection } from './parser'
import { advance } from './simulation'
import { createInitialState, fitStateToContent, type ChronicleRun, type GameState, type LoreEntry, type Offered, type TalkLine, type TalkState, type WorldEvent } from './state'
import { hasWeather, weather, wind, windWords, type WeatherKind } from './weather'
export type { TalkLine } from './state'
import { chronicleState } from './storylines'
import { upper, World } from './world'
import { beginFight, fightView, playerCommand } from './combat/flow'
import { foeXp } from './combat/balance'
import type { Arena } from './combat/combat'
import type { Combat, Fighter } from './combat/types'
import { hasCharacters, maxHp, type CreationData } from './rules/character'
import { npcFighter } from './combat/npc'
import { approve, arrived, campfire, companionOf, companions, fleeWith, leave, mend, order, partyLines, recruit, restParty, setStance, sharedFight, syncLevels, withPlayer } from './social/companions'
import { confronting, found as foundStranger, seekers, settleGrievance } from './social/confront'
import { crime, hearing, landLawHere, lawOf, payFine, payFor, steal, stolenSeen, surrenderTo, townLaw } from './social/crime'
import { deed, noticeCarried, seedBonds } from './social/deeds'
import { factionLines, factionPage, join, rankOf, repute } from './social/factions'
import { fightsBack, mayAttackFirst, mayLend } from './social/gates'
import { flirt, marry } from './social/romance'
import { conversationActions, evaluate, expireConditions, questAction, questLines, questlog, questPage, questsOnDeath, runQuestAction, setPlaceState, startQuest, talkStarts, triggers, type QuestHost } from './quests/engine'
import { PlaceState } from './quests/schema'
import { plansDue, startPlan, startWorldPlans, tellAreaNews } from './quests/plans'
import { primeWatchers, processSignals, queueSignal } from './signals'
import { mediateBetween } from './aftermath'
import { groupBetween, mediateGroup, sideWith } from './social/groups'
import { breakOff, chatLine, chatLineRequest, listen, longListen } from './chatter'
import { realmLines, realmPage } from './social/realms'
import { bearing, kmFromPlayer, posOf, posOfLocation } from './nearby'
import { carryOver } from './legacy'
import { arrival, backgroundNow, character, chooseBackground, whyLines, type Clock, clockLine, createCommand, creationHelp, equipCommand, favour, findPurse, gainXp, greyRider, leaveSheaf, levelCommand, makeCharacter, patronCommand, pray, rest, rite, sheetData, sheetLines, struggle, trainCommand } from './rules/player'
import { sketchById } from './sketches'
import { momentsNow } from './moments'
import { journeyRequest } from './map/journeyText'
import { strangeWords, voiceSummary } from './dialogue/voice'
import { hasOurOaths, outOfCharacter, unknownNames, vocabularyOf, wordCount } from './dialogue/guard'
import { crossesLimits, suspectText, worldText } from './safety'
import { noteVisit, returningOutput } from './returning'
import { gestures } from './gestures'
import { lodgingPage, putInChest, rentLodging, takeFromChest } from './lodgings'

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
  | { t: number; k: 'chron'; run: string; v: ChronicleOutput | null; offered?: Offered }
  // A goal choice of the brain, applied at this point: the model's reply (validated again), or null.
  | { t: number; k: 'goals'; choice: string; v: unknown }
  // A far place worked out to its outline, or null for what the world book says.
  | { t: number; k: 'outline'; topic: string; v: Outline | null }
  // A far place made playable (M9.1): the chronicler's words, or null for the template.
  | { t: number; k: 'far'; topic: string; v: FarWords | null }
  | { t: number; k: 'district'; key: string; v: DistrictWords | null }
  | { t: number; k: 'story'; topic: string; v: StoryReply | null }
  | { t: number; k: 'full'; topic: string; round: FullRound; v: Record<string, Record<string, unknown>[]> | null; problems?: string[] }
  | { t: number; k: 'weave'; key: string; v: WeaveReply | null }
  // What the chronicler wrote for a land the designer only framed (M10.23), or null.
  | { t: number; k: 'land'; id: string; v: LandWords | null }
  // What a round at the edge charted (M10.21), or null.
  | { t: number; k: 'expansion'; key: string; v: ExpansionReply | null }
  // The player's play mode, when it changed (M10.24).
  | { t: number; k: 'mode'; v: PlayMode }
  | { t: number; k: 'tides'; v: TidesReply | null }
  // A question about cost put to the player (M10.21), so a replay puts the same one.
  | { t: number; k: 'ask'; id: string; usd: number }
  // The great lines judged although no month began (M10.22, the host's pace).
  | { t: number; k: 'due'; v: 'tides' }
  // The legends of an old game this one began with (M9.1).
  | { t: number; k: 'legends'; v: LoreEntry[] }
  // The names the game began with (M9.1): playing the log back uses them, so a name changed later changes nothing.
  | { t: number; k: 'names'; v: NameBook }

/**
 * What the host allows now (M10.22, a brake in real time): the night round
 * and the month's judgement of the great lines wait while it says false.
 */
export interface Pace {
  night?: boolean
  tides?: boolean
}

export interface SaveData {
  /** 1: the state and the whole log at the save. 2 (M9.3): the state and the log at a checkpoint, and the tail since. */
  version: 1 | 2
  world: string
  state: GameState
  log: LogEntry[]
  /** What the log recorded after the checkpoint (M9.3): played again on loading, with the recorded model replies. */
  tail?: LogEntry[]
  /** The version of the content it was saved with (M9.3). */
  content?: string
  /** Where this save sits in the game log (FO, chapter 3): which game, which branch, which line. */
  session?: { game: string; branch: number; logId: number }
}

/** Everything the game log records, as it happens: input, output, world events and what a replay needs. */
export type GameLogLine =
  | { kind: 'in'; t: number; text: string }
  | { kind: 'out'; t: number; output: Output }
  | { kind: 'event'; t: number; event: WorldEvent }
  | { kind: 'replay'; t: number; entry: LogEntry }
  /** What left the save for good (M9.1): the game log is its archive. */
  | { kind: 'archive'; t: number; archived: Archived }

/** The verbs of the rules for characters (FO, chapter 11). */
const CHARACTER_VERBS = new Set(['create', 'level', 'train', 'wield', 'devote', 'rite'])

export interface JournalEntry {
  id: string
  name: string
  /** A heading within its part of the journal: the village someone lives in, open or finished quests. */
  group?: string
  /** How far it is from the player, in km, when it has a place: the journal shows what is near first. */
  km?: number
  /** Other names it goes by (M10.8): a highlighted "Count Aelbrecht" finds the page of the Count. */
  aliases?: string[]
}

export interface Status {
  location: string
  area: string
  /** What the picture of where you are shows (after the M10 playtest): the area's, by the id pictures go by. */
  scene: string
  time: string
  money: string
  paused: boolean
  /** A development build: the @ commands work and the editor can be opened. */
  builder?: boolean
  talk?: { npc: string; name: string; call: string; colour?: string; attitude: string; turnsLeft: number; options: string[]; proposal?: string; pronoun: 'she' | 'he' | 'they'; lines: TalkLine[]; earlier?: EarlierTalk }
  /** The talk that just ended (M10.8): its lines, for the window that stays until closed. */
  lastTalk?: { npc: string; lines: TalkLine[] }
  /** The clock and the sky for the top right (M10.8): weekday, date, hour, sun, dusk or moon, and the weather. */
  clock: { weekday: string; date: string; time: string; light: 'day' | 'dusk' | 'night'; weather: string; wind: string }
  /** What is to be heard here (M10.15), for the app; none where the content gives no sound. */
  sound?: SoundNow
  journal: { quests: JournalEntry[]; people: JournalEntry[]; places: JournalEntry[]; lands: JournalEntry[]; factions: JournalEntry[]; events: JournalEntry[]; lore: JournalEntry[]; things: JournalEntry[] }
  /** The words Tab completes from (M10.29 K): the journal's names, who and what is here, the ways out, the pack. */
  completions?: string[]
  /** The plan of this settlement as the stranger knows it (M10.29 I), for the side panel; none outside one. */
  plan?: import('./plan').PlanData
  /** The map round the player: rows of characters, and a class code per character (FO, chapter 4). */
  map?: { rows: string[]; classes: string[] }
  /** The map round the player in colour (M10): the hexes the player knows, for the interface to draw. */
  hexMap?: HexMapData
  /** A world without a map of its own (Skerrow): its name, so the panel says so instead of promising one (M10.8). */
  mapless?: string
  /** A region or district the chronicler is laying out while the stranger travels there (M10.25): the line for the status bar. */
  building?: string
  /** A choice the game put to the player (after the M10 playtest): answered with a number, or a click. */
  choice?: { question: string; options: string[] }
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

/** A talk keeps at most this many lines for its window (M10.8). */
const MAX_TALK_LINES = 160

const MAP_CODES: Record<string, string> = { fen: 'f', water: 'w', woods: 't', heath: 'h', fields: 'd', way: 'y', place: 'p', zone: 'z', you: '@', unknown: 'u', mark: 'x' }

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
  // A one-letter command word with more after it is a sentence (found in the M9.4 playtest: "I am sorry"
  // said to Maren was read as I, the inventory).
  if (/^[a-z]\s+\S/i.test(text)) return true
  const whereIs = /^\S+\s+(is|are|lies|ligt|woont|zit|staat)\b/i
  if (/\?\s*$/.test(text) && !(verb === 'where' && whereIs.test(text)) && !/\s(about|over|naar)\s/i.test(text)) return true
  const second = text.split(/\s+/)[1]?.toLowerCase()
  if (verb !== 'say' && second && ['me', 'us', 'you', 'mij', 'me', 'ons', 'je', 'jij', 'u'].includes(second)) return true
  if (verb === 'where') return !whereIs.test(text)
  // ASK ... FOR a thing and TELL ... THAT something (M10.3) are commands too.
  if (verb === 'ask') return !/\s(about|over|naar|for|om)\s/i.test(text)
  if (verb === 'tell') return !/\s(about|over|naar|that|dat)\s/i.test(text)
  return false
}

/**
 * A call that was never sent (the hour's budget, a rate limit, the cool-down
 * after failures) or found no connection cost nothing (M10.25): a round of a
 * new region waits for it without spending a try. The played proof lost a
 * full build so when the laptop was closed on the way.
 */
function waitsFree(error: unknown): boolean {
  return error instanceof LlmError && !error.usage && (error.kind === 'network' || error.kind === 'busy' || error.kind === 'budget')
}

export class Engine {
  readonly world: World
  readonly topics: TopicRegistry
  readonly dialogue: Dialogue
  private readonly log: LogEntry[]
  private readonly host: CommandHost
  private llm?: LlmClient
  /** The talk that just ended (M10.8), for its window; not saved. */
  private lastTalk?: { npc: string; lines: TalkLine[] }
  private readonly listeners = new Set<(line: GameLogLine) => void>()
  /** The chronicler's last runs, for the dev menu (M10.1): in memory only. */
  readonly devRuns: { run: string; t: number; lines: string[]; offered: Offered; output: ChronicleOutput | null; problems: string[] }[] = []
  private eventMark: number
  /** The world builder's @ commands are on (a development build). */
  builder: boolean
  /** True while a log is played back: build commands in it ran once, so they run again. */
  private replaying = false
  /** The questions about cost in the log being played back, in order (M10.21). */
  private replayAsks: Extract<LogEntry, { k: 'ask' }>[] = []
  private chronicling = false
  /** Quests that began with the game, told after the opening. */
  private opening: Output[] = []
  private thinking = false
  private outlining = false
  /** The content the topics were last brought in step with (M8.5). */
  private grownFor?: Content
  /** The last checkpoint (M9.3): an autosave after it writes only the log since. */
  private base?: Checkpoint

  constructor(
    source: Content,
    options: EngineOptions = {},
  ) {
    const state = options.state ?? createInitialState(source, options.seed ?? 1)
    this.world = new World(source, state)
    const content = this.world.content
    // Content text that reads like an instruction to the model, counted when the world loads (M10.19): the dev menu shows it.
    const suspect = suspectText(content).length
    if (suspect) this.world.guard['content'] = suspect
    this.log = options.log ? [...options.log] : []
    // A new game writes down the names it begins with (M9.1).
    if (!options.log && !options.state) this.log.push({ t: state.minutes, k: 'names', v: nameBook(source) })
    this.builder = options.builder ?? false
    this.host = { world: this.world, pass: (minutes) => this.pass(minutes), passUntil: (minutes, stop) => this.pass(minutes, stop), knownPlace: (target) => this.knownPlace(target) }
    this.topics = new TopicRegistry(content)
    for (const far of state.lore?.far ?? []) this.topics.addDuringPlay({ id: far.id, kind: 'place', name: far.name, aliases: [far.name] })
    // People named in talks (M10.9), by their first name.
    for (const s of state.lore?.people ?? []) this.topics.addDuringPlay({ id: s.id, kind: 'person', name: s.name, aliases: [s.name] })
    this.dialogue = new Dialogue(this.world, this.topics, new Knowledge(this.world, this.topics), () => this.recorder)
    this.dialogue.questOptions = (npc) => conversationActions(this.world, npc)
    this.dialogue.syncNews()
    this.eventMark = state.eventSeq
    this.setLlm(options.llm)
    this.world.costAsk = (id, request) => this.costAskOf(id, request)
    character(this.world)
    if (!state.bonds) seedBonds(this.world)
    // What the watchers see now is the start: only what changes after this is a signal (M8.1).
    if (!state.signals) primeWatchers(this.world)
    // The opponents who do not wait for the player, from the first day or from loading an old save (M8.3).
    startWorldPlans(this.world, this.questHost)
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

  /** The content of this game: the world's own, with the people who came and what was built (M8.5). */
  get content(): Content {
    return this.world.content
  }

  /** People who came and places that were built can be named in talk and commands, like any (M8.5). */
  private knowGrowth(): void {
    if (this.grownFor === this.world.content) return
    this.grownFor = this.world.content
    for (const npc of this.world.content.npcs.values()) {
      if (this.topics.entries.has(npc.id)) continue
      this.topics.addDuringPlay({ id: npc.id, kind: 'person', name: npc.name, ref: npc.id, aliases: [npc.name, callName(npc), firstName(npc), npc.short, ...npc.aliases] })
    }
    for (const location of this.world.content.locations.values()) {
      if (this.topics.entries.has(location.id)) continue
      this.topics.addDuringPlay({ id: location.id, kind: 'place', name: location.name, ref: location.id, aliases: [location.name, ...location.aliases] })
    }
    // What a round at the edge charted (M10.21): a far place to name like any.
    for (const topic of this.world.content.topics.values()) {
      if (this.topics.entries.has(topic.id) || topic.kind !== 'place') continue
      this.topics.addDuringPlay({ id: topic.id, kind: 'place', name: topic.name, aliases: [topic.name, ...topic.aliases] })
    }
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
      if (seen.length > 1 && this.content.locations.has(location.id)) gainXp(this.world, knob(this.world, 'rules.xp').place, `you found ${location.name}`)
    }
    const visited = (this.state.player.visited ??= [])
    if (visited.includes(location.area)) return
    visited.push(location.area)
    const area = this.content.areas.get(location.area)
    if (visited.length > 1 && area && area.kind !== 'route') gainXp(this.world, knob(this.world, 'rules.xp').area, `you came to ${area.name}`)
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
        precise: `A stranger from ${this.world.words.from} came to ${area.name} on ${weekdayName(this.world.now, this.world.calendar)}, in the ${clock.dayPart}.`,
        village: `There's a stranger about in ${area.name}, come from ${this.world.words.from}.`,
        far: `A stranger has come to ${this.world.words.region}, they say.`,
      },
    })
  }

  /**
   * What the player can see from where they stand goes on their map; after a
   * walk from one place to another, what lay along the way too (found in the
   * M10 playtest: the road to the Drowned Goose was walked and not on the map).
   */
  private lookAround(from?: string): void {
    const map = regionMap(this.content)
    const hex = map && playerHex(this.world)
    if (!map || !hex) return
    const was = from && from !== this.state.player.location ? (hexOfId(from) ?? map.locations.get(from)) : undefined
    // Along the way, as far as a day's walk: a long jump (a barge, a dream) is not a walk. By the exits it
    // goes along the road or path both places lie by, and on the trail (a walk put its own steps down).
    if (was && (was.col !== hex.col || was.row !== hex.row) && hexDistance(was, hex) <= 40) {
      const route = routeBetween(map, was, hex)
      for (const step of route.slice(0, -1)) look(this.world, map, step, true)
      if (!trailEndsAt(this.world, hex)) tread(this.world, map, route)
    }
    look(this.world, map, hex, isHexId(this.state.player.location) || canSetOut(this.world, this.state.player.location))
  }

  /** Everything that really happened, for the end of a game. */
  chronicle(): string {
    return chronicleText(this.world, this.startMinute)
  }

  /** What happened in this game, in Markdown, to download (M10.18). */
  chronicleMarkdown(): string {
    return chronicleMarkdown(this.world, this.startMinute)
  }

  /** A page of the journal: what the player knows about a topic, with sources and links. */
  page(id: string): JournalPage | undefined {
    // The whole region in colour (M10), on the surface or another level (map:under); the text stays for the terminal.
    if (id === 'map' || id.startsWith('map:')) {
      const level = id.startsWith('map:') ? id.slice(4) : undefined
      const hexMap = hexMapData(this.world, { whole: true, ...(level ? { level } : {}) })
      return { id, kind: 'map', name: `${upper(this.world.words.region)} as you know it`, lines: this.mapText().split('\n'), sources: [], links: [], ...(hexMap ? { hexMap } : {}) }
    }
    // The land beyond the region (M10): its own page, in the same style.
    if (id === 'land') {
      const land = landMapData(this.world)
      const lines = landLines(this.world)
      return { id, kind: 'land', name: `${upper(this.world.words.land)} as you know it`, lines: lines.length ? lines.slice(2) : [`You know nothing yet of what lies beyond ${this.world.words.region}.`], sources: [], links: [], ...(land ? { land } : {}) }
    }
    if (id.startsWith('quest_')) {
      const page = questPage(this.world, id.slice(6))
      return page ? { id, kind: 'quest', name: page.name, lines: page.lines, sources: [], links: [] } : undefined
    }
    // The great lines (M10.22): where each stands, what moved it, and its judgements.
    if (id === 'tides') return { id, kind: 'lore', name: 'The great lines', lines: tidesPage(this.world), sources: [], links: [] }
    // What waits for the player by the play mode (M10.24): hooks of a night, proposals.
    if (id === 'waiting') return { id, kind: 'lore', name: 'What waits for you', lines: waitingLines(this.world), sources: [], links: [] }
    // Why you are here (M10.29 C): the intro, the reason, whom to ask for, who knows you.
    if (id === 'why') return { id, kind: 'lore', name: 'Why you are here', ...whyLines(this.world), sources: [] }
    // A word to the chronicler (M10.24): the player's lines and what came of each.
    if (id === 'wishes') return { id, kind: 'lore', name: 'A word to the chronicler', lines: wishLines(this.world, Boolean(this.llm)), sources: [], links: [] }
    // The frames of this game (M10.24): for the screen at the start, and Settings after.
    if (id === 'frames') return { id, kind: 'lore', name: 'The frames of this game', lines: framesLines(this.world), sources: [], links: [], frames: framesView(this.world) }
    if (id === 'factions') return { id, kind: 'lore', name: 'Factions', lines: factionLines(this.world).length ? factionLines(this.world) : ['No faction knows you yet.'], sources: [], links: [] }
    if (id === 'lands') return { id, kind: 'lore', name: 'The lands', lines: realmLines(this.world), sources: [], links: [] }
    if (id.startsWith('realm_')) {
      const lines = realmPage(this.world, id.slice(6))
      return lines ? { id, kind: 'lore', name: capitalise(this.content.realms.get(id.slice(6))!.name), lines, sources: [], links: [] } : undefined
    }
    if (id.startsWith('faction_')) {
      const lines = factionPage(this.world, id.slice(8))
      return lines ? { id, kind: 'lore', name: capitalise(this.content.factions.get(id.slice(8))!.name), lines, sources: [], links: [] } : undefined
    }
    // A place to belong (M10.13).
    if (id === 'lodging') return { id, kind: 'lore', name: 'Your lodging', lines: lodgingPage(this.world), sources: [], links: [] }
    if (id === 'promises') return { id, kind: 'lore', name: 'Your word and theirs', lines: promiseLines(this.world), sources: [], links: [] }
    if (id === 'party') return { id, kind: 'lore', name: 'Your companions', lines: partyLines(this.world).length ? [...partyLines(this.world), ...companions(this.world).flatMap((m) => m.approvals.slice(-3).map((a) => `  ${callName(this.world.npc(m.npc))}: ${a.text}`))] : ['You travel alone.'], sources: [], links: [] }
    if (id === 'sheet') {
      const sheet = sheetData(this.world)
      return { id, kind: 'sheet', name: this.state.player.character?.name ?? 'You', lines: [...sheetLines(this.world), ...this.clockLines()], sources: [], links: [], ...(sheet ? { sheet: { ...sheet, notes: this.clockLines() } } : {}) }
    }
    this.dialogue.syncNews()
    const page = journalPage(this.world, this.topics, id)
    // A place, a person or an event with a place in the region: where it is, on a small map.
    if (page && ['person', 'place', 'area', 'event', 'lore'].includes(page.kind)) {
      const map = regionMap(this.content)
      const pos = posOf(this.world, id)
      const hex = map && pos ? map.hexOf(pos) : undefined
      if (map && hex && map.inside(hex)) {
        const view = mapView(this.world, { width: 34, height: 12, centre: hex, mark: hex })
        if (view) {
          // Only the rows with something the player knows, so a page does not show a field of nothing.
          const rows = view.rows.map((row) => row.map((c) => c.ch).join(''))
          const classes = view.rows.map((row) => row.map((c) => MAP_CODES[c.cls] ?? 'u').join(''))
          const used = rows.map((r, i) => (r.trim() ? i : -1)).filter((i) => i >= 0)
          const [from, to] = [Math.max(0, (used[0] ?? 0) - 1), Math.min(rows.length, (used.at(-1) ?? rows.length - 1) + 2)]
          page.map = { rows: rows.slice(from, to), classes: classes.slice(from, to) }
        }
      }
    }
    return page
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
    // With a model in play, every spoken line that did not come from it is the game's own (M10.8).
    if (this.llm) for (const output of outputs) if (output.kind === 'speech' && !output.source) output.source = 'rules'
    // A word in [brackets] is a link only when it does something (M10.8): otherwise plain text.
    for (const output of outputs) if (output.text.includes('[')) output.text = output.text.replace(/\[([^\]\n]{1,60})\]/g, (whole, word: string) => (word === 'build' || this.followable(word) ? whole : word))
    for (const listener of this.listeners) {
      for (const output of outputs) listener({ kind: 'out', t, output })
      for (const event of this.state.events) if (event.seq > this.eventMark) listener({ kind: 'event', t: event.t, event })
      for (const archived of this.world.archived) listener({ kind: 'archive', t, archived })
    }
    this.world.archived = []
    this.eventMark = this.state.eventSeq
    return outputs
  }

  /**
   * A place the stranger knows of but cannot see from here (M10.8, a highlighted word always does something): what
   * they know of it and which way it lies from here, from its summary and its place on the map. It is in the journal.
   */
  private knownPlace(target: string): string | undefined {
    const id = this.topics.find(target.replace(/^(the|a|an)\s+/i, ''))
    const journal = this.state.player.journal ?? {}
    if (!id || journal[id] === undefined) return undefined
    const kind = this.topics.kind(id)
    if (kind !== 'place' && kind !== 'area') return undefined
    const here = this.state.player.location
    const location = this.content.locations.get(id)
    if (id === here || (kind === 'area' && location === undefined && this.topics.entries.get(id)?.ref === this.world.location(here).area)) return undefined
    const from = posOfLocation(this.world, here)
    const to = posOf(this.world, id)
    if (!from || !to) return undefined
    const way = bearing(from, to)
    if (way.km < 0.3) return undefined
    const entry = this.topics.entries.get(id)
    const area = kind === 'area' ? this.content.areas.get(entry?.ref ?? '') : undefined
    const topic = this.content.topics.get(id)
    const summary = location?.summary ?? area?.summary ?? topic?.summary
    const first = summary ? `${summary.split(/(?<=[.!?])\s/)[0]} ` : ''
    return `${first}${this.topics.name(id).replace(/^./, (c) => c.toUpperCase())} lies ${way.wind} of here, ${way.walk}.`
  }

  /**
   * Whether a highlighted word does something (M10.8): it has a journal page, it is here to see (a person, an exit,
   * a thing, a detail), or it is a place the stranger has heard of (LOOK then says which way it lies).
   */
  private followable(word: string): boolean {
    const w = word.trim().toLowerCase().replace(/^(the|a|an)\s+/, '')
    if (!w) return false
    const id = this.topics.find(w)
    if (id && (this.state.player.journal ?? {})[id] !== undefined) return true
    if (findNpcHere(this.world, w)) return true
    const here = this.world.location(this.state.player.location)
    for (const exit of Object.values(here.exits)) {
      const name = this.world.location(exit.to).name.toLowerCase().replace(/^the\s+/, '')
      if (name.includes(w) || w.includes(name)) return true
    }
    if (here.objects.some((o) => (o.name ?? o.id.replace(/_/g, ' ')).toLowerCase().includes(w))) return true
    if (here.details.some((d) => d.words.some((x) => x.toLowerCase() === w))) return true
    return Object.keys(this.state.ground[here.id] ?? {}).some((item) => (this.content.items.get(item)?.name ?? item).toLowerCase().includes(w))
  }

  /** Swap the model at runtime, for instance after the player picks one in the settings. */
  /**
   * Whether a call must be asked for first (M10.21, asking.ts): its cost on
   * the client, against the player's threshold; in a replay, the questions the
   * log holds, in order.
   */
  private costAskOf(id: string, request: LlmRequest): number | undefined {
    if (this.replaying) {
      const next = this.replayAsks[0]
      if (!next || next.id !== id) return undefined
      this.replayAsks.shift()
      this.record(next)
      return next.usd
    }
    const usd = this.llm?.costOf?.(request)
    if (usd === undefined || usd < (this.llm?.askAboveUsd?.() ?? Infinity)) return undefined
    this.record({ t: this.world.now, k: 'ask', id, usd })
    return usd
  }

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
    // A far place waiting for its words counts too (M10.21: alone, it never started the models).
    return (this.state.brain?.pending.length ?? 0) + this.chroniclerWaiting + this.outlinesWaiting + (this.state.growth?.farPending?.length ?? 0) + (this.state.growth?.districtPending?.length ?? 0) + (this.state.growth?.landPending?.length ?? 0) + (this.state.growth?.expansions?.pending.length ?? 0) + (this.state.growth?.weavePending?.length ?? 0) + (this.state.growth?.storyPending?.length ?? 0) + (this.state.growth?.fullPending?.length ?? 0) + (this.state.tides?.pending ? 1 : 0)
  }

  /** Lets the models do their waiting work in the background: goal choices first, they are short. */
  /**
   * Runs what waits for a model. The host's pace (M10.22, a brake in real
   * time) says whether the night round and the month's judgement may run now;
   * without it they run. Says whether they ran.
   */
  async runModels(pace: Pace = {}): Promise<{ night: boolean; tides: boolean }> {
    this.syncPlayMode()
    await this.runBrain()
    const night = (await this.runChronicler(pace)).some((r) => r.reason === 'night')
    await this.runOutlines()
    await this.runFarPlaces()
    await this.runLands()
    await this.runExpansions()
    await this.runDistricts()
    await this.runFull()
    await this.runStories()
    await this.runWeaves()
    const tides = pace.tides === false ? false : await this.runTides()
    return { night, tides }
  }

  /**
   * The great lines judged now although no month began (M10.22: when the
   * months of the game do not come, at least once in so many sessions; the
   * host counts them). Kept in the log, so a replay judges at the same point.
   */
  judgeTidesNow(): boolean {
    if (!this.content.tides.size || this.state.tides?.pending) return false
    this.record({ t: this.world.now, k: 'due', v: 'tides' })
    this.dueTides()
    return true
  }

  private dueTides(): void {
    if (this.world.aiLive) tidesState(this.world).pending = true
    else applyTides(this.world, null)
  }

  /** The play mode (M10.24): set by the host or a test; kept in the log, so a replay goes on the same way. */
  setPlayMode(mode: PlayMode): void {
    if (playModeOf(this.world) === mode) return
    this.record({ t: this.world.now, k: 'mode', v: mode })
    this.state.playMode = mode
  }

  /** The player's play mode from the settings, as the model client knows it (M10.24). */
  private syncPlayMode(): void {
    const want = this.llm?.playMode?.()
    if (want && PLAY_MODES.includes(want)) this.setPlayMode(want)
  }

  /**
   * A night round's answer, by the play mode (M10.24): in direct mode it waits
   * as a proposal; in think mode its new hooks wait for the morning; else, and
   * without a model's answer, it is applied now.
   */
  private settleRun(run: ChronicleRun, output: ChronicleOutput | null, offered?: Offered): string[] {
    if (output && propose(this.world, { kind: 'chronicle', run, output, ...(offered ? { offered } : {}) })) {
      const st = this.state.chronicle!
      st.pending = st.pending.filter((r) => r.id !== run.id)
      return []
    }
    return applyRun(this.world, run.id, output ? holdHooks(this.world, run, output, offered) : output, undefined, offered)
  }

  /** The weave round's answer, by the play mode (M10.24): in direct mode a proposal. */
  private settleWeave(key: string, reply: WeaveReply | null): void {
    if (reply && propose(this.world, { kind: 'weave', key, weave: reply })) {
      const g = this.state.growth!
      g.weavePending = (g.weavePending ?? []).filter((k) => k !== key)
    } else applyWeave(this.world, key, reply)
  }

  /** The month's judgement, by the play mode (M10.24): in direct mode a proposal. */
  private settleTides(reply: TidesReply | null): void {
    if (reply && propose(this.world, { kind: 'tides', tides: reply })) tidesState(this.world).pending = false
    else applyTides(this.world, reply)
  }

  /** The month's judgement of the great lines (M10.22), one call for all of them. Says whether it ran. */
  async runTides(): Promise<boolean> {
    if (this.outlining || !this.state.tides?.pending) return false
    this.outlining = true
    try {
      const llm = this.llm
      let reply: TidesReply | null = null
      if (llm) {
        try {
          reply = tidesReply((await llm.complete(tidesRequest(this.world))).text)
        } catch {
          reply = null
        }
      }
      if (!this.state.tides?.pending) return false
      this.record({ t: this.world.now, k: 'tides', v: reply })
      this.settleTides(reply)
      return true
    } finally {
      this.outlining = false
    }
  }

  /** Districts whose new people the chronicler weaves into the world (M10.22), one at a time, at normal priority. */
  async runWeaves(): Promise<void> {
    if (this.outlining) return
    this.outlining = true
    try {
      const g = this.state.growth
      while (g?.weavePending?.length) {
        const key = g.weavePending[0]!
        const llm = this.llm
        let reply: WeaveReply | null = null
        if (llm) {
          try {
            reply = weaveReply((await llm.complete(weaveRequest(this.world, key))).text)
          } catch {
            reply = null
          }
        }
        if (!g.weavePending.includes(key)) continue
        this.record({ t: this.world.now, k: 'weave', key, v: reply })
        this.settleWeave(key, reply)
      }
    } finally {
      this.outlining = false
    }
  }

  /** Rounds at the edge of the world book (M10.21), one at a time. */
  async runExpansions(): Promise<void> {
    if (this.outlining) return
    this.outlining = true
    try {
      const e = this.state.growth?.expansions
      while (e?.pending.length) {
        const ask = e.pending[0]!
        const llm = this.llm
        let reply: ExpansionReply | null = null
        if (llm) {
          try {
            reply = expansionReply((await llm.complete(expansionRequest(this.world, ask))).text)
          } catch {
            reply = null
          }
        }
        if (!e.pending.some((p) => p.key === ask.key)) continue
        this.record({ t: this.world.now, k: 'expansion', key: ask.key, v: reply })
        this.settleExpansionRun(ask, reply)
      }
    } finally {
      this.outlining = false
    }
  }

  /** A round's answer by the play mode (M10.24): in direct mode the outline waits as a proposal. */
  private settleExpansionRun(ask: ExpansionAsk, reply: ExpansionReply | null): void {
    const outline = playModeOf(this.world) === 'direct' ? soundOutlines(this.world, reply)[0] : undefined
    if (outline && propose(this.world, { kind: 'expansion', expansion: { ask, outline } })) unpend(this.world, ask.key)
    else settleExpansion(this.world, ask, reply)
  }

  /** Lands the designer only framed, waiting for the chronicler to write the rest (M10.23), one at a time. */
  async runLands(): Promise<void> {
    if (this.outlining) return
    this.outlining = true
    try {
      const g = this.state.growth
      while (g?.landPending?.length) {
        const id = g.landPending[0]!
        const llm = this.llm
        let words: LandWords | null = null
        if (llm) {
          try {
            words = landWords((await llm.complete(landRequest(this.world, id))).text)
          } catch {
            words = null
          }
        }
        if (!g.landPending.includes(id)) continue
        this.record({ t: this.world.now, k: 'land', id, v: words })
        applyLand(this.world, id, words)
      }
    } finally {
      this.outlining = false
    }
  }

  /**
   * The stories of new regions (M10.25), one at a time; a town's waits for its
   * first district, and comes at a later round.
   */
  async runStories(): Promise<void> {
    if (this.outlining) return
    this.outlining = true
    try {
      const g = this.state.growth
      for (const topic of [...(g?.storyPending ?? [])]) {
        if (!g?.storyPending?.includes(topic) || !storyReady(this.world, topic)) continue
        const llm = this.llm
        let reply: StoryReply | null = null
        if (llm) {
          try {
            reply = storyReply((await llm.complete({ ...storyRequest(this.world, topic), priority: 'low' })).text)
          } catch (error) {
            // No answer (the hour's budget, the network): it waits for a later run, three paid tries at most.
            if (waitsFree(error)) continue
            const tries = (this.fullTries.get(`story:${topic}`) ?? 0) + 1
            this.fullTries.set(`story:${topic}`, tries)
            if (tries < 3) continue
            reply = null
          }
        }
        if (!g.storyPending.includes(topic)) continue
        this.record({ t: this.world.now, k: 'story', topic, v: reply })
        this.settleStory(topic, reply)
      }
    } finally {
      this.outlining = false
    }
  }

  /** How often a round of a full build or a region's story found no answer that may have cost something (M10.25), in this session: three times, then it is given up. */
  private readonly fullTries = new Map<string, number>()

  /**
   * The rounds of regions built in full (M10.25), one at a time, in order: a
   * step of the world build over the region (put right up to twice when it
   * does not load), or its polish round. What it kept is in the log.
   */
  async runFull(): Promise<void> {
    if (this.outlining) return
    this.outlining = true
    try {
      const g = this.state.growth
      while (g?.fullPending?.length) {
        const key = g.fullPending[0]!
        const [topic, round] = key.split(':') as [string, FullRound]
        const llm = this.llm
        let layer: Record<string, Record<string, unknown>[]> | null = null
        let problems: string[] = []
        const request = fullRequest(this.world, topic, round)
        if (llm && request) {
          let draft
          try {
            draft = readFull(this.world, topic, round, (await llm.complete(request)).text)
          } catch (error) {
            // No answer (the hour's budget, the network): the round waits for a later run, three paid tries at most,
            // and the rounds after it wait with it, since they build on it (M10.25: the played proof lost its places so).
            if (waitsFree(error)) break
            const tries = (this.fullTries.get(key) ?? 0) + 1
            this.fullTries.set(key, tries)
            if (tries < 3) break
            problems = [`no answer: ${error instanceof Error ? error.message : String(error)}`]
          }
          try {
            for (let fix = 0; draft && fix < 2 && draft.problems.length; fix++) {
              const again = fullFixRequest(this.world, topic, round, draft)
              if (!again) break
              draft = mergeFull(this.world, topic, draft, (await llm.complete(again)).text)
            }
          } catch {
            // A fix round without an answer: what there is is judged as it stands.
          }
          if (draft) {
            problems = draft.problems
            layer = draft.problems.length ? null : (fullLayer(this.world, topic, draft) ?? null)
          }
        }
        if (!g.fullPending.includes(key)) continue
        this.record({ t: this.world.now, k: 'full', topic, round, v: layer, ...(problems.length ? { problems: problems.slice(0, 5) } : {}) })
        applyFull(this.world, topic, round, layer, problems)
      }
    } finally {
      this.outlining = false
    }
  }

  /** A region's story by the play mode (M10.24): in direct mode a proposal; else kept, its quest held in think mode. */
  private settleStory(topic: string, reply: StoryReply | null): void {
    if (reply && propose(this.world, { kind: 'story', story: { topic, reply } })) {
      const g = this.state.growth!
      g.storyPending = (g.storyPending ?? []).filter((x) => x !== topic)
    } else applyStory(this.world, topic, reply)
  }

  /** Districts of far towns waiting for the chronicler's words (M10.21), one at a time. */
  async runDistricts(): Promise<void> {
    if (this.outlining) return
    this.outlining = true
    try {
      const g = this.state.growth
      while (g?.districtPending?.length) {
        const key = g.districtPending[0]!
        const [topic, id] = key.split(':') as [string, string]
        const llm = this.llm
        let words: DistrictWords | null = null
        if (llm) {
          try {
            words = districtWords((await llm.complete({ ...districtRequest(this.world, key), priority: 'low' })).text)
          } catch {
            words = null
          }
        }
        if (!g.districtPending.includes(key)) continue
        this.record({ t: this.world.now, k: 'district', key, v: words })
        if (!applyDistrict(this.world, topic, id, words)) g.districtPending = g.districtPending.filter((k) => k !== key)
      }
    } finally {
      this.outlining = false
    }
  }

  /** Far places waiting for the chronicler's words to be made playable (M9.1), one at a time. */
  async runFarPlaces(): Promise<void> {
    if (this.outlining) return
    this.outlining = true
    try {
      const g = this.state.growth
      while (g?.farPending?.length) {
        const topic = g.farPending[0]!
        const llm = this.llm
        let words: FarWords | null = null
        if (llm) {
          try {
            words = farWords((await llm.complete({ ...farRequest(this.world, topic), priority: 'low' })).text)
          } catch {
            words = null
          }
        }
        if (!g.farPending.includes(topic)) continue
        this.record({ t: this.world.now, k: 'far', topic, v: words })
        if (!applyFarPlace(this.world, topic, words)) g.farPending = g.farPending.filter((p) => p !== topic)
      }
    } finally {
      this.outlining = false
    }
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
            const parse = (text: string) => JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')) as Record<string, unknown>
            let request = goalRequest(this.world, choice)
            let parsed = parse((await llm.complete(request)).text)
            // At most two questions first (M9.3), answered from the NPC's own head; then it chooses.
            const asked = Array.isArray(parsed['lookup']) ? (parsed['lookup'] as unknown[]).filter((q): q is string => typeof q === 'string').slice(0, 2) : []
            if (asked.length && request.meta?.['lookups']) {
              const keys = request.meta['keys'] as Record<string, string>
              const answers = asked.map((text) => {
                const q = parseLookup(text, (k) => keys[k] ?? (this.content.topics.has(k) || this.content.locations.has(k) || this.content.areas.has(k) || this.content.items.has(k) ? k : undefined))
                if (!q) return `${text}: not a question you can ask`
                const a = answerLookup(this.world, choice.npc, q)
                return 'refused' in a ? `${text}: ${a.refused}` : `${a.title}: ${a.text}`
              })
              request = goalRequest(this.world, choice, answers)
              parsed = parse((await llm.complete(request)).text)
            }
            // Keys back to ids before it is recorded: a replay applies the same answer.
            reply = fromKeys(parsed, request.meta?.['keys'] as Record<string, string> | undefined)
          } catch {
            reply = null
          }
        }
        if (!this.state.brain.pending.some((p) => p.id === choice.id)) continue
        this.record({ t: this.world.now, k: 'goals', choice: choice.id, v: reply })
        const result = applyChoice(this.world, choice.id, reply)
        if (reply !== null && result.rejected.length) llm?.report?.({ reason: 'goal', role: 'brain' })
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
  async runChronicler(pace: Pace = {}): Promise<{ run: string; reason: ChronicleRun['reason']; problems: string[] }[]> {
    if (this.chronicling) return []
    this.chronicling = true
    const done: { run: string; reason: ChronicleRun['reason']; problems: string[] }[] = []
    // The night run waits while the host's pace holds it back (M10.22); a run that cannot wait does not.
    const next = () => this.state.chronicle?.pending.find((r) => r.reason !== 'night' || pace.night !== false)
    try {
      for (let run = next(); run; run = next()) {
        let output: ChronicleOutput | null = null
        let problems: string[] = []
        let offered: Offered | undefined
        const llm = this.llm
        if (llm) {
          try {
            if (run.reason === 'spark') {
              // The spark of a quiet night (M10.27): one small call on the brain, read as one beat of a storyline.
              const { request, keys } = sparkRequest(this.world, run)
              ;({ output, problems } = readSpark((await llm.complete({ ...request, priority: 'low' })).text, keys))
            } else {
              const model = { complete: async (r: ChroniclerRequest) => llm.complete({ ...(r as LlmRequest), priority: 'low' }) }
              ;({ output, problems, offered } = await writeRun(this.world, run, model))
            }
          } catch (error) {
            problems = [error instanceof Error ? error.message : String(error)]
          }
        }
        // The run may have been settled meanwhile (the model was switched off).
        if (!this.state.chronicle?.pending.some((r) => r.id === run.id)) continue
        this.record({ t: this.world.now, k: 'chron', run: run.id, v: output, ...(offered ? { offered } : {}) })
        problems.push(...this.settleRun(run, output, offered))
        // For the dev menu (M10.1): what the run got, gave and had refused. Not saved.
        this.devRuns.push({ run: run.id, t: this.world.now, lines: run.lines, offered: offered ?? { facts: [], allowed: [] }, output, problems: [...problems] })
        if (this.devRuns.length > 20) this.devRuns.shift()
        this.dialogue.syncNews()
        done.push({ run: run.id, reason: run.reason, problems })
      }
    } finally {
      this.chronicling = false
    }
    return done
  }

  /**
   * Improvisation (M10.16): the model tells what happens and may propose one
   * effect, which the engine checks and carries out. Without a model, the
   * thing's own line; when the call fails (the budget spent, too slow), the
   * same line and why, as in a talk.
   */
  private async improvise(imp: Improvisable): Promise<Output[]> {
    const recorder = this.recorder
    if (!recorder || !this.world.aiLive) return improviseFallback(this.world, imp)
    try {
      const reply = await recorder.complete({ ...improviseRequest(this.world, imp), timeoutMs: 10000 })
      const read = readImprovisation(this.world, imp, reply.text)
      if ('problem' in read) {
        this.world.guard[read.problem] = (this.world.guard[read.problem] ?? 0) + 1
        recorder.report?.({ reason: read.problem, role: 'voice' })
        return improviseFallback(this.world, imp, { kind: 'checks', message: 'the answer did not pass' })
      }
      // An effect outside what the content allows is refused; the narration stays (a noted rejection, not a failure).
      if (read.refused) {
        this.world.guard['bounds'] = (this.world.guard['bounds'] ?? 0) + 1
        recorder.report?.({ reason: 'bounds', role: 'voice', fixed: `effect refused: ${read.refused}` })
      }
      return applyImprovisation(this.world, imp, read.narration, read.effect, read.spent)
    } catch (error) {
      const kind = error instanceof LlmError ? error.kind : 'network'
      return improviseFallback(this.world, imp, { kind, message: error instanceof Error ? error.message : String(error) })
    }
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
      // A line the rules answered (M10.28), for the AI log.
      byRule: (note) => llm.byRule?.(note),
      // The time a spoken reply may take, as the player set it (M10.8).
      ...(llm.replyWithinMs ? { replyWithinMs: () => llm.replyWithinMs!() } : {}),
    }
  }

  start(): Output[] {
    wakePulse(this.world)
    // What everyone in this world knows (M10.29 P), in the journal from the start.
    const journal = (this.state.player.journal ??= {})
    for (const topic of this.content.topics.values()) if (topic.common) journal[topic.id] ??= this.world.now
    const intro = this.content.world.intro?.trim()
    // The world's intro as a moment (M10.29 C), with the picture of where it begins and a way to "Why you are here".
    // The card without the hint to type LOOK, which the log keeps below it.
    const told = intro?.replace(/\n*\s*Type LOOK\b[^\n]*$/i, '').trim()
    const card = intro ? { kind: 'intro' as const, title: this.content.world.name, text: told || intro, picture: this.state.player.location, link: 'why' } : undefined
    const outputs: Output[] = [
      ...(card ? [{ kind: 'card' as const, text: `${card.title}\n${intro}`, card }] : []),
      // Why you are here (M10.9), after the world's own opening.
      ...arrival(this.world),
      describeRoom(this.world),
      // Where the game begins may be worth a moment (M10.11): the wreck on Skerrow.
      ...momentsNow(this.world, true),
      { kind: 'system', text: 'The pace of events is normal. Type TEMPO CALM or TEMPO DRAMATIC for less or more happening in the world.' },
      ...this.opening,
    ]
    // Words in brackets lead somewhere from the first line on (M10.8).
    for (const output of outputs) if (output.text.includes('[')) output.text = output.text.replace(/\[([^\]\n]{1,60})\]/g, (whole, word: string) => (this.followable(word) ? whole : word))
    return outputs
  }

  /**
   * The narrator (M10.11): one call that rewords the paragraph of a journey in
   * the voice of the world. Kept only when it names nothing new, has no word
   * that is not here, and stays short; else the rules' paragraph stands.
   */
  private async narrate(outputs: Output[]): Promise<void> {
    const recorder = this.recorder
    if (!recorder || !this.world.aiLive) return
    for (const output of outputs) {
      if (!output.journey && !output.returning) continue
      try {
        const frame = worldText([worldFrame(this.content, this.world.land), voiceSummary(this.content, this.world.land)].filter(Boolean).join('\n\n'))
        // A journey, or what changed since the last visit (M10.13): the same narrator, one call.
        const reply = await recorder.complete({ ...journeyRequest(this.world, output.text, frame, output.returning ? 'return' : 'journey'), timeoutMs: 8000 })
        const text = String((JSON.parse(reply.text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as { text?: unknown }).text ?? '').trim()
        const words = vocabularyOf({ ...this.content, chronicler: undefined }, worldFrame(this.content, this.world.land), this.world.calendar.months, this.world.calendar.weekdays, output.text)
        const limit = text ? crossesLimits(text, words) : undefined
        const fine = text && !limit && wordCount(text) <= Math.max(110, wordCount(output.text) * 1.5) && !unknownNames(text, words).length && !strangeWords(this.world, text).length && !hasOurOaths(text) && !outOfCharacter(text)
        if (fine) output.text = text
        else recorder.report?.({ reason: limit ? 'limits' : 'invented', role: 'chronicler', ...(limit ? { detail: limit } : {}) })
      } catch {
        // Optional: the rules' paragraph is enough.
      }
    }
  }

  /** What the quest engine may ask of the engine: time, effect plans and encounters. */
  private get questHost(): QuestHost {
    return {
      pass: (minutes) => this.pass(minutes),
      plan: (id) => void this.world.notices.push(...startPlan(this.world, this.questHost, id, 'quest').map((o) => o.text)),
      encounter: (id) => (this.content.encounters.has(id) ? this.startEncounter(id) : []),
      heard: (text, from) => this.heardOf(text, from),
    }
  }

  /** The people and places a text names go in the journal as heard of (M9.4); with a teller, the map guesses from what they said. */
  private heardOf(text: string, from?: string): void {
    const found = this.topics.recognise(text).filter((id) => ['person', 'place', 'area'].includes(this.topics.kind(id) ?? '') && id !== from)
    // One entry per name: "Fenna Visser" is the news of the missing girl, not also the girl as a second person.
    const names = new Set(Object.keys(this.state.player.journal ?? {}).map((id) => this.topics.name(id)))
    const ids: string[] = []
    for (const id of [...found].sort((a, b) => Number(a.startsWith('npc_')) - Number(b.startsWith('npc_')))) {
      const name = this.topics.name(id)
      if (names.has(name) && !(this.state.player.journal ?? {})[id]) continue
      names.add(name)
      ids.push(id)
    }
    this.dialogue.learn(...ids)
    if (!from) return
    const sources = (this.state.player.sources ??= {})
    for (const id of ids) {
      const list = (sources[id] ??= [])
      if (!list.some((s) => s.from === from)) list.push({ from, t: this.world.now, level: 2 })
    }
  }

  /** After time passed: deaths reach the quests, plans run their phases, stages and endings are checked. */
  private questsTick(): Output[] {
    this.knowGrowth()
    const out: Output[] = []
    for (const id of this.world.deaths.splice(0)) out.push(...questsOnDeath(this.world, this.questHost, id))
    expireConditions(this.world)
    // Signals go to their handler first, so what they plan runs with the rest (M8.1).
    out.push(...processSignals(this.world, this.questHost))
    out.push(...plansDue(this.world, this.questHost))
    out.push(...evaluate(this.world, this.questHost))
    return out
  }

  async handle(input: string): Promise<Output[]> {
    let text = input.trim().slice(0, 500)
    if (!text) return []
    this.record({ t: this.world.now, k: 'cmd', v: text })
    // The answer to a choice the game put (after the M10 playtest): a number or a name runs what it stands for.
    const answer = this.state.talk || this.state.combat ? undefined : answerChoice(this.world, text)
    if (answer && 'error' in answer) return [{ kind: 'error', text: answer.error }]
    if (answer) text = answer.run
    // The answer to a question about cost (M10.21): agreed, the thing it was about is done now.
    const cost = /^cost (go|not|always) (\S+)$/.exec(text)
    const costLines: Output[] = []
    if (cost) {
      const done = answerAsk(this.world, cost[1]!, cost[2]!)
      if (done.always && !this.replaying) this.llm?.askNever?.()
      if (!done.run) return this.shown(done.outputs)
      costLines.push(...done.outputs)
      text = done.run
    }
    for (const listener of this.listeners) listener({ kind: 'in', t: this.world.now, text })
    // The stranger plays (M10.24): the pulse looks them up from now on, also in a game begun before it.
    wakePulse(this.world)
    // On the way to a region the chronicler is laying out (M10.25): the arrival once it is done; until then, only
    // what needs no new place, or ARRIVE.
    const came = arrivedAt(this.world)
    const onTheRoad = onTheWay(this.world, text)
    if (onTheRoad) return this.shown([...came, ...onTheRoad])
    const before = this.state.player.location
    const talkBefore = this.state.talk
    // A line in quotes is speech (the conversation window sends them so), but it can still be a quest's own words.
    const spoken = text.replace(/^"|"$/g, '')
    let quest = this.state.combat ? undefined : questAction(this.world, this.questHost, spoken)
    // In a conversation, "ask about the cat" is asked of whoever you talk to (found in the M9.4 playtest:
    // the quest knew "ask aaltje about the cat", and the player talking to Aaltje never said her name).
    const partner = this.state.talk?.npc
    if (!quest && !this.state.combat && partner) {
      const named = spoken.replace(/^(ask|tell|show|give|persuade|convince)\s+(?=about\b|over\b|for\b|to\b|how\b)/i, `$1 ${callName(this.world.npc(partner)).toLowerCase()} `)
      if (named !== spoken) quest = questAction(this.world, this.questHost, named)
    }
    // A fight in front of the stranger (M10.3, left over): this move answers it first.
    const brawl = this.brawlMove(spoken)
    const outputs = [...costLines, ...(brawl?.done ? brawl.out : [...(brawl?.out ?? []), ...(quest ?? (this.state.combat ? await this.inFight(text) : await this.route(text)))])]
    // A far town grows by district (M10.21): the first when the stranger does something there (buys, asks,
    // rents a bed, says something in a talk), another when they go into it by its street.
    const doing = !outputs.some((o) => o.kind === 'error') && (/^(?:buy|sell|rent|ask|tell|order|trade|haggle|work|take lodgings?|lodge)\b/i.test(text) || Boolean(talkBefore && this.state.talk))
    const due = this.state.combat ? undefined : districtDue(this.world, doing)
    if (due) outputs.push(...wantDistrict(this.world, due.topic, due.id))
    // A new region's story (M10.25): once it is made and the stranger is there, by the setting of this game.
    // A region built in full (M10.25): its rounds, asked for once, when the stranger is there and they did not start at departure.
    const full = this.state.combat ? undefined : fullDue(this.world)
    if (full) outputs.push(...wantFull(this.world, full))
    const story = this.state.combat ? undefined : storyDue(this.world)
    if (story) outputs.push(...wantStory(this.world, story))
    const talk = this.state.talk
    if (talk && this.state.npcs[talk.npc]?.location !== this.state.player.location) this.state.talk = undefined
    this.dialogue.learn(this.state.player.location, areaTopicId(this.content, this.world.location(this.state.player.location).area))
    this.arrive()
    this.lookAround(before)
    // A leader going ahead moves with the player's steps (M10.3).
    leadAhead(this.world)
    // A child seen with a parent: family the stranger knows of (M10.4).
    seeFamily(this.world)
    if (before !== this.state.player.location) {
      arrived(this.world)
      // Into another land (M10.23): the crossing at its border, the money changed, and a line in the chronicle.
      outputs.push(...crossBorder(this.world, before))
      // Into someone's home without leave (M10.3): trespass, if someone of the house sees it.
      outputs.push(...entered(this.world, this.state.player.location))
      outputs.push(...triggers(this.world, this.questHost, { at: this.state.player.location }))
      // Into an area with news of its own: the player hears it once (M9.4).
      tellAreaNews(this.world, outputs)
      outputs.push(...findPurse(this.world), ...payToll(this.world), ...this.maybeEncounter(before))
    }
    noticeCarried(this.world)
    outputs.push(...this.questsTick())
    // Whoever was robbed and sees their own thing on the stranger knows it now (M10.3).
    outputs.push(...stolenSeen(this.world))
    outputs.push(...this.confrontations(), ...this.attacks(), ...this.sought(), ...brawlShown(this.world))
    settleRuns(this.world)
    settleChoices(this.world)
    outputs.push(...this.world.notices.splice(0).map((text) => ({ kind: 'system' as const, text })))
    // Coming back and gestures (M10.13): what changed since the last visit, after the place's description; and what
    // people who share something with the stranger do when they see them come, trade with them, or see them go.
    const nowAt = this.state.player.location
    if (before !== nowAt) {
      const back = returningOutput(this.world, nowAt)
      const room = outputs.findIndex((o) => o.kind === 'room')
      outputs.splice(room >= 0 ? room + 1 : outputs.length, 0, ...back)
      outputs.push(...gestures(this.world, 'leave', this.world.npcsAt(before)), ...gestures(this.world, 'arrive', this.world.npcsAt(nowAt)))
    } else if (/^(?:list|buy|sell)\b/i.test(text.trim())) outputs.push(...gestures(this.world, 'shop', this.world.npcsAt(nowAt)))
    noteVisit(this.world)
    // Moments (M10.11): a place worth it reached or seen, a tiding heard; a card once each.
    outputs.push(...momentsNow(this.world))
    // What a night brought, in think mode (M10.24): put to the player in the morning, once, after the rest.
    outputs.push(...morningHooks(this.world))
    // Two notions of what lies beyond the edge, in think mode (M10.21): the player's choice.
    outputs.push(...expansionChoice(this.world))
    // Into a region or district still being laid out (M10.25): its rounds from the setting off, and the arrival kept
    // back until they are done. A journey in the voice of the world, when a model may help (M10.11); the rules'
    // paragraph otherwise.
    const held = setOff(this.world, before, outputs)
    await this.narrate(held ?? outputs)
    outputs.unshift(...came)
    const shown = this.shown(outputs)
    this.keepTalkLines(talkBefore, text, shown)
    return shown
  }

  /**
   * The lines of a talk, kept by the engine (M10.8): what was typed and what came back, for the talk window, which
   * so shows every line, also when the window had no focus when the answer came. An ended talk stays for its window.
   */
  private keepTalkLines(before: TalkState | undefined, typed: string, outputs: Output[]): void {
    const into = this.state.talk ?? before
    if (!into) return
    const list = (into.lines ??= [])
    let id = list.at(-1)?.id ?? 0
    list.push({ id: ++id, kind: 'input', text: typed })
    for (const o of outputs) if (o.kind !== 'room') list.push({ id: ++id, kind: o.kind, text: o.text, ...(o.source ? { source: o.source } : {}) })
    if (list.length > MAX_TALK_LINES) list.splice(0, list.length - MAX_TALK_LINES)
    this.lastTalk = this.state.talk ? undefined : before && before !== this.state.talk ? { npc: before.npc, lines: list } : this.lastTalk
    keepPastLines(this.world, into.npc, typed, outputs, into.began)
  }

  /**
   * RECALL <topic> (M10.29 P; Bram: what is a Nacrean?): what the stranger
   * knows of it, from their journal (what everyone here knows is there from
   * the start): the first lines of its page and what they heard of it; else
   * that they know nothing of it.
   */
  private recall(words: string): Output[] {
    const id = this.topics.find(words)
    const known = id !== undefined && (this.state.player.journal ?? {})[id] !== undefined
    const page = known ? journalPage(this.world, this.topics, id!) : undefined
    if (!page) return [{ kind: 'narration', text: 'You know nothing of that.' }]
    const lines = page.lines.filter((l) => l.trim()).slice(0, 4)
    return [{ kind: 'narration', text: `${page.name}: ${lines.join(' ')}` }]
  }

  /** QUESTS (M10.30): the quests and requests taken up, open ones with where they stand and what to do now. */
  private questsText(): string {
    const { open, over } = questLines(this.world)
    for (const request of knownRequests(this.world)) {
      const line = `  ${requestName(this.world, request)}`
      if (request.status === 'done') over.push(`${line}: done.`)
      else if (request.status === 'failed') over.push(`${line}: too late.`)
      else open.push(line)
    }
    if (!open.length && !over.length) return 'You have taken nothing up yet. Talk to people: some will ask you for something.'
    return [...(open.length ? ['Open:', ...open] : []), ...(over.length ? ['Over:', ...over] : [])].join('\n')
  }

  /** A page of the journal as text (M10.29 R): its lines and links, or for a person with HISTORY every talk by day. */
  private journalText(args: string[]): Output[] {
    const history = /^history$/i.test(args.at(-1) ?? '')
    const words = (history ? args.slice(0, -1) : args).join(' ')
    const id = /^why( you are here)?$/i.test(words) ? 'why' : this.topics.find(words)
    // A quest by its name (M10.30): JOURNAL THE GREY CAT, when no page of the journal goes by those words.
    const quest = () => Object.keys(questlog(this.world)).find((q) => words && this.content.quests.get(q)?.name.toLowerCase().includes(words.toLowerCase()))
    const found = id ? this.page(id) : undefined
    const questId = found ? undefined : quest()
    const page = found ?? (questId ? this.page(`quest_${questId}`) : undefined)
    if (!page) return [{ kind: 'error', text: 'Your journal has nothing of that.' }]
    if (history) {
      if (page.kind !== 'person') return [{ kind: 'error', text: `${page.name} is no person to have talked with.` }]
      if (!page.history?.length) return [{ kind: 'system', text: `You have not talked with ${page.name} yet.` }]
      const lines = page.history.flatMap((d) => [`${d.day}:`, ...d.talks.flatMap((talk, i) => [...(i ? ['  ...'] : []), ...talk.map((l) => `  ${l.you ? `You: "${l.text}"` : l.text}`)])])
      return [{ kind: 'system', text: [`${page.name}, every talk:`, ...lines].join('\n') }]
    }
    return [{ kind: 'system', text: [page.name, ...page.lines, ...page.links.map((l) => `${l.label}: ${l.name}`), ...(page.history?.length ? ['(JOURNAL ' + words + ' HISTORY: every talk)'] : [])].join('\n') }]
  }

  private async route(text: string): Promise<Output[]> {
    if (text.startsWith('@')) return this.build(text.slice(1))
    // Stuck in the fen, or a cat for a while (M7.2): some things cannot be done.
    const held = this.heldBack(text)
    if (held) return held
    // RECALL <topic> (M10.29 P): what the stranger knows of it; in a fight RECALL is the fight's own.
    const recalled = this.state.talk || this.state.combat ? undefined : /^(?:recall|remember)\s+(?:about\s+)?(.+?)\s*$/i.exec(text.trim())
    if (recalled) return this.recall(recalled[1]!)
    // Who the stranger came as, in a world without classes (M10.29 C); outside a talk, where it could be words.
    const background = this.state.talk ? undefined : /^background\s+(.+?)\s*$/i.exec(text.trim())
    if (background) return chooseBackground(this.world, background[1]!)
    const hire = /^(?:hire|rent|borrow)\s+(?:a\s+|an\s+|the\s+)?(.+?)\s*$/i.exec(text.trim())
    if (hire) {
      const hired = this.hire(hire[1]!)
      if (hired) return hired
    }
    // LISTEN to people talking here (M8.2).
    if (/^(?:listen|eavesdrop|overhear)(?:\s+(?:in|to|at)\b.*)?$/i.test(text.trim()) && !this.state.talk) {
      const heard = listen(this.world)
      // Who stays to listen may hear a line in the listener's voice, from the small model (M9.1).
      const chat = longListen(this.world)
      const recorder = this.recorder
      if (chat && recorder && this.world.aiLive) {
        try {
          const reply = await recorder.complete(chatLineRequest(this.world, chat, worldText(worldFrame(this.content, this.world.land))))
          heard.push(...chatLine(this.world, chat, reply.text))
        } catch {
          // Optional: the template is enough.
        }
      }
      return [...heard, ...this.pass(2)]
    }
    // DISTRICT <town> <id> (M10.21): what "go on" runs after the question of cost; only where the stranger is, in that town.
    const district = /^district\s+([a-z0-9_]+)\s+([a-z0-9_]+)$/.exec(text.trim())
    if (district && !this.state.talk) {
      const [, topic, id] = district as unknown as [string, string, string]
      return farTopicAt(this.world, this.state.player.location) === topic && districtsOf(this.content, topic).some((d) => d.id === id) ? wantDistrict(this.world, topic, id) : [{ kind: 'error', text: 'There is nothing to make here.' }]
    }
    // BUILD <topic> (M10.25): what "go on" runs after the question of cost for a region built in full.
    const buildCmd = /^build\s+([a-z0-9_]+)$/.exec(text.trim())
    if (buildCmd && !this.state.talk) return wantFull(this.world, buildCmd[1]!)
    // STORY <topic> (M10.25): what "go on" runs after the question of cost; only in that region.
    const storyCmd = /^story\s+([a-z0-9_]+)$/.exec(text.trim())
    if (storyCmd && !this.state.talk) return storyDue(this.world) === storyCmd[1] || (farTopicAt(this.world, this.state.player.location) === storyCmd[1] && storyReady(this.world, storyCmd[1]!)) ? wantStory(this.world, storyCmd[1]!) : [{ kind: 'error', text: 'There is nothing to write here.' }]
    // The play modes (M10.24): hooks of a night that wait (think), and proposals (direct).
    const said = text.trim().toLowerCase()
    if (!this.state.talk && (said === 'hooks' || said === 'hooks later')) return said === 'hooks' ? hookChoice(this.world) : [{ kind: 'text', text: 'It can wait. HOOKS shows it again, for a week.' }]
    const hook = /^hook\s+(hook_\d+)$/.exec(said)
    if (hook && !this.state.talk) return takeHook(this.world, hook[1]!)
    if (!this.state.talk && (said === 'proposals' || said === 'proposal')) return proposalsText(this.world)
    const verdict = /^(accept|reject)(?:\s+(proposal_\d+))?$/.exec(said)
    if (verdict && !this.state.talk && this.state.modes?.proposals.length) return decide(this.world, verdict[1] === 'accept', verdict[2])
    // EXPLORE <side> (M10.21): into the unknown from the edge of the map, where nobody has told the stranger what lies beyond.
    const explore = /^explore\s+(north|east|south|west)$/.exec(said)
    if (explore && !this.state.talk) {
      const map = regionMap(this.content)
      const hex = playerHex(this.world)
      if (!map || !hex || edgeOf(map, hex) !== explore[1]) return [{ kind: 'error', text: 'You can go into the unknown only from the edge of the map, on that side.' }]
      return wantExpansion(this.world, { wind: explore[1] as ExpansionAsk['wind'], from: map.posOf(hex), region: map.region.id })
    }
    // What lies beyond the sea, asked at a harbour (M10.21): with a model, a skipper may be found who will go further.
    if (/\b(?:beyond|across|over|past|behind)\s+(?:the\s+)?(?:sea|water|waves|horizon|ocean)\b/.test(said) && /\?|\bwhat\b|\bwho\b|\banything\b|\bwhere\b/.test(said) && seaStop(this.content, this.state.player.location)) {
      const partner = this.state.talk?.npc
      const answer: Output = partner
        ? { kind: 'speech', text: `${callName(this.world.npc(partner))}: "Past where the boats go? Nobody from here has been, and nobody who went came back to say."` }
        : { kind: 'narration', text: 'Nobody on the quay can tell you what lies past where the boats go.' }
      if (!this.world.aiLive) return [answer]
      return [answer, ...offer(this.world, 'Will you look for a skipper who will sail further?', [{ label: 'Find a skipper who will sail further out', command: 'explore by sea' }, { label: 'Let it be', command: 'explore none' }])]
    }
    if (said === 'explore none') return [{ kind: 'text', text: 'You let it be. The sea keeps its secrets for now.' }]
    if (said === 'explore by sea' && !this.state.talk) {
      const here = this.state.player.location
      if (!seaStop(this.content, here)) return [{ kind: 'error', text: 'You need a harbour for that, where boats go out.' }]
      const map = regionMap(this.content)
      const at = this.content.locations.get(here)
      const pos = at?.pos ?? this.content.areas.get(at?.area ?? '')?.pos ?? [0, 0]
      // Out to sea towards the nearest edge of the map.
      let wind: ExpansionAsk['wind'] = 'west'
      if (map) {
        const hex = map.hexOf(pos)
        const gaps: [ExpansionAsk['wind'], number][] = [['west', hex.col], ['east', map.cols - 1 - hex.col], ['south', hex.row], ['north', map.rows - 1 - hex.row]]
        wind = gaps.sort((a, b) => a[1] - b[1])[0]![0]
      }
      return wantExpansion(this.world, { wind, from: pos, region: map?.region.id ?? '', by: { from: here } })
    }
    const chart = /^chart\s+([a-z0-9_]+)$/.exec(said)
    if (chart && !this.state.talk && this.state.growth?.expansions?.choice) return chartChoice(this.world, chart[1]!)
    // LAND <id> (M10.23): what "go on" runs after the question of cost; only in that land.
    const written = /^land\s+([a-z0-9_]+)$/.exec(text.trim())
    if (written && !this.state.talk) return this.world.land === written[1] ? wantLand(this.world, written[1]!) : [{ kind: 'error', text: 'There is nothing to write here.' }]
    const peace = /^(?:mediate|make peace)\s+between\s+(.+?)\s+and\s+(.+)$/i.exec(text.trim())
    if (peace && !this.state.talk) return this.makePeace(peace[1]!, peace[2]!)
    const side = /^(?:side|stand)\s+with\s+(.+)$/i.exec(text.trim())
    if (side && !this.state.talk) return this.sideWith(side[1]!)
    // LOADS, HAUL <goods> TO <place>, DELIVER (M9.1): carrying for pay between settlements.
    if (/^(?:loads|ask for (?:a )?loads?|any loads\??)$/i.test(text.trim()) && !this.state.talk) return listLoads(this.world)
    const haul = /^(?:haul|carry|take)\s+(?:a\s+load\s+(?:of\s+)?)?(.*?)\s+to\s+(.+)$/i.exec(text.trim())
    if (haul && !this.state.talk && (/^haul|^carry|load/i.test(text.trim()) || loadsHere(this.world).length)) {
      const taken = takeLoad(this.world, haul[1]!, haul[2]!)
      if (/^haul|^carry|load/i.test(text.trim()) || taken[0]?.kind !== 'error') return taken
    }
    if (/^(?:deliver|unload|hand over)(?:\s+(?:the\s+)?load)?$/i.test(text.trim()) && !this.state.talk) return deliverLoad(this.world)
    // INVEST <amount> [IN <project>] (M8.5): money into what a settlement is building.
    const stake = /^(?:invest|lend)\s+(\d+)(?:\s+(?:in|into|to)\s+(.+))?$/i.exec(text.trim())
    if (stake && !this.state.talk) return this.putIn(Number(stake[1]), stake[2])
    // Passages (M10.12): TAKE THE BARGE [TO X], TRAVEL BY COACH TO X, TRAVEL TO X BY FERRY, WAIT FOR THE COACH.
    const ride = /^(?:take|catch|board)\s+(?:the\s+)?(.+?)(?:\s+to\s+(.+))?$|^travel\s+by\s+(?:the\s+)?(.+?)(?:\s+to\s+(.+))?$|^travel\s+to\s+(.+?)\s+by\s+(?:the\s+)?(.+)$/i.exec(text.trim())
    const rideWord = ride ? (ride[1] ?? ride[3] ?? ride[6]) : undefined
    if (ride && rideWord && !this.state.talk && passagesNamed(this.world, rideWord).length) {
      return takePassage(this.world, { pass: (minutes) => this.pass(minutes) }, rideWord, (ride[2] ?? ride[4] ?? ride[5])?.toLowerCase().replace(/^the\s+/, '').trim())
    }
    // A place to belong (M10.13): RENT THE ROOM FOR A WEEK, PUT <thing> IN THE CHEST, TAKE <thing> FROM THE CHEST.
    if (!this.state.talk && /^(?:rent|take)\s+(?:the\s+|a\s+)?room\s+(?:for|by)\s+(?:a|the)\s+week$|^take\s+lodgings?$|^lodge\s+here$/i.test(text.trim())) return rentLodging(this.world)
    const stow = /^(?:put|store|keep)\s+(?:the\s+|my\s+)?(.+?)\s+in\s+(?:the\s+|my\s+)?chest$/i.exec(text.trim())
    if (stow && !this.state.talk && this.state.player.lodgingId) return putInChest(this.world, stow[1]!.toLowerCase())
    const unstow = /^take\s+(?:the\s+|my\s+)?(.+?)\s+(?:from|out\s+of)\s+(?:the\s+|my\s+)?chest$/i.exec(text.trim())
    const fromChest = unstow && !this.state.talk ? takeFromChest(this.world, unstow[1]!.toLowerCase()) : undefined
    if (fromChest) return fromChest
    // A kind of transport this world has no line of: said so, as the barge always did.
    if (ride && rideWord && !this.state.talk && /^(?:barge|trekschuit|ferry|packet|coach|ship|cart)$/i.test(rideWord)) return [{ kind: 'error', text: `There is no ${rideWord.toLowerCase()} here.` }]
    const waitFor = /^wait\s+for\s+(?:the\s+)?(.+)$/i.exec(text.trim())
    if (waitFor && !this.state.talk && passagesNamed(this.world, waitFor[1]!).length) return waitForPassage(this.world, { pass: (minutes) => this.pass(minutes) }, waitFor[1]!)
    // GIVE YOURSELF UP (M10.20): to the law, where no fine buys the matter off; in a talk with the officer too.
    if (!this.state.combat && /^(?:give (?:yourself|myself) up|turn (?:yourself|myself) in|surrender)[.!]*$/i.test(text.trim())) return this.giveUp()
    const talk = this.state.talk
    const command = parseCommand(text.replace(/^\//, ''))
    const talking = talk && !text.startsWith('/')

    if (talking) {
      if (text.startsWith('"')) return this.inConversation(() => this.dialogue.say(talk.npc, text.replace(/^"|"$/g, '').trim()))
      // What the NPC proposed happens only on the player's yes (M10.3).
      if (talk.proposal && /^(yes|yeah|yep|aye|all right|alright|ok|okay|sure|please|please do|ja|goed|graag)\b[.!]*$/i.test(text.trim())) return this.inConversation(async () => this.dialogue.answer(true))
      if (talk.proposal && /^(no|nope|no thanks|not now|nee|liever niet)\b[.!]*$/i.test(text.trim())) return this.inConversation(async () => this.dialogue.answer(false))
      if (/^[1-8]$/.test(text)) return this.inConversation(() => this.dialogue.quick(Number(text)))
      if (/^(bye|goodbye|farewell|dag|doei|tot ziens)\b/i.test(text)) return this.dialogue.end()
      const direction = parseDirection(command.args[0])
      const isCommand = TALK_COMMANDS.has(command.verb) && !(command.verb === 'go' && !direction) && !soundsLikeSpeech(command.verb, text)
      if (!isCommand) return this.inConversation(() => this.dialogue.say(talk.npc, text))
    }

    // A thing of this place with its own line for the verb (READ SIGN, after the M10 playtest), before what the verb does elsewhere.
    const own = detailVerb(this.world, command)
    if (own) return [{ kind: 'text', text: own }]
    const which = whichOfThem(this.world, command)
    if (which) return which
    // A verb of the rules for characters in a world without them (M10.29 T: HOLD said "This world has no rules for
    // characters"): as any verb the world does not know.
    if (CHARACTER_VERBS.has(command.verb) && !hasCharacters(this.content)) return [{ kind: 'error', text: `You can't "${command.raw}" here. Type HELP for a list of commands.` }]
    switch (command.verb) {
      case 'talk': {
        if (/^(party|group|everyone|all)$/i.test(command.args.join(' '))) return this.dialogue.party('')
        // TALK TO AALTJE ABOUT THE GREY CAT (M10): the name, then what to ask, as with ASK.
        const [who = '', about] = command.args.join(' ').split(/\s+(?:about|over|naar)\s+/i)
        let npc = findNpcHere(this.world, who)
        // One of a nameless group gets a name and a card when spoken to (M9.1).
        const crowd = npc ? undefined : crowdHere(this.world, who)
        if (crowd) npc = nameOne(this.world, crowd)
        if (!npc) {
          // Nobody named, or nobody by that name (after the M10 playtest): one person here is the one; more, a choice.
          const here = this.world.npcsAt(this.state.player.location).filter((id) => this.world.present(id))
          const options = here.map((id) => ({ label: callName(this.world.npc(id)), command: `talk ${callName(this.world.npc(id))}${about?.trim() ? ` about ${about.trim()}` : ''}` }))
          const picked = choose(this.world, who, who ? `There is nobody called "${who}" here. Talk to whom?` : 'Talk to whom?', options, 'There is nobody here but you.')
          return 'run' in picked ? this.route(picked.run) : picked.show
        }
        // Start the conversation first, so the NPC stays put during the minute it takes. A chat they were in breaks off.
        breakOff(this.world, npc)
        engageFarPlace(this.world)
        const opening = this.dialogue.start(npc)
        this.pass(1)
        const out = [...opening, ...this.talkQuests(npc)]
        if (about?.trim()) {
          const partner = npc
          const quest = questAction(this.world, this.questHost, `ask ${callName(this.world.npc(partner)).toLowerCase()} about ${about.trim()}`)
          out.push(...(quest ?? (await this.inConversation(() => this.dialogue.ask(partner, about.trim())))))
        }
        return out
      }
      case 'bye':
        return this.dialogue.end()
      case 'ask':
      case 'tell':
      case 'where': {
        const party = /^(?:party|group|everyone|all)\s+(?:about|over)\s+(.+)$/i.exec(command.args.join(' '))
        if (command.verb === 'ask' && party) return this.dialogue.party(party[1]!)
        // TELL MIRTE THAT THE MILL TURNS AGAIN (M10.3): what follows "that" is a claim.
        const parsed = this.target(command.args, command.verb === 'where' ? /^(?:is|are)\s+/i : command.verb === 'tell' ? /^(?:about|over|naar|that|dat)\s+|\s+(?:about|over|naar|that|dat)\s+/i : /^(?:about|over|naar)\s+|\s+(?:about|over|naar)\s+/i)
        if ('error' in parsed) return [{ kind: 'error', text: parsed.error }]
        engageFarPlace(this.world)
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
        // READ <stone> (M10.5): words on an object here, before reading a person.
        const inscribed = /^read\b/i.test(command.raw) ? inscribedHere(this.world, command.args.join(' ')) : undefined
        if (inscribed) return readInscription(this.host, inscribed)
        // READ <a thing you carry> (M10.29 N): the thing, before reading a person.
        const mine = /^read\b/i.test(command.raw) && command.args.length ? carried(this.world, command.args.join(' ')) : undefined
        if (mine) return [{ kind: 'text', text: doWithCarried(this.world, mine, 'read') }]
        const npc = command.args.length ? findNpcHere(this.world, command.args.join(' ')) : (talk?.npc ?? this.onlyNpcHere())
        // READ <a thing here with nothing written on it> (M10.29 T: "read cab" said "Read whom?").
        const thing = !npc && /^read\b/i.test(command.raw) ? couldInstead(this.world, 'read', command.args.join(' ')) : undefined
        if (thing) return [{ kind: 'text', text: thing }]
        if (!npc) return [{ kind: 'error', text: 'Read whom?' }]
        return this.dialogue.insight(npc)
      }
      case 'journal':
      case 'topics':
        // JOURNAL <name> [HISTORY] (M10.29 R): a page as the terminal reads it; about a person, or every talk with them.
        return command.args.length ? this.journalText(command.args) : [this.dialogue.journal()]
      case 'head': {
        const wind = windOf(command.args.join('-')) ?? windOf(command.args[0])
        if (!wind) return [{ kind: 'error', text: 'Head which way? For example: head south-east.' }]
        return this.walkPlan({ kind: 'head', wind })
      }
      case 'walk': {
        const to = /^(?:to|naar|towards|richting)\s+(.+)$/i.exec(command.args.join(' '))
        if (!to) return runCommand(this.host, { verb: 'go', args: command.args, raw: command.raw })
        // WALK TO a place of this settlement you have seen (M10.29 I: a click on the plan of here), by its exits.
        const within = walkWithin(this.host, to[1]!)
        if (within) return within
        // WALK TO 42,17 (after the M10 playtest): a hex you have seen, as a click on the minimap sends it.
        const spot = /^(\d+)\s*,\s*(\d+)$/.exec(to[1]!.trim())
        if (spot) return this.walkToHex({ col: Number(spot[1]), row: Number(spot[2]) })
        // WALK TO a place beyond the region is on foot (M10.12: TRAVEL TO offers the other ways).
        const topic = this.topics.find(to[1]!.replace(/\s+(?:on\s+foot|te\s+voet)$/i, ''))
        if (topic && this.beyond(topic)) return this.setOffBeyond(topic)
        const place = topic ? knownPlace(this.world, topic) : undefined
        if (topic && !place) return [{ kind: 'error', text: `You don't know where ${this.topics.name(topic)} is. Ask someone, or look for it.` }]
        // A name you don't know (after the M10 playtest): the places you do, that fit the words or are nearest.
        if (!place) return this.walkWhere(to[1]!)
        const target = walkTarget(this.world, place)
        if (!target) return [{ kind: 'error', text: `${place.name} lies beyond ${this.world.words.region}.` }]
        // At the spot the tellers gave: what you can make out from here is all there is to go on.
        const here = playerHex(this.world)
        if (place.status === 'heard' && here && here.col === target.col && here.row === target.row) {
          const map = regionMap(this.content)!
          const real = hexOfTopic(this.world, map, place.topic)
          const mark = landmarkIn(this.world, map, here)
          if (real?.area && mark?.area === real.area) return this.walkPlan({ kind: 'to', target: real.hex, name: place.name })
          return [{ kind: 'error', text: `This is about where they said ${place.name} would be, and you see no sign of it. Look about you and head one way or another, or ask again.` }]
        }
        return this.walkPlan({ kind: 'to', target, name: place.name }, place)
      }
      case 'travel': {
        const to = /^(?:to|naar)\s+(.+)$/i.exec(command.args.join(' '))
        if (!to) return [{ kind: 'error', text: 'Travel where? For example: travel to <a place you know of>.' }]
        if (this.state.player.load) return [{ kind: 'error', text: 'With a load you go on foot, one stretch at a time: GO <direction>.' }]
        // On foot, on purpose (M10.12): TRAVEL TO GRAAFHAVEN ON FOOT.
        const walking = /\s+(?:on\s+foot|te\s+voet)$/i.test(to[1]!)
        const topic = this.topics.find(to[1]!.replace(/\s+(?:on\s+foot|te\s+voet)$/i, ''))
        if (topic && this.beyond(topic)) {
          // More than one way there (M10.12): on foot, or a passage; the stranger chooses.
          const ways = walking ? [] : waysTo(this.world, topic)
          if (ways.length > 1) return offer(this.world, `How do you want to travel to ${this.topics.name(topic)}?`, ways)
          if (ways.length === 1 && ways[0]!.how === 'passage') return this.route(ways[0]!.command)
          return this.setOffBeyond(topic)
        }
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
      case 'offer':
      case 'leave':
        // The price of death, where the rules have one (the last sheaf for the Grey Rider, at a crossroads).
        if (command.args.length) {
          const price = this.world.content.rules?.death?.price
          const item = price && this.world.content.items.get(price.item)
          const said = command.args.join(' ').toLowerCase()
          const paid = item && [item.name, ...(item.aliases ?? [])].some((w) => said.includes(w.toLowerCase())) ? leaveSheaf(this.world) : undefined
          if (paid) return paid
        }
        return [{ kind: 'error', text: command.verb === 'leave' ? 'Leave what? To leave a place, go somewhere.' : 'Offer what, to whom?' }]
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
        return leave(this.world, npc, 'nods, and goes home.', { status: 'cancelled', fault: 'to', told: true, text: `the stranger sent ${callName(this.world.npc(npc))} home` })
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
      case 'promises':
        return [{ kind: 'system', text: promiseLines(this.world).join('\n') }]
      case 'quests':
        return [{ kind: 'system', text: this.questsText() }]
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
        // PAY <person>: for what the stranger took from them (M10.3).
        const whom = findNpcHere(this.world, command.args.join(' ').replace(/^(back\s+)?/i, ''))
        const paid = whom ? payFor(this.world, whom) : undefined
        if (paid) return paid
        return [{ kind: 'error', text: 'Pay what? PAY FINE, PAY <someone> for what you took from them, or give money to someone.' }]
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
        if (way === 'ridge' && (this.state.player.journal ?? {})['the_dry_ridge'] === undefined) return [{ kind: 'error', text: "You don't know of any ridge here." }]
        // A way named exactly, with its wind or the ridge: off you go, by the name it has from here.
        if (way && (wind || way === 'ridge')) {
          const from = playerHex(this.world)
          // The ridge a little way off (after the M10 playtest: it leaves the peat cuttings): walk to it, then follow it.
          const near = way === 'ridge' && from ? knownRidgeNear(this.world, from) : undefined
          if (near) {
            const name = `the ${terrainName(this.world.frame.palette, 'ridge')}`
            const first = this.walkPlan({ kind: 'to', target: near, name })
            const now = playerHex(this.world)
            if (!now || now.col !== near.col || now.row !== near.row) return first
            return [...first, ...this.walkPlan({ kind: 'follow', way })]
          }
          const label = from && wind ? waysFrom(this.world, from).find((o) => o.way === way && o.wind === wind)?.label : undefined
          return this.walkPlan({ kind: 'follow', way, ...(wind ? { wind } : {}), ...(label ? { label } : {}) })
        }
        // Otherwise the ways from here, by where they lead (after the M10 playtest): one that fits is followed, several are a choice.
        const map = regionMap(this.content)
        const hex = map ? playerHex(this.world) : undefined
        // Inside, with no edge to set out from (M10.29 T: FOLLOW at Ridge Shelter offered the paths, then refused them):
        // the exit that leads to each way.
        const here = this.state.player.location
        if (hex && !canSetOut(this.world, here)) {
          const exits = Object.entries(this.world.location(here).exits) as [string, { to: string }][]
          const out = waysFrom(this.world, hex).flatMap((o) => {
            const wind = o.wind?.replace('-', '')
            // Where it leads: by its end, or the place a way "to" names; else by its wind.
            const to = (o.to ?? o.way.replace(/^the (path|road|tow path) to /i, '')).toLowerCase()
            const leads = (e: { to: string }) => [this.world.location(e.to).name, this.content.areas.get(this.world.location(e.to).area)?.name ?? ''].some((n) => n.toLowerCase() === to)
            const exit = exits.find(([, e]) => leads(e)) ?? exits.find(([dir]) => wind && (dir === wind || dir.includes(wind) || wind.includes(dir)))
            return exit ? [{ label: `${o.label}: ${exit[0]} from here`, command: `go ${exit[0]}` }] : []
          })
          const ways = exits.map(([dir]) => dir).join(', ')
          if (!out.length) return [{ kind: 'error', text: `No way to follow starts in here. The ways out: ${ways}.` }]
          return offer(this.world, 'Which way? From in here you go out first:', out)
        }
        const options = hex ? waysFrom(this.world, hex).map((o) => ({ label: o.label, command: `follow ${o.way}${o.wind ? ` ${o.wind}` : ''}` })) : []
        if (way) {
          const along = options.filter((o) => o.command.startsWith(`follow ${way}`))
          if (along.length === 1) return this.route(along[0]!.command)
          if (along.length > 1) return offer(this.world, 'Follow it which way?', along)
        }
        const picked = choose(this.world, words, words ? 'Follow which way?' : 'Follow which way?', options, 'There is no way to follow from here: you can HEAD any way across country.')
        return 'run' in picked ? this.route(picked.run) : picked.show
      }
      default: {
        const outputs = runCommand(this.host, command)
        // An act to improvise (M10.16): through the model, like a talk, within the player's budget.
        const imp = outputs[0]?.improvise
        if (imp) return this.improvise(imp)
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
    const waiting = this.state.talk?.quests ?? []
    const outputs = await turn()
    // A quest that waited in this talk begins now its subject came up (M10.8).
    const touched = new Set(this.dialogue.takeTouched())
    for (const id of waiting) {
      const quest = this.content.quests.get(id)
      if (!quest || questlog(this.world)[id] || ![...this.questSubjects(quest)].some((t) => touched.has(t))) continue
      if (this.state.talk?.quests) this.state.talk.quests = this.state.talk.quests.filter((q) => q !== id)
      outputs.push(...startQuest(this.world, this.questHost, id))
    }
    // The voice heard a quest action in the player's words (M7.2): it happens now.
    const key = this.dialogue.takeChosen()
    if (key) outputs.push(...(runQuestAction(this.world, this.questHost, key) ?? []))
    // What was agreed takes time (M10.5: a lesson): it passes now.
    const spend = this.state.player.spend
    if (spend) {
      this.state.player.spend = undefined
      outputs.push(...this.pass(spend.minutes), { kind: 'system', text: `After ${spend.why}, it is ${this.world.date()}.` })
    }
    return [...outputs, ...seen]
  }

  /**
   * Quests that begin by talking to this person (M10.8): one the giver asks about themselves begins at the greeting,
   * if they think well enough of the stranger and were not just woken; the others wait in the talk until their subject
   * comes up ("What is it? It's the middle of the night." is no time for a quest).
   */
  private talkQuests(npcId: string): Output[] {
    const out: Output[] = []
    const band = attitude(this.world, npcId).band
    const woken = this.world.npcState(npcId).wokenAt
    // A companion brings up their own matter whatever the mood (M7: close enough to ask).
    const willing = (Boolean(companionOf(this.world, npcId)) || !['Wary', 'Unfriendly', 'Hostile'].includes(band)) && !(woken !== undefined && this.world.now - woken < 60)
    for (const quest of talkStarts(this.world, npcId)) {
      if (quest.ask && quest.givers.includes(npcId) && willing) out.push(...startQuest(this.world, this.questHost, quest.id))
      else if (this.state.talk?.npc === npcId) (this.state.talk.quests ??= []).push(quest.id)
    }
    return out
  }

  /** What a quest is about, for starting it in a talk (M10.8): what it teaches, and the people, places and lore it names. */
  private questSubjects(quest: Quest): Set<string> {
    const learnt = (quest.stages ?? []).flatMap((s) => s.on_enter.flatMap((e) => ('learn' in e ? [e.learn] : [])))
    const named = this.topics.recognise([quest.ask ?? '', quest.summary, quest.stages?.[0]?.text ?? ''].join(' '))
    return new Set([...learnt, ...named].filter((t) => !quest.givers.includes(t) && this.topics.kind(t) !== 'area'))
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
      // Someone named who is elsewhere: not the one who happens to be here (found in the M9.4 playtest:
      // "tell sijbrand about the dyke" at the horse mill was said to Teunis).
      const elsewhere = split[0] && split.length > 1 ? findNpcAnywhere(this.world, split[0]) : undefined
      if (elsewhere) return { error: `${callName(this.world.npc(elsewhere))} isn't here.` }
      const only = this.onlyNpcHere()
      if (only) return { npc: only, rest: joined.replace(separator, '').trim() }
      // Nobody here to ask (found in the M9.4 playtest: "where is lubbert" alone on a street said "Who do you mean?").
      if (this.world.npcsAt(this.state.player.location).length === 0) return { error: 'There is nobody here to ask. Find someone and ask them, or look in your JOURNAL for what you know.' }
      return { error: split[0] ? `There is nobody called "${split[0]}" here.` : 'Who do you mean?' }
    }
    return { npc, rest: split.slice(1).join(' ').trim() }
  }

  private onlyNpcHere(): string | undefined {
    const here = this.world.npcsAt(this.state.player.location)
    return here.length === 1 ? here[0] : undefined
  }

  /** How many real seconds the real-time clock waits for a game minute (M10.28: the dial How fast the day goes). */
  secondsPerGameMinute(): number {
    return secondsPerGameMinute(this.world)
  }

  /** Lets game time pass without a command (the real-time clock). Returns what the player sees. */
  tick(minutes = 1): Output[] {
    // The clock stands still while the player chooses in a fight (FO, chapter 12).
    if (minutes <= 0 || this.state.combat) return []
    const last = this.log.at(-1)
    // A tick that a checkpoint has already written down stays as it was (M9.3).
    if (last?.k === 'tick' && this.log.length > (this.base?.at ?? 0)) last.v += minutes
    else this.log.push({ t: this.world.now, k: 'tick', v: minutes })
    for (const listener of this.listeners) listener({ kind: 'replay', t: this.world.now, entry: { t: this.world.now, k: 'tick', v: minutes } })
    const passed = this.pass(minutes)
    noticeCarried(this.world)
    // A talk the stranger never answered (M10.24; found when the pulse sent a visitor to a stranger who did nothing,
    // and the visitor stood there until they starved): after half an hour they go about their business.
    const idle = this.state.talk
    if (idle?.opened && !idle.history.some((h) => h.speaker === 'player') && this.world.now - (idle.began ?? this.world.now) >= 30) {
      passed.push({ kind: 'narration', text: this.world.say('{name} waits a while for an answer, then goes about {their} business.', idle.npc) })
      this.dialogue.end(false)
    }
    // The arrival in a region laid out while the stranger travelled (M10.25), once it is done.
    const outputs = [...arrivedAt(this.world), ...passed, ...this.questsTick(), ...this.confrontations(), ...this.attacks(), ...this.sought(), ...brawlShown(this.world)]
    outputs.push(...this.world.notices.splice(0).map((text) => ({ kind: 'system' as const, text })))
    // A tiding that came while time ran (M10.11): something seen, someone who told it.
    outputs.push(...momentsNow(this.world))
    return this.shown(outputs)
  }

  status(): Status {
    const location = this.world.location(this.state.player.location)
    const talk = this.state.talk
    this.dialogue.syncNews()
    // Lore of this game goes in the journal once the player heard the news it came from.
    const heard = this.state.news?.heard['player'] ?? {}
    for (const lore of this.state.chronicle?.lore ?? []) if (lore.facts.some((f) => heard[f])) this.dialogue.learn(lore.id)
    // On the way to a region still being laid out (M10.25), the stranger is not there yet.
    const underway = this.state.growth?.underway
    const journal = this.journal()
    const plan = planHere(this.world)
    return {
      location: underway?.held ? `On the way to ${underway.name}` : location.name,
      area: this.content.areas.get(location.area)?.name ?? location.area,
      scene: `area_${location.area}`,
      time: this.clock.format(this.world.calendar),
      money: this.world.money(this.state.player.money),
      paused: false,
      ...(this.builder ? { builder: true } : {}),
      talk: talk
        ? { npc: talk.npc, name: knownShort(this.world, talk.npc), call: callName(this.world.npc(talk.npc)), colour: personColour(this.world, talk.npc), attitude: attitude(this.world, talk.npc).band, turnsLeft: talk.turnsLeft, options: QUICK_OPTIONS, ...(talk.proposal ? { proposal: this.dialogue.proposalNow()! } : {}), pronoun: this.world.npc(talk.npc).pronoun, lines: talk.lines ?? [], ...(earlierTalk(this.world, talk.npc, talk.began) ? { earlier: earlierTalk(this.world, talk.npc, talk.began)! } : {}) }
        : undefined,
      ...(!talk && this.lastTalk ? { lastTalk: this.lastTalk } : {}),
      clock: this.clockStatus(),
      ...(soundNow(this.world) ? { sound: soundNow(this.world)! } : {}),
      journal,
      ...(plan ? { plan } : {}),
      completions: completionsHere(this.world, Object.values(journal).flatMap((part) => part.map((e) => e.name))),
      map: this.compactMap(),
      hexMap: hexMapData(this.world, { width: 51, height: 35 }),
      ...(this.state.choice && !this.state.talk ? { choice: { question: this.state.choice.question, options: this.state.choice.options.map((o) => o.label) } } : {}),
      ...(regionMap(this.content) ? {} : { mapless: this.content.world.name }),
      ...(buildingLine(this.world) ? { building: buildingLine(this.world)! } : {}),
      ...this.characterStatus(),
    }
  }

  /**
   * The journal (FO, chapter 2): everything the player learnt, in parts, and
   * within a part under headings, so it reads as an overview: people by the
   * village they live in, places by village and town, then the lands and the
   * factions that know the player.
   */
  private journal(): Status['journal'] {
    const journal: Status['journal'] = { quests: [], people: [], places: [], lands: [], factions: [], events: [], lore: [], things: [] }
    const open: JournalEntry[] = []
    const over: JournalEntry[] = []
    for (const [id, q] of Object.entries(questlog(this.world)).sort((a, b) => a[1].started - b[1].started)) {
      const quest = this.content.quests.get(id)
      if (quest) (q.ended ? over : open).push({ id: `quest_${id}`, name: quest.name })
    }
    for (const request of knownRequests(this.world)) {
      const state = request.status === 'done' ? ' (done)' : request.status === 'failed' ? ' (too late)' : ''
      ;(state ? over : open).push({ id: request.id, name: `${requestName(this.world, request)}${state}` })
    }
    journal.quests.push(...open.map((e) => ({ ...e, group: 'Open' })), ...over.map((e) => ({ ...e, group: 'Over' })))

    const people: (JournalEntry & { order: string })[] = []
    const places: (JournalEntry & { order: string })[] = []
    for (const id of Object.keys(this.state.player.journal ?? {}).sort()) {
      const kind = this.topics.kind(id)
      const km = kmFromPlayer(this.world, id)
      const far = km === undefined ? {} : { km }
      if (id.startsWith('fact_')) {
        journal.events.push({ id, name: this.topics.name(id), ...far })
        continue
      }
      const name = id.startsWith('far_') ? `${this.topics.name(id)} (heard of)` : this.topics.name(id)
      const aliases = (this.topics.entries.get(id)?.aliases ?? []).map((a) => a.toLowerCase()).filter((a) => a !== name.toLowerCase())
      const also = aliases.length ? { aliases } : {}
      if (kind === 'person') {
        const npc = this.content.npcs.get(id)
        // Only who the player met, saw or was told of, by the name they know (M10.8).
        if (npc && !knowsOfPerson(this.world, id)) continue
        // Someone named in a talk (M10.9): right under the one who named them.
        const sketch = id.startsWith('sketch_') ? sketchById(this.world, id) : undefined
        const home = npc ?? (sketch && this.content.npcs.get(sketch.of))
        const area = home ? this.content.areas.get(this.world.location(home.home).area) : undefined
        const g = area ? this.areaGroup(area.id) : { group: 'Further afield', order: '9' }
        const shown = npc ? knownName(this.world, id) : sketch && home ? `${name} (${callName(home)}'s ${sketch.bond})` : name
        const under = sketch && home ? `${knownName(this.world, home.id).toLowerCase()}|${name.toLowerCase()}` : shown.toLowerCase()
        people.push({ id, name: shown, ...far, ...also, group: g.group, order: `${g.order}|${under}` })
      } else if (kind === 'place' || kind === 'area') {
        const entry = this.topics.entries.get(id)
        const areaId = kind === 'area' ? entry?.ref : entry?.ref && this.content.locations.has(entry.ref) ? this.content.locations.get(entry.ref)!.area : [...this.content.areas.values()].find((a) => a.topic === id)?.id
        const g = areaId && this.content.areas.has(areaId) ? this.areaGroup(areaId) : { group: 'Further afield', order: '9' }
        // The village itself first under its own heading, then its places: those the stranger stood in, then those
        // only heard of, marked so (M10.29: a sealed hangar named in a talk looked like a place already visited).
        const first = kind === 'area' || (areaId !== undefined && this.content.areas.get(areaId)?.topic === id)
        const heardOnly = kind === 'place' && entry?.ref !== undefined && this.content.locations.has(entry.ref) && !(this.state.player.seen ?? []).includes(entry.ref)
        const shown = heardOnly ? `${name} (heard of)` : name
        places.push({ id, name: shown, ...far, ...also, group: g.group, order: `${g.order}${first ? '0' : heardOnly ? '2' : '1'}${name.toLowerCase()}` })
      } else if (kind === 'lore' || kind === 'fact') journal.lore.push({ id, name, ...far, ...also, ...(this.content.topics.get(id)?.common || backgroundNow(this.world)?.topics.includes(id) ? { group: 'What you know of the world' } : {}) })
      else if (kind === 'item') journal.things.push({ id, name })
    }
    const strip = ({ id, name, group, km, aliases }: JournalEntry) => ({ id, name, ...(group ? { group } : {}), ...(km === undefined ? {} : { km }), ...(aliases ? { aliases } : {}) })
    journal.people.push(...people.sort((a, b) => a.order.localeCompare(b.order) || a.name.localeCompare(b.name)).map(strip))
    journal.places.push(...places.sort((a, b) => a.order.localeCompare(b.order)).map(strip))
    for (const realm of this.content.realms.values()) journal.lands.push({ id: `realm_${realm.id}`, name: capitalise(realm.name) })
    const rep = this.state.reputation ?? {}
    const members = this.state.memberships ?? []
    for (const f of this.content.factions.values()) {
      if (rep[f.id] === undefined && !members.includes(f.id)) continue
      journal.factions.push({ id: `faction_${f.id}`, name: capitalise(f.name), group: members.includes(f.id) ? 'Yours' : rankOf(rep[f.id] ?? 0) })
    }
    return journal
  }

  /** The clock and the sky (M10.8): for the top right of the window. */
  private clockStatus(): Status['clock'] {
    const p = this.clock.parts
    const calendar = this.world.calendar
    const light = p.dayPart === 'night' ? 'night' : p.dayPart === 'dawn' || p.hour >= 19 ? 'dusk' : 'day'
    const words: Record<WeatherKind, string> = { clear: 'clear', overcast: 'cloudy', rain: 'rain', fog: 'mist', storm: 'storm', frost: 'frost', snow: 'snow' }
    return {
      weekday: weekdayName(this.world.now, calendar),
      date: `${p.day} ${calendar.months[p.month - 1]}`,
      time: `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`,
      light,
      // A world without weather (M10.17) shows none.
      weather: hasWeather(this.world) ? words[weather(this.world)] : '',
      wind: hasWeather(this.world) ? windWords(wind(this.world)) : '',
    }
  }

  /** The heading for an area, and a sort key: towns, then villages and hamlets, inns, roads and the wild country. */
  private areaGroup(areaId: string): { group: string; order: string } {
    const area = this.content.areas.get(areaId)!
    const rank = { city: 0, town: 1, village: 2, hamlet: 3, inn: 4, route: 5, wilderness: 6 }[area.kind]
    return { group: area.name, order: `${rank}${area.name.toLowerCase()}|` }
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
    const wanted = Object.entries(this.state.wanted ?? {}).map(([law, w]) => `${upper((townLaw(this.world, law)?.where ?? lawOf(this.world, law).where).replace(/^(in|on|at) /, ''))}: ${[w.fine > 0 ? this.world.money(w.fine) : '', w.hearing?.length ? 'a hearing' : ''].filter(Boolean).join(' and ')}`)
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

  /** The whole game as it is now, as a copy: for a new character, a legend, live reloading and tests. */
  save(): SaveData {
    return JSON.parse(JSON.stringify({ version: 1, world: this.content.world.id, state: this.state, log: this.log })) as SaveData
  }

  /**
   * A save for the store (M9.3): the last checkpoint and the log since. A new
   * checkpoint is taken, turning the state and the log into text once, when
   * there is none yet, when the log since grew long, or a game day went by.
   */
  saved(): CheckpointedSave {
    const version = contentVersion(this.world.base)
    const base = this.base
    if (!base || base.content !== version || this.log.length - base.at > CHECKPOINT_ENTRIES || this.world.now - base.minutes >= CHECKPOINT_MINUTES) {
      this.base = { world: this.content.world.id, content: version, seed: this.state.seed, minutes: this.world.now, at: this.log.length, state: JSON.stringify(this.state), log: JSON.stringify(this.log) }
    }
    const checkpoint = this.base!
    return { version: 2, world: checkpoint.world, content: version, seed: this.state.seed, minutes: this.world.now, checkpoint, tail: this.log.slice(checkpoint.at), events: this.state.events }
  }

  /** Any save: a whole one at once, one with a tail by playing the tail again on its checkpoint (M9.3). */
  static async restore(content: Content, save: SaveData, llm?: LlmClient): Promise<Engine> {
    return save.tail?.length ? Engine.resume(content, save, [], llm) : Engine.fromSave(content, save, llm)
  }

  static fromSave(content: Content, save: SaveData, llm?: LlmClient): Engine {
    if (save.world !== content.world.id) throw new Error(`This save belongs to world "${save.world}"`)
    // A save with a tail is only whole once the tail is played: Engine.restore does that.
    if (save.tail?.length) throw new Error('This save ends in a log to play again: restore it')
    const copy = JSON.parse(JSON.stringify(save)) as SaveData
    // What went from the world since, the save follows by its tombstones (M9.1).
    copy.state = followTombstones(content, copy.state)
    copy.log = followTombstonesInLog(content, copy.log)
    // The people who came during that game are part of its world (M8.5).
    fitStateToContent(grownContent(content, copy.state), copy.state)
    return new Engine(content, { state: copy.state, log: copy.log, llm })
  }

  /**
   * The same world with a new character (M7.2): the world of a save goes on,
   * the old stranger has left, big events stay and small news is forgotten.
   */
  static carryOn(content: Content, save: SaveData, seed: number, llm?: LlmClient): { engine: Engine; outputs: Output[] } {
    if (save.world !== content.world.id) throw new Error(`This save belongs to world "${save.world}"`)
    const copy = JSON.parse(JSON.stringify(save)) as SaveData
    copy.state = followTombstones(content, copy.state)
    fitStateToContent(grownContent(content, copy.state), copy.state)
    const notes = carryOver(content, copy.state)
    const engine = new Engine(content, { state: copy.state, seed, llm })
    const outputs: Output[] = [
      { kind: 'text', text: `Another stranger arrives in ${content.world.name}. The one who came before has gone, but people here have not forgotten them.` },
      { kind: 'system', text: notes.join(' ') },
      describeRoom(engine.world),
    ]
    return { engine, outputs }
  }

  /**
   * Years later, as legend (M9.1): a new game in the same world that carries
   * the lore of an old one as old stories, without the names of the living.
   * The chronicler retells them when a model is there; the engine checks the
   * names, and the template tells what does not pass.
   */
  static async legend(content: Content, save: SaveData, seed: number, llm?: LlmClient): Promise<{ engine: Engine; outputs: Output[] }> {
    if (save.world !== content.world.id) throw new Error(`This save belongs to world "${save.world}"`)
    const old = followTombstones(content, JSON.parse(JSON.stringify(save.state)) as GameState)
    let legends = legendsOf(content, old)
    let reply: string | null = null
    if (llm && legends.length) {
      try {
        reply = (await llm.complete({ ...legendRequest(content, legends), priority: 'low' })).text
      } catch {
        reply = null
      }
    }
    legends = applyLegendWords(content, legends, reply)
    const engine = new Engine(content, { seed, ...(llm ? { llm } : {}) })
    engine.record({ t: engine.world.now, k: 'legends', v: legends })
    chronicleState(engine.world).lore.push(...legends)
    const outputs: Output[] = [
      { kind: 'text', text: `Years have gone by in ${content.world.name}. People still tell of the stranger who came before, though the stories have grown in the telling.` },
      { kind: 'system', text: legends.length ? `${legends.length} ${legends.length === 1 ? 'story' : 'stories'} of the old days ${legends.length === 1 ? 'is' : 'are'} told here now. Ask about them.` : 'Nothing of the old days is told any more.' },
      describeRoom(engine.world),
    ]
    return { engine, outputs }
  }

  /** The same game on changed content: what the world builder saves is in play at once (FO, chapter 15, "Live herladen"). */
  withContent(content: Content): Engine {
    const next = Engine.fromSave(content, this.save(), this.llm)
    next.builder = this.builder
    return next
  }

  /** Rebuilds a game from its seed and log, feeding recorded model replies back in. */
  static async replay(content: Content, seed: number, log: LogEntry[]): Promise<Engine> {
    // With the names the game began with (M9.1), then on with the names of now.
    const entries = followTombstonesInLog(content, log)
    const book = entries.find((e): e is Extract<LogEntry, { k: 'names' }> => e.k === 'names')?.v
    const engine = new Engine(book ? withNames(content, book) : content, { seed })
    await engine.apply(entries)
    return book ? engine.withContent(content) : engine
  }

  /**
   * Picks up a game exactly where its log ends: the last snapshot plus everything
   * recorded after it, with the recorded model replies. Then hands over to the live model.
   */
  static async resume(content: Content, save: SaveData, tail: LogEntry[], llm?: LlmClient): Promise<Engine> {
    // The tail is played with the names the game began with, as in replay (M9.1).
    const book = save.log.find((e): e is Extract<LogEntry, { k: 'names' }> => e.k === 'names')?.v
    const { tail: since = [], ...checkpoint } = save
    const played = Engine.fromSave(book ? withNames(content, book) : content, checkpoint)
    const last = save.log.findLast((e) => e.k === 'llm')
    // A save's own tail (M9.3) comes first, then what the game log recorded after the save.
    await played.apply(followTombstonesInLog(content, [...since, ...tail]), llm, last?.v === 'on')
    const engine = book ? played.withContent(content) : played
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
    this.replayAsks = entries.filter((e): e is Extract<LogEntry, { k: 'ask' }> => e.k === 'ask')
    this.replaying = true
    try {
      for (const entry of entries) {
        if (entry.k === 'names') continue
        if (entry.k === 'cmd') await this.handle(entry.v)
        else if (entry.k === 'tick') this.tick(entry.v)
        else if (entry.k === 'llm') this.setLlm(entry.v === 'on' ? recorded : undefined)
        else if (entry.k === 'chron') {
          this.log.push(entry)
          const run = this.state.chronicle?.pending.find((r) => r.id === entry.run)
          if (run) this.settleRun(run, entry.v, entry.offered)
          else applyRun(this.world, entry.run, entry.v, undefined, entry.offered)
          this.dialogue.syncNews()
        } else if (entry.k === 'goals') {
          this.log.push(entry)
          applyChoice(this.world, entry.choice, entry.v)
        } else if (entry.k === 'outline') {
          this.log.push(entry)
          applyOutline(this.world, entry.topic, entry.v)
        } else if (entry.k === 'legends') {
          this.log.push(entry)
          const lore = chronicleState(this.world).lore
          for (const l of entry.v) if (!lore.some((x) => x.id === l.id)) lore.push(l)
        } else if (entry.k === 'far') {
          this.log.push(entry)
          applyFarPlace(this.world, entry.topic, entry.v)
        } else if (entry.k === 'district') {
          this.log.push(entry)
          const [topic, id] = entry.key.split(':') as [string, string]
          applyDistrict(this.world, topic, id, entry.v)
        } else if (entry.k === 'weave') {
          this.log.push(entry)
          this.settleWeave(entry.key, entry.v)
        } else if (entry.k === 'story') {
          this.log.push(entry)
          this.settleStory(entry.topic, entry.v)
        } else if (entry.k === 'full') {
          this.log.push(entry)
          applyFull(this.world, entry.topic, entry.round, entry.v, entry.problems)
        } else if (entry.k === 'mode') {
          this.log.push(entry)
          this.state.playMode = entry.v
        } else if (entry.k === 'land') {
          this.log.push(entry)
          applyLand(this.world, entry.id, entry.v)
        } else if (entry.k === 'expansion') {
          this.log.push(entry)
          const ask = this.state.growth?.expansions?.pending.find((p) => p.key === entry.key)
          if (ask) this.settleExpansionRun(ask, entry.v)
        } else if (entry.k === 'due') {
          this.log.push(entry)
          this.dueTides()
        } else if (entry.k === 'tides') {
          this.log.push(entry)
          this.settleTides(entry.v)
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
   * Setting off for a far place (M9.1, M10.21): it is made playable from its
   * templates, which costs nothing; the chronicler works it out to its
   * outline only when the stranger talks to someone there or stays the night.
   */
  private setOffBeyond(topic: string): Output[] {
    const name = this.topics.name(topic)
    wantFarPlace(this.world, topic)
    const far = farPlaceOf(this.world, topic)
    if (far) {
      const edge = this.world.location(far.link.from)
      const days = Math.round(far.link.minutes / (24 * 60))
      // Over the sea (M10.12): no road, only the passage that goes there.
      if (far.link.by) {
        const p = this.content.passages.get(far.link.by)
        return [{ kind: 'text', text: `No road goes to ${name}. ${p ? `${p.name.charAt(0).toUpperCase()}${p.name.slice(1)} goes there from ${edge.name}.` : ''}`.trim() }]
      }
      const gate = String((far.locations[0] as { id: string }).id)
      // From the edge of the map itself (M10.21): on across country, as long as it is from here.
      const map = regionMap(this.content)
      const here = playerHex(this.world)
      const pos = this.content.topics.get(topic)?.pos
      if (map && here && pos && this.state.player.location !== edge.id && edgeOf(map, here)) {
        const edgePos = edge.pos ?? this.content.areas.get(edge.area)?.pos
        const herePos = map.posOf(here)
        const share = edgePos ? Math.hypot(pos[0] - herePos[0], pos[1] - herePos[1]) / Math.max(1, Math.hypot(pos[0] - edgePos[0], pos[1] - edgePos[1])) : 1
        const minutes = Math.max(12 * 60, Math.round((far.link.minutes * share) / 60) * 60)
        const from = hexName(this.world, map, here).replace(/^(On|In) /, '').replace(/^[A-Z]/, (c) => c.toLowerCase())
        return [
          ...journeyOfDays(this.world, { pass: (m) => this.pass(m) }, { fromName: from, to: gate, toName: name, minutes, opening: `You leave ${this.world.words.region} behind and go on across country for ${name}. It takes ${duration(minutes)}.` }),
          describeRoom(this.world),
        ]
      }
      if (this.state.player.location !== edge.id) return [{ kind: 'text', text: `The road to ${name} leaves ${this.world.words.region} at ${edge.name}, in ${this.content.areas.get(edge.area)?.name ?? edge.area}. From there it is ${days === 1 ? 'a day' : `${days} days`} on foot, ${far.link.direction}.` }]
      // A journey of days on foot (M10.12): the world plays on, a day at a time, and the way is told as one paragraph.
      return [
        ...journeyOfDays(this.world, { pass: (minutes) => this.pass(minutes) }, { fromName: edge.name, to: gate, toName: name, minutes: far.link.minutes, opening: `You set out on foot from ${edge.name} for ${name}, ${far.link.direction}. It takes ${duration(far.link.minutes)}.` }),
        describeRoom(this.world),
      ]
    }
    if (this.state.growth?.farPending?.includes(topic)) return [{ kind: 'system', text: `The chronicler is working out the road to ${name}. Try again in a moment.` }]
    return [
      { kind: 'text', text: `${name.charAt(0).toUpperCase()}${name.slice(1)} lies beyond ${this.world.words.region}. ${farWhere(this.world, topic) ?? ''} The roads out of the region stop at its edge for now.` },
      { kind: 'system', text: `What is known of ${name} is in your journal${this.state.outlines?.pending.includes(topic) ? '; the chronicler is working it out' : ''}.` },
    ]
  }

  /** Walks across the region, then shows where the walk ended (FO, chapter 4). */
  /** WALK TO a hex: one you have seen, in the region, and not where you stand. */
  private walkToHex(hex: { col: number; row: number }): Output[] {
    const map = regionMap(this.content)
    const here = playerHex(this.world)
    if (!map || !here) return [{ kind: 'error', text: 'There is no map to walk by here.' }]
    if (!map.cell(hex) || !hasSeen(this.world, map, hex)) return [{ kind: 'error', text: 'You have not seen that land yet. HEAD that way, or walk to a place you know.' }]
    if (hex.col === here.col && hex.row === here.row) return [{ kind: 'error', text: 'You are there already.' }]
    // "On the tow path, near Veenhoek" as a goal: "the tow path, near Veenhoek".
    const name = hexName(this.world, map, hex).replace(/^(On|In) /, '').replace(/^[A-Z]/, (c) => c.toLowerCase())
    return this.walkPlan({ kind: 'to', target: hex, name })
  }

  /** WALK TO a name you don't know: the known places it may mean, nearest first; one that fits is walked to at once. */
  private walkWhere(words: string): Output[] {
    const here = playerHex(this.world)
    const far = (p: KnownPlace) => (here && p.hex ? hexDistance(here, p.hex) : 1e6)
    const places = knownPlaces(this.world)
      .filter((p) => !(here && p.hex && p.hex.col === here.col && p.hex.row === here.row))
      // Nearest first; what you have only heard of comes after.
      .sort((a, b) => far(a) - far(b) || a.name.localeCompare(b.name))
    const missing = `You don't know a place called "${words}".`
    const picked = choose(this.world, words, 'Walk where?', places.map((p) => ({ label: p.name, command: `walk to ${p.name}` })), missing)
    if ('run' in picked) {
      const place = places.find((p) => `walk to ${p.name}` === picked.run)!
      const target = walkTarget(this.world, place)
      return target ? this.walkPlan({ kind: 'to', target, name: place.name }, place) : [{ kind: 'error', text: `${place.name} lies beyond ${this.world.words.region}.` }]
    }
    const narrowed = (this.state.choice?.options.length ?? 0) < Math.min(places.length, MAX_OPTIONS)
    return picked.show[0]?.kind === 'error' || narrowed ? picked.show : [{ kind: 'error', text: missing }, ...picked.show]
  }

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
          // The short name (M10): the first word of the full name was "the" for the Haakman.
          return `${this.world.npc(id).short.padEnd(12)} level ${knowledge.level(id, topic)}${odds ? `  chance ${Math.round(odds.chance * 100)}%` : ''}`
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
        return [{ kind: 'system', text: `[build] ${this.world.npc(npcId).short}: ${tierOf(this.world, npcId)}, at ${this.world.location(npc.location).name}${npc.note ? `, note: ${npc.note.activity} (${npc.note.unrest})` : ''}.` }]
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
      case 'fact': {
        // @fact 4 the long hall of Ynys Wen closed its doors: news of that belang, here and now, for playtests (M10.23).
        const belang = Math.max(0, Math.min(5, Number(rest[0]) || 0))
        const title = rest.slice(1).join(' ').trim()
        if (!title) return [{ kind: 'error', text: '@fact <belang 0-5> <what happened>' }]
        const said = `${title.charAt(0).toUpperCase()}${title.slice(1)}.`
        recordFact(this.world, { kind: 'built', about: [], place: this.state.player.location, belang, title, text: { precise: said, village: said, far: said } })
        return [{ kind: 'system', text: `[build] News of belang ${belang}: ${said}` }]
      }
      case 'learn': {
        // @learn western_isles: the stranger knows that land's tongue (M10.23), as if learnt by talking.
        const land = this.content.lands.get(rest.join('_').toLowerCase())
        if (!land?.language) return [{ kind: 'error', text: `@learn which land's tongue? ${[...this.content.lands.values()].filter((l) => l.language).map((l) => l.id).join(', ') || 'No land here has one.'}` }]
        const known = (this.state.player.languages ??= [])
        if (!known.includes(land.id)) known.push(land.id)
        return [{ kind: 'system', text: `[build] You know ${land.language.name}.` }]
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
        return [{ kind: 'system', text: `[build] The plan ${this.content.plans.get(id)!.name} starts.` }, ...startPlan(this.world, this.questHost, id, 'builder'), ...this.pass(0)]
      }
      case 'tension': {
        // @tension rijkland 30: the tension between this land and a realm goes up (or down), ten at a time.
        const realm = rest[0] ?? ''
        const delta = Number(rest[1])
        const home = this.content.world.id
        if (!this.content.realms.has(realm) || realm === home || !Number.isFinite(delta)) return [{ kind: 'error', text: `@tension <realm> <change>: ${[...this.content.realms.keys()].filter((r) => r !== home).join(', ')}` }]
        for (let left = delta; left !== 0; left -= Math.sign(left) * Math.min(10, Math.abs(left))) shiftTension(this.world, home, realm, Math.sign(left) * Math.min(10, Math.abs(left)), 'the builder')
        return [{ kind: 'system', text: `[build] Tension with ${this.content.realms.get(realm)!.name}: ${tensionOf(this.world, home, realm)}.` }, ...this.pass(0)]
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
        // @money 300: the purse holds this much, in the smallest coin.
        const amount = Number(rest[0])
        if (!Number.isInteger(amount) || amount < 0) return [{ kind: 'error', text: '@money <amount in the smallest coin>' }]
        this.state.player.money = amount
        return [{ kind: 'system', text: `[build] You have ${this.world.money(amount)}.` }]
      }
      case 'time': {
        // @time 23: wait until the next time it is eleven at night.
        const hour = Number(rest[0])
        if (!Number.isInteger(hour) || hour < 0 || hour > 23) return [{ kind: 'error', text: '@time <hour 0-23>' }]
        const minute = this.world.now % (24 * 60)
        const wait = (hour * 60 - minute + 24 * 60) % (24 * 60) || 24 * 60
        return [{ kind: 'system', text: `[build] ${wait} minutes pass.` }, ...this.pass(wait)]
      }
      case 'skip': {
        // @skip 1: whole days pass (M10.1, the dev menu), with everything that happens in them.
        const days = Number(rest[0] ?? 1)
        if (!Number.isFinite(days) || days <= 0 || days > 30) return [{ kind: 'error', text: '@skip <days, 1 to 30>' }]
        const out: Output[] = [{ kind: 'system', text: `[build] ${days === 1 ? 'A day passes' : `${days} days pass`}.` }]
        for (let d = 0; d < days; d++) out.push(...this.pass(24 * 60))
        return out
      }
      case 'market': {
        // @market lamp_oil 0.5: what comes in of a thing, as a share (the effect market of the plans).
        const item = rest[0] ?? ''
        const factor = Number(rest[1])
        if (!this.content.items.has(item) || !Number.isFinite(factor) || factor < 0 || factor > 3) return [{ kind: 'error', text: '@market <item> <share 0 to 3>' }]
        ;(this.state.market ??= {})[item] = factor
        return [{ kind: 'system', text: `[build] ${itemName(this.content, item)}: ${factor} of what comes in.` }, ...this.pass(0)]
      }
      case 'signal': {
        // @signal quarrel npc_gerrit npc_jan_visser: a signal as a watcher would give it, for the aftermath to take up.
        const kind = rest[0] ?? ''
        const who = rest.slice(1).filter((id) => this.content.npcs.has(id))
        const kinds = [...new Set([...this.content.watchers.values()].map((w) => w.signal))].sort()
        if (!kinds.includes(kind)) return [{ kind: 'error', text: `@signal <kind> [people]: ${kinds.join(', ')}` }]
        const place = who[0] ? this.state.npcs[who[0]]!.location : this.state.player.location
        queueSignal(this.world, { kind, who, place, cause: [], belang: 2, watcher: 'builder' })
        return [{ kind: 'system', text: `[build] Signal ${kind}${who.length ? ` for ${who.map((id) => callName(this.world.npc(id))).join(' and ')}` : ''}.` }, ...this.pass(0)]
      }
      case 'budget': {
        // @budget 0.5: the hourly budget for the models; the gateway keeps it, the log notes it.
        const usd = Number(rest[0])
        if (!Number.isFinite(usd) || usd < 0) return [{ kind: 'error', text: '@budget <dollars an hour>' }]
        return [{ kind: 'system', text: `[build] The models may spend ${usd.toFixed(2)} dollars an hour.` }]
      }
      default:
        return [{ kind: 'error', text: 'Build commands: @kill <person> [how], @who-knows <topic>, @send <person> <place> [days], @where <person>, @fight <encounter or creature> [count], @xp <amount>, @like <person> <affinity> [trust], @goto <place>, @bring <person>, @give <item> [count], @flag <name> [value], @quest <id>, @plan <id>, @tension <realm> <change>, @place <place> <state>, @time <hour>, @money <duiten>, @skip <days>, @market <item> <share>, @signal <kind> [people], @budget <dollars>.' }]
    }
  }

  /**
   * HIRE <thing> (M7.2's punt of Wouter; since M10.17 content): whatever a
   * person hires out, from their `hires`, with the owner there. A friend pays
   * nothing. Undefined when nobody in this world hires out such a thing, so
   * RENT A ROOM and the rest go on as before.
   */
  private hire(word: string): Output[] | undefined {
    const w = word.toLowerCase()
    const offers = [...this.world.content.npcs.values()].flatMap((npc) => npc.hires.map((h) => ({ npc, h }))).filter(({ h }) => [h.id, h.name, ...h.aliases].some((n) => n.toLowerCase() === w))
    if (!offers.length) return undefined
    const here = this.state.player.location
    const offer = offers.find(({ npc }) => {
      const s = this.state.npcs[npc.id]
      return s && !s.dead && (s.location === here || companionOf(this.world, npc.id))
    })
    if (!offer) {
      const { npc, h } = offers[0]!
      const a = /^[aeiou]/i.test(h.name) ? 'An' : 'A'
      return [{ kind: 'error', text: `${a} ${h.name} is hired from ${callName(npc)}${h.where ? `, ${h.where}` : ''}.` }]
    }
    const { npc, h } = offer
    const owner = callName(npc)
    const band = attitude(this.world, npc.id).band
    const friend = h.free_for_friends && (Boolean(companionOf(this.world, npc.id)) || band === 'Warm' || band === 'Devoted')
    const price = friend ? 0 : h.price
    if (this.state.player.money < price) return [{ kind: 'error', text: `${owner} wants ${this.world.money(price)} for the ${h.name}, and you haven't got it.` }]
    this.state.player.money -= price
    this.world.npcState(npc.id).money += price
    const until = this.world.now + Math.round(h.hours * 60)
    ;(this.state.player.hired ??= {})[h.id] = { owner: npc.id, until, crosses: h.crosses }
    const paid = price ? `You pay ${owner} ${this.world.money(price)}.` : `${owner} waves your money away.`
    const crossing = h.crosses.includes('water') ? ' You can cross open water and the channels with it now.' : ''
    return [{ kind: 'narration', text: `${paid}${h.line ? ` ${h.line}` : ''} The ${h.name} is yours for ${h.hours >= 24 ? `${Math.round(h.hours / 24)} day${h.hours >= 48 ? 's' : ''}` : `${h.hours} hours`}.${crossing}` }]
  }

  /**
   * MEDIATE BETWEEN <a> AND <b> (M8.2): the player tries to make peace
   * between two with a grudge, with one of them here. Both trusting the
   * player makes it up; only one of them, and the other feels ganged up on.
   */
  private makePeace(first: string, second: string): Output[] {
    const a = findNpcAnywhere(this.world, first)
    const b = findNpcAnywhere(this.world, second)
    if (!a || !b || a === b) return [{ kind: 'error', text: 'Make peace between whom?' }]
    const here = this.world.npcsAt(this.state.player.location)
    if (!here.includes(a) && !here.includes(b)) return [{ kind: 'error', text: `You would have to find ${callName(this.world.npc(a))} or ${callName(this.world.npc(b))} first.` }]
    // The two sides of a great line under a threat (M10.22): the table the content names.
    const tide = tideBetween(this.world, a, b)
    if (tide) return [...mediateTide(this.world, tide, a, b), ...this.pass(60)]
    const outcome = mediateBetween(this.world, a, b, 'player')
    const [na, nb] = [callName(this.world.npc(a)), callName(this.world.npc(b))]
    if (outcome === 'none') {
      // Between a group and the newcomers it is against (M8.3).
      const group = groupBetween(this.world, a, b)
      if (group) return [...mediateGroup(this.world, group, a, b), ...this.pass(30)]
      return [{ kind: 'narration', text: `${na} and ${nb} have nothing between them that needs settling.` }]
    }
    const out = this.pass(30)
    return [
      { kind: 'narration', text: outcome === 'reconciled' ? `You talk it through with ${na} and ${nb}, one and then the other, and then both. In the end they shake on it, grudgingly.` : `You try. But one of them trusts you and the other does not, and by the end it is worse than before.` },
      ...out,
    ]
  }

  /** INVEST <amount> [IN <project>] (M8.5): into a project being built in this settlement; back with a fifth more when it is finished. */
  private putIn(amount: number, name?: string): Output[] {
    const area = this.world.location(this.state.player.location).area
    const running = Object.entries(this.state.growth?.projects ?? {}).filter(([, p]) => p.done === undefined && p.settlement === area)
    const words = name?.toLowerCase().trim()
    const found = running.find(([id]) => !words || this.content.projects.get(id)?.name.toLowerCase().includes(words.replace(/^the\s+/, '')))
    if (!found) return [{ kind: 'error', text: running.length ? 'Put money into what?' : 'Nothing is being built here to put money into.' }]
    const project = this.content.projects.get(found[0])!
    if (!invest(this.world, found[0], amount)) return [{ kind: 'error', text: `You haven't got ${this.world.money(amount)}.` }]
    return [{ kind: 'narration', text: `You put ${this.world.money(amount)} into ${project.name}. When it is finished, you will have it back with a fifth more, they say.` }, ...this.pass(10)]
  }

  /** SIDE WITH <someone> (M8.3): with a group, or with the newcomers it is against. */
  private sideWith(name: string): Output[] {
    const who = findNpcAnywhere(this.world, name)
    if (!who) return [{ kind: 'error', text: `Side with whom?` }]
    return sideWith(this.world, who)
  }

  /** Mired: no walking until you work free. Catform: no hands and no words. */
  private heldBack(text: string): Output[] | undefined {
    const conditions = this.state.player.character?.conditions ?? {}
    const verb = parseCommand(text.replace(/^\//, '')).verb
    if (/^(struggle|get free|pull free|work free)\b/i.test(text)) return struggle(this.world, (m) => this.pass(m))
    if (conditions['mired'] && (['go', 'head', 'walk', 'follow', 'travel', 'enter'].includes(verb) || parseDirection(text.trim()) || /barge/i.test(text))) {
      return [{ kind: 'error', text: 'You are stuck fast in the fen. STRUGGLE to work free first.' }]
    }
    if (conditions['catform'] && ['talk', 'say', 'ask', 'tell', 'buy', 'sell', 'give', 'use', 'eat', 'wield', 'attack', 'list', 'rent', 'borrow', 'repay', 'steal', 'flirt', 'recruit', 'order', 'persuade', 'deceive', 'intimidate', 'bribe', 'marry'].includes(verb)) {
      return [{ kind: 'error', text: 'You are a cat. You have paws, not hands, and nobody understands a word you say.' }]
    }
    return undefined
  }

  /** A location by id, or by name or alias. */
  private findLocation(words: string): string | undefined {
    const w = words.trim().toLowerCase()
    if (!w) return undefined
    if (this.content.locations.has(w)) return w
    // A hex of the region map (M10.21: to test the edge of the map), as hex:col,row.
    if (isHexId(w) && hexLocation(this.world, w)) return w
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
      now: this.world.now,
      bonds: Object.fromEntries(companions(this.world).map((m) => [m.npc, m.bond])),
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
    if (this.state.combat || this.state.talk || !hasCharacters(this.content)) return []
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
      // A load draws those who rob travellers (M9.1).
      const chance = this.state.player.load && e.load ? Math.max(e.chance, e.load.chance) : e.chance
      if (this.world.rng.next('encounters') >= chance) continue
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
        far: `A stranger has been starting fights in ${this.world.words.region}.`,
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

  /**
   * Attacks in the register that can come to it now (M10.2): whoever means to
   * go for the stranger and is here, awake and not already fighting. One path
   * for every attack, from a grievance, a conversation or a plan: the fight.
   */
  private attacks(): Output[] {
    if (this.state.combat) return []
    const here = this.state.player.location
    const intent = openAgreements(this.world, 'player').find((a) => a.kind === 'attack' && a.terms.fought === undefined && this.world.npcsAt(here).includes(a.by) && this.world.npcState(a.by).activity !== 'asleep' && !companionOf(this.world, a.by))
    if (!intent) return []
    intent.terms.fought = this.world.now
    return this.startNpcFight(intent.by, 'npc')
  }

  /**
   * The stranger's move with a fight between two others in front of them
   * (M10.3, left over): persuading or threatening them apart is the whole
   * move (done); attacking one of them ends their fight before the
   * stranger's own starts; anything else lets theirs run its course first.
   */
  private brawlMove(spoken: string): { out: Output[]; done: boolean } | undefined {
    if (!this.state.brawl?.shown) return undefined
    const command = parseCommand(spoken)
    const words = command.args.join(' ').replace(/^(the|them|both)\s*/i, '')
    const target = words ? findNpcHere(this.world, words) : undefined
    const out = brawlAnswer(this.world, command.verb, target, (a, status, text) => settle(this.world, a, status, text, { quiet: true }))
    if (!out) return undefined
    return { out, done: command.verb === 'persuade' || command.verb === 'intimidate' }
  }

  /**
   * Someone who went looking for the stranger finds them (M10.3, seek_player):
   * they come up and open a talk with their line, and ask what they need.
   */
  private sought(): Output[] {
    if (this.state.combat || this.state.talk) return []
    const id = seekers(this.world)[0]
    if (!id) return []
    const line = foundStranger(this.world, id)
    const name = callName(this.world.npc(id))
    return [{ kind: 'narration', text: `${name} comes up to you.` }, { kind: 'speech', text: `${name}: "${line}"` }, ...this.dialogue.start(id, false, true)]
  }

  /** Someone with a grievance finds the player: words, or blows if the gate allows it. */
  private confrontations(): Output[] {
    if (this.state.combat) return []
    const out: Output[] = []
    for (const id of confronting(this.world)) {
      const g = this.world.npcState(id).grievance!
      const law = g.reason === 'the law'
      const name = callName(this.world.npc(id))
      if (law && !this.state.wanted?.[landLawHere(this.world)]) {
        settleGrievance(this.world, id)
        continue
      }
      out.push({ kind: 'speech', text: `${name}: ${g.line}` })
      if (mayAttackFirst(this.world, id, { provoked: true, factionOrder: law })) {
        settleGrievance(this.world, id)
        // An intention with a target (M10.2); the combat system decides reach, reaction, hits and what follows.
        agree(this.world, { kind: 'attack', by: id, to: 'player', source: 'rules', what: `go for the stranger over ${g.reason}`, terms: { target: 'player', reason: g.reason } })
        out.push(...this.attacks())
        if (this.state.combat) return out
      }
      if (law) {
        // The schout waits for the fine; he will ask again another day, not at every word.
        g.t = this.world.now
        g.quiet = this.world.now + 6 * 60
        this.world.npcState(id).goals = this.world.npcState(id).goals.filter((goal) => goal.id !== `confront_${id}`)
        // No fine buys a hearing off (M10.20): then the stranger is to give themselves up.
        out.push({ kind: 'system', text: this.state.wanted?.[landLawHere(this.world)]?.hearing?.length ? 'GIVE YOURSELF UP, or face the consequences.' : 'PAY FINE, or face the consequences.' })
      } else settleGrievance(this.world, id)
      if (!this.state.talk) this.dialogue.start(id, true)
    }
    return out
  }

  /** Held and heard (M10.20): into the cell, the hours the world gives pass, then the hearing settles the matter. */
  private giveUp(): Output[] {
    const plan = surrenderTo(this.world)
    if ('error' in plan) return [{ kind: 'error', text: plan.error }]
    this.state.talk = undefined
    const out: Output[] = [{ kind: 'narration', text: plan.held }]
    if (plan.cell) this.state.player.location = plan.cell
    out.push(...this.pass(plan.hours * 60))
    out.push(...hearing(this.world, plan.law))
    return out
  }

  /** BORROW <amount> FROM <person>: Warm and trust 30 or more (FO, chapter 8); the debt is due in a week. */
  private borrow(words: string): Output[] {
    const m = /^(.+?)\s+from\s+(.+)$/i.exec(words)
    const amount = m ? this.world.parseMoney(m[1]!) : undefined
    const npc = m ? findNpcHere(this.world, m[2]!) : undefined
    if (!m || !amount || !npc) return [{ kind: 'error', text: `BORROW <amount> FROM <person>, for example: borrow 5 ${this.world.coins[1]?.plural ?? `${(this.world.coins[1] ?? this.world.coins[0]!).name}s`} from ${this.world.content.npcs.has('npc_mirte') ? 'mirte' : 'a friend'}.` }]
    const name = callName(this.world.npc(npc))
    if (!mayLend(this.world, npc)) return [{ kind: 'speech', text: `${name} shakes ${this.world.npc(npc).pronoun === 'she' ? 'her' : this.world.npc(npc).pronoun === 'he' ? 'his' : 'their'} head. "I don't lend money. Not to you, not yet."` }]
    const state = this.world.npcState(npc)
    if (state.money < amount) return [{ kind: 'speech', text: `${name}: "I haven't got that much to spare."` }]
    state.money -= amount
    this.state.player.money += amount
    const debt = { id: `debt_${(this.state.ledger?.length ?? 0) + 1}`, from: 'player', to: npc, amount, kind: 'money' as const, t: this.world.now, due: this.world.now + 7 * 24 * 60 }
    ;(this.state.ledger ??= []).push(debt)
    // The player's word, in the register (M10.2): paid back within the week.
    agree(this.world, { kind: 'give', by: 'player', to: npc, source: 'player', what: `pay ${name} back ${this.world.money(amount)}`, due: debt.due, terms: { amount, debt: debt.id } })
    return [{ kind: 'text', text: `${name} counts out ${this.world.money(amount)}. "A week. I'll hold you to it."` }]
  }

  /** REPAY <person> [amount]: a debt paid on time is a promise kept. */
  private repay(words: string): Output[] {
    const [who = '', ...rest] = words.split(/\s+/)
    const npc = findNpcHere(this.world, who)
    const debt = npc ? (this.state.ledger ?? []).find((d) => d.from === 'player' && d.to === npc) : undefined
    if (!npc || !debt) return [{ kind: 'error', text: 'You owe nobody here anything.' }]
    const amount = Math.min(debt.amount, this.world.parseMoney(rest.join(' ')) ?? debt.amount)
    if (this.state.player.money < amount) return [{ kind: 'error', text: `You only have ${this.world.money(this.state.player.money)}.` }]
    this.state.player.money -= amount
    this.world.npcState(npc).money += amount
    debt.amount -= amount
    const name = callName(this.world.npc(npc))
    if (debt.amount <= 0) {
      this.state.ledger = (this.state.ledger ?? []).filter((d) => d !== debt)
      const word = openAgreements(this.world, 'player').find((a) => a.kind === 'give' && a.to === npc && a.terms.debt === debt.id)
      if (word) settle(this.world, word, 'kept', `the stranger paid ${name} back`, { quiet: true, late: debt.due !== undefined && this.world.now > debt.due })
      else if (debt.due === undefined || this.world.now <= debt.due) deed(this.world, npc, 'promise_kept')
      return [{ kind: 'text', text: `You pay ${name} back, all of it. ${name} nods. "Good as your word."` }]
    }
    return [{ kind: 'text', text: `You pay ${name} ${this.world.money(amount)}. ${this.world.money(debt.amount)} still to go.` }]
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
    // What the fight made of an attack someone meant (M10.2): carried out, whatever came of it.
    const fighters = new Set(combat.fighters.flatMap((f) => (f.npc ? [f.npc] : [])))
    for (const a of openAgreements(this.world, 'player').filter((x) => x.kind === 'attack' && x.terms.fought !== undefined && fighters.has(x.by))) {
      const name = callName(this.world.npc(a.by))
      const how = { won: `${name} went for the stranger and was beaten`, lost: `${name} went for the stranger and beat them`, surrendered: `${name} went for the stranger, who gave up`, fled: `${name} went for the stranger, who ran`, paid: `${name} went for the stranger, who paid`, talked: `${name} went for the stranger and was talked down` }[combat.over!]
      settle(this.world, a, 'kept', how, { quiet: true })
    }
    switch (combat.over) {
      case 'won': {
        if (encounter?.win_flag) (this.state.flags ??= {})[encounter.win_flag] = true
        // Overcoming a challenge is experience; beating up a villager you went for is not.
        const xp = combat.started_by === 'player' ? 0 : foes.reduce((sum, f) => sum + foeXp(f.level, c.level), 0)
        if (xp) gainXp(this.world, xp, `you overcame ${who}`)
        favour(this.world, 'fight_won')
        approve(this.world, 'courage')
        // Their faction thinks less of you, and whoever the content says is glad (M10.17: the Goat-Riders and Veenhoek).
        this.foeRepute(foes, 'won', -5, 'you beat their men')
        fact = { title: `the stranger and ${who}`, precise: `The stranger fought ${who} at ${where} and won.`, village: `The stranger saw off ${who} at ${where}, they say.`, far: `Someone beat ${who} in ${this.world.words.region}.`, belang }
        const prisoners = foes.filter((f) => (f.state === 'surrendered' || f.state === 'unconscious') && (f.kind === 'human' || f.kind === 'npc') && !people)
        if (prisoners.length) {
          combat.prisoners = prisoners.map((f) => f.id)
          const list = prisoners.map((f) => f.name).join(' and ')
          out.push({ kind: 'system', text: `${list.charAt(0).toUpperCase()}${list.slice(1)} ${prisoners.length > 1 ? 'are' : 'is'} at your mercy. LET GO, BIND (for the ${this.world.words.law.officer}) or KILL.` })
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
        this.foeRepute(foes, 'paid', 2, 'you paid their toll')
        const amount = Math.min(this.state.player.money, (encounter?.demand?.amount ?? 0) * (combat.round > 0 ? 2 : 1))
        this.state.player.money -= amount
        out.push({ kind: 'system', text: `You pay ${this.world.money(amount)}.` })
        fact = { title: `the stranger paid ${who}`, precise: `The stranger paid ${who} ${this.world.money(amount)} to pass at ${where}.`, village: `${who.charAt(0).toUpperCase() + who.slice(1)} took toll from the stranger at ${where}.`, far: `${who.charAt(0).toUpperCase() + who.slice(1)} are taking toll again.`, belang: Math.max(1, belang - 1) }
        break
      }
      case 'fled': {
        favour(this.world, 'fled')
        approve(this.world, 'back_down')
        out.push(...fleeWith(this.world, where))
        if (combat.from && this.content.locations.has(combat.from)) this.state.player.location = combat.from
        fact = { title: `the stranger ran from ${who}`, precise: `The stranger ran from ${who} at ${where}.`, village: `The stranger ran from ${who} at ${where}, they say.`, far: `${who.charAt(0).toUpperCase() + who.slice(1)} were seen in ${this.world.words.region}.`, belang: Math.max(1, belang - 1) }
        break
      }
      case 'surrendered':
      case 'lost': {
        const take = encounter?.surrender.take ?? (foes.some((f) => f.kind === 'human') ? 'half_money' : 'nothing')
        const amount = take === 'all_money' ? this.state.player.money : take === 'half_money' ? Math.floor(this.state.player.money / 2) : 0
        if (amount) {
          this.state.player.money -= amount
          out.push({ kind: 'system', text: `They take ${this.world.money(amount)}.` })
        }
        if (combat.over === 'surrendered' && encounter) out.push({ kind: 'narration', text: encounter.surrender.text })
        // And of a load, their share (M9.1).
        out.push(...robLoad(this.world, encounter?.load?.take ?? (foes.some((f) => f.kind === 'human') ? 0.5 : 0)))
        fact = { title: `${who} and the stranger`, precise: `${who.charAt(0).toUpperCase() + who.slice(1)} beat the stranger at ${where}${amount ? ` and took ${this.world.money(amount)}` : ''}.`, village: `${who.charAt(0).toUpperCase() + who.slice(1)} robbed the stranger at ${where}.`, far: `${who.charAt(0).toUpperCase() + who.slice(1)} are robbing travellers in ${this.world.words.region}.`, belang }
        break
      }
    }
    if (withPlayer(this.world).length && (combat.over === 'won' || combat.over === 'fled' || combat.over === 'talked')) sharedFight(this.world)
    if (fact && !people) {
      recordFact(this.world, {
        kind: 'fight',
        about: [...this.foeFactions(foes), areaTopicId(this.content, place.area)].filter((t) => this.content.topics.has(t)),
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
          const death = die(this.world, npcId, { cause: 'fell fighting beside the stranger', place: here })
          leave(this.world, npcId, 'is dead.', { status: 'impossible', fault: 'world', told: true, ...(death ? { fact: death.id } : {}), text: `${name} fell fighting beside the stranger` })
          out.push({ kind: 'narration', text: `${name} is dead. There is nothing more you can do.` })
        }
        if (f.state !== 'dead') out.push(...mend(this.world, npcId))
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
              far: `A stranger has killed someone in ${this.world.words.region}.`,
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

  /** The factions the foes belong to, by their creatures in the bestiary (M10.17). */
  private foeFactions(foes: { creature?: string }[]): string[] {
    return [...new Set(foes.flatMap((f) => (f.creature ? this.content.creatures.get(f.creature)?.faction : undefined) ?? []))]
  }

  /**
   * What an outcome of a fight does to reputation (M10.17; before, the Goat-Riders by name): their own faction by the
   * standard amount, and what the bestiary adds for that outcome, once each however many of them there were.
   */
  private foeRepute(foes: { creature?: string }[], outcome: 'won' | 'paid' | 'bound' | 'freed' | 'killed', delta: number, why: string): void {
    if (delta) for (const faction of this.foeFactions(foes)) repute(this.world, faction, delta, why)
    const extra = new Map<string, { faction: string; by: number; why: string }>()
    for (const f of foes) for (const r of (f.creature ? this.content.creatures.get(f.creature)?.reputation[outcome] : undefined) ?? []) extra.set(`${r.faction}|${r.why}`, r)
    for (const r of extra.values()) repute(this.world, r.faction, r.by, r.why)
  }

  /** The player's word on those who gave up (FO, chapter 12, "Moreel en overgave"). */
  private async prisoners(words: string): Promise<Output[]> {
    const combat = this.state.combat!
    const ids = combat.prisoners ?? []
    const names = ids.map((id) => combat.fighters.find((f) => f.id === id)!.name)
    const them = names.length > 1 ? 'them' : names[0]!
    const place = this.world.location(combat.place)
    const held = combat.fighters.filter((f) => ids.includes(f.id))
    const about = [...this.foeFactions(held), areaTopicId(this.content, place.area)].filter((t) => this.content.topics.has(t))
    const officer = this.world.words.law.officer
    // The faction that keeps the land's law (M10.17: the Count's men in the Nethermarch), and what the prisoners are called.
    const law = [...this.content.factions.values()].find((f) => f.law === landLawHere(this.world))?.id
    const kind = held.map((f) => (f.creature ? this.content.creatures.get(f.creature)?.name : undefined)).find(Boolean) ?? 'robber'
    const a = /^[aeiou]/i.test(kind) ? 'an' : 'a'
    this.state.combat = undefined
    const fact = (title: string, precise: string, village: string, belang: number) =>
      recordFact(this.world, { kind: 'prisoners', about, place: combat.place, belang, juice: 0.8, title, text: { precise, village, far: village } })
    if (/^(kill|finish|slay|dood)/.test(words)) {
      favour(this.world, 'killed_surrendered')
      approve(this.world, 'kill_prisoner')
      if (law) repute(this.world, law, -5, 'you killed a prisoner')
      this.foeRepute(held, 'killed', 0, '')
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
      if (law) repute(this.world, law, 10, `you brought a robber to the ${officer}`)
      this.foeRepute(held, 'bound', -10, `you brought one of theirs to the ${officer}`)
      fact(`the stranger brought in ${a} ${kind}`, `The stranger bound ${them} at ${place.name} and sent word to the ${officer}, whose men came for ${names.length > 1 ? 'them' : 'him'}.`, `The stranger caught a robber at ${place.name} and handed him to the ${officer}.`, 3)
      return [{ kind: 'narration', text: `You bind ${them} with your rope and send a boy running for the ${officer}'s men. They come within the hour and take ${names.length > 1 ? 'them' : 'him'} away.` }]
    }
    favour(this.world, 'spared')
    approve(this.world, 'mercy')
    approve(this.world, 'spare_prisoner')
    this.foeRepute(held, 'freed', 3, 'you let one of theirs go')
    fact(`the stranger let ${a} ${kind} go`, `The stranger let ${them} go at ${place.name}.`, `The stranger let one of the robbers go, they say.`, 1)
    const released = /^(let|release|spare|free|go)/.test(words)
    const out: Output[] = [{ kind: 'narration', text: released ? `You let ${them} go. ${names.length > 1 ? 'They go' : 'He goes'} without looking back.` : `While you turn away, ${names.join(' and ')} slip${names.length > 1 ? '' : 's'} away.` }]
    return released ? out : [...out, ...(await this.route(words))]
  }

  private clockLines(): string[] {
    return Object.values(this.state.clocks ?? {}).map((c) => clockLine(c as Clock))
  }

  /** What the creation screen needs: the rules and the gear's names (FO, chapter 11, "Personage maken"). */
  creationData(): CreationData | undefined {
    const rules = this.content.rules
    if (!rules || !hasCharacters(this.content)) return undefined
    const gear = new Set(rules.classes.flatMap((k) => Object.keys(k.gear)))
    return { rules, items: Object.fromEntries([...gear].map((id) => [id, this.content.items.get(id)!])), ...(this.content.world.knobs ? { knobs: this.content.world.knobs } : {}) }
  }

  /** Runs the world for some minutes and returns the events the player could see. */
  private pass(minutes: number, stop?: () => string | undefined): Output[] {
    // A long wait is lived hour by hour: the opponents, big events and quests keep pace with the people.
    // A wait that may stop early looks every five minutes; the quests still keep pace by the hour.
    const between: Output[] = []
    let sinceQuests = 0
    for (let left = minutes; left > 0; ) {
      const step = Math.min(stop ? 5 : 60, left)
      advance(this.world, step)
      rest(this.world, step)
      left -= step
      sinceQuests += step
      if (left > 0 && sinceQuests >= 60) {
        between.push(...this.questsTick())
        sinceQuests = 0
      }
      const reason = stop?.()
      if (reason) {
        between.push({ kind: 'system', text: reason })
        break
      }
    }
    const here = this.state.player.location
    const seen = this.state.events.filter((e) => e.seq > this.state.seenSeq && e.location === here)
    this.state.seenSeq = this.state.eventSeq
    return [...between, ...seen.map((e) => ({ kind: 'narration' as const, text: e.text }))]
  }
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
