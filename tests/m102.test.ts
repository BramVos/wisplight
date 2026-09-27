import { describe, expect, it } from 'vitest'
import { Engine, recordFact } from '../src/engine'
import { agree, agreementLines } from '../src/engine/agreements'
import { relation } from '../src/engine/dialogue/relations'
import { answerLookup } from '../src/engine/lookups'
import { heardBy } from '../src/engine/news'
import { companionOf, fleeWith, mend } from '../src/engine/social/companions'
import { LAND_LAW } from '../src/engine/social/crime'
import { mayAttackFirst } from '../src/engine/social/gates'
import type { Agreement } from '../src/engine/state'
import { lineOf, lineStatus } from '../src/engine/storylines'
import { GameLog } from '../src/node/gamelog'
import { SaveStore } from '../src/node/savegame'
import { content } from './helpers'

// Milestone M10.2 (docs/ROADMAP.md): the register of stories and agreements.
// First the stories: a line closes only by an outcome, sleeps without change,
// and wakes with what it came from; the archive weighs where a line stands and
// can be read back.

const DAY = 24 * 60

/** A quarrel between Aaltje and the widow Kaatje, who hardly meet, with an open question. */
function quarrel(engine: Engine) {
  const world = engine.world
  // What it came from happened on its own: the herbs taken from the widow's garden.
  const cause = recordFact(world, { kind: 'herbs_taken', about: [], place: 'loc_kattenbroek_hut', belang: 1, title: 'the herbs Aaltje never paid for', text: { precise: 'Herbs went from the widow\'s garden and were never paid for.', village: 'Someone took the widow\'s herbs.', far: 'Herbs were taken.' } })
  const fact = recordFact(world, { kind: 'quarrel', about: ['npc_aaltje', 'npc_kaatje'], place: 'loc_aaltje_cottage', belang: 2, title: 'the quarrel between Aaltje and the widow', text: { precise: 'Aaltje and the widow Kaatje quarrelled over an old debt.', village: 'Aaltje and the widow are at odds.', far: 'Two old women quarrel.' }, cause: [cause.id] })
  const line = lineOf(world, fact.id)!
  line.hooks = ['Will Aaltje ever pay the widow?']
  return { line, cause, fact }
}

describe('M10.2: stories that sleep and wake', () => {
  it('goes dormant with an open question, and closes only when nothing is left open', () => {
    const engine = new Engine(content, { seed: 5 })
    const { line } = quarrel(engine)
    const quiet = recordFact(engine.world, { kind: 'omen', about: ['npc_everhard'], place: 'loc_schout_house', belang: 1, title: 'a crow on the schout\'s roof', text: { precise: 'p', village: 'v', far: 'f' } })
    const plain = lineOf(engine.world, quiet.id)!
    expect(lineStatus(line)).toBe('active')
    engine.world.state.npcs['npc_kaatje']!.absent = true
    engine.tick(16 * DAY)
    expect(lineStatus(line)).toBe('dormant')
    expect(line.open).toBe(false)
    expect(line.dormantSince).toBeDefined()
    // A line with nothing open closes; it does not sleep.
    expect(lineStatus(plain)).toBe('closed')
  }, 60_000)

  it('wakes after a hundred days by a return, with its cause, and no model runs for it meanwhile', async () => {
    const engine = new Engine(content, { seed: 5 })
    const { line, cause } = quarrel(engine)
    engine.world.state.npcs['npc_kaatje']!.absent = true
    engine.tick(100 * DAY)
    expect(lineStatus(line)).toBe('dormant')
    engine.world.state.npcs['npc_kaatje']!.absent = false
    const back = recordFact(engine.world, { kind: 'return', about: ['npc_kaatje'], place: 'loc_kattenbroek_hut', belang: 2, title: 'the widow back in the Kattenbroek', text: { precise: 'The widow Kaatje came back to her hut.', village: 'The widow is back.', far: 'Someone came home.' } })
    expect(lineStatus(line)).toBe('active')
    expect(line.facts).toContain(back.id)
    expect(line.resumed?.at(-1)?.by).toBe(back.id)
    expect(line.cause).toContain(cause.id)
    expect(line.hooks).toEqual(['Will Aaltje ever pay the widow?'])
  }, 120_000)

  it('archives only closed lines; a dormant one stays as its record, and its old facts are looked up in the archive', () => {
    const log = new GameLog(':memory:')
    const session = log.start('sleeping-quarrel')
    const engine = new Engine(content, { seed: 5 })
    engine.onLog((l) => log.write(session, l))
    engine.world.archive = { fact: (id) => log.archivedFact(session, id) }
    const { line, cause } = quarrel(engine)
    engine.world.state.npcs['npc_kaatje']!.absent = true
    // Nobody remembers the quarrel after a while: then its facts may go.
    engine.tick(20 * DAY)
    for (const heard of Object.values(engine.state.news!.heard)) {
      for (const id of [...line.facts, cause.id]) delete heard[id]
    }
    engine.tick(60 * DAY)
    expect(engine.state.chronicle!.lines).toContain(line)
    expect(lineStatus(line)).toBe('dormant')
    // What the line came from stays with it: the cause is protected.
    expect(engine.state.news!.facts.some((f) => f.id === cause.id)).toBe(true)
    // Its own old facts went to the archive, and the chronicler's lookup finds them there.
    const gone = line.facts.filter((id) => !engine.state.news!.facts.some((f) => f.id === id))
    expect(gone.length).toBeGreaterThan(0)
    expect(log.archivedFact(session, gone[0]!)).toBeDefined()
    const why = answerLookup(engine.world, 'chronicler', { fn: 'why', line: line.id })
    expect('text' in why && why.text).toMatch(/the herbs Aaltje never paid for/)
    expect(answerLookup(engine.world, 'chronicler', { fn: 'why', line: line.id })).toMatchObject({ text: expect.stringMatching(/Still open: Will Aaltje ever pay the widow\?/) })
  }, 120_000)
})

// Then the agreements: one register for what an offer, a conversation or the
// player's word set in motion, kept by the rules without a model.

const texts = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')
const open = (engine: Engine) => engine.state.agreements?.list ?? []
function made(result: ReturnType<typeof agree>): Agreement {
  if ('rejected' in result) throw new Error(result.rejected)
  return result
}
function stay(engine: Engine, npcId: string, location: string, minutes = 600): void {
  const s = engine.state.npcs[npcId]!
  s.location = location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + minutes
  s.plan = []
}
async function withWouter(engine: Engine, loyalty: number): Promise<void> {
  await engine.handle('create warden heathborn peat_cutter name=Joost')
  Object.assign(relation(engine.state, 'npc_wouter'), { affinity: 55, trust: 40, familiarity: 50 })
  stay(engine, 'npc_wouter', engine.state.player.location)
  expect(texts(await engine.handle('recruit wouter'))).toMatch(/Wouter travels with you now/)
  companionOf(engine.world, 'npc_wouter')!.loyalty = loyalty
}

describe('M10.2: the register of agreements', () => {
  it('holds an offer that went through, the player\'s word and an intention after a conversation, each with id, parties, what, when, terms and status', async () => {
    const engine = new Engine(content, { seed: 21 })
    await withWouter(engine, 50)
    const accompany = open(engine).find((a) => a.kind === 'accompany')!
    expect(accompany).toMatchObject({ id: expect.stringMatching(/^ag_\d+$/), by: 'npc_wouter', to: 'player', source: 'offer', status: 'open', known: true })
    expect(accompany.terms).toMatchObject({ wage: 40, limits: [], leaves: expect.arrayContaining(['two days unpaid', 'bad news from home']) })
    expect(companionOf(engine.world, 'npc_wouter')!.agreement).toBe(accompany.id)
    // The player's word: borrowing is a promise to pay back within the week.
    Object.assign(relation(engine.state, 'npc_mirte'), { affinity: 60, trust: 50, familiarity: 50 })
    stay(engine, 'npc_mirte', engine.state.player.location)
    await engine.handle('borrow 5 stuivers from mirte')
    const debt = open(engine).find((a) => a.kind === 'give')!
    expect(debt).toMatchObject({ by: 'player', to: 'npc_mirte', source: 'player', status: 'open', due: engine.world.now + 7 * DAY, terms: { amount: expect.any(Number), debt: expect.stringMatching(/^debt_/) } })
    // An intention after a conversation: checked by the brain's validator, a goal that carries it out, a day to do it.
    const intention = made(agree(engine.world, { kind: 'intention', by: 'npc_mirte', source: 'conversation', what: 'go and see how the green looks', terms: { goal: 'Visit', target: 'loc_veenhoek_green' } }))
    expect(intention.due).toBe(engine.world.now + DAY)
    expect(engine.state.npcs['npc_mirte']!.goals.some((g) => g.agreement === intention.id)).toBe(true)
    expect(agree(engine.world, { kind: 'intention', by: 'npc_mirte', source: 'conversation', what: 'fly', terms: { goal: 'Fly', target: 'loc_veenhoek_green' } })).toMatchObject({ rejected: expect.stringMatching(/not a goal the game knows/) })
    expect(texts(await engine.handle('promises'))).toMatch(/You promised Mirte: pay Mirte back/)
    expect(engine.page('promises')?.lines.join('\n')).toMatch(/Wouter agreed: travel with the stranger/)
  })

  it('records per kind what matters: a leader goes where they think the person is, and the truth is in the outcome', () => {
    const engine = new Engine(content, { seed: 22 })
    const world = engine.world
    world.state.player.location = 'loc_veenhoek_bakery'
    stay(engine, 'npc_mirte', 'loc_veenhoek_bakery', 0)
    // Aaltje is on the green, not at home; Mirte does not know that.
    stay(engine, 'npc_aaltje', 'loc_veenhoek_green', 8 * 60)
    const lead = made(agree(world, { kind: 'lead', by: 'npc_mirte', to: 'player', source: 'conversation', what: 'take the stranger to Aaltje\'s cottage', terms: { person: 'npc_aaltje', place: 'loc_aaltje_cottage', ifAbsent: 'return' } }))
    expect(lead.terms).toMatchObject({ person: 'npc_aaltje', place: 'loc_aaltje_cottage', thinks: 'loc_aaltje_cottage', waits: 60, ifAbsent: 'return' })
    expect(lead.belief).toMatch(/Mirte thinks Aaltje is at/)
    expect(lead.deceit).toBeUndefined()
    expect(lead.effects.map((e) => e.kind)).toEqual(['plan', 'journal'])
    for (let i = 0; i < 30 && lead.terms.arrived === undefined; i++) engine.tick(10)
    expect(lead.terms.arrived).toBeDefined()
    expect(engine.state.npcs['npc_mirte']!.location).toBe('loc_aaltje_cottage')
    world.state.player.location = 'loc_aaltje_cottage'
    engine.tick(10)
    // "I'll take you to her house" is kept, though she was not there: the promise was the way.
    expect(lead.status).toBe('kept')
    expect(lead.outcome?.text).toMatch(/Aaltje was not there/)
  }, 60_000)

  it('keeps truth and a lie apart: a bluff is recorded as deceit, and someone honest will not make it', () => {
    const engine = new Engine(content, { seed: 23 })
    const world = engine.world
    stay(engine, 'npc_lubbert', 'loc_waagdam_graanhandel')
    const lie = made(agree(world, { kind: 'lead', by: 'npc_lubbert', to: 'player', source: 'conversation', what: 'take the stranger to Mirte', terms: { person: 'npc_mirte', place: 'loc_waagdam_harbour' } }))
    expect(lie.deceit).toMatchObject({ said: expect.stringMatching(/Mirte would be at/), knew: expect.stringMatching(/Lubbert thinks Mirte is at/) })
    stay(engine, 'npc_aaltje', 'loc_aaltje_cottage')
    expect(agree(world, { kind: 'lead', by: 'npc_aaltje', to: 'player', source: 'conversation', what: 'take the stranger to Mirte', terms: { person: 'npc_mirte', place: 'loc_veenhoek_green' } })).toMatchObject({ rejected: expect.stringMatching(/would not lead you/) })
    expect(agree(world, { kind: 'give', by: 'npc_aaltje', to: 'player', source: 'conversation', what: 'give the stranger a loaf', bluff: 'I have bread to spare', terms: { item: 'rye_bread' } })).toMatchObject({ rejected: expect.stringMatching(/will not say/) })
  })

  it('a missed agreement is no betrayal: the outcome says what happened, and the other judges by what they know', () => {
    const run = (heard: boolean) => {
      const engine = new Engine(content, { seed: 24 })
      const world = engine.world
      const at = world.now + 6 * 60
      const meeting = made(agree(world, { kind: 'meet', by: 'npc_teunis', to: 'npc_sijbrand', source: 'conversation', what: 'meet Sijbrand at the dyke', known: true, terms: { place: 'loc_oude_zijl_dyke', at } }))
      // Teunis is hurt before the time, and it is news.
      const hurt = recordFact(world, { kind: 'injury', about: ['npc_teunis'], place: 'loc_oude_zijl_dyke', belang: 1, title: 'Teunis hurt', text: { precise: 'Teunis fell from the dyke and hurt his leg.', village: 'Teunis is laid up.', far: 'Someone fell.' } })
      world.state.npcs['npc_teunis']!.sickUntil = at + DAY
      if (heard) heardBy(world, 'npc_sijbrand')[hurt.id] = { level: 3, reliability: 1, from: 'witness', t: world.now }
      else delete heardBy(world, 'npc_sijbrand')[hurt.id]
      const trustBefore = engine.state.bonds?.['npc_sijbrand']?.['npc_teunis']?.trust ?? 0
      engine.tick(8 * 60)
      return { meeting, engine, trustBefore }
    }
    const knew = run(true)
    expect(knew.meeting.status).toBe('missed')
    expect(knew.meeting.outcome).toMatchObject({ fault: 'world', fact: expect.stringMatching(/^fact_/), text: expect.stringMatching(/Teunis did not come .*could not/) })
    expect(knew.meeting.judged).toBe('understood')
    expect(knew.engine.state.bonds?.['npc_sijbrand']?.['npc_teunis']?.trust ?? 0).toBe(knew.trustBefore)
    const didNot = run(false)
    expect(didNot.meeting.judged).toBe('let_down')
    expect(didNot.engine.state.bonds!['npc_sijbrand']!['npc_teunis']!.trust).toBeLessThan(didNot.trustBefore)
    expect(didNot.engine.state.npcs['npc_sijbrand']!.thoughts?.at(-1)?.text).toMatch(/Teunis did not keep their word/)
  }, 60_000)

  it('lets no promise lapse in silence: an intention after a conversation lapses after a day, with an outcome', () => {
    const engine = new Engine(content, { seed: 25 })
    const world = engine.world
    stay(engine, 'npc_mirte', 'loc_veenhoek_bakery', 3 * DAY)
    const intention = made(agree(world, { kind: 'intention', by: 'npc_mirte', source: 'conversation', what: 'go and see the dyke', terms: { goal: 'Visit', target: 'loc_veenhoek_green' } }))
    // Something keeps her at the bakery all day: the intention is not carried out.
    engine.state.npcs['npc_mirte']!.busyUntil = world.now + 3 * DAY
    engine.tick(DAY + 20)
    expect(intention.status).toBe('missed')
    expect(intention.outcome?.text).toMatch(/a day went by without it/)
    expect(engine.state.npcs['npc_mirte']!.goals.some((g) => g.agreement === intention.id)).toBe(false)
  }, 60_000)

  it('keeps an agreement for next week through saving, restarting and archiving, and carries it out once, without a model', async () => {
    const log = new GameLog(':memory:')
    const session = log.start('next-week')
    const engine = new Engine(content, { seed: 26 })
    engine.onLog((l) => log.write(session, l))
    const world = engine.world
    const noon = Math.floor(world.now / DAY) * DAY + 7 * DAY + 12 * 60
    // The player's word to Aaltje: next week at noon, at her cottage. One choice, three effects.
    const meeting = made(agree(world, { kind: 'meet', by: 'player', to: 'npc_aaltje', source: 'conversation', what: 'come to Aaltje\'s cottage at noon, a week from now', terms: { place: 'loc_aaltje_cottage', at: noon } }))
    expect(meeting.effects.map((e) => e.kind)).toEqual(['journal', 'expect'])
    const store = new SaveStore(':memory:')
    store.save('auto', engine.saved())
    const first = await Engine.restore(content, store.latest()!)
    expect(first.state.agreements).toEqual(engine.state.agreements)
    first.tick(4 * DAY)
    store.save('auto', first.saved())
    const second = await Engine.restore(content, store.latest()!)
    second.tick(noon - second.world.now - 3 * 60)
    const kept = second.state.agreements!.list.find((a) => a.id === meeting.id)!
    expect(kept.status).toBe('open')
    // Aaltje sets out in time; the stranger is there.
    second.state.player.location = 'loc_aaltje_cottage'
    second.tick(3 * 60 + 10)
    expect(kept.effects.map((e) => e.kind)).toEqual(expect.arrayContaining(['journal', 'expect']))
    expect(kept.status).toBe('kept')
    expect(second.state.agreements!.list.filter((a) => a.id === meeting.id)).toHaveLength(1)
    // A month after it closed, the archive takes it; before, it stays.
    second.tick(35 * DAY)
    expect(second.state.agreements!.list.some((a) => a.id === meeting.id)).toBe(false)
  }, 240_000)

  it('plays the player\'s word back from the log without doing it twice', async () => {
    const engine = new Engine(content, { seed: 27 })
    Object.assign(relation(engine.state, 'npc_mirte'), { affinity: 60, trust: 50, familiarity: 50 })
    stay(engine, 'npc_mirte', engine.state.player.location, 60)
    const store = new SaveStore(':memory:')
    store.save('auto', engine.saved())
    await engine.handle('borrow 5 stuivers from mirte')
    store.save('auto', engine.saved())
    const restored = await Engine.restore(content, store.latest()!)
    expect(restored.state.agreements).toEqual(engine.state.agreements)
    expect(restored.state.agreements!.list).toHaveLength(1)
    // Past the week: missed once, judged once, in both.
    engine.tick(8 * DAY)
    restored.tick(8 * DAY)
    const word = (e: Engine) => e.state.agreements!.list[0]!
    expect(word(engine)).toMatchObject({ status: 'missed', judged: 'let_down' })
    expect(word(restored)).toEqual(word(engine))
    expect(relation(restored.state, 'npc_mirte')).toEqual(relation(engine.state, 'npc_mirte'))
  }, 120_000)

  it('gives an interruption an end: a companion stops short of a place they named and comes back; one who runs from a fight may not', async () => {
    const engine = new Engine(content, { seed: 28 })
    await withWouter(engine, 50)
    const c = companionOf(engine.world, 'npc_wouter')!
    const agreement = open(engine).find((a) => a.id === c.agreement)!
    c.conditions.limits.push('loc_kattenbroek_edge')
    const before = engine.state.player.location
    engine.state.player.location = 'loc_kattenbroek_edge'
    const said = texts(engine.tick(1))
    expect(c.away).toMatchObject({ kind: 'wait', where: before, rejoin: true })
    expect(agreement.interruptions?.at(-1)).toMatchObject({ then: 'pause', back: true })
    expect(said).toMatch(/Wouter stays behind/)
    engine.state.player.location = before
    engine.tick(1)
    expect(c.away).toBeUndefined()
    expect(agreement.interruptions?.at(-1)?.resumed).toBeDefined()
    // Running from a fight: the faint-hearted run home and do not come back.
    c.loyalty = 25
    const out = fleeWith(engine.world, 'the causeway')
    expect(texts(out)).toMatch(/keeps running, all the way home/)
    expect(agreement.status).toBe('cancelled')
    expect(agreement.interruptions?.at(-1)).toMatchObject({ then: 'end', back: false })
  })

  it('sends a badly hurt companion home to mend, and back in two days', async () => {
    const engine = new Engine(content, { seed: 29 })
    await withWouter(engine, 45)
    const c = companionOf(engine.world, 'npc_wouter')!
    c.character.hp = 1
    expect(texts(mend(engine.world, 'npc_wouter'))).toMatch(/goes home to mend/)
    const agreement = open(engine).find((a) => a.id === c.agreement)!
    expect(agreement.interruptions?.at(-1)).toMatchObject({ then: 'pause', back: true })
    engine.tick(2 * DAY + 5)
    expect(c.away).toBeUndefined()
    expect(engine.state.npcs['npc_wouter']!.location).toBe(engine.state.player.location)
    expect(agreement.status).toBe('open')
  }, 60_000)

  it('sends an attack through the combat system, and never lets a conversation prescribe a death', async () => {
    const engine = new Engine(content, { seed: 30 })
    await engine.handle('create warden heathborn peat_cutter name=Joost')
    Object.assign(relation(engine.state, 'npc_gerrit'), { affinity: -80, trust: -20 })
    stay(engine, 'npc_gerrit', engine.state.player.location, 0)
    engine.state.npcs['npc_gerrit']!.grievance = { reason: 'the peat', t: engine.world.now, line: '"You and your chains."' }
    await engine.handle('look')
    const attack = open(engine).find((a) => a.kind === 'attack')!
    expect(attack).toMatchObject({ by: 'npc_gerrit', to: 'player', source: 'rules', terms: { target: 'player', reason: 'the peat', fought: expect.any(Number) } })
    expect(engine.state.combat).toBeDefined()
    for (let i = 0; i < 40 && engine.state.combat; i++) await engine.handle('strike')
    expect(attack.status).toBe('kept')
    expect(attack.outcome?.text).toMatch(/Gerrit went for the stranger/)
    // The combat system fights with the stranger; a death is never agreed.
    expect(agree(engine.world, { kind: 'attack', by: 'npc_gerrit', to: 'npc_mirte', source: 'conversation', what: 'go for Mirte', terms: { target: 'npc_mirte', reason: 'spite' } })).toMatchObject({ rejected: expect.stringMatching(/only knows fights with the stranger/) })
    expect(agree(engine.world, { kind: 'intention', by: 'npc_gerrit', source: 'conversation', what: 'kill the stranger tonight', terms: { goal: 'Visit', target: 'loc_veenhoek_green' } })).toMatchObject({ rejected: expect.stringMatching(/never prescribes a death/) })
  }, 60_000)

  it('lets the law\'s own gate stand: the schout who comes for a fine goes for the stranger through the register', async () => {
    const engine = new Engine(content, { seed: 32 })
    await engine.handle('create warden heathborn peat_cutter name=Joost')
    const world = engine.world
    ;(engine.state.wanted ??= {})[LAND_LAW] = { fine: 20, since: world.now }
    Object.assign(relation(engine.state, 'npc_everhard'), { affinity: -30, trust: -10 })
    // Only the order of his faction lets him go first, not the provocation alone.
    expect(mayAttackFirst(world, 'npc_everhard', { provoked: true })).toBe(false)
    expect(mayAttackFirst(world, 'npc_everhard', { provoked: true, factionOrder: true })).toBe(true)
    stay(engine, 'npc_everhard', engine.state.player.location, 0)
    engine.state.npcs['npc_everhard']!.grievance = { reason: 'the law', t: world.now, line: '"In the name of the Count."' }
    await engine.handle('look')
    expect(open(engine).find((a) => a.kind === 'attack')).toMatchObject({ by: 'npc_everhard', source: 'rules', terms: { reason: 'the law' } })
    expect(engine.state.combat).toBeDefined()
  })

  it('is frugal: a conversation gets the register\'s few lines, and nothing when there is nothing', () => {
    const engine = new Engine(content, { seed: 31 })
    const world = engine.world
    expect(agreementLines(world, 'npc_mirte')).toEqual([])
    made(agree(world, { kind: 'meet', by: 'player', to: 'npc_mirte', source: 'conversation', what: 'bring Mirte rye from Waagdam', terms: { place: 'loc_veenhoek_bakery', at: world.now + 2 * DAY } }))
    stay(engine, 'npc_mirte', 'loc_veenhoek_bakery')
    made(agree(world, { kind: 'intention', by: 'npc_mirte', source: 'conversation', what: 'go and see how the green looks', terms: { goal: 'Visit', target: 'loc_veenhoek_green' } }))
    const lines = agreementLines(world, 'npc_mirte')
    expect(lines).toEqual([expect.stringMatching(/^THE PLAYER'S WORD to you: bring Mirte rye from Waagdam, within 2 days\.$/), expect.stringMatching(/^YOU MEAN TO: go and see how the green looks, by tomorrow\.$/)])
    expect(lines.length).toBeLessThanOrEqual(4)
  })
})
