import { cp, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { applyEdits, draftEdits, draftRequest, Engine, entities, ENTITY_KINDS, lineDiff, loadContent, MockLlm, readDraft, rewritten, same, simulate, withReturnExits, type ContentFile, type Output } from '../src/engine'
import { listWorlds, readContentFiles } from '../src/node/content'
import { ContentEditor } from '../src/node/editor'

// Milestone M8 (docs/ROADMAP.md): the editor. Everything that exists opens
// and saves without loss; new things go where things like them live; exits
// are made both ways; a proposal of the chronicler is a change to look at
// first; a hamlet with three people and a story needs no code; a new world
// starts from nothing; the world can run without the player for a report.

const root = resolve(import.meta.dirname, '../content')
const plain = (value: unknown) => JSON.parse(JSON.stringify(value, (_k, v: unknown) => (v instanceof Map ? Object.fromEntries(v) : v))) as unknown
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

async function copy(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'wisplight-editor-'))
  await cp(root, dir, { recursive: true })
  return dir
}

describe('M8: everything opens and saves without loss', () => {
  for (const world of ['base', 'isle']) {
    it(`every entity of ${world}: saved as it is, nothing changes; written again, nothing is lost`, async () => {
      const files = await readContentFiles(root, world)
      const original = new Map(files.map((f) => [f.path, f.path.endsWith('.md') ? f.text : parse(f.text)]))
      let count = 0
      for (const kind of ENTITY_KINDS) {
        for (const e of entities(files, kind)) {
          count++
          expect(applyEdits(files, [{ kind, id: e.id, data: e.raw }]).changes, `${kind} ${e.id}`).toEqual([])
          const again = rewritten(files, kind, e.id).find((f) => f.path === e.file)!
          expect(same(parse(again.text), original.get(e.file)), `${kind} ${e.id}`).toBe(true)
        }
      }
      expect(count).toBeGreaterThan(world === 'base' ? 250 : 50)
    }, 60_000)

    it(`${world}: changed in the editor and changed back, the world loads exactly as before`, async () => {
      const files = await readContentFiles(root, world)
      const original = plain(loadContent(files))
      // Every kind, and a spread of each: loading the whole world after every edit takes a while.
      for (const kind of ENTITY_KINDS) {
        const list = entities(files, kind)
        for (const e of list.filter((_, i) => i % Math.max(1, Math.ceil(list.length / 4)) === 0)) {
          const field = ['name', 'title', 'summary', 'scene', 'description'].find((f) => typeof e.raw[f] === 'string')
          if (!field) continue
          const changed = applyEdits(files, [{ kind, id: e.id, data: { ...e.raw, [field]: `${String(e.raw[field])} again` } }])
          expect(changed.ok, `${kind} ${e.id}: ${changed.problems.join('; ')}`).toBe(true)
          const back = applyEdits(changed.files, [{ kind, id: e.id, data: e.raw }])
          expect(back.ok).toBe(true)
          // Only the entity's own file changed, and the world loads exactly as before.
          expect(back.changes.map((c) => c.path)).toEqual([e.file])
          expect(same(plain(back.content), original), `${kind} ${e.id}`).toBe(true)
        }
      }
    }, 60_000)
  }

  it('changes one line of a file and leaves every other byte alone', async () => {
    const files = await readContentFiles(root, 'isle')
    const kettle = entities(files, 'location').find((e) => e.id === 'loc_skerrow_salt_kettle')!
    const result = applyEdits(files, [{ kind: 'location', id: kettle.id, data: { ...kettle.raw, name: 'The Old Salt Kettle' } }])
    const change = result.changes[0]!
    const diff = lineDiff(change.before!, change.text).filter((l) => l.kind === '+' || l.kind === '-')
    expect(diff).toEqual([
      { kind: '-', text: '    name: The Salt Kettle' },
      { kind: '+', text: '    name: The Old Salt Kettle' },
    ])
  })
})

describe('M8: new things, deleted things, and exits both ways', () => {
  it('puts a new thing next to others like it, and a new area in a folder of its own', async () => {
    const files = await readContentFiles(root, 'isle')
    const result = applyEdits(
      files,
      withReturnExits(files, [
        { kind: 'area', id: 'skerrow_moor', data: { id: 'skerrow_moor', name: 'the Moor', kind: 'wilderness', summary: 'Heather and wind.' } },
        { kind: 'location', id: 'loc_skerrow_moor', data: { id: 'loc_skerrow_moor', name: 'The Moor', area: 'skerrow_moor', tags: ['public'], description: { day: 'Heather runs to the sky. The wind hums in your ears. The grove is back south.\n' }, exits: { south: { to: 'loc_skerrow_wyrm_barrow' } } } },
        { kind: 'topic', id: 'the_moor', data: { id: 'the_moor', name: 'the Moor', kind: 'place', summary: 'Heather.', origin: 'skerrow_moor' } },
      ]),
    )
    expect(result.problems).toEqual([])
    expect(result.changes.map((c) => c.path).sort()).toEqual(['isle/areas/heights/locations.yaml', 'isle/areas/skerrow_moor/locations.yaml', 'isle/data/areas.yaml', 'isle/data/topics.yaml'])
    // The barrow got the way back.
    expect(result.content!.locations.get('loc_skerrow_wyrm_barrow')!.exits.north?.to).toBe('loc_skerrow_moor')
  })

  it('refuses what does not load, and changes nothing', async () => {
    const files = await readContentFiles(root, 'isle')
    const pip = entities(files, 'npc').find((e) => e.id === 'npc_pip')!
    const result = applyEdits(files, [{ kind: 'npc', id: 'npc_pip', data: { ...pip.raw, home: 'loc_nowhere' } }])
    expect(result.ok).toBe(false)
    expect(result.problems.join(' ')).toMatch(/loc_nowhere/)
    expect(result.changes).toEqual([])
    expect(applyEdits(files, [{ kind: 'npc', id: 'npc_pip', data: { ...pip.raw, id: 'npc_pippin' } }]).problems.join(' ')).toMatch(/id cannot change/)
  })

  it('deletes a place, with the exits that led there', async () => {
    const files = await readContentFiles(root, 'isle')
    const result = applyEdits(files, withReturnExits(files, [{ kind: 'location', id: 'loc_skerrow_tidepools' }]))
    expect(result.problems).toEqual([])
    expect(result.content!.locations.has('loc_skerrow_tidepools')).toBe(false)
    expect(Object.values(result.content!.locations.get('loc_skerrow_wreck_strand')!.exits).some((e) => e?.to === 'loc_skerrow_tidepools')).toBe(false)
    const shore = result.changes.find((c) => c.path === 'isle/areas/shore/locations.yaml')!
    expect(shore.text).not.toMatch(/\n\n\n/)
    expect(shore.text).toContain('  - id: loc_skerrow_cliff_path')
  })
})

describe('M8: the chronicler proposes, the designer decides', () => {
  it('shows a hamlet as a change, checked, and saves nothing until it is accepted', async () => {
    const files = await readContentFiles(root, 'isle')
    const before = files.map((f) => f.text)
    const request = draftRequest(files, 'A small hamlet near here, with three people and a story.', { kind: 'location', id: 'loc_skerrow_green' })
    expect(request.role).toBe('chronicler')
    expect(request.system).toContain('## This world: Skerrow')
    expect(request.prompt).toContain('IN VIEW (location loc_skerrow_green)')
    const draft = readDraft(files, (await new MockLlm().complete(request)).text)
    expect(draft.problems).toEqual([])
    expect(draft.changes.map((c) => c.id)).toContain('the_dry_well')
    // A change to look at, for every file it touches.
    const diff = draft.result!.changes.find((c) => c.path === 'isle/areas/hythe/locations.yaml')!
    expect(lineDiff(diff.before!, diff.text).filter((l) => l.kind === '+').map((l) => l.text.trim())).toEqual([expect.stringMatching(/^[a-z]+: \{ to: loc_nettlecombe_green, minutes: 20 \}$/)])
    expect(files.map((f) => f.text)).toEqual(before)
    // Accepted: saved, and the hamlet is playable at once.
    const accepted = applyEdits(files, draftEdits(draft))
    expect(accepted.ok).toBe(true)
    const engine = new Engine(accepted.content!, { seed: 1, builder: true })
    engine.start()
    const out = text(await engine.handle('@goto loc_skerrow_green')) + text(await engine.handle(`${Object.entries(accepted.content!.locations.get('loc_skerrow_green')!.exits).find(([, e]) => e?.to === 'loc_nettlecombe_green')![0]}`))
    expect(out).toContain('Nettlecombe, the Green')
    await engine.handle('@bring hob')
    expect(text(await engine.handle('talk to hob'))).toContain('New quest: The Dry Well.')
    await engine.handle('bye')
    expect(text(await engine.handle('clear the well'))).toContain('The Dry Well: The well cleared.')
  })

  it('asks back when a choice belongs to the designer, and refuses a reply it cannot read', async () => {
    const files = await readContentFiles(root, 'isle')
    const question = readDraft(files, (await new MockLlm().complete(draftRequest(files, 'Give Henk a cat.'))).text)
    expect(question.changes).toEqual([])
    expect(question.questions.length).toBeGreaterThan(0)
    const broken = readDraft(files, (await new MockLlm('invalid').complete(draftRequest(files, 'A hamlet.'))).text)
    expect(broken.problems).toEqual(['The chronicler did not answer in the agreed form.'])
  })
})

describe('M8: the editor on disk', () => {
  it('writes only inside the content folder, and a running game can take the change', async () => {
    const dir = await copy()
    const editor = new ContentEditor(dir)
    const maren = (await editor.entity('isle', 'npc', 'npc_maren'))!
    expect(maren.yaml).toMatch(/^id: npc_maren\nname: Maren Holt\n/)
    const saved = await editor.save('isle', [{ kind: 'npc', id: 'npc_maren', data: { ...maren.raw, age: 55 } }])
    expect(saved.ok).toBe(true)
    expect(await readFile(join(dir, 'isle/areas/hythe/npcs.yaml'), 'utf8')).toContain('    age: 55\n')
    // A look does not write.
    const look = await editor.save('isle', [{ kind: 'npc', id: 'npc_maren', data: { ...maren.raw, age: 56 } }], false)
    expect(look.ok).toBe(true)
    expect(await readFile(join(dir, 'isle/areas/hythe/npcs.yaml'), 'utf8')).toContain('    age: 55\n')
    await expect(editor.save('isle', [{ kind: 'topic', id: 'sneaky', data: { id: 'sneaky', name: 'x', kind: 'fact', summary: 'x' }, file: '../../etc/passwd.yaml' }])).resolves.toMatchObject({ ok: false })
  })

  it('makes a new world that loads and can be played', async () => {
    const dir = await copy()
    const editor = new ContentEditor(dir)
    expect((await editor.createWorld('moorland', 'The Moorland')).ok).toBe(true)
    expect((await editor.createWorld('moorland', 'Again')).ok).toBe(false)
    expect((await listWorlds(dir)).map((w) => w.folder)).toEqual(['base', 'isle', 'moorland'])
    const files: ContentFile[] = await readContentFiles(dir, 'moorland')
    const engine = new Engine(loadContent(files), { seed: 1 })
    expect(text(engine.start())).toContain('You arrive in The Moorland.')
    expect((await editor.view('moorland')).problems).toEqual([])
  })
})

describe('M8: playtest without the player', () => {
  it('runs Skerrow for a week and reports on the world, the quests and every person', async () => {
    const report = simulate(loadContent(await readContentFiles(root, 'isle')), 7, 3)
    expect(report.problems).toEqual([])
    expect(report.diary).toHaveLength(7)
    expect(report.quests).toEqual([{ id: 'off_skerrow', name: 'Off Skerrow', state: 'running, at stranded' }])
    expect(report.people.map((p) => p.id)).toContain('npc_wenna')
    const wenna = report.people.find((p) => p.id === 'npc_wenna')!
    expect(Object.keys(wenna.needs)).toContain('hunger')
    expect(report.to).toMatch(/^Windsday 10 Leaffall 412 SF/)
  })
})
