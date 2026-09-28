import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { SettingsStore, type Cipher } from '../src/node/ai/settings'

// M10.20: two instances of the app do not write each other's settings over
// (the build of The Quiet Reach, 28 September 2026: an older instance still
// held $5 in memory and wrote its whole state back over Bram's $50). Each
// change reads the file again and writes only itself; a reader sees the
// other's change.

const folders: string[] = []
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})
const plain: Cipher = { available: () => true, encrypt: (s) => `enc:${s}`, decrypt: (s) => s.replace(/^enc:/, '') }

describe('M10.20: settings written per change', () => {
  it('keeps both instances\' changes when they change one key each in turn', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-m1020settings-'))
    folders.push(dir)
    const path = join(dir, 'settings.json')
    const one = new SettingsStore(path, plain)
    const two = new SettingsStore(path, plain)
    one.setBudget(50)
    // The second instance never saw 50 in memory, and changes something else.
    two.setReplyWithin(20)
    two.setKey('anthropic', 'not-a-real-key')
    await new Promise((r) => setTimeout(r, 5))
    one.setRole('chronicler', { provider: 'anthropic', model: 'claude-opus-5-5' })
    const three = new SettingsStore(path, plain)
    expect(three.budgetUsdPerHour).toBe(50)
    expect(three.replyWithinSeconds).toBe(20)
    expect(three.key('anthropic')).toBe('not-a-real-key')
    expect(three.role('chronicler')).toEqual({ provider: 'anthropic', model: 'claude-opus-5-5' })
    // Each reads the other's change without being made again.
    expect(two.budgetUsdPerHour).toBe(50)
    expect(one.replyWithinSeconds).toBe(20)
  })
})
