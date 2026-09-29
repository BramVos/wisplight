import type { AppKnobView, CreationData, DiffLine, DraftChange, Edit, EditorView, EntityKind, JournalPage, MapPalette, Output, PaletteView, PlayMode, Raw, SaveAbout, SaveData, SimReport, Status, WorldInfo } from '../../engine'
import { designUpdate, type DesignChange, type DesignLog } from '../../engine/designlog'
import type { DevSection, DevView } from '../../engine/dev'
import type { Advice, TrialResult, TrialVerdict } from '../../node/ai/advisor'
import type { AiLogEntry } from '../../node/ai/log'
import type { ModelInfo, ProviderId } from '../../node/ai/providers'
import type { BuildView } from '../../node/ai/builds'
import type { AiOverview } from '../../node/ai/service'
import type { ChosenRole } from '../../node/ai/settings'

export type { DevSection, DevView }
export type { Advice, AiLogEntry, AiOverview, ChosenRole, CreationData, DiffLine, DraftChange, Edit, EditorView, EntityKind, JournalPage, ModelInfo, ProviderId, Raw, SimReport, TrialResult, TrialVerdict, WorldInfo }

/** A world to play in (M8), and whether it is the one played last. */
export type WorldChoice = WorldInfo & { current: boolean }

/** What the status bar shows about the AI: cost so far and whether calls go through. */
export interface AiStatus {
  connected: boolean
  sessionUsd: number
  hourPercent: number
  monthLeftPercent?: number
  busy: boolean
  coolingDown: boolean
  budgetSpent: boolean
  /** A light per role (M10.4): busy now, and the last call. */
  roles?: RoleLight[]
}

export interface RoleLight {
  role: 'voice' | 'brain' | 'chronicler' | 'illustrator' | 'builder'
  busy: boolean
  last?: { at: number; costUsd?: number; ms: number; ok: boolean }
}

export interface Reply {
  outputs: Output[]
  status: Status & { ai?: AiStatus }
}

/** Settings > AI. Keys go in and never come back out. */
/** The transcript's settings in the desktop app (M10.4). */
export interface TranscriptBridge {
  get(): Promise<{ enabled: boolean; folder: string }>
  set(enabled: boolean, folder: string): Promise<{ enabled: boolean; folder: string }>
  choose(): Promise<string | undefined>
}

export interface AiBridge {
  /** The lights, as they change (M10.4). */
  onActivity?(listener: (roles: RoleLight[]) => void): () => void
  overview(): Promise<AiOverview>
  connect(provider: ProviderId, key: string): Promise<{ models: number }>
  disconnect(provider: ProviderId): Promise<void>
  models(provider: ProviderId): Promise<ModelInfo[]>
  /** Asks the providers for their models again; returns the roles whose model is gone. */
  refresh(): Promise<ChosenRole[]>
  advise(provider: ProviderId): Promise<Advice>
  trial(provider: ProviderId, model: string, role: ChosenRole): Promise<TrialResult>
  /** Tries the advised models for a role and chooses on the trial (M9.3). */
  compare(role: ChosenRole, choices: { provider: ProviderId; model: string }[]): Promise<{ results: TrialResult[]; verdicts: TrialVerdict[]; choice?: { provider: ProviderId; model: string } }>
  choose(role: ChosenRole, provider: ProviderId, model: string): Promise<string>
  /** The hourly budget as kept (M10.20): the player's value, unless it had to be changed, and then adjusted says so. */
  setBudget(usd: number): Promise<{ usd: number; adjusted: boolean }>
  /** From what cost of one call the game asks first (M10.21); null: never ask. */
  setAskAbove(usd: number | null): Promise<{ usd: number | null; adjusted: boolean }>
  /** How the world goes on (M10.24): continue, think or direct. */
  setPlayMode(mode: PlayMode): Promise<PlayMode>
  /** How long a spoken reply may take, in seconds (M10.8). */
  setReplyWithin(seconds: number): Promise<{ seconds: number; adjusted: boolean }>
  setMonthBudget(usd: number | null): Promise<void>
  setCredit(provider: ProviderId, usd: number | null): Promise<void>
  csv(): Promise<string>
  log(): Promise<AiLogEntry[]>
  billing(provider: ProviderId): Promise<void>
  /** Pictures (after the M7 playtest): the image models of a key, the choice, and a trial picture as a data URL. */
  imageModels(provider: ProviderId): Promise<ModelInfo[]>
  setPictures(provider: ProviderId | null, model?: string, quality?: 'low' | 'medium'): Promise<void>
  /** Whether the game makes pictures of new places and people, what grows in play included (M10.26). */
  setPicturesNew(on: boolean): Promise<void>
  tryPicture(provider: ProviderId, model: string): Promise<string>
}

/** The game hears when the content changed under it: the editor saved, or a file changed on disk. */
export interface ContentEvents {
  onReload(listener: (change: { file?: string }) => void): () => void
  onProblem(listener: (text: string) => void): () => void
}

/** A change as the editor shows it: the file, and the lines that differ. */
export interface ShownChange {
  path: string
  fresh: boolean
  lines: DiffLine[]
}

export interface EditorSave {
  ok: boolean
  problems: string[]
  warnings: string[]
  changes: ShownChange[]
}

export interface EditorDraft {
  say: string
  questions: string[]
  changes: DraftChange[]
  /** Keys of world.yaml to set, as YAML, and whole files (M10.17). */
  world?: string
  /** Keys of the rules to set, as YAML (M10.20: rules.death). */
  rules?: string
  files?: { path: string; text: string }[]
  /** The land whose build it is (M10.23); none for the world's own. */
  land?: string
  problems: string[]
  diffs: ShownChange[]
  /** How the proposal's places read against the place rules, before it is accepted (M10.20). */
  descriptions?: { summary: string; places: string[] }
  /** The map step's table as the model answered it (M10.26), for a second try that says what stood wrong. */
  table?: string
}

/** The editor (M8): the desktop app writes the files; the browser preview keeps them in memory. */
/** The knobs of the app (M10.20): the list with the player's values, and one set or back to its default (null). */
export interface AppKnobsBridge {
  list(): Promise<AppKnobView[]>
  set(id: string, value: number | null): Promise<{ value: number; adjusted?: string }>
}

/** A save as the world picker and the load screen show it (M10.20). */
export interface SaveEntry {
  id: number
  slot: string
  createdAt: string
  gameMinutes: number
  world: string
  name?: string
  about?: SaveAbout
}

/** The saves (M10.20): continue a world, load one, name one, and one as a file to keep or bring back. */
export interface SavesBridge {
  list(): Promise<SaveEntry[]>
  /** The last save of a world (its folder), exactly where the game stopped. */
  continueGame(world?: string): Promise<Reply>
  load(id: number): Promise<Reply>
  name(id: number, name?: string): Promise<void>
  /** One save as a file; without an id, the game in play, saved first. Where it went, or nothing. */
  exportSave(id?: number): Promise<string | undefined>
  /** A save file read, checked and put in the list; or why not; nothing when the player cancelled. */
  importSave(): Promise<{ id?: number; problem?: string } | undefined>
}

/** A world's pictures in the editor (M10.26). */
export interface PicturesView {
  /** The world's own choice, pictures.wanted in world.yaml. */
  wanted: boolean
  /** The image model chosen under Settings > AI, and what one picture costs with it; none without. */
  model?: string
  priceUsd?: number
  /** Areas and named people without a picture; a generic figure costs nothing and never counts. */
  missing: { name: string; kind: 'person' | 'place' }[]
  kept: number
}

export interface PicturesMade {
  made: number
  kept: number
  failed: number
  costUsd: number
  stopped?: string
}

export interface EditorBridge {
  open?(): Promise<void>
  worlds(): Promise<WorldInfo[]>
  view(world: string): Promise<EditorView>
  entity(world: string, kind: EntityKind, id: string): Promise<{ raw: Raw; yaml: string; file: string } | undefined>
  /** Checks the edits and, unless write is false, saves them. */
  save(world: string, edits: Edit[], write?: boolean): Promise<EditorSave>
  newWorld(folder: string, name: string): Promise<{ ok: boolean; problems: string[] }>
  simulate(world: string, days: number, seed: number): Promise<SimReport>
  draft(world: string, ask: string, focus?: { kind: EntityKind; id: string }): Promise<EditorDraft>
  /** The map palette (M10): as it stands, or with this palette tried on the preview. */
  palette(world: string, palette?: MapPalette): Promise<PaletteView>
  savePalette(world: string, palette: MapPalette): Promise<EditorSave>
  /** The writing aid's proposal for a palette, from the world's frame; nothing is saved. */
  proposePalette(world: string, ask: string): Promise<{ say: string; palette?: MapPalette; problems: string[] }>
  /** The voice kit (M10.10): as it stands under `voice:`, written back field by field, or proposed by the writing aid. */
  voice(world: string, land?: string): Promise<{ file: string; yaml: string; own: boolean }>
  saveVoice(world: string, yaml: string, land?: string): Promise<EditorSave>
  /** The lands of a world (M10.23): the list, one land as YAML (a template for a new one), and saving it into lands/<land>/land.yaml. */
  lands(world: string): Promise<{ id: string; name: string; file: string }[]>
  land(world: string, land: string): Promise<{ file: string; yaml: string; own: boolean }>
  saveLand(world: string, land: string, yaml: string): Promise<EditorSave>
  proposeVoice(world: string, ask: string, land?: string): Promise<{ say: string; yaml?: string; problems: string[] }>
  /** The world book (M10.18): written next to the content, and saved as HTML with the pictures there are. */
  worldBook(world: string): Promise<{ markdown: string; saved?: string }>
  /** A world's pictures (M10.26): whether it wants them, what is missing and what is there, and the image model's price. */
  pictures(world: string): Promise<PicturesView>
  /** The missing pictures of a world made, within a cap in euros; a line per picture comes to onPictureLine. */
  drawPictures(world: string, capEur: number): Promise<PicturesMade>
  onPictureLine(listener: (line: string) => void): () => void
  /** One step of building a world with the chronicler (M10.17): its proposal, checked, nothing saved. */
  worldStep(world: string, step: string, said: string, land?: string): Promise<EditorDraft>
  /** A proposal that did not load, put right by the chronicler (M10.20): only what it corrects is replaced. */
  worldFix(world: string, step: string, said: string, draft: Pick<EditorDraft, 'say' | 'questions' | 'changes' | 'world' | 'files' | 'land'>, problems: string[]): Promise<EditorDraft>
  /** What this world build may spend and has spent, per step (M10.20); a limit to set, or counting from zero. */
  build(world: string, change?: { limit?: number; reset?: boolean }): Promise<BuildView & { adjusted: boolean }>
  /** The polish round (M10.20): only the descriptions of the places the Check names, or these; light: the player's lighter model. */
  polish(world: string, choice?: { ids?: string[]; light?: boolean }): Promise<EditorDraft>
  /** A first map of a world without one (M10.20), from its places, exits and minutes: a proposal to accept. */
  mapDraft(world: string): Promise<EditorDraft>
  /** The map after the world steps (M10.25): laid out from the places and painted, one proposal. */
  mapStep(world: string, said: string): Promise<EditorDraft>
  /** The map painted again (M10.26): the table as it stood and what stood wrong; the cached part is read again. */
  mapFix(world: string, said: string, table: string, wrong: string[]): Promise<EditorDraft>
  /** The open proposal of a step (M10.20): read it (no third argument), keep it, or forget it (null). */
  openDraft(world: string, step: string, kept?: { draft: EditorDraft; asked: string } | null): Promise<{ draft: EditorDraft; asked: string; at: string } | undefined>
  /** Enhance with AI (after M10.17): the designer's answer to a step written out as a fuller brief, with what only they can decide. */
  enhance(world: string, step: string, said: string, land?: string): Promise<{ brief: string; open: string[]; problems: string[] }>
  /** The design log of a world (M10.18): as it stands, or after one change (a note, an answer being written, a decision). */
  design(world: string, change?: DesignChange): Promise<DesignLog>
  /** Saves a proposal the designer accepts: entities, world.yaml keys and whole files. */
  saveDraft(world: string, draft: Pick<EditorDraft, 'changes' | 'world' | 'files' | 'land'>): Promise<EditorSave>
}

export interface EngineClient {
  /** The version check (M10.20): the channels the preload calls, and those the main process handles. Only in the app. */
  channels?(): string[]
  handled?(): Promise<string[]>
  /** A new game, in the given world (M8) or the one played last. */
  start(world?: string): Promise<Reply>
  /** The worlds in the content folder (M8). */
  worlds(): Promise<WorldChoice[]>
  command(input: string): Promise<Reply>
  /** A page of the journal, or undefined for something the player does not know. */
  page(id: string): Promise<JournalPage | undefined>
  /** A picture of a person or a place as a data URL, when pictures are on and it could be made. */
  picture?(id: string): Promise<string | undefined>
  /** The rules for the creation screen (FO, chapter 11), or undefined in a world without them. */
  creation(): Promise<CreationData | undefined>
  /** The player's own log (desktop only) and the true chronicle, for the end of a game. */
  end(): Promise<{ log?: string; chronicle: string }>
  /** Roughly how large an export of this part of the game log is, in bytes (desktop only). */
  logSize?(scope?: LogScope): Promise<number>
  /** Saves a copy of the game log where the player chooses (desktop only). Returns where, or undefined. */
  exportLog?(scope?: LogScope): Promise<string | undefined>
  /** What happened in this game, as Markdown (M10.18): saved where the player says, or downloaded in the preview. */
  exportChronicle?(): Promise<string | undefined>
  /** Everything the player has found out (M10.20), as an atlas page: saved where the player says, or downloaded in the preview. */
  exportDiscovered?(): Promise<string | undefined>
  /** The saves (M10.20): in the desktop app, and in the preview with ?mock=1 (in memory). */
  saves?: SavesBridge
  /** The knobs of the app (M10.20), for Settings, Advanced: in the desktop app, and in the preview with ?mock=1 (in memory). */
  knobs?: AppKnobsBridge
  activity(): void
  /** Stops the real-time clock while a menu is open. */
  hold(on: boolean): void
  /** Real-time clock updates. Returns an unsubscribe function. */
  onTick(listener: (reply: Reply) => void): () => void
  /** Only in the desktop app, or in the browser preview with ?mock=1. */
  ai?: AiBridge
  transcript?: TranscriptBridge
  /** Content changes while playing (development builds, and the preview). */
  builder?: ContentEvents
  /** The editor, in its own window (development builds) or tab (the preview). */
  editor?: EditorBridge
  /** Under the bonnet (M10.1): the dev menu's view of the running game. Development builds only. */
  dev?: DevBridge
}

/** What the dev menu reads (M10.1). Every change it makes is an @-command through command(). */
export interface DevBridge {
  view(section: DevSection, focus?: string): Promise<DevView | undefined>
}

/** Which part of the game log to export. */
export type LogScope = { kind: 'all' } | { kind: 'loaded' } | { kind: 'days'; days: number }

const IDLE_PAUSE_MS = 60_000

// Inside Electron the engine runs in the main process and is reached through
// the preload bridge. In a plain browser (npm run web) it runs in the page,
// with its own real-time clock and no savegames. With ?mock=1 the NPCs answer
// through the mock model and the settings screen runs on made-up data, so the
// interface can be checked without an API key.
export async function createClient(): Promise<EngineClient> {
  if (window.wisplight) return window.wisplight

  const { APP_KNOBS, DEFAULT_WORLD, discoveredAtlasHtml, Engine, filesOfWorld, loadContent, MockLlm, readSaveFile, saveAbout, saveFileName, saveFileText, worldsIn } = await import('../../engine')
  // Every world's files; a new game picks one of them (M8).
  const all = contentFiles()
  const worlds = worldsIn(all)
  let folder = DEFAULT_WORLD
  let files = filesOfWorld(all, folder)
  let content = loadContent(files)
  const mock = new URLSearchParams(window.location.search).has('mock')
  const demo = mock ? await import('./demo') : undefined
  const llm = mock ? demo!.slowMock(new MockLlm('good')) : undefined
  let engine = new Engine(content, { seed: 1, llm, builder: true })
  const bridge = demo?.demoBridge(content)
  // In the preview the editor opens in a tab of its own, and keeps its changes in memory.
  const reloads = new Set<(change: { file?: string }) => void>()
  const builder: ContentEvents = {
    onReload: (listener) => {
      reloads.add(listener)
      return () => reloads.delete(listener)
    },
    onProblem: () => () => undefined,
  }
  // The clock starts with the player's first keystroke, not while the opening is being read.
  let lastInput = -Infinity
  let held = false
  const listeners = new Set<(reply: Reply) => void>()
  // An arrival the chronicler is laying out (M10.25) is no idleness: the clock and the models go on until it comes.
  const paused = () => held || Boolean(engine.state.talk) || Boolean(engine.state.combat) || (Date.now() - lastInput > IDLE_PAUSE_MS && !engine.state.growth?.underway?.held)
  const status = (): Reply['status'] => ({ ...engine.status(), paused: paused(), ai: bridge ? demo!.demoStatus() : undefined })

  // The chronicler writes in the background, as in the desktop app.
  const chronicler = () => {
    if (engine.modelsWaiting > 0) void engine.runModels()
  }

  // The preview's app knobs (M10.20, ?mock=1): in memory, to try the Advanced tab; the app itself does not follow them here.
  const knobValues: Record<string, number> = {}
  const memoryKnobs: AppKnobsBridge = {
    list: async () => Object.entries(APP_KNOBS).map(([id, k]) => ({ id: id as AppKnobView['id'], ...k, value: knobValues[id] ?? k.default, set: knobValues[id] !== undefined })),
    set: async (id, value) => {
      const k = APP_KNOBS[id as AppKnobView['id']]
      if (!k) return { value: 0 }
      if (value === null) delete knobValues[id]
      else knobValues[id] = Math.min(k.max, Math.max(k.min, value))
      const kept = knobValues[id] ?? k.default
      return { value: kept, ...(value !== null && kept !== value ? { adjusted: `${value} is outside ${k.min} to ${k.max}, so it is ${kept}.` } : {}) }
    },
  }

  // The preview's saves (M10.20, ?mock=1): in memory, gone with the tab.
  const kept: (SaveEntry & { data: SaveData })[] = []
  const keep = (name?: string): number => {
    const id = kept.length + 1
    kept.unshift({ id, slot: 'manual', createdAt: new Date().toISOString(), gameMinutes: engine.world.now, world: content.world.id, ...(name ? { name } : {}), about: saveAbout(engine.world), data: { ...engine.save(), content: engine.saved().content } })
    return id
  }
  const into = async (data: SaveData): Promise<Reply> => {
    const world = worlds.find((w) => w.id === data.world)
    if (!world) return { outputs: [{ kind: 'error', text: 'That world is not here.' }], status: status() }
    if (world.folder !== folder) {
      folder = world.folder
      files = filesOfWorld(all, folder)
      content = loadContent(files)
    }
    engine = await Engine.restore(content, data, llm)
    engine.builder = true
    return { outputs: [{ kind: 'system', text: 'Game loaded.' }, ...(await engine.handle('look'))], status: status() }
  }
  const memorySaves: SavesBridge = {
    list: async () => kept.map(({ data: _, ...entry }) => entry),
    continueGame: async (world) => {
      const id = worlds.find((w) => w.folder === world)?.id
      const last = kept.find((k) => !id || k.world === id)
      return last ? into(last.data) : { outputs: [{ kind: 'error', text: 'There is no saved game yet.' }], status: status() }
    },
    load: async (id) => {
      const save = kept.find((k) => k.id === id)
      return save ? into(save.data) : { outputs: [{ kind: 'error', text: 'That save is gone.' }], status: status() }
    },
    name: async (id, name) => {
      const save = kept.find((k) => k.id === id)
      if (save) {
        if (name?.trim()) save.name = name.trim().slice(0, 80)
        else delete save.name
      }
    },
    exportSave: async (id) => {
      const target = id ?? keep()
      const save = kept.find((k) => k.id === target)
      if (!save) return undefined
      const played = await Engine.restore(loadContent(filesOfWorld(all, worlds.find((w) => w.id === save.world)?.folder ?? folder)), save.data)
      const text = saveFileText({ format: 'wisplight-save', version: 1, world: save.world, worldName: played.content.world.name, ...(save.data.content ? { content: save.data.content } : {}), ...(save.name ? { name: save.name } : {}), saved: save.createdAt, about: save.about ?? saveAbout(played.world), chronicle: played.chronicleMarkdown(), save: played.save() })
      return download(saveFileName(worlds.find((w) => w.id === save.world)?.folder ?? folder, save.about ?? saveAbout(played.world), new Date(save.createdAt)), text, 'application/json')
    },
    importSave: () =>
      new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.wisplight,application/json'
        input.onchange = async () => {
          const file = input.files?.[0]
          if (!file) return resolve(undefined)
          const read = readSaveFile(await file.text())
          if ('problem' in read) return resolve({ problem: read.problem })
          if (!worlds.some((w) => w.id === read.file.world)) return resolve({ problem: `This save belongs to the world "${read.file.worldName}", which is not here.` })
          const id = kept.length + 1
          kept.unshift({ id, slot: 'manual', createdAt: new Date().toISOString(), gameMinutes: Number((read.file.save.state as { minutes?: number }).minutes ?? 0), world: read.file.world, name: file.name.replace(/\.wisplight$/i, '').slice(0, 80), about: read.file.about, data: read.file.save })
          resolve({ id })
        }
        input.click()
      }),
  }

  setInterval(() => {
    if (paused()) return
    const reply = { outputs: engine.tick(1), status: status() }
    chronicler()
    for (const listener of listeners) listener(reply)
  }, 1000)

  return {
    start: async (world) => {
      if (world && world !== folder) {
        folder = world
        files = filesOfWorld(all, folder)
        content = loadContent(files)
        engine = new Engine(content, { seed: 1, llm, builder: true })
      }
      return { outputs: engine.start(), status: status() }
    },
    worlds: async () => worlds.map((w) => ({ ...w, current: w.folder === folder })),
    command: async (input) => {
      lastInput = Date.now()
      // With ?mock=1 the preview keeps saves in memory (M10.20), so the load screen can be tried.
      const named = demo && !engine.state.talk ? /^(?:save|bewaar)(?:\s+(.{1,80}))?$/i.exec(input.trim()) : undefined
      if (named) {
        keep(named[1]?.trim())
        return { outputs: [{ kind: 'system', text: named[1] ? `Game saved as "${named[1].trim()}".` : 'Game saved.' }], status: status() }
      }
      if (/^(save|load|bewaar|laad|continue|verder|log|logboek)(\s+(\d+|export))?$/i.test(input.trim())) {
        return { outputs: [{ kind: 'system', text: 'Saving, loading and the game log work in the desktop app.' }], status: status() }
      }
      const outputs = await engine.handle(input)
      chronicler()
      return { outputs, status: status() }
    },
    page: async (id) => engine.page(id),
    // The preview draws a placeholder with ?mock=1, so the interface can be checked without an image model.
    ...(demo ? { picture: async (id: string) => demo.demoPicture(content, id) } : {}),
    // The preview has no game log on disk; with ?mock=1 the export window runs on a made-up size.
    ...(demo ? { logSize: async (scope?: LogScope) => (scope?.kind === 'all' ? 23_600_000 : 1_900_000), exportLog: async () => 'wisplight-log-preview (the preview saves nothing)' } : {}),
    creation: async () => engine.creationData(),
    end: async () => ({ chronicle: engine.chronicle() }),
    exportChronicle: async () => download('wisplight-chronicle.md', engine.chronicleMarkdown(), 'text/markdown'),
    // The preview has no pictures on disk: the page has the text and the map.
    exportDiscovered: async () => download(`${folder}-found-out.html`, discoveredAtlasHtml(engine, undefined, new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })), 'text/html'),
    ...(demo ? { saves: memorySaves, knobs: memoryKnobs } : {}),
    activity: () => {
      lastInput = Date.now()
    },
    hold: (on) => {
      // Closing a menu counts as activity; the first "no menu" at start-up does not start the clock.
      if (held && !on) lastInput = Date.now()
      held = on
    },
    onTick: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    ai: bridge,
    builder,
    // Under the bonnet (M10.1): only when the preview runs as a development build.
    ...(import.meta.env.DEV ? { dev: { view: async (section: DevSection, focus?: string) => (await import('../../engine/dev')).devView(engine, section, focus) } } : {}),
    editor: { ...(await createEditor()), open: async () => void window.open(`${window.location.pathname}?editor=1${mock ? '&mock=1' : ''}`, 'wisplight-editor') },
  }
}

/** Every file of content/, as the preview bundles them. */
function contentFiles(): { path: string; text: string }[] {
  const modules = import.meta.glob('../../../content/**/*.{yaml,yml,md}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  return Object.entries(modules).map(([path, text]) => ({ path: path.replace(/^.*?content\//, ''), text }))
}

/**
 * The editor's bridge: the desktop app's, or in the preview the same pure
 * functions on the bundled content, with the mock chronicler.
 */
export async function createEditor(): Promise<EditorBridge> {
  if (window.wisplight?.editor) return window.wisplight.editor
  const { applyEdits, draftRequest, draftResult, editorView, entities, entityYaml, filesOfWorld, lineDiff, loadContent, MockLlm, newWorldFiles, paletteRequest, paletteView, mapDraft, mapStepRequest, mapFixRequest, readMapStep, readDraft, readPalette, readVoice, savePalette, saveVoice, simulate, voiceRequest, voiceYaml, landsIn, landYaml, saveLand, withReturnExits, worldAtlasHtml, worldBook, worldsIn, worldStepRequest, worldFixRequest, mergeFix, polishRequest, readPolish, recheckDraft, descriptionCheck, enhanceRequest, readEnhance, hourlyBudget, wantsPictures } = await import('../../engine')
  let all = contentFiles()
  const builds: Record<string, BuildView> = {}
  const openDrafts = new Map<string, { draft: EditorDraft; asked: string; at: string }>()
  const shown = (changes: { path: string; before?: string; text: string }[]) => changes.map((c) => ({ path: c.path, fresh: c.before === undefined, lines: lineDiff(c.before ?? '', c.text) }))
  const shownDraft = (draft: ReturnType<typeof readDraft>): EditorDraft => ({
    say: draft.say,
    questions: draft.questions,
    changes: draft.changes,
    ...(draft.world ? { world: draft.world } : {}),
    ...(draft.rules ? { rules: draft.rules } : {}),
    ...(draft.files ? { files: draft.files } : {}),
    ...(draft.land ? { land: draft.land } : {}),
    problems: draft.problems,
    diffs: draft.result?.ok ? shown(draft.result.changes) : [],
    ...(draft.result?.content && draft.changes.some((c) => c.kind === 'location') ? { descriptions: descriptionCheck(draft.result.content, new Set(draft.changes.filter((c) => c.kind === 'location').map((c) => c.id))) } : {}),
  })
  return {
    worlds: async () => worldsIn(all),
    view: async (world) => editorView(filesOfWorld(all, world)),
    entity: async (world, kind, id) => {
      const files = filesOfWorld(all, world)
      const found = entities(files, kind).find((e) => e.id === id)
      return found ? { raw: found.raw, yaml: entityYaml(files, kind, id) ?? '', file: found.file } : undefined
    },
    save: async (world, edits, write = true) => {
      const files = filesOfWorld(all, world)
      const result = applyEdits(files, withReturnExits(files, edits))
      if (result.ok && write) {
        const changed = new Map(result.changes.map((c) => [c.path, c.text]))
        all = [...all.map((f) => (changed.has(f.path) ? { ...f, text: changed.get(f.path)! } : f)), ...result.changes.filter((c) => !all.some((f) => f.path === c.path)).map((c) => ({ path: c.path, text: c.text }))]
      }
      return { ok: result.ok, problems: result.problems, warnings: result.content ? editorView(result.files).warnings : [], changes: shown(result.changes) }
    },
    newWorld: async (folder, name) => {
      if (!/^[a-z][a-z0-9_]{1,30}$/.test(folder) || all.some((f) => f.path.startsWith(`${folder}/`))) return { ok: false, problems: ['Pick a new folder name: lower-case letters, digits or underscores.'] }
      all = [...all, ...newWorldFiles(folder, name || folder)]
      return { ok: true, problems: [] }
    },
    simulate: async (world, days, seed) => simulate(loadContent(filesOfWorld(all, world)), days, seed),
    palette: async (world, palette) => paletteView(filesOfWorld(all, world), palette),
    mapDraft: async (world) => shownDraft(mapDraft(filesOfWorld(all, world))),
    mapStep: async (world, said) => {
      const files = filesOfWorld(all, world)
      const { layout, request } = mapStepRequest(files, said)
      if (!request) return shownDraft(layout.problems.length ? layout : { ...layout, problems: ['There is no region map to paint: the world has no places with exits to lay out.'] })
      const table = (await new MockLlm().complete(request)).text
      return { ...shownDraft(readMapStep(files, layout, table)), table }
    },
    mapFix: async (world, said, table, wrong) => {
      const files = filesOfWorld(all, world)
      const { layout } = mapStepRequest(files, said)
      const request = mapFixRequest(files, said, table, wrong)
      if (!request) return shownDraft({ ...layout, problems: ['There is no region map to paint.'] })
      const again = (await new MockLlm().complete(request)).text
      return { ...shownDraft(readMapStep(files, layout, again)), table: again }
    },
    savePalette: async (world, palette) => {
      const files = filesOfWorld(all, world)
      const outcome = savePalette(files, palette)
      if (outcome.ok) {
        const changed = new Map(outcome.changes.map((c) => [c.path, c.text]))
        all = all.map((f) => (changed.has(f.path) ? { ...f, text: changed.get(f.path)! } : f))
      }
      return { ok: outcome.ok, problems: outcome.problems, warnings: [], changes: shown(outcome.changes) }
    },
    proposePalette: async (world, ask) => readPalette((await new MockLlm().complete(paletteRequest(filesOfWorld(all, world), ask))).text),
    voice: async (world, land) => voiceYaml(filesOfWorld(all, world), land),
    lands: async (world) => landsIn(filesOfWorld(all, world)),
    land: async (world, land) => landYaml(filesOfWorld(all, world), land),
    saveLand: async (world, land, yaml) => {
      const outcome = saveLand(filesOfWorld(all, world), land, yaml)
      if (outcome.ok) {
        const changed = new Map(outcome.changes.map((c) => [c.path, c.text]))
        all = [...all.map((f) => (changed.has(f.path) ? { ...f, text: changed.get(f.path)! } : f)), ...outcome.changes.filter((c) => !all.some((f) => f.path === c.path)).map((c) => ({ path: c.path, text: c.text }))]
      }
      return { ok: outcome.ok, problems: outcome.problems, warnings: [], changes: shown(outcome.changes) }
    },
    saveVoice: async (world, yaml, land) => {
      const outcome = saveVoice(filesOfWorld(all, world), yaml, land)
      if (outcome.ok) {
        const changed = new Map(outcome.changes.map((c) => [c.path, c.text]))
        all = [...all.map((f) => (changed.has(f.path) ? { ...f, text: changed.get(f.path)! } : f)), ...outcome.changes.filter((c) => !all.some((f) => f.path === c.path)).map((c) => ({ path: c.path, text: c.text }))]
      }
      return { ok: outcome.ok, problems: outcome.problems, warnings: [], changes: shown(outcome.changes) }
    },
    proposeVoice: async (world, ask, land) => readVoice((await new MockLlm().complete(voiceRequest(filesOfWorld(all, world), ask, land))).text),
    draft: async (world, ask, focus) => {
      const files = filesOfWorld(all, world)
      return shownDraft(readDraft(files, (await new MockLlm().complete(draftRequest(files, ask, focus))).text))
    },
    worldStep: async (world, step, said, land) => {
      const files = filesOfWorld(all, world)
      return shownDraft(readDraft(files, (await new MockLlm().complete(worldStepRequest(files, step, said, land))).text, land))
    },
    // The browser preview spends nothing: its builds are counted in memory, at the default of five dollars.
    build: async (world, change) => {
      const b = (builds[world] ??= { world, limitUsd: 5, own: false, spentUsd: 0, steps: {}, calls: 0 })
      if (change?.reset) Object.assign(b, { spentUsd: 0, steps: {}, calls: 0 })
      let adjusted = false
      if (typeof change?.limit === 'number') {
        const kept = hourlyBudget(change.limit)
        Object.assign(b, { limitUsd: kept.usd, own: true })
        adjusted = kept.adjusted
      }
      return { ...b, steps: { ...b.steps }, adjusted }
    },
    // The browser preview keeps open proposals in memory only.
    openDraft: async (world, step, kept) => {
      const key = `${world}/${step}`
      if (kept === undefined) {
        const got = openDrafts.get(key)
        return got ? { ...got, draft: shownDraft(recheckDraft(filesOfWorld(all, world), got.draft)) } : undefined
      }
      if (kept) openDrafts.set(key, { ...kept, at: new Date().toISOString() })
      else openDrafts.delete(key)
      return openDrafts.get(key)
    },
    polish: async (world, choice) => {
      const files = filesOfWorld(all, world)
      return shownDraft(readPolish(files, (await new MockLlm().complete(polishRequest(files, choice?.ids, choice?.light !== false))).text))
    },
    worldFix: async (world, step, said, draft, problems) => {
      const files = filesOfWorld(all, world)
      return shownDraft(mergeFix(files, draft, (await new MockLlm().complete(worldFixRequest(files, step, said, draft, problems))).text))
    },
    enhance: async (world, step, said, land) => readEnhance((await new MockLlm().complete(enhanceRequest(filesOfWorld(all, world), step, said, land))).text),
    design: async (world, change) => {
      const next = designUpdate(filesOfWorld(all, world), change)
      if (!next) return { notes: [], answers: {}, decisions: [] }
      if (change) all = [...all.filter((f) => f.path !== next.path), { path: next.path, text: next.text }]
      return next.log
    },
    // The browser preview has no image model and no pictures on disk (M10.26): it counts what a world would need.
    pictures: async (world) => {
      const worldContent = loadContent(filesOfWorld(all, world))
      const missing = [...[...worldContent.areas.values()].map((a) => ({ name: a.name, kind: 'place' as const })), ...[...worldContent.npcs.values()].filter((n) => n.portrait !== 'generic').map((n) => ({ name: n.name, kind: 'person' as const }))]
      return { wanted: wantsPictures(worldContent), missing, kept: 0 }
    },
    drawPictures: async () => ({ made: 0, kept: 0, failed: 0, costUsd: 0, stopped: 'the browser preview makes no pictures' }),
    onPictureLine: () => () => undefined,
    worldBook: async (world) => {
      const files = filesOfWorld(all, world)
      const worldContent = loadContent(files)
      const own = files.find((f) => f.path === `${world}/CHRONICLER.md`)?.text
      const markdown = worldBook(worldContent, { folder: world, ...(own ? { chronicler: own } : {}) })
      const written = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
      return { markdown, saved: download(`${world}-worldbook.html`, worldAtlasHtml(worldContent, markdown, undefined, { written }), 'text/html') }
    },
    saveDraft: async (world, draft) => {
      const outcome = draftResult(filesOfWorld(all, world), draft)
      if (outcome.ok) {
        const changed = new Map(outcome.changes.map((c) => [c.path, c.text]))
        all = [...all.map((f) => (changed.has(f.path) ? { ...f, text: changed.get(f.path)! } : f)), ...outcome.changes.filter((c) => !all.some((f) => f.path === c.path)).map((c) => ({ path: c.path, text: c.text }))]
      }
      return { ok: outcome.ok, problems: outcome.problems, warnings: [], changes: outcome.ok ? shown(outcome.changes) : [] }
    },
  }
}

/** A file the preview hands the browser to save (M10.18): what the desktop app writes with a save dialog. */
function download(name: string, text: string, type: string): string {
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type }))
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  return name
}
