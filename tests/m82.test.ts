import { describe, expect, it } from 'vitest'
import { Engine, MockLlm } from '../src/engine'
import { believes, passOn, recordFact } from '../src/engine/news'
import { tieTo } from '../src/engine/people'
import { shiftTension } from '../src/engine/social/realms'
import { standingOf } from '../src/engine/standing'
import { grudge } from '../src/engine/stories'
import { forgetWeek } from '../src/engine/forgetting'
import { judge } from '../src/engine/belief'
import { queueSignal } from '../src/engine/signals'
import { startPlan } from '../src/engine/quests/plans'
import { content, runUntil, homeStart } from './helpers'

// Milestone M8.2 (docs/ROADMAP.md): the brain plans. Standing, belief and
// doubt, lying and asking around, strangers and warnings, forgetting and
// recognising, greetings and chats where the player is, and intentions of
// the brain with the standard aftermath to fall back on.

const DAY = 24 * 60

async function say(engine: Engine, ...commands: string[]): Promise<string> {
  const out: string[] = []
  for (const c of commands) out.push(...(await engine.handle(c)).map((o) => o.text))
  return out.join('\n')
}

function hoursAt(engine: Engine, npc: string, days: number): Map<string, number> {
  const where = new Map<string, number>()
  for (let h = 0; h < days * 24; h++) {
    engine.tick(60)
    const l = engine.state.npcs[npc]!.location
    where.set(l, (where.get(l) ?? 0) + 1)
  }
  return where
}

describe('M8.2: Harmen comes up in the world', () => {
  it('behaves differently within a week when his household rises two standings, and the village notices', () => {
    const engine = new Engine(content, { seed: 21 })
    const before = hoursAt(engine, 'npc_harmen', 7)
    expect(before.get('loc_goose_common') ?? 0).toBeGreaterThan(0)
    const was = standingOf(engine.world, 'npc_harmen')
    const liking = engine.state.bonds!['npc_mirte']?.['npc_harmen']?.affinity ?? 0
    engine.state.npcs['npc_harmen']!.money += 1500
    const after = hoursAt(engine, 'npc_harmen', 7)
    expect(standingOf(engine.world, 'npc_harmen')).toBeGreaterThanOrEqual(was + 2)
    expect(engine.state.signals!.log.some((s) => s.kind === 'rose_in_standing' && s.who[0] === 'npc_harmen')).toBe(true)
    // Not at the inn any more: at church instead.
    expect(after.get('loc_goose_common') ?? 0).toBe(0)
    expect([...after.keys()].some((l) => content.locations.get(l)!.tags.includes('holy'))).toBe(true)
    // The village hears of it, and the neighbours are envious.
    const fact = engine.state.news!.facts.find((f) => f.kind === 'standing' && f.about.includes('npc_harmen'))!
    expect(Object.entries(engine.state.news!.heard).filter(([id, h]) => id !== 'npc_harmen' && h[fact.id]).length).toBeGreaterThan(2)
    expect(engine.state.bonds!['npc_mirte']!['npc_harmen']!.affinity).toBeLessThan(liking)
  }, 60_000)
})

describe('M8.2: a quarrel that stays', () => {
  it('is made up when someone both trust mediates', () => {
    const engine = new Engine(content, { seed: 22 })
    // Aaltje is someone both of them trust.
    for (const who of ['npc_gerrit', 'npc_jan_visser']) engine.state.bonds![who]!['npc_aaltje'] = { affinity: 30, trust: 40, fear: 0, familiarity: 70 }
    grudge(engine.world, 'npc_gerrit', 'npc_jan_visser')
    recordFact(engine.world, { kind: 'quarrel', about: ['npc_gerrit', 'npc_jan_visser'], place: 'loc_veenhoek_green', belang: 1, title: 'the quarrel between Gerrit and Jan', text: { precise: 'p', village: 'v', far: 'f' } })
    engine.tick(3 * DAY)
    expect(engine.state.bonds!['npc_gerrit']!['npc_jan_visser']!.grudge).toBeUndefined()
    expect(engine.state.news!.facts.find((f) => f.kind === 'reconciled')?.about).toContain('npc_aaltje')
    engine.tick(6 * DAY)
    expect(engine.state.signals!.log.some((s) => s.kind === 'feud')).toBe(false)
  }, 60_000)

  it('becomes a feud when nobody trusted by both can mediate', () => {
    const engine = new Engine(content, { seed: 22 })
    // Lubbert and Gerrit: nobody in the Holleveen is trusted by both.
    for (const who of ['npc_lubbert', 'npc_gerrit']) for (const b of Object.values(engine.state.bonds![who] ?? {})) b.trust = Math.min(b.trust, 10)
    grudge(engine.world, 'npc_gerrit', 'npc_lubbert')
    recordFact(engine.world, { kind: 'quarrel', about: ['npc_gerrit', 'npc_lubbert'], place: 'loc_goose_common', belang: 1, title: 'the quarrel between Gerrit and Lubbert', text: { precise: 'p', village: 'v', far: 'f' } })
    engine.tick(9 * DAY)
    expect(engine.state.signals!.log.some((s) => s.kind === 'feud' && s.who.includes('npc_gerrit') && s.who.includes('npc_lubbert'))).toBe(true)
    expect(tieTo(engine.world, 'npc_gerrit', 'npc_lubbert')?.role).toBe('rival')
  }, 60_000)

  it('the player can make peace, if both trust them', async () => {
    const engine = new Engine(content, { seed: 23, builder: true })
    grudge(engine.world, 'npc_gerrit', 'npc_jan_visser')
    engine.state.relations = { npc_gerrit: { affinity: 40, trust: 40, fear: 0, familiarity: 50 }, npc_jan_visser: { affinity: 40, trust: 40, fear: 0, familiarity: 50 } }
    expect(await say(engine, '@bring gerrit', 'mediate between gerrit and jan')).toMatch(/shake on it/)
    expect(engine.state.bonds!['npc_gerrit']!['npc_jan_visser']!.grudge).toBeUndefined()
  })
})

describe('M8.2: a lie about the war, and asking around', () => {
  it('the rumour that the war is over sends some home; who asks a trader first stays', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 24, llm: mock, builder: true })
    runUntil(engine, 15, 9)
    mock.chronicle = (meta, planned) => {
      const area = meta.cards.find((c) => c.kind === 'area' && c.name === 'Veenhoek')?.key
      const church = meta.cards.find((c) => c.kind === 'place' && /Waagdam/.test(c.text) && /church/i.test(c.name))?.key
      return planned && area && church ? { plans: [{ line: planned, name: 'Veenhoek flees the war', phases: [{ after: 1, effects: [{ flee: area, to: church, days: 3 }] }] }] } : {}
    }
    for (let i = 0; i < 6; i++) shiftTension(engine.world, 'nethermarch', 'rijkland', 10, 'the border')
    engine.tick(1)
    await engine.runChronicler()
    engine.tick(DAY)
    const fled = engine.state.plans!.flatMap((p) => p.groups['veenhoek'] ?? []).filter((id) => engine.state.npcs[id]!.stayAt || engine.state.npcs[id]!.note)
    expect(fled.length).toBeGreaterThan(3)
    // Lubbert wants them gone: the refugees stay on, and his brain may choose to lie (honesty -2, and he knows there is war).
    mock.intend = (npc, offered) => (npc === 'npc_lubbert' && offered.includes('lie_peace') ? { choice: 'lie_peace' } : undefined)
    queueSignal(engine.world, { kind: 'strangers_stay', who: ['npc_lubbert'], place: 'loc_waagdam_church', cause: [], belang: 1, claim: { subject: 'nethermarch|rijkland', key: 'stance', value: 'war' }, watcher: 'test' })
    engine.tick(1)
    expect(engine.state.signals!.log.find((s) => s.kind === 'strangers_stay')!.handled).toBe('brain')
    await engine.runBrain()
    engine.tick(1)
    const lie = engine.state.news!.facts.find((f) => f.truth === false && f.claim?.key === 'stance')!
    expect(lie.claim!.value).toBe('peace')
    // He tells them at the church.
    const refugees = fled.filter((id) => engine.state.npcs[id]!.stayAt)
    for (const id of refugees) passOn(engine.world, 'npc_lubbert', id, lie.id)
    // The models do their work in the background, as in the game.
    for (let h = 0; h < 48; h++) {
      engine.tick(60)
      await engine.runModels()
    }
    const asked = engine.state.signals!.log.filter((s) => s.kind === 'doubt' && refugees.includes(s.who[0]!)).map((s) => s.who[0]!)
    const left = refugees.filter((id) => !engine.state.npcs[id]!.stayAt)
    expect(left.length).toBeGreaterThan(0)
    expect(asked.length).toBeGreaterThan(0)
    for (const id of asked) expect(left).not.toContain(id)
    for (const id of left) expect(engine.state.news!.heard[id]![lie.id]!.stance).toBeUndefined()
    for (const id of asked) expect(engine.state.news!.heard[id]![lie.id]!.stance).toBe('rejects')
    for (const id of asked) expect(believes(engine.world, id, 'nethermarch|rijkland', 'stance')?.value).toBe('war')
  }, 60_000)
})

describe('M8.2: a stranger with a warning', () => {
  async function leak(seed: number, trusted: boolean) {
    const engine = homeStart(new Engine(content, { seed, builder: true }))
    runUntil(engine, 15, 8)
    const world = engine.world
    // Teunis from Waagdam finds the leak while the dyke reeve is at home.
    const place = (id: string, where: string) => Object.assign(engine.state.npcs[id]!, { location: where, plan: [], busyUntil: world.now + 60 })
    place('npc_teunis', 'loc_oude_zijl_dyke')
    place('npc_sijbrand', 'loc_oude_zijl_dykehouse')
    startPlan(world, { pass: () => [] }, 'dyke_leak', 'test')
    const leakFact = engine.state.news!.facts.find((f) => f.claim?.value === 'leaking')!
    expect(engine.state.news!.heard['npc_teunis']![leakFact.id]).toBeDefined()
    expect(engine.state.news!.heard['npc_sijbrand']?.[leakFact.id]).toBeUndefined()
    if (trusted) {
      const row = (engine.state.bonds!['npc_klaas'] ??= {})
      row['npc_teunis'] = { affinity: 40, trust: 70, fear: 0, familiarity: 60 }
    }
    // He tells it at the mill in Molenend.
    for (const id of ['npc_teunis', 'npc_harmen', 'npc_klaas']) place(id, 'loc_molenend_mill')
    for (const id of ['npc_harmen', 'npc_klaas']) passOn(world, 'npc_teunis', id, leakFact.id)
    engine.tick(3 * DAY)
    return { engine, leakFact }
  }

  it('is distrusted in Molenend and chased off, and one who believes him carries word in time', async () => {
    const { engine, leakFact } = await leak(25, true)
    const heard = engine.state.news!.heard
    expect(heard['npc_harmen']![leakFact.id]!.stance).toBeDefined()
    expect(engine.state.news!.facts.some((f) => f.kind === 'chased' && f.about[0] === 'npc_harmen')).toBe(true)
    expect(heard['npc_klaas']![leakFact.id]!.stance).toBeUndefined()
    expect(heard['npc_sijbrand']![leakFact.id]).toBeDefined()
    expect(engine.state.flags!['dyke_shored']).toBe(true)
    expect(engine.state.plans!.some((p) => p.plan === 'dyke_breach')).toBe(false)
  }, 60_000)

  it('without anyone who believes him, the dyke breaks when its clock runs out', async () => {
    const { engine } = await leak(25, false)
    expect(engine.state.flags!['dyke_shored']).toBeUndefined()
    expect(engine.state.plans!.some((p) => p.plan === 'dyke_breach')).toBe(true)
  }, 60_000)

  it('a town hears a stranger out where a hamlet does not', () => {
    const engine = new Engine(content, { seed: 26 })
    const world = engine.world
    const fact = recordFact(world, { kind: 'danger', about: [], place: 'loc_oude_zijl_dyke', belang: 2, title: 'leak', text: { precise: 'p', village: 'v', far: 'f' }, claim: { subject: 'loc_oude_zijl_dyke', key: 'state', value: 'leaking' }, witnesses: [] })
    let town = 0
    let hamlet = 0
    for (let i = 0; i < 40; i++) {
      for (const [who, where] of [['npc_dirck', 'loc_waagdam_market'], ['npc_klaas', 'loc_molenend_mill']] as const) {
        engine.state.npcs[who]!.location = where
        delete engine.state.news!.heard[who]
        const h = { level: 3 as const, reliability: 1, from: 'npc_gerrit', t: world.now }
        engine.state.news!.heard[who] = { [fact.id]: h }
        if (judge(world, who, fact, h) === 'believes') who === 'npc_dirck' ? town++ : hamlet++
      }
    }
    expect(town).toBeGreaterThan(hamlet)
  })
})

describe('M8.2: forgetting and recognising', () => {
  it('who do not see each other forget each other to a memory; a refugee back after a year is known by who knew him well, and spoken to', () => {
    const engine = new Engine(content, { seed: 27 })
    const world = engine.world
    const away = 'npc_jan_visser'
    // A year apart: every sighting of him is a year old.
    for (const [id, s] of Object.entries(engine.state.npcs)) if (id !== away) (s.sightings ??= {})[away] = { where: world.npc(away).home, t: world.now - 400 * DAY }
    engine.state.npcs[away]!.sightings = {}
    engine.state.npcs[away]!.note = { unrest: 'travelling', where: 'graafhaven', from: engine.state.npcs[away]!.location, since: world.now, until: world.now + 2 * DAY, activity: 'away', home: true }
    const friend = Object.keys(engine.state.bonds!).find((id) => id !== away && tieTo(world, id, away) && tieTo(world, id, away)!.kind !== 'family' && (engine.state.bonds![id]![away]?.familiarity ?? 0) >= 60)!
    for (let w = 0; w < 52; w++) forgetWeek(world)
    expect(engine.state.bonds![friend]![away]!.familiarity).toBeLessThan(10)
    expect(engine.state.npcs[friend]!.memory!.some((m) => m.topics.includes(away))).toBe(true)
    // Back home: his wife knew him best, and knows him again; the one who is only a memory may not.
    const kin = Object.keys(engine.state.bonds!).find((id) => id !== away && tieTo(world, id, away)?.kind === 'family' && !world.npc(id).child)!
    expect(engine.state.bonds![kin]![away]!.familiarity).toBeGreaterThan(30)
    engine.tick(3 * DAY)
    for (let h = 0; h < 48 && !engine.state.signals?.log.some((s) => s.kind === 'recognised' && s.who[0] === kin); h++) {
      engine.state.npcs[kin]!.location = engine.state.npcs[away]!.location
      engine.tick(15)
    }
    expect(engine.state.signals!.log.some((s) => s.kind === 'recognised' && s.who[0] === kin && s.who[1] === away)).toBe(true)
    expect(engine.state.npcs[kin]!.thoughts!.some((t) => /is back/.test(t.text))).toBe(true)
    // And goes to speak to him.
    const signal = engine.state.signals!.log.find((s) => s.kind === 'recognised' && s.who[0] === kin)!
    expect(engine.state.plans!.find((p) => p.signal === signal.id)?.steps?.['talk']?.done).toBeDefined()
  }, 60_000)
})

describe('M8.2: greetings and chats where the player is', () => {
  it('people greet by their bond, stop to talk when they have time and news, and LISTEN catches the gist', async () => {
    const engine = new Engine(content, { seed: 28, builder: true })
    runUntil(engine, 15, 14)
    const world = engine.world
    await say(engine, '@goto loc_veenhoek_green')
    const here = engine.state.player.location
    // Mirte knows something Grietje has not heard.
    const fact = recordFact(world, { kind: 'rumour', about: ['npc_harmen'], place: 'loc_waagdam_market', belang: 2, title: 'the mill', text: { precise: 'Harmen has sold the mill, they say.', village: 'Harmen has sold the mill!', far: 'A mill was sold.' }, witnesses: [] })
    engine.state.news!.heard['npc_mirte']![fact.id] = { level: 3, reliability: 1, from: 'witness', t: world.now }
    for (const id of ['npc_mirte', 'npc_grietje_visser']) Object.assign(engine.state.npcs[id]!, { location: 'loc_veenhoek_bakery', plan: [{ kind: 'move', to: here }], busyUntil: world.now, goals: [] })
    engine.state.bonds!['npc_mirte']!['npc_grietje_visser'] = { affinity: 50, trust: 50, fear: 0, familiarity: 80 }
    engine.state.bonds!['npc_grietje_visser']!['npc_mirte'] = { affinity: 50, trust: 50, fear: 0, familiarity: 80 }
    let seen = ''
    for (let m = 0; m < 15 && !engine.state.chatter?.chats.length; m++) seen += await say(engine, 'wait 1')
    seen += await say(engine, 'look')
    expect(seen).toMatch(/(Mirte|Grietje) (claps|nods to) (Grietje|Mirte)|(Mirte|Grietje) and (Mirte|Grietje) greet/)
    expect(seen).toMatch(/(Mirte|Grietje) and (Mirte|Grietje) stand talking/)
    expect(await say(engine, 'listen')).toMatch(/Harmen has sold the mill/)
    expect(engine.state.news!.heard['player']![fact.id]!.level).toBe(2)
  }, 60_000)

  it('about the player they lower their voices', async () => {
    const engine = new Engine(content, { seed: 29, builder: true })
    runUntil(engine, 15, 14)
    const world = engine.world
    await say(engine, '@goto loc_veenhoek_green')
    const here = engine.state.player.location
    const fact = recordFact(world, { kind: 'rumour', about: ['player'], place: 'loc_waagdam_market', belang: 3, title: 'the stranger', text: { precise: 'The stranger was seen with the surveyor.', village: 'The stranger is in with the surveyor!', far: 'A stranger in the fen.' }, witnesses: [] })
    engine.state.news!.heard['npc_wendela']![fact.id] = { level: 3, reliability: 1, from: 'witness', t: world.now }
    for (const id of ['npc_wendela', 'npc_aaltje']) Object.assign(engine.state.npcs[id]!, { location: 'loc_veenhoek_chapel', plan: [{ kind: 'move', to: here }], busyUntil: world.now, goals: [] })
    engine.state.bonds!['npc_wendela']!['npc_aaltje'] = { affinity: 50, trust: 50, fear: 0, familiarity: 80 }
    engine.state.bonds!['npc_aaltje']!['npc_wendela'] = { affinity: 50, trust: 50, fear: 0, familiarity: 80 }
    for (let m = 0; m < 15 && !engine.state.chatter?.chats.length; m++) await say(engine, 'wait 1')
    expect(await say(engine, 'listen')).toMatch(/lowers her voice/)
    expect(engine.state.news!.heard['player']?.[fact.id]).toBeUndefined()
  }, 60_000)
})

describe('M8.2: intentions of the brain, and the standard aftermath to fall back on', () => {
  function rich(engine: Engine) {
    engine.tick(60)
    engine.state.npcs['npc_harmen']!.money += 800
    engine.tick(60)
  }

  it('without AI everything carries on by the standard aftermath', () => {
    const engine = new Engine(content, { seed: 30 })
    rich(engine)
    const signal = engine.state.signals!.log.find((s) => s.kind === 'rose_in_standing')!
    expect(signal.handled).toBe('rules')
    expect(engine.state.plans!.some((p) => p.signal === signal.id && p.source === 'rules')).toBe(true)
  })

  it('a brain may choose an intention of the content and fill it in; a wrong choice is custom\'s to decide', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 31, llm: mock })
    let offered: string[] = []
    mock.intend = (npc, list, keys) => {
      if (npc !== 'npc_harmen') return undefined
      offered = list
      const mirte = Object.entries(keys).find(([, id]) => id === 'npc_mirte')![0]
      return { choice: 'lend_money', fill: [{ name: 'debtor', key: mirte }] }
    }
    rich(engine)
    const signal = engine.state.signals!.log.find((s) => s.kind === 'rose_in_standing')!
    expect(signal.handled).toBe('brain')
    await engine.runBrain()
    expect(offered).toEqual(['keep_head_down', 'lend_money', 'show_standing'])
    engine.tick(60)
    const intention = engine.state.plans!.find((p) => p.source === 'brain' && p.subjects?.includes('npc_harmen'))!
    expect(intention).toMatchObject({ plan: 'intention:lend_money', bind: { debtor: 'npc_mirte' } })
    expect(engine.state.npcs['npc_harmen']!.thoughts!.some((t) => /Mirte is short of money/.test(t.text))).toBe(true)
    // The rules still do their part: the neighbours are envious; the standard aftermath of the brain's part does not run.
    expect(engine.state.plans!.some((p) => p.signal === signal.id && p.plan === 'aftermath:envy')).toBe(true)
    expect(engine.state.plans!.some((p) => p.signal === signal.id && p.plan === 'aftermath:rose_in_standing')).toBe(false)

    // A place where a person is wanted: custom decides after all.
    const other = new MockLlm('good')
    const second = new Engine(content, { seed: 31, llm: other })
    other.intend = (npc, _list, keys) => (npc === 'npc_harmen' ? { choice: 'lend_money', fill: [{ name: 'debtor', key: Object.keys(keys).find((k) => k.startsWith('l'))! }] } : undefined)
    rich(second)
    const results = await second.runBrain()
    expect(results.at(-1)!.rejected.join(' ')).toMatch(/debtor is not a person/)
    second.tick(60)
    const again = second.state.signals!.log.find((s) => s.kind === 'rose_in_standing')!
    expect(second.state.plans!.some((p) => p.signal === again.id && p.plan === 'aftermath:rose_in_standing')).toBe(true)
  })

  it('with the day\'s budget for signals used up, the standard aftermath does it', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 32, llm: mock })
    engine.tick(60)
    engine.state.brain = { seq: 0, pending: [], counts: {}, signals: { day: Math.floor(engine.world.now / DAY) * DAY, n: 999 } }
    engine.state.npcs['npc_harmen']!.money += 800
    engine.tick(60)
    // Harmen has a part in a quest: with a model, the chronicler takes it in the night run (M8.3); he plans nothing, so custom decides.
    engine.tick(DAY)
    await engine.runChronicler()
    engine.tick(60)
    const signal = engine.state.signals!.log.find((s) => s.kind === 'rose_in_standing')!
    expect(signal.handled).toBe('rules')
    expect(engine.state.plans!.some((p) => p.signal === signal.id && p.plan === 'aftermath:rose_in_standing')).toBe(true)
  })
})
