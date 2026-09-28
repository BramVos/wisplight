import { describe, expect, it } from 'vitest'
import { checkContent, Engine, MockLlm } from '../src/engine'
import { tieTo } from '../src/engine/people'
import type { SketchFigure } from '../src/engine/state'
import { content } from './helpers'

// M10.22: the weave round. After a district of a far town is made in play,
// the chronicler weaves its new people into the world: bonds with people the
// stranger knows (from home first), at most two secrets, and one thread back
// home. The engine keeps only what checks out, and records each with why.
// People named in talks who live in the town become its people.

/** To Graafhaven as a player goes, from Veenhoek by Oude Zijl and the west edge, and something asked in the market. */
async function districtMade(engine: Engine): Promise<void> {
  engine.start()
  await engine.handle('look')
  await engine.handle('@goto loc_oude_zijl_sluice')
  for (let i = 0; i < 4 && !engine.state.choice; i++) await engine.handle('head west')
  await engine.handle('1')
  await engine.handle('@goto loc_graafhaven_market')
  await engine.handle('@time 11')
  await engine.handle('ask lammert about the holleveen')
  await engine.handle('bye')
}

describe('M10.22: the weave round', () => {
  it('weaves the new people of a district into the world: a bond with why, a secret, a thread home; nothing made up is kept', async () => {
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 11, builder: true, llm })
    await districtMade(engine)
    await engine.runModels()
    const calls = llm.calls.filter((c) => c.schemaName === 'weave')
    expect(calls).toHaveLength(1)
    const meta = calls[0]!.meta as { fresh: string[]; known: string[] }
    const [a, b] = [meta.fresh[0]!, meta.known[0]!]
    expect(meta.fresh).toContain(a)
    // The bond, both ways, with why as its note.
    expect(tieTo(engine.world, a, b)?.role).toBe('kin')
    expect(tieTo(engine.world, b, a)?.role).toBe('kin')
    expect(engine.world.npc(a).relations.find((r) => r.to === b)?.note).toMatch(/cousins on the mother's side/)
    // The one about "nobody" is not kept.
    expect(engine.world.npc(b).relations.some((r) => r.to === 'nobody')).toBe(false)
    // The secret, on the new person, as content.
    expect(engine.world.npc(a).secrets.map((s) => s.text)).toEqual(['Owes more than a year of rent and has told nobody.'])
    expect(checkContent(engine.content)).toEqual([])
    // The thread home: a visit the new person asks of the stranger.
    const thread = engine.state.requests.find((r) => r.npc === a && r.kind === 'visit')
    expect(thread).toMatchObject({ target: b, name: 'Word for a cousin', source: 'chronicler' })
    // In the chronicle, with why.
    expect(engine.state.news!.facts.filter((f) => f.kind === 'weave').map((f) => f.text.precise)).toEqual([
      "They are cousins on the mother's side, and have not seen each other since they were children.",
      'The two families fell out over an inheritance, and this is the first word in years.',
    ])
    // Once only, and the log plays back to the same world.
    await engine.runModels()
    expect(llm.calls.filter((c) => c.schemaName === 'weave')).toHaveLength(1)
    const replayed = await Engine.replay(content, 11, engine.save().log)
    expect(replayed.state.layer?.ties).toEqual(engine.state.layer?.ties)
    expect(replayed.state.requests).toEqual(engine.state.requests)
    expect(replayed.state.growth!.districts).toEqual(engine.state.growth!.districts)
  })

  it('weaves nothing without a model', async () => {
    const engine = new Engine(content, { seed: 12, builder: true })
    await districtMade(engine)
    expect(engine.state.growth?.weavePending ?? []).toEqual([])
    expect(engine.state.news!.facts.filter((f) => f.kind === 'weave')).toEqual([])
  })

  it('makes someone named in a talk after the stranger first came, who lives in the town, one of its people, with the bond from that talk', async () => {
    const engine = new Engine(content, { seed: 13, builder: true })
    engine.start()
    await engine.handle('@goto loc_oude_zijl_sluice')
    for (let i = 0; i < 4 && !engine.state.choice; i++) await engine.handle('head west')
    await engine.handle('1')
    await engine.handle('@goto loc_graafhaven_market')
    await engine.handle('@time 11')
    // Named in a talk once the far place stood: not one of its first people.
    const sketch: SketchFigure = { id: 'sk_1', name: 'Wobbe', pronoun: 'he', bond: 'cousin', of: 'npc_mirte', place: 'graafhaven', placeName: 'Graafhaven', what: 'a baker', line: 'My cousin Wobbe bakes for the Count.', t: engine.world.now, known_by: ['npc_mirte'] }
    engine.state.lore = { ...engine.state.lore!, people: [sketch] }
    const here = engine.world.npcsAt(engine.state.player.location)
    await engine.handle(`ask ${engine.world.npc(here[0]!).name.split(' ')[0]} about the holleveen`)
    const wobbe = engine.state.lore!.people![0]!.npc!
    expect(wobbe).toBeDefined()
    expect(engine.world.npc(wobbe).name).toMatch(/^Wobbe /)
    expect(tieTo(engine.world, wobbe, 'npc_mirte')).toBeDefined()
    expect(engine.state.growth!.districts!['graafhaven:gate']!.sketches).toEqual({ sk_1: wobbe })
  })
})
