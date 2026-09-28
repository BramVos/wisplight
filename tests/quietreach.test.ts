import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, warnings } from '../src/engine'
import { placeMeasures } from '../src/engine/builder'
import { contractView } from '../src/engine/contract'
import { oathsFor } from '../src/engine/dialogue/voice'
import { loadContentFromDir } from '../src/node/content'

// The Quiet Reach (M10.20): Bram's first real world, built chapter by chapter
// in the app itself on 28 September 2026 (docs/worldbuild/quiet-reach-report.md).
// It loads, keeps its contract, plays in its own words, and says nothing of
// the Nethermarch.

const reach = await loadContentFromDir(resolve(import.meta.dirname, '../content'), 'quietreach')

const said = (out: { text: string }[]) => out.map((o) => o.text).join('\n')

// Names and words of the Nethermarch that another world never uses (as in m1017.test.ts).
const NETHERMARCH = /\b(Nethermarch|Holleveen|Graafhaven|schout|guilders?|gulden|stuivers?|Waag(?:dam)?|Veenhoek|Molenend|the Count|Lantern Chapel|Grey Rider|Wild Hunt|Haakman|Aaltje|Wouter|Mirte|Maandag|Rustdag|Blackmere|polder)\b/

describe('The Quiet Reach, as Bram built it in the app', () => {
  it('loads with its twelve chapters in place, and warns only of what is still to come', () => {
    expect(reach.world.name).toBe('The Quiet Reach')
    expect(reach.world.calendar).toMatchObject({ era: 'CR', weekdays: ['Primeday', 'Span', 'Relay', 'Anchor', 'Restday'] })
    expect(reach.world.money?.units.map((u) => [u.name, u.value])).toEqual([['credit', 100], ['bit', 1]])
    expect(reach.world.faiths.map((f) => f.id)).toEqual(['keeping', 'open_sky'])
    expect(reach.locations.size).toBe(10)
    expect([...reach.npcs.keys()]).toEqual(['npc_mara_venn', 'npc_ilyan_sorell', 'npc_tessa_rook', 'npc_niko_serrin', 'npc_edda_vale', 'npc_sana_holt'])
    expect(reach.passages.size).toBe(3)
    expect(reach.world.law).toMatchObject({ npc: 'npc_mara_venn' })
    // The imports wait for the supply ship, and the far places have no origin yet: nothing else.
    expect(warnings(reach).filter((w) => !/made nowhere and brought by no route|no origin, so nobody knows where it belongs/.test(w))).toEqual([])
  })

  it('keeps its contract: every kind is filled or takes its neutral default', () => {
    const view = contractView(reach)
    for (const key of ['world', 'areas', 'locations', 'npcs', 'professions', 'items', 'topics', 'factions', 'watchers', 'aftermath', 'passages', 'voice']) {
      expect(view.find((k) => k.key === key)?.count, key).toBeGreaterThan(0)
    }
  })

  it('plays: look, wait, a talk with Mara, the walk to the Commons, all in its own words', async () => {
    const engine = new Engine(reach, { seed: 3, llm: new MockLlm('good') })
    const out = [said(engine.start())]
    for (const c of ['look', 'wait', 'talk to mara', 'hello', 'bye', 'east', 'inventory', 'time']) out.push(said(await engine.handle(c)))
    expect(out[0]).toContain('This is Nacre, at the far edge of the Lantern Belt')
    expect(out[1]).toMatch(/^Arrival Lock\nSteel walls drip from the pumps/)
    expect(out[2]).toMatch(/It is Primeday 18 Rainfall 186 CR, 08:\d\d/)
    expect(out[3]).toContain('You are talking with the port coordinator.')
    expect(out[6]).toMatch(/^Commons\n/)
    expect(out[7]).toBe('You carry 2 field rations, and 120 cr.')
    expect(engine.state.player.location).toBe('loc_commons')
    for (const text of out) expect(text).not.toMatch(NETHERMARCH)
  })

  it('reads by the place rules after the polish round (M10.20)', () => {
    // Before: 88 words on average, no topic in [brackets], seven places opening with their own name.
    const measures = placeMeasures(reach)
    for (const m of measures) {
      expect(m.words, m.id).toBeLessThanOrEqual(70)
      expect(m.sentences, m.id).toBeGreaterThanOrEqual(3)
      expect(m.sentences, m.id).toBeLessThanOrEqual(5)
      expect(m.opensWithName, m.id).toBe(false)
    }
    expect(measures.filter((m) => m.brackets > 0).length).toBeGreaterThanOrEqual(5)
    expect(new Set(measures.map((m) => m.opening)).size).toBe(measures.length)
    // The fact of Bram's places table stays: the terminal takes in the local map at the lock.
    expect(reach.locations.get('loc_arrival_lock')!.description.day).toMatch(/terminal chirps, taking the local map/)
  })

  it('swears by faith and by trade: Tessa by the hull, Sana by the Remembered', () => {
    const engine = new Engine(reach, { seed: 1 })
    expect(oathsFor(engine.world, 'npc_tessa_rook')).toContain('Hull and vacuum.')
    expect(oathsFor(engine.world, 'npc_sana_holt')).toEqual(expect.arrayContaining(['By the Remembered.', 'Hold pressure.']))
  })
})
