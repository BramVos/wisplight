import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, GameClock, type LlmClient, type Output } from '../src/engine'
import type { Agreement } from '../src/engine/state'
import { turnPrompt } from '../src/engine/dialogue/prompt'
import { hexMapData } from '../src/engine/map/view'
import { returningLines } from '../src/engine/returning'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// Milestone M10.13 (docs/ROADMAP.md): coming back and belonging. What changed
// since your last visit, a few lines; small practical gestures from what you
// shared with someone; and a room of your own with a chest and people who
// expect you.

const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')
const said = (out: Output[]) => out.map((o) => o.text).join('\n')
const at = (engine: Engine, day: number, hour: number) => engine.tick(GameClock.from(211, 9, day, hour).minutes - engine.world.now)
const DAY = 24 * 60

function kept(engine: Engine, npc: string, what = 'to carry word to Grietje'): void {
  const list = ((engine.state.agreements ??= { list: [], seq: 0 } as never) as { list: Agreement[] }).list
  list.push({ id: `a${list.length + 1}`, kind: 'message', by: 'player', to: npc, source: 'player', what, t: engine.world.now, terms: {}, status: 'kept', known: true, effects: [] } as Agreement)
}

function stay(engine: Engine, npcId: string, location = engine.state.player.location): void {
  const s = engine.state.npcs[npcId]!
  s.location = location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + 600
  s.plan = []
  s.note = undefined
}

describe('M10.13: coming back', () => {
  it('after a day away, a few lines of what changed here: the mill mended, and nothing on a short visit', async () => {
    const engine = new Engine(content, { seed: 2, builder: true })
    at(engine, 15, 10)
    await engine.handle('@goto loc_molenend_mill')
    await engine.handle('@goto loc_molenend_lane')
    // Mended while you were away (as the quest does it).
    engine.state.objects['loc_molenend_mill/de_zwaan'] = { ...engine.state.objects['loc_molenend_mill/de_zwaan'], broken: false }
    // Back within the hour: nothing to say yet.
    expect(returningLines(engine.world, 'loc_molenend_mill')).toEqual([])
    engine.tick(2 * DAY)
    const out = await engine.handle('@goto loc_molenend_mill')
    const back = out.find((o) => o.returning)
    expect(back?.text).toBe('De Zwaan has been mended since you were here; the new work is still pale.')
    // Right after the place's description.
    expect(out[out.findIndex((o) => o.kind === 'room') + 1]).toBe(back)
  })

  it('the place in another state, someone who is gone; what you heard as news already does not count', async () => {
    const engine = new Engine(content, { seed: 2, builder: true })
    at(engine, 15, 10)
    await engine.handle('@goto loc_molenend_house')
    await engine.handle('@goto loc_molenend_lane')
    await engine.handle('@kill harmen fell from the mill')
    engine.tick(2 * DAY)
    // Harmen's death reached the stranger as news: the house is not said to be different for it; he is gone.
    const lines = returningLines(engine.world, 'loc_molenend_house')
    expect(lines).toContain('Harmen is gone; people here speak of him quietly.')
    expect(lines.length).toBeLessThanOrEqual(3)
  })

  it('with a model the narrator makes one paragraph of it', async () => {
    const llm: LlmClient = { complete: async () => ({ text: JSON.stringify({ text: 'The mill De Zwaan stands mended now, its new wood still pale.' }), provider: 'mock', model: 'm', usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 }, latencyMs: 1 }) }
    const engine = new Engine(content, { seed: 2, builder: true, llm })
    engine.world.aiLive = true
    at(engine, 15, 10)
    await engine.handle('@goto loc_molenend_mill')
    await engine.handle('@goto loc_molenend_lane')
    engine.state.objects['loc_molenend_mill/de_zwaan'] = { ...engine.state.objects['loc_molenend_mill/de_zwaan'], broken: false }
    engine.tick(2 * DAY)
    const out = await engine.handle('@goto loc_molenend_mill')
    expect(out.find((o) => o.returning)?.text).toBe('The mill De Zwaan stands mended now, its new wood still pale.')
  })
})

describe('M10.13: gestures', () => {
  it('Mirte keeps a loaf back for who kept their word; not twice a day, and not from liking alone', async () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    at(engine, 15, 10)
    await engine.handle('@goto loc_veenhoek_bakery')
    stay(engine, 'npc_mirte')
    engine.state.relations = { ...(engine.state.relations ?? {}), npc_mirte: { ...(engine.state.relations?.['npc_mirte'] ?? { affinity: 0, trust: 0, fear: 0, familiarity: 0 }), affinity: 80 } } as never
    // Liking alone: nothing.
    expect(said(await engine.handle('list'))).not.toMatch(/Kept one back/)
    kept(engine, 'npc_mirte')
    const bread = engine.state.player.inventory['rye_bread'] ?? 0
    expect(said(await engine.handle('list'))).toMatch(/Mirte slides a small loaf across the counter with the rest\. "Kept one back for you\. Don't argue\."/)
    expect(engine.state.player.inventory['rye_bread']).toBe(bread + 1)
    // One a person a day.
    expect(said(await engine.handle('list'))).not.toMatch(/Kept one back/)
  })

  it('a gesture had twice gives way: a third day brings none of it', async () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    at(engine, 15, 10)
    await engine.handle('@goto loc_veenhoek_bakery')
    kept(engine, 'npc_mirte')
    let loaves = 0
    for (let day = 0; day < 4; day++) {
      stay(engine, 'npc_mirte')
      if (/Kept one back/.test(said(await engine.handle('list')))) loaves++
      engine.tick(DAY)
    }
    expect(loaves).toBe(2)
    expect(engine.state.player.gestures?.given['mirte_keeps_a_loaf']).toBe(2)
  })
})

describe('M10.13: a place to belong', () => {
  it('a room at the Goose by the week, a chest, the people who know you by name, and on the map', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    at(engine, 15, 10)
    await engine.handle('@goto loc_goose_common')
    stay(engine, 'npc_trijntje')
    engine.state.player.money = 100
    engine.state.player.inventory['rye_bread'] = 2
    expect(said(await engine.handle('rent the room for a week'))).toMatch(/^Trijntje takes .+ and gives you the key to the room at the Drowned Goose, for a week\. The chest at the foot of the bed is yours to use\.$/)
    expect(engine.state.player.money).toBe(60)
    await engine.handle('@goto loc_goose_rooms')
    expect(said(await engine.handle('put rye bread in the chest'))).toMatch(/You put .*in your chest/)
    expect(engine.state.player.inventory['rye_bread']).toBeUndefined()
    expect(said(await engine.handle('look'))).toMatch(/This is your room at the Drowned Goose\.\nIn your chest: /)
    expect(engine.page('lodging')!.lines[0]).toMatch(/^Your room at the Drowned Goose, paid for until /)
    // The people of the place know you by name.
    const prompt = turnPrompt(engine.world, { npcId: 'npc_trijntje', act: 'SmallTalk', tier: 'short', attitude: { band: 'Neutral', score: 0 }, mood: 'calm', packet: { known: [], unknown: [] }, memories: [], history: [], playerText: 'Evening' } as never)
    expect(prompt).toMatch(/THE STRANGER lodges here, in the room at the Drowned Goose; you know them by name: /)
    engine.state.player.journal = { ...(engine.state.player.journal ?? {}), area_drowned_goose: engine.world.now }
    expect(hexMapData(engine.world)?.places.find((p) => p.lodging)?.name).toMatch(/Goose/)
    // Away two days: Trijntje asks where you were.
    await engine.handle('@goto loc_veenhoek_green')
    engine.tick(2 * DAY)
    stay(engine, 'npc_trijntje', 'loc_goose_rooms')
    expect(said(await engine.handle('@goto loc_goose_rooms'))).toMatch(/Trijntje looks up from the tap\. "There you are\. Where did you get to\?/)
    expect(said(await engine.handle('take rye bread from the chest'))).toMatch(/You take .* from your chest/)
    // A week later the room is not yours unless you pay again.
    engine.tick(6 * DAY)
    expect(said(await engine.handle('look'))).toMatch(/This was your room at the Drowned Goose; the week is up\. RENT THE ROOM FOR A WEEK to keep it\./)
  })

  it('a long journey leaves from it and comes back to it', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    at(engine, 16, 8)
    await engine.handle('@goto loc_goose_common')
    stay(engine, 'npc_trijntje')
    engine.state.player.money = 300
    await engine.handle('rent the room for a week')
    // And a week more: the journey takes a while.
    expect(said(await engine.handle('rent the room for a week'))).toMatch(/is yours for another week/)
    await engine.handle('@goto loc_veenhoek_quay')
    const out = said(await engine.handle('take the barge to graafhaven'))
    expect(out).toMatch(/Your things wait in your room at the Drowned Goose\./)
    at(engine, 23, 9)
    const back = said(await engine.handle('take the barge to veenhoek'))
    expect(back).toMatch(/You come to Canal Quay\. Your room at the Drowned Goose is waiting for you\./)
  })

  it('Skerrow has a bunk at the Salt Kettle; an old save without a room plays on', async () => {
    const engine = new Engine(isle, { seed: 1, builder: true })
    await engine.handle('@goto loc_skerrow_salt_kettle')
    stay(engine, 'npc_maren')
    engine.state.player.money = 500
    expect(said(await engine.handle('rent the room for a week'))).toMatch(/Maren takes .+ and gives you the key to the bunk in the loft of the Salt Kettle/)
    const old = Engine.fromSave(content, new Engine(content, { seed: 9 }).save())
    expect(said(await old.handle('look'))).toMatch(/Canal Quay/)
    expect(old.page('lodging')!.lines[0]).toMatch(/You have no room of your own\. Trijntje lets one by the week/)
  })
})
