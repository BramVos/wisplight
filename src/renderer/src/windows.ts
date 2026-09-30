import { useEffect, useRef } from 'react'

// One stack of windows (M10.33 A). The cause of what Bram's log and the review
// found (LOOK, TALK and BUY going on behind the character sheet and the frames,
// a talk after BYE left standing): every window was an overlay with its own
// Escape listener, so one key closed them all, and the command bar kept
// working under them. Now a window joins the stack while it is open; Escape
// closes only the one on top, and the command bar knows when anything is open.

type Entry = { id: number; close: () => void }

const stack: Entry[] = []
let next = 1
const listeners = new Set<() => void>()

/** Joins the stack with what closes the window; the returned function leaves it. */
export function pushWindow(close: () => void): () => void {
  const entry = { id: next++, close }
  stack.push(entry)
  listeners.forEach((l) => l())
  return () => {
    const at = stack.indexOf(entry)
    if (at >= 0) stack.splice(at, 1)
    listeners.forEach((l) => l())
  }
}

/** Closes the window on top, if any: what Escape does. */
export function closeTop(): boolean {
  const top = stack.at(-1)
  if (!top) return false
  top.close()
  return true
}

/** How many windows are open. */
export function openWindows(): number {
  return stack.length
}

/** Called whenever a window opens or closes. */
export function onWindows(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** One Escape for the whole app, before any window's own keys: the top window closes, nothing under it. */
export function escapeKey(event: { key: string; preventDefault(): void; stopImmediatePropagation(): void }): void {
  if (event.key !== 'Escape' || !stack.length) return
  event.preventDefault()
  event.stopImmediatePropagation()
  closeTop()
}

let installed = false

/** Installs the one Escape listener, once. */
export function installWindowKeys(target: { addEventListener(type: 'keydown', listener: (event: KeyboardEvent) => void, capture: boolean): void }): void {
  if (installed) return
  installed = true
  target.addEventListener('keydown', escapeKey, true)
}

/** A component that is a window while `open`: it joins the stack, and Escape closes it when it is on top. */
export function useWindow(onClose: () => void, open = true): void {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    if (typeof window !== 'undefined') installWindowKeys(window)
    return pushWindow(() => close.current())
  }, [open])
}
