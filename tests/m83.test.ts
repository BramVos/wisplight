import { describe, expect, it } from 'vitest'
import { holds } from '../src/engine/quests/engine'
import { Engine, MockLlm } from '../src/engine'
import { recordFact } from '../src/engine/news'
import { shiftTension } from '../src/engine/social/realms'
import { newcomersOf } from '../src/engine/social/groups'
import { grudge, stories } from '../src/engine/stories'
import { requestRun } from '../src/engine/storylines'
import { content, runUntil, homeStart } from './helpers'

// Milestone M8.3 (docs/ROADMAP.md): the chronicler plans. Signals that touch
// many, matter a lot or fit no intention go to him; he writes steps in the
// one language of verbs, for groups person by person, one story out of two
// brains' crossing plans, and one beat for a rising storyline. What he may not
// do is refused, and then custom decides.

const DAY = 24 * 60

async function say(engine: Engine, ...commands: string[]): Promise<string> {
  const out: string[] = []
  for (const c of commands) out.push(...(await engine.handle(c)).map((o) => o.text))
  return out.join('\n')
}

/** A war, the chronicler lets Veenhoek flee to the church at Waagdam. */
async function refugees(seed: number) {
  const mock = new MockLlm('good')
  const engine = new Engine(content, { seed, llm: mock, builder: true })
  runUntil(engine, 15, 9)
  mock.chronicle = (meta, planned) => {
    const area = meta.cards.find((c) => c.kind === 'area' && c.name === 'Veenhoek')?.key
    const church = meta.cards.find((c) => c.kind === 'place' && /Waagdam/.test(c.text) && /church/i.test(c.name))?.key
    return planned && area && church ? { plans: [{ line: planned, signal: '', name: 'Veenhoek flees the war', phases: [{ after: 1, effects: [{ flee: area, to: church, days: 3 }] }], steps: [] }] } : {}
  }
  for (let i = 0; i < 6; i++) shiftTension(engine.world, 'nethermarch', 'rijkland', 10, 'the border')
  engine.tick(1)
  await engine.runChronicler()
  engine.tick(DAY)
  const fled = engine.state.plans!.flatMap((p) => p.groups['veenhoek'] ?? []).filter((id) => engine.state.npcs[id]!.stayAt || engine.state.npcs[id]!.note)
  return { mock, engine, fled }
}

describe('M8.3: one plan for the refugees', () => {
  it('after the war, one call decides who goes home and who stays in Waagdam', async () => {
    const { mock, engine, fled } = await refugees(41)
    expect(fled.length).toBeGreaterThan(3)
    let asked: { signal: string; group: string[] } | undefined
    mock.chronicle = (meta) => {
      const peace = meta.signals.find((g) => /stance/.test(g.text) && g.group.length)
      if (!peace) return {}
      asked = { signal: peace.key, group: peace.group }
      const church = meta.cards.find((c) => c.kind === 'place' && /Waagdam/.test(c.text) && /church/i.test(c.name))!.key
      const half = Math.ceil(peace.group.length / 2)
      return { plans: [{ line: '', signal: peace.key, name: 'Home, or not', phases: [], steps: [{ after: 0, verb: 'return', who: peace.group.slice(0, half), target: '', detail: '' }, { after: 2, verb: 'settle', who: peace.group.slice(half), target: church, detail: '' }] }] }
    }
    for (let i = 0; i < 3; i++) shiftTension(engine.world, 'nethermarch', 'rijkland', -10, 'a treaty')
    engine.tick(1)
    await engine.runChronicler()
    // The war took today's run that cannot wait (M10.22: one a game day); the peace goes in the night run.
    if (!asked) {
      engine.tick(((28 * 60 - (engine.world.now % (24 * 60))) % (24 * 60)) || 24 * 60)
      await engine.runChronicler()
    }
    // By the night some have heard of the peace and gone home on their own; the call is about the rest.
    expect(asked?.group.length).toBeGreaterThan(0)
    expect(asked!.group.length).toBeLessThanOrEqual(fled.length)
    engine.tick(12 * 60)
    const settled = fled.filter((id) => content.locations.get(engine.world.npc(id).home)!.area === 'waagdam')
    const home = fled.filter((id) => !settled.includes(id) && !engine.state.npcs[id]!.stayAt)
    expect(settled.length).toBeGreaterThan(0)
    expect(home.length).toBeGreaterThan(0)
    // Home only once they know the war is over (M9.2): the chronicler's word alone does not send anyone back.
    const waiting = fled.filter((id) => !settled.includes(id) && !home.includes(id))
    for (const id of waiting) expect(holds(engine.world, { knows: { who: id, subject: 'nethermarch|rijkland', key: 'stance', not: 'war' } }), id).toBe(false)
    expect(settled.length + home.length + waiting.length).toBe(fled.length)
    expect(engine.state.news!.facts.some((f) => f.kind === 'settled')).toBe(true)
    const signal = engine.state.signals!.log.find((s) => s.kind === 'realm_stance')!
    expect(signal.handled).toBe('chronicler')
  }, 60_000)
})

describe('M8.3: two brains whose plans cross', () => {
  it('become one story with an outcome', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 42, llm: mock })
    // Gerrit wants to have it out; Jan wants to keep out of his way.
    mock.intend = (npc, offered) => (npc === 'npc_gerrit' && offered.includes('have_it_out') ? { choice: 'have_it_out' } : npc === 'npc_jan_visser' && offered.includes('keep_away') ? { choice: 'keep_away' } : undefined)
    for (const who of ['npc_gerrit', 'npc_jan_visser']) engine.state.bonds![who]!['npc_aaltje'] = { affinity: 30, trust: 40, fear: 0, familiarity: 70 }
    grudge(engine.world, 'npc_gerrit', 'npc_jan_visser')
    recordFact(engine.world, { kind: 'quarrel', about: ['npc_gerrit', 'npc_jan_visser'], place: 'loc_veenhoek_green', belang: 1, title: 'the quarrel', text: { precise: 'p', village: 'v', far: 'f' } })
    engine.tick(1)
    await engine.runBrain()
    engine.tick(1)
    const brains = engine.state.plans!.filter((p) => p.source === 'brain')
    expect(brains.map((p) => p.plan).sort()).toEqual(['intention:have_it_out', 'intention:keep_away'])
    const crossing = engine.state.signals!.log.find((s) => s.kind === 'plans_cross')!
    expect(crossing.handled).toBe('chronicler')
    // In the night the chronicler makes one story of it: Aaltje sits them down.
    mock.chronicle = (meta) => {
      const g = meta.signals.find((s) => /plans cross/.test(s.text))
      const aaltje = meta.cards.find((c) => c.kind === 'person' && /Aaltje/.test(c.name) && g?.trusted.includes(c.key))?.key
      return g && aaltje ? { plans: [{ line: '', signal: g.key, name: 'Aaltje sits them down', phases: [], steps: [{ after: 6, verb: 'mediate', who: g.who, target: aaltje, detail: '' }] }] } : {}
    }
    engine.tick(DAY)
    await engine.runChronicler()
    engine.tick(12 * 60)
    for (const p of brains) expect(p.outcome).toBe('merged')
    expect(engine.state.plans!.some((p) => p.source === 'chronicler' && p.signal === crossing.id)).toBe(true)
    expect(engine.state.news!.facts.some((f) => f.kind === 'reconciled' && f.about.includes('npc_aaltje'))).toBe(true)
  }, 60_000)
})

describe('M8.3: steps the chronicler may not take', () => {
  it('are refused, and without a valid one custom decides', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 43, llm: mock })
    const problems: string[] = []
    mock.chronicle = (meta) => {
      const g = meta.signals[0]
      if (!g) return {}
      const place = meta.cards.find((c) => c.kind === 'place')!.key
      return { plans: [{ line: '', signal: g.key, name: 'Bad plan', phases: [], steps: [{ after: 0, verb: 'kill', who: g.who.slice(0, 1), target: '', detail: 'drowned' }, { after: 0, verb: 'goal', who: g.who.slice(0, 1), target: place, detail: 'Fly' }, { after: 0, verb: 'settle', who: g.who.slice(0, 1), target: g.who[0]!, detail: '' }] }] }
    }
    // Harmen and Geesje are betrothed: no intention fits a betrothal, so with a model it goes to the chronicler.
    engine.tick(60)
    recordFact(engine.world, { kind: 'betrothal', about: ['npc_harmen', 'npc_geesje'], place: 'loc_goose_common', belang: 2, title: 'a betrothal', text: { precise: 'p', village: 'v', far: 'f' }, claim: { subject: 'npc_harmen', key: 'betrothed', value: 'npc_geesje' } })
    engine.tick(60)
    const signal = engine.state.signals!.log.find((s) => s.event === 'betrothal')!
    expect(signal.handled).toBe('chronicler')
    engine.tick(DAY)
    problems.push(...(await engine.runChronicler()).flatMap((r) => r.problems))
    engine.tick(60)
    expect(problems.join(' ')).toMatch(/a verb outside the list: kill/)
    expect(problems.join(' ')).toMatch(/goal: Fly is not a goal/)
    expect(problems.join(' ')).toMatch(/settle needs a target of place/)
    // Back from the chronicler, the signal is handled again by custom.
    expect(engine.state.signals!.log.find((s) => s.id === signal.id)!.handled).toBe('rules')
    expect(engine.state.plans!.some((p) => p.signal === signal.id && p.plan === 'aftermath:betrothal')).toBe(true)
  }, 60_000)
})

describe('M8.3: friction in a village', () => {
  it('too many newcomers and too little food: a group forms against them, and the player can take a side or make peace', async () => {
    const engine = new Engine(content, { seed: 44, builder: true })
    runUntil(engine, 15, 9)
    // The dyke breaks: Veenhoek flees to the church at Waagdam, and flour and rye run short.
    await say(engine, '@plan dyke_breach')
    engine.tick(2 * DAY)
    const group = engine.state.groups?.find((g) => g.aim === 'against')
    expect(group).toBeDefined()
    expect(engine.state.news!.facts.some((f) => f.kind === 'group')).toBe(true)
    const member = group!.members[0]!
    expect(group!.area).toBe('waagdam')
    const refugee = newcomersOf(engine.world, group!)[0]!
    expect(engine.state.npcs[refugee]!.stayAt?.where).toBe('loc_waagdam_church')
    // Taking the side of the newcomers.
    engine.state.player.location = engine.state.npcs[member]!.location
    expect(await say(engine, `side with ${content.npcs.get(refugee)!.name.split(' ')[0]}`)).toMatch(/on their side/)
    // Making peace needs the trust of both.
    engine.state.relations = { ...(engine.state.relations ?? {}), [member]: { affinity: 30, trust: 30, fear: 0, familiarity: 50 }, [refugee]: { affinity: 30, trust: 30, fear: 0, familiarity: 50 } }
    expect(await say(engine, `mediate between ${content.npcs.get(member)!.name.split(' ')[0]} and ${content.npcs.get(refugee)!.name.split(' ')[0]}`)).toMatch(/Let them stay/)
    expect(group!.ended).toBeDefined()
  }, 60_000)
})

describe('M8.3: a warning that comes true', () => {
  it('who chased the stranger off is ashamed, and thinks better of him', async () => {
    const engine = homeStart(new Engine(content, { seed: 25, builder: true }))
    runUntil(engine, 15, 8)
    const world = engine.world
    const place = (id: string, where: string) => Object.assign(engine.state.npcs[id]!, { location: where, plan: [], busyUntil: world.now + 60 })
    place('npc_teunis', 'loc_oude_zijl_dyke')
    place('npc_sijbrand', 'loc_oude_zijl_dykehouse')
    await say(engine, '@plan dyke_leak')
    const leak = engine.state.news!.facts.find((f) => f.claim?.value === 'leaking')!
    for (const id of ['npc_teunis', 'npc_harmen', 'npc_klaas']) place(id, 'loc_molenend_mill')
    const { passOn } = await import('../src/engine/news')
    for (const id of ['npc_harmen', 'npc_klaas']) passOn(world, 'npc_teunis', id, leak.id)
    engine.tick(3 * DAY)
    expect(engine.state.flags!['dyke_broke']).toBe(true)
    const proven = engine.state.signals!.log.filter((s) => s.kind === 'warning_proven')
    expect(proven.some((s) => s.who[0] === 'npc_harmen' && s.who[1] === 'npc_teunis')).toBe(true)
    expect(engine.state.npcs['npc_harmen']!.thoughts!.some((t) => /for telling the truth/.test(t.text))).toBe(true)
    expect(engine.state.news!.facts.some((f) => f.kind === 'warning' && f.belang === 3)).toBe(true)
  }, 60_000)
})

describe('M8.3: a storyline builds up, and the pace weighs it', () => {
  /** News of belang 3 at a place, about someone: a storyline of its own. */
  const news = (engine: Engine, kind: string, who: string, place: string) => recordFact(engine.world, { kind, about: [who], place, belang: 3, title: `the ${kind}`, text: { precise: 'p', village: 'v', far: 'f' } })

  it('gets a phase and one beat from the chronicler, and never three climaxes in a week', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 45, llm: mock })
    runUntil(engine, 15, 9)
    news(engine, 'fire', 'npc_gerrit', 'loc_veenhoek_green')
    news(engine, 'omen', 'npc_harmen', 'loc_molenend_mill')
    news(engine, 'brawl', 'npc_geesje', 'loc_goose_common')
    mock.chronicle = (meta) => {
      const gerrit = meta.cards.find((c) => c.kind === 'person' && /Gerrit/.test(c.name))!.key
      const fire = meta.lines.find((l) => l.title === 'the fire')!.key
      const beat = (name: string) => ({ line: fire, signal: '', name, phases: [], steps: [{ after: 24, verb: 'thought', who: [gerrit], target: '', detail: 'You smell smoke again, at night.' }] })
      const ours = (title: string) => ['the fire', 'the omen', 'the brawl'].includes(title)
      return {
        lines: meta.lines.map((l) => ({ line: l.key, summary: [l.text], roles: [], hooks: ['What comes of it?'], next: 'Worse.', close: false, ...(ours(l.title) ? { phase: 'crisis' } : {}) })),
        plans: [beat('Smoke'), beat('More smoke')],
      }
    }
    runUntil(engine, 16, 4)
    engine.tick(1)
    const problems = (await engine.runChronicler()).flatMap((r) => r.problems)
    const lines = engine.state.chronicle!.lines.filter((l) => ['the fire', 'the omen', 'the brawl'].includes(l.title))
    expect(lines).toHaveLength(3)
    expect(lines.filter((l) => l.phase === 'crisis')).toHaveLength(2)
    expect(lines.filter((l) => l.phase === 'rising')).toHaveLength(1)
    expect(problems.join(' ')).toMatch(/two others came to a crisis this week, it stays rising/)
    // One beat for a line, and not a second in the next run while the first still waits.
    expect(engine.state.plans!.filter((p) => p.source === 'chronicler' && p.topic === 'beat')).toHaveLength(1)
    expect(problems.join(' ')).toMatch(/one beat per storyline/)
    const fire = lines.find((l) => l.title === 'the fire')!
    // More of the fire on the same line, so the next run has news (M10.27: a run with nothing new makes no call).
    fire.facts.push(news(engine, 'fire', 'npc_gerrit', 'loc_veenhoek_green')!.id)
    requestRun(engine.world, 'urgent', [fire.id])
    expect((await engine.runChronicler()).flatMap((r) => r.problems).join(' ')).toMatch(/the line has a beat still to come/)
    engine.tick(DAY + 60)
    expect(engine.state.npcs['npc_gerrit']!.thoughts!.some((t) => /smoke again/.test(t.text))).toBe(true)
  }, 60_000)

  it('starts no new small story in a village with two lines in crisis', async () => {
    const engine = new Engine(content, { seed: 46 })
    runUntil(engine, 15, 9)
    news(engine, 'fire', 'npc_gerrit', 'loc_veenhoek_green')
    news(engine, 'omen', 'npc_aaltje', 'loc_veenhoek_chapel')
    for (const line of engine.state.chronicle!.lines) line.phase = 'crisis'
    stories(engine.world).tempo = 'dramatic'
    const t0 = engine.world.now
    engine.tick(8 * DAY)
    const fresh = engine.state.news!.facts.filter((f) => f.t > t0 && f.pattern && content.patterns.get(f.pattern)?.kind !== 'feast')
    expect(fresh.length).toBeGreaterThan(2)
    expect(fresh.filter((f) => content.locations.get(f.place)?.area === 'veenhoek')).toEqual([])
  }, 60_000)
})

describe('M8.3: the opponents of the Holleveen as plans in the content', () => {
  /** What the opponents did by a day: the clocks, their flags and their news. */
  const snapshot = (engine: Engine) => {
    const f = engine.state.flags ?? {}
    const clock = (id: string) => (engine.state.clocks?.[id] as { filled: number } | undefined)?.filled ?? 0
    const keys = ['survey_quiet_days', 'stakes_pulled_today', 'gerrit_pulled', 'goat_riders_hired', 'peat_cutter_arrested', 'gerrit_arrested', 'widow_mist', 'polder_coming', 'fen_dying', 'haakman_revenge_done']
    return {
      survey: clock('survey'),
      revenge: clock('haakman_revenge'),
      flags: Object.fromEntries(keys.map((k) => [k, f[k] ?? null])),
      news: engine.state.news!.facts.filter((x) => ['survey', 'sabotage', 'hired', 'arrest'].includes(x.kind)).map((x) => x.title),
      cornelis: Boolean(engine.state.npcs['npc_cornelis']!.absent),
      breach: (engine.state.plans ?? []).some((p) => p.plan === 'dyke_breach'),
    }
  }

  /** Two games side by side: one with the plans, one without them and the old script run every hour. */
  async function sideBySide(seed: number, days: number, pumping: boolean, check: (planned: Engine, scripted: Engine, day: number) => void): Promise<Engine> {
    const { antagonists } = await import('./fixtures/scripted-antagonists')
    const { startPlan } = await import('../src/engine/quests/plans')
    const planned = new Engine(content, { seed })
    const scripted = new Engine({ ...content, world: { ...content.world, plans: [] } }, { seed })
    const host = { pass: () => [], plan: (id: string) => void startPlan(scripted.world, host, id, 'quest') }
    if (pumping) for (const engine of [planned, scripted]) engine.state.objects['loc_molenend_mill/de_zwaan']!['broken'] = false
    for (let day = 0; day < days; day++) {
      for (let hour = 0; hour < 24; hour++) {
        planned.tick(60)
        scripted.tick(60)
        antagonists(scripted.world, host)
      }
      check(planned, scripted, day)
    }
    return planned
  }

  it('measure, pull stakes, hire and arrest day by day as the scripted opponents did', async () => {
    const planned = await sideBySide(7, 21, false, (a, b, day) => expect(snapshot(a), `day ${day}`).toEqual(snapshot(b)))
    // They did something: the survey ran to its end, the stakes came out, a peat-cutter was locked up.
    const end = snapshot(planned)
    expect(end.flags['polder_coming']).toBe(true)
    expect(end.cornelis).toBe(true)
    expect(end.flags['gerrit_pulled']).toBeGreaterThan(1)
    expect(end.flags['peat_cutter_arrested']).toBeTruthy()
  }, 120_000)

  it('count the nights the mill pumps as the Haakman did, until the dyke breaks', async () => {
    const haakman = (e: Engine) => ({ revenge: snapshot(e).revenge, done: snapshot(e).flags['haakman_revenge_done'], breach: snapshot(e).breach })
    const planned = await sideBySide(8, 10, true, (a, b, day) => expect(haakman(a), `day ${day}`).toEqual(haakman(b)))
    expect(haakman(planned)).toEqual({ revenge: 4, done: true, breach: true })
  }, 120_000)

  it('are content only: the engine has no script for them', async () => {
    const source = await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/engine/quests/antagonists.ts', import.meta.url), 'utf8'))
    expect(source).not.toMatch(/npc_cornelis|npc_gerrit|clock|recordFact/)
    expect(content.world.plans).toEqual(['holleveen_survey', 'holleveen_stakes', 'the_haakman_counts'])
  })
})

describe('M8.3: one reference of the language, and the storylines in the playtest', () => {
  it('stands in CHRONICLER.md as the schemas make it, for the builder and not for every run', async () => {
    const { readFileSync } = await import('node:fs')
    const { languageReference, withReference, REFERENCE_START } = await import('../src/engine/quests/reference')
    const { buildInput } = await import('../src/engine/chronicler')
    const text = readFileSync(new URL('../content/CHRONICLER.md', import.meta.url), 'utf8')
    expect(withReference(text), 'run npm run reference').toBe(text)
    const reference = languageReference()
    expect(reference.conditions.filter((c) => !c.text).map((c) => c.name)).toEqual([])
    expect(reference.verbs.filter((v) => !v.text || !v.who).map((v) => v.name)).toEqual([])
    expect(reference.step.map((s) => s.name)).toContain('every')
    expect(reference.conditions.map((c) => c.name)).toEqual(expect.arrayContaining(['around', 'carries', 'knows', 'did']))
    expect(reference.verbs.find((v) => v.name === 'settle')!.who).toEqual({ rules: true, brain: false, chronicler: true })
    // The builder gets it all; a run of the chronicler has its own list of verbs.
    expect(content.chronicler).toContain(REFERENCE_START)
    const engine = new Engine(content, { seed: 47, llm: new MockLlm('good'), builder: true })
    await engine.handle('@kill harmen drowned in the Blackmere')
    expect(buildInput(engine.world, engine.state.chronicle!.pending[0]!).instruction).not.toContain(REFERENCE_START)
  })

  it('shows the storylines with their phase in the playtest', async () => {
    const { simulate } = await import('../src/engine/playtest')
    const report = simulate(content, 3, 5)
    expect(report.lines.length).toBeGreaterThan(0)
    expect(report.lines.every((l) => /(setup|rising|crisis|resolution|closed|no phase yet), (open|closed), \d+ facts?/.test(l))).toBe(true)
  }, 120_000)
})
