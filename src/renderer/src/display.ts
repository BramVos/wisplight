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
  /** Moments as cards over the log (M10.11); off, they are lines like any other. */
  cards: boolean
  /** The dice of a check in brackets, "(Perception 12 vs DC 14: success)" (M10.33 R): off by default. */
  rolls: boolean
  /** Sound (M10.15): an ambient sound per place and a bell; on and soft by default. */
  sound: boolean
  volume: number
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
const DEFAULT: Display = { scale: 1, contrast: 'normal', map: 'dark', rules: true, cards: true, rolls: false, sound: true, volume: 0.25 }
const LOOKS: MapLook[] = ['dark', 'paper', 'bw']

export function loadDisplay(): Display {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Display> | null
    const scale = TEXT_SIZES.some((s) => s.scale === saved?.scale) ? saved!.scale! : DEFAULT.scale
    const volume = typeof saved?.volume === 'number' ? Math.min(1, Math.max(0, saved.volume)) : DEFAULT.volume
    return { scale, contrast: saved?.contrast === 'high' ? 'high' : 'normal', map: LOOKS.includes(saved?.map as MapLook) ? (saved!.map as MapLook) : 'dark', rules: saved?.rules !== false, cards: saved?.cards !== false, rolls: saved?.rolls === true, sound: saved?.sound !== false, volume }
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
/** Whether moments come as cards (M10.11), kept up to date when it changes in Settings. */
export function useShowCards(): boolean {
  const [on, setOn] = useState<boolean>(() => loadDisplay().cards)
  useEffect(() => {
    const changed = () => setOn(loadDisplay().cards)
    window.addEventListener('wisplight:display', changed)
    return () => window.removeEventListener('wisplight:display', changed)
  }, [])
  return on
}

/** Sound on or off and how loud (M10.15), kept up to date when it changes in Settings. */
export function useSoundSetting(): { on: boolean; volume: number } {
  const read = () => {
    const d = loadDisplay()
    return { on: d.sound, volume: d.volume }
  }
  const [setting, setSetting] = useState(read)
  useEffect(() => {
    const changed = () => setSetting(read())
    window.addEventListener('wisplight:display', changed)
    return () => window.removeEventListener('wisplight:display', changed)
  }, [])
  return setting
}

export function useShowRules(): boolean {
  const [on, setOn] = useState<boolean>(() => loadDisplay().rules)
  useEffect(() => {
    const changed = () => setOn(loadDisplay().rules)
    window.addEventListener('wisplight:display', changed)
    return () => window.removeEventListener('wisplight:display', changed)
  }, [])
  return on
}

/** Whether the dice of a check show (M10.33 R), as the setting says. */
export function useShowRolls(): boolean {
  const [on, setOn] = useState<boolean>(() => loadDisplay().rolls)
  useEffect(() => {
    const changed = () => setOn(loadDisplay().rolls)
    window.addEventListener('wisplight:display', changed)
    return () => window.removeEventListener('wisplight:display', changed)
  }, [])
  return on
}
