import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import type { LlmClient } from '../src/engine/dialogue/llm'
import { MockLlm } from '../src/engine/dialogue/mock'
import { accept, offersFor, parseWhen } from '../src/engine/dialogue/offers'
import { relation } from '../src/engine/dialogue/relations'
import { heardBy, recordFact } from '../src/engine/news'
import { openRequest } from '../src/engine/requests'
import { parseClaim, truthOf } from '../src/engine/claims'
import { tieTo } from '../src/engine/people'
import { ownerOf } from '../src/engine/social/ownership'
import { crime } from '../src/engine/social/crime'
import { letIn } from '../src/engine/social/access'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// Milestone M10.3 (docs/ROADMAP.md): living conversations. First the offers:
// what someone can do for the player now, decided by the game, chosen and
// worded by the voice, carried out by the engine through the register.

const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')
const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')
const DAY = 24 * 60

function stay(engine: Engine, npcId: string, location: string, minutes = 600): void {
  const s = engine.state.npcs[npcId]!
  s.location = location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + minutes
  s.plan = []
}

/** Pip on the wreck strand with the stranger, early in the morning. */
function withPip(llm?: LlmClient): Engine {
  const engine = new Engine(isle, { seed: 7, ...(llm ? { llm } : {}) })
  stay(engine, 'npc_pip', engine.state.player.location)
  return engine
}
const agreementsOf = (engine: Engine) => engine.state.agreements?.list ?? []

describe('M10.3: offers in a conversation', () => {
  it('asked about his father, Pip offers to take you where he thinks his father is, and walks ahead when you say yes', async () => {
    const engine = withPip()
    await engine.handle('talk pip')
    const asked = said(await engine.handle('where is your father?'))
    expect(asked).toMatch(/Pip offers to take you to Skerrow Hythe, the Harbour, to Brannoc\. YES to agree/)
    expect(engine.status().talk?.proposal).toMatch(/Pip offers to take you/)
    const yes = said(await engine.handle('yes'))
    expect(yes).toMatch(/Pip: "Come on, then! It's this way\."/)
    expect(yes).toMatch(/Pip goes on ahead, east, and waits for you there\./)
    expect(engine.state.talk).toBeUndefined()
    const lead = agreementsOf(engine).find((a) => a.kind === 'lead')!
    expect(lead).toMatchObject({ by: 'npc_pip', to: 'player', source: 'conversation', status: 'open', terms: { person: 'npc_brannoc', place: 'loc_skerrow_harbour', thinks: 'loc_skerrow_harbour', ahead: true } })
    // Follow him: he goes on ahead, place by place, to the harbour.
    expect(engine.state.npcs['npc_pip']!.location).toBe('loc_skerrow_tidepools')
    expect(said(await engine.handle('east'))).toMatch(/Pip goes on ahead, east/)
    stay(engine, 'npc_brannoc', 'loc_skerrow_harbour')
    expect(said(await engine.handle('east'))).toMatch(/Pip brought you to Skerrow Hythe, the Harbour, and Brannoc was there\./)
    expect(lead.status).toBe('kept')
  })

  it('at home in the afternoon, Pip offers both: to take you to his father, or to wait with you until he comes home', () => {
    const engine = new Engine(isle, { seed: 7 })
    const world = engine.world
    engine.tick((15 * 60 - (world.now % DAY) + DAY) % DAY)
    stay(engine, 'npc_pip', 'loc_skerrow_reed_cottage')
    world.state.player.location = 'loc_skerrow_reed_cottage'
    const offers = offersFor(world, 'npc_pip', ['npc_brannoc'], 'where is your father?')
    expect(offers.find((o) => o.key === 'lead:npc_brannoc')).toMatchObject({ decision: 'yes', place: 'loc_skerrow_harbour' })
    expect(offers.find((o) => o.key === 'wait:npc_brannoc')).toMatchObject({ decision: 'yes', what: expect.stringMatching(/until Brannoc comes home, at about 18:00/) })
  })

  it('calls which way when you go wrong, and gives up after a few turns', async () => {
    const engine = withPip()
    await engine.handle('talk pip')
    await engine.handle('where is your father?')
    await engine.handle('yes')
    expect(said(await engine.handle('look'))).toMatch(/Pip calls after you: "Not that way! East, this way!"/)
    await engine.handle('look')
    await engine.handle('look')
    expect(said(await engine.handle('look'))).toMatch(/Pip gave up waiting; you went another way\./)
    const lead = agreementsOf(engine).find((a) => a.kind === 'lead')!
    expect(lead).toMatchObject({ status: 'missed', outcome: { fault: 'to' } })
  })

  it('says no, with the reason, when the game decides no: a baker at work in the morning does not walk you anywhere', async () => {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    // Mid-morning on a working day, at the bakery.
    engine.tick((10 * 60 - (world.now % DAY) + DAY) % DAY)
    stay(engine, 'npc_mirte', 'loc_veenhoek_bakery')
    world.state.player.location = 'loc_veenhoek_bakery'
    const offers = offersFor(world, 'npc_mirte', ['loc_veenhoek_green'], 'can you take me to the green?')
    const lead = offers.find((o) => o.key === 'lead:loc_veenhoek_green')!
    expect(lead.decision).toBe('no')
    expect(lead.reasons.join(' ')).toMatch(/at work until/)
    await engine.handle('talk mirte')
    expect(said(await engine.handle('can you take me to the green?'))).toMatch(/Mirte shakes her head\. "I can't\. I am at work until/)
    expect(agreementsOf(engine)).toHaveLength(0)
  })

  it('lets the voice choose the offer and propose one, and keeps an offered promise out of its text when it was not offered', async () => {
    const good = new MockLlm('good')
    const engine = withPip(good)
    await engine.handle('talk pip')
    expect(said(await engine.handle('where is your father?'))).toMatch(/Pip offers to take you/)
    const prompt = good.calls.at(-1)!.prompt
    expect(prompt).toMatch(/OFFERS \(what you can do for the stranger now; the game decided each\):/)
    expect(prompt).toMatch(/lead:npc_brannoc: walk ahead to Skerrow Hythe, the Harbour, where you think Brannoc is\. DECISION: yes/)
    expect(prompt).toMatch(/WHERE THEY USUALLY ARE \(you know their day\): Brannoc is usually/)
    // Asked straight out: the voice picks the key, the engine carries it out.
    expect(said(await engine.handle('Can you take me to the harbour?'))).toMatch(/Pip agrees to take you to Skerrow Hythe, the Harbour/)
    const promise = new MockLlm('promise')
    const reports: string[] = []
    const other = withPip({ complete: (request) => promise.complete(request), report: (r) => reports.push(r.reason) })
    await other.handle('talk pip')
    const out = said(await other.handle('What do you know about the wyrm?'))
    expect(out).not.toMatch(/I'll take you there myself/)
    expect(reports).toContain('promise')
    expect(agreementsOf(other)).toHaveLength(0)
  })

  it('puts what the NPC names of its own accord and knows in the journal, heard from them', async () => {
    const engine = withPip(new MockLlm('good'))
    await engine.handle('talk pip')
    await engine.handle('What do you know about the wyrm?')
    expect(engine.state.player.journal?.['npc_tamsin']).toBeDefined()
    expect(engine.state.player.sources?.['npc_tamsin']?.some((s) => s.from === 'npc_pip')).toBe(true)
  })

  it('fetches someone: Pip runs to the harbour and comes back with his father', async () => {
    const engine = withPip()
    stay(engine, 'npc_brannoc', 'loc_skerrow_harbour', 60)
    await engine.handle('talk pip')
    const out = said(await engine.handle('Can you get your father here?'))
    expect(out).toMatch(/Pip: "Wait here\. I'll get Brannoc\."/)
    const fetch = agreementsOf(engine).find((a) => a.kind === 'lead')!
    expect(fetch.terms).toMatchObject({ person: 'npc_brannoc', place: 'loc_skerrow_harbour', bring: 'loc_skerrow_wreck_strand' })
    for (let i = 0; i < 24 && fetch.status === 'open'; i++) engine.tick(10)
    expect(fetch.status).toBe('kept')
    expect(engine.state.npcs['npc_brannoc']!.location).toBe('loc_skerrow_wreck_strand')
  }, 60_000)

  it('meets at a time with a note in the journal, waits, gives from their own pocket, and carries word, each an agreement', async () => {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    Object.assign(relation(engine.state, 'npc_mirte'), { affinity: 60, trust: 40, familiarity: 50 })
    stay(engine, 'npc_mirte', world.state.player.location)
    await engine.handle('talk mirte')
    expect(said(await engine.handle('Will you meet me at the green tomorrow at noon?'))).toMatch(/Mirte agrees to meet you at Veenhoek, the Green, tomorrow at 12:00\. Noted in your journal/)
    const meet = agreementsOf(engine).find((a) => a.kind === 'meet')!
    expect(meet).toMatchObject({ by: 'npc_mirte', to: 'player', terms: { place: 'loc_veenhoek_green' } })
    expect(engine.page('promises')?.lines.join('\n')).toMatch(/Mirte agreed: meet you at Veenhoek, the Green, tomorrow at 12:00/)
    expect(said(await engine.handle('Would you wait here with me?'))).toMatch(/Mirte agrees to wait with you/)
    world.npcState('npc_mirte').inventory['rye_bread'] = 3
    expect(said(await engine.handle('Could you give me some rye bread?'))).toMatch(/Mirte gives you a loaf of rye bread|Mirte gives you/)
    expect(world.state.player.inventory['rye_bread']).toBe(1)
    // Word to carry: something she heard, to someone she knows.
    const fact = recordFact(world, { kind: 'omen', about: ['npc_everhard'], place: 'loc_schout_house', belang: 1, title: 'a crow on the schout\'s roof', text: { precise: 'A crow sat on the schout\'s roof all day.', village: 'A crow on the schout\'s roof.', far: 'A crow.' } })
    heardBy(world, 'npc_mirte')[fact.id] = { level: 3, reliability: 1, from: 'witness', t: world.now }
    const message = offersFor(world, 'npc_mirte', ['npc_aaltje', 'npc_everhard'], 'tell aaltje about the schout').find((o) => o.kind === 'message')!
    expect(message.decision).toBe('yes')
    accept(world, 'npc_mirte', message)
    const word = agreementsOf(engine).find((a) => a.kind === 'message')!
    expect(word).toMatchObject({ by: 'npc_mirte', to: 'player', terms: { recipient: 'npc_aaltje', facts: [fact.id] } })
    expect(world.npcState('npc_mirte').goals.some((g) => g.type === 'Talk' && g.agreement === word.id)).toBe(true)
  })

  it('lends a thing that stays the lender\'s: Wouter lacks a saw, you borrow Harmen\'s, and Harmen expects it back', async () => {
    const run = async (bringBack: boolean) => {
      const engine = new Engine(content, { seed: 7 })
      const world = engine.world
      openRequest(world, { npc: 'npc_wouter', kind: 'fetch', item: 'saw', source: 'motor' })
      Object.assign(relation(engine.state, 'npc_harmen'), { affinity: 30, trust: 20, familiarity: 40 })
      stay(engine, 'npc_harmen', world.state.player.location)
      await engine.handle('talk harmen')
      // Give, lend or sell: each its own decision. The mill's only saw he will lend, for a day; not give.
      const offers = offersFor(world, 'npc_harmen', ['item_saw'], 'could I borrow your saw?')
      expect(offers.map((o) => `${o.kind}:${o.decision}`)).toEqual(['give:no', 'lend:yes', 'sell:no'])
      expect(offers[0]!.reasons).toEqual(['you need it yourself'])
      const out = said(await engine.handle('Could I borrow your saw?'))
      expect(out).toMatch(/Harmen lends you a saw\. Bring it back tomorrow at/)
      const loan = (engine.state.agreements?.list ?? []).find((a) => a.kind === 'lend')!
      expect(loan).toMatchObject({ by: 'player', to: 'npc_harmen', status: 'open', terms: { item: 'saw' }, due: world.now + DAY })
      expect(engine.state.player.inventory['saw']).toBe(1)
      await engine.handle('bye')
      // To Wouter, who needed one; Harmen still expects his saw back.
      stay(engine, 'npc_wouter', world.state.player.location)
      await engine.handle('give saw to wouter')
      expect(world.state.requests.find((r) => r.npc === 'npc_wouter')?.status).toBe('done')
      expect(loan.status).toBe('open')
      const before = relation(engine.state, 'npc_harmen').trust
      if (bringBack) {
        world.npcState('npc_wouter').inventory['saw'] = 0
        world.state.player.inventory['saw'] = 1
        stay(engine, 'npc_harmen', world.state.player.location)
        expect(said(await engine.handle('give saw to harmen'))).toMatch(/Good as your word/)
      } else engine.tick(DAY + 20)
      return { loan, trust: relation(engine.state, 'npc_harmen').trust - before }
    }
    const kept = await run(true)
    expect(kept.loan.status).toBe('kept')
    expect(kept.trust).toBeGreaterThan(0)
    const broken = await run(false)
    expect(broken.loan).toMatchObject({ status: 'missed', judged: 'let_down' })
    expect(broken.trust).toBeLessThan(0)
  }, 60_000)

  it('reads a time from the player\'s words for a meeting', () => {
    const noon = 12 * 60
    const day = 100 * DAY
    expect(parseWhen('meet me tomorrow at noon', day + 8 * 60)).toBe(day + DAY + noon)
    expect(parseWhen('at six', day + 8 * 60)).toBe(day + 18 * 60)
    expect(parseWhen('in two hours', day + 8 * 60)).toBe(day + 10 * 60)
    expect(parseWhen('see you tonight', day + 8 * 60)).toBe(day + 19 * 60)
    expect(parseWhen('hello there', day)).toBeUndefined()
  })
})

describe('M10.3: what the player says is a claim', () => {
  /** Mirte at her bakery, who trusts the stranger this much. */
  function withMirte(trust: number): Engine {
    const engine = new Engine(content, { seed: 7 })
    Object.assign(relation(engine.state, 'npc_mirte'), { affinity: 30, trust, familiarity: 40 })
    stay(engine, 'npc_mirte', 'loc_veenhoek_bakery', 0)
    engine.state.player.location = 'loc_veenhoek_bakery'
    return engine
  }

  it('tell Mirte the mill turns again when it does not: she believes the stranger, walks to Molenend for nothing, and knows what that word was worth', async () => {
    const engine = withMirte(60)
    const world = engine.world
    const out = said(await engine.handle('tell mirte that the mill turns again'))
    expect(out).toMatch(/Mirte looks up sharply/)
    const fact = world.state.news!.facts.find((f) => f.kind === 'said')!
    expect(fact).toMatchObject({ by: 'player', truth: false, claim: { subject: 'loc_molenend_mill', key: 'working', value: 'yes' } })
    expect(world.state.news!.heard['npc_mirte']![fact.id]).toMatchObject({ from: 'player' })
    expect(world.state.news!.heard['npc_mirte']![fact.id]!.stance).toBeUndefined()
    // Her oven takes the mill's flour: she goes to see about it, once the talk is done.
    await engine.handle('bye')
    const before = relation(engine.state, 'npc_mirte').trust
    for (let i = 0; i < 12 && !world.state.news!.heard['npc_mirte']![fact.id]!.checked; i++) engine.tick(60)
    expect(world.state.npcs['npc_mirte']!.location).toBe('loc_molenend_mill')
    expect(world.state.news!.heard['npc_mirte']![fact.id]).toMatchObject({ checked: true, stance: 'rejects' })
    expect(relation(engine.state, 'npc_mirte').trust).toBeLessThan(before)
    expect(world.state.npcs['npc_mirte']!.memory?.some((m) => /The stranger told me The Mill De Zwaan is working again\. It was not so\./.test(m.note))).toBe(true)
  }, 60_000)

  it('does not believe a stranger it does not trust', async () => {
    const engine = withMirte(-20)
    const out = said(await engine.handle('tell mirte that the mill turns again'))
    expect(out).toMatch(/Mirte (snorts|gives you a long look)/)
    expect(engine.state.npcs['npc_mirte']!.goals.some((g) => g.target === 'loc_molenend_mill')).toBe(false)
  })

  it('DECEIVE is lying for real: found out, trust falls further, and the lie goes round', async () => {
    const engine = withMirte(60)
    const world = engine.world
    await engine.handle('talk mirte')
    await engine.handle('deceive mirte that the mill turns again')
    const fact = world.state.news!.facts.find((f) => f.kind === 'said')!
    expect(fact).toMatchObject({ lie: true, truth: false })
    const trust = relation(engine.state, 'npc_mirte').trust
    // She sees for herself.
    world.state.npcs['npc_mirte']!.location = 'loc_molenend_mill'
    engine.tick(60)
    expect(relation(engine.state, 'npc_mirte').trust).toBeLessThanOrEqual(trust - 15)
    const caught = world.state.news!.facts.find((f) => f.kind === 'caught_lie')!
    expect(caught.title).toBe("the stranger's lie to Mirte")
    expect(world.state.news!.heard['npc_mirte']![caught.id]).toBeDefined()
  }, 60_000)

  it('makes a fact of a few claims a talk, no more', async () => {
    const engine = withMirte(60)
    await engine.handle('talk mirte')
    for (const words of ['The mill turns again.', 'The green is flooded.', 'Harmen is dead.', 'The green is damaged.', 'Harmen is at the Goose.']) await engine.handle(words)
    expect(engine.state.news!.facts.filter((f) => f.kind === 'said')).toHaveLength(3)
  })

  it('reads claims only in the world\'s words', () => {
    const world = new Engine(content, { seed: 7 }).world
    expect(parseClaim(world, ['loc_molenend_mill'], 'the mill turns again')).toEqual({ subject: 'loc_molenend_mill', key: 'working', value: 'yes' })
    expect(parseClaim(world, ['npc_harmen'], 'Harmen is dead')).toEqual({ subject: 'npc_harmen', key: 'alive', value: 'no' })
    expect(parseClaim(world, ['npc_harmen', 'loc_goose_common'], 'Harmen is at the Goose')).toEqual({ subject: 'npc_harmen', key: 'at', value: 'loc_goose_common' })
    expect(parseClaim(world, ['loc_veenhoek_green'], 'the green is flooded')).toEqual({ subject: 'loc_veenhoek_green', key: 'state', value: 'flooded' })
    expect(parseClaim(world, ['loc_molenend_mill'], 'does the mill turn again?')).toBeUndefined()
    expect(parseClaim(world, [], 'the moon is made of cheese')).toBeUndefined()
    expect(truthOf(world, 'loc_molenend_mill', 'working')).toBe('no')
  })
})

describe('M10.3: time facts, and learning from a craftsman', () => {
  it('gives the voice the NPC\'s own day and the day of the people the talk is about', async () => {
    const good = new MockLlm('good')
    const engine = withPip(good)
    await engine.handle('talk pip')
    await engine.handle('What do you know about your father?')
    const prompt = good.calls.at(-1)!.prompt
    expect(prompt).toMatch(/WHERE THEY USUALLY ARE \(you know their day\): Brannoc is usually/)
  })

  it('a baker teaches baking for money, or for a favour when the stranger is short', async () => {
    const run = async (money: number) => {
      const engine = new Engine(content, { seed: 7 })
      const world = engine.world
      await engine.handle('create warden heathborn peat_cutter name=Joost')
      Object.assign(relation(engine.state, 'npc_mirte'), { affinity: 30, trust: 30, familiarity: 40 })
      stay(engine, 'npc_mirte', world.state.player.location)
      world.state.player.money = money
      openRequest(world, { npc: 'npc_mirte', kind: 'fetch', item: 'saw', source: 'motor' })
      await engine.handle('talk mirte')
      await engine.handle('no')
      const out = said(await engine.handle('Could you teach me to bake?'))
      return { engine, out }
    }
    // Since M10.5 a baker teaches the craft of baking: a lesson of a few hours, and the stranger is her pupil.
    const paid = await run(200)
    expect(paid.out).toMatch(/Mirte: "Watch my hands, then\. Like this\."/)
    expect(paid.out).toMatch(/Baking: practice 4\. You are Mirte's pupil now/)
    expect(paid.engine.state.player.money).toBe(200 - 16)
    const favour = await run(0)
    expect(favour.out).toMatch(/Baking: practice 4/)
    expect(favour.out).toMatch(/You give Mirte your word: bring a saw/)
    expect(favour.engine.state.player.money).toBe(0)
  })
})

describe('M10.3: reactions after a turn', () => {
  it('an insult to a trader shuts the trade for the day, and it is a deed and gossip', async () => {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    stay(engine, 'npc_mirte', 'loc_veenhoek_bakery')
    world.state.player.location = 'loc_veenhoek_bakery'
    await engine.handle('talk mirte')
    const before = relation(engine.state, 'npc_mirte').affinity
    const out = said(await engine.handle('Your bread is like stone, you fool.'))
    expect(out).toMatch(/Mirte folds her arms\. "I'll not serve you today\. Not after that\."/)
    expect(engine.state.talk).toBeUndefined()
    expect(relation(engine.state, 'npc_mirte').affinity).toBeLessThan(before)
    expect(world.state.news!.facts.some((f) => f.kind === 'insulted' && f.about.includes('npc_mirte'))).toBe(true)
    expect(said(await engine.handle('buy bread'))).toMatch(/Mirte won't serve you today, not after what you said\./)
    // The next day it has passed; the mood with it.
    engine.tick(DAY)
    expect(world.state.npcs['npc_mirte']!.mood?.until ?? 0).toBeLessThanOrEqual(world.now)
  })

  it('someone without a trade walks off, really; someone hot-tempered and cold to the stranger goes for them', async () => {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    stay(engine, 'npc_jan_visser', 'loc_veenhoek_green')
    world.state.player.location = 'loc_veenhoek_green'
    await engine.handle('talk jan')
    expect(said(await engine.handle('Shut up, you fool.'))).toMatch(/Jan turns on his heel and walks off\./)
    expect(world.state.npcs['npc_jan_visser']!.location).not.toBe('loc_veenhoek_green')
    const other = new Engine(content, { seed: 7 })
    await other.handle('create warden heathborn peat_cutter name=Joost')
    Object.assign(relation(other.state, 'npc_gerrit'), { affinity: -80, trust: -20 })
    stay(other, 'npc_gerrit', other.state.player.location, 0)
    await other.handle('talk gerrit')
    await other.handle('You are a coward and a fool.')
    expect((other.state.agreements?.list ?? []).find((a) => a.kind === 'attack')).toMatchObject({ by: 'npc_gerrit', terms: { reason: 'the insult' } })
    expect(other.state.combat).toBeDefined()
  })

  it('a timid one who is threatened shouts for help, and the neighbours hear it', async () => {
    const engine = new Engine(isle, { seed: 7 })
    const world = engine.world
    stay(engine, 'npc_garrick', world.state.player.location)
    await engine.handle('talk garrick')
    expect(said(await engine.handle("Give me your oil or you'll regret it."))).toMatch(/Garrick backs away and shouts\. "Help! Somebody, help!"/)
    expect(world.state.news!.facts.find((f) => f.kind === 'threatened')?.text.precise).toMatch(/Garrick shouted for help/)
    expect(engine.state.talk).toBeUndefined()
  })
})

describe('M10.3: friends, and flirting in free talk', () => {
  it('someone Warm for three days who shared something becomes a friend: a tie, news, a warmer greeting', async () => {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    Object.assign(relation(engine.state, 'npc_mirte'), { affinity: 80, trust: 60, familiarity: 60 })
    ;(world.state.flags ??= {})['secret:npc_mirte:x'] = true
    engine.tick(4 * DAY)
    expect(tieTo(world, 'npc_mirte', 'player')?.role).toBe('friend')
    stay(engine, 'npc_mirte', world.state.player.location)
    expect(said(await engine.handle('talk mirte'))).toMatch(/Mirte lights up\. "There you are, friend\."/)
    // Someone who is merely friendly does not become one.
    const other = new Engine(content, { seed: 7 })
    Object.assign(relation(other.state, 'npc_mirte'), { affinity: 20, trust: 20, familiarity: 60 })
    other.tick(4 * DAY)
    expect(tieTo(other.world, 'npc_mirte', 'player')?.role).not.toBe('friend')
  }, 60_000)

  it('flirting in free talk goes by the FLIRT formula, and never with a child', async () => {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    stay(engine, 'npc_mirte', world.state.player.location)
    await engine.handle('talk mirte')
    expect(said(await engine.handle('You have lovely eyes.'))).toMatch(/Mirte (laughs, a little awkwardly\. "You hardly know me\."|gives you a look that is kind and closed)/)
    expect(world.state.romance?.['npc_mirte']).toBeUndefined()
    const pip = withPip()
    await pip.handle('talk pip')
    expect(said(await pip.handle('You have lovely eyes.'))).toMatch(/Pip frowns, puzzled, and talks of something else\./)
    expect(pip.state.romance?.['npc_pip']).toBeUndefined()
  })
})

describe('M10.3: people who go and find the stranger', () => {
  it('someone who needs a thing and likes the stranger comes to ask; someone who does not, waits to be asked', async () => {
    const run = async (affinity: number, trust: number) => {
      const engine = new Engine(content, { seed: 7 })
      const world = engine.world
      Object.assign(relation(engine.state, 'npc_mirte'), { affinity, trust, familiarity: 40 })
      world.state.player.location = 'loc_veenhoek_green'
      openRequest(world, { npc: 'npc_mirte', kind: 'fetch', item: 'saw', source: 'motor' })
      let out = ''
      for (let hour = 0; hour < 12 && !/Mirte comes up to you/.test(out); hour++) out = said(engine.tick(60))
      return out
    }
    const liked = await run(40, 30)
    expect(liked).toMatch(/Mirte: "There you are\. There's something I'd ask of you\."/)
    expect(liked).toMatch(/Mirte asks you to bring a saw\. YES to give your word/)
    expect(await run(-10, 0)).not.toMatch(/Mirte comes up to you/)
  }, 60_000)
})

describe('M10.3: what an NPC lacks, asked of the stranger', () => {
  it('asks you to look in on someone: your word, kept when you go', async () => {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    openRequest(world, { npc: 'npc_mirte', kind: 'visit', target: 'npc_aaltje', name: 'A visit to Aaltje', ask: 'Would you look in on Aaltje for me? She has not been well.', source: 'motor' })
    stay(engine, 'npc_mirte', world.state.player.location)
    const out = said(await engine.handle('talk mirte'))
    expect(out).toMatch(/Mirte asks you to look in on Aaltje\. YES to give your word/)
    expect(said(await engine.handle('yes'))).toMatch(/You give Mirte your word: look in on Aaltje, in 3 days/)
    const errand = (engine.state.agreements?.list ?? []).find((a) => a.kind === 'errand')!
    expect(errand).toMatchObject({ by: 'player', to: 'npc_mirte', status: 'open' })
    await engine.handle('bye')
    stay(engine, 'npc_aaltje', world.state.player.location)
    await engine.handle('talk aaltje')
    expect(errand.status).toBe('kept')
  })
})

describe('M10.3: the scene in one piece', () => {
  it('asked about his father, Pip leads you, tells at home, Brannoc finds you in the morning, you promise rope, and not bringing it, the Hythe knows', async () => {
    const engine = withPip()
    const world = engine.world
    openRequest(world, { npc: 'npc_brannoc', kind: 'fetch', item: 'rope', source: 'motor' })
    await engine.handle('talk pip')
    await engine.handle('where is your father?')
    const asked = world.state.news!.facts.find((f) => f.kind === 'asked_about')!
    expect(asked).toMatchObject({ belang: 2, title: 'the stranger asking Pip about his father', claim: { subject: 'npc_brannoc', key: 'asked_about', value: 'player' } })
    await engine.handle('yes')
    // After the talk, Pip means to tell his father: a report to carry, in the register.
    const word = (engine.state.agreements?.list ?? []).find((a) => a.kind === 'message' && a.by === 'npc_pip')!
    expect(word).toMatchObject({ terms: { recipient: 'npc_brannoc', facts: [asked.id] } })
    await engine.handle('east')
    await engine.handle('east')
    // The stranger waits at the inn; the day goes by.
    world.state.player.location = 'loc_skerrow_salt_kettle'
    let met = ''
    for (let hour = 0; hour < 36 && !met; hour++) {
      const out = said(engine.tick(60))
      if (/Brannoc comes up to you/.test(out)) met = out
    }
    expect(word.status).toBe('kept')
    expect(world.state.news!.heard['npc_brannoc']![asked.id]).toBeDefined()
    expect(met).toMatch(/Brannoc: "You were asking after me\. What do you want\?"/)
    expect(met).toMatch(/Brannoc asks you to bring a coil of rope|Brannoc asks you to bring/)
    expect(said(await engine.handle('yes'))).toMatch(/You give Brannoc your word: bring/)
    const promise = (engine.state.agreements?.list ?? []).find((a) => a.kind === 'give' && a.by === 'player' && a.to === 'npc_brannoc')!
    expect(promise.status).toBe('open')
    await engine.handle('bye')
    // Three days and no rope: the word is broken, and the Hythe hears of it.
    engine.tick(4 * DAY)
    expect(promise).toMatchObject({ status: 'missed', judged: 'let_down' })
    const broken = world.state.news!.facts.find((f) => f.kind === 'broken_promise')!
    expect(broken.title).toBe("the stranger's broken word to Brannoc")
    const hythe = ['npc_maren', 'npc_pip', 'npc_garrick', 'npc_elowen'].filter((id) => world.state.news!.heard[id]?.[broken.id])
    expect(hythe.length).toBeGreaterThanOrEqual(2)
  }, 120_000)
})

describe('M10.3: ownership', () => {
  /** In the miller's house, with a sack of rye lying there, and Harmen at home or not. */
  function inHarmensHouse(home: boolean): Engine {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    world.state.player.location = 'loc_molenend_house'
    ;(world.state.ground['loc_molenend_house'] ??= {})['rye_grain'] = 2
    if (home) stay(engine, 'npc_harmen', 'loc_molenend_house')
    else stay(engine, 'npc_harmen', 'loc_molenend_mill')
    for (const id of Object.keys(world.state.npcs)) if (id !== 'npc_harmen' && world.state.npcs[id]!.location === 'loc_molenend_house') world.state.npcs[id]!.location = 'loc_molenend_mill'
    return engine
  }

  it('asks one question of what belongs to whom: in someone\'s home, TAKE is not for the taking', async () => {
    const home = inHarmensHouse(true)
    expect(ownerOf(home.world, 'loc_molenend_house')).toMatchObject({ kind: 'household', id: 'npc_harmen' })
    expect(ownerOf(home.world, 'loc_veenhoek_green')).toMatchObject({ kind: 'nobody' })
    expect(said(await home.handle('take rye'))).toMatch(/That is Harmen's\. Ask him for it \(ASK HARMEN FOR SACK OF RYE\), or STEAL it\./)
    expect(home.state.player.inventory['rye_grain']).toBeUndefined()
    const away = inHarmensHouse(false)
    expect(said(await away.handle('take all'))).toMatch(/belongs to Harmen's household\. STEAL it/)
    // Stealing it is theft, as it always was; the owner function names the victim.
    await away.handle('steal rye')
    expect(away.state.crimes?.at(-1)).toMatchObject({ kind: 'theft', victim: 'npc_harmen', item: 'rye_grain' })
  })

  it('asking goes through the offers: given, or for a favour in return', async () => {
    const engine = inHarmensHouse(true)
    const world = engine.world
    Object.assign(relation(engine.state, 'npc_harmen'), { affinity: 20, trust: 20, familiarity: 40 })
    await engine.handle('talk harmen')
    await engine.handle('no')
    // A loaf is little enough to give; the rye is worth more, so he would lend or sell it instead.
    world.state.ground['loc_molenend_house']!['rye_bread'] = 1
    expect(said(await engine.handle('ask for the bread'))).toMatch(/Harmen gives you a loaf of rye bread\./)
    expect(world.state.player.inventory['rye_bread']).toBe(1)
    expect(world.state.ground['loc_molenend_house']!['rye_bread']).toBe(0)
    expect(offersFor(world, 'npc_harmen', ['item_rye_grain'], 'could I have the rye?').map((o) => `${o.kind}:${o.decision}`)).toEqual(['give:no', 'lend:yes', 'sell:yes'])
    // Worth more than he would give, and he needs sailcloth: for a favour.
    world.npcState('npc_harmen').inventory['wool'] = 1
    openRequest(world, { npc: 'npc_harmen', kind: 'fetch', item: 'sailcloth', source: 'motor' })
    const offers = offersFor(world, 'npc_harmen', ['item_wool'], 'could I have the wool?')
    expect(offers.find((o) => o.key === 'trade:wool')).toMatchObject({ decision: 'yes', reasons: [expect.stringMatching(/bring you a bolt of sailcloth in return/)] })
  })
})

describe('M10.3: caught, suspected, proven, and made right', () => {
  it('caught in the act: a timid one shouts and everyone near is a witness; a hot one grabs your wrist; the law, if there, steps in', async () => {
    const caught = async (setup: (e: Engine) => void) => {
      const engine = new Engine(content, { seed: 7 })
      await engine.handle('create rascal heathborn peat_cutter name=Joost')
      stay(engine, 'npc_mirte', 'loc_veenhoek_bakery')
      engine.state.player.location = 'loc_veenhoek_bakery'
      setup(engine)
      const texts = { title: 'the stranger stole from Mirte', precise: 'The stranger stole a loaf from Mirte.', village: 'The stranger stole from Mirte.', far: 'A theft.' }
      const out = said(crime(engine.world, { kind: 'theft', place: 'loc_veenhoek_bakery', victim: 'npc_mirte', item: 'rye_bread', value: 2, grave: false, witnesses: ['npc_mirte'] }, texts))
      return { engine, out, theft: engine.state.crimes!.at(-1)! }
    }
    const timid = await caught((e) => {
      stay(e, 'npc_jan_visser', 'loc_veenhoek_bakery')
      Object.assign(e.world.npc('npc_mirte').personality, { courage: -1 })
    })
    expect(timid.out).toMatch(/Mirte shouts "Thief! Thief!"/)
    expect(timid.theft.witnesses).toContain('npc_jan_visser')
    const hot = await caught((e) => {
      Object.assign(relation(e.state, 'npc_mirte'), { affinity: -80, trust: -20 })
      Object.assign(e.world.npc('npc_mirte').personality, { courage: 1 })
    })
    expect(hot.out).toMatch(/Mirte grabs your wrist and does not let go\./)
    expect((hot.engine.state.agreements?.list ?? []).some((a) => a.kind === 'attack' && a.by === 'npc_mirte')).toBe(true)
    const law = await caught((e) => stay(e, 'npc_everhard', 'loc_veenhoek_bakery'))
    expect(law.out).toMatch(/Everhard steps in between you and Mirte\./)
    expect(law.engine.state.wanted?.count?.fine).toBeGreaterThan(0)
    expect(law.engine.state.npcs['npc_everhard']!.grievance?.reason).toBe('the law')
  })

  it('stolen unseen, the owner knows only that it is gone; seeing it on you is proof, with a fine and a name', async () => {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    await engine.handle('create rascal heathborn peat_cutter name=Joost')
    world.state.player.location = 'loc_molenend_house'
    ;(world.state.ground['loc_molenend_house'] ??= {})['wool'] = 1
    stay(engine, 'npc_harmen', 'loc_molenend_mill')
    for (const id of Object.keys(world.state.npcs)) if (id !== 'npc_harmen' && world.state.npcs[id]!.location === 'loc_molenend_house') world.state.npcs[id]!.location = 'loc_molenend_mill'
    await engine.handle('steal wool')
    const theft = world.state.crimes!.at(-1)!
    expect(theft).toMatchObject({ unseen: true, victim: 'npc_harmen' })
    expect(world.state.wanted?.count?.fine ?? 0).toBe(0)
    // In the pack, nobody sees it; worn openly, Harmen knows his own fleece.
    stay(engine, 'npc_harmen', 'loc_molenend_house')
    expect(said(await engine.handle('look'))).not.toMatch(/That's my/)
    engine.state.player.character!.gear.armour = 'wool'
    const out = said(await engine.handle('look'))
    expect(out).toMatch(/Harmen stares at what you carry\. "That's my fleece!"/)
    expect(theft.proven).toBe(true)
    expect(world.state.news!.facts.at(-1)?.title).toBe("the stranger's theft from Harmen")
  })

  it('given back of your own accord makes up more than after being caught', async () => {
    const run = async (caught: boolean) => {
      const engine = new Engine(content, { seed: 7 })
      const world = engine.world
      await engine.handle('create rascal heathborn peat_cutter name=Joost')
      world.state.player.location = 'loc_molenend_house'
      ;(world.state.ground['loc_molenend_house'] ??= {})['wool'] = 1
      stay(engine, 'npc_harmen', 'loc_molenend_mill')
      for (const id of Object.keys(world.state.npcs)) if (id !== 'npc_harmen' && world.state.npcs[id]!.location === 'loc_molenend_house') world.state.npcs[id]!.location = 'loc_molenend_mill'
      await engine.handle('steal wool')
      const theft = world.state.crimes!.at(-1)!
      if (caught) theft.proven = true
      stay(engine, 'npc_harmen', 'loc_molenend_house')
      const before = relation(engine.state, 'npc_harmen').affinity
      await engine.handle('give wool to harmen')
      engine.tick(60)
      return relation(engine.state, 'npc_harmen').affinity - before
    }
    const own = await run(false)
    const after = await run(true)
    expect(own).toBeGreaterThan(after)
  })
})

describe('M10.3: access as a right', () => {
  it('a strongbox opens with its key; what is in it is its owner\'s; forcing it is loud', async () => {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    await engine.handle('create warden heathborn peat_cutter name=Joost')
    world.state.player.location = 'loc_waagdam_graanhandel'
    stay(engine, 'npc_lubbert', 'loc_waagdam_canal_street')
    expect(said(await engine.handle('open strongbox'))).toMatch(/Lubbert's strongbox is locked\./)
    world.state.player.inventory['lubberts_key'] = 1
    expect(said(await engine.handle('open strongbox'))).toMatch(/In Lubbert's strongbox: .*yarn/)
    await engine.handle('take yarn from strongbox')
    expect(world.state.player.inventory['yarn']).toBe(1)
    expect(world.state.crimes?.at(-1)).toMatchObject({ kind: 'theft', victim: 'npc_lubbert', item: 'yarn' })
    // Forcing Maren's box on Skerrow: loud, whether it gives or not.
    const isleGame = new Engine(isle, { seed: 7 })
    await isleGame.handle('create warden heathborn peat_cutter name=Joost')
    isleGame.state.player.location = 'loc_skerrow_salt_kettle'
    const out = said(await isleGame.handle('force strongbox'))
    expect(out).toMatch(/\(Athletics \d+ vs DC 16: /)
    expect(isleGame.state.news!.facts.some((f) => f.kind === 'break_in')).toBe(true)
  })

  it('a locked door opens with its key and not without', async () => {
    const engine = new Engine(content, { seed: 7 })
    const world = engine.world
    const exit = world.location('loc_molenend_lane').exits.east!
    exit.lock = { key: 'lubberts_key', dc: 15, quality: 'common', material: 'iron' }
    try {
      world.state.player.location = 'loc_molenend_lane'
      expect(said(await engine.handle('east'))).toMatch(/The door is locked\. You have no key to it\./)
      world.state.player.inventory['lubberts_key'] = 1
      expect(said(await engine.handle('east'))).toMatch(/You unlock the door with the iron key\./)
      expect(world.state.player.location).toBe('loc_molenend_house')
    } finally {
      delete exit.lock
    }
  })

  it('walking into a home uninvited, seen by someone who does not want you, is trespass they remember; asked in, you may stay', async () => {
    const run = async (affinity: number, askFirst = false) => {
      const engine = new Engine(content, { seed: 7 })
      const world = engine.world
      engine.tick((10 * 60 - (world.now % DAY) + DAY) % DAY)
      Object.assign(relation(engine.state, 'npc_harmen'), { affinity, trust: affinity < 0 ? -20 : 10, familiarity: 30 })
      stay(engine, 'npc_harmen', 'loc_molenend_house')
      for (const id of Object.keys(world.state.npcs)) if (id !== 'npc_harmen' && world.state.npcs[id]!.location === 'loc_molenend_house') world.state.npcs[id]!.location = 'loc_molenend_mill'
      world.state.player.location = 'loc_molenend_lane'
      if (askFirst) letIn(world, 'loc_molenend_house', world.now + 60)
      return { engine, out: said(await engine.handle('east')) }
    }
    const cold = await run(-40)
    expect(cold.out).toMatch(/Harmen stares at you\. "What are you doing in my house\?/)
    expect(cold.engine.state.npcs['npc_harmen']!.memory?.at(-1)?.note).toMatch(/walked into my home without a by-your-leave/)
    expect((await run(10)).out).not.toMatch(/What are you doing in my house/)
    expect((await run(-40, true)).out).not.toMatch(/What are you doing in my house/)
  })
})
