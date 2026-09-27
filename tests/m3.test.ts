import { describe, expect, it } from 'vitest'
import { Engine, GameClock, MockLlm } from '../src/engine'
import { recordFact } from '../src/engine/news'
import { startStory, type Tempo } from '../src/engine/stories'
import type { Knowledge } from '../src/engine/dialogue/knowledge'
import { content } from './helpers'

// Milestone M3 (docs/ROADMAP.md): knowledge, rumours and the journal.

const knowledge = (seed = 1): Knowledge => (new Engine(content, { seed }).dialogue as unknown as { knowledge: Knowledge }).knowledge

describe('M3: the fixed chance roll (FO, chapter 5)', () => {
  it('gives a villager of Veenhoek the chances of the lore table in the world book (chapter 11)', () => {
    const k = knowledge()
    // Mirte has no profession or age bonus for these stories.
    const table: Record<string, number> = { water_wolf: 1, saint_brand: 1, last_sheaf: 1, witches_scale: 0.95, haakman: 0.9, cat_widow: 0.7, weeping_stone: 0 }
    for (const [topic, chance] of Object.entries(table)) expect(k.chance('npc_mirte', topic)!.chance, topic).toBeCloseTo(chance, 5)
  })

  it('adds the audience of a story: peat-cutters and children know the Cat-Widow better', () => {
    const k = knowledge()
    expect(k.chance('npc_gerrit', 'cat_widow')!.chance).toBeCloseTo(0.9, 5)
    expect(k.chance('npc_pim', 'cat_widow')!.chance).toBeCloseTo(0.9, 5)
    expect(k.chance('npc_wouter', 'haakman')!.chance).toBeCloseTo(1, 5)
  })

  it('rolls the same for the same game, and differently for another game', () => {
    const topics = ['haakman', 'cat_widow', 'stavermouth', 'graafhaven', 'the_count', 'hunnenloo']
    const levels = (seed: number) => ['npc_mirte', 'npc_gerrit', 'npc_trijntje', 'npc_lubbert'].flatMap((npc) => topics.map((t) => knowledge(seed).level(npc, t)))
    expect(levels(5)).toEqual(levels(5))
    expect(Array.from({ length: 8 }, (_, i) => levels(i + 1).join()).some((row, _, all) => row !== all[0])).toBe(true)
  })

  it('makes the chances come true over many games', () => {
    let haakman = 0
    let widow = 0
    const games = 400
    for (let seed = 1; seed <= games; seed++) {
      const k = knowledge(seed)
      if (k.level('npc_mirte', 'haakman') > 0) haakman++
      if (k.level('npc_mirte', 'cat_widow') > 0) widow++
    }
    expect(haakman / games).toBeGreaterThan(0.85)
    expect(haakman / games).toBeLessThan(0.95)
    expect(widow / games).toBeGreaterThan(0.63)
    expect(widow / games).toBeLessThan(0.77)
  })

  it('caps the level by distance: far places at most by name and direction', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const k = knowledge(seed)
      for (const npc of content.npcs.keys()) {
        // Hunnenloo is more than 100 km from everyone but the Kattenbroek, just under it.
        const far = k.chance(npc, 'hunnenloo')!
        expect(k.level(npc, 'hunnenloo'), `${npc} ${seed}`).toBeLessThanOrEqual(far.band === 4 ? 1 : 2)
        expect(k.level(npc, 'stavermouth'), `${npc} ${seed}`).toBeLessThanOrEqual(2)
      }
      expect([...content.npcs.keys()].filter((npc) => k.chance(npc, 'hunnenloo')!.band === 4).length).toBeGreaterThan(20)
    }
  })

  it('knows the own village for certain, and the places one goes to', () => {
    const k = knowledge()
    expect(k.level('npc_mirte', 'npc_gerrit')).toBe(3)
    expect(k.level('npc_mirte', 'loc_waagdam_graanhandel')).toBe(3)
    expect(k.level('npc_mirte', 'npc_lubbert')).toBeGreaterThanOrEqual(2)
  })

  it('gives direction and days on foot for far places, never a route', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const k = knowledge(seed)
      const packet = k.packet('npc_lubbert', ['stavermouth'])
      const known = packet.known[0]
      if (!known) continue
      const line = known.facts.join(' ')
      if (known.level === 1) expect(line).toMatch(/Stavermouth lies somewhere to the north\./)
      else expect(line).toMatch(/Stavermouth lies north, about 2 days on foot\./)
      expect(line).not.toMatch(/then/)
      return
    }
    throw new Error('Lubbert never knew Stavermouth in 30 games')
  })

  it('lets an innkeeper hear about more people', () => {
    const k = knowledge()
    expect(k.chance('npc_trijntje', 'the_count')!.chance).toBeGreaterThan(k.chance('npc_wouter', 'the_count')!.chance)
  })

  it('points to someone nearby who may know, when the NPC does not', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const k = knowledge(seed)
      if (k.level('npc_mirte', 'cat_widow') > 0) continue
      const packet = k.packet('npc_mirte', ['cat_widow'])
      expect(packet.referral).toBeDefined()
      expect(k.level(packet.referral!.npc, 'cat_widow')).toBeGreaterThanOrEqual(2)
      expect(packet.referral!.npc).not.toBe('npc_lubbert')
      return
    }
    throw new Error('Mirte knew the Cat-Widow in every game')
  })
})

describe('M3: news goes from person to person', () => {
  const areaOf = (npc: string) => content.locations.get(content.npcs.get(npc)!.home)!.area
  const people = (area: string) => [...content.npcs.keys()].filter((npc) => areaOf(npc) === area)

  function start(seed: number, day: number, belang = 2) {
    const engine = new Engine(content, { seed })
    engine.tick(GameClock.from(211, 9, day, 10).minutes - engine.world.now)
    const place = engine.state.npcs['npc_mirte']!.location
    const fact = recordFact(engine.world, { kind: 'test', about: ['area_veenhoek'], place, belang, title: 'the test', text: { precise: 'p', village: 'v', far: 'f' } })
    return { engine, fact, heard: () => engine.state.news!.heard }
  }

  it('reaches the witness at once and the whole village within a day, less precisely', () => {
    const { engine, fact, heard } = start(1, 16)
    expect(heard()['npc_mirte']![fact.id]).toMatchObject({ level: 3, reliability: 1, from: 'witness' })
    engine.tick(24 * 60)
    const village = people('veenhoek').filter((npc) => heard()[npc]?.[fact.id])
    expect(village.length).toBeGreaterThanOrEqual(6)
    const secondHand = village.filter((npc) => heard()[npc]![fact.id]!.from !== 'witness')
    expect(secondHand.every((npc) => heard()[npc]![fact.id]!.level < 3 && heard()[npc]![fact.id]!.reliability < 1)).toBe(true)
  })

  it('usually reaches Waagdam within two days, with less certainty', () => {
    let reached = 0
    for (let seed = 1; seed <= 12; seed++) {
      const { engine, fact, heard } = start(seed, 16)
      engine.tick(48 * 60)
      const town = people('waagdam').filter((npc) => heard()[npc]?.[fact.id])
      if (town.length > 0) reached++
      for (const npc of town) expect(heard()[npc]![fact.id]!.reliability).toBeLessThan(1)
    }
    // Two out of three start days is "usually".
    expect(reached).toBeGreaterThanOrEqual(8)
  })

  it('forgets small news: belang 1 after two days, belang 2 after two weeks', () => {
    const small = start(2, 16, 1)
    small.engine.tick(49 * 60)
    expect(Object.values(small.heard()).filter((h) => h[small.fact.id]).length).toBe(0)

    const village = start(2, 16, 2)
    village.engine.tick(3 * 24 * 60)
    const npcs = () => Object.entries(village.heard()).filter(([who, h]) => who !== 'player' && h[village.fact.id]).length
    expect(npcs()).toBeGreaterThan(0)
    village.engine.tick(12 * 24 * 60)
    expect(npcs()).toBe(0)
    // The fact itself stays in the chronicle.
    expect(village.engine.state.news!.facts.some((f) => f.id === village.fact.id)).toBe(true)
  })

  it("starts with Lubbert's paid rumour about the mill, which Kobus spreads", () => {
    const engine = new Engine(content, { seed: 3 })
    const heard = () => engine.state.news!.heard
    expect(heard()['npc_kobus']!['fact_mill_before_winter']).toMatchObject({ from: 'npc_lubbert', level: 3 })
    expect(engine.state.news!.facts.find((f) => f.id === 'fact_mill_before_winter')!.truth).toBe(false)
    engine.tick(3 * 24 * 60)
    const knowers = Object.entries(heard()).filter(([, h]) => h['fact_mill_before_winter']).map(([who]) => who)
    expect(knowers.length).toBeGreaterThanOrEqual(4)
  })

  it('answers "What\'s new around here?" with the news the NPC heard, and the player learns where it came from', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 3, llm: mock })
    engine.tick(3 * 24 * 60)
    const heard = engine.state.news!.heard
    const npc = Object.keys(heard).find((who) => who !== 'player' && who !== 'npc_kobus' && who !== 'npc_lubbert' && heard[who]!['fact_mill_before_winter'] && engine.state.npcs[who]!.activity !== 'asleep')!
    engine.state.player.location = engine.state.npcs[npc]!.location
    await engine.handle(`talk ${content.npcs.get(npc)!.name.split(' ')[0]}`)
    await engine.handle("What's new around here?")
    const prompt = mock.calls.at(-1)!.prompt
    expect(prompt).toMatch(/fact_mill_before_winter \(level [12]\): .*(won't turn again before winter|is finished)/)
    expect(prompt).toMatch(/\(You heard it from [A-Z][a-z]+\./)
    expect(engine.state.news!.heard['player']!['fact_mill_before_winter']).toMatchObject({ from: npc })
    expect(engine.state.player.journal!['fact_mill_before_winter']).toBeDefined()
  })
})

describe('M3: small stories happen by themselves', () => {
  const run = (seed: number, days: number, tempo: Tempo = 'normal') => {
    const engine = new Engine(content, { seed })
    engine.state.stories = { seq: 0, tempo, lastIncident: engine.world.now, active: [], done: [] }
    engine.tick(days * 24 * 60)
    return engine
  }
  const all = (engine: Engine) => [...engine.state.stories!.active, ...engine.state.stories!.done]

  it('starts several kinds of story in two weeks, and a replay gives the same', async () => {
    const engine = run(4, 14)
    const kinds = new Set(all(engine).map((s) => s.kind))
    expect(all(engine).length).toBeGreaterThanOrEqual(5)
    expect(kinds.size).toBeGreaterThanOrEqual(3)
    const replayed = await Engine.replay(content, 4, engine.save().log)
    // The replay starts with the default pacing, which is "normal" too.
    expect(replayed.state.stories).toEqual(engine.state.stories)
    expect(replayed.state.news).toEqual(engine.state.news)
  })

  it('follows the tempo: calm has fewer stories than dramatic', () => {
    const count = (tempo: Tempo) => [1, 2, 3, 4].reduce((sum, seed) => sum + all(run(seed, 14, tempo)).filter((s) => s.kind !== 'feast').length, 0)
    const calm = count('calm')
    const dramatic = count('dramatic')
    expect(calm).toBeLessThan(dramatic)
    expect(count('normal')).toBeGreaterThan(calm)
    // Twelve runs of two weeks each; the whole Holleveen (M7) has twice the people of M3.
  }, 20_000)

  it('lets the player find a lost thing and give it back', async () => {
    const engine = new Engine(content, { seed: 6 })
    engine.tick(GameClock.from(211, 9, 15, 10).minutes - engine.world.now)
    expect(startStory(engine.world, 'lost_thing')).toBe(true)
    const story = engine.state.stories!.active.find((s) => s.kind === 'lost_thing')!
    const owner = story.roles['owner']!
    const thing = String(story.data['thing'])
    const place = String(story.data['place'])
    expect(engine.state.ground[place]![thing]).toBe(1)
    engine.state.player.location = place
    await engine.handle(`take ${thing}`)
    engine.state.player.location = engine.state.npcs[owner]!.location
    const affinity = engine.state.relations?.[owner]?.affinity ?? 0
    const out = await engine.handle(`give ${thing} to ${content.npcs.get(owner)!.name.split(' ')[0]}`)
    expect(out.map((o) => o.text).join(' ')).toMatch(/Where did you find it\?/)
    // Help with something the NPC wanted: +3 for the thing, +4 for the request (FO, chapter 8: +5 to +15).
    expect(engine.state.relations![owner]!.affinity).toBe(affinity + 7)
    expect(story.done).toBe(true)
    expect(engine.state.requests.filter((r) => r.npc === owner && r.item === thing && r.status === 'open')).toHaveLength(0)
    expect(engine.state.news!.facts.at(-1)!.kind).toBe('returned')
  })

  it('sends someone with a fever home to bed', () => {
    const engine = new Engine(content, { seed: 7 })
    engine.tick(GameClock.from(211, 9, 15, 10).minutes - engine.world.now)
    expect(startStory(engine.world, 'fever')).toBe(true)
    const who = engine.state.stories!.active.find((s) => s.kind === 'sickness')!.roles['name']!
    engine.tick(120)
    expect(engine.state.npcs[who]).toMatchObject({ location: content.npcs.get(who)!.home, activity: 'ill in bed' })
  })

  it('lets two people at a social place fall out, loud enough to hear next door', () => {
    const engine = new Engine(content, { seed: 8 })
    engine.tick(GameClock.from(211, 9, 15, 19).minutes - engine.world.now)
    expect(startStory(engine.world, 'quarrel')).toBe(true)
    engine.tick(120)
    const fact = engine.state.news!.facts.find((f) => f.kind === 'quarrel')!
    expect(fact.text.precise).toMatch(/fell out over .* it came to shouting\./)
    expect(Object.values(engine.state.news!.heard).filter((h) => h[fact.id]).length).toBeGreaterThanOrEqual(2)
  })

  it('keeps Appeldag at the quay on 10 Wijnmaand', () => {
    const engine = new Engine(content, { seed: 9 })
    engine.tick(GameClock.from(211, 10, 10, 9, 45).minutes - engine.world.now)
    const veenhoek = [...content.npcs.keys()].filter((id) => content.locations.get(content.npcs.get(id)!.home)!.area === 'veenhoek' && !content.npcs.get(id)!.child)
    const atQuay = veenhoek.filter((id) => engine.state.npcs[id]!.location === 'loc_veenhoek_quay')
    expect(atQuay.length).toBeGreaterThanOrEqual(3)
    engine.tick(30)
    expect(engine.state.news!.facts.some((f) => f.pattern === 'appeldag')).toBe(true)
  })
})

describe('M3: the journal as a reference book', () => {
  async function talkedToMirte() {
    const engine = new Engine(content, { seed: 3, llm: new MockLlm('good') })
    for (const command of ['north', 'east', 'talk mirte', 'What happened to the mill?', 'bye']) await engine.handle(command)
    return engine
  }

  it('gives a page for what the player learned, with the source, and nothing for the rest', async () => {
    const engine = await talkedToMirte()
    const mill = engine.page('loc_molenend_mill')!
    expect(mill.lines.join(' ')).toMatch(/You haven't been there yourself\./)
    expect(mill.sources.join(' ')).toMatch(/Mirte, Dinsdag 14/)
    expect(engine.page('loc_kattenbroek_hut')).toBeUndefined()
    expect(engine.page('weeping_stone')).toBeUndefined()
  })

  it('links people, places and their families', async () => {
    const engine = await talkedToMirte()
    const mirte = engine.page('npc_mirte')!
    expect(mirte.lines[0]).toBe('Mirte the baker.')
    expect(mirte.links).toContainEqual({ id: 'loc_veenhoek_bakery', name: 'The Bakery', label: 'lives at' })
    const bakery = engine.page('loc_veenhoek_bakery')!
    expect(bakery.lines.join(' ')).toMatch(/Mirte sells .*rye bread.* here\./)
    expect(bakery.links).toContainEqual({ id: 'npc_mirte', name: 'Mirte Bakker', label: 'lives here' })
  })

  it('puts two stories about the same thing side by side', async () => {
    const engine = await talkedToMirte()
    const heard = engine.state.news!.heard
    heard['player'] = { ...(heard['player'] ?? {}), fact_mill_before_winter: { level: 2, reliability: 0.81, from: 'npc_kobus', t: engine.world.now } }
    engine.state.player.journal!['fact_mill_before_winter'] = engine.world.now
    engine.state.player.location = 'loc_molenend_mill'
    recordFact(engine.world, { kind: 'repaired', about: ['loc_molenend_mill', 'npc_harmen'], place: 'loc_molenend_mill', belang: 3, title: 'De Zwaan working again', text: { precise: 'Harmen has mended De Zwaan; it works again.', village: 'De Zwaan works again.', far: 'x' } })
    const rumour = engine.page('fact_mill_before_winter')!
    expect(rumour.lines[0]).toMatch(/won't turn again before winter/)
    expect(rumour.lines.join(' ')).toMatch(/Also heard: Harmen has mended De Zwaan; it works again\./)
    expect(rumour.sources.join(' ')).toMatch(/Kobus/)
    expect(engine.status().journal.events.map((e) => e.name)).toContain('De Zwaan working again')
  })
  it('shows the true chronicle at the end: what happened, what was not true, and who knew', () => {
    const engine = new Engine(content, { seed: 4 })
    engine.tick(3 * 24 * 60)
    const text = engine.chronicle()
    expect(text).toMatch(/^THE CHRONICLE\n/)
    expect(text).toMatch(/Lubbert's Grain Store: The mill not turning before winter \(not true\)/)
    expect(text).toMatch(/Known to Lubbert, Kobus/)
    expect(text).toMatch(/Canal Quay: The stranger in Veenhoek\n  A stranger from Graafhaven came to Veenhoek/)
  })
})
