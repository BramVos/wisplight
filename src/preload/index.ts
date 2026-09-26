import { contextBridge, ipcRenderer } from 'electron'

// The only bridge between the window and the game: two calls, no Node access.

contextBridge.exposeInMainWorld('wisplight', {
  start: () => ipcRenderer.invoke('engine:start'),
  command: (input: string) => ipcRenderer.invoke('engine:command', input),
})
