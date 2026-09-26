import type { Output, Status } from '../../engine'

export interface Reply {
  outputs: Output[]
  status: Status
}

export interface EngineClient {
  start(): Promise<Reply>
  command(input: string): Promise<Reply>
  activity(): void
  /** Real-time clock updates. Returns an unsubscribe function. */
  onTick(listener: (reply: Reply) => void): () => void
}

const IDLE_PAUSE_MS = 60_000

// Inside Electron the engine runs in the main process and is reached through
// the preload bridge. In a plain browser (npm run web) it runs in the page,
// with its own real-time clock and no savegames.
export async function createClient(): Promise<EngineClient> {
  if (window.wisplight) return window.wisplight

  const { Engine, loadContent } = await import('../../engine')
  const modules = import.meta.glob('../../../content/**/*.{yaml,yml}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  const engine = new Engine(loadContent(Object.entries(modules).map(([path, text]) => ({ path, text }))), { seed: 1 })
  let lastInput = Date.now()
  const listeners = new Set<(reply: Reply) => void>()
  const status = () => ({ ...engine.status(), paused: Date.now() - lastInput > IDLE_PAUSE_MS })

  setInterval(() => {
    if (Date.now() - lastInput > IDLE_PAUSE_MS) return
    const reply = { outputs: engine.tick(1), status: status() }
    for (const listener of listeners) listener(reply)
  }, 1000)

  return {
    start: async () => ({ outputs: engine.start(), status: status() }),
    command: async (input) => {
      lastInput = Date.now()
      if (/^(save|load|bewaar|laad)\b/i.test(input.trim())) {
        return { outputs: [{ kind: 'system', text: 'Saving and loading work in the desktop app.' }], status: status() }
      }
      return { outputs: await engine.handle(input), status: status() }
    },
    activity: () => {
      lastInput = Date.now()
    },
    onTick: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
