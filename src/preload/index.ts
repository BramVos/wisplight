import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// The only bridge between the window and the game. No Node access leaks through.

contextBridge.exposeInMainWorld('wisplight', {
  start: (world?: string) => ipcRenderer.invoke('engine:start', world),
  worlds: () => ipcRenderer.invoke('engine:worlds'),
  command: (input: string) => ipcRenderer.invoke('engine:command', input),
  page: (id: string) => ipcRenderer.invoke('engine:page', id),
  picture: (id: string) => ipcRenderer.invoke('engine:picture', id),
  creation: () => ipcRenderer.invoke('engine:creation'),
  end: () => ipcRenderer.invoke('engine:end'),
  logSize: (scope?: unknown) => ipcRenderer.invoke('engine:log-size', scope),
  exportLog: (scope?: unknown) => ipcRenderer.invoke('engine:export-log', scope),
  activity: () => ipcRenderer.send('engine:activity'),
  hold: (on: boolean) => ipcRenderer.send('engine:hold', on),
  // The game hears when the content changed under it (the editor saved, or a file changed).
  builder: {
    onReload: (listener: () => void) => {
      const handler = () => listener()
      ipcRenderer.on('builder:reloaded', handler)
      return () => ipcRenderer.removeListener('builder:reloaded', handler)
    },
    onProblem: (listener: (text: string) => void) => {
      const handler = (_event: IpcRendererEvent, text: string) => listener(text)
      ipcRenderer.on('builder:problem', handler)
      return () => ipcRenderer.removeListener('builder:problem', handler)
    },
  },
  // The editor (M8), in its own window: npm run editor, or [Editor] in a development build of the game.
  editor: {
    open: () => ipcRenderer.invoke('editor:open'),
    worlds: () => ipcRenderer.invoke('editor:worlds'),
    view: (world: string) => ipcRenderer.invoke('editor:view', world),
    entity: (world: string, kind: string, id: string) => ipcRenderer.invoke('editor:entity', world, kind, id),
    save: (world: string, edits: unknown[], write?: boolean) => ipcRenderer.invoke('editor:save', world, edits, write),
    newWorld: (folder: string, name: string) => ipcRenderer.invoke('editor:new-world', folder, name),
    simulate: (world: string, days: number, seed: number) => ipcRenderer.invoke('editor:simulate', world, days, seed),
    draft: (world: string, ask: string, focus?: { kind: string; id: string }) => ipcRenderer.invoke('editor:draft', world, ask, focus),
  },
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
    refresh: () => ipcRenderer.invoke('ai:refresh'),
    advise: (provider: string) => ipcRenderer.invoke('ai:advise', provider),
    trial: (provider: string, model: string, role: string) => ipcRenderer.invoke('ai:trial', provider, model, role),
    choose: (role: string, provider: string, model: string) => ipcRenderer.invoke('ai:choose', role, provider, model),
    setBudget: (usd: number) => ipcRenderer.invoke('ai:budget', usd),
    setMonthBudget: (usd: number | null) => ipcRenderer.invoke('ai:month-budget', usd),
    setCredit: (provider: string, usd: number | null) => ipcRenderer.invoke('ai:credit', provider, usd),
    csv: () => ipcRenderer.invoke('ai:csv'),
    log: () => ipcRenderer.invoke('ai:log'),
    billing: (provider: string) => ipcRenderer.invoke('ai:billing', provider),
    imageModels: (provider: string) => ipcRenderer.invoke('ai:image-models', provider),
    setPictures: (provider: string | null, model?: string, quality?: string) => ipcRenderer.invoke('ai:pictures', provider, model, quality),
    tryPicture: (provider: string, model: string) => ipcRenderer.invoke('ai:try-picture', provider, model),
  },
})
