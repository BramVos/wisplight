// How the game looks to the player (M9.4, FO chapter 18: text size and
// contrast can be set). A per-player preference of this computer, kept in the
// window's own storage; without storage the defaults hold.

import { useEffect, useState } from 'react'

export type Contrast = 'normal' | 'high'
/** How the map looks (M10): dark by default, paper, or black and white. */
export type MapLook = 'dark' | 'paper' | 'bw'

export interface Display {
  /** Multiplies every text size. */
  scale: number
  contrast: Contrast
  map: MapLook
  /** Speech that did not come from the AI in a warmer tint (M10.8): on while Bram playtests. */
  rules: boolean
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
const DEFAULT: Display = { scale: 1, contrast: 'normal', map: 'dark', rules: true }
const LOOKS: MapLook[] = ['dark', 'paper', 'bw']

export function loadDisplay(): Display {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Display> | null
    const scale = TEXT_SIZES.some((s) => s.scale === saved?.scale) ? saved!.scale! : DEFAULT.scale
    return { scale, contrast: saved?.contrast === 'high' ? 'high' : 'normal', map: LOOKS.includes(saved?.map as MapLook) ? (saved!.map as MapLook) : 'dark', rules: saved?.rules !== false }
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
  window.dispatchEvent(new CustomEvent('wisplight:display'))
  try {
    localStorage.setItem(KEY, JSON.stringify(display))
  } catch {
    // No storage (a private window): it holds until the window closes.
  }
}

/** The look of the map, kept up to date when it changes in Settings (M10). */
export function useMapLook(): MapLook {
  const [look, setLook] = useState<MapLook>(() => loadDisplay().map)
  useEffect(() => {
    const changed = () => setLook(loadDisplay().map)
    window.addEventListener('wisplight:display', changed)
    return () => window.removeEventListener('wisplight:display', changed)
  }, [])
  return look
}

/** Whether speech that did not come from the AI shows in its own tint (M10.8), kept up to date with Settings. */
export function useShowRules(): boolean {
  const [on, setOn] = useState<boolean>(() => loadDisplay().rules)
  useEffect(() => {
    const changed = () => setOn(loadDisplay().rules)
    window.addEventListener('wisplight:display', changed)
    return () => window.removeEventListener('wisplight:display', changed)
  }, [])
  return on
}
