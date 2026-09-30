import { describe, expect, it } from 'vitest'
import { closeTop, escapeKey, openWindows, pushWindow } from '../src/renderer/src/windows'

// M10.33 A, one stack of windows. Cause: every window was an overlay with its own Escape listener, so one key closed
// them all, and the command bar kept working under them (LOOK, TALK and BUY behind the character sheet and the frames).
// Now a window joins one stack while it is open, Escape closes only the top one, and the command bar is off while the
// stack is not empty (checked in the browser: App.tsx disables the input with "close the window first").

const key = (k: string) => ({ key: k, prevented: false, stopped: false, preventDefault() { this.prevented = true }, stopImmediatePropagation() { this.stopped = true } })

describe('M10.33 A: one stack of windows', () => {
  it('closes only the window on top with Escape, and knows when windows are open', () => {
    const closed: string[] = []
    const leaveJournal = pushWindow(() => closed.push('talk'))
    const leaveTop = pushWindow(() => closed.push('journal'))
    expect(openWindows()).toBe(2)
    const esc = key('Escape')
    escapeKey(esc)
    expect(closed).toEqual(['journal'])
    expect(esc.prevented && esc.stopped).toBe(true)
    // The window leaves the stack as it closes (the component unmounts).
    leaveTop()
    // Another key does nothing to the windows.
    escapeKey(key('l'))
    expect(closed).toEqual(['journal'])
    expect(closeTop()).toBe(true)
    expect(closed).toEqual(['journal', 'talk'])
    leaveJournal()
    expect(openWindows()).toBe(0)
    // With nothing open, Escape is left alone.
    const idle = key('Escape')
    escapeKey(idle)
    expect(idle.prevented).toBe(false)
  })
})
