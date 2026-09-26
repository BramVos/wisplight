import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// The only bridge between the window and the game. No Node access leaks through.

contextBridge.exposeInMainWorld('wisplight', {
  start: () => ipcRenderer.invoke('engine:start'),
  command: (input: string) => ipcRenderer.invoke('engine:command', input),
  activity: () => ipcRenderer.send('engine:activity'),
  hold: (on: boolean) => ipcRenderer.send('engine:hold', on),
  onTick: (listener: (reply: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, reply: unknown) => listener(reply)
    ipcRenderer.on('engine:tick', handler)
    return () => ipcRenderer.removeListener('engine:tick', handler)
  },
  ai: {
    overview: () => ipcRenderer.invoke('ai:overview'),
    connect: (provider: string, key: string) => ipcRenderer.invoke('ai:connect', provider, key),
    disconnect: (provider: string) => ipcRenderer.invoke('ai:disconnect', provider),
    models: (provider: string) => ipcRenderer.invoke('ai:models', provider),
    advise: (provider: string) => ipcRenderer.invoke('ai:advise', provider),
    trial: (provider: string, model: string, role: string) => ipcRenderer.invoke('ai:trial', provider, model, role),
    choose: (role: string, provider: string, model: string) => ipcRenderer.invoke('ai:choose', role, provider, model),
    setBudget: (usd: number) => ipcRenderer.invoke('ai:budget', usd),
    setMonthBudget: (usd: number | null) => ipcRenderer.invoke('ai:month-budget', usd),
    setCredit: (provider: string, usd: number | null) => ipcRenderer.invoke('ai:credit', provider, usd),
    csv: () => ipcRenderer.invoke('ai:csv'),
    log: () => ipcRenderer.invoke('ai:log'),
    billing: (provider: string) => ipcRenderer.invoke('ai:billing', provider),
  },
})
