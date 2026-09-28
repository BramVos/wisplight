import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'

// Every world its own version (Bram, 28 September 2026; the rule in
// CLAUDE.md): what M10.17 made content plays on Skerrow and in Deepwell with
// their own values, not only in the Nethermarch.

const isle = await loadContentFromDir(resolve(import.meta.dirname, '../content'), 'isle')
const deepwell = await loadContentFromDir(resolve(import.meta.dirname, 'worlds'), 'other')

const said = (out: { text: string }[]) => out.map((o) => o.text).join('\n')

async function playing(content: typeof isle, commands: string[], seed = 5) {
  const engine = new Engine(content, { seed, builder: true })
  engine.start()
  const out: string[] = []
  for (const c of commands) out.push(said(await engine.handle(c)))
  return { engine, out }
}

describe('Skerrow, in its own words', () => {
  it('hires out Wenna\'s coracle, where she is', async () => {
    const { engine, out } = await playing(isle, ['hire coracle', '@goto loc_skerrow_harbour', '@bring wenna', '@money 100', 'hire the coracle'])
    expect(out[0]).toBe('A coracle is hired from Wenna, the fisherwoman, at the harbour.')
    expect(out[4]).toMatch(/^You pay Wenna 1 sp\. "Keep her head to the swell/)
    expect(engine.state.player.hired?.['coracle']).toMatchObject({ owner: 'npc_wenna', crosses: ['water'] })
  })

  it('sleeps rough in its own words, and knows its coins by other names', async () => {
    const { out } = await playing(isle, ['@goto loc_skerrow_wreck_strand', 'sleep'])
    expect(out[1]).toMatch(/^You sleep in the lee of a rock, and the wind finds you anyway/)
    expect(isle.world.money?.units.find((u) => u.short === 'gp')?.aliases).toContain('crowns')
    // A death is heard on Skerrow, not fined (M10.20).
    expect(isle.world.law?.fines).toEqual({ murder: 'hearing', assault: 300, least: 20 })
  })

  it('has factions of its own: the Hythe keeps the law, the faiths are groups, and the wreckers mind a fight', () => {
    expect([...isle.factions.values()].find((f) => f.law === 'count')?.id).toBe('hythe_folk')
    expect(isle.world.faiths.map((f) => f.faction)).toEqual(['tidemother_faithful', 'star_sailors'])
    expect(isle.locations.get('loc_skerrow_silver_grove')!.faith).toBe('tidemother')
    const engine = new Engine(isle, { seed: 8 })
    const foeRepute = (engine as unknown as { foeRepute: (foes: { creature?: string }[], outcome: string, delta: number, why: string) => void }).foeRepute.bind(engine)
    foeRepute([{ creature: 'wrecker' }], 'won', -5, 'you beat their men')
    // -5 with the wreckers and +3 with the Hythe, and each spills over to the other as rivals, and to the Hythe's ally.
    expect(engine.state.reputation).toMatchObject({ wreckers: -6, hythe_folk: 5 })
    expect(isle.encounters.get('wreckers_on_the_cliff_path')!.tempts).toBe(true)
  })

  it('has peoples with other names and a distrust, patrons sworn to a deed, and bars the Heights in a night storm', () => {
    const elf = isle.rules!.ancestries.find((a) => a.id === 'western_elf')!
    expect(elf.aliases).toContain('elves')
    expect(elf.distrusted_by).toEqual(['superstitious'])
    expect(isle.rules!.patrons.map((p) => p.sworn)).toEqual(['mercy', 'courage'])
    expect(isle.areas.get('skerrow_heights')!.barred[0]!.when).toEqual([{ night: true }, { weather: 'storm' }])
  })
})

describe('Deepwell, in its own words', () => {
  it('hires out a pressure suit at the Fab Shop, and signs on with the cutters for a credit', async () => {
    const { engine, out } = await playing(deepwell, ['hire suit', '@goto loc_deepwell_fab_shop', '@bring teo', 'hire the suit', 'join the cutters crew', '@goto loc_deepwell_cutting_face', '@money 100', 'join the cutters crew'])
    expect(out[0]).toBe('A pressure suit is hired from Teo, the fabricator, at the Fab Shop.')
    expect(out[3]).toMatch(/^You pay Teo 6 ch\. "Check the seals/)
    expect(out[4]).toBe('You sign on with the crew at the cutting face.')
    expect(out[7]).toMatch(/^You are one of the cutters' crew now\./)
    expect(engine.state.player.money).toBe(80)
    expect(engine.state.reputation?.['cutters_crew']).toBe(20)
  })

  it('seals the Works on Decday, and leaves out what it leaves out on purpose: no faith, no weather, no creatures', async () => {
    const engine = new Engine(deepwell, { seed: 5, builder: true })
    engine.start()
    for (let i = 0; i < 12 && !/^Decday/.test(engine.status().time); i++) engine.tick(24 * 60)
    await engine.handle('@goto loc_deepwell_platform')
    expect(said(await engine.handle('east'))).toMatch(/^A red lamp burns over the pressure door/)
    expect(engine.state.player.location).toBe('loc_deepwell_platform')
    expect(deepwell.world.faiths).toEqual([])
    expect(deepwell.world.weather).toBeUndefined()
    expect(deepwell.creatures.size).toBe(0)
  })

  it('has its own standing, fines and coin names', () => {
    expect(deepwell.world.standing?.offices).toEqual(['warden'])
    // A death goes before the colony council (M10.20); a beating is still a fine.
    expect(deepwell.world.law?.fines?.murder).toBe('hearing')
    expect(deepwell.world.law?.fines?.assault).toBe(100)
    expect(deepwell.world.money?.units.find((u) => u.short === 'cr')?.aliases).toContain('creds')
    expect([...deepwell.factions.values()].find((f) => f.law === 'count')?.id).toBe('colony_council')
  })
})
