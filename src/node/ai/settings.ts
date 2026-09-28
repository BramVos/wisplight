import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { LlmRole } from '../../engine/dialogue/llm'
import { hourlyBudget, replyWithin } from '../../engine/aisettings'
import type { ProviderId } from './providers'

// Player settings. API keys are encrypted with the operating system's key
// store (Electron safeStorage: Keychain on macOS, DPAPI on Windows) before
// they touch the disk, and never leave this module in plain text except to
// build a provider client (FO, chapter 16).

export interface Cipher {
  available(): boolean
  encrypt(plain: string): string
  decrypt(encoded: string): string
}

/** The roles a player chooses a model for (FO, chapter 16). */
export type ChosenRole = Exclude<LlmRole, 'advisor'>
export const CHOSEN_ROLES: ChosenRole[] = ['voice', 'brain', 'chronicler']

export interface RoleChoice {
  provider: ProviderId
  model: string
}

interface SettingsFile {
  version: 1
  keys: Partial<Record<ProviderId, string>>
  roles: Partial<Record<Exclude<LlmRole, 'advisor'>, RoleChoice>>
  budgetUsdPerHour: number
  /** The models each key could use when last asked, so the player can choose without asking again. */
  models?: Partial<Record<ProviderId, { ids: string[]; at: string }>>
  /** Pictures of places and people: off unless the player picks an image model. */
  pictures?: PictureChoice
  /** How long a spoken reply may take, in seconds (M10.8): ten unless the player sets it at the dialogue model. */
  replyWithinSeconds?: number
  /** From what cost of one call the game asks first (M10.21), in dollars; null after "always". */
  askAboveUsd?: number | null
}

/** The threshold for a question about cost unless the player sets one (M10.21, the roadmap): one dollar. */
export const ASK_ABOVE_USD = 1

/** The default time a spoken reply may take (M10.8; FO, chapter 18). */
export const REPLY_WITHIN_SECONDS = 10

export interface PictureChoice {
  provider: ProviderId
  model: string
  quality: 'low' | 'medium'
}

export interface SettingsSummary {
  providers: Record<ProviderId, { configured: boolean; masked?: string }>
  roles: SettingsFile['roles']
  budgetUsdPerHour: number
  encryption: boolean
  /** Model ids per provider, as last listed. */
  models: Partial<Record<ProviderId, string[]>>
  /** Roles whose chosen model is no longer in its provider's list. */
  missing: ChosenRole[]
  pictures?: PictureChoice
  replyWithinSeconds: number
  /** From what cost of one call the game asks first; null: never. */
  askAboveUsd: number | null
}

export class SettingsStore {
  private data: SettingsFile
  private seen = 0

  constructor(
    private readonly path: string,
    private readonly cipher: Cipher,
  ) {
    this.data = this.read()
    this.seen = this.stamp()
  }

  private read(): SettingsFile {
    const empty: SettingsFile = { version: 1, keys: {}, roles: {}, budgetUsdPerHour: 0.1 }
    if (!existsSync(this.path)) return empty
    try {
      return { ...empty, ...(JSON.parse(readFileSync(this.path, 'utf8')) as Partial<SettingsFile>) }
    } catch {
      return empty
    }
  }

  /** When the file on disk last changed, to see another instance's change. */
  private stamp(): number {
    try {
      return statSync(this.path).mtimeMs
    } catch {
      return 0
    }
  }

  /**
   * The settings as they stand on disk (M10.20; the build of The Quiet Reach,
   * 28 September 2026: a second instance of the app still held $5 in memory
   * and wrote its whole state back over Bram's $50). Read again whenever the
   * file changed since this instance last saw it.
   */
  private get current(): SettingsFile {
    const now = this.stamp()
    if (now !== this.seen) {
      this.data = this.read()
      this.seen = now
    }
    return this.data
  }

  /** One change: the file read again, only this change made to it, and written back. */
  private change(apply: (data: SettingsFile) => void): void {
    const fresh = this.read()
    apply(fresh)
    mkdirSync(dirname(this.path), { recursive: true })
    const temp = `${this.path}.tmp`
    writeFileSync(temp, JSON.stringify(fresh, null, 2), { mode: 0o600 })
    renameSync(temp, this.path)
    this.data = fresh
    this.seen = this.stamp()
  }

  setKey(provider: ProviderId, key: string): void {
    const clean = key.trim()
    if (!clean) throw new Error('The key is empty.')
    if (!this.cipher.available()) throw new Error('Secure storage is not available on this computer, so the key cannot be saved safely.')
    const encoded = this.cipher.encrypt(clean)
    this.change((d) => {
      d.keys[provider] = encoded
    })
  }

  key(provider: ProviderId): string | undefined {
    const encoded = this.current.keys[provider]
    if (!encoded) return undefined
    try {
      return this.cipher.decrypt(encoded)
    } catch {
      return undefined
    }
  }

  setModels(provider: ProviderId, ids: string[]): void {
    const list = { ids: [...ids].sort(), at: new Date().toISOString() }
    this.change((d) => {
      ;(d.models ??= {})[provider] = list
    })
  }

  modelIds(provider: ProviderId): string[] | undefined {
    return this.current.models?.[provider]?.ids
  }

  /** Roles whose model has gone from the list of its provider. */
  missing(): ChosenRole[] {
    return CHOSEN_ROLES.filter((role) => {
      const choice = this.current.roles[role]
      const ids = choice ? this.modelIds(choice.provider) : undefined
      return Boolean(choice && ids && !ids.includes(choice.model))
    })
  }

  removeKey(provider: ProviderId): void {
    this.change((d) => {
      delete d.keys[provider]
      delete d.models?.[provider]
      for (const [role, choice] of Object.entries(d.roles)) {
        if (choice?.provider === provider) delete d.roles[role as keyof SettingsFile['roles']]
      }
    })
  }

  setRole(role: ChosenRole, choice: RoleChoice): void {
    this.change((d) => {
      d.roles[role] = { provider: choice.provider, model: choice.model }
    })
  }

  clearRole(role: ChosenRole): void {
    this.change((d) => {
      delete d.roles[role]
    })
  }

  role(role: LlmRole): RoleChoice | undefined {
    return role === 'advisor' ? undefined : this.current.roles[role]
  }

  get pictures(): PictureChoice | undefined {
    return this.current.pictures
  }

  setPictures(choice: PictureChoice | undefined): void {
    this.change((d) => {
      if (choice) d.pictures = choice
      else delete d.pictures
    })
  }

  get budgetUsdPerHour(): number {
    return this.current.budgetUsdPerHour
  }

  /** The player's hourly budget as they set it (M10.20): only a slip of the keyboard is caught, and then it says so. */
  setBudget(usd: number): { usd: number; adjusted: boolean } {
    const kept = hourlyBudget(usd)
    this.change((d) => {
      d.budgetUsdPerHour = kept.usd
    })
    return kept
  }

  /** From what cost of one call the game asks first (M10.21): Infinity when the player chose "always". */
  get askAboveUsd(): number {
    const set = this.current.askAboveUsd
    return set === null ? Infinity : (set ?? ASK_ABOVE_USD)
  }

  /** Sets the threshold, kept as the hourly budget is (a cent to a thousand dollars); null: never ask. */
  setAskAbove(usd: number | null): { usd: number | null; adjusted: boolean } {
    const kept = usd === null ? { usd: null, adjusted: false } : hourlyBudget(usd)
    this.change((d) => {
      d.askAboveUsd = kept.usd
    })
    return kept
  }

  get replyWithinSeconds(): number {
    return this.current.replyWithinSeconds ?? REPLY_WITHIN_SECONDS
  }

  /** From three seconds to a minute; past it, the game's own line stands in. Says when it had to change the value. */
  setReplyWithin(seconds: number): { seconds: number; adjusted: boolean } {
    const kept = replyWithin(seconds)
    if (!Number.isFinite(seconds)) return { seconds: this.replyWithinSeconds, adjusted: true }
    this.change((d) => {
      d.replyWithinSeconds = kept.seconds
    })
    return kept
  }

  summary(): SettingsSummary {
    const describe = (provider: ProviderId) => {
      const key = this.key(provider)
      return { configured: Boolean(key), masked: key ? mask(key) : undefined }
    }
    return {
      providers: { openai: describe('openai'), anthropic: describe('anthropic') },
      roles: { ...this.current.roles },
      budgetUsdPerHour: this.current.budgetUsdPerHour,
      askAboveUsd: this.current.askAboveUsd === null ? null : (this.current.askAboveUsd ?? ASK_ABOVE_USD),
      encryption: this.cipher.available(),
      models: Object.fromEntries(Object.entries(this.current.models ?? {}).map(([id, list]) => [id, list?.ids ?? []])),
      missing: this.missing(),
      ...(this.current.pictures ? { pictures: { ...this.current.pictures } } : {}),
      replyWithinSeconds: this.replyWithinSeconds,
    }
  }
}

export function mask(key: string): string {
  const prefix = key.startsWith('sk-ant-') ? 'sk-ant-' : key.startsWith('sk-') ? 'sk-' : ''
  return `${prefix}...${key.slice(-4)}`
}
