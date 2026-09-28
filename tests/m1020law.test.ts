import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent } from '../src/engine'
import { crime, fineFor } from '../src/engine/social/crime'
import { loadContentFromDir, readContentFiles } from '../src/node/content'
import { content } from './helpers'

// Milestone M10.20 (docs/ROADMAP.md): a law without a fine. Found building
// The Quiet Reach: Bram wrote "no fine that buys release" for murder, and the
// engine asked a sum. A death or a beating may now be "hearing": the
// stranger is held for the hours the world gives, and heard, in its words.

const worlds = join(import.meta.dirname, 'worlds')
const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

describe('M10.20: a law without a fine', () => {
  it('Deepwell: a death seen by the warden wants a hearing; no fine buys it off; given up, held and heard', async () => {
    const deepwell = await loadContentFromDir(worlds, 'other')
    const engine = new Engine(deepwell, { seed: 9, builder: true })
    engine.start()
    await engine.handle('@goto loc_deepwell_warden_office')
    await engine.handle('@bring ilse')
    const told = said(crime(engine.world, { kind: 'murder', place: 'loc_deepwell_warden_office', victim: 'npc_teo_marsh', value: 0, grave: true, witnesses: ['npc_ilse_varga'] }, { title: 'a death', precise: 'Teo died.', village: 'Teo is dead!', far: 'A death in the domes.' }))
    expect(told).toMatch(/You are wanted in Deepwell: no fine buys the rest off: the warden will hold you for a hearing\./)
    expect(engine.state.wanted?.['count']).toMatchObject({ fine: 0, hearing: ['crime_1'] })
    expect(engine.status().wanted).toEqual(['Deepwell: a hearing'])
    // The warden, who saw it, comes for the stranger: not for money.
    expect(said(await engine.handle('pay fine'))).toBe('No fine buys this off. GIVE YOURSELF UP to the warden: you will be held, and heard.\nIlse: "You\'re wanted, stranger. You\'ll come with me and be heard."\nGIVE YOURSELF UP, or face the consequences.')
    const before = engine.world.now
    const heard = said(await engine.handle('give yourself up'))
    expect(heard).toMatch(/^The warden walks you to the brig behind her office/)
    expect(heard).toMatch(/The council sits at the long table in the Commons/)
    expect(engine.world.now - before).toBeGreaterThanOrEqual(12 * 60)
    expect(engine.state.wanted?.['count']).toBeUndefined()
    expect(engine.state.news!.facts.some((f) => f.kind === 'hearing')).toBe(true)
    expect(said(await engine.handle('give yourself up'))).toBe('The warden wants nothing from you.')
  })

  it('a beating in Deepwell is still a fine; given up for a fine, the game says to pay it', async () => {
    const deepwell = await loadContentFromDir(worlds, 'other')
    const engine = new Engine(deepwell, { seed: 9, builder: true })
    engine.start()
    expect(fineFor(engine.world, 'assault', 0)).toBe(100)
    crime(engine.world, { kind: 'assault', place: 'loc_deepwell_airlock', victim: 'npc_teo_marsh', value: 0, grave: true, witnesses: ['npc_ilse_varga'] }, { title: 'a beating', precise: 'Teo was beaten.', village: 'Teo got a beating!', far: 'A fight in the domes.' })
    await engine.handle('@goto loc_deepwell_warden_office')
    expect(said(await engine.handle('surrender'))).toBe('The warden wants a fine, not you: PAY FINE settles it.')
  })

  it('the Nethermarch keeps its fines; Skerrow and The Quiet Reach hear a death; a fine is a number or "hearing"', async () => {
    const engine = new Engine(content, { seed: 1 })
    expect(fineFor(engine.world, 'murder', 0)).toBe(20 * engine.world.coins[0]!.value)
    const root = join(import.meta.dirname, '../content')
    const isle = await loadContentFromDir(root, 'isle')
    expect(isle.world.law?.fines).toMatchObject({ murder: 'hearing', assault: 300 })
    const reach = await loadContentFromDir(root, 'quietreach')
    expect(reach.world.law).toMatchObject({ where: 'in Port Vesper', fines: { murder: 'hearing', assault: 'hearing' }, hearing: { hours: 48 } })
    const files = await readContentFiles(worlds, 'other')
    const wrong = files.map((f) => (f.path === 'other/world.yaml' ? { ...f, text: f.text.replace('murder: hearing', 'murder: prison') } : f))
    expect(() => loadContent(wrong)).toThrow(/law\.fines\.murder/)
  })
})
