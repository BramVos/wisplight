import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pictureSubject } from '../../engine/pictures'
import type { Content } from '../../engine/content'
import type { LlmClient } from '../../engine/dialogue/llm'
import { askAdvice, judgeTrials, testCall, trial, type Advice, type TrialResult, type TrialVerdict } from './advisor'
import { CostRegister } from './costs'
import { BuildStore } from './builds'
import { guidePrice, type GuidePrice } from './guideprice'
import { type RoleActivity, Gateway, type GatewayStatus } from './gateway'
import { AiLog, type AiLogEntry } from './log'
import { createProvider, type ModelInfo, type Provider, type ProviderId } from './providers'
import { SettingsStore, type Cipher, type ChosenRole, type PictureChoice, type SettingsSummary } from './settings'
import { UsageStore, type UsageSummary } from './usage'
import { picturePrice } from './pricing'
import { cachedPictureIn } from '../worldbook'
import type { AppKnobs } from '../knobs'
import { LlmError } from '../../engine/dialogue/llm'

// Everything the settings screen and the game need from the AI side, without
// Electron: main/index.ts passes in safeStorage as the cipher and the user data
// folder. Tests pass a fake cipher and fake providers.

export interface AiServiceOptions {
  dir: string
  cipher: Cipher
  content: Content
  providerFactory?: (id: ProviderId, key: string) => Provider
  /** The app's knobs (M10.20); without them, the defaults. */
  knobs?: AppKnobs
}

export interface AiOverview {
  settings: SettingsSummary
  usage: UsageSummary
  status: GatewayStatus
  /** What an hour of play costs about with the chosen models (M10.21), from the recorded trials. */
  guide?: GuidePrice
}

export class AiService {
  readonly settings: SettingsStore
  readonly usage: UsageStore
  readonly log: AiLog
  readonly gateway: Gateway
  /** The budgets of world builds in the editor (M10.20). */
  readonly builds: BuildStore
  private readonly providers = new Map<ProviderId, { key: string; provider: Provider }>()
  private readonly models = new Map<ProviderId, ModelInfo[]>()
  private readonly factory: (id: ProviderId, key: string) => Provider

  /** Told when a role's light changes (M10.4). */
  onActivity?: (activity: RoleActivity[]) => void

  constructor(private readonly options: AiServiceOptions) {
    this.settings = new SettingsStore(join(options.dir, 'settings.json'), options.cipher)
    this.usage = new UsageStore(join(options.dir, 'usage.json'))
    this.log = new AiLog(join(options.dir, 'logs', 'ai.jsonl'), () => options.knobs?.get('ai_log_keep') ?? 200)
    this.builds = new BuildStore(join(options.dir, 'builds.json'), () => this.settings.budgetUsdPerHour)
    this.factory = options.providerFactory ?? createProvider
    this.gateway = new Gateway({
      role: (role) => this.settings.role(role),
      provider: (id) => this.provider(id),
      budgetUsdPerHour: () => this.settings.budgetUsdPerHour,
      askAboveUsd: () => this.settings.askAboveUsd,
      askNever: () => void this.settings.setAskAbove(null),
      playMode: () => this.settings.playMode,
      replyWithinMs: () => this.settings.replyWithinSeconds * 1000,
      log: this.log,
      usage: this.usage,
      // The last hour's costs on disk (M9.3): the hourly budget holds after a restart.
      costs: new CostRegister(join(options.dir, 'costs.jsonl')),
      builds: this.builds,
      onActivity: (activity) => this.onActivity?.(activity),
      ...(options.knobs
        ? {
            knobs: () => ({
              timeoutMs: { brain: options.knobs!.get('brain_timeout_seconds') * 1000, chronicler: options.knobs!.get('chronicler_timeout_seconds') * 1000 },
              editorTimeoutMs: options.knobs!.get('editor_timeout_seconds') * 1000,
              conversationShare: options.knobs!.get('conversation_share'),
            }),
          }
        : {}),
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
    return { settings: this.settings.summary(), usage: this.usage.summary(), status: this.gateway.status(), guide: guidePrice((role) => this.settings.role(role)) }
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

  /** Tries the advised models for a role one after the other and chooses on the trial (M9.3). */
  async compare(role: ChosenRole, choices: { provider: ProviderId; model: string }[]): Promise<{ results: TrialResult[]; verdicts: TrialVerdict[]; choice?: { provider: ProviderId; model: string } }> {
    const results: TrialResult[] = []
    for (const c of choices.slice(0, 4)) results.push(await this.trial(c.provider, c.model, role))
    const { choice, verdicts } = judgeTrials(results)
    return { results, verdicts, ...(choice ? { choice: { provider: choice.provider, model: choice.model } } : {}) }
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
  /** A picture already made, from disk only, never drawn now (M10.18: the world book shows what there is). */
  cachedPicture(content: Content, id: string): string | undefined {
    return cachedPictureIn(this.options.dir, content, id)
  }

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

  /**
   * Every picture of these worlds at once, on the player's request (after the
   * M10 playtest): the people and places not made yet, three at a time, with
   * the model chosen under Settings > AI, until the next one would pass the
   * cap. Kept where the game looks for them; the costs are counted as any.
   */
  async drawAll(contents: Content[], capUsd: number, say: (line: string) => void): Promise<{ made: number; kept: number; failed: number; costUsd: number; stopped?: string }> {
    const result: { made: number; kept: number; failed: number; costUsd: number; stopped?: string } = { made: 0, kept: 0, failed: 0, costUsd: 0 }
    const choice = this.settings.pictures
    if (!choice) return { ...result, stopped: 'pictures are off under Settings > AI' }
    const price = picturePrice(choice.model, choice.quality)
    if (price === undefined) return { ...result, stopped: `no known price for ${choice.model} at ${choice.quality} quality, so the cap cannot be kept` }
    const jobs: { file: string; prompt: string; name: string; world: string }[] = []
    for (const content of contents) {
      const ids = [...content.npcs.keys(), ...[...content.areas.keys()].map((a) => `area_${a}`)]
      for (const id of ids) {
        const subject = pictureSubject(content, id)
        if (!subject || subject.plain) continue
        const file = join(this.options.dir, 'pictures', content.world.id.replace(/[^a-z0-9_-]/gi, ''), `${subject.id}-${subject.key}.jpg`)
        if (jobs.some((j) => j.file === file)) continue
        if (existsSync(file)) {
          result.kept++
          continue
        }
        jobs.push({ file, prompt: subject.prompt, name: subject.name, world: content.world.name })
      }
    }
    say(`${jobs.length} to make, ${result.kept} made before; ${choice.model} at ${choice.quality} quality, $${price} each, at most $${capUsd.toFixed(2)}`)
    let reserved = 0
    const next = async (): Promise<void> => {
      for (;;) {
        const job = jobs.shift()
        if (!job || result.stopped) return
        if (reserved + price > capUsd) {
          result.stopped = `the cap of $${capUsd.toFixed(2)}; ${jobs.length + 1} not made`
          jobs.length = 0
          return
        }
        reserved += price
        try {
          const picture = await this.gateway.picture(job.prompt, choice, false, { batch: true })
          mkdirSync(join(job.file, '..'), { recursive: true })
          writeFileSync(job.file, Buffer.from(picture.base64, 'base64'))
          result.made++
          result.costUsd += price
          say(`made ${job.world}: ${job.name}`)
        } catch (error) {
          reserved -= price
          result.failed++
          const message = error instanceof Error ? error.message : String(error)
          say(`failed ${job.world}: ${job.name}: ${message}`)
          if (error instanceof LlmError && (error.kind === 'budget' || error.kind === 'config')) result.stopped = message
        }
      }
    }
    await Promise.all([next(), next(), next()])
    return result
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
