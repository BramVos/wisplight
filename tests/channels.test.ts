import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { missingChannels } from '../src/renderer/src/StaleBanner'

// The version check (M10.20): after Bram's first world build failed with
// "No handler registered for 'editor:world-step'" (an interface newer than
// its main process), every channel the preload calls has a handler in main,
// and the interface can tell when the running main process lacks one.

const source = (path: string) => readFileSync(resolve(import.meta.dirname, '..', path), 'utf8')

describe('the channels between the interface and the main process', () => {
  it('has a handler in main for every channel the preload calls', () => {
    const called = [...source('src/preload/index.ts').matchAll(/use\('([^']+)'\)/g)].map((m) => m[1]!)
    const handled = new Set([...source('src/main/index.ts').matchAll(/(?:^|\s)(?:handle|ipcMain\.handle)\('([^']+)'/gm)].map((m) => m[1]!))
    expect(called.length).toBeGreaterThan(40)
    expect(called.filter((c) => !handled.has(c))).toEqual([])
    expect(handled.has('app:handled')).toBe(true)
  })

  it('says what the running main process is missing, and everything when it is older than the check', () => {
    expect(missingChannels(['editor:world-step', 'editor:design'], ['editor:world-step', 'editor:design', 'engine:start'])).toEqual([])
    expect(missingChannels(['editor:world-step', 'editor:design'], ['editor:world-step'])).toEqual(['editor:design'])
    expect(missingChannels(['editor:world-step'], undefined)).toEqual(['app:handled', 'editor:world-step'])
  })
})
