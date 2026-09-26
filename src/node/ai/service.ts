import { join } from 'node:path'
import type { Content } from '../../engine/content'
import type { LlmClient } from '../../engine/dialogue/llm'
import { askAdvice, trial, type Advice, type TrialResult } from './advisor'
import { Gateway, type GatewayStatus } from './gateway'
import { AiLog, type AiLogEntry } from './log'
import { createProvider, type ModelInfo, type Provider, type ProviderId } from './providers'
import { SettingsStore, type Cipher, type SettingsSummary } from './settings'
import { UsageStore, type UsageSummary } from './usage'

// Everything the settings screen and the game need from the AI side, without
// Electron: main/index.ts passes in safeStorage as the cipher and the user data
// folder. Tests pass a fake cipher and fake providers.

export interface AiServiceOptions {
  dir: string
  cipher: Cipher
  content: Content
  providerFactory?: (id: ProviderId, key: string) => Provider
}

export interface AiOverview {
  settings: SettingsSummary
  usage: UsageSummary
  status: GatewayStatus
}

export class AiService {
  readonly settings: SettingsStore
  readonly usage: UsageStore
  readonly log: AiLog
  readonly gateway: Gateway
  private readonly providers = new Map<ProviderId, { key: string; provider: Provider }>()
  private readonly models = new Map<ProviderId, ModelInfo[]>()
  private readonly factory: (id: ProviderId, key: string) => Provider

  constructor(private readonly options: AiServiceOptions) {
    this.settings = new SettingsStore(join(options.dir, 'settings.json'), options.cipher)
    this.usage = new UsageStore(join(options.dir, 'usage.json'))
    this.log = new AiLog(join(options.dir, 'logs', 'ai.jsonl'))
    this.factory = options.providerFactory ?? createProvider
    this.gateway = new Gateway({
      role: (role) => this.settings.role(role),
      provider: (id) => this.provider(id),
      budgetUsdPerHour: () => this.settings.budgetUsdPerHour,
      log: this.log,
      usage: this.usage,
    })
  }

  private provider(id: ProviderId): Provider | undefined {
    const key = this.settings.key(id)
    if (!key) return undefined
    const cached = this.providers.get(id)
    if (cached && cached.key === key) return cached.provider
    const provider = this.factory(id, key)
    this.providers.set(id, { key, provider })
    return provider
  }

  /** The model for the engine, or undefined while no dialogue model is chosen. */
  client(): LlmClient | undefined {
    return this.settings.role('voice') ? this.gateway : undefined
  }

  overview(): AiOverview {
    return { settings: this.settings.summary(), usage: this.usage.summary(), status: this.gateway.status() }
  }

  /** Saves a key only after the provider accepted it by listing its models. */
  async connect(id: ProviderId, key: string): Promise<ModelInfo[]> {
    const provider = this.factory(id, key.trim())
    let models: ModelInfo[]
    try {
      models = await provider.listModels()
    } catch (error) {
      throw new Error(`The key did not work: ${error instanceof Error ? error.message : 'unknown error'}`.replace(key.trim(), '[key]'))
    }
    this.settings.setKey(id, key)
    this.models.set(id, models)
    return models
  }

  disconnect(id: ProviderId): void {
    this.settings.removeKey(id)
    this.providers.delete(id)
    this.models.delete(id)
  }

  async listModels(id: ProviderId, refresh = false): Promise<ModelInfo[]> {
    if (!refresh && this.models.has(id)) return this.models.get(id)!
    const provider = this.provider(id)
    if (!provider) throw new Error(`No API key for ${id}.`)
    const models = await provider.listModels()
    this.models.set(id, models)
    return models
  }

  async advise(id: ProviderId): Promise<Advice> {
    return askAdvice(this.gateway, id, await this.listModels(id, true))
  }

  async trial(id: ProviderId, model: string, role: 'voice' | 'brain'): Promise<TrialResult> {
    await this.requireModel(id, model)
    return trial(this.gateway, this.options.content, id, model, role)
  }

  /**
   * Stores the exact model id, after checking it is in the provider's list and
   * making one test call with it. Returns the id as stored.
   */
  async choose(role: 'voice' | 'brain', id: ProviderId, model: string): Promise<string> {
    await this.requireModel(id, model)
    const result = await trial(this.gateway, this.options.content, id, model, role, 1)
    if (result.valid === 0) throw new Error(`The test call with ${model} failed: ${result.errors[0] ?? 'no reply'}`)
    this.settings.setRole(role, { provider: id, model })
    return this.settings.role(role)!.model
  }

  /** Checks at start-up that the chosen models still exist; returns the roles whose model is gone. */
  async missingModels(): Promise<('voice' | 'brain')[]> {
    const missing: ('voice' | 'brain')[] = []
    for (const role of ['voice', 'brain'] as const) {
      const choice = this.settings.role(role)
      if (!choice) continue
      try {
        if (!(await this.listModels(choice.provider, true)).some((m) => m.id === choice.model)) missing.push(role)
      } catch {
        // Offline: keep the choice, the game falls back to templates anyway.
      }
    }
    return missing
  }

  recentLog(count?: number): AiLogEntry[] {
    return this.log.recent(count)
  }

  private async requireModel(id: ProviderId, model: string): Promise<void> {
    const models = await this.listModels(id)
    if (!models.some((m) => m.id === model)) throw new Error(`${model} is not in the list of models for this key.`)
  }
}
