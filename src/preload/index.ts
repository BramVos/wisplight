import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// The only bridge between the window and the game. No Node access leaks through.

contextBridge.exposeInMainWorld('wisplight', {
  start: () => ipcRenderer.invoke('engine:start'),
  command: (input: string) => ipcRenderer.invoke('engine:command', input),
  activity: () => ipcRenderer.send('engine:activity'),
  onTick: (listener: (reply: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, reply: unknown) => listener(reply)
    ipcRenderer.on('engine:tick', handler)
    return () => ipcRenderer.removeListener('engine:tick', handler)
  },
})
