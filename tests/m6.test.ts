import { describe, expect, it } from 'vitest'
import { Engine, type Output } from '../src/engine'
import { attitude, relation } from '../src/engine/dialogue/relations'
import { companionOf, dangerOf, offer } from '../src/engine/social/companions'
import { mayAttackFirst, mayLend, mayReport } from '../src/engine/social/gates'
import { rankOf, repute } from '../src/engine/social/factions'
import { shiftTension, stanceOf, tensionOf } from '../src/engine/social/realms'
import { noticeCoincidences } from '../src/engine/social/coincidence'
import { content } from './helpers'

// M6: relations, factions and companions (FO, chapters 8 and 13; design:
// statecraft, crime and intrigue).

const texts = (outputs: Output[]) => outputs.map((o) => o.text).join('\n')

async function play(engine: Engine, ...commands: string[]): Promise<string> {
  let all = ''
  for (const command of commands) all += `${texts(await engine.handle(command))}\n`
  return all
}

function place(engine: Engine, npcId: string, location: string): void {
  const s = engine.state.npcs[npcId]!
  s.location = location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + 600
  s.plan = []
}

describe('attitude and gates', () => {
  it('works out the attitude from the relation, the mood and the situation, as in the FO example', () => {
    const engine = new Engine(content, { seed: 1 })
    Object.assign(relation(engine.state, 'npc_gerrit'), { affinity: 30, trust: 20 })
    engine.state.npcs['npc_gerrit']!.mood = { value: -10, until: engine.world.now + 60, reason: 'angry' }
    // 30 + 20/2 + 5 x warmth 0 - 10 = 30: Friendly.
    expect(attitude(engine.world, 'npc_gerrit')).toEqual({ band: 'Friendly', score: 30 })
  })

  it('never lets a Friendly NPC attack first, however angry; a Hostile one with courage may', () => {
    const engine = new Engine(content, { seed: 1 })
    Object.assign(relation(engine.state, 'npc_gerrit'), { affinity: 30, trust: 20 })
    engine.state.npcs['npc_gerrit']!.mood = { value: -10, until: engine.world.now + 600, reason: 'angry' }
    expect(mayAttackFirst(engine.world, 'npc_gerrit', { provoked: true })).toBe(false)
    Object.assign(relation(engine.state, 'npc_gerrit'), { affinity: -80, trust: -20 })
    expect(attitude(engine.world, 'npc_gerrit').band).toBe('Hostile')
    expect(mayAttackFirst(engine.world, 'npc_gerrit', { provoked: true })).toBe(true)
    // A child never attacks.
    Object.assign(relation(engine.state, 'npc_pim'), { affinity: -90 })
    expect(mayAttackFirst(engine.world, 'npc_pim', { provoked: true })).toBe(false)
  })

  it('opens the other gates only as far as the table says', () => {
    const engine = new Engine(content, { seed: 1 })
    Object.assign(relation(engine.state, 'npc_mirte'), { affinity: 50, trust: 10 })
    expect(mayLend(engine.world, 'npc_mirte')).toBe(false)
    relation(engine.state, 'npc_mirte').trust = 40
    expect(mayLend(engine.world, 'npc_mirte')).toBe(true)
    expect(mayReport(engine.world, 'npc_mirte', false)).toBe(false)
    Object.assign(relation(engine.state, 'npc_everhard'), { affinity: 20, trust: 0 })
    expect(mayReport(engine.world, 'npc_everhard', true)).toBe(true)
  })
})

describe('Gerrit and the surveyor\'s chains (roadmap M6)', () => {
  it('is angry and confronts the player, but does not strike first while Friendly', async () => {
    const engine = new Engine(content, { seed: 4 })
    Object.assign(relation(engine.state, 'npc_gerrit'), { affinity: 55, trust: 20, familiarity: 40 })
    engine.state.player.inventory['surveyors_chain'] = 1
    place(engine, 'npc_gerrit', engine.state.player.location)
    const out = await play(engine, 'look')
    expect(relation(engine.state, 'npc_gerrit').affinity).toBe(30)
    expect(attitude(engine.world, 'npc_gerrit').band).toBe('Friendly')
    expect(out).toMatch(/Gerrit: "I saw you with the surveyor's chains/)
    expect(engine.state.combat).toBeUndefined()
    expect(engine.state.talk?.npc).toBe('npc_gerrit')
  })

  it('goes looking for the player when they are elsewhere, and strikes first only when Hostile', async () => {
    const engine = new Engine(content, { seed: 4 })
    await play(engine, 'create warden heathborn peat_cutter name=Joost')
    Object.assign(relation(engine.state, 'npc_gerrit'), { affinity: -50, trust: -30, familiarity: 40 })
    engine.state.player.inventory['surveyors_chain'] = 1
    place(engine, 'npc_gerrit', engine.state.player.location)
    const out = await play(engine, 'look')
    expect(attitude(engine.world, 'npc_gerrit').band).toBe('Hostile')
    expect(out).toMatch(/whose side are you on/)
    expect(engine.state.combat?.started_by).toBe('npc')
    expect(engine.state.combat?.fighters.some((f) => f.npc === 'npc_gerrit')).toBe(true)
  })
})

describe('Wouter and a dangerous order (roadmap M6)', () => {
  async function withWouter(loyalty: number): Promise<Engine> {
    const engine = new Engine(content, { seed: 3 })
    await play(engine, 'create warden heathborn peat_cutter name=Joost')
    Object.assign(relation(engine.state, 'npc_wouter'), { affinity: 55, trust: 40, familiarity: 50 })
    place(engine, 'npc_wouter', engine.state.player.location)
    expect(await play(engine, 'recruit wouter')).toMatch(/Wouter travels with you now/)
    companionOf(engine.world, 'npc_wouter')!.loyalty = loyalty
    return engine
  }

  it('counts the Kattenbroek as dangerous', () => {
    const engine = new Engine(content, { seed: 3 })
    expect(dangerOf(engine.world, 'loc_kattenbroek_edge', 'npc_wouter')).toBeGreaterThanOrEqual(3)
    expect(dangerOf(engine.world, 'loc_veenhoek_green', 'npc_wouter')).toBeLessThan(3)
  })

  it('refuses to scout the Kattenbroek at low loyalty', async () => {
    const engine = await withWouter(40)
    const out = await play(engine, 'order wouter to scout the kattenbroek')
    expect(out).toMatch(/Not for all the eels/)
    expect(companionOf(engine.world, 'npc_wouter')!.away).toBeUndefined()
  })

  it('goes at high loyalty, and comes back with what he found', async () => {
    const engine = await withWouter(75)
    const out = await play(engine, 'order wouter to scout the kattenbroek')
    expect(out).toMatch(/I'll have a look/)
    expect(companionOf(engine.world, 'npc_wouter')!.away?.kind).toBe('scout')
    expect(engine.state.npcs['npc_wouter']!.location).toBe('loc_kattenbroek_edge')
    let back = ''
    for (let i = 0; i < 12 && companionOf(engine.world, 'npc_wouter')?.away; i++) back += await play(engine, 'wait 60')
    expect(back).toMatch(/Wouter (is back|comes back)/)
    expect(engine.state.npcs['npc_wouter']!.location).toBe(engine.state.player.location)
  })

  it('also keeps to the terms: a place he said he would not go', async () => {
    const engine = await withWouter(90)
    companionOf(engine.world, 'npc_wouter')!.conditions.limits.push('kattenbroek')
    expect(await play(engine, 'order wouter to scout the kattenbroek')).toMatch(/wouldn't set foot/)
  })
})

describe('crime and witnesses (roadmap M6)', () => {
  it('has no consequences at once when nobody sees it (it is found out later, M7.2)', async () => {
    const engine = new Engine(content, { seed: 1 })
    await play(engine, 'create rascal fenfolk smuggler name=Lies')
    // The bakery with nobody in it.
    engine.state.player.location = 'loc_veenhoek_bakery'
    for (const id of engine.world.npcsAt('loc_veenhoek_bakery')) place(engine, id, 'loc_veenhoek_green')
    const facts = engine.state.news?.facts.length ?? 0
    const out = await play(engine, 'steal bread')
    expect(out).toMatch(/You slip a loaf of rye bread under your coat/)
    expect(engine.state.player.inventory['rye_bread']).toBe(1)
    expect((engine.state.crimes ?? []).filter((c) => !c.unseen)).toHaveLength(0)
    expect(engine.state.crimes?.[0]).toMatchObject({ unseen: true, witnesses: [] })
    expect(engine.state.news?.facts.length ?? 0).toBe(facts)
    expect(engine.state.wanted).toBeUndefined()
    expect(relation(engine.state, 'npc_mirte').affinity).toBe(0)
  })

  it('with a witness it becomes a rumour that spreads, and the victim thinks less of you', async () => {
    const engine = new Engine(content, { seed: 1 })
    engine.state.player.location = 'loc_veenhoek_bakery'
    place(engine, 'npc_mirte', 'loc_veenhoek_bakery')
    place(engine, 'npc_trijntje', 'loc_veenhoek_bakery')
    // Clumsy thieves are seen: a bad Stealth.
    engine.state.player.character!.ranks['stealth'] = 0
    engine.state.player.character!.attributes.grace = -1
    let out = ''
    for (let i = 0; i < 6 && !(engine.state.crimes ?? []).some((c) => !c.unseen); i++) out += await play(engine, 'steal bread')
    const crime = engine.state.crimes!.find((c) => !c.unseen)!
    expect(crime.witnesses.length).toBeGreaterThan(0)
    expect(out).toMatch(/saw (it|that)/)
    const fact = engine.state.news!.facts.find((f) => f.id === crime.fact)!
    expect(fact.title).toMatch(/the stranger stole from Mirte/)
    if (crime.witnesses.includes('npc_mirte')) expect(relation(engine.state, 'npc_mirte').affinity).toBeLessThan(0)
    // Hours later others have heard it from the witnesses.
    for (const w of crime.witnesses) place(engine, w, 'loc_goose_common')
    place(engine, 'npc_kobus', 'loc_goose_common')
    place(engine, 'npc_geesje', 'loc_goose_common')
    engine.tick(6 * 60)
    const heard = Object.entries(engine.state.news!.heard).filter(([who, h]) => who !== 'player' && h[fact.id] && !crime.witnesses.includes(who))
    expect(heard.length).toBeGreaterThan(0)
  })

  it('a witness who takes a bribe keeps quiet', async () => {
    const engine = new Engine(content, { seed: 2 })
    engine.state.player.location = 'loc_veenhoek_bakery'
    place(engine, 'npc_mirte', 'loc_veenhoek_bakery')
    engine.state.player.character!.attributes.grace = -2
    engine.state.player.character!.ranks['stealth'] = 0
    // Enough bread on the counter to keep trying until Mirte sees it.
    engine.world.stock('loc_veenhoek_bakery', 'bakery_counter')['rye_bread'] = 40
    for (let i = 0; i < 30 && !(engine.state.crimes ?? []).some((c) => !c.unseen); i++) await play(engine, 'steal bread')
    const crime = engine.state.crimes!.find((c) => !c.unseen)!
    Object.assign(relation(engine.state, 'npc_mirte'), { affinity: 40, trust: 30 })
    engine.state.player.money = 500
    let quiet = ''
    for (let i = 0; i < 5 && !engine.state.silenced?.['npc_mirte']; i++) quiet += await play(engine, 'bribe mirte 10 stuivers', 'bye')
    expect(engine.state.silenced?.['npc_mirte']).toContain(crime.fact)
    expect(quiet).toMatch(/keep quiet/)
  })

  it('attacking a villager is a crime everyone there sees; the family takes their side', async () => {
    const engine = new Engine(content, { seed: 5 })
    await play(engine, 'create warden heathborn peat_cutter name=Joost')
    engine.state.player.location = 'loc_visser_house'
    place(engine, 'npc_jan_visser', 'loc_visser_house')
    place(engine, 'npc_grietje_visser', 'loc_visser_house')
    place(engine, 'npc_pim', 'loc_visser_house')
    expect(await play(engine, 'attack pim')).toMatch(/won't raise a hand against a child/)
    const out = await play(engine, 'attack grietje')
    expect(out).toMatch(/You go for Grietje/)
    expect(engine.state.crimes?.[0]?.kind).toBe('assault')
    expect(engine.state.combat?.fighters.filter((f) => f.side === 'foes').map((f) => f.npc)).toEqual(['npc_grietje_visser', 'npc_jan_visser'])
    expect(relation(engine.state, 'npc_grietje_visser').affinity).toBeLessThanOrEqual(-40)
  })
})

describe('companions', () => {
  it('recruit by a formula: refuse, terms, or join', () => {
    const engine = new Engine(content, { seed: 1 })
    expect(offer(engine.world, 'npc_mirte').decision).toBe('refuse')
    expect(offer(engine.world, 'npc_gerrit').decision).toBe('refuse')
    Object.assign(relation(engine.state, 'npc_gerrit'), { affinity: 30, trust: 20 })
    expect(offer(engine.world, 'npc_gerrit').decision).toBe('terms')
    Object.assign(relation(engine.state, 'npc_gerrit'), { affinity: 80, trust: 60 })
    expect(offer(engine.world, 'npc_gerrit').decision).toBe('join')
    expect(offer(engine.world, 'npc_gerrit', 'loc_kattenbroek_edge').willingness).toBeLessThan(offer(engine.world, 'npc_gerrit').willingness)
  })

  it('approve and disapprove through their values, and fight beside the player', async () => {
    const engine = new Engine(content, { seed: 6, builder: true })
    await play(engine, 'create lanternbearer dykelander lantern_novice name=Marij')
    Object.assign(relation(engine.state, 'npc_wendela'), { affinity: 60, trust: 40 })
    place(engine, 'npc_wendela', engine.state.player.location)
    await play(engine, 'recruit wendela')
    const before = companionOf(engine.world, 'npc_wendela')!.loyalty
    await play(engine, '@fight goat_riders_toll', 'refuse')
    expect(engine.state.combat!.fighters.some((f) => f.npc === 'npc_wendela' && f.side === 'party')).toBe(true)
    for (let i = 0; i < 40 && engine.state.combat && !engine.state.combat.over; i++) {
      const fight = engine.status().combat!
      await play(engine, fight.fighters.some((f) => f.side === 'foes' && f.reachable) ? 'strike' : fight.actions > 0 ? 'advance' : 'end')
    }
    if (engine.state.combat?.prisoners) {
      const out = await play(engine, 'let them go')
      expect(out).toMatch(/let .* go/i)
      expect(companionOf(engine.world, 'npc_wendela')!.loyalty).toBeGreaterThan(before)
    }
    expect(companionOf(engine.world, 'npc_wendela')!.bondPoints).toBeGreaterThanOrEqual(0)
  })

  it('leaves when loyalty drops below 20, and when not paid', async () => {
    const engine = new Engine(content, { seed: 1 })
    Object.assign(relation(engine.state, 'npc_wouter'), { affinity: 55, trust: 40 })
    place(engine, 'npc_wouter', engine.state.player.location)
    await play(engine, 'recruit wouter')
    companionOf(engine.world, 'npc_wouter')!.loyalty = 15
    const out = await play(engine, 'wait 600', 'wait 600')
    expect(companionOf(engine.world, 'npc_wouter')).toBeUndefined()
    expect(out + engine.world.notices.join(' ')).toBeTruthy()
    expect(engine.state.npcs['npc_wouter']!.following).toBe(false)
  })

  it('answers as a group, one line each, in one model call', async () => {
    const { MockLlm } = await import('../src/engine')
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 1, llm })
    for (const id of ['npc_wouter', 'npc_gerrit']) {
      Object.assign(relation(engine.state, id), { affinity: 60, trust: 40 })
      place(engine, id, engine.state.player.location)
      await play(engine, `recruit ${id === 'npc_wouter' ? 'wouter' : 'gerrit'}`)
    }
    const before = llm.calls.length
    const out = await play(engine, 'ask party about the haakman')
    expect(llm.calls.length - before).toBe(1)
    expect(out).toMatch(/Wouter: "/)
    expect(out).toMatch(/Gerrit: "/)
  })

  it('tells something by the campfire, and the bond grows', async () => {
    const engine = new Engine(content, { seed: 1 })
    Object.assign(relation(engine.state, 'npc_wouter'), { affinity: 55, trust: 40 })
    place(engine, 'npc_wouter', engine.state.player.location)
    await play(engine, 'recruit wouter')
    engine.state.player.location = 'loc_peat_cuttings'
    const out = await play(engine, 'camp')
    expect(out).toMatch(/Wouter, looking into the fire/)
    expect(companionOf(engine.world, 'npc_wouter')!.bond).toBe(1)
  })
})

describe('factions, the lands, romance and coincidences', () => {
  it('spills reputation to allies and rivals', () => {
    const engine = new Engine(content, { seed: 1 })
    repute(engine.world, 'lantern_church', 10, 'test')
    expect(engine.state.reputation).toMatchObject({ lantern_church: 10, counts_men: 2, waagdam_burghers: 2, old_faith: -4, fen_folk: -4 })
    expect(rankOf(10)).toBe('Known')
    expect(rankOf(-70)).toBe('Enemy')
  })

  it('makes war news of belang 5 when tension crosses 80', () => {
    const engine = new Engine(content, { seed: 1 })
    expect(stanceOf(tensionOf(engine.world, 'nethermarch', 'terpwold'))).toBe('tense')
    for (let i = 0; i < 3; i++) shiftTension(engine.world, 'nethermarch', 'terpwold', 10, 'a tax collector hanged')
    expect(stanceOf(tensionOf(engine.world, 'nethermarch', 'terpwold'))).toBe('war')
    const war = engine.state.news!.facts.find((f) => f.kind === 'realm')!
    expect(war.belang).toBe(5)
    expect(war.title).toMatch(/war between the Nethermarch and Terpwold/)
  })

  it('lets a romance only with adults open to the player, and makes a rival jealous', async () => {
    const engine = new Engine(content, { seed: 1 })
    await play(engine, 'create rascal fenfolk smuggler name=Lies pronoun=she')
    place(engine, 'npc_gerrit', engine.state.player.location)
    place(engine, 'npc_wendela', engine.state.player.location)
    place(engine, 'npc_wouter', engine.state.player.location)
    expect(await play(engine, 'flirt wendela')).toMatch(/Not me/)
    expect(await play(engine, 'flirt gerrit')).toMatch(/hardly know me/)
    Object.assign(relation(engine.state, 'npc_wouter'), { affinity: 60, trust: 30, familiarity: 50 })
    expect(await play(engine, 'flirt wouter')).toMatch(/Well now/)
    expect(engine.state.romance?.['npc_wouter']?.stage).toBe('interest')
    expect(relation(engine.state, 'npc_geesje').affinity).toBeLessThan(0)
  })

  it('notices two old enemies meeting on the road', () => {
    const engine = new Engine(content, { seed: 1 })
    place(engine, 'npc_gerrit', 'loc_towpath_mid')
    place(engine, 'npc_everhard', 'loc_towpath_mid')
    noticeCoincidences(engine.world)
    const fact = engine.state.news!.facts.find((f) => f.kind === 'coincidence')!
    expect(fact.title).toMatch(/Everhard and Gerrit met|Gerrit and Everhard met/)
  })

  it('replays a game with companions, crime and a confrontation to the same world', async () => {
    const engine = new Engine(content, { seed: 8, builder: true })
    await play(engine, 'create warden heathborn peat_cutter name=Joost', 'south', 'west', 'south')
    await play(engine, 'recruit wouter', 'look', 'north', 'east', 'north', 'wait 30', 'steal bread', 'north')
    const copy = await Engine.replay(content, 8, engine.save().log)
    expect(copy.state.crimes).toEqual(engine.state.crimes)
    expect(copy.state.player).toEqual(engine.state.player)
  })
})
