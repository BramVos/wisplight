import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, type Content } from '../src/engine'
import { checkContent } from '../src/engine/content'
import { checkQuests } from '../src/engine/quests/check'
import { saidHolds, verbWord } from '../src/engine/said'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// M10.30, a word as a key and doing things with the world (Bram, 29
// September 2026: can the engine take codes or passwords? hack a lock, saw
// down a tree to reach a roof, a stone you only find because you heard you
// must look there). One mechanism for all, as content: a condition `said`; a
// lock that takes a word; the world's own word for picking a lock; a verb on
// a detail that does something (when, check, effects, once); a way that opens
// when something holds; and what lies hidden for someone who knows of it.

const quietReach = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')
const deepwell = await loadContentFromDir(join(import.meta.dirname, 'worlds'), 'other')
const said = (outs: { text: string }[]) => outs.map((o) => o.text).join('\n')

async function at(world: Content, place: string) {
  const engine = new Engine(world, { seed: 7, builder: true })
  engine.start()
  await engine.handle(`@goto ${place}`)
  return engine
}

describe('M10.30: a word as a key', () => {
  it('keeps what the stranger said, to whom and where, for the condition said', async () => {
    const engine = await at(content, 'loc_veenhoek_green')
    await engine.handle('say Brand keep us')
    expect(saidHolds(engine.world, { said: 'brand keep' })).toBe(true)
    expect(saidHolds(engine.world, { said: 'BRAND, keep us!' })).toBe(true)
    expect(saidHolds(engine.world, { said: 'bran' })).toBe(false)
    expect(saidHolds(engine.world, { said: 'brand', at: 'loc_veenhoek_green' })).toBe(true)
    expect(saidHolds(engine.world, { said: 'brand', to: 'npc_mirte' })).toBe(false)
    engine.tick(3 * 60)
    expect(saidHolds(engine.world, { said: 'brand', hours: 2 })).toBe(false)
  })

  it('opens the hangar of The Quiet Reach to its code, and hacks where the Nethermarch picks', async () => {
    const engine = await at(quietReach, 'loc_workshop')
    expect(verbWord(engine.world, 'pick')).toBe('hack')
    const locked = said(await engine.handle('go in'))
    expect(locked).toMatch(/The door is locked\. It wants a code\. \(TYPE the code or SAY the word, HACK IN to get past the lock, FORCE IN to break it open\.\)/)
    expect(said(await engine.handle('type 1234'))).toBe('Nothing gives. That is not the code.')
    expect(engine.state.player.location).toBe('loc_workshop')
    expect(said(await engine.handle('enter the code 7411'))).toBe('The keypad blinks green, and the heavy door slides back on its rail with a hiss of air.')
    await engine.handle('go in')
    expect(engine.state.player.location).toBe('loc_peregrine_hangar')
    // HACK is PICK in this world: the rules of picking, never "you can't hack here".
    const other = await at(quietReach, 'loc_workshop')
    expect(said(await other.handle('hack in'))).not.toMatch(/You can't "hack/)
    // The Nethermarch keeps its own word.
    expect(verbWord((await at(content, 'loc_veenhoek_green')).world, 'pick')).toBe('pick')
    expect(verbWord((await at(deepwell, [...deepwell.locations.keys()][0]!)).world, 'pick')).toBe('pick')
  })
})

describe('M10.30: doing things with the world', () => {
  it('Skerrow: a rope tied to the stake opens the way down the cliff and back up; people keep to the ordinary ways', async () => {
    const engine = await at(isle, 'loc_skerrow_cliff_path')
    expect(said(await engine.handle('go down'))).toBe('The cliff drops sheer to the tidepools. A rope tied to the old stake would take you down.')
    expect(said(await engine.handle('tie rope to stake'))).toBe('You have nothing to tie to the stake.')
    engine.state.player.inventory['rope'] = 1
    expect(said(await engine.handle('tie rope to stake'))).toMatch(/^You knot the rope round the iron stake/)
    expect(engine.state.player.inventory['rope'] ?? 0).toBe(0)
    expect(said(await engine.handle('tie rope to stake'))).toBe('Your rope is tied fast already, and hangs to the pools.')
    await engine.handle('go down')
    expect(engine.state.player.location).toBe('loc_skerrow_tidepools')
    await engine.handle('go up')
    expect(engine.state.player.location).toBe('loc_skerrow_cliff_path')
    expect(engine.world.route('loc_skerrow_tidepools', 'loc_skerrow_cliff_path')!.directions).not.toContain('up')
  })

  it('The Quiet Reach: the survey cache is found only by someone who heard of the cairn, and then without a roll', async () => {
    const engine = await at(quietReach, 'loc_orison_listening_room')
    for (let i = 0; i < 3; i++) await engine.handle('search')
    expect(said(await engine.handle('lift the top stone'))).not.toMatch(/sealed tin/)
    expect(engine.state.player.found ?? []).not.toContain('loc_orison_listening_room/survey_cache')
    ;(engine.state.player.journal ??= {})['the_survey_cairn'] = engine.world.now
    expect(said(await engine.handle('lift the top stone'))).toMatch(/Under the top stone, the one with the pale painted arrow, a sealed tin/)
    expect(engine.state.ground['loc_orison_listening_room']?.['field_lamp']).toBe(1)
    expect(said(await engine.handle('search cairn'))).not.toMatch(/sealed tin/)
  })

  it('refuses a lock with neither key nor word, a hidden thing only words find without words, and a deed of a quest stage', () => {
    const cliff = isle.locations.get('loc_skerrow_cliff_path')!
    const locations = new Map(isle.locations)
    locations.set(cliff.id, {
      ...cliff,
      exits: { ...cliff.exits, west: { to: 'loc_skerrow_green', minutes: 3, lock: { quality: 'common', material: 'iron' } } },
      hidden: [{ id: 'nook', dc: 15, qty: 1, text: 'A nook.', when: [{ flag: 'x' }] }],
      details: [...cliff.details, { words: ['gorse'], look: 'Gorse.', verbs: { burn: { text: 'It burns.', when: [], effects: [{ stage: 'nowhere' }], minutes: 5, once: true, check: { skill: 'arson', dc: 12 } } } }],
    } as never)
    const broken = { ...isle, locations }
    const problems = [...checkContent(broken), ...checkQuests(broken)].join('\n')
    expect(problems).toMatch(/loc_skerrow_cliff_path\.exits\.west\.lock: neither a key nor a word opens it/)
    expect(problems).toMatch(/loc_skerrow_cliff_path\.hidden\.nook: only its words find it, and it has none/)
    expect(problems).toMatch(/loc_skerrow_cliff_path\.details\.gorse\.burn: unknown stage nowhere/)
    expect(problems).toMatch(/loc_skerrow_cliff_path\.details\.gorse\.burn: unknown skill arson/)
  })
})
