import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { LlmRole } from '../../engine/dialogue/llm'
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
}

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
}

export class SettingsStore {
  private data: SettingsFile

  constructor(
    private readonly path: string,
    private readonly cipher: Cipher,
  ) {
    this.data = this.read()
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

  private write(): void {
    mkdirSync(dirname(this.path), { recursive: true })
    const temp = `${this.path}.tmp`
    writeFileSync(temp, JSON.stringify(this.data, null, 2), { mode: 0o600 })
    renameSync(temp, this.path)
  }

  setKey(provider: ProviderId, key: string): void {
    const clean = key.trim()
    if (!clean) throw new Error('The key is empty.')
    if (!this.cipher.available()) throw new Error('Secure storage is not available on this computer, so the key cannot be saved safely.')
    this.data.keys[provider] = this.cipher.encrypt(clean)
    this.write()
  }

  key(provider: ProviderId): string | undefined {
    const encoded = this.data.keys[provider]
    if (!encoded) return undefined
    try {
      return this.cipher.decrypt(encoded)
    } catch {
      return undefined
    }
  }

  setModels(provider: ProviderId, ids: string[]): void {
    ;(this.data.models ??= {})[provider] = { ids: [...ids].sort(), at: new Date().toISOString() }
    this.write()
  }

  modelIds(provider: ProviderId): string[] | undefined {
    return this.data.models?.[provider]?.ids
  }

  /** Roles whose model has gone from the list of its provider. */
  missing(): ChosenRole[] {
    return CHOSEN_ROLES.filter((role) => {
      const choice = this.data.roles[role]
      const ids = choice ? this.modelIds(choice.provider) : undefined
      return Boolean(choice && ids && !ids.includes(choice.model))
    })
  }

  removeKey(provider: ProviderId): void {
    delete this.data.keys[provider]
    delete this.data.models?.[provider]
    for (const [role, choice] of Object.entries(this.data.roles)) {
      if (choice?.provider === provider) delete this.data.roles[role as keyof SettingsFile['roles']]
    }
    this.write()
  }

  setRole(role: ChosenRole, choice: RoleChoice): void {
    this.data.roles[role] = { provider: choice.provider, model: choice.model }
    this.write()
  }

  clearRole(role: ChosenRole): void {
    delete this.data.roles[role]
    this.write()
  }

  role(role: LlmRole): RoleChoice | undefined {
    return role === 'advisor' ? undefined : this.data.roles[role]
  }

  get pictures(): PictureChoice | undefined {
    return this.data.pictures
  }

  setPictures(choice: PictureChoice | undefined): void {
    if (choice) this.data.pictures = choice
    else delete this.data.pictures
    this.write()
  }

  get budgetUsdPerHour(): number {
    return this.data.budgetUsdPerHour
  }

  setBudget(usd: number): void {
    this.data.budgetUsdPerHour = Math.max(0.01, Math.min(5, usd))
    this.write()
  }

  summary(): SettingsSummary {
    const describe = (provider: ProviderId) => {
      const key = this.key(provider)
      return { configured: Boolean(key), masked: key ? mask(key) : undefined }
    }
    return {
      providers: { openai: describe('openai'), anthropic: describe('anthropic') },
      roles: { ...this.data.roles },
      budgetUsdPerHour: this.data.budgetUsdPerHour,
      encryption: this.cipher.available(),
      models: Object.fromEntries(Object.entries(this.data.models ?? {}).map(([id, list]) => [id, list?.ids ?? []])),
      missing: this.missing(),
      ...(this.data.pictures ? { pictures: { ...this.data.pictures } } : {}),
    }
  }
}

export function mask(key: string): string {
  const prefix = key.startsWith('sk-ant-') ? 'sk-ant-' : key.startsWith('sk-') ? 'sk-' : ''
  return `${prefix}...${key.slice(-4)}`
}
