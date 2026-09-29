import { describe, expect, it } from 'vitest'
import { DEFAULT_PALETTE, Engine, loadContent, type Content } from '../src/engine'
import { buildInput } from '../src/engine/chronicler'
import { systemPrompt } from '../src/engine/dialogue/prompt'
import { fixNotHere, kitOf, voiceLines } from '../src/engine/dialogue/voice'
import { faithOf } from '../src/engine/faith'
import { nameOne } from '../src/engine/growth/crowds'
import { landMapData } from '../src/engine/map/known'
import { fineFor, landLawHere, lawAt, lawOf } from '../src/engine/social/crime'
import { middlePurse, standingName, standingOf } from '../src/engine/standing'
import { readContentFiles } from '../src/node/content'

// M10.23: whoever is in a land plays under its frame. The voice, the brain
// and the chronicler get the land's frame and voice kit; the guard reads the
// land's list of what is not there; the map takes its palette; its law holds,
// with its own officer and fines; money is told in its coins at its rate.
// What the stranger has and knows goes along; their standing does not.

async function isle(): Promise<Content> {
  return loadContent(await readContentFiles('content', 'isle'))
}

/** On Ynys Wen, as the white boat would bring the stranger. */
async function onYnysWen(content: Content, seed = 7): Promise<Engine> {
  const engine = new Engine(content, { seed, builder: true })
  engine.start()
  await engine.handle('@goto loc_ynys_wen_landing')
  return engine
}

describe('M10.23: playing under the frame of the land', () => {
  it('gives the voice the land frame, its kit and its way of address; the guard reads its list', async () => {
    const content = await isle()
    const engine = await onYnysWen(content)
    const world = engine.world
    expect(world.land).toBe('western_isles')
    expect(kitOf(world)).toBe(content.lands.get('western_isles')!.voice)
    const prompt = systemPrompt(world, 'npc_eluned')
    expect(prompt).toMatch(/set in the Western Isles/)
    expect(prompt).toMatch(/LAND: The Western Isles, where the elves live/)
    expect(prompt).not.toMatch(/Skerrow Hythe/)
    expect(voiceLines(world, 'npc_eluned', 3).join('\n')).toMatch(/"child of the short years"/)
    expect(voiceLines(world, 'npc_eluned', 3).join('\n')).toMatch(/money in silver rings, glass beads/)
    // The bell of Skerrow is not rung here.
    expect(fixNotHere(world, 'We will meet at the bell.').text).toBe('We will meet at the tide.')
    // At home the world's kit and frame.
    await engine.handle('@goto loc_skerrow_harbour')
    expect(kitOf(engine.world)).toBe(content.voice)
    expect(fixNotHere(engine.world, 'We will meet at the bell.').text).toBe('We will meet at the bell.')
  })

  it("gives the chronicler the frame of the land the stranger is in", async () => {
    const engine = await onYnysWen(await isle())
    const input = buildInput(engine.world, { id: 'run_1', t: engine.world.now, reason: 'night', lines: [] })
    expect(input.world).toMatch(/LAND: The Western Isles/)
    expect(input.world).toMatch(/child of the short years|What is slow is not lost/)
  })

  it('tells money in the land coins at its rate, and reads an amount named in them', async () => {
    const engine = await onYnysWen(await isle())
    const world = engine.world
    // 35 copper pieces are 70 beads: 3 rings and 10 beads.
    expect(world.money(35)).toBe('3 ring 10 bead')
    expect(world.parseMoney('10 beads')).toBe(5)
    expect(world.parseMoney('3 beads')).toBe(2)
    await engine.handle('@goto loc_skerrow_harbour')
    expect(world.money(35)).toBe('3 sp 5 cp')
  })

  it('holds the law of the land: its own id, officer and fines; wanted at home is not wanted here', async () => {
    const deepwell = loadContent(await readContentFiles('tests/worlds', 'other'))
    const engine = new Engine(deepwell, { seed: 5, builder: true })
    engine.start()
    const world = engine.world
    expect(lawAt(world, 'loc_deepwell_works_platform')).toBe('count')
    expect(lawAt(world, 'loc_claim_gate')).toBe('kessler_claim')
    expect(lawOf(world, 'kessler_claim')).toMatchObject({ officer: 'security officer', npc: 'npc_rook_adeyemi' })
    expect(fineFor(world, 'assault', 0)).toBe(100)
    engine.state.wanted = { count: { fine: 50 } } as never
    await engine.handle('@goto loc_claim_gate')
    expect(landLawHere(world)).toBe('kessler_claim')
    expect(engine.state.wanted?.[landLawHere(world)]).toBeUndefined()
    // The Combine fines a death; Deepwell hears it.
    expect(fineFor(world, 'murder', 0)).toBe(6000)
    expect(fineFor(world, 'assault', 0)).toBe(200)
    expect(world.words.law.officer).toBe('security officer')
  })

  it('measures standing among the households of the land, in its own words: the stranger is nobody there yet', async () => {
    const content = await isle()
    const engine = await onYnysWen(content)
    const world = engine.world
    const names = content.lands.get('western_isles')!.standing!.names
    expect(names).toContain(standingName(world, standingOf(world, 'npc_eluned'), 'western_isles'))
    // The middle purse of the elves is of the elves alone: 800 and 120.
    expect(middlePurse(world)).toBe(460)
    await engine.handle('@goto loc_skerrow_harbour')
    expect(middlePurse(world)).not.toBe(460)
  })

  it('names people made in the land from its own names, and gives them its faith', async () => {
    const content = await isle()
    content.npcs.get('npc_gwion')!.faith = undefined
    const engine = await onYnysWen(content)
    const world = engine.world
    expect(faithOf(world, 'npc_gwion')).toBe('old_stars')
    expect(faithOf(world, 'npc_brannoc')).toBe('tidemother')
    engine.state.crowds = [{ id: 'crowd_x', name: 'castaways', one: 'a castaway', at: 'loc_ynys_wen_landing', count: 3, from: 'skerrow_hythe', profession: 'boatman', looks: ['Salt-cracked hands and a quiet face.'], since: world.now, named: [] }]
    const id = nameOne(world, engine.state.crowds[0]!)!
    const [first, family] = engine.world.npc(id).name.split(' ')
    const land = content.lands.get('western_isles')!.names!
    expect([...land.she, ...land.he]).toContain(first)
    expect(land.family).toContain(family)
  })

  it("colours the land map by the land's palette where the stranger is", async () => {
    const content = await isle()
    const own = { ...DEFAULT_PALETTE, names: { ...DEFAULT_PALETTE.names, water: 'the white shallows' } }
    content.lands.get('western_isles')!.palette = own
    const engine = await onYnysWen(content)
    expect(landMapData(engine.world)?.palette).toBe(own)
    await engine.handle('@goto loc_skerrow_harbour')
    expect(landMapData(engine.world)?.palette).toBe(content.world.map!.palette)
  })
})
