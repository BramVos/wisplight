import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'

// M10.29 E and N, what you carry, from Bram's playtest of The Quiet Reach:
// "use short-range communicator" said there was no such thing here, "get
// pocket terminal from pack" that there was no pack, "l scuffed chip on a
// cord" found an exit, and Niko "gave" a notebook that was only words.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const isle = await loadContentFromDir(root, 'isle')

function stranger(content = quiet): Engine {
  const engine = new Engine(content, { seed: 1 })
  engine.start()
  return engine
}
const said = async (engine: Engine, line: string) => (await engine.handle(line)).map((o) => o.text).join('\n')

describe('M10.29 E and N: the things you carry', () => {
  it('uses a thing in the pack before the room, with or without an article', async () => {
    const engine = stranger()
    expect(await said(engine, 'use short-range communicator')).toMatch(/^You thumb the call key\./)
    expect(await said(engine, 'use a personal credit chip')).toMatch(/^The chip warms against your palm/)
    // A thing with nothing to do: turned over, never "there is no ... here".
    expect(await said(engine, 'use multitool')).toMatch(/You turn the multitool over in your hands; there is nothing to do with it here\./)
  })

  it('looks at a thing in the pack first, by its words, and says what you could do with it', async () => {
    const engine = stranger()
    expect(await said(engine, 'l terminal')).toMatch(/^A pocket terminal \(in your pack\)\. .* You could use it, read it or give it\.$/)
    expect(await said(engine, 'l scuffed chip on a cord')).toMatch(/^A personal credit chip \(in your pack\)/)
    expect(await said(engine, 'l on')).not.toMatch(/field ration/)
  })

  it('looks at a way before the pack: "l s" is south, never the short-range communicator (Bram\'s sessions of 29 September)', async () => {
    const engine = stranger()
    expect(await said(engine, 'l e')).toMatch(/^To the east:/)
    expect(await said(engine, 'l s')).toBe('You see no way south from here.')
    expect(await said(engine, 'l w')).toBe('You see no way west from here.')
    // Three letters or more find a word's start; fewer only a whole word.
    expect(await said(engine, 'l coa')).toMatch(/^A weatherproof coat \(in your pack\)/)
  })

  it('uses a light you carry: it lights the way (a bought lamp did nothing)', async () => {
    const engine = stranger()
    engine.state.player.inventory['field_lamp'] = 1
    expect(await said(engine, 'use lamp')).toBe('The field lamp lights your way in the dark while you carry it.')
    expect(await said(engine, 'l lamp')).toMatch(/You could use it or give it\.$/)
  })

  it('reads a thing in the pack before a person, and takes nothing out of a pack it is already in', async () => {
    const engine = stranger()
    engine.state.player.location = 'loc_commons'
    expect(await said(engine, 'read terminal')).toMatch(/^Your contract/)
    expect(await said(engine, 'read multitool')).toMatch(/There is nothing to read on the multitool\./)
    expect(await said(engine, 'get pocket terminal from pack')).toBe('You already carry the pocket terminal.')
  })

  it('Niko carries his notebook, and it can be read once it is yours', async () => {
    const engine = stranger()
    expect(engine.state.npcs['npc_niko_serrin']!.inventory['niko_notebook']).toBe(1)
    engine.state.player.inventory['niko_notebook'] = 1
    engine.state.player.location = 'loc_commons'
    expect(await said(engine, 'read notebook')).toMatch(/times, each written twice/)
  })

  it('Skerrow\'s conch can be blown', async () => {
    const engine = stranger(isle)
    engine.state.player.inventory['conch'] = 1
    expect(await said(engine, 'use conch')).toMatch(/^You blow the conch\./)
  })
})
