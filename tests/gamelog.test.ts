import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type SaveData } from '../src/engine'
import { format, GameLog, PART_BYTES } from '../src/node/gamelog'
import { SaveStore } from '../src/node/savegame'
import { content } from './helpers'

// The game log (FO, chapter 3, "Het spellogboek"): always written, never lost.

function game(seed = 21) {
  const log = new GameLog(':memory:')
  const session = log.start('game-1')
  const engine = new Engine(content, { seed, llm: new MockLlm('good') })
  engine.onLog((line) => log.write(session, line))
  const snapshot = (): SaveData => ({ ...engine.save(), session: { ...session, logId: log.position(session) } })
  return { log, session, engine, snapshot }
}

async function play(engine: Engine, commands: string[]) {
  for (const command of commands) await engine.handle(command)
}

describe('the game log', () => {
  it('records what the player typed and saw, and keeps events and replay data out of the story', async () => {
    const { log, session, engine } = game()
    await play(engine, ['north', 'east', 'talk mirte', 'What happened to the mill?', 'bye'])
    engine.tick(5)
    const story = log.recent(session, 100)
    expect(story.map((l) => l.kind)).not.toContain('replay')
    expect(story.map((l) => l.kind)).not.toContain('event')
    expect(story.map(format).join('\n')).toMatch(/\[Dinsdag 14 18:3\d\] > talk mirte/)
    expect(story.map((l) => l.text).join('\n')).toMatch(/De Zwaan/)
    expect(log.text(session)).toContain('> What happened to the mill?')
  })

  it('picks up exactly where the game stopped: the last save plus everything logged after it', async () => {
    const { log, session, engine, snapshot } = game()
    await play(engine, ['north', 'east'])
    engine.tick(20)
    const saved = snapshot()
    // After the save: more walking, time, and a conversation with model replies. Then the "crash".
    await play(engine, ['talk mirte', 'What happened to the mill?', '1', 'bye', 'west', 'north'])
    engine.tick(45)
    const tail = log.tail(session, saved.session!.logId)
    expect(tail.some((e) => e.k === 'ai')).toBe(true)
    const resumed = await Engine.resume(content, saved, tail)
    expect(resumed.state).toEqual(engine.state)
  })

  it('keeps what happened after a save when an older save is loaded, on its own branch', async () => {
    const { log, session, engine, snapshot } = game()
    await play(engine, ['north'])
    const saved = snapshot()
    await play(engine, ['east', 'talk mirte', 'What happened to the mill?'])
    expect(log.position(session)).toBeGreaterThan(saved.session!.logId)

    const branch = log.fork(session, saved.session!.logId)
    const loaded = Engine.fromSave(content, saved)
    loaded.onLog((line) => log.write(branch, line))
    log.append(branch, loaded.world.now, 'note', 'Loaded the save')
    await play(loaded, ['west'])

    const newStory = log.text(branch)
    expect(newStory).toContain('> north')
    expect(newStory).toContain('> west')
    expect(newStory).not.toContain('> talk mirte')
    expect(newStory).toMatch(/--- Loaded the save ---/)
    // The old branch is still there, whole.
    expect(log.text(session)).toContain('> talk mirte')
    // A save made right after loading resumes on the new branch without replaying the old one.
    const again: SaveData = { ...loaded.save(), session: { ...branch, logId: log.position(branch) } }
    const resumed = await Engine.resume(content, again, log.tail(branch, again.session!.logId))
    expect(resumed.state).toEqual(loaded.state)
  })

  it('stores the place in the log with each save, and finds the latest save', () => {
    const store = new SaveStore(':memory:')
    const { engine, snapshot } = game()
    store.save('manual', engine.save())
    store.save('auto', snapshot())
    expect(store.latest()!.session).toMatchObject({ game: 'game-1', branch: 1 })
    expect(store.load('manual')!.session).toBeUndefined()
  })

  it('reads the end and exports the whole of a long log without holding it in memory', () => {
    const log = new GameLog(':memory:')
    const root = log.start('long')
    for (let i = 0; i < 5000; i++) log.append(root, i, i % 2 ? 'out' : 'in', `line ${i}`)
    const branch = log.fork(root, 3000)
    for (let i = 0; i < 10; i++) log.append(branch, 9000 + i, 'in', `branch ${i}`)
    // The end of the branch: its own lines, then the root up to the fork, newest last.
    const last = log.recent(branch, 12)
    expect(last.map((l) => l.text)).toEqual(['line 2998', 'line 2999', ...Array.from({ length: 10 }, (_, i) => `branch ${i}`)])
    expect(log.recent(root, 1)[0]!.text).toBe('line 4999')
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-log-'))
    try {
      const file = join(dir, 'log.txt')
      expect(log.exportTo(branch, file)).toBe(3010)
      const text = readFileSync(file, 'utf8')
      expect(text.startsWith('[')).toBe(true)
      expect(text).toContain('> branch 9')
      expect(text).not.toContain('line 3000')
      expect(text.trimEnd()).toBe(log.text(branch))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('exports part of the story, and a large log as a zip of parts that unpacks to the same text', () => {
    const log = new GameLog(':memory:')
    const root = log.start('big')
    const day = 24 * 60
    for (let i = 0; i < 100; i++) log.append(root, i * day, 'in', `day ${i}`)
    const loaded = log.fork(root, 50)
    for (let i = 0; i < 10; i++) log.append(loaded, (200 + i) * day, 'in', `after load ${i}`)
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-export-'))
    try {
      expect(log.exportTo(loaded, join(dir, 'all.txt'))).toBe(60)
      expect(log.exportTo(loaded, join(dir, 'loaded.txt'), { kind: 'loaded' })).toBe(10)
      expect(log.exportTo(loaded, join(dir, 'week.txt'), { kind: 'days', days: 3 })).toBe(4)
      expect(log.size(loaded, { kind: 'loaded' })).toBeLessThan(log.size(loaded))

      // About 25 MB of text: three parts of at most 10 MB.
      const big = log.start('huge')
      const filler = 'x'.repeat(1000)
      for (let i = 0; i < 25_000; i++) log.append(big, i, 'out', `${i} ${filler}`)
      expect(log.size(big)).toBeGreaterThan(PART_BYTES)
      const zip = join(dir, 'huge.zip')
      expect(log.exportTo(big, zip)).toBe(25_000)
      expect(statSync(zip).size).toBeLessThan(2 * 1024 * 1024)
      const out = join(dir, 'unzipped')
      execFileSync('unzip', ['-q', zip, '-d', out])
      const parts = ['01', '02', '03'].map((n) => readFileSync(join(out, `wisplight-log-part-${n}.txt`), 'utf8'))
      for (const part of parts) expect(Buffer.byteLength(part)).toBeLessThanOrEqual(PART_BYTES)
      expect(parts.join('').trimEnd()).toBe(log.text(big))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
