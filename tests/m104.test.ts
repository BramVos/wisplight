import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { relation } from '../src/engine/dialogue/relations'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// Milestone M10.4 (docs/ROADMAP.md): small improvements from the Skerrow
// playtest of 27 September 2026: commands, the interface and the settings.

const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')
const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

describe('M10.4: commands', () => {
  it('GET ALL takes everything here, and GET A, B AND C several things; DROP, BUY and SELL likewise', async () => {
    const engine = new Engine(isle, { seed: 7 })
    const world = engine.world
    expect(said(await engine.handle('get sailcloth, rope and oil'))).toMatch(/You pick up a bolt of sailcloth\.[\s\S]*You pick up a coil of rope\.[\s\S]*You pick up/)
    expect(world.state.player.inventory['rope']).toBe(1)
    await engine.handle('drop sailcloth and rope')
    expect(world.state.player.inventory['rope'] ?? 0).toBe(0)
    expect(said(await engine.handle('get all'))).toMatch(/You pick up/)
    expect(world.state.player.inventory['sailcloth']).toBe(1)
    expect(said(await engine.handle('drop all'))).toMatch(/You put down/)
    expect(world.state.player.inventory['sailcloth'] ?? 0).toBe(0)
  })

  it('LOOK ME, LOOK AT ME and L ME describe you: how you look, what you hold and wear, how you are; the sheet says so too', async () => {
    const engine = new Engine(content, { seed: 7 })
    await engine.handle('create warden heathborn peat_cutter name=Joost look=Broad,_with_a_broken_nose')
    const me = said(await engine.handle('look me'))
    expect(me).toMatch(/^You are Joost, a heathborn warden\. Broad, with a broken nose\./)
    expect(me).toMatch(/You are well enough\.|You are /)
    expect(said(await engine.handle('look at me'))).toBe(me)
    expect(said(await engine.handle('l me'))).toBe(me)
    engine.state.player.character!.hp = 2
    expect(said(await engine.handle('look me'))).toMatch(/badly hurt/)
    expect(engine.page('sheet')?.lines.join('\n')).toMatch(/Looks: Broad, with a broken nose/)
  })

  it('LOOK SOUTH and LOOK AT THE TIDEPOOLS tell what lies that way and the way there', async () => {
    const engine = new Engine(isle, { seed: 7 })
    expect(said(await engine.handle('look east'))).toMatch(/^To the east: The Tidepools\. .+ It is (a few steps|\d+ minutes on foot)\./)
    expect(said(await engine.handle('look at the tidepools'))).toMatch(/^To the east: The Tidepools\./)
  })

  it('LOOK <thing> says where it is, and a thing of an object here comes first; TAKE of it gets its own line', async () => {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    world.state.player.inventory['apple'] = 1
    world.state.player.location = 'loc_veenhoek_green'
    expect(said(await engine.handle('look apple'))).toMatch(/\(in your pack\)/)
    // On the quay, by the old stone with the dog on it.
    world.state.player.location = 'loc_veenhoek_quay'
    expect(said(await engine.handle('look apple'))).toMatch(/An apple on top of the stone, left for the dog/)
    expect(said(await engine.handle('get apple'))).toMatch(/You leave it be\. It isn't yours/)
    expect(world.state.player.inventory['apple']).toBe(1)
  })
})

describe('M10.4: family on a card', () => {
  it('shows family only once heard of or seen; until then, unknown', async () => {
    const engine = new Engine(isle, { seed: 7 })
    const world = engine.world
    relation(engine.state, 'npc_brannoc').familiarity = 10
    ;(world.state.player.journal ??= {})['npc_brannoc'] = world.now
    const before = engine.page('npc_brannoc')
    expect([...(before?.lines ?? []), ...(before?.links ?? []).map((l) => l.name)].join('\n')).not.toMatch(/Pip/)
    expect(before?.lines.join('\n')).toMatch(/Family: unknown\./)
    // Seen together: a child with a parent.
    world.state.npcs['npc_pip']!.location = world.state.player.location
    world.state.npcs['npc_brannoc']!.location = world.state.player.location
    await engine.handle('look')
    expect(world.state.player.knownTies?.['npc_brannoc']).toContain('npc_pip')
    const after = engine.page('npc_brannoc')
    expect([...(after?.lines ?? []), ...(after?.links ?? []).map((l) => `${l.id} ${l.name}`)].join('\n')).toMatch(/Pip|npc_pip/)
    expect(after?.lines.join('\n')).not.toMatch(/Family: unknown/)
  })
})
