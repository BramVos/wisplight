import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyEdits, Engine, GameClock, loadContent, MockLlm, type SaveData } from '../src/engine'
import { believes, recordFact } from '../src/engine/news'
import { tieTo } from '../src/engine/people'
import { shiftTension } from '../src/engine/social/realms'
import { readContentFiles } from '../src/node/content'
import { content, runUntil } from './helpers'

// Milestone M8.1 (docs/ROADMAP.md): the aftermath, its foundation. Signals
// from watchers in the content, a standard aftermath per signal, plans over
// days with conditions on what people know and what is true, and a layer in
// the savegame for ties, homes, work and households. Still without extra AI.

const root = resolve(import.meta.dirname, '../content')
const DAY = 24 * 60

function fixture(name: string): SaveData {
  return JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures', name), 'utf8')) as SaveData
}

async function say(engine: Engine, ...commands: string[]): Promise<string> {
  const out: string[] = []
  for (const c of commands) out.push(...(await engine.handle(c)).map((o) => o.text))
  return out.join('\n')
}

describe('M8.1: an old save loads and plays on', () => {
  for (const [world, file] of [['base', 'save-base-m8.json'], ['isle', 'save-isle-m8.json'], ['base', 'save-base-m8-flood.json']] as const) {
    it(`${file}: three more days, nobody starving or stuck`, async () => {
      const source = world === 'base' ? content : loadContent(await readContentFiles(root, 'isle'))
      const engine = Engine.fromSave(source, fixture(file))
      const start = engine.world.now
      await engine.handle('look')
      for (let hour = 0; hour < 72; hour++) {
        engine.tick(60)
        for (const [id, npc] of Object.entries(engine.state.npcs)) if (!npc.dead && !npc.absent) expect(npc.needs.hunger, `${id} starving`).toBeGreaterThan(0)
      }
      expect(engine.world.now - start).toBeGreaterThanOrEqual(3 * DAY)
      if (file.includes('flood')) {
        // The old plan keeps its fixed duration: everyone who fled is home within its seven days.
        engine.tick(7 * DAY)
        const plan = engine.state.plans!.find((p) => p.plan === 'dyke_breach')!
        expect(plan.phase).toBe(5)
        for (const id of Object.values(plan.groups).flat()) expect(engine.state.npcs[id]!.stayAt, `${id} still away`).toBeUndefined()
      }
    }, 60_000)
  }
})

describe('M8.1: Wouter and Geesje marry', () => {
  it('gives a feast, a move and a vacancy at Trijntje\'s, and the village hears of it', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    await say(engine, '@quest a_boat_and_a_bride', '@flag trijntje_blesses', 'wait 1')
    expect(engine.state.questlog!['a_boat_and_a_bride']!.outcome).toBe('blessed')
    // The rules take it up: a plan of the standard aftermath, over days.
    const signal = engine.state.signals!.log.find((s) => s.kind === 'life_event' && s.event === 'betrothal')
    expect(signal?.who).toEqual(['npc_wouter', 'npc_geesje'])
    expect(engine.state.plans!.some((p) => p.source === 'rules' && p.signal === signal!.id)).toBe(true)
    // The first rest day at least a week on: Rustdag 26 Herfstmaand.
    runUntil(engine, 26, 17)
    const feast = engine.state.stories!.active.find((s) => s.kind === 'feast')
    expect(feast?.data['place']).toBe('loc_goose_common')
    runUntil(engine, 29, 12)
    const wedding = engine.state.news!.facts.find((f) => f.claim?.key === 'married')!
    expect(wedding.claim).toMatchObject({ subject: 'npc_wouter', value: 'npc_geesje' })
    expect(tieTo(engine.world, 'npc_wouter', 'npc_geesje')?.role).toBe('spouse')
    expect(tieTo(engine.world, 'npc_geesje', 'npc_wouter')?.role).toBe('spouse')
    expect(engine.world.npc('npc_geesje').home).toBe('loc_wouter_hut')
    expect(engine.world.npc('npc_geesje').work).toBeUndefined()
    expect(engine.world.service('loc_goose_common', 'taproom')!.staff).not.toContain('npc_geesje')
    // The vacancy is on the board at the Goose, Trijntje knows it, and so does the village.
    const vacancy = engine.state.news!.facts.find((f) => f.claim?.key === 'vacancy')!
    expect(vacancy.claim!.subject).toBe('loc_goose_common#taproom')
    const heard = engine.state.news!.heard
    expect(heard['npc_trijntje']![vacancy.id]).toBeDefined()
    expect(Object.values(heard).filter((h) => h[wedding.id]).length).toBeGreaterThan(5)
    // Geesje sleeps at her new home.
    runUntil(engine, 30, 2)
    expect(engine.state.npcs['npc_geesje']!.location).toBe('loc_wouter_hut')
  }, 60_000)
})

describe('M8.1: the player marries by the same aftermath', () => {
  it('a home, in-laws and a spouse who expects you, as before, and now a tie of the kind spouse', async () => {
    const engine = new Engine(content, { seed: 5, builder: true })
    engine.state.romance = { npc_wouter: { stage: 'together', since: engine.world.now } }
    const out = await say(engine, '@goto loc_veenhoek_chapel', '@bring wouter', 'marry wouter')
    expect(out).toMatch(/is your home now/)
    expect(engine.state.player.home).toBe('loc_wouter_hut')
    expect(engine.state.signals!.log.some((s) => s.kind === 'life_event' && s.event === 'wedding' && s.who.includes('player'))).toBe(true)
    expect(tieTo(engine.world, 'npc_wouter', 'player')?.role).toBe('spouse')
    const { relation } = await import('../src/engine/dialogue/relations')
    const before = relation(engine.state, 'npc_wouter').affinity
    engine.tick(6 * DAY)
    expect(relation(engine.state, 'npc_wouter').affinity).toBeLessThan(before)
  })
})

describe('M8.1: refugees go home by what they know', () => {
  it('after the war those who know it is peace and think their house stands go back; a wrong version keeps one away', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 6, llm: mock, builder: true })
    runUntil(engine, 15, 9)
    // The chronicler plans the flight of Veenhoek to the church at Waagdam.
    mock.chronicle = (meta, planned) => {
      const area = meta.cards.find((c) => c.kind === 'area' && c.name === 'Veenhoek')?.key
      const church = meta.cards.find((c) => c.kind === 'place' && /Waagdam/.test(c.text) && /church/i.test(c.name))?.key
      return planned && area && church ? { plans: [{ line: planned, name: 'Veenhoek flees the war', phases: [{ after: 1, effects: [{ flee: area, to: church, days: 3 }] }] }] } : {}
    }
    for (let i = 0; i < 6; i++) shiftTension(engine.world, 'nethermarch', 'rijkland', 10, 'the border')
    engine.tick(1)
    await engine.runChronicler()
    engine.tick(6 * 60)
    const fled = engine.state.plans!.flatMap((p) => p.groups['veenhoek'] ?? [])
    expect(fled.length).toBeGreaterThan(3)
    for (const id of fled) expect(engine.state.npcs[id]!.stayAt?.where ?? engine.state.npcs[id]!.note?.where).toBe('loc_waagdam_church')
    // The flight has no end of its own: after the three days they are still away.
    engine.tick(4 * DAY)
    for (const id of fled) expect(engine.world.npc(id).home === engine.state.npcs[id]!.location).toBe(false)
    // One of them heard that Veenhoek burned, in the far version.
    const doubter = fled[0]!
    const home = engine.world.npc(doubter).home
    const rumour = recordFact(engine.world, { kind: 'rumour', about: [home], place: 'loc_waagdam_church', belang: 2, title: 'Veenhoek burned', text: { precise: 'Soldiers went through Veenhoek.', village: 'Soldiers went through Veenhoek.', far: 'Veenhoek has burned, they say.' }, claim: { subject: home, key: 'state', value: 'normal', far: 'destroyed' }, witnesses: [] })
    engine.state.news!.heard[doubter]![rumour.id] = { level: 1, reliability: 0.5, from: 'npc_kobus', t: engine.world.now }
    // Peace.
    for (let i = 0; i < 3; i++) shiftTension(engine.world, 'nethermarch', 'rijkland', -10, 'a treaty')
    engine.tick(3 * DAY)
    const knows = fled.filter((id) => believes(engine.world, id, 'nethermarch|rijkland', 'stance')?.value !== 'war')
    expect(knows.length).toBeGreaterThan(1)
    const back = fled.filter((id) => !engine.state.npcs[id]!.stayAt && !engine.state.npcs[id]!.note)
    expect(back.length).toBeGreaterThan(0)
    for (const id of back) expect(knows).toContain(id)
    expect(back).not.toContain(doubter)
    expect(believes(engine.world, doubter, home, 'state')?.value).toBe('destroyed')
  }, 60_000)
})

describe('M8.1: a new kind of event is content', () => {
  it('a watcher and an aftermath added in the editor, and the world plays them', async () => {
    const files = await readContentFiles(root, 'base')
    const result = applyEdits(files, [
      { kind: 'watcher', id: 'bell_raised', data: { id: 'bell_raised', signal: 'bell_home', when: [{ flag: 'bell_raised' }], who: ['npc_wendela'], place: 'loc_kloosterveen_church', belang: 2 } },
      {
        kind: 'aftermath',
        id: 'bell_home',
        data: {
          id: 'bell_home',
          signal: 'bell_home',
          topic: 'feast',
          steps: [
            { id: 'feast', at: { days: 1, hour: 18 }, do: { feast: '$place', hours: 4, guests: ['$a'] } },
            { id: 'news', after: 'feast', do: { tell: { kind: 'bell', about: ['$a'], belang: 2, title: 'the bell rang for {a}', precise: 'They hung the old bell in the priory and rang it for {a}.', village: 'The old bell rang at Kloosterveen!', far: 'A bell was found in a lake.' } } },
          ],
        },
      },
    ])
    expect(result.problems).toEqual([])
    const engine = new Engine(result.content!, { seed: 7, builder: true })
    await say(engine, '@flag bell_raised')
    engine.tick(60)
    expect(engine.state.signals!.log.some((s) => s.kind === 'bell_home')).toBe(true)
    engine.tick(2 * DAY)
    expect(engine.state.news!.facts.some((f) => f.kind === 'bell' && f.title === 'the bell rang for Wendela')).toBe(true)
    // A broken aftermath is refused like any content.
    const bad = applyEdits(files, [{ kind: 'aftermath', id: 'x', data: { id: 'x', signal: 'bell_home', topic: 'x', steps: [{ id: 'a', do: { teleport: 'npc_wendela' } }] } }])
    expect(bad.ok).toBe(false)
  })
})

describe('M8.1: facts, knowledge and three repairs', () => {
  it('every quest outcome is a fact, also when the giver dies, but never twice', async () => {
    const engine = new Engine(content, { seed: 8, builder: true })
    await say(engine, '@quest the_bell_of_kloosterveen', '@flag mass_said', 'wait 1')
    const fact = engine.state.news!.facts.find((f) => f.claim?.subject === 'the_bell_of_kloosterveen')!
    expect(fact).toMatchObject({ kind: 'quest:the_bell_of_kloosterveen', belang: 2, claim: { key: 'outcome', value: 'blessed' } })
    await say(engine, '@quest a_boat_and_a_bride', '@kill wouter an accident')
    expect(engine.state.questlog!['a_boat_and_a_bride']!.outcome).toBe('giver_dead')
    expect(engine.state.news!.facts.some((f) => f.claim?.subject === 'a_boat_and_a_bride' && f.claim.value === 'giver_dead')).toBe(true)
    // An outcome with a fact of its own gets no second one.
    const main = [...content.quests.values()].find((q) => q.outcomes?.some((o) => o.effects.some((e) => 'fact' in e)))!
    const withFact = main.outcomes!.find((o) => o.effects.some((e) => 'fact' in e))!
    await say(engine, `@quest ${main.id}`)
    const { endQuest } = await import('../src/engine/quests/engine')
    const before = engine.state.news!.facts.length
    endQuest(engine.world, { pass: () => [] }, main.id, withFact.id, [])
    expect(engine.state.news!.facts.length - before).toBe(1)
  })

  it('what someone knows: the newest version wins, and with the same age the most precise', () => {
    const engine = new Engine(content, { seed: 9 })
    const world = engine.world
    const text = { precise: 'p', village: 'v', far: 'f' }
    const a = recordFact(world, { kind: 'x', about: [], place: 'loc_veenhoek_green', belang: 2, title: 'a', text, claim: { subject: 'loc_x', key: 'state', value: 'flooded' }, witnesses: [] })
    engine.tick(60)
    const b = recordFact(world, { kind: 'x', about: [], place: 'loc_veenhoek_green', belang: 2, title: 'b', text, claim: { subject: 'loc_x', key: 'state', value: 'normal', far: 'destroyed' }, witnesses: [] })
    const heard = (engine.state.news!.heard['npc_mirte'] ??= {})
    heard[a.id] = { level: 3, reliability: 1, from: 'witness', t: world.now }
    heard[b.id] = { level: 1, reliability: 0.8, from: 'npc_kobus', t: world.now }
    expect(believes(world, 'npc_mirte', 'loc_x', 'state')?.value).toBe('destroyed')
    heard[b.id] = { level: 2, reliability: 0.8, from: 'npc_kobus', t: world.now }
    expect(believes(world, 'npc_mirte', 'loc_x', 'state')?.value).toBe('normal')
    expect(believes(world, 'npc_harmen', 'loc_x', 'state')).toBeUndefined()
  })

  it('someone far away is no witness at their old place, and hears the news where they are', () => {
    const engine = new Engine(content, { seed: 10 })
    const world = engine.world
    const mirte = engine.state.npcs['npc_mirte']!
    mirte.note = { unrest: 'fixed', where: 'loc_waagdam_church', from: mirte.location, since: world.now, until: world.now + 10 * DAY, activity: 'at the church', home: true }
    const fact = recordFact(world, { kind: 'fire', about: [], place: mirte.location, belang: 3, title: 'a fire', text: { precise: 'p', village: 'v', far: 'f' } })
    expect(engine.state.news!.heard['npc_mirte']?.[fact.id]).toBeUndefined()
    engine.tick(DAY)
    expect(engine.state.news!.heard['npc_mirte']?.[fact.id]?.level).toBeLessThan(3)
  })

  it('plans of the aftermath do not keep the chronicler from planning', async () => {
    const { mayPlan } = await import('../src/engine/chronicler')
    const engine = new Engine(content, { seed: 11, builder: true })
    await say(engine, '@quest a_boat_and_a_bride', '@flag trijntje_blesses', 'wait 1')
    expect(engine.state.plans!.length).toBeGreaterThan(0)
    expect(mayPlan(engine.world)).toBe(true)
    await say(engine, '@plan dyke_breach')
    expect(mayPlan(engine.world)).toBe(false)
  })
})

describe('M8.1: Skerrow plays as before', () => {
  it('has what conversations need (M10.3) and mourning (M10.7), and without the stranger gives no signals', async () => {
    const isle = loadContent(await readContentFiles(root, 'isle'))
    // Death, loss and departure (M10.7) only fire when someone dies, is lost or leaves; two quiet days give none.
    expect([...isle.watchers.keys()]).toEqual(['asked_about', 'befriended', 'death', 'lost', 'departure'])
    const engine = new Engine(isle, { seed: 12 })
    engine.tick(2 * DAY)
    expect(engine.state.signals?.log ?? []).toEqual([])
    expect(GameClock).toBeDefined()
  })
})

describe('M8.1: a notice on the board', () => {
  it('the player reads what is pinned there', async () => {
    const engine = new Engine(content, { seed: 13, builder: true })
    await say(engine, '@quest a_boat_and_a_bride', '@flag trijntje_blesses', 'wait 1')
    runUntil(engine, 28, 12)
    expect(engine.state.boards?.['loc_goose_yard']?.length).toBe(1)
    expect(await say(engine, '@goto loc_goose_yard', 'examine board')).toMatch(/help wanted at The Drowned Goose, Common Room, ask for Trijntje/)
  }, 60_000)
})
