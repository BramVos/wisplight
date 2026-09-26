import type { JournalPage, Output, Status } from '../../engine'
import type { Advice, TrialResult } from '../../node/ai/advisor'
import type { AiLogEntry } from '../../node/ai/log'
import type { ModelInfo, ProviderId } from '../../node/ai/providers'
import type { AiOverview } from '../../node/ai/service'

export type { Advice, AiLogEntry, AiOverview, JournalPage, ModelInfo, ProviderId, TrialResult }

/** What the status bar shows about the AI: cost so far and whether calls go through. */
export interface AiStatus {
  connected: boolean
  sessionUsd: number
  hourPercent: number
  monthLeftPercent?: number
  busy: boolean
  coolingDown: boolean
  budgetSpent: boolean
}

export interface Reply {
  outputs: Output[]
  status: Status & { ai?: AiStatus }
}

/** Settings > AI. Keys go in and never come back out. */
export interface AiBridge {
  overview(): Promise<AiOverview>
  connect(provider: ProviderId, key: string): Promise<{ models: number }>
  disconnect(provider: ProviderId): Promise<void>
  models(provider: ProviderId): Promise<ModelInfo[]>
  advise(provider: ProviderId): Promise<Advice>
  trial(provider: ProviderId, model: string, role: 'voice' | 'brain'): Promise<TrialResult>
  choose(role: 'voice' | 'brain', provider: ProviderId, model: string): Promise<string>
  setBudget(usd: number): Promise<void>
  setMonthBudget(usd: number | null): Promise<void>
  setCredit(provider: ProviderId, usd: number | null): Promise<void>
  csv(): Promise<string>
  log(): Promise<AiLogEntry[]>
  billing(provider: ProviderId): Promise<void>
}

export interface EngineClient {
  start(): Promise<Reply>
  command(input: string): Promise<Reply>
  /** A page of the journal, or undefined for something the player does not know. */
  page(id: string): Promise<JournalPage | undefined>
  /** The player's own log (desktop only) and the true chronicle, for the end of a game. */
  end(): Promise<{ log?: string; chronicle: string }>
  activity(): void
  /** Stops the real-time clock while a menu is open. */
  hold(on: boolean): void
  /** Real-time clock updates. Returns an unsubscribe function. */
  onTick(listener: (reply: Reply) => void): () => void
  /** Only in the desktop app, or in the browser preview with ?mock=1. */
  ai?: AiBridge
}

const IDLE_PAUSE_MS = 60_000

// Inside Electron the engine runs in the main process and is reached through
// the preload bridge. In a plain browser (npm run web) it runs in the page,
// with its own real-time clock and no savegames. With ?mock=1 the NPCs answer
// through the mock model and the settings screen runs on made-up data, so the
// interface can be checked without an API key.
export async function createClient(): Promise<EngineClient> {
  if (window.wisplight) return window.wisplight

  const { Engine, loadContent, MockLlm } = await import('../../engine')
  const modules = import.meta.glob('../../../content/**/*.{yaml,yml}', {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>
  const content = loadContent(Object.entries(modules).map(([path, text]) => ({ path, text })))
  const mock = new URLSearchParams(window.location.search).has('mock')
  const demo = mock ? await import('./demo') : undefined
  const llm = mock ? demo!.slowMock(new MockLlm('good')) : undefined
  const engine = new Engine(content, { seed: 1, llm })
  const bridge = demo?.demoBridge(content)
  // The clock starts with the player's first keystroke, not while the opening is being read.
  let lastInput = -Infinity
  let held = false
  const listeners = new Set<(reply: Reply) => void>()
  const paused = () => held || Boolean(engine.state.talk) || Date.now() - lastInput > IDLE_PAUSE_MS
  const status = (): Reply['status'] => ({ ...engine.status(), paused: paused(), ai: bridge ? demo!.demoStatus() : undefined })

  setInterval(() => {
    if (paused()) return
    const reply = { outputs: engine.tick(1), status: status() }
    for (const listener of listeners) listener(reply)
  }, 1000)

  return {
    start: async () => ({ outputs: engine.start(), status: status() }),
    command: async (input) => {
      lastInput = Date.now()
      if (/^(save|load|bewaar|laad|continue|verder|log|logboek)(\s+(\d+|export))?$/i.test(input.trim())) {
        return { outputs: [{ kind: 'system', text: 'Saving, loading and the game log work in the desktop app.' }], status: status() }
      }
      return { outputs: await engine.handle(input), status: status() }
    },
    page: async (id) => engine.page(id),
    end: async () => ({ chronicle: engine.chronicle() }),
    activity: () => {
      lastInput = Date.now()
    },
    hold: (on) => {
      // Closing a menu counts as activity; the first "no menu" at start-up does not start the clock.
      if (held && !on) lastInput = Date.now()
      held = on
    },
    onTick: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    ai: bridge,
  }
}
