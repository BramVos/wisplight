import type { Output, Status } from '../../engine'

export interface Reply {
  outputs: Output[]
  status: Status
}

export interface EngineClient {
  start(): Promise<Reply>
  command(input: string): Promise<Reply>
}

// Inside Electron the engine runs in the main process and is reached through
// the preload bridge. In a plain browser (npm run web) it runs in the page.
export async function createClient(): Promise<EngineClient> {
  if (window.wisplight) return window.wisplight

  const { Engine, loadContent } = await import('../../engine')
  const modules = import.meta.glob('../../../content/**/*.{yaml,yml}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  const engine = new Engine(loadContent(Object.entries(modules).map(([path, text]) => ({ path, text }))))
  return {
    start: async () => ({ outputs: engine.start(), status: engine.status() }),
    command: async (input) => ({ outputs: engine.handle(input), status: engine.status() }),
  }
}
