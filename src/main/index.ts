import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, watch, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ContentError, discoveredAtlasHtml, draftRequest, readSaveFile, saveAbout, saveFileName, saveFileText, SAVE_FILE_EXTENSION, type SaveFile, draftResult, Engine, ENTITY_KINDS, lineDiff, MapPaletteSchema, paletteRequest, paletteView, readDraft, readPalette, readVoice, savePalette, saveVoice, voiceRequest, voiceYaml, worldStepRequest, worldFixRequest, mergeFix, enhanceRequest, readEnhance, type Content, type Edit, type EntityKind, type FileChange, type CheckpointedSave, type MapPalette, type Output, type SaveData } from '../engine'
import { designUpdate, readDesignChange } from '../engine/designlog'
import { ContentEditor } from '../node/editor'
import { checkInput } from './inputs'
import { cachedPictureIn, worldAtlasFor, worldBookFor, writeWorldBook } from '../node/worldbook'
import type { ProviderId } from '../node/ai/providers'
import { AiService } from '../node/ai/service'
import type { ChosenRole, Cipher } from '../node/ai/settings'
import { DEFAULT_WORLD, listWorlds, loadContentFromDir, readContentFiles } from '../node/content'
import { format, GameLog, PART_BYTES, type LogScope, type Session } from '../node/gamelog'
import { SaveStore } from '../node/savegame'
import { Transcript, type TranscriptSettings } from '../node/transcript'
import { aiCheck, BUILDER_CHECK_SCRIPT, keyCheck, LOG_CHECK_SCRIPT, picturesRun, prepareBuilderCheck, prepareKeyCheck, prepareLogCheck } from './checks'

// The engine runs in the main process for now; the design moves it to a
// utility process once the simulation grows (FO, chapter 3).
//
// Hybrid clock (FO, chapter 3): outside conversations and menus, one real
// second is one game minute. The clock pauses after 60 seconds without input.

const IDLE_PAUSE_MS = 60_000
const AUTOSAVE_EVERY = 10
// A command that lets this much game time pass (travelling, a long walk, sleep) saves at once.
const SAVE_AFTER_MINUTES = 60

let content: Content | undefined
/** The world in play (M8): its folder under content/, and the worlds loaded so far. */
let worldFolder = DEFAULT_WORLD
const worldContents = new Map<string, Content>()
let ai: AiService | undefined
let engine: Engine | undefined
let window: BrowserWindow | undefined
let saves: SaveStore | undefined
let lastInput = Date.now()
let held = false
let minutesSinceSave = 0

const smoke = Boolean(process.env['WISPLIGHT_SMOKE'])
// WISPLIGHT_PICTURES=<euros> (after the M10 playtest): every picture at once, then quit. Chromium gets a
// folder of its own, so a game that is open keeps its own; the settings, the key and the pictures are the player's.
const picturing = process.env['WISPLIGHT_PICTURES']
const playerData = app.getPath('userData')
if (picturing) app.setPath('userData', mkdtempSync(join(tmpdir(), 'wisplight-pictures-')))
const checking = Boolean(process.env['WISPLIGHT_AI_CHECK'] || process.env['WISPLIGHT_KEY_CHECK'])
if (process.env['WISPLIGHT_KEY_CHECK']) prepareKeyCheck(app)
const logCheck = process.env['WISPLIGHT_LOG_CHECK'] ? prepareLogCheck(app) : undefined
const builderCheck = process.env['WISPLIGHT_BUILDER_CHECK'] ? prepareBuilderCheck(app) : undefined

/** A line of the smoke check: on the console, and in a file when WISPLIGHT_SMOKE_OUT names one (an installed app on Windows has no console). */
function smokeSay(line: string): void {
  console.log(line)
  const out = process.env['WISPLIGHT_SMOKE_OUT']
  if (out) appendFileSync(out, `${line}\n`)
}

// The smoke check plays in a folder of its own and never touches the keychain (M9.4): it must not
// read the player's settings or saves, and a test build with another signature makes macOS ask for the key store.
const smokeData = smoke ? mkdtempSync(join(tmpdir(), 'wisplight-smoke-data-')) : undefined
if (smokeData) {
  // Chromium's own storage keeps its key in the keychain too; the smoke check uses a stand-in.
  app.commandLine.appendSwitch('use-mock-keychain')
  app.setPath('userData', smokeData)
  app.on('will-quit', () => {
    try {
      rmSync(smokeData, { recursive: true, force: true })
    } catch {
      // Windows keeps Chromium's files open until the very end: the temporary folder stays, and the app still quits.
    }
  })
}

// One app at a time for a player (M10.20; the build of The Quiet Reach, 28 September 2026: an older
// instance wrote its settings back over Bram's). A second start hands over to the first, which comes to
// the front. In development two may run: npm run dev --watch restarts this process and could lose the
// race for the lock, and the editor runs beside the game; the settings are written per change, so
// neither overwrites the other. The checks and the smoke run have folders of their own.
const handedOver = app.isPackaged && !smoke && !picturing && !checking && !logCheck && !builderCheck ? !app.requestSingleInstanceLock() : false
if (handedOver) app.quit()
app.on('second-instance', () => {
  const open = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed())
  if (!open) return
  if (open.isMinimized()) open.restore()
  open.focus()
})

// API keys are encrypted with the operating system's key store before they reach the disk.
const cipher: Cipher = smoke
  ? {
      available: () => false,
      encrypt: () => {
        throw new Error('No key store in the smoke check')
      },
      decrypt: () => {
        throw new Error('No key store in the smoke check')
      },
    }
  : {
      available: () => safeStorage.isEncryptionAvailable(),
      encrypt: (plain) => safeStorage.encryptString(plain).toString('base64'),
      decrypt: (encoded) => safeStorage.decryptString(Buffer.from(encoded, 'base64')),
    }

const BILLING: Record<ProviderId, string> = {
  openai: 'https://platform.openai.com/settings/organization/billing/overview',
  anthropic: 'https://platform.claude.com/settings/billing',
}

let ready: Promise<void> | undefined
function setup(): Promise<void> {
  ready ??= (async () => {
    content = await worldContent(DEFAULT_WORLD)
    ai = new AiService({ dir: app.getPath('userData'), cipher, content })
    // The lights in the status bar (M10.4): every start and end of a call.
    ai.onActivity = (roles) => {
      if (window && !window.isDestroyed()) window.webContents.send('ai:activity', roles)
    }
    watchContent()
    // At start-up: are the chosen models still offered? In the background; Settings shows the answer.
    if (!process.env['WISPLIGHT_SMOKE']) void ai.refreshModels().catch(() => undefined)
  })()
  return ready
}

// The clock stands still in conversations and menus, and after a minute without input.
function paused(): boolean {
  return Boolean(engine?.state.combat) || held || Boolean(engine?.state.talk) || Date.now() - lastInput > IDLE_PAUSE_MS
}

function aiStatus() {
  if (!ai) return undefined
  const { settings, usage, status } = ai.overview()
  return {
    connected: Boolean(settings.roles.voice),
    sessionUsd: usage.session.costUsd,
    hourPercent: status.hourBudgetUsd ? Math.round((status.hourSpentUsd / status.hourBudgetUsd) * 100) : 0,
    monthLeftPercent: usage.monthLeftPercent,
    busy: status.busy,
    roles: ai.gateway.activity(),
    coolingDown: status.coolingDown,
    budgetSpent: status.monthBudgetSpent || status.hourSpentUsd >= status.hourBudgetUsd,
  }
}

// ---------------------------------------------------------------- the transcript (M10.4)

const transcriptFile = () => join(app.getPath('userData'), 'transcript.json')
function transcriptSettings(): TranscriptSettings {
  const fallback = { enabled: false, folder: join(app.getPath('documents'), 'Wisplight transcripts') }
  try {
    return { ...fallback, ...(JSON.parse(readFileSync(transcriptFile(), 'utf8')) as Partial<TranscriptSettings>) }
  } catch {
    return fallback
  }
}
function saveTranscriptSettings(settings: TranscriptSettings): void {
  writeFileSync(transcriptFile(), JSON.stringify(settings, null, 2))
}
/** A notice for the next reply: the transcript could not be written and is off now. */
let transcriptNotice: string | undefined
let transcript: Transcript | undefined
function scribe(): Transcript {
  transcript ??= new Transcript(smoke ? { enabled: false, folder: '' } : transcriptSettings(), (message) => {
    saveTranscriptSettings({ ...transcriptSettings(), enabled: false })
    transcriptNotice = `The transcript could not be written (${message}), and is off now. Settings > Transcript.`
  })
  return transcript
}
/** What was typed, for the transcript's next lines. */
let typed: string | undefined

function reply(outputs: Output[]) {
  const status = { ...engine!.status(), paused: paused(), ai: aiStatus() }
  // Everything shown goes into the transcript, if it is on; to disk in the background at the end of the turn.
  const shown = transcriptNotice ? [...outputs, system(transcriptNotice)] : outputs
  transcriptNotice = undefined
  scribe().record(typed, shown, { time: status.time, location: status.location })
  typed = undefined
  void scribe().flush()
  return { outputs: shown, status }
}

function store(): SaveStore {
  saves ??= new SaveStore(join(app.getPath('userData'), 'saves', 'wisplight.sqlite'))
  return saves
}

let gamelog: GameLog | undefined
let session: Session | undefined
let unfollow: (() => void) | undefined
let opening: Output[] = []

function journal(): GameLog {
  gamelog ??= new GameLog(join(app.getPath('userData'), 'saves', 'gamelog.sqlite'))
  return gamelog
}

/** Makes `next` the running game and writes everything it does to the game log. */
function follow(next: Engine, where: Session): void {
  unfollow?.()
  engine = next
  // The world builder's @ commands are for playtesting in a development build.
  next.builder = !app.isPackaged
  session = where
  scribe().begin(worldFolder, where.game)
  unfollow = next.onLog((line) => journal().write(where, line))
  journal().calendar = next.world.calendar
  // What went to the archive is read back from this game's log (M10.2): the lookups and the chronicler find it there.
  next.world.archive = { fact: (id) => journal().archivedFact(where, id) }
}

/** A new game gets its log at the first input, so a quick CONTINUE leaves no empty game behind. */
function ensureSession(): Session {
  if (session) return session
  const where = journal().start(randomUUID())
  const now = engine!.world.now
  journal().append(where, now, 'meta', JSON.stringify({ seed: engine!.state.seed, world: content!.world.id }))
  journal().append(where, now, 'note', `New game, ${new Date().toLocaleString('en-GB')}`)
  for (const output of opening) journal().append(where, now, 'out', output.text)
  follow(engine!, where)
  return where
}

/** A save for the store: the last checkpoint and the log since (M9.3), and where it sits in the game log. */
function snapshot(): CheckpointedSave {
  const where = ensureSession()
  return { ...engine!.saved(), session: { ...where, logId: journal().position(where) } }
}

/** Saves the game in a slot, with who, where and the day (M10.20), and a name if the player gave one. */
function keep(slot: string, name?: string): number {
  return store().save(slot, snapshot(), 5, { about: saveAbout(engine!.world), ...(name ? { name } : {}) })
}

/** A save as a whole, its tail played (M9.3): a new stranger or a legend starts from the world as it was. */
async function whole(data: SaveData): Promise<SaveData> {
  return data.tail?.length ? (await Engine.restore(content!, data)).save() : data
}

const system = (text: string): Output => ({ kind: 'system', text })

async function worldContent(folder: string): Promise<Content> {
  let loaded = worldContents.get(folder)
  if (!loaded) {
    loaded = await loadContentFromDir(contentDir(), folder)
    worldContents.set(folder, loaded)
  }
  return loaded
}

/** Plays in another world from now on: its content, and the builder's reloads follow it. */
async function useWorld(folder: string): Promise<void> {
  content = await worldContent(folder)
  worldFolder = folder
}

/** The folder of the world a save belongs to, or an error when that world is gone from content/. */
async function useWorldOf(save: SaveData): Promise<string | undefined> {
  const folder = (await listWorlds(contentDir())).find((w) => w.id === save.world)?.folder
  if (folder === undefined) return `This save belongs to the world "${save.world}", which is not in the content folder any more.`
  await useWorld(folder)
  return undefined
}

// Every channel the main process handles goes through here (M10.20): the list answers 'app:handled',
// so an interface newer than this main process can say "Restart the app" before its first call fails.
const HANDLED = new Set<string>()
function handle(channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void {
  HANDLED.add(channel)
  // Only our own pages may call, and only with arguments that fit the channel (M10.19; src/main/inputs.ts).
  ipcMain.handle(channel, (event, ...args) => {
    if (!fromApp(event)) throw new Error(`Refused ${channel}: not from the app's own page`)
    return listener(event, ...checkInput(channel, args))
  })
}

/** The page of the app itself (M10.19): from the dev server in development, from the files in a build. */
const APP_PAGE = new URL('../renderer/index.html', import.meta.url).href
function fromApp(event: { senderFrame: { url: string } | null }): boolean {
  const url = event.senderFrame?.url ?? ''
  const dev = process.env['ELECTRON_RENDERER_URL']
  return url.startsWith(APP_PAGE) || (dev !== undefined && url.startsWith(dev))
}

/** A window of the app stays on the app's page (M10.19): no navigating elsewhere, no new windows. */
function keepHome(win: BrowserWindow): void {
  win.webContents.on('will-navigate', (event, url) => {
    if (!fromApp({ senderFrame: { url } })) event.preventDefault()
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}
ipcMain.handle('app:handled', () => [...HANDLED])

handle('engine:worlds', async () => (await listWorlds(contentDir())).map((w) => ({ ...w, current: w.folder === worldFolder })))

handle('engine:start', async (_event, world: unknown) => {
  await setup()
  // A new game in the chosen world (M8), or in the one played last.
  if (typeof world === 'string' && world) await useWorld(world)
  unfollow?.()
  session = undefined
  engine = new Engine(content!, { seed: Math.floor(Math.random() * 2 ** 31), llm: ai!.client(), builder: !app.isPackaged })
  // The clock starts with the player's first keystroke, not while the opening is being read.
  lastInput = -Infinity
  const outputs = engine.start()
  opening = [...outputs]
  // A new game is a choice made in the world picker, which offers [Continue] and [Load a save...] (M10.20): no line about saves here.
  return reply(outputs)
})

/** Carries on exactly where a save's game stopped: the save plus what the game log recorded after it. */
async function continueFrom(data: SaveData | undefined) {
  if (!data) return reply([{ kind: 'error', text: 'There is no saved game yet.' }])
  const gone = await useWorldOf(data)
  if (gone) return reply([{ kind: 'error', text: gone }])
  if (!data.session) {
    follow(await Engine.restore(content!, data, ai?.client()), journal().start(randomUUID()))
  } else {
    // The last save plus everything the log recorded after it: exactly where the game stopped.
    const tail = journal().tail(data.session, data.session.logId)
    const where = { game: data.session.game, branch: data.session.branch }
    follow(await Engine.resume(content!, data, tail, ai?.client()), where)
    journal().append(where, engine!.world.now, 'note', 'Continued')
  }
  return reply([system('You pick up where you left off.'), ...(await engine!.handle('look'))])
}

/** Loads a save as it was saved; what happened after it stays in the game log, on a branch of its own. */
async function loadFrom(data: (SaveData & { createdAt?: string }) | undefined) {
  if (!data) return reply([{ kind: 'error', text: 'There is no saved game yet.' }])
  const gone = await useWorldOf(data)
  if (gone) return reply([{ kind: 'error', text: gone }])
  const loaded = await Engine.restore(content!, data, ai?.client())
  if (!data.session) {
    follow(loaded, journal().start(randomUUID()))
  } else {
    const from = { game: data.session.game, branch: data.session.branch }
    // Anything that happened after this save stays in the log, on its own branch.
    const where = journal().position(from) > data.session.logId ? journal().fork(from, data.session.logId) : from
    follow(loaded, where)
    journal().append(where, loaded.world.now, 'note', `Loaded the save of ${new Date(data.createdAt ?? Date.now()).toLocaleString('en-GB')}. What happened after it stays in the log.`)
    if (where !== from) keep('auto')
  }
  return reply([system('Game loaded.'), ...(await engine!.handle('look'))])
}

// Everything the player has found out (M10.20), as an atlas page with the pictures there are: never the whole world book.
handle('engine:export-discovered', async () => {
  if (!engine) return undefined
  const who = (engine.state.player.character?.name ?? 'stranger').replace(/[^\w-]+/g, '-').toLowerCase()
  const result = await dialog.showSaveDialog(window!, { title: 'Save what you found out', defaultPath: join(app.getPath('documents'), `${worldFolder}-${who}-found-out.html`), filters: [{ name: 'Web page', extensions: ['html'] }] })
  if (result.canceled || !result.filePath) return undefined
  const played = engine
  const written = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  writeFileSync(result.filePath, discoveredAtlasHtml(played, (id) => cachedPictureIn(app.getPath('userData'), played.content, id, { latest: true }), written), 'utf8')
  return result.filePath
})
// The saves (M10.20): the list for the world picker and the load screen, continue a world, load one, name one,
// and one save as a file to keep or bring back.
handle('engine:saves', () => store().list().slice(0, 200))
handle('engine:continue', async (_event, world: unknown) => {
  await setup()
  const id = typeof world === 'string' && world ? (await listWorlds(contentDir())).find((w) => w.folder === world)?.id : undefined
  return continueFrom(id ? store().latest(id) : store().latest())
})
handle('engine:load-save', async (_event, id: unknown) => {
  await setup()
  return loadFrom(store().loadId(Number(id)))
})
handle('engine:name-save', (_event, id: unknown, name: unknown) => store().rename(Number(id), typeof name === 'string' ? name : undefined))
handle('engine:export-save', async (_event, id: unknown) => {
  await setup()
  // The game in play is saved first, so what is exported is what the player sees now.
  const saveId = id === undefined || id === null ? (engine ? keep('manual') : undefined) : Number(id)
  const row = saveId === undefined ? undefined : store().list().find((s) => s.id === saveId)
  const data = saveId === undefined ? undefined : store().loadId(saveId)
  if (!row || !data) return undefined
  const folder = (await listWorlds(contentDir())).find((w) => w.id === data.world)?.folder
  if (folder === undefined) return undefined
  const saved = await worldContent(folder)
  const played = await Engine.restore(saved, data)
  const about = row.about ?? saveAbout(played.world)
  const result = await dialog.showSaveDialog({ title: 'Export this save', defaultPath: join(app.getPath('documents'), saveFileName(folder, about, new Date(row.createdAt))), filters: [{ name: 'Wisplight save', extensions: [SAVE_FILE_EXTENSION] }] })
  if (result.canceled || !result.filePath) return undefined
  const file: SaveFile = { format: 'wisplight-save', version: 1, world: data.world, worldName: saved.world.name, ...(data.content ? { content: data.content } : {}), ...(row.name ? { name: row.name } : {}), saved: row.createdAt, about, chronicle: played.chronicleMarkdown(), save: played.save() }
  writeFileSync(result.filePath, saveFileText(file), 'utf8')
  return result.filePath
})
handle('engine:import-save', async () => {
  await setup()
  const chosen = await dialog.showOpenDialog({ title: 'Import a save', properties: ['openFile'], filters: [{ name: 'Wisplight save', extensions: [SAVE_FILE_EXTENSION] }] })
  const path = chosen.canceled ? undefined : chosen.filePaths[0]
  if (!path) return undefined
  const read = readSaveFile(readFileSync(path, 'utf8'))
  if ('problem' in read) return { problem: read.problem }
  const world = (await listWorlds(contentDir())).find((w) => w.id === read.file.world)
  if (!world) return { problem: `This save belongs to the world "${read.file.worldName}", which is not in the content folder.` }
  // It must load: newer content loads it as an old save loads, with its tombstones.
  try {
    await Engine.restore(await worldContent(world.folder), read.file.save)
  } catch (error) {
    return { problem: `This save does not load in ${world.name}: ${error instanceof Error ? error.message : String(error)}` }
  }
  const name = basename(path).replace(/\.wisplight$/i, '').slice(0, 80)
  const id = store().save('manual', read.file.save, 5, { name, about: read.file.about })
  return { id }
})

handle('engine:command', async (_event, input: unknown) => {
  if (!engine || !content) throw new Error('Engine not started')
  lastInput = Date.now()
  const text = String(input).trim().slice(0, 500)
  typed = text
  // Only the bare command: "Save me!" in a conversation is something to say, not a menu action.
  const command = /^(save|bewaar|continue|verder|load|laad|log|logboek)(?:\s+(\d+|export))?$/i.exec(text)
  const verb = command?.[1]?.toLowerCase()
  const args = command?.[2] ? [command[2].toLowerCase()] : []
  // SAVE with a name (M10.20), outside a talk: "save me!" said to someone is something to say.
  const named = !engine.state.talk ? /^(?:save|bewaar)\s+(?!export\b|\d+$)(.{1,80})$/i.exec(text)?.[1]?.trim() : undefined
  if (verb === 'save' || verb === 'bewaar' || named) {
    journal().append(ensureSession(), engine.world.now, 'note', named ? `Game saved as "${named}"` : 'Game saved')
    keep('manual', named)
    return reply([system(named ? `Game saved as "${named}".` : 'Game saved.')])
  }
  if (verb === 'continue' || verb === 'verder') return continueFrom(store().latest())
  if (/^(years later|new legend|jaren later)$/i.test(text)) {
    // A new game in the same world, with the old one as legend (M9.1).
    const data = store().latest()
    if (!data) return reply([{ kind: 'error', text: 'There is no saved world to tell legends of.' }])
    const gone = await useWorldOf(data)
    if (gone) return reply([{ kind: 'error', text: gone }])
    const { engine: next, outputs } = await Engine.legend(content, await whole(data), Math.floor(Math.random() * 2 ** 31), ai?.client())
    next.builder = !app.isPackaged
    follow(next, journal().start(randomUUID()))
    return reply(outputs)
  }
  if (/^(new stranger|carry on|nieuwe vreemdeling)$/i.test(text)) {
    // The same world with a new character (M7.2).
    const data = store().latest()
    if (!data) return reply([{ kind: 'error', text: 'There is no saved world to carry on in.' }])
    const gone = await useWorldOf(data)
    if (gone) return reply([{ kind: 'error', text: gone }])
    const { engine: next, outputs } = Engine.carryOn(content, await whole(data), Math.floor(Math.random() * 2 ** 31), ai?.client())
    next.builder = !app.isPackaged
    follow(next, journal().start(randomUUID()))
    return reply(outputs)
  }
  if (verb === 'load' || verb === 'laad') return loadFrom(store().load('manual') ?? store().load('auto'))
  if (verb === 'log' || verb === 'logboek') {
    const where = ensureSession()
    if (args[0] === 'export') {
      // log export, log export loaded, log export days 7
      const scope: LogScope = args[1] === 'loaded' ? { kind: 'loaded' } : args[1] === 'days' ? { kind: 'days', days: Math.max(1, Number(args[2]) || 7) } : { kind: 'all' }
      const file = await exportLog(where, scope)
      return reply([system(file ? `The log is saved as ${file}.` : 'Not saved.')])
    }
    const lines = journal().recent(where, Math.min(500, Number(args[0]) || 30))
    return reply([system(lines.length ? lines.map((row) => format(row, journal().calendar)).join('\n') : 'The log is empty.')])
  }
  ensureSession()
  const before = engine.world.now
  const outputs = await engine.handle(text)
  chronicler()
  // After a journey the game saves (FO, chapter 18): an hour or more of the road is not lost.
  if (!smoke && engine.world.now - before >= SAVE_AFTER_MINUTES) {
    minutesSinceSave = 0
    keep('auto')
  }
  return reply(outputs)
})

handle('engine:page', (_event, id: unknown) => engine?.page(String(id)))
// The transcript's settings (M10.4): on or off, and the folder.
handle('transcript:get', () => transcriptSettings())
// A folder the player chose in the dialog this session (M10.19): the page may only name one of these, the current one or none.
const chosenFolders = new Set<string>()
handle('transcript:set', (_event, enabled: unknown, folder: unknown) => {
  const asked = String(folder ?? '')
  const settings = { enabled: Boolean(enabled), folder: asked && (chosenFolders.has(asked) || asked === transcriptSettings().folder) ? asked : transcriptSettings().folder }
  saveTranscriptSettings(settings)
  scribe().configure(settings)
  return settings
})
handle('transcript:choose', async () => {
  const chosen = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'], defaultPath: transcriptSettings().folder })
  if (!chosen.canceled && chosen.filePaths[0]) chosenFolders.add(chosen.filePaths[0])
  return chosen.canceled ? undefined : chosen.filePaths[0]
})
// Under the bonnet (M10.1): a production build does not bundle the dev view at all.
if (import.meta.env.DEV) {
  handle('dev:view', async (_event, section: unknown, focus: unknown) => {
    if (!engine || app.isPackaged) return undefined
    const { devView } = await import('../engine/dev')
    return devView(engine, String(section) as 'people' | 'background' | 'chronicler', typeof focus === 'string' ? focus : undefined)
  })
}
handle('engine:creation', () => engine?.creationData())
/** The end view shows the last lines; the whole log goes to a file with [Download]. */
const END_LINES = 2000

handle('engine:end', () => {
  const lines = session ? journal().recent(session, END_LINES) : undefined
  const cut = lines && lines.length === END_LINES ? `(Only the last ${END_LINES} lines are shown here. [Download] saves the whole log.)\n\n` : ''
  return { log: lines ? cut + lines.map((row) => format(row, journal().calendar)).join('\n') : undefined, chronicle: engine?.chronicle() ?? '' }
})
handle('engine:log-size', (_event, scope: unknown) => (session ? journal().size(session, logScope(scope)) : 0))
handle('engine:export-log', (_event, scope: unknown) => (session ? exportLog(session, logScope(scope)) : undefined))
// What happened in this game, as Markdown (M10.18): per save, never in the content.
handle('engine:export-chronicle', async () => {
  if (!engine) return undefined
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  const result = await dialog.showSaveDialog(window!, { title: 'Save the chronicle of this game', defaultPath: join(app.getPath('documents'), `wisplight-chronicle-${stamp}.md`), filters: [{ name: 'Markdown', extensions: ['md'] }] })
  if (result.canceled || !result.filePath) return undefined
  writeFileSync(result.filePath, engine.chronicleMarkdown(), 'utf8')
  return result.filePath
})

function logScope(value: unknown): LogScope {
  const v = value as Partial<{ kind: string; days: number }> | undefined
  if (v?.kind === 'loaded') return { kind: 'loaded' }
  if (v?.kind === 'days') return { kind: 'days', days: Math.max(1, Math.min(3650, Math.floor(Number(v.days)) || 7)) }
  return { kind: 'all' }
}

/**
 * Asks where to save a copy of the game log and streams it there. Up to 10 MB
 * it is one text file; larger, a zip with parts of 10 MB that each open quickly.
 */
async function exportLog(where: Session, scope: LogScope = { kind: 'all' }): Promise<string | undefined> {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  const zip = journal().size(where, scope) > PART_BYTES
  const result = await dialog.showSaveDialog(window!, {
    title: 'Save a copy of the game log',
    defaultPath: join(app.getPath('documents'), `wisplight-log-${stamp}.${zip ? 'zip' : 'txt'}`),
    filters: [zip ? { name: 'Zip with text files', extensions: ['zip'] } : { name: 'Text', extensions: ['txt'] }],
  })
  if (result.canceled || !result.filePath) return undefined
  journal().exportTo(where, result.filePath, scope)
  return result.filePath
}

// ---------------------------------------------------------------- the world builder (development builds only)

const contentDir = () => (builderCheck ? join(builderCheck, 'content') : join(app.getAppPath(), 'content'))

/** The running game carries on with the new content, keeping its log. */
/** Plays on with changed content. Only a change the file watcher saw is announced, with its file (M10.4). */
function adopt(next: Content, file?: string): void {
  content = next
  worldContents.set(worldFolder, next)
  if (engine) follow(engine.withContent(next), session ?? ensureSession())
  if (window && !window.isDestroyed()) window.webContents.send('builder:reloaded', file ? { file } : {})
}

// ---------------------------------------------------------------- the editor (M8; development builds only)

// npm run editor opens only the editor; in a development build the game has a link to it too.
const editorMode = process.env['npm_lifecycle_event'] === 'editor' || process.argv.includes('--editor')
let editorWindow: BrowserWindow | undefined

function devOnly(): ContentEditor {
  if (app.isPackaged) throw new Error('The editor is part of the development build (npm run editor).')
  return new ContentEditor(contentDir())
}
const kindOf = (value: unknown): EntityKind => {
  if (!ENTITY_KINDS.includes(value as EntityKind)) throw new Error('Unknown kind.')
  return value as EntityKind
}
const worldOf = (value: unknown): string => {
  const world = String(value ?? '')
  if (!/^[a-z0-9_-]+$/.test(world)) throw new Error('Unknown world.')
  return world
}
const editsOf = (value: unknown): Edit[] => {
  if (!Array.isArray(value)) throw new Error('No edits.')
  return value.map((e: { kind?: unknown; id?: unknown; data?: unknown; file?: unknown }) => ({
    kind: kindOf(e.kind),
    id: String(e.id),
    ...(e.data && typeof e.data === 'object' ? { data: e.data as Record<string, unknown> } : {}),
    ...(e.file ? { file: String(e.file) } : {}),
  }))
}
/** A change as the editor shows it: the lines that differ. */
const shown = (changes: FileChange[]) => changes.map((c) => ({ path: c.path, fresh: c.before === undefined, lines: lineDiff(c.before ?? '', c.text) }))

/** After a save in the editor: the running game carries on with it, if it plays in that world. */
function afterEdit(world: string): void {
  worldContents.delete(world)
  // The world book is never behind the content (M10.18): written again on every save.
  void writeWorldBook(contentDir(), world).catch(() => undefined)
  if (world !== worldFolder || !engine) return
  loadContentFromDir(contentDir(), world)
    .then((next) => adopt(next))
    .catch(() => undefined)
}

handle('editor:worlds', () => devOnly().worlds())
// The world book (M10.18): written next to the content, and saved as HTML with the pictures there are.
handle('editor:worldbook', async (_event, world: unknown) => {
  devOnly()
  const folder = worldOf(world)
  await writeWorldBook(contentDir(), folder)
  const markdown = await worldBookFor(contentDir(), folder)
  const result = await dialog.showSaveDialog({ title: 'Save the world book', defaultPath: join(app.getPath('documents'), `${folder}-worldbook.html`), filters: [{ name: 'Web page', extensions: ['html'] }] })
  if (result.canceled || !result.filePath) return { markdown }
  // The whole world as the atlas page (M10.20, approved by Bram): secrets and all, so the designer's, never the player's.
  writeFileSync(result.filePath, await worldAtlasFor(contentDir(), folder, app.getPath('userData')), 'utf8')
  return { markdown, saved: result.filePath }
})
handle('editor:view', (_event, world: unknown) => devOnly().view(worldOf(world)))
handle('editor:entity', (_event, world: unknown, kind: unknown, id: unknown) => devOnly().entity(worldOf(world), kindOf(kind), String(id)))
handle('editor:save', async (_event, world: unknown, edits: unknown, write: unknown) => {
  const editor = devOnly()
  ignoreWatchUntil = Date.now() + 1500
  const outcome = await editor.save(worldOf(world), editsOf(edits), write !== false)
  if (outcome.ok && write !== false && outcome.changes.length) afterEdit(worldOf(world))
  return { ok: outcome.ok, problems: outcome.problems, warnings: outcome.warnings, changes: shown(outcome.changes) }
})
handle('editor:new-world', (_event, folder: unknown, name: unknown) => devOnly().createWorld(String(folder ?? ''), String(name ?? '')))
handle('editor:simulate', (_event, world: unknown, days: unknown, seed: unknown) => devOnly().simulate(worldOf(world), Number(days) || 7, Number(seed) || 1))
handle('editor:draft', async (_event, world: unknown, ask: unknown, focus: unknown) => {
  devOnly()
  await setup()
  const llm = ai?.client()
  if (!llm) return { say: '', questions: [], changes: [], problems: ["The chronicler writes the proposals: connect a model in the game's Settings > AI first."], diffs: [] }
  const files = await readContentFiles(contentDir(), worldOf(world))
  const at = focus && typeof focus === 'object' ? (focus as { kind?: unknown; id?: unknown }) : undefined
  const request = draftRequest(files, String(ask ?? '').slice(0, 2000), at?.kind && at.id ? { kind: kindOf(at.kind), id: String(at.id) } : undefined)
  try {
    return shownDraft(readDraft(files, (await llm.complete(request)).text))
  } catch (error) {
    return { say: '', questions: [], changes: [], problems: [`The chronicler did not answer: ${error instanceof Error ? error.message : String(error)}`], diffs: [] }
  }
})
/** A proposal as the editor shows it: what the chronicler says, and the files as diffs. */
const shownDraft = (draft: ReturnType<typeof readDraft>) => ({
  say: draft.say,
  questions: draft.questions,
  changes: draft.changes,
  ...(draft.world ? { world: draft.world } : {}),
  ...(draft.files ? { files: draft.files } : {}),
  problems: draft.problems,
  diffs: draft.result?.ok ? shown(draft.result.changes) : [],
})
// A step of building a world with the chronicler (M10.17), and saving what the designer accepts.
handle('editor:world-step', async (_event, world: unknown, step: unknown, said: unknown) => {
  devOnly()
  await setup()
  const llm = ai?.client()
  if (!llm) return { say: '', questions: [], changes: [], problems: ["The chronicler builds the world with you: connect a model in the game's Settings > AI first."], diffs: [] }
  const files = await readContentFiles(contentDir(), worldOf(world))
  try {
    // A whole chapter with tables fits (M10.20: Bram's chapters are longer than 4000 characters).
    return shownDraft(readDraft(files, (await llm.complete(worldStepRequest(files, String(step ?? ''), String(said ?? '').slice(0, 20000)))).text))
  } catch (error) {
    return { say: '', questions: [], changes: [], problems: [`The chronicler did not answer: ${error instanceof Error ? error.message : String(error)}`], diffs: [] }
  }
})
// A proposal that did not load, put right (M10.20): the problems go back to the chronicler, and only what it corrects comes back.
handle('editor:world-fix', async (_event, world: unknown, step: unknown, said: unknown, draft: unknown, problems: unknown) => {
  devOnly()
  await setup()
  const llm = ai?.client()
  const d = (draft && typeof draft === 'object' ? draft : {}) as { say?: unknown; questions?: unknown; changes?: unknown; world?: unknown; files?: unknown }
  const proposal = {
    say: String(d.say ?? ''),
    questions: (Array.isArray(d.questions) ? d.questions : []).map(String),
    changes: (Array.isArray(d.changes) ? d.changes : []).map((c: { kind?: unknown; id?: unknown; yaml?: unknown; merge?: unknown }) => ({ kind: kindOf(c.kind), id: String(c.id), yaml: String(c.yaml ?? ''), ...(c.merge === true ? { merge: true } : {}) })),
    ...(typeof d.world === 'string' ? { world: d.world } : {}),
    files: (Array.isArray(d.files) ? d.files : []).map((f: { path?: unknown; text?: unknown }) => ({ path: String(f.path ?? ''), text: String(f.text ?? '') })),
  }
  const why = (Array.isArray(problems) ? problems : []).map(String)
  if (!llm) return { ...proposal, problems: ["The chronicler puts it right: connect a model in the game's Settings > AI first.", ...why], diffs: [] }
  const files = await readContentFiles(contentDir(), worldOf(world))
  try {
    return shownDraft(mergeFix(files, proposal, (await llm.complete(worldFixRequest(files, String(step ?? ''), String(said ?? '').slice(0, 20000), proposal, why))).text))
  } catch (error) {
    return { ...proposal, problems: [`The chronicler did not answer: ${error instanceof Error ? error.message : String(error)}`, ...why], diffs: [] }
  }
})
// What a world build may spend and has spent, per step (M10.20): read it, set the limit, or count from zero.
handle('editor:build', async (_event, world: unknown, change: unknown) => {
  devOnly()
  await setup()
  const w = worldOf(world)
  const builds = service().builds
  const c = (change && typeof change === 'object' ? change : {}) as { limit?: unknown; reset?: unknown }
  if (c.reset === true) return { ...builds.reset(w), adjusted: false }
  if (typeof c.limit === 'number') {
    const set = builds.setLimit(w, c.limit)
    return { ...set.view, adjusted: set.adjusted }
  }
  return { ...builds.view(w), adjusted: false }
})
// Enhance with AI (after M10.17): the designer's answer to a step, written out as a fuller brief; nothing is saved.
handle('editor:enhance', async (_event, world: unknown, step: unknown, said: unknown) => {
  devOnly()
  await setup()
  const llm = ai?.client()
  if (!llm) return { brief: '', open: [], problems: ["The chronicler writes it out with you: connect a model in the game's Settings > AI first."] }
  const files = await readContentFiles(contentDir(), worldOf(world))
  try {
    return readEnhance((await llm.complete(enhanceRequest(files, String(step ?? ''), String(said ?? '').slice(0, 20000)))).text)
  } catch (error) {
    return { brief: '', open: [], problems: [`The chronicler did not answer: ${error instanceof Error ? error.message : String(error)}`] }
  }
})
// The design log of a world (M10.18): read it, or write one change (a note, an answer being written, a decision).
handle('editor:design', async (_event, world: unknown, change: unknown) => {
  devOnly()
  const files = await readContentFiles(contentDir(), worldOf(world))
  const checked = change === undefined ? undefined : readDesignChange(change)
  const next = designUpdate(files, checked)
  if (!next) return { notes: [], answers: {}, decisions: [] }
  if (checked) {
    ignoreWatchUntil = Date.now() + 1500
    writeFileSync(join(contentDir(), next.path), next.text, 'utf8')
  }
  return next.log
})
handle('editor:save-draft', async (_event, world: unknown, draft: unknown) => {
  devOnly()
  const d = (draft && typeof draft === 'object' ? draft : {}) as { changes?: unknown; world?: unknown; files?: unknown }
  const files = await readContentFiles(contentDir(), worldOf(world))
  const changes = (Array.isArray(d.changes) ? d.changes : []).map((c: { kind?: unknown; id?: unknown; yaml?: unknown; merge?: unknown }) => ({ kind: kindOf(c.kind), id: String(c.id), yaml: String(c.yaml ?? ''), ...(c.merge === true ? { merge: true } : {}) }))
  const whole = (Array.isArray(d.files) ? d.files : []).map((f: { path?: unknown; text?: unknown }) => ({ path: String(f.path ?? ''), text: String(f.text ?? '') }))
  const outcome = draftResult(files, { changes, ...(typeof d.world === 'string' ? { world: d.world } : {}), files: whole })
  if (!outcome.ok) return { ok: false, problems: outcome.problems, warnings: [], changes: [] }
  ignoreWatchUntil = Date.now() + 1500
  for (const change of outcome.changes) {
    mkdirSync(dirname(join(contentDir(), change.path)), { recursive: true })
    writeFileSync(join(contentDir(), change.path), change.text, 'utf8')
  }
  if (outcome.changes.length) afterEdit(worldOf(world))
  return { ok: true, problems: [], warnings: [], changes: shown(outcome.changes) }
})
// The palette of a world's map (M10): read, written into world.yaml, or proposed by the writing aid.
handle('editor:palette', async (_event, world: unknown, palette: unknown) => {
  devOnly()
  const files = await readContentFiles(contentDir(), worldOf(world))
  const parsed = palette ? MapPaletteSchema.safeParse(palette) : undefined
  return paletteView(files, parsed?.success ? parsed.data : undefined)
})
handle('editor:save-palette', async (_event, world: unknown, palette: unknown) => {
  devOnly()
  const files = await readContentFiles(contentDir(), worldOf(world))
  const outcome = savePalette(files, palette as MapPalette)
  if (!outcome.ok) return { ok: false, problems: outcome.problems, warnings: [], changes: [] }
  ignoreWatchUntil = Date.now() + 1500
  for (const change of outcome.changes) writeFileSync(join(contentDir(), change.path), change.text, 'utf8')
  afterEdit(worldOf(world))
  return { ok: true, problems: [], warnings: [], changes: shown(outcome.changes) }
})
handle('editor:propose-palette', async (_event, world: unknown, ask: unknown) => {
  devOnly()
  await setup()
  const llm = ai?.client()
  if (!llm) return { say: '', problems: ["The writing aid needs a model: connect one in the game's Settings > AI first."] }
  const files = await readContentFiles(contentDir(), worldOf(world))
  try {
    return readPalette((await llm.complete(paletteRequest(files, String(ask ?? '').slice(0, 1000)))).text)
  } catch (error) {
    return { say: '', problems: [`The writing aid did not answer: ${error instanceof Error ? error.message : String(error)}`] }
  }
})
// The voice kit of a world (M10.10): read, written into its file, or proposed by the writing aid.
handle('editor:voice', async (_event, world: unknown) => {
  devOnly()
  return voiceYaml(await readContentFiles(contentDir(), worldOf(world)))
})
handle('editor:save-voice', async (_event, world: unknown, yaml: unknown) => {
  devOnly()
  const files = await readContentFiles(contentDir(), worldOf(world))
  const outcome = saveVoice(files, String(yaml ?? ''))
  if (!outcome.ok) return { ok: false, problems: outcome.problems, warnings: [], changes: [] }
  ignoreWatchUntil = Date.now() + 1500
  for (const change of outcome.changes) {
    mkdirSync(dirname(join(contentDir(), change.path)), { recursive: true })
    writeFileSync(join(contentDir(), change.path), change.text, 'utf8')
  }
  afterEdit(worldOf(world))
  return { ok: true, problems: [], warnings: [], changes: shown(outcome.changes) }
})
handle('editor:propose-voice', async (_event, world: unknown, ask: unknown) => {
  devOnly()
  await setup()
  const llm = ai?.client()
  if (!llm) return { say: '', problems: ["The writing aid needs a model: connect one in the game's Settings > AI first."] }
  const files = await readContentFiles(contentDir(), worldOf(world))
  try {
    return readVoice((await llm.complete(voiceRequest(files, String(ask ?? '').slice(0, 1000)))).text)
  } catch (error) {
    return { say: '', problems: [`The writing aid did not answer: ${error instanceof Error ? error.message : String(error)}`] }
  }
})
handle('editor:open', () => {
  devOnly()
  openEditor()
})

function openEditor(): void {
  if (editorWindow && !editorWindow.isDestroyed()) {
    editorWindow.focus()
    return
  }
  editorWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Wisplight editor',
    backgroundColor: '#12140f',
    show: !smoke,
    webPreferences: {
      // Sandboxed (M10.19): the page and its preload have no Node; the preload is CommonJS for that.
      preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
      contextIsolation: true,
      sandbox: true,
    },
  })
  keepHome(editorWindow)
  // WISPLIGHT_SMOKE=1 with --editor: open the editor hidden, print what it shows of a world and a place, quit.
  if (smoke) {
    editorWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const seen: string = await editorWindow!.webContents.executeJavaScript(
          `(async () => {
            const head = document.querySelector('.editor-head')?.innerText.replace(/\\s+/g, ' ') ?? 'NO EDITOR'
            const place = await window.wisplight.editor.entity('isle', 'location', 'loc_skerrow_harbour')
            return head + ' | ' + (place ? place.file : 'NO ENTITY')
          })()`,
        )
        smokeSay(`[smoke-editor] ${seen}`)
        app.quit()
      }, 1500)
    })
  }
  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) void editorWindow.loadURL(`${devServer}?editor=1`)
  else void editorWindow.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)), { search: 'editor=1' })
}

// Live reloading (FO, chapter 15): a content file changed outside the app is loaded at once.
let ignoreWatchUntil = 0
let reloadTimer: NodeJS.Timeout | undefined
function watchContent(): void {
  if (app.isPackaged || smoke || checking) return
  try {
    watch(contentDir(), { recursive: true }, (_type, file) => {
      if (!file || !/\.ya?ml$|CHRONICLER\.md$/.test(String(file)) || Date.now() < ignoreWatchUntil) return
      clearTimeout(reloadTimer)
      // Another world's files: forget it, so it loads fresh when it is played next.
      const changed = String(file).split(/[\\/]/)[0] ?? ''
      if (changed !== worldFolder && !/^CHRONICLER\.md$/.test(changed)) {
        worldContents.delete(changed)
        return
      }
      if (changed === 'CHRONICLER.md') worldContents.clear()
      reloadTimer = setTimeout(() => {
        loadContentFromDir(contentDir(), worldFolder)
          .then((next) => adopt(next, String(file).replace(/\\/g, '/')))
          .catch((error: unknown) => {
            const problems = error instanceof ContentError ? error.problems.slice(0, 5).join('; ') : String(error)
            if (window && !window.isDestroyed()) window.webContents.send('builder:problem', `The content did not load after ${String(file)} changed: ${problems}`)
          })
      }, 300)
    })
  } catch {
    // Watching is a convenience; without it, restart the app to see changes.
  }
}

ipcMain.on('engine:activity', (event) => {
  if (!fromApp(event)) return
  lastInput = Date.now()
})

ipcMain.on('engine:hold', (event, ...args: unknown[]) => {
  if (!fromApp(event)) return
  // A send has nobody to answer: what does not fit is dropped, never thrown in the main process.
  let on: unknown
  try {
    ;[on] = checkInput('engine:hold', args)
  } catch {
    return
  }
  // Closing a menu counts as activity; the first "no menu" at start-up does not start the clock.
  if (held && !on) lastInput = Date.now()
  held = Boolean(on)
})

// Settings > AI. Keys go in, never out: the window only ever sees them masked.
function service(): AiService {
  if (!ai) throw new Error('The game is still starting.')
  return ai
}
const provider = (value: unknown): ProviderId => {
  if (value !== 'openai' && value !== 'anthropic') throw new Error('Unknown provider.')
  return value
}
const role = (value: unknown): ChosenRole => {
  if (value !== 'voice' && value !== 'brain' && value !== 'chronicler') throw new Error('Unknown role.')
  return value
}
const amount = (value: unknown): number | undefined => (value === null || value === undefined || value === '' ? undefined : Number(value))

handle('ai:overview', async () => {
  await setup()
  return service().overview()
})
handle('ai:connect', async (_event, id: unknown, key: unknown) => {
  const models = await service().connect(provider(id), String(key ?? ''))
  // A new key may see other models: check the chosen ones again.
  await service().refreshModels()
  return { models: models.length }
})
handle('ai:disconnect', (_event, id: unknown) => {
  service().disconnect(provider(id))
  engine?.setLlm(service().client())
})
handle('ai:models', (_event, id: unknown) => service().listModels(provider(id), true))
handle('ai:refresh', () => service().refreshModels())
handle('ai:advise', (_event, id: unknown) => service().advise(provider(id)))
handle('ai:trial', (_event, id: unknown, model: unknown, which: unknown) => service().trial(provider(id), String(model), role(which)))
handle('ai:compare', (_event, which: unknown, choices: unknown) =>
  service().compare(role(which), (Array.isArray(choices) ? choices : []).map((c: { provider?: unknown; model?: unknown }) => ({ provider: provider(c?.provider), model: String(c?.model) }))),
)
handle('ai:choose', async (_event, which: unknown, id: unknown, model: unknown) => {
  const stored = await service().choose(role(which), provider(id), String(model))
  engine?.setLlm(service().client())
  return stored
})
handle('ai:budget', (_event, usd: unknown) => service().settings.setBudget(Number(usd)))
handle('ai:reply-within', (_event, seconds: unknown) => service().settings.setReplyWithin(Number(seconds)))
handle('ai:month-budget', (_event, usd: unknown) => service().usage.setMonthBudget(amount(usd)))
handle('ai:credit', (_event, id: unknown, usd: unknown) => service().usage.setCredit(provider(id), amount(usd)))
handle('ai:csv', () => service().usage.csv())
// Up to all the log keeps (M10.10): the guard's count per model reads them all; the table shows the last 50.
handle('ai:log', () => service().recentLog(200))
handle('ai:billing', (_event, id: unknown) => shell.openExternal(BILLING[provider(id)]))
// Pictures of places and people (after the M7 playtest): made once, kept in the user data folder.
handle('ai:image-models', (_event, id: unknown) => service().imageModels(provider(id)))
handle('ai:pictures', (_event, id: unknown, model: unknown, quality: unknown) =>
  service().choosePictures(id === null ? undefined : { provider: provider(id), model: String(model), quality: quality === 'medium' ? 'medium' : 'low' }),
)
handle('ai:try-picture', async (_event, id: unknown, model: unknown) => {
  await setup()
  return service().tryPicture(content!, provider(id), String(model))
})
handle('engine:picture', async (_event, id: unknown) => {
  await setup()
  if (!content || typeof id !== 'string') return undefined
  return service().picture(content, id)
})

// The real-time clock.
/** The chronicler writes in the background; the game never waits for it (design, "Wanneer hij schrijft"). */
function chronicler(): void {
  // Goal choices and chronicler runs: the game never waits for them.
  if (engine && engine.modelsWaiting > 0) void engine.runModels().catch(() => undefined)
}

setInterval(() => {
  if (!engine || !window || window.isDestroyed() || paused()) return
  const outputs = engine.tick(1)
  chronicler()
  window.webContents.send('engine:tick', reply(outputs))
  if (!smoke && ++minutesSinceSave >= AUTOSAVE_EVERY) {
    minutesSinceSave = 0
    keep('auto')
  }
}, 1000)

function createWindow(): void {
  window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Wisplight',
    backgroundColor: '#12140f',
    show: !smoke && !logCheck && !builderCheck,
    webPreferences: {
      // Sandboxed (M10.19): the page and its preload have no Node; the preload is CommonJS for that.
      preload: fileURLToPath(new URL('../preload/index.cjs', import.meta.url)),
      contextIsolation: true,
      sandbox: true,
    },
  })
  keepHome(window)

  // WISPLIGHT_SMOKE=1: start hidden, pick a world (WISPLIGHT_SMOKE=isle for another), print the first room the interface shows, quit.
  if (smoke) {
    const world = /^[a-z0-9_-]+$/.test(process.env['WISPLIGHT_SMOKE'] ?? '') && process.env['WISPLIGHT_SMOKE'] !== '1' ? process.env['WISPLIGHT_SMOKE']! : 'base'
    window.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const room: string = await window!.webContents.executeJavaScript(
          `(async () => {
            const pick = document.querySelector('.worlds [data-world="${world}"]')
            if (pick) pick.click()
            // Up to ten seconds for the first room (WISPLIGHT_SMOKE_WAIT_MS for more: an Intel build under Rosetta translates itself on its first start).
            const started = Date.now()
            while (!document.querySelector('.line.room') && Date.now() - started < ${Number(process.env['WISPLIGHT_SMOKE_WAIT_MS']) || 10000}) await new Promise((r) => setTimeout(r, 100))
            const room = document.querySelector('.line.room')?.textContent ?? 'NO ROOM RENDERED: ' + document.body.innerText.replace(/\\s+/g, ' ').slice(0, 300)
            return room.split('\\n')[0] + ' (after ' + (Date.now() - started) + ' ms)'
          })()`,
        )
        smokeSay(`[smoke] ${room}`)
        // Saving (M9.3): a checkpoint and a tail, in a store of its own, load as exactly the same world.
        if (engine && content) {
          const dir = mkdtempSync(join(tmpdir(), 'wisplight-smoke-'))
          try {
            const trial = new SaveStore(join(dir, 'saves.sqlite'))
            trial.save('smoke', engine.saved())
            engine.tick(30)
            trial.save('smoke', engine.saved())
            const back = await Engine.restore(content, trial.load('smoke')!)
            const same = JSON.stringify(back.state) === JSON.stringify(engine.state)
            smokeSay(`[smoke] save and load ${same ? 'exact' : 'DIFFERENT'} (${trial.sizes().checkpoints} checkpoint)`)
            // What the player has found out (M10.20): the page is made, with the land as seen.
            const found = discoveredAtlasHtml(engine)
            smokeSay(`[smoke] what you found out: ${(found.match(/<h2>/g) ?? []).length} chapters${found.includes('class="region"') ? ', with the land as seen' : ''}`)
            trial.close()
          } finally {
            rmSync(dir, { recursive: true, force: true })
          }
        }
        // Under the bonnet (M10.1): a production build has no dev menu, no bridge to it, and no trace of it in its files.
        if (!import.meta.env.DEV) {
          const opened: boolean = await window!.webContents.executeJavaScript(
            `(async () => {
              const input = document.querySelector('input[aria-label="Command"]')
              if (input) {
                const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
                set.call(input, '@dev')
                input.dispatchEvent(new Event('input', { bubbles: true }))
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
                await new Promise((r) => setTimeout(r, 500))
              }
              return Boolean(window.wisplight.dev) || Boolean(document.querySelector('[data-dev-menu]'))
            })()`,
          )
          const assets = join(app.getAppPath(), 'out', 'renderer', 'assets')
          const traces = existsSync(assets) ? readdirSync(assets).filter((f) => readFileSync(join(assets, f), 'utf8').includes('data-dev-menu')) : []
          smokeSay(`[smoke] dev menu ${opened || traces.length ? `PRESENT${traces.length ? ` in ${traces.join(', ')}` : ''}` : 'absent'}`)
        }
        // The window is sandboxed, without Node, and a path where a world name belongs is refused (M10.19).
        const gate: string = await window!.webContents.executeJavaScript(
          `(async () => {
            const node = typeof require !== 'undefined' || typeof process !== 'undefined'
            const refused = await window.wisplight.start('../../etc').then(() => false, (e) => /Refused input on engine:start/.test(String(e)))
            // A save with a name, and the list the world picker shows (M10.20).
            await window.wisplight.command('save smoke')
            const [kept] = await window.wisplight.saves.list()
            const saves = kept ? 'saved "' + kept.name + '" at ' + (kept.about ? kept.about.place : 'NOWHERE') : 'NO SAVE LISTED'
            return (node ? 'NODE IN THE PAGE' : 'no node') + ', ' + (refused ? 'a path for a world refused' : 'A PATH FOR A WORLD ACCEPTED') + ', ' + saves
          })()`,
        )
        smokeSay(`[smoke] sandbox ${(window!.webContents as unknown as { getLastWebPreferences?: () => { sandbox?: boolean } | null }).getLastWebPreferences?.()?.sandbox ? 'on' : 'OFF'}, ${gate}`)
        app.quit()
      }, 1500)
    })
  }

  if (builderCheck) {
    window.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const result: string = await window!.webContents.executeJavaScript(BUILDER_CHECK_SCRIPT)
        console.log(`[builder-check]\n${result}`)
        rmSync(builderCheck, { recursive: true, force: true })
        app.exit(0)
      }, 1500)
    })
  }

  if (logCheck) {
    window.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const result: string = await window!.webContents.executeJavaScript(LOG_CHECK_SCRIPT)
        console.log(`[log-check]\n${result}`)
        unfollow?.()
        gamelog?.close()
        saves?.close()
        rmSync(logCheck, { recursive: true, force: true })
        app.exit(0)
      }, 1500)
    })
  }

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) void window.loadURL(devServer)
  else void window.loadFile(fileURLToPath(new URL('../renderer/index.html', import.meta.url)))
}

void app.whenReady().then(async () => {
  // Handed over to the app that already runs: nothing to open here.
  if (handedOver) return
  if (picturing) {
    const worlds = await listWorlds(contentDir())
    const contents = await Promise.all(worlds.map((w) => loadContentFromDir(contentDir(), w.folder)))
    const service = new AiService({ dir: playerData, cipher, content: contents[0]! })
    const ok = await picturesRun(service, contents, Number(picturing) || 5).catch((error: unknown) => {
      console.log(`[pictures] stopped: ${error instanceof Error ? error.message : String(error)}`)
      return false
    })
    app.exit(ok ? 0 : 1)
    return
  }
  if (checking) {
    await setup()
    const ok = await (process.env['WISPLIGHT_KEY_CHECK'] ? keyCheck(app, ai!, content!) : aiCheck(ai!, content!)).catch((error: unknown) => {
      console.log(`[check] stopped: ${error instanceof Error ? error.message : String(error)}`)
      return false
    })
    app.exit(ok ? 0 : 1)
    return
  }
  if (editorMode) openEditor()
  else createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) (editorMode ? openEditor : createWindow)()
  })
})

app.on('window-all-closed', () => {
  if (engine && session && !smoke) keep('auto')
  if (process.platform !== 'darwin') app.quit()
})
