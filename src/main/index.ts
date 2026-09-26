import { app, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Engine } from '../engine'
import { loadContentFromDir } from '../node/content'

// For now the engine runs in the main process. The design (FO, chapter 3)
// moves it to a separate utility process once the simulation grows.

let engine: Engine | undefined

function reply(outputs: ReturnType<Engine['handle']>) {
  return { outputs, status: engine!.status() }
}

ipcMain.handle('engine:start', async () => {
  engine = new Engine(await loadContentFromDir(join(app.getAppPath(), 'content')))
  return reply(engine.start())
})

ipcMain.handle('engine:command', (_event, input: unknown) => {
  if (!engine) throw new Error('Engine not started')
  return reply(engine.handle(String(input).slice(0, 500)))
})

// WISPLIGHT_SMOKE=1 starts the app without showing a window, prints the first
// room it renders and quits. A quick end-to-end check of main, preload and UI.
const smoke = Boolean(process.env['WISPLIGHT_SMOKE'])

function createWindow(): void {
  const window = new BrowserWindow({
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

  if (smoke) {
    window.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const room: string = await window.webContents.executeJavaScript(
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
  if (process.platform !== 'darwin') app.quit()
})
