import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, recordFact, type Fact } from '../src/engine'
import type { ChronicleMeta } from '../src/chronicler'
import { textProblem } from '../src/engine/truth'
import { shiftTension } from '../src/engine/social/realms'
import { buildInput } from '../src/engine/chronicler'
import { PlanSchema } from '../src/engine/quests/planschema'
import { startPlan } from '../src/engine/quests/plans'
import type { QuestHost } from '../src/engine/quests/engine'
import { languageReference } from '../src/engine/quests/reference'
import { content, runUntil } from './helpers'

// Milestone M9.2 (docs/ROADMAP.md): truth and coherence. The chronicler says
// nothing a fact does not carry; free steps carry the conditions fixed ones
// do; what happens during a call is not lost; cause and effect sit on facts
// and lines. Each test plays the scenario of the review.

const DAY = 24 * 60
const text = (precise: string) => ({ precise, village: precise, far: 'Something happened in the fen.' })

describe('M9.2: a run keeps what it offered', () => {
  it('a fact that came during the call waits for the next run, and names are checked against what the model saw', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 120, llm: mock })
    runUntil(engine, 15, 9)
    const world = engine.world
    const stranger = content.npcs.get('npc_sijbrand')!.name
    const a = recordFact(world, { kind: 'fire', about: ['npc_gerrit'], place: 'loc_peat_sheds', belang: 4, title: 'the peat sheds burn', text: text('The peat sheds of Gerrit burned down in the night.') })
    let b: Fact | undefined
    mock.chronicle = (meta) => {
      // While the model writes, the sheds burn again, and someone new is in it.
      b ??= recordFact(world, { kind: 'fire', about: ['npc_gerrit', 'npc_sijbrand'], place: 'loc_peat_sheds', belang: 3, title: 'the sheds burn again', text: text(`${stranger} was seen at the sheds when they burned again.`) })
      const line = meta.lines[0]!
      return { lore: [{ line: line.key, name: 'The Burning Sheds', summary: `${stranger} set the sheds alight, they say.`, details: 'Twice they burned.', story: 'Twice they burned, and twice the fen was lit up like day.', far: 'Fires in the fen.', teller: '', links: [] }] }
    }
    const [done] = await engine.runChronicler()
    const line = engine.state.chronicle!.lines.find((l) => l.facts.includes(a.id))!
    expect(line.facts).toContain(b!.id)
    expect(line.reported).toContain(a.id)
    expect(line.reported).not.toContain(b!.id)
    // He was not in what the model saw: the lore is refused, and the template tells what was offered.
    expect(done!.problems.join(' ')).toMatch(/not in the story/)
    const lore = engine.state.chronicle!.lore.find((l) => l.line === line.id)!
    expect(lore.by).toBe('template')
    expect(lore.facts).toEqual([a.id])
    // The next run takes up what came meanwhile.
    mock.chronicle = undefined
    runUntil(engine, 16, 4, 30)
    await engine.runChronicler()
    expect(engine.state.chronicle!.lines.find((l) => l.id === line.id)!.reported).toContain(b!.id)
    // The log keeps what each run offered, so a replay checks against the same.
    const runs = engine.save().log.filter((e) => e.k === 'chron')
    expect(runs[0]!.k === 'chron' && runs[0]!.offered?.facts).toEqual([a.id])
  }, 120_000)
})

describe('M9.2: lore says only what a fact carries', () => {
  /** A big fire at Gerrit's, the chronicler's lore for it as the hook writes it, and what came of it. */
  async function tell(seed: number, write: (meta: ChronicleMeta) => Record<string, unknown>, judge?: (story: string) => string[]) {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed, llm: mock })
    runUntil(engine, 15, 9)
    const fact = recordFact(engine.world, { kind: 'fire', about: ['npc_gerrit'], place: 'loc_peat_sheds', belang: 4, title: 'the peat sheds burn', text: text('The peat sheds of Gerrit burned down in the night.') })
    mock.chronicle = (meta) => {
      const line = meta.lines[0]!
      const gerrit = meta.cards.find((c) => c.id === 'npc_gerrit')!.key
      return { lore: [{ line: line.key, name: 'The Burning Sheds', summary: 'The sheds burned.', details: 'The peat sheds burned down in the night.', story: 'The sheds went up in the night, and the fen was lit up like day.', far: 'Fires in the fen.', teller: '', links: [], claims: [{ event: line.event, subject: gerrit, key: 'present', value: 'yes' }], ...write({ ...meta, lines: [{ ...line, who: [gerrit] }] }) }] }
    }
    mock.judge = judge ?? (() => [])
    const [done] = await engine.runChronicler()
    const lore = engine.state.chronicle!.lore.find((l) => l.facts.includes(fact.id))!
    return { lore, problems: done!.problems.join(' ') }
  }

  it('keeps lore whose claims rest on the storyline and hold', async () => {
    const { lore, problems } = await tell(121, () => ({}))
    expect(problems).toBe('')
    expect(lore.by).toBe('chronicler')
    expect(lore.name).toBe('The Burning Sheds')
  })

  it('"Gerrit is dead" with a living Gerrit falls back to the template', async () => {
    const { lore, problems } = await tell(122, () => ({ story: 'The sheds went up in the night. Gerrit is dead, they say, burned in his own sheds.' }))
    expect(problems).toMatch(/Gerrit is alive/)
    expect(lore.by).toBe('template')
    expect(lore.story).not.toMatch(/dead/)
  })

  it('refuses a claim no event carries, a claim the world denies, and lore without claims', async () => {
    const dead = await tell(123, (meta) => ({ claims: [{ event: meta.lines[0]!.event, subject: meta.lines[0]!.who[0], key: 'dead', value: 'yes' }] }))
    expect(dead.problems).toMatch(/is alive/)
    expect(dead.lore.by).toBe('template')
    const nowhere = await tell(124, (meta) => ({ claims: [{ event: 'e99', subject: meta.lines[0]!.who[0], key: 'present', value: 'yes' }] }))
    expect(nowhere.problems).toMatch(/no event of the storyline/)
    const bare = await tell(125, () => ({ claims: [] }))
    expect(bare.problems).toMatch(/no claims/)
    expect(bare.lore.by).toBe('template')
  })

  it('checks a home and a thing in the words against the world', () => {
    const world = new Engine(content, { seed: 126 }).world
    expect(textProblem(world, ['Gerrit, who lives at the Waag, saw it all.'])).toMatch(/Gerrit does not live at/)
    expect(textProblem(world, ["They say it was Gerrit's windmill that burned."])).toMatch(/windmill is not Gerrit's/)
    expect(textProblem(world, ["Harmen's windmill stood through it all.", "Gerrit lives at Gerrit's House, by the sheds."])).toBeUndefined()
  })

  it('at belang 4 a second look finds what no fact says, and the template tells it', async () => {
    const { lore, problems } = await tell(127, () => ({ story: 'The sheds went up in the night, and a second fire took the chapel roof.' }), (story) => (/chapel/.test(story) ? ['a second fire at the chapel'] : []))
    expect(problems).toMatch(/second look found what no fact says \(a second fire at the chapel\)/)
    expect(lore.by).toBe('template')
  })
})

describe('M9.2: the standard conditions of a verb', () => {
  /** Mirte fled to the church of Waagdam; her bakery is flooded. A plan sends her home. */
  function setUp(seed: number, id: string, source: 'chronicler' | 'content', unguarded = false) {
    const engine = new Engine(content, { seed, builder: true })
    runUntil(engine, 15, 9)
    const world = engine.world
    Object.assign(engine.state.npcs['npc_mirte']!, { location: 'loc_waagdam_church', stayAt: { where: 'loc_waagdam_church', until: world.now + 10 * DAY }, plan: [], busyUntil: world.now })
    ;(engine.state.places ??= {})['loc_veenhoek_bakery'] = { state: 'flooded', since: world.now }
    ;(engine.state.dynamicPlans ??= {})[id] = PlanSchema.parse({ id, name: 'home again', steps: [{ id: 'home', do: { return: 'npc_mirte' }, otherwise: 'wait', unguarded }] })
    startPlan(world, (engine as unknown as { questHost: QuestHost }).questHost, id, 'test', { source })
    return engine
  }
  const home = (engine: Engine) => !engine.state.npcs['npc_mirte']!.stayAt

  it('a return waits while the house is not safe, and is checked again when the step runs', () => {
    const engine = setUp(130, 'chronicle_test_1', 'chronicler')
    engine.tick(6 * 60)
    expect(home(engine)).toBe(false)
    engine.state.places!['loc_veenhoek_bakery'] = { state: 'normal', since: engine.world.now }
    engine.tick(60)
    expect(home(engine)).toBe(true)
  })

  it('content may leave them out on purpose; a plan a model made may not', () => {
    const content_ = setUp(131, 'test_plan_home', 'content', true)
    content_.tick(60)
    expect(home(content_)).toBe(true)
    const model = setUp(132, 'chronicle_test_2', 'chronicler', true)
    model.tick(6 * 60)
    expect(home(model)).toBe(false)
  })

  it('stands in the reference of the language, for the chronicler and the editor', () => {
    expect(languageReference().verbs.find((v) => v.name === 'return')!.text).toMatch(/Standard conditions: only when they know what drove them away is over, believe their house stands/)
  })
})

describe('M9.2: cause and effect on facts and lines', () => {
  it('war, a road shut, shortage, unrest and flight are one arc for the chronicler', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 41, llm: mock, builder: true })
    runUntil(engine, 15, 9)
    // The chronicler lets Veenhoek flee the war to the church of Waagdam.
    mock.chronicle = (meta, planned) => {
      const area = meta.cards.find((c) => c.kind === 'area' && c.name === 'Veenhoek')?.key
      const church = meta.cards.find((c) => c.kind === 'place' && /Waagdam/.test(c.text) && /church/i.test(c.name))?.key
      return planned && area && church ? { plans: [{ line: planned, signal: '', name: 'Veenhoek flees the war', phases: [{ after: 1, effects: [{ flee: area, to: church, days: 3 }] }], steps: [] }] } : {}
    }
    for (let i = 0; i < 6; i++) shiftTension(engine.world, 'nethermarch', 'rijkland', 10, 'the border')
    engine.tick(1)
    await engine.runChronicler()
    mock.chronicle = () => ({})
    for (let h = 0; h < 10 * 24; h++) {
      engine.tick(60)
      await engine.runModels()
    }
    const facts = engine.state.news!.facts
    const find = (test: (f: Fact) => boolean) => facts.find(test)!
    const war = find((f) => f.claim?.key === 'stance' && f.claim.value === 'war')
    const road = find((f) => f.claim?.subject === 'zwolderkamp_oostweg' && f.claim.value === 'closed')
    const short = find((f) => f.claim?.key === 'short' && f.claim.subject === 'waagdam' && f.claim.value === 'lamp_oil')
    const lasting = [...facts].reverse().find((f) => f.claim?.key === 'short' && f.claim.value === 'lamp_oil' && f.id !== short.id)!
    const unrest = find((f) => f.kind === 'group' && /gone/.test(f.title))
    const flight = find((f) => f.kind === 'flight')
    expect(road.cause).toContain(war.id)
    expect(short.cause).toContain(road.id)
    expect(lasting.cause).toEqual(expect.arrayContaining([road.id, short.id]))
    expect(unrest.cause).toContain(war.id)
    expect(flight.cause).toContain(war.id)
    // Every line of it goes back to the line of the war.
    const lines = engine.state.chronicle!.lines
    const lineOf = (f: Fact) => lines.find((l) => l.facts.includes(f.id))!
    const root = (id: string): string => {
      const l = lines.find((x) => x.id === id)!
      return l.follows ? root(l.follows) : l.id
    }
    for (const f of [road, short, lasting, unrest, flight]) expect(root(lineOf(f).id), f.title).toBe(lineOf(war).id)
    // What the chronicler sees of the last of it: the arc from the war on, and why.
    const input = buildInput(engine.world, { id: 'run_test', t: engine.world.now, reason: 'night', lines: [lineOf(lasting).id] })
    const seen = input.lines[0]!
    expect(seen.arc!.map((a) => a.title)).toEqual(expect.arrayContaining([war.title, road.title]))
    expect(seen.events.concat(seen.earlier).some((e) => e.because?.includes(road.title))).toBe(true)
  }, 120_000)

  it('a full line goes on as a new one that carries its note, open threads and cause', () => {
    const engine = new Engine(content, { seed: 133 })
    runUntil(engine, 15, 9)
    const world = engine.world
    const quarrel = (n: number) => recordFact(world, { kind: 'quarrel', about: ['npc_gerrit', 'npc_jan_visser'], place: 'loc_veenhoek_green', belang: 1, title: `quarrel ${n}`, text: text(`Gerrit and Jan quarrelled again (${n}).`) })
    const first = quarrel(1)
    const line = engine.state.chronicle!.lines.find((l) => l.facts.includes(first.id))!
    Object.assign(line, { summary: ['Gerrit and Jan cannot leave it alone.'], hooks: ['Who started it?'], cause: ['fact_1'] })
    for (let n = 2; n <= 12; n++) quarrel(n)
    expect(line.facts).toHaveLength(12)
    const thirteenth = quarrel(13)
    const next = engine.state.chronicle!.lines.find((l) => l.facts.includes(thirteenth.id))!
    expect(next.id).not.toBe(line.id)
    expect(next.follows).toBe(line.id)
    expect(next.summary).toEqual(['Gerrit and Jan cannot leave it alone.'])
    expect(next.hooks).toEqual(['Who started it?'])
    expect(next.cause).toEqual(['fact_1'])
    expect(line.open).toBe(false)
  })
})
