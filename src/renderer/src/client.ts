import type { CreationData, DiffLine, DraftChange, Edit, EditorView, EntityKind, JournalPage, Output, Raw, SimReport, Status, WorldInfo } from '../../engine'
import type { DevSection, DevView } from '../../engine/dev'
import type { Advice, TrialResult, TrialVerdict } from '../../node/ai/advisor'
import type { AiLogEntry } from '../../node/ai/log'
import type { ModelInfo, ProviderId } from '../../node/ai/providers'
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
}

export interface Reply {
  outputs: Output[]
  status: Status & { ai?: AiStatus }
}

/** Settings > AI. Keys go in and never come back out. */
export interface AiBridge {
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
  setBudget(usd: number): Promise<void>
  setMonthBudget(usd: number | null): Promise<void>
  setCredit(provider: ProviderId, usd: number | null): Promise<void>
  csv(): Promise<string>
  log(): Promise<AiLogEntry[]>
  billing(provider: ProviderId): Promise<void>
  /** Pictures (after the M7 playtest): the image models of a key, the choice, and a trial picture as a data URL. */
  imageModels(provider: ProviderId): Promise<ModelInfo[]>
  setPictures(provider: ProviderId | null, model?: string, quality?: 'low' | 'medium'): Promise<void>
  tryPicture(provider: ProviderId, model: string): Promise<string>
}

/** The game hears when the content changed under it: the editor saved, or a file changed on disk. */
export interface ContentEvents {
  onReload(listener: () => void): () => void
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
  problems: string[]
  diffs: ShownChange[]
}

/** The editor (M8): the desktop app writes the files; the browser preview keeps them in memory. */
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
}

export interface EngineClient {
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
  activity(): void
  /** Stops the real-time clock while a menu is open. */
  hold(on: boolean): void
  /** Real-time clock updates. Returns an unsubscribe function. */
  onTick(listener: (reply: Reply) => void): () => void
  /** Only in the desktop app, or in the browser preview with ?mock=1. */
  ai?: AiBridge
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

  const { DEFAULT_WORLD, Engine, filesOfWorld, loadContent, MockLlm, worldsIn } = await import('../../engine')
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
  const reloads = new Set<() => void>()
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
  const paused = () => held || Boolean(engine.state.talk) || Boolean(engine.state.combat) || Date.now() - lastInput > IDLE_PAUSE_MS
  const status = (): Reply['status'] => ({ ...engine.status(), paused: paused(), ai: bridge ? demo!.demoStatus() : undefined })

  // The chronicler writes in the background, as in the desktop app.
  const chronicler = () => {
    if (engine.modelsWaiting > 0) void engine.runModels()
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
  const { applyEdits, draftRequest, editorView, entities, entityYaml, filesOfWorld, lineDiff, loadContent, MockLlm, newWorldFiles, readDraft, simulate, withReturnExits, worldsIn } = await import('../../engine')
  let all = contentFiles()
  const shown = (changes: { path: string; before?: string; text: string }[]) => changes.map((c) => ({ path: c.path, fresh: c.before === undefined, lines: lineDiff(c.before ?? '', c.text) }))
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
    draft: async (world, ask, focus) => {
      const files = filesOfWorld(all, world)
      const draft = readDraft(files, (await new MockLlm().complete(draftRequest(files, ask, focus))).text)
      return { say: draft.say, questions: draft.questions, changes: draft.changes, problems: draft.problems, diffs: draft.result?.ok ? shown(draft.result.changes) : [] }
    },
  }
}
