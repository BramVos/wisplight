import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pictureSubject } from '../../engine/pictures'
import type { Content } from '../../engine/content'
import type { LlmClient } from '../../engine/dialogue/llm'
import { askAdvice, testCall, trial, type Advice, type TrialResult } from './advisor'
import { CostRegister } from './costs'
import { Gateway, type GatewayStatus } from './gateway'
import { AiLog, type AiLogEntry } from './log'
import { createProvider, type ModelInfo, type Provider, type ProviderId } from './providers'
import { SettingsStore, type Cipher, type ChosenRole, type PictureChoice, type SettingsSummary } from './settings'
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
      // The last hour's costs on disk (M9.3): the hourly budget holds after a restart.
      costs: new CostRegister(join(options.dir, 'costs.jsonl')),
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
    this.settings.setModels(id, models.map((m) => m.id))
    return models
  }

  disconnect(id: ProviderId): void {
    this.settings.removeKey(id)
    this.providers.delete(id)
    this.models.delete(id)
  }

  /** The models this key can use: as last listed, or fresh from the provider. Fresh lists are saved. */
  async listModels(id: ProviderId, refresh = false): Promise<ModelInfo[]> {
    if (!refresh && this.models.has(id)) return this.models.get(id)!
    const stored = this.settings.modelIds(id)
    if (!refresh && stored) return stored.map((model) => ({ id: model }))
    const provider = this.provider(id)
    if (!provider) throw new Error(`No API key for ${id}.`)
    const models = await provider.listModels()
    this.models.set(id, models)
    this.settings.setModels(id, models.map((m) => m.id))
    return models
  }

  /** Asks every connected provider for its models again, and returns the roles whose model is gone. */
  async refreshModels(): Promise<ChosenRole[]> {
    for (const id of ['openai', 'anthropic'] as const) {
      if (!this.settings.key(id)) continue
      try {
        await this.listModels(id, true)
      } catch {
        // Offline: keep the last list, the game falls back to templates anyway.
      }
    }
    return this.settings.missing()
  }

  async advise(id: ProviderId): Promise<Advice> {
    return askAdvice(this.gateway, id, await this.listModels(id, true))
  }

  async trial(id: ProviderId, model: string, role: ChosenRole): Promise<TrialResult> {
    await this.requireModel(id, model)
    return trial(this.gateway, this.options.content, id, model, role)
  }

  /**
   * Stores the exact model id, after checking it is in the provider's list and
   * making one test call with it. Returns the id as stored.
   */
  async choose(role: ChosenRole, id: ProviderId, model: string): Promise<string> {
    await this.requireModel(id, model)
    // One short call with the exact id; a full trial is up to the player (Try).
    const problem = await testCall(this.gateway, id, model)
    if (problem) throw new Error(`The test call with ${model} failed: ${problem}`)
    this.settings.setRole(role, { provider: id, model })
    return this.settings.role(role)!.model
  }

  /** Checks at start-up that the chosen models still exist; returns the roles whose model is gone. */
  async missingModels(): Promise<ChosenRole[]> {
    return this.refreshModels()
  }

  recentLog(count?: number): AiLogEntry[] {
    return this.log.recent(count)
  }

  // ---------------------------------------------------------------- pictures (after the M7 playtest)

  private readonly drawing = new Map<string, Promise<string | undefined>>()

  /** The image models a key can use: OpenAI only, Claude makes no pictures. */
  async imageModels(id: ProviderId): Promise<ModelInfo[]> {
    const provider = this.provider(id)
    if (!provider?.listImageModels) return []
    return provider.listImageModels()
  }

  /** Pictures on with this model, or off with undefined. */
  choosePictures(choice: PictureChoice | undefined): void {
    this.settings.setPictures(choice)
  }

  /**
   * The picture of a person or a place, as a data URL: from disk when it was
   * made before, otherwise made once by the image model and kept. Undefined
   * when pictures are off, the budget is spent, or the model fails; the game
   * simply shows none.
   */
  async picture(content: Content, id: string): Promise<string | undefined> {
    const subject = pictureSubject(content, id)
    if (!subject) return undefined
    if (subject.plain) return subject.plain
    const file = join(this.options.dir, 'pictures', content.world.id.replace(/[^a-z0-9_-]/gi, ''), `${subject.id}-${subject.key}.jpg`)
    if (existsSync(file)) return `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`
    const choice = this.settings.pictures
    if (!choice) return undefined
    const running = this.drawing.get(file)
    if (running) return running
    const job = this.gateway
      .picture(subject.prompt, choice)
      .then((picture) => {
        mkdirSync(join(file, '..'), { recursive: true })
        writeFileSync(file, Buffer.from(picture.base64, 'base64'))
        return `data:${picture.mime};base64,${picture.base64}`
      })
      .catch(() => undefined)
      .finally(() => this.drawing.delete(file))
    this.drawing.set(file, job)
    return job
  }

  /** A trial picture of the start of the world, with a model the player may pick; not kept. */
  async tryPicture(content: Content, id: ProviderId, model: string): Promise<string> {
    const subject = pictureSubject(content, content.world.start.location)
    if (!subject) throw new Error('This world has no place to draw.')
    const picture = await this.gateway.picture(subject.prompt, { provider: id, model, quality: 'low' }, true)
    return `data:${picture.mime};base64,${picture.base64}`
  }

  private async requireModel(id: ProviderId, model: string): Promise<void> {
    const models = await this.listModels(id)
    if (!models.some((m) => m.id === model)) throw new Error(`${model} is not in the list of models for this key.`)
  }
}
