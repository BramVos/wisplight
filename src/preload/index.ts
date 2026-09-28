import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// The only bridge between the window and the game. No Node access leaks through.

// The channels this preload calls (M10.20): the interface checks at start that the main process
// handles every one, so an app whose main process is older than its interface says so at once
// ("Restart the app") instead of failing at the first call.
const CHANNELS: string[] = []
const ch =
  (channel: string) =>
  (...args: unknown[]): Promise<unknown> =>
    ipcRenderer.invoke(channel, ...args)
const use = (channel: string) => {
  CHANNELS.push(channel)
  return ch(channel)
}

contextBridge.exposeInMainWorld('wisplight', {
  // The version check (M10.20): what this preload calls, and what the main process handles.
  channels: () => [...CHANNELS],
  handled: () => ipcRenderer.invoke('app:handled'),
  start: use('engine:start'),
  worlds: use('engine:worlds'),
  command: use('engine:command'),
  page: use('engine:page'),
  picture: use('engine:picture'),
  creation: use('engine:creation'),
  end: use('engine:end'),
  logSize: use('engine:log-size'),
  exportLog: use('engine:export-log'),
  exportChronicle: use('engine:export-chronicle'),
  exportDiscovered: use('engine:export-discovered'),
  // The saves (M10.20): continue a world, load one, name one, and a save as a file.
  saves: {
    list: use('engine:saves'),
    continueGame: use('engine:continue'),
    load: use('engine:load-save'),
    name: use('engine:name-save'),
    exportSave: use('engine:export-save'),
    importSave: use('engine:import-save'),
  },
  activity: () => ipcRenderer.send('engine:activity'),
  hold: (on: boolean) => ipcRenderer.send('engine:hold', on),
  // The game hears when the content changed under it (the editor saved, or a file changed).
  builder: {
    onReload: (listener: (change: { file?: string }) => void) => {
      const handler = (_event: IpcRendererEvent, change?: { file?: string }) => listener(change ?? {})
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
    open: use('editor:open'),
    worlds: use('editor:worlds'),
    view: use('editor:view'),
    entity: use('editor:entity'),
    save: use('editor:save'),
    newWorld: use('editor:new-world'),
    simulate: use('editor:simulate'),
    draft: use('editor:draft'),
    palette: use('editor:palette'),
    savePalette: use('editor:save-palette'),
    proposePalette: use('editor:propose-palette'),
    voice: use('editor:voice'),
    saveVoice: use('editor:save-voice'),
    proposeVoice: use('editor:propose-voice'),
    // Building a world step by step with the chronicler (M10.17), and saving a proposal with world keys and files.
    worldStep: use('editor:world-step'),
    // A proposal that did not load, put right by the chronicler (M10.20): only what it corrects comes back.
    worldFix: use('editor:world-fix'),
    // What a world build may spend and has spent, per step (M10.20).
    build: use('editor:build'),
    // The polish round of place descriptions (M10.20).
    polish: use('editor:polish'),
    // Enhance with AI: the answer to a step written out as a fuller brief (after M10.17).
    enhance: use('editor:enhance'),
    // The design log of a world (M10.18): read it, or write a note, an answer being written or a decision.
    design: use('editor:design'),
    saveDraft: use('editor:save-draft'),
    // The world book (M10.18): written next to the content and saved as HTML.
    worldBook: use('editor:worldbook'),
  },
  // Under the bonnet (M10.1): only a development build has the dev menu.
  ...(import.meta.env.DEV ? { dev: { view: use('dev:view') } } : {}),
  onTick: (listener: (reply: unknown) => void) => {
    const handler = (_event: IpcRendererEvent, reply: unknown) => listener(reply)
    ipcRenderer.on('engine:tick', handler)
    return () => ipcRenderer.removeListener('engine:tick', handler)
  },
  // The transcript (M10.4): on or off, and a folder.
  transcript: {
    get: use('transcript:get'),
    set: use('transcript:set'),
    choose: use('transcript:choose'),
  },
  ai: {
    // The lights of the roles (M10.4): a call starts or ends.
    onActivity: (listener: (roles: unknown) => void) => {
      const handler = (_event: IpcRendererEvent, roles: unknown) => listener(roles)
      ipcRenderer.on('ai:activity', handler)
      return () => ipcRenderer.removeListener('ai:activity', handler)
    },
    overview: use('ai:overview'),
    connect: use('ai:connect'),
    disconnect: use('ai:disconnect'),
    models: use('ai:models'),
    refresh: use('ai:refresh'),
    advise: use('ai:advise'),
    trial: use('ai:trial'),
    compare: use('ai:compare'),
    choose: use('ai:choose'),
    setBudget: use('ai:budget'),
    setReplyWithin: use('ai:reply-within'),
    setMonthBudget: use('ai:month-budget'),
    setCredit: use('ai:credit'),
    csv: use('ai:csv'),
    log: use('ai:log'),
    billing: use('ai:billing'),
    imageModels: use('ai:image-models'),
    setPictures: use('ai:pictures'),
    tryPicture: use('ai:try-picture'),
  },
})
