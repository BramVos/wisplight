import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { MockLlm } from '../src/engine/dialogue/mock'
import { knowsTheDayOf } from '../src/engine/people'
import { reconsider, seeForYourself } from '../src/engine/belief'
import { heardBy, recordFact } from '../src/engine/news'
import { startQuest } from '../src/engine/quests/engine'
import { content } from './helpers'

// Milestone M10.6 (docs/ROADMAP.md): Bram's answers to the open questions of
// the playtest, 28 September 2026. The dyke saved by the village through its
// leader, a quest that settles itself far from the stranger, knowing someone's
// day, and an opening that fits the broken mill.

const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')
const DAY = 24 * 60

function stay(engine: Engine, npcId: string, location: string, minutes = 600): void {
  const s = engine.state.npcs[npcId]!
  s.location = location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + minutes
  s.plan = []
  s.note = undefined
}

/** A new game with the leak begun, the stranger at the horse mill having heard it from Teunis, who saw it. */
async function leak(seed: number) {
  const engine = new Engine(content, { seed, builder: true, llm: new MockLlm('good') })
  for (const c of ['@plan dyke_leak', '@goto loc_waagdam_horse_mill', '@time 9', 'talk teunis', '2']) await engine.handle(c)
  const fact = engine.state.news!.facts.find((f) => f.claim?.value === 'leaking')!
  expect(heardBy(engine.world, 'player')[fact.id]).toBeDefined()
  expect(heardBy(engine.world, 'npc_teunis')[fact.id]!.from).toBe('witness')
  return { engine, fact }
}

describe('M10.6: the dyke is saved through its leader', () => {
  it('a stranger alone is not believed, and the dyke breaks as before', async () => {
    const { engine, fact } = await leak(1)
    for (const c of ['bye', '@goto loc_oude_zijl_dykehouse', 'wait for sijbrand']) await engine.handle(c)
    expect(said(await engine.handle('tell sijbrand about the dyke'))).toMatch(/doesn't believe a word/)
    expect(heardBy(engine.world, 'npc_sijbrand')[fact.id]!.stance).toBe('rejects')
    engine.tick(2 * DAY + 60)
    expect(engine.state.flags!['dyke_mustered']).toBeUndefined()
    expect(engine.state.flags!['dyke_broke']).toBe(true)
  }, 60_000)

  it('Teunis beside the stranger says it himself; Sijbrand calls out the men of Veenhoek, and the breach does not come', async () => {
    const { engine, fact } = await leak(1)
    await engine.handle('bye')
    for (const id of ['npc_teunis', 'npc_sijbrand']) stay(engine, id, 'loc_oude_zijl_dykehouse')
    await engine.handle('@goto loc_oude_zijl_dykehouse')
    const out = said(await engine.handle('tell sijbrand about the dyke'))
    expect(out).toMatch(/Teunis nods\. "I saw it with my own eyes\."/)
    const theirs = heardBy(engine.world, 'npc_sijbrand')[fact.id]!
    expect(theirs.from).toBe('npc_teunis')
    expect(theirs.stance).toBeUndefined()
    engine.tick(60)
    expect(engine.state.flags!['dyke_mustered']).toBe(true)
    // The hands of Veenhoek go up on the dyke for hours.
    for (const id of ['npc_gerrit', 'npc_jan_visser', 'npc_wouter', 'npc_everhard']) expect(engine.state.npcs[id]!.goals.some((g) => g.type === 'Guard' && g.target === 'loc_oude_zijl_dyke')).toBe(true)
    engine.tick(2 * DAY)
    expect(engine.state.flags!['dyke_shored']).toBe(true)
    expect(engine.state.flags!['dyke_broke']).toBeUndefined()
    expect(engine.state.plans!.some((p) => p.plan === 'dyke_breach')).toBe(false)
    expect(engine.state.news!.facts.some((f) => f.claim?.subject === 'loc_oude_zijl_dyke' && f.claim.value === 'normal')).toBe(true)
  }, 60_000)

  it('Teunis asked to take the stranger to Sijbrand goes, though he is at work and it is three hours across country', async () => {
    const { engine } = await leak(1)
    const out = said(await engine.handle('Will you come with me to Sijbrand? He must hear it from you.'))
    expect(out).toMatch(/Teunis agrees to take you to The Dyke House, to Sijbrand/)
    expect(out).toMatch(/Teunis walks with you: there is no road/)
    const lead = engine.state.agreements!.list.find((a) => a.by === 'npc_teunis' && a.kind === 'lead')!
    expect(lead.terms.ifAbsent).toBe('search')
    for (const c of ['east', 'walk to oude zijl']) await engine.handle(c)
    // Across country he kept beside the stranger, and goes on ahead from the road's end.
    expect(engine.state.npcs['npc_teunis']!.location).not.toBe('loc_waagdam_horse_mill')
  }, 60_000)

  it("persuading Sijbrand is easier with Teunis's word given to say the same, and won, he believes it", async () => {
    const dc = async (promise: boolean) => {
      const { engine, fact } = await leak(1)
      if (promise) expect(said(await engine.handle('Will you tell Sijbrand about the dyke?'))).toMatch(/Teunis agrees to tell Sijbrand/)
      for (const c of ['bye', '@goto loc_oude_zijl_dykehouse', 'wait for sijbrand']) await engine.handle(c)
      const out = said(await engine.handle('persuade sijbrand that the dyke is leaking'))
      return { out, engine, fact, dc: Number(/vs DC (\d+)/.exec(out)?.[1]) }
    }
    const alone = await dc(false)
    const backed = await dc(true)
    expect(backed.dc).toBe(alone.dc - 4)
    expect(backed.out).toMatch(/You tell Sijbrand that Teunis saw it with their own eyes, and gave their word to say so/)
    expect(backed.out).toMatch(/success/)
    expect(heardBy(backed.engine.world, 'npc_sijbrand')[backed.fact.id]!.stance).toBeUndefined()
  }, 60_000)

  it('shown the leak: Sijbrand, who did not believe it, walks up the dyke with the stranger and sees it', async () => {
    const { engine, fact } = await leak(1)
    for (const c of ['bye', '@goto loc_oude_zijl_dykehouse', 'wait for sijbrand', 'tell sijbrand about the dyke', 'talk sijbrand']) await engine.handle(c)
    expect(heardBy(engine.world, 'npc_sijbrand')[fact.id]!.stance).toBe('rejects')
    expect(said(await engine.handle('Come with me to the dyke, I will show you.'))).toMatch(/Sijbrand agrees to take you to On the Great Dyke/)
    for (const c of ['south', 'up', 'wait 20']) await engine.handle(c)
    const theirs = heardBy(engine.world, 'npc_sijbrand')[fact.id]!
    expect(theirs.from).toBe('witness')
    expect(theirs.stance).toBeUndefined()
    expect(engine.state.flags!['dyke_mustered']).toBe(true)
  }, 60_000)

  it('seeing is believing only for who heard it said and doubted it; a word weighs again only once', () => {
    const engine = new Engine(content, { seed: 3 })
    const world = engine.world
    const fact = recordFact(world, { kind: 'danger', about: [], place: 'loc_oude_zijl_dyke', belang: 2, title: 'leak', text: { precise: 'p', village: 'v', far: 'f' }, claim: { subject: 'loc_oude_zijl_dyke', key: 'state', value: 'leaking' }, witnesses: [] })
    stay(engine, 'npc_sijbrand', 'loc_oude_zijl_dyke')
    stay(engine, 'npc_gerrit', 'loc_oude_zijl_dyke')
    heardBy(world, 'npc_sijbrand')[fact.id] = { level: 2, reliability: 0.8, from: 'player', t: world.now, stance: 'rejects' }
    seeForYourself(world)
    expect(heardBy(world, 'npc_sijbrand')[fact.id]!.stance).toBeUndefined()
    expect(heardBy(world, 'npc_sijbrand')[fact.id]!.from).toBe('witness')
    // Gerrit never heard of it: a leak low on the land side is not seen by passing.
    expect(heardBy(world, 'npc_gerrit')[fact.id]).toBeUndefined()
    // Once per word: the same teller cannot talk someone round by saying it again and again.
    heardBy(world, 'npc_gerrit')[fact.id] = { level: 2, reliability: 0.8, from: 'player', t: world.now, stance: 'rejects' }
    reconsider(world, 'npc_gerrit', fact, 'npc_teunis', -100)
    expect(heardBy(world, 'npc_gerrit')[fact.id]!.weighed).toEqual(['npc_teunis'])
    expect(reconsider(world, 'npc_gerrit', fact, 'npc_teunis', 1000)).toBe('rejects')
  })
})

describe('M10.6: a quest settles itself far from the stranger', () => {
  it('a month on and far off, the widow stops waiting and Grietje takes the grey cat in; the doorstep is empty', async () => {
    const engine = new Engine(content, { seed: 5, builder: true })
    startQuest(engine.world, { pass: () => [] }, 'grey_cat_on_the_doorstep')
    await engine.handle('@goto loc_reuzenrust_road')
    engine.tick(31 * DAY)
    const out = said(engine.tick(1))
    expect(engine.state.flags!['cat_taken_in']).toBe(true)
    expect(engine.state.flags!['fenna_cat_forever']).toBe(true)
    expect(engine.state.questlog!['grey_cat_on_the_doorstep']!.outcome).toBe('lapsed')
    expect(engine.state.news!.facts.some((f) => f.title === 'Grietje took the grey cat in')).toBe(true)
    void out
    const back = said(await engine.handle('@goto loc_visser_house'))
    expect(back).toMatch(/The doorstep is empty\. Through the window you see a grey cat/)
    expect(back).toMatch(/Grietje Visser has taken the grey cat in/)
    expect(said(await engine.handle('@goto loc_veenhoek_green'))).toMatch(/the doorstep of a narrow house is empty/)
  }, 60_000)

  it('near the Holleveen it waits for the stranger; and one never taken up lapses too, and does not start afterwards', async () => {
    const near = new Engine(content, { seed: 5, builder: true })
    startQuest(near.world, { pass: () => [] }, 'grey_cat_on_the_doorstep')
    await near.handle('@goto loc_visser_house')
    near.tick(31 * DAY)
    expect(near.state.flags!['cat_taken_in']).toBeUndefined()
    expect(near.state.questlog!['grey_cat_on_the_doorstep']!.ended).toBeUndefined()

    const never = new Engine(content, { seed: 5, builder: true })
    await never.handle('@goto loc_reuzenrust_road')
    never.tick(31 * DAY)
    expect(never.state.flags!['cat_taken_in']).toBe(true)
    expect(never.state.questlog?.['grey_cat_on_the_doorstep']).toBeUndefined()
    await never.handle('@goto loc_visser_house')
    stay(never, 'npc_grietje_visser', 'loc_visser_house')
    await never.handle('talk grietje')
    expect(never.state.questlog?.['grey_cat_on_the_doorstep']).toBeUndefined()
  }, 60_000)
})

describe("M10.6: who knows someone well knows their day", () => {
  it('in the village everyone knows where the baker went on market day; a townsman without a tie does not', async () => {
    const engine = new Engine(content, { seed: 2, builder: true })
    const world = engine.world
    await engine.handle('@time 9')
    expect(world.date()).toMatch(/^Woensdag/)
    stay(engine, 'npc_mirte', 'loc_waagdam_market')
    expect(knowsTheDayOf(world, 'npc_gerrit', 'npc_mirte')).toBe(true)
    expect(knowsTheDayOf(world, 'npc_dirck', 'npc_mirte')).toBe(false)
    // Family knows it wherever they live; a tie with warmth too, never a rival.
    expect(knowsTheDayOf(world, 'npc_jan_visser', 'npc_fenna')).toBe(true)
    await engine.handle('@goto loc_veenhoek_green')
    stay(engine, 'npc_gerrit', 'loc_veenhoek_green')
    await engine.handle('talk gerrit')
    const out = said(await engine.handle('where is mirte'))
    expect(out).toMatch(/has gone to \[?Waagdam\]? today; it's Woensdag, \[?market\]? day there/)
  }, 60_000)
})

describe('M10.6: the opening fits the broken mill', () => {
  it('the opening has De Zwaan standing still, and the mill and Molenend turn again in the text once it is mended', async () => {
    const engine = new Engine(content, { seed: 1, builder: true })
    const opening = said(engine.start())
    expect(opening).toMatch(/A windmill standing still against a sky the colour of pewter, its sails torn to rags\./)
    expect(opening).not.toMatch(/turning slowly/)
    expect(said(await engine.handle('@goto loc_molenend_mill'))).toMatch(/torn to rags by the storm/)
    expect(said(await engine.handle('@goto loc_molenend_lane'))).toMatch(/torn sails above, which do not move/)
    engine.world.objectState('loc_molenend_mill', 'de_zwaan')['broken'] = false
    expect(said(await engine.handle('look'))).toMatch(/sails of De Zwaan sweep round above the roofs/)
    expect(said(await engine.handle('@goto loc_molenend_mill'))).toMatch(/new sails go round/)
  }, 60_000)
})
