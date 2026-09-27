// How the game looks to the player (M9.4, FO chapter 18: text size and
// contrast can be set). A per-player preference of this computer, kept in the
// window's own storage; without storage the defaults hold.

export type Contrast = 'normal' | 'high'

export interface Display {
  /** Multiplies every text size. */
  scale: number
  contrast: Contrast
}

/** The text sizes; each label is a key in locales/<language>/settings.json. */
export const TEXT_SIZES = [
  { scale: 0.9, label: 'settings.display.sizes.smaller' },
  { scale: 1, label: 'settings.display.sizes.normal' },
  { scale: 1.15, label: 'settings.display.sizes.larger' },
  { scale: 1.3, label: 'settings.display.sizes.large' },
  { scale: 1.5, label: 'settings.display.sizes.largest' },
] as const

const KEY = 'wisplight.display'
const DEFAULT: Display = { scale: 1, contrast: 'normal' }

export function loadDisplay(): Display {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Display> | null
    const scale = TEXT_SIZES.some((s) => s.scale === saved?.scale) ? saved!.scale! : DEFAULT.scale
    return { scale, contrast: saved?.contrast === 'high' ? 'high' : 'normal' }
  } catch {
    return DEFAULT
  }
}

export function applyDisplay(display: Display): void {
  document.documentElement.style.setProperty('--text-scale', String(display.scale))
  if (display.contrast === 'high') document.documentElement.dataset['contrast'] = 'high'
  else delete document.documentElement.dataset['contrast']
}

export function saveDisplay(display: Display): void {
  applyDisplay(display)
  try {
    localStorage.setItem(KEY, JSON.stringify(display))
  } catch {
    // No storage (a private window): it holds until the window closes.
  }
}
