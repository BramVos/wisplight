import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { MockLlm } from '../src/engine/dialogue/mock'
import { invite } from '../src/engine/social/invite'
import { startChroniclePlan } from '../src/engine/planning'
import { agree } from '../src/engine/agreements'
import { tieTo } from '../src/engine/people'
import { content } from './helpers'

// The three points M10.3 left open, decided with Bram on 28 September 2026 and
// built after M10: claims the voice reads, an NPC who asks the stranger to come
// along (invite), and a fight between two people of the world.

const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

function stay(engine: Engine, npcId: string, location: string, minutes = 600): void {
  const s = engine.state.npcs[npcId]!
  s.location = location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + minutes
  s.plan = []
}

describe('M10.3 left over: claims the voice reads', () => {
  it('when the rules read no claim and it is no question, the voice may read one in the same call; the engine judges it, and the stance sounds next turn', async () => {
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 7, llm })
    const world = engine.world
    stay(engine, 'npc_mirte', world.state.player.location)
    await engine.handle('talk mirte')
    // Words the rules cannot read: nothing in them says "is at" or "went to".
    llm.claim = { subject: 'npc_harmen', key: 'at', value: 'loc_waagdam_market' }
    const calls = llm.calls.length
    await engine.handle('"Harmen is off selling his flour at the Waagdam market this morning.')
    const request = llm.calls.slice(calls).find((c) => c.schemaName === 'npc_reply')!
    // The schema is the same for every line since M10.28; the message asks for the claim.
    expect(request.prompt).toMatch(/^CLAIM: /m)
    expect(request.prompt).toMatch(/CLAIM: if the stranger's words just said something is so about .*npc_harmen/)
    const fact = world.state.news!.facts.find((f) => f.by === 'player' && f.claim?.subject === 'npc_harmen')!
    expect(fact.claim).toEqual({ subject: 'npc_harmen', key: 'at', value: 'loc_waagdam_market' })
    expect(world.state.news!.heard['npc_mirte']?.[fact.id]?.from).toBe('player')
    // The next turn carries how she took it.
    llm.claim = undefined
    const next = llm.calls.length
    await engine.handle('"Anyway, how is the bread today?')
    expect(llm.calls.slice(next).find((c) => c.schemaName === 'npc_reply')!.prompt).toMatch(/Earlier the stranger said Harmen is at .*; let that show/)
  })

  it('offers no claim for a question, and keeps out a claim the world has no words for', async () => {
    const llm = new MockLlm('good')
    const engine = new Engine(content, { seed: 7, llm })
    stay(engine, 'npc_mirte', engine.world.state.player.location)
    await engine.handle('talk mirte')
    const calls = llm.calls.length
    await engine.handle('"Is Harmen at the market today?')
    expect(llm.calls.slice(calls).find((c) => c.schemaName === 'npc_reply')!.prompt).not.toMatch(/^CLAIM: /m)
    llm.claim = { subject: 'npc_harmen', key: 'at', value: 'the moon' }
    await engine.handle('"Harmen is off selling his flour at the Waagdam market this morning.')
    expect(engine.world.state.news!.facts.some((f) => f.by === 'player' && f.claim?.subject === 'npc_harmen')).toBe(false)
  })
})

describe('M10.3 left over: an NPC asks the stranger along (invite)', () => {
  async function asked(llm?: MockLlm) {
    const engine = new Engine(content, { seed: 7, ...(llm ? { llm } : {}) })
    const world = engine.world
    const here = world.state.player.location
    expect(invite(world, 'npc_mirte', 'loc_molenend_mill', { line: 'Will you walk up to the mill with me?' })).toBe(true)
    expect(world.state.npcs['npc_mirte']!.seeking).toBeDefined()
    stay(engine, 'npc_mirte', here)
    const out = said(await engine.handle('look'))
    return { engine, world, out }
  }

  it('they find the stranger and make the offer themselves; a yes is the agreement lead', async () => {
    const { engine, world, out } = await asked()
    expect(out).toMatch(/Mirte comes up to you\.[\s\S]*Will you walk up to the mill with me\?/)
    expect(out).toMatch(/Mirte offers to take you to .*Mill.*YES to agree, NO to decline\./)
    await engine.handle('yes')
    expect(world.state.agreements!.list.some((a) => a.kind === 'lead' && a.by === 'npc_mirte' && a.terms.place === 'loc_molenend_mill')).toBe(true)
    expect(world.state.npcs['npc_mirte']!.inviting).toBeUndefined()
  })

  it('a no, and they go alone', async () => {
    const { engine, world } = await asked()
    await engine.handle('no')
    const s = world.state.npcs['npc_mirte']!
    expect(s.inviting).toBeUndefined()
    expect(s.goals.some((g) => g.type === 'Visit' && g.target === 'loc_molenend_mill')).toBe(true)
  })

  it('no answer is a no once the talk is over; or they wait, when the step says so', async () => {
    const { engine, world } = await asked()
    await engine.handle('bye')
    engine.tick(60)
    // She set off alone: on her way, or there already.
    const s = world.state.npcs['npc_mirte']!
    expect(s.inviting).toBeUndefined()
    expect(s.location === 'loc_molenend_mill' || s.goals.some((g) => g.type === 'Visit' && g.target === 'loc_molenend_mill')).toBe(true)
    const again = new Engine(content, { seed: 7 })
    invite(again.world, 'npc_mirte', 'loc_molenend_mill', { otherwise: 'wait', hours: 1 })
    again.tick(120)
    expect(again.world.state.npcs['npc_mirte']!.inviting).toBeUndefined()
    expect(again.world.state.npcs['npc_mirte']!.goals.some((g) => g.type === 'Visit' && g.target === 'loc_molenend_mill')).toBe(false)
  })

  it('a child asks only at home or with a parent by, and only as far as a child may go', async () => {
    const isle = (await import('../src/node/content')).loadContentFromDir
    const skerrow = await isle((await import('node:path')).join(import.meta.dirname, '../content'), 'isle')
    const engine = new Engine(skerrow, { seed: 7 })
    const world = engine.world
    expect(invite(world, 'npc_pip', 'loc_skerrow_harbour')).toBe(true)
    // Not as far as a child may not go: the Kattenbroek is hours from Pim's home.
    expect(invite(new Engine(content, { seed: 7 }).world, 'npc_pim', 'loc_kattenbroek_edge')).toBe(false)
    // Away from home and without his father by: he does not ask, and goes alone.
    const here = world.state.player.location
    stay(engine, 'npc_pip', here)
    stay(engine, 'npc_brannoc', 'loc_skerrow_salt_kettle')
    const out = said(await engine.handle('look'))
    expect(out).not.toMatch(/Pip offers to take you/)
    expect(world.state.npcs['npc_pip']!.inviting).toBeUndefined()
  })

  it('is a verb every plan may use, the chronicler too', () => {
    const engine = new Engine(content, { seed: 7 })
    const problems: string[] = []
    expect(startChroniclePlan(engine.world, { name: 'up to the mill', phases: [], steps: [{ after: 0, verb: 'invite', who: ['npc_mirte'], target: 'loc_molenend_mill', detail: 'Come and see the mill with me.' }] }, 1, problems)).toBe(true)
    engine.tick(60)
    expect(engine.world.state.npcs['npc_mirte']!.inviting?.place).toBe('loc_molenend_mill')
    expect(engine.world.state.npcs['npc_mirte']!.seeking?.line).toBe('Come and see the mill with me.')
  })
})

describe('M10.3 left over: a fight between two people of the world', () => {
  /** The next checks roll these on the d20; everything else rolls as it would. */
  function rolls(engine: Engine, ...values: number[]): void {
    const rng = engine.world.rng
    const real = rng.d20.bind(rng)
    rng.d20 = (stream = 'dice') => (stream === 'checks' && values.length ? values.shift()! : real(stream))
  }
  function goFor(engine: Engine, by: string, target: string) {
    const made = agree(engine.world, { kind: 'attack', by, to: target, source: 'rules', what: 'go for him', terms: { target, reason: 'the price of rye' } })
    expect('rejected' in made, JSON.stringify(made)).toBe(false)
    return made as Exclude<typeof made, { rejected: string }>
  }

  it('out of sight the rules play it out at once: hurt, gives in or runs, never dead; a fact about both, and the loser bears a grudge', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const engine = new Engine(content, { seed })
      const world = engine.world
      world.state.player.location = 'loc_veenhoek_quay'
      stay(engine, 'npc_dirck', 'loc_waagdam_market')
      stay(engine, 'npc_lubbert', 'loc_waagdam_market')
      const a = goFor(engine, 'npc_dirck', 'npc_lubbert')
      engine.tick(20)
      expect(a.status, `seed ${seed}`).toBe('kept')
      const fight = world.state.news!.facts.find((f) => f.kind === 'fight')!
      expect(fight.about).toEqual(['npc_dirck', 'npc_lubbert'])
      expect(fight.text.precise).toMatch(/went for Lubbert at The Market Square over the price of rye\. .*(hurt|ran|gave in)/)
      expect(world.state.npcs['npc_dirck']!.dead).toBeUndefined()
      expect(world.state.npcs['npc_lubbert']!.dead).toBeUndefined()
      const loser = /Dirck (knocked|gave in)|Dirck broke away/.test(fight.text.precise) && !/Lubbert (knocked)/.test(fight.text.precise) ? 'npc_dirck' : 'npc_lubbert'
      expect(['rival']).toContain(tieTo(world, loser, loser === 'npc_dirck' ? 'npc_lubbert' : 'npc_dirck')?.role ?? tieTo(world, loser === 'npc_dirck' ? 'npc_lubbert' : 'npc_dirck', loser)?.role)
    }
  })

  it('whoever means it goes to the other first', () => {
    const engine = new Engine(content, { seed: 3 })
    const world = engine.world
    world.state.player.location = 'loc_veenhoek_quay'
    stay(engine, 'npc_lubbert', 'loc_waagdam_market', 3000)
    const a = goFor(engine, 'npc_dirck', 'npc_lubbert')
    world.state.npcs['npc_dirck']!.location = 'loc_waagdam_graanhandel'
    world.state.npcs['npc_dirck']!.busyUntil = world.now
    for (let i = 0; i < 30 && a.status === 'open'; i++) engine.tick(10)
    expect(a.status).toBe('kept')
  })

  it('in front of the stranger it is a scene: they can talk them apart, or let it run', async () => {
    const engine = new Engine(content, { seed: 3 })
    await engine.handle('create warden heathborn peat_cutter name=Joost')
    const world = engine.world
    world.state.player.location = 'loc_waagdam_market'
    stay(engine, 'npc_dirck', 'loc_waagdam_market')
    stay(engine, 'npc_lubbert', 'loc_waagdam_market')
    const a = goFor(engine, 'npc_dirck', 'npc_lubbert')
    const seen = said(await engine.handle('wait 10'))
    expect(seen).toMatch(/Dirck goes for Lubbert over the price of rye!/)
    expect(seen).toMatch(/PERSUADE or INTIMIDATE them to stop, ATTACK one of them/)
    rolls(engine, 20)
    const stopped = said(await engine.handle('intimidate dirck'))
    expect(stopped).toMatch(/You roar at them to stop, and they do\./)
    expect(a.status).toBe('cancelled')
    expect(world.state.news!.facts.some((f) => f.kind === 'fight_stopped')).toBe(true)
    // Another day, another fight: this time the stranger lets it run.
    const b = goFor(engine, 'npc_dirck', 'npc_lubbert')
    await engine.handle('wait 10')
    const ran = said(await engine.handle('look'))
    expect(ran).toMatch(/(knocked .* down|broke away and ran|gave in to)/)
    expect(ran).toMatch(/The Market Square/)
    expect(b.status).toBe('kept')
  })

  it("attacking one of the two ends their fight and starts the stranger's own", async () => {
    const engine = new Engine(content, { seed: 3 })
    await engine.handle('create warden heathborn peat_cutter name=Joost')
    const world = engine.world
    world.state.player.location = 'loc_waagdam_market'
    stay(engine, 'npc_dirck', 'loc_waagdam_market')
    stay(engine, 'npc_lubbert', 'loc_waagdam_market')
    const a = goFor(engine, 'npc_dirck', 'npc_lubbert')
    await engine.handle('wait 10')
    await engine.handle('attack dirck')
    expect(a.status).toBe('cancelled')
    expect(world.state.brawl).toBeUndefined()
    expect(world.state.combat).toBeDefined()
  })

  it('the law hears of it the way it hears of an attack on the stranger: the officer who sees it fines the one who started it', () => {
    const engine = new Engine(content, { seed: 3 })
    const world = engine.world
    world.state.player.location = 'loc_veenhoek_quay'
    const officer = world.words.law.npc!
    for (const id of ['npc_dirck', 'npc_lubbert', officer]) stay(engine, id, 'loc_waagdam_market')
    world.state.npcs['npc_dirck']!.money = 100
    goFor(engine, 'npc_dirck', 'npc_lubbert')
    engine.tick(20)
    const fined = world.state.news!.facts.find((f) => f.kind === 'fined')!
    expect(fined.about).toEqual(['npc_dirck', officer])
    expect(world.state.npcs['npc_dirck']!.money).toBe(84)
  })

  it('is a verb for plans (fight), and an attack on nobody is refused', () => {
    const engine = new Engine(content, { seed: 3 })
    const problems: string[] = []
    expect(startChroniclePlan(engine.world, { name: 'blows', phases: [], steps: [] }, 1, problems)).toBe(false)
    const made = agree(engine.world, { kind: 'attack', by: 'npc_dirck', to: 'npc_dirck', source: 'rules', what: 'x', terms: { target: 'npc_dirck', reason: 'x' } })
    expect('rejected' in made).toBe(true)
  })
})
