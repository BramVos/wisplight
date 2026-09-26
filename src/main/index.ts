import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Engine, type Content, type Output } from '../engine'
import { loadContentFromDir } from '../node/content'
import { SaveStore } from '../node/savegame'

// The engine runs in the main process for now; the design moves it to a
// utility process once the simulation grows (FO, chapter 3).
//
// Hybrid clock (FO, chapter 3): outside conversations and menus, one real
// second is one game minute. The clock pauses after 60 seconds without input.

const IDLE_PAUSE_MS = 60_000
const AUTOSAVE_EVERY = 10

let content: Content | undefined
let engine: Engine | undefined
let window: BrowserWindow | undefined
let saves: SaveStore | undefined
let lastInput = Date.now()
let minutesSinceSave = 0

const smoke = Boolean(process.env['WISPLIGHT_SMOKE'])

function paused(): boolean {
  return Date.now() - lastInput > IDLE_PAUSE_MS
}

function reply(outputs: Output[]) {
  return { outputs, status: { ...engine!.status(), paused: paused() } }
}

function store(): SaveStore {
  saves ??= new SaveStore(join(app.getPath('userData'), 'saves', 'wisplight.sqlite'))
  return saves
}

ipcMain.handle('engine:start', async () => {
  content ??= await loadContentFromDir(join(app.getAppPath(), 'content'))
  engine = new Engine(content, { seed: Math.floor(Math.random() * 2 ** 31) })
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
    engine = Engine.fromSave(content, data)
    return reply([{ kind: 'system', text: 'Game loaded.' }, ...(await engine.handle('look'))])
  }
  return reply(await engine.handle(text))
})

ipcMain.on('engine:activity', () => {
  lastInput = Date.now()
})

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

void app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (engine && !smoke) store().save('auto', engine.save())
  if (process.platform !== 'darwin') app.quit()
})
