import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'
import { complete } from '../src/renderer/src/complete'

// M10.29 K, Tab completes (Bram's playtest of The Quiet Reach): in both
// inputs Tab completes the last word from the names of the journal, the
// people here, the ways out and the things of the room; several are offered
// on a line ("Documents, Door"); Shift-Tab keeps moving the focus.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')

describe('M10.29 K: Tab completes', () => {
  it('completes the last word from the start of a name or of a word in it', () => {
    const names = ['Mara Venn', 'Mara', 'pocket terminal', 'Documents', 'Door', 'east']
    expect(complete('look at poc', names)).toEqual({ text: 'look at pocket terminal ', options: [] })
    expect(complete('read ter', names)).toEqual({ text: 'read terminal ', options: [] })
    expect(complete('go ea', names)).toEqual({ text: 'go east ', options: [] })
    // Several: as far as they agree, and the names to choose from.
    expect(complete('talk to mar', names)).toEqual({ text: 'talk to Mara', options: ['Mara', 'Mara Venn'] })
    expect(complete('l do', names)).toEqual({ text: 'l do', options: ['Door', 'Documents'] })
    // Nothing fits, or nothing to complete: as it was.
    expect(complete('wait ', names)).toEqual({ text: 'wait ', options: [] })
    expect(complete('xyz', names)).toEqual({ text: 'xyz', options: [] })
  })

  it('the engine gives the names of the journal, the people here as known, the ways, the room and the pack', async () => {
    const engine = new Engine(quiet, { seed: 1 })
    engine.start()
    engine.state.player.location = 'loc_commons'
    const mara = engine.state.npcs['npc_mara_venn']!
    mara.location = 'loc_commons'
    mara.activity = 'standing about'
    const before = engine.status().completions!
    // Someone never met is what they seem to be, never their name.
    expect(before).toContain('port coordinator')
    expect(before).not.toContain('Mara Venn')
    expect(before).toEqual(expect.arrayContaining(['pocket terminal', 'short-range communicator', ...Object.keys(engine.world.location('loc_commons').exits)]))
    await engine.handle('talk port coordinator')
    await engine.handle('bye')
    const after = engine.status().completions!
    expect(after).toEqual(expect.arrayContaining(['Mara Venn', 'Mara']))
    // Each name once, whatever its case.
    expect(new Set(after.map((n) => n.toLowerCase())).size).toBe(after.length)
  })
})
