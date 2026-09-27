import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyEdits, entities, Engine, loadContent, type ContentFile } from '../src/engine'
import { readLock, withLock } from '../src/engine/edit'
import { readContentFiles } from '../src/node/content'
import { content } from './helpers'

// Milestone M9.1 (docs/ROADMAP.md): ids are keys. Names change, ids do not;
// what goes leaves a tombstone, and saves, logs and the chronicle follow it.

const root = resolve(import.meta.dirname, '../content')
const DAY = 24 * 60

async function say(engine: Engine, ...commands: string[]): Promise<string> {
  const out: string[] = []
  for (const c of commands) out.push(...(await engine.handle(c)).map((o) => o.text))
  return out.join('\n')
}

function edited(files: ContentFile[], ...edits: Parameters<typeof applyEdits>[1]) {
  const result = applyEdits(files, edits)
  expect(result.problems).toEqual([])
  return result
}

describe('M9.1: a name changes, an id does not', () => {
  it('an old save loads and its game log plays back exactly after a name changed in the editor', async () => {
    const engine = new Engine(content, { seed: 91, builder: true })
    await say(engine, 'n', 'e', 'talk mirte', '"Good morning. Any bread today?"', 'bye', 'w', 's')
    engine.tick(2 * DAY)
    await say(engine, 'n', 'e', 'talk mirte', '"Did the flour come?"', 'bye')
    const save = engine.save()
    // Mirte is called Marte now, and nothing answers to the old name.
    const files = await readContentFiles(root)
    const mirte = entities(files, 'npc').find((e) => e.id === 'npc_mirte')!
    const renamed = edited(files, { kind: 'npc', id: 'npc_mirte', data: { ...mirte.raw, name: 'Marte Bakker', short: 'Marte the baker', aliases: ['marte', 'baker'] } })
    expect(renamed.changes.map((c) => c.path)).not.toContain('base/ids.lock')
    const loaded = Engine.fromSave(renamed.content!, save)
    expect(loaded.world.npc('npc_mirte').name).toBe('Marte Bakker')
    loaded.tick(60)
    const replayed = await Engine.replay(renamed.content!, 91, save.log)
    expect(replayed.state).toEqual(engine.state)
    // It plays on with the new name.
    expect(replayed.world.npc('npc_mirte').name).toBe('Marte Bakker')
  }, 120_000)
})

describe('M9.1: the register of each world', () => {
  it('holds every id there is (npm run ids writes it; the editor keeps it)', async () => {
    for (const world of ['base', 'isle']) {
      const files = await readContentFiles(root, world)
      const lock = files.find((f) => f.path === `${world}/ids.lock`)
      expect(lock, `${world}/ids.lock`).toBeDefined()
      expect(withLock(files, readLock(files)).find((f) => f.path === lock!.path)!.text, 'run npm run ids').toBe(lock!.text)
    }
  })
})

describe('M9.1: no id goes without a tombstone', () => {
  it('loading names the id and where it was; the editor makes the tombstone itself', async () => {
    const files = await readContentFiles(root)
    // Cut out by hand: the register misses it.
    const cut = files.map((f) => (f.path === 'base/data/items.yaml' ? { ...f, text: f.text.replace(/\n {2}- id: brick\n(?: {4}.*\n)+/, '\n') } : f))
    expect(() => loadContent(cut)).toThrow(/the item brick \(in base\/data\/items\.yaml\) is missing, and there is no tombstone for it/)
    // Changing an id is refused.
    const brick = entities(files, 'item').find((e) => e.id === 'brick')!
    expect(applyEdits(files, [{ kind: 'item', id: 'brick', data: { ...brick.raw, id: 'baksteen' } }]).problems.join(' ')).toMatch(/the id cannot change/)
    // Deleting it in the editor leaves a tombstone, and the world loads (as long as nothing else needs it).
    const added = edited(files, { kind: 'item', id: 'test_cask', data: { id: 'test_cask', name: 'test cask', description: 'A cask for the test.', value: 1 } })
    expect(added.changes.map((c) => c.path)).toContain('base/ids.lock')
    const gone = edited(added.files, { kind: 'item', id: 'test_cask' })
    expect(gone.content!.lock!.tombstones).toContainEqual({ kind: 'item', id: 'test_cask' })
    // An id that went does not come back.
    expect(applyEdits(gone.files, [{ kind: 'item', id: 'test_cask', data: { id: 'test_cask', name: 'another', description: 'Another.', value: 1 } }]).problems.join(' ')).toMatch(/has a tombstone/)
  })

  it('a save with something removed or merged later loads and plays on by the tombstone', async () => {
    const files = await readContentFiles(root)
    const added = edited(
      files,
      { kind: 'item', id: 'test_cask', data: { id: 'test_cask', name: 'test cask', description: 'A cask for the test.', value: 1 } },
      { kind: 'npc', id: 'npc_test_tinker', data: { id: 'npc_test_tinker', name: 'Tobias Tinker', short: 'the tinker', pronoun: 'he', age: 40, profession: 'pedlar', home: 'loc_goose_rooms', appearance: 'A man with pots.', personality: { warmth: 0, courage: 0, honesty: 0, temper: 0, curiosity: 0, diligence: 0 }, public_facts: ['He mends pots.'] } },
    )
    const engine = new Engine(added.content!, { seed: 92 })
    engine.state.player.inventory['test_cask'] = 2
    engine.tick(DAY)
    const save = engine.save()
    expect(save.state.npcs['npc_test_tinker']).toBeDefined()
    // The cask went up in the barrel; the tinker is gone.
    const later = edited(added.files, { kind: 'item', id: 'test_cask', into: 'barrel' }, { kind: 'npc', id: 'npc_test_tinker' })
    const loaded = Engine.fromSave(later.content!, save)
    expect(loaded.state.player.inventory['barrel']).toBe(2)
    expect(loaded.state.player.inventory['test_cask']).toBeUndefined()
    expect(loaded.state.npcs['npc_test_tinker']).toBeUndefined()
    loaded.tick(DAY)
    expect(await say(loaded, 'inventory')).toMatch(/barrel/)
  }, 120_000)
})

describe('M9.1: a newcomer adopted into the world', () => {
  it('is the same person with the same id in the old save and in a new game', async () => {
    const engine = new Engine(content, { seed: 60 })
    for (let d = 0; d < 22; d++) engine.tick(DAY)
    const people = engine.state.growth!.people
    const head = people[0]!
    const save = engine.save()
    const files = await readContentFiles(root)
    const adopted = edited(files, ...people.map((p) => ({ kind: 'npc' as const, id: p.id, data: JSON.parse(JSON.stringify(p)) as Record<string, unknown>, create: true })))
    // The save: the same person, from the world now.
    const loaded = Engine.fromSave(adopted.content!, save)
    expect(loaded.content.npcs.get(head.id)).toBe(adopted.content!.npcs.get(head.id))
    expect(loaded.state.npcs[head.id]).toBeDefined()
    loaded.tick(DAY)
    // A new game has them from the start, with that id.
    const fresh = new Engine(adopted.content!, { seed: 1 })
    expect(fresh.state.npcs[head.id]).toBeDefined()
    // Adopting again is refused: the id is taken.
    expect(applyEdits(adopted.files, [{ kind: 'npc', id: head.id, data: JSON.parse(JSON.stringify(head)) as Record<string, unknown>, create: true }]).problems.join(' ')).toMatch(/already a npc with this id/)
  }, 120_000)
})
