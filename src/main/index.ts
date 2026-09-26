import { app, BrowserWindow, ipcMain, safeStorage, shell } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Engine, type Content, type Output } from '../engine'
import type { ProviderId } from '../node/ai/providers'
import { AiService } from '../node/ai/service'
import type { Cipher } from '../node/ai/settings'
import { loadContentFromDir } from '../node/content'
import { SaveStore } from '../node/savegame'
import { aiCheck, keyCheck, prepareKeyCheck } from './checks'

// The engine runs in the main process for now; the design moves it to a
// utility process once the simulation grows (FO, chapter 3).
//
// Hybrid clock (FO, chapter 3): outside conversations and menus, one real
// second is one game minute. The clock pauses after 60 seconds without input.

const IDLE_PAUSE_MS = 60_000
const AUTOSAVE_EVERY = 10

let content: Content | undefined
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
    content = await loadContentFromDir(join(app.getAppPath(), 'content'))
    ai = new AiService({ dir: app.getPath('userData'), cipher, content })
  })()
  return ready
}

// The clock stands still in conversations and menus, and after a minute without input.
function paused(): boolean {
  return held || Boolean(engine?.state.talk) || Date.now() - lastInput > IDLE_PAUSE_MS
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

ipcMain.handle('engine:start', async () => {
  await setup()
  engine = new Engine(content!, { seed: Math.floor(Math.random() * 2 ** 31), llm: ai!.client() })
  lastInput = Date.now()
  const outputs = engine.start()
  if (store().load('manual') || store().load('auto')) {
    outputs.push({ kind: 'system', text: 'There is a saved game. Type LOAD to continue it, or just start playing.' })
  }
  return reply(outputs)
})

ipcMain.handle('engine:command', async (_event, input: unknown) => {
  if (!engine || !content) throw new Error('Engine not started')
  lastInput = Date.now()
  const text = String(input).trim().slice(0, 500)
  const verb = text.split(/\s+/)[0]?.toLowerCase()
  if (verb === 'save' || verb === 'bewaar') {
    store().save('manual', engine.save())
    return reply([{ kind: 'system', text: 'Game saved.' }])
  }
  if (verb === 'load' || verb === 'laad') {
    const data = store().load('manual') ?? store().load('auto')
    if (!data) return reply([{ kind: 'error', text: 'There is no saved game yet.' }])
    engine = Engine.fromSave(content, data, ai?.client())
    return reply([{ kind: 'system', text: 'Game loaded.' }, ...(await engine.handle('look'))])
  }
  return reply(await engine.handle(text))
})

ipcMain.on('engine:activity', () => {
  lastInput = Date.now()
})

ipcMain.on('engine:hold', (_event, on: unknown) => {
  held = Boolean(on)
  lastInput = Date.now()
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
const role = (value: unknown): 'voice' | 'brain' => {
  if (value !== 'voice' && value !== 'brain') throw new Error('Unknown role.')
  return value
}
const amount = (value: unknown): number | undefined => (value === null || value === undefined || value === '' ? undefined : Number(value))

ipcMain.handle('ai:overview', async () => {
  await setup()
  return service().overview()
})
ipcMain.handle('ai:connect', async (_event, id: unknown, key: unknown) => {
  const models = await service().connect(provider(id), String(key ?? ''))
  return { models: models.length }
})
ipcMain.handle('ai:disconnect', (_event, id: unknown) => {
  service().disconnect(provider(id))
  engine?.setLlm(service().client())
})
ipcMain.handle('ai:models', (_event, id: unknown) => service().listModels(provider(id), true))
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

// The real-time clock.
setInterval(() => {
  if (!engine || !window || window.isDestroyed() || paused()) return
  const outputs = engine.tick(1)
  window.webContents.send('engine:tick', reply(outputs))
  if (!smoke && ++minutesSinceSave >= AUTOSAVE_EVERY) {
    minutesSinceSave = 0
    store().save('auto', engine.save())
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
    show: !smoke,
    webPreferences: {
      preload: fileURLToPath(new URL('../preload/index.mjs', import.meta.url)),
      contextIsolation: true,
      sandbox: false,
    },
  })

  // WISPLIGHT_SMOKE=1: start hidden, print the first room the interface shows, quit.
  if (smoke) {
    window.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const room: string = await window!.webContents.executeJavaScript(
          "document.querySelector('.line.room')?.textContent ?? 'NO ROOM RENDERED'",
        )
        console.log(`[smoke] ${room.split('\n')[0]}`)
        app.quit()
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
  if (engine && !smoke) store().save('auto', engine.save())
  if (process.platform !== 'darwin') app.quit()
})
