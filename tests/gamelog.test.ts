import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type SaveData } from '../src/engine'
import { format, GameLog } from '../src/node/gamelog'
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
})
