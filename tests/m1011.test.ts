import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, GameClock, recordFact, type LlmClient, type Output } from '../src/engine'
import { turnPrompt } from '../src/engine/dialogue/prompt'
import { heardBy } from '../src/engine/news'
import { hexMapData } from '../src/engine/map/view'
import { placeStateLine } from '../src/engine/quests/plans'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// Milestone M10.11 (docs/ROADMAP.md): moments. What deserves more than a
// line, lit up: a place worth it reached or rising into view, a journey in one
// paragraph, a tiding that changes things, and the mood of an area.

const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')
const cards = (out: Output[]) => out.filter((o) => o.kind === 'card').map((o) => o.card!)
const at = (engine: Engine, day: number, hour: number) => engine.tick(GameClock.from(211, 9, day, hour).minutes - engine.world.now)

describe('M10.11: arriving at a place worth it', () => {
  it('a card the first time, only the room after', async () => {
    const engine = new Engine(content, { seed: 1, builder: true })
    at(engine, 15, 11)
    const first = await engine.handle('@goto loc_goose_crossroads')
    expect(cards(first)).toEqual([expect.objectContaining({ kind: 'arrival', title: 'The Crossroads at the Drowned Goose', picture: 'loc_goose_crossroads', text: expect.stringMatching(/^Where the two raised roads cross stands the Drowned Goose/) })])
    // The text is in the log too, for the terminal and for who turned cards off.
    expect(first.find((o) => o.kind === 'card')!.text).toMatch(/^The Crossroads at the Drowned Goose\nWhere the two raised roads cross/)
    await engine.handle('@goto loc_veenhoek_green')
    expect(cards(await engine.handle('@goto loc_goose_crossroads'))).toEqual([])
  })

  it('at night and in mist the place reads otherwise', async () => {
    const night = new Engine(content, { seed: 1, builder: true })
    at(night, 15, 23)
    expect(cards(await night.handle('@goto loc_goose_crossroads'))[0]!.text).toMatch(/^The Drowned Goose is the only light for miles/)
    const mist = new Engine(content, { seed: 1, builder: true })
    at(mist, 15, 11)
    mist.state.weather = { kind: 'fog', since: mist.world.now }
    expect(cards(await mist.handle('@goto loc_blackmere_shore'))[0]!.text).toMatch(/^In the mist the Blackmere has no far shore/)
  })

  it('a landmark rising into view has its card then, and on arrival only its words', async () => {
    const engine = new Engine(content, { seed: 1, builder: true })
    const out = await engine.handle('ne')
    expect(cards(out)).toEqual([expect.objectContaining({ kind: 'sighting', title: 'The Mill De Zwaan, to the north-east', text: 'Above the reeds stands the tall mill De Zwaan, dark against the sky, its sails in rags and not turning.' })])
    const there = await engine.handle('@goto loc_molenend_mill')
    expect(cards(there)).toEqual([])
    expect(there.map((o) => o.text).join('\n')).toMatch(/De Zwaan rises over the reeds long before you reach it/)
  })

  it('a new game on Skerrow begins with the wreck; an old save does not light up what it knew', async () => {
    const engine = new Engine(isle, { seed: 1 })
    const start = engine.start()
    // The world's intro first (M10.29 C), then the wreck.
    expect(cards(start)).toEqual([expect.objectContaining({ kind: 'intro' }), expect.objectContaining({ kind: 'arrival', title: 'The Wreck Strand' })])
    // An old save: no moments yet, and the stranger stands where a card would have been.
    const old = Engine.fromSave(isle, engine.save())
    old.state.player.moments = undefined
    expect(cards(await old.handle('look'))).toEqual([])
  })
})

describe('M10.11: tidings', () => {
  it('a fact of belang 4 or more that reaches the stranger comes as a card, once; smaller news does not', async () => {
    const engine = new Engine(content, { seed: 1 })
    await engine.handle('look')
    const big = recordFact(engine.world, { kind: 'war', about: [], place: 'loc_waagdam_town_hall', belang: 4, title: 'an army on the eastern border', text: { precise: 'An army of Rijkland stands on the eastern border.', village: 'There is an army on the border, they say!', far: 'War in the east, maybe.' } })
    const small = recordFact(engine.world, { kind: 'rumour', about: [], place: 'loc_waagdam_town_hall', belang: 2, title: 'a new bell', text: { precise: 'The priory has a new bell.', village: 'A new bell at the priory.', far: 'A bell.' } })
    heardBy(engine.world, 'player')[big.id] = { level: 2, reliability: 0.8, from: 'npc_trijntje', t: engine.world.now }
    heardBy(engine.world, 'player')[small.id] = { level: 2, reliability: 0.8, from: 'npc_trijntje', t: engine.world.now }
    const out = await engine.handle('look')
    expect(cards(out)).toEqual([{ kind: 'tidings', title: 'An army on the eastern border', text: 'There is an army on the border, they say!', link: big.id, from: 'from Trijntje' }])
    expect(cards(await engine.handle('look'))).toEqual([])
  })
})

describe('M10.11: a journey in one paragraph', () => {
  it('a walk of more than three steps reads as a journey, from the world\'s sentences', async () => {
    const engine = new Engine(content, { seed: 2, builder: true })
    at(engine, 15, 10)
    await engine.handle('ne')
    const out = await engine.handle('head east')
    const journey = out.find((o) => o.journey)
    expect(journey?.text).toMatch(/^You head east for an hour\. .*Away to the south-west you see the roofs and the peat smoke of Veenhoek\.$/)
    const kit = content.journey!
    const sentences = [...Object.values(kit.terrain).flat(), ...Object.values(kit.weather).flat()]
    expect(sentences.some((s) => journey!.text.includes(s))).toBe(true)
  })

  it('a short walk keeps its one line, and a world without sentences its line of before', async () => {
    const engine = new Engine(content, { seed: 2, builder: true })
    const out = await engine.handle('ne')
    expect(out.some((o) => o.journey)).toBe(false)
    const plain = new Engine({ ...content, journey: undefined }, { seed: 2, builder: true })
    at(plain, 15, 10)
    await plain.handle('ne')
    const line = (await plain.handle('head east')).find((o) => /^You head east/.test(o.text))
    expect(line?.journey).toBeUndefined()
    expect(line?.text).toMatch(/, over /)
  })

  it('with a model the narrator rewords it; a rewording that invents is not kept', async () => {
    const script = (text: string): LlmClient & { calls: number } => {
      const client = { calls: 0, complete: async () => ({ text: JSON.stringify({ text }), provider: 'mock', model: 'm', usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 }, latencyMs: 1 }) }
      client.complete = async () => {
        client.calls++
        return { text: JSON.stringify({ text }), provider: 'mock', model: 'm', usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 }, latencyMs: 1 }
      }
      return client
    }
    const walk = async (llm: LlmClient) => {
      const engine = new Engine(content, { seed: 2, builder: true, llm })
      engine.world.aiLive = true
      at(engine, 15, 10)
      await engine.handle('ne')
      return (await engine.handle('head east')).find((o) => o.journey)!.text
    }
    const good = script('You walk east along the old ruts for an hour, over wet fields under a grey sky, with Veenhoek smoking behind you.')
    expect(await walk(good)).toBe('You walk east along the old ruts for an hour, over wet fields under a grey sky, with Veenhoek smoking behind you.')
    const bad = script('You cross the fields with Father Oswin, who tells you of his cousin in Paris.')
    expect(await walk(bad)).toMatch(/^You head east for an hour\./)
  })
})

describe('M10.11: the mood of an area', () => {
  it('a breach of the dyke puts Veenhoek in a panic: under its places, in the prompt of its people, and on the map', async () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    at(engine, 15, 11)
    await engine.handle('@plan dyke_breach')
    expect(engine.state.moods?.['veenhoek']).toMatchObject({ kind: 'panic' })
    expect(placeStateLine(engine.world, 'loc_veenhoek_green')).toMatch(/People wade past with what they could carry/)
    const prompt = turnPrompt(engine.world, { npcId: 'npc_mirte', act: 'SmallTalk', tier: 'short', attitude: { band: 'Neutral', score: 0 }, mood: 'calm', packet: { known: [], unknown: [] }, memories: [], history: [], playerText: 'Hello' } as never)
    if (engine.world.location(engine.state.npcs['npc_mirte']!.location).area === 'veenhoek') expect(prompt).toMatch(/THE MOOD HERE: The dyke has broken and the water is in Veenhoek/)
    engine.state.player.journal = { ...(engine.state.player.journal ?? {}), area_veenhoek: engine.world.now }
    const map = hexMapData(engine.world)
    expect(map?.places.find((p) => p.name === 'Veenhoek')?.mood).toBe('panic')
    // Three days on, the panic is over; the grief of the flood follows it.
    engine.tick(3 * 24 * 60 + 60)
    expect(engine.state.moods?.['veenhoek']).toMatchObject({ kind: 'grief' })
  })

  it('a death on Skerrow makes the hythe quiet for a few days', async () => {
    const engine = new Engine(isle, { seed: 1, builder: true })
    await engine.handle('@kill wenna drowned')
    engine.tick(30)
    expect(engine.state.moods?.['skerrow_hythe']).toMatchObject({ kind: 'grief', line: expect.stringMatching(/nobody sings at the nets/) })
  })
})
