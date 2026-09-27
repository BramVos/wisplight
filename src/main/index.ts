import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { rmSync, watch, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ContentError, Engine, type Content, type Output, type SaveData } from '../engine'
import { builderData, saveChange } from '../node/builder'
import type { ProviderId } from '../node/ai/providers'
import { AiService } from '../node/ai/service'
import type { ChosenRole, Cipher } from '../node/ai/settings'
import { DEFAULT_WORLD, listWorlds, loadContentFromDir } from '../node/content'
import { format, GameLog, type Session } from '../node/gamelog'
import { SaveStore } from '../node/savegame'
import { aiCheck, BUILDER_CHECK_SCRIPT, keyCheck, LOG_CHECK_SCRIPT, prepareBuilderCheck, prepareKeyCheck, prepareLogCheck } from './checks'

// The engine runs in the main process for now; the design moves it to a
// utility process once the simulation grows (FO, chapter 3).
//
// Hybrid clock (FO, chapter 3): outside conversations and menus, one real
// second is one game minute. The clock pauses after 60 seconds without input.

const IDLE_PAUSE_MS = 60_000
const AUTOSAVE_EVERY = 10

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
const checking = Boolean(process.env['WISPLIGHT_AI_CHECK'] || process.env['WISPLIGHT_KEY_CHECK'])
if (process.env['WISPLIGHT_KEY_CHECK']) prepareKeyCheck(app)
const logCheck = process.env['WISPLIGHT_LOG_CHECK'] ? prepareLogCheck(app) : undefined
const builderCheck = process.env['WISPLIGHT_BUILDER_CHECK'] ? prepareBuilderCheck(app) : undefined

// API keys are encrypted with the operating system's key store before they reach the disk.
const cipher: Cipher = {
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
    coolingDown: status.coolingDown,
    budgetSpent: status.monthBudgetSpent || status.hourSpentUsd >= status.hourBudgetUsd,
  }
}

function reply(outputs: Output[]) {
  return { outputs, status: { ...engine!.status(), paused: paused(), ai: aiStatus() } }
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
  unfollow = next.onLog((line) => journal().write(where, line))
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

function snapshot(): SaveData {
  const where = ensureSession()
  return { ...engine!.save(), session: { ...where, logId: journal().position(where) } }
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

ipcMain.handle('engine:worlds', async () => (await listWorlds(contentDir())).map((w) => ({ ...w, current: w.folder === worldFolder })))

ipcMain.handle('engine:start', async (_event, world: unknown) => {
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
  if (store().latest()) outputs.push(system('There is a saved game. Type CONTINUE to carry on exactly where you left off, LOAD for your last save, or NEW STRANGER to start a new character in that world (big events stay, small news is forgotten).'))
  return reply(outputs)
})

ipcMain.handle('engine:command', async (_event, input: unknown) => {
  if (!engine || !content) throw new Error('Engine not started')
  lastInput = Date.now()
  const text = String(input).trim().slice(0, 500)
  // Only the bare command: "Save me!" in a conversation is something to say, not a menu action.
  const command = /^(save|bewaar|continue|verder|load|laad|log|logboek)(?:\s+(\d+|export))?$/i.exec(text)
  const verb = command?.[1]?.toLowerCase()
  const args = command?.[2] ? [command[2].toLowerCase()] : []
  if (verb === 'save' || verb === 'bewaar') {
    journal().append(ensureSession(), engine.world.now, 'note', 'Game saved')
    store().save('manual', snapshot())
    return reply([system('Game saved.')])
  }
  if (verb === 'continue' || verb === 'verder') {
    const data = store().latest()
    if (!data) return reply([{ kind: 'error', text: 'There is no saved game yet.' }])
    const gone = await useWorldOf(data)
    if (gone) return reply([{ kind: 'error', text: gone }])
    if (!data.session) {
      follow(Engine.fromSave(content, data, ai?.client()), journal().start(randomUUID()))
    } else {
      // The last save plus everything the log recorded after it: exactly where the game stopped.
      const tail = journal().tail(data.session, data.session.logId)
      const where = { game: data.session.game, branch: data.session.branch }
      follow(await Engine.resume(content, data, tail, ai?.client()), where)
      journal().append(where, engine.world.now, 'note', 'Continued')
    }
    return reply([system('You pick up where you left off.'), ...(await engine.handle('look'))])
  }
  if (/^(new stranger|carry on|nieuwe vreemdeling)$/i.test(text)) {
    // The same world with a new character (M7.2).
    const data = store().latest()
    if (!data) return reply([{ kind: 'error', text: 'There is no saved world to carry on in.' }])
    const gone = await useWorldOf(data)
    if (gone) return reply([{ kind: 'error', text: gone }])
    const { engine: next, outputs } = Engine.carryOn(content, data, Math.floor(Math.random() * 2 ** 31), ai?.client())
    next.builder = !app.isPackaged
    follow(next, journal().start(randomUUID()))
    return reply(outputs)
  }
  if (verb === 'load' || verb === 'laad') {
    const data = store().load('manual') ?? store().load('auto')
    if (!data) return reply([{ kind: 'error', text: 'There is no saved game yet.' }])
    const gone = await useWorldOf(data)
    if (gone) return reply([{ kind: 'error', text: gone }])
    const loaded = Engine.fromSave(content, data, ai?.client())
    if (!data.session) {
      follow(loaded, journal().start(randomUUID()))
    } else {
      const from = { game: data.session.game, branch: data.session.branch }
      // Anything that happened after this save stays in the log, on its own branch.
      const where = journal().position(from) > data.session.logId ? journal().fork(from, data.session.logId) : from
      follow(loaded, where)
      journal().append(where, loaded.world.now, 'note', `Loaded the save of ${new Date((data as { createdAt?: string }).createdAt ?? Date.now()).toLocaleString('en-GB')}. What happened after it stays in the log.`)
      if (where !== from) store().save('auto', snapshot())
    }
    return reply([system('Game loaded.'), ...(await engine.handle('look'))])
  }
  if (verb === 'log' || verb === 'logboek') {
    const where = ensureSession()
    if (args[0] === 'export') {
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
      const result = await dialog.showSaveDialog(window!, { title: 'Save the game log', defaultPath: join(app.getPath('documents'), `wisplight-log-${stamp}.txt`) })
      if (result.canceled || !result.filePath) return reply([system('Not saved.')])
      writeFileSync(result.filePath, `${journal().text(where)}\n`)
      return reply([system(`The log is saved as ${result.filePath}.`)])
    }
    const lines = journal().recent(where, Math.min(500, Number(args[0]) || 30))
    return reply([system(lines.length ? lines.map(format).join('\n') : 'The log is empty.')])
  }
  ensureSession()
  const outputs = await engine.handle(text)
  chronicler()
  return reply(outputs)
})

ipcMain.handle('engine:page', (_event, id: unknown) => engine?.page(String(id)))
ipcMain.handle('engine:creation', () => engine?.creationData())
ipcMain.handle('engine:end', () => ({ log: session ? journal().text(session) : undefined, chronicle: engine?.chronicle() ?? '' }))

// ---------------------------------------------------------------- the world builder (development builds only)

const contentDir = () => (builderCheck ? join(builderCheck, 'content') : join(app.getAppPath(), 'content'))

/** The running game carries on with the new content, keeping its log. */
function adopt(next: Content): void {
  content = next
  worldContents.set(worldFolder, next)
  if (engine) follow(engine.withContent(next), session ?? ensureSession())
  if (window && !window.isDestroyed()) window.webContents.send('builder:reloaded')
}

ipcMain.handle('builder:data', async () => {
  if (app.isPackaged) throw new Error('The world builder is part of the development build.')
  return builderData(contentDir(), worldFolder)
})

ipcMain.handle('builder:save', async (_event, kind: unknown, id: unknown, patch: unknown) => {
  if (app.isPackaged) throw new Error('The world builder is part of the development build.')
  if (kind !== 'location' && kind !== 'npc' && kind !== 'region') throw new Error('Unknown kind.')
  ignoreWatchUntil = Date.now() + 1500
  const result = await saveChange(contentDir(), kind, String(id), (patch ?? {}) as Record<string, unknown>, worldFolder)
  if (result.ok && result.content) adopt(result.content)
  return { ok: result.ok, problems: result.problems, file: result.file }
})

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
          .then((next) => adopt(next))
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

ipcMain.on('engine:activity', () => {
  lastInput = Date.now()
})

ipcMain.on('engine:hold', (_event, on: unknown) => {
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

ipcMain.handle('ai:overview', async () => {
  await setup()
  return service().overview()
})
ipcMain.handle('ai:connect', async (_event, id: unknown, key: unknown) => {
  const models = await service().connect(provider(id), String(key ?? ''))
  // A new key may see other models: check the chosen ones again.
  await service().refreshModels()
  return { models: models.length }
})
ipcMain.handle('ai:disconnect', (_event, id: unknown) => {
  service().disconnect(provider(id))
  engine?.setLlm(service().client())
})
ipcMain.handle('ai:models', (_event, id: unknown) => service().listModels(provider(id), true))
ipcMain.handle('ai:refresh', () => service().refreshModels())
ipcMain.handle('ai:advise', (_event, id: unknown) => service().advise(provider(id)))
ipcMain.handle('ai:trial', (_event, id: unknown, model: unknown, which: unknown) => service().trial(provider(id), String(model), role(which)))
ipcMain.handle('ai:choose', async (_event, which: unknown, id: unknown, model: unknown) => {
  const stored = await service().choose(role(which), provider(id), String(model))
  engine?.setLlm(service().client())
  return stored
})
ipcMain.handle('ai:budget', (_event, usd: unknown) => service().settings.setBudget(Number(usd)))
ipcMain.handle('ai:month-budget', (_event, usd: unknown) => service().usage.setMonthBudget(amount(usd)))
ipcMain.handle('ai:credit', (_event, id: unknown, usd: unknown) => service().usage.setCredit(provider(id), amount(usd)))
ipcMain.handle('ai:csv', () => service().usage.csv())
ipcMain.handle('ai:log', () => service().recentLog(50))
ipcMain.handle('ai:billing', (_event, id: unknown) => shell.openExternal(BILLING[provider(id)]))
// Pictures of places and people (after the M7 playtest): made once, kept in the user data folder.
ipcMain.handle('ai:image-models', (_event, id: unknown) => service().imageModels(provider(id)))
ipcMain.handle('ai:pictures', (_event, id: unknown, model: unknown, quality: unknown) =>
  service().choosePictures(id === null ? undefined : { provider: provider(id), model: String(model), quality: quality === 'medium' ? 'medium' : 'low' }),
)
ipcMain.handle('ai:try-picture', async (_event, id: unknown, model: unknown) => {
  await setup()
  return service().tryPicture(content!, provider(id), String(model))
})
ipcMain.handle('engine:picture', async (_event, id: unknown) => {
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
    store().save('auto', snapshot())
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
      preload: fileURLToPath(new URL('../preload/index.mjs', import.meta.url)),
      contextIsolation: true,
      sandbox: false,
    },
  })

  // WISPLIGHT_SMOKE=1: start hidden, pick a world (WISPLIGHT_SMOKE=isle for another), print the first room the interface shows, quit.
  if (smoke) {
    const world = /^[a-z0-9_-]+$/.test(process.env['WISPLIGHT_SMOKE'] ?? '') && process.env['WISPLIGHT_SMOKE'] !== '1' ? process.env['WISPLIGHT_SMOKE']! : 'base'
    window.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const room: string = await window!.webContents.executeJavaScript(
          `(async () => {
            const pick = document.querySelector('.worlds [data-world="${world}"]')
            if (pick) {
              pick.click()
              await new Promise((r) => setTimeout(r, 1000))
            }
            return document.querySelector('.line.room')?.textContent ?? 'NO ROOM RENDERED'
          })()`,
        )
        console.log(`[smoke] ${room.split('\n')[0]}`)
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
  if (checking) {
    await setup()
    const ok = await (process.env['WISPLIGHT_KEY_CHECK'] ? keyCheck(app, ai!, content!) : aiCheck(ai!, content!)).catch((error: unknown) => {
      console.log(`[check] stopped: ${error instanceof Error ? error.message : String(error)}`)
      return false
    })
    app.exit(ok ? 0 : 1)
    return
  }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (engine && session && !smoke) store().save('auto', snapshot())
  if (process.platform !== 'darwin') app.quit()
})
