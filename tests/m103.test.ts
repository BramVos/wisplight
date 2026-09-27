import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import type { LlmClient } from '../src/engine/dialogue/llm'
import { MockLlm } from '../src/engine/dialogue/mock'
import { accept, offersFor, parseWhen } from '../src/engine/dialogue/offers'
import { relation } from '../src/engine/dialogue/relations'
import { heardBy, recordFact } from '../src/engine/news'
import { openRequest } from '../src/engine/requests'
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
    expect(engine.page('promises')?.lines.join('\n')).toMatch(/Mirte agreed: meet the stranger at Veenhoek, the Green, tomorrow at 12:00/)
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
