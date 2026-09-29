import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { APP_KNOBS } from '../src/engine'
import { AiLog, fullLogFile, fullLogOf, type AiLogEntry } from '../src/node/ai/log'

// M10.29 U, the AI log as a file beside the story log (Bram, 29 September
// 2026): with the app knob ai_log_full on, every model call is written out
// whole, per game and per day, and `log export` takes the calls of the same
// stretch along; never a key.

const entry = (time: string, over: Partial<AiLogEntry> = {}): AiLogEntry => ({
  time,
  source: 'game',
  role: 'voice',
  kind: 'talk_reply',
  provider: 'anthropic',
  model: 'claude-haiku-4-5',
  ok: true,
  latencyMs: 2400,
  inputTokens: 5200,
  outputTokens: 80,
  cachedTokens: 4800,
  costUsd: 0.0021,
  prompt: 'x',
  response: '"Morning," she says.',
  ...over,
})

describe('M10.29 U: the full AI log', () => {
  it('is an app knob, off unless the player turns it on', () => {
    expect(APP_KNOBS.ai_log_full).toMatchObject({ default: 0, min: 0, max: 1 })
  })

  it('writes every call whole, with its kind, model, cost, cache and seconds, and what the guard did; never a key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-ailog-'))
    try {
      let on = true
      const log = new AiLog(join(dir, 'ai.jsonl'), () => 200, (e) => (on ? fullLogFile(dir, 'game-1', e.time) : undefined))
      const long = `THE STRANGER SAYS: ${'word '.repeat(3000)}end of the prompt, and a key sk-ant-abcdefghijklmnopqrstu that must not show`
      log.add(entry('2026-09-30T10:00:00.000Z', { prompt: long }), { system: 'WORLD: The Quiet Reach.', turns: [{ role: 'user', text: 'Hello.' }], prompt: long })
      log.reject('voice', 'leak')
      log.fix('voice', 'oath: by the hull')
      on = false
      log.add(entry('2026-09-30T10:05:00.000Z'))
      const text = readFileSync(fullLogFile(dir, 'game-1', '2026-09-30'), 'utf8')
      expect(text).toMatch(/^## 2026-09-30T10:00:00\.000Z {2}voice {2}talk_reply\n/)
      expect(text).toContain('Model: anthropic/claude-haiku-4-5; answered; $0.0021; out 80; cache: in 5200, read from the cache 4800; 2.4 s.')
      expect(text).toContain('### The fixed part\n\nWORLD: The Quiet Reach.')
      expect(text).toContain('### The talk so far\n\nuser: Hello.')
      // Uncut, where the short log cuts at 4,000.
      expect(text).toContain('end of the prompt')
      expect(text).not.toContain('sk-ant-abcdefghijklmnopqrstu')
      expect(text).toContain('Guard (voice): threw the answer away: leak')
      expect(text).toContain('Guard (voice): put right: oath: by the hull')
      // Off again: nothing more goes in.
      expect(text).not.toContain('10:05:00')
      expect(readFileSync(join(dir, 'ai.jsonl'), 'utf8')).not.toContain('end of the prompt')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('gives the calls of a game from a moment on, for the export beside the story log', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-ailog-'))
    try {
      const log = new AiLog(undefined, () => 200, (e) => fullLogFile(dir, e.source === 'game' ? 'game-1' : String(e.source), e.time))
      log.add(entry('2026-09-29T23:00:00.000Z', { response: 'yesterday' }))
      log.add(entry('2026-09-30T09:00:00.000Z', { response: 'this morning' }))
      log.add(entry('2026-09-30T09:30:00.000Z', { source: 'editor', response: 'an editor call' }))
      const all = fullLogOf(dir, 'game-1')!
      expect(all).toContain('yesterday')
      expect(all).toContain('this morning')
      expect(all).not.toContain('an editor call')
      const since = fullLogOf(dir, 'game-1', '2026-09-30T08:00:00.000Z')!
      expect(since).not.toContain('yesterday')
      expect(since).toContain('this morning')
      expect(fullLogOf(dir, 'another-game')).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
