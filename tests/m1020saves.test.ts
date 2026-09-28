import { describe, expect, it } from 'vitest'
import { Engine, readSaveFile, saveAbout, saveFileName, saveFileText, type SaveFile } from '../src/engine'
import { SaveStore } from '../src/node/savegame'
import { content } from './helpers'

// Milestone M10.20 (docs/ROADMAP.md), the saves: a save says what it is and
// may have a name, a named save is never cleared with the old ones, and a
// save is a file to keep and bring back that plays on where it stopped.

async function played(): Promise<Engine> {
  const engine = new Engine(content, { seed: 61 })
  engine.start()
  for (const command of ['n', 'look', 'wait 30']) await engine.handle(command)
  return engine
}

function fileOf(engine: Engine, name?: string): SaveFile {
  const data = engine.save()
  return { format: 'wisplight-save', version: 1, world: content.world.id, worldName: content.world.name, content: engine.saved().content, ...(name ? { name } : {}), saved: '2026-09-28T18:00:00.000Z', about: saveAbout(engine.world), chronicle: engine.chronicleMarkdown(), save: data }
}

describe('M10.20: a save as a file', () => {
  it('exports and imports a save, and the game plays on from exactly there', async () => {
    const engine = await played()
    const text = saveFileText(fileOf(engine))
    // Readable: what it is and the chronicle first, a line to a line.
    expect(text).toMatch(/^\{\n {2}"format": "wisplight-save",\n {2}"version": 1,\n {2}"world": "nethermarch",/)
    expect(text).toMatch(/\n {2}"chronicle": \[\n {4}"# What happened in this game",\n/)
    const read = readSaveFile(text)
    if ('problem' in read) throw new Error(read.problem)
    expect(read.file.about).toEqual(saveAbout(engine.world))
    expect(read.file.chronicle).toBe(engine.chronicleMarkdown())
    const back = await Engine.restore(content, read.file.save)
    expect(JSON.stringify(back.state)).toBe(JSON.stringify(engine.state))
    // Both go on the same way.
    for (const command of ['s', 'look']) expect(await back.handle(command)).toEqual(await engine.handle(command))
    // In the store it is a named save, with what it is.
    const store = new SaveStore(':memory:')
    const id = store.save('manual', read.file.save, 5, { name: 'at the green', about: read.file.about })
    expect(store.list()).toEqual([expect.objectContaining({ id, world: 'nethermarch', name: 'at the green', about: read.file.about })])
    const again = await Engine.restore(content, store.loadId(id)!)
    expect(again.world.now).toBe(read.file.save.state.minutes)
  })

  it('refuses what is not a save, or not one this version reads; newer content still loads it', async () => {
    expect(readSaveFile('not json')).toEqual({ problem: 'This is not a Wisplight save: it is not JSON.' })
    expect(readSaveFile(JSON.stringify({ format: 'something else' }))).toMatchObject({ problem: expect.stringMatching(/^This is not a Wisplight save this version can read/) })
    const engine = await played()
    const two = fileOf(engine)
    expect(readSaveFile(saveFileText({ ...two, save: { ...two.save, world: 'elsewhere' } }))).toEqual({ problem: 'This save says it belongs to two worlds.' })
    // Saved with other content: it loads as an old save loads.
    const older = readSaveFile(saveFileText({ ...two, content: '0000000000000000', save: { ...two.save, content: '0000000000000000' } }))
    if ('problem' in older) throw new Error(older.problem)
    await expect(Engine.restore(content, older.file.save)).resolves.toBeInstanceOf(Engine)
    // Its name is plain: world, who, the day.
    expect(saveFileName('base', { character: 'Aleid of the Fen!', place: 'x', day: 'y' }, new Date('2026-09-28T12:00:00Z'))).toBe('base-aleid-of-the-fen-2026-09-28.wisplight')
  })
})

describe('M10.20: saves with a name and what they are', () => {
  it('a named save is never cleared away, however many come after it', async () => {
    const engine = await played()
    const store = new SaveStore(':memory:')
    const named = store.save('auto', engine.saved(), 5, { name: 'before the mill', about: saveAbout(engine.world) })
    for (let i = 0; i < 8; i++) {
      engine.tick(10)
      store.save('auto', engine.saved(), 5, { about: saveAbout(engine.world) })
    }
    const list = store.list()
    expect(list.filter((s) => !s.name)).toHaveLength(5)
    expect(list.find((s) => s.id === named)?.name).toBe('before the mill')
    expect(list[0]!.about).toEqual(saveAbout(engine.world))
    // A name taken away makes it an ordinary save again; the latest of a world is the newest.
    store.rename(named, '  ')
    expect(store.list().find((s) => s.id === named)?.name).toBeUndefined()
    expect((await Engine.restore(content, store.latest('nethermarch')!)).world.now).toBe(engine.world.now)
    expect(store.latest('skerrow')).toBeUndefined()
  })
})
