import { describe, expect, it } from 'vitest'
import { buildInput, Engine, GameClock, goalRequest, MockLlm, peopleLine, questsOf, recordFact, startStory, systemPrompt, ties, tieTo, type LlmRejection } from '../src/engine'
import { assignKeys, buildRequest, DEFAULT_LIMITS } from '../src/chronicler'
import { costUsd } from '../src/node/ai/pricing'
import { content } from './helpers'

// Milestone M3.1 (docs/ROADMAP.md): relations between people, death and grief
// (brought forward from M6 at Bram's request), the chronicler and the AI goal choice.

const at = (engine: Engine, day: number, hour: number, minute = 0) => engine.tick(GameClock.from(211, 9, day, hour, minute).minutes - engine.world.now)
const texts = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

describe('M3.1: who people are to each other', () => {
  const engine = new Engine(content, { seed: 1 })
  const world = engine.world

  it('writes a relation once and derives the other side', () => {
    expect(tieTo(world, 'npc_pim', 'npc_grietje_visser')).toMatchObject({ role: 'parent', kind: 'family', name: 'Grietje' })
    expect(tieTo(world, 'npc_gerrit', 'npc_jan_visser')).toMatchObject({ role: 'crew', kind: 'work' })
    // A private relation stays private on the other side too.
    expect(tieTo(world, 'npc_lubbert', 'npc_kobus')).toMatchObject({ role: 'employee', private: true })
    expect(ties(world, 'npc_mirte').map((t) => t.name)).toEqual(expect.arrayContaining(['Joris', 'Harmen']))
  })

  it('tells the voice who its own people are, and what is private', () => {
    const line = peopleLine(world, 'npc_grietje_visser')!
    // With the age from the content (M10.8), so the voice does not make one up.
    expect(line).toMatch(/Jan, aged 44, your husband/)
    expect(line).toMatch(/Pim, aged 9, your son/)
    expect(line).toMatch(/Fenna, your daughter \(missing\)/)
    expect(peopleLine(world, 'npc_kobus')).toMatch(/PRIVATE, not for people you do not trust: Lubbert, aged \d+, your employer/)
    expect(systemPrompt(world, 'npc_mirte')).toMatch(/YOUR PEOPLE: Joris, your husband \(away\)/)
  })

  it('knows who has a role in which quest', () => {
    expect(questsOf(world, 'npc_harmen').map((q) => q.id)).toEqual(expect.arrayContaining(['flour_for_veenhoek', 'what_the_haakman_wants']))
    expect(questsOf(world, 'npc_teunis')).toEqual([])
  })
})

describe('M3.1: death and grief', () => {
  function game(seed = 3) {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed, llm: mock, builder: true })
    at(engine, 15, 11)
    return { engine, mock }
  }

  it('takes the dead out of the world, and the family hears it first', async () => {
    const { engine } = game()
    const out = await engine.handle('@kill jan drowned in the Blackmere')
    expect(texts(out)).toMatch(/Jan Visser drowned in the Blackmere\. Belang 4\./)
    const jan = engine.state.npcs['npc_jan_visser']!
    expect(jan.dead).toBeDefined()
    expect(engine.world.npcsAt(jan.location)).not.toContain('npc_jan_visser')
    engine.tick(3 * 60)
    const heard = engine.state.news!.heard
    // Wherever they were, his wife and son know within a few hours, precisely.
    for (const near of ['npc_grietje_visser', 'npc_pim']) expect(heard[near]![jan.dead!.fact]).toMatchObject({ level: 3 })
    expect(engine.state.npcs['npc_jan_visser']!.location).toBe(jan.location)
    engine.tick(60)
    expect(await engine.handle('@kill jan again')).toMatchObject([{ kind: 'error' }])
  })

  it('makes the near ones grieve: mood, the prompt, and a day at home', async () => {
    const { engine, mock } = game()
    await engine.handle('@kill jan drowned in the Blackmere')
    engine.tick(3 * 60)
    const grietje = engine.state.npcs['npc_grietje_visser']!
    expect(grietje.location).toBe(content.npcs.get('npc_grietje_visser')!.home)
    engine.state.player.location = grietje.location
    await engine.handle('talk grietje')
    await engine.handle('How are you?')
    const prompt = mock.calls.at(-1)!.prompt
    expect(prompt).toMatch(/Mood: grieving for Jan/)
    expect(prompt).toMatch(/YOUR PEOPLE NOW: Jan, your husband, is dead: Jan Visser drowned in the Blackmere\. You are grieving\./)
    expect(prompt).toMatch(/LISTENER: the player is a stranger/)
  })

  it('keeps grief from strangers when there is no model', async () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    at(engine, 15, 11)
    await engine.handle('@kill jan drowned in the Blackmere')
    engine.tick(3 * 60)
    engine.state.player.location = engine.state.npcs['npc_grietje_visser']!.location
    await engine.handle('talk grietje')
    const stranger = texts(await engine.handle('ask grietje about jan'))
    expect(stranger).toMatch(/My husband\. I'd rather not speak of him to a stranger\./)
    Object.assign(engine.state.relations!['npc_grietje_visser']!, { familiarity: 40, trust: 40 })
    expect(texts(await engine.handle('ask grietje about jan'))).not.toMatch(/stranger/)
  })

  it('only runs build commands in the world builder, but replays them from a log', async () => {
    const plain = new Engine(content, { seed: 3 })
    expect(await plain.handle('@kill harmen')).toMatchObject([{ kind: 'error', text: expect.stringMatching(/world builder/) }])
    const { engine } = game()
    await engine.handle('@kill harmen fell from the mill')
    engine.tick(30)
    const replayed = await Engine.replay(content, 3, engine.save().log)
    expect(replayed.state).toEqual(engine.state)
  })
})

describe('M3.1: the pace of events is the player\'s choice', () => {
  it('sets the tempo with a command', async () => {
    const engine = new Engine(content, { seed: 1 })
    expect(texts(await engine.handle('tempo dramatisch'))).toMatch(/dramatic: a lot happens/)
    expect(engine.state.stories!.tempo).toBe('dramatic')
    expect(await engine.handle('tempo wild')).toMatchObject([{ kind: 'error' }])
  })
})

describe('M3.1: the chronicler', () => {
  function game(mode: ConstructorParameters<typeof MockLlm>[0] = 'good', seed = 3, witness = true) {
    const mock = new MockLlm(mode)
    const engine = new Engine(content, { seed, llm: mock, builder: true })
    at(engine, 15, 11)
    // Mirte happens to be at the mill when it happens.
    if (witness) engine.state.npcs['npc_mirte']!.location = engine.state.npcs['npc_harmen']!.location
    // Klaas lives with Harmen; for these stories Mirte is the one who saw it.
    if (witness && engine.state.npcs['npc_klaas']!.location === engine.state.npcs['npc_harmen']!.location) engine.state.npcs['npc_klaas']!.location = 'loc_molenend_lane'
    return { engine, mock }
  }
  const chronicled = (mock: MockLlm) => mock.calls.filter((c) => c.role === 'chronicler')

  it('writes big news up from templates at once when there is no model', async () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    at(engine, 15, 11)
    await engine.handle('@kill harmen drowned in the Blackmere')
    const [lore] = engine.state.chronicle!.lore
    expect(lore).toMatchObject({ by: 'template', fame: 4, name: 'The death of Harmen Molenaar', details: 'Harmen Molenaar drowned in the Blackmere.' })
    expect(engine.state.chronicle!.pending).toEqual([])
  })

  it('writes at 04:00 about news of belang 3, and not before', () => {
    const engine = new Engine(content, { seed: 5 })
    at(engine, 15, 11)
    recordFact(engine.world, { kind: 'theft', about: ['npc_dirck', 'loc_waagdam_waag'], place: 'loc_waagdam_waag', belang: 3, title: 'the theft at the Waag', text: { precise: 'Someone took the brass weights from the Waag.', village: 'The Waag was robbed.', far: 'A town was robbed, they say.' } })
    at(engine, 16, 3, 59)
    expect(engine.state.chronicle!.lore).toEqual([])
    at(engine, 16, 4, 1)
    expect(engine.state.chronicle!.lore.map((l) => l.name)).toEqual(['The theft at the Waag'])
    // Whoever heard the news knows the story, as well as they know the news.
    const witness = Object.keys(engine.state.news!.heard).find((id) => id !== 'player' && engine.state.news!.heard[id]!['fact_' + engine.state.news!.seq]?.from === 'witness')
    if (witness) expect(engine.page(engine.state.chronicle!.lore[0]!.id)).toBeUndefined()
  })

  it('lets the chronicler write with a model: lore with a witness as teller, a thought, the news of the day', async () => {
    const { engine, mock } = game()
    await engine.handle('@kill harmen drowned in the Blackmere')
    // A death with a quest role: the chronicler is asked at once, and the game goes on meanwhile.
    expect(engine.chroniclerWaiting).toBe(1)
    const [run] = await engine.runChronicler()
    expect(run!.problems).toEqual([])
    const request = chronicled(mock)[0]!
    expect(request.system).toMatch(/Working instruction for the chronicler/)
    expect(request.prompt).toMatch(/belang 4: Harmen Molenaar drowned in the Blackmere\./)
    expect(request.prompt).toMatch(/PRIVATE: Harmen is her creditor/)
    const [lore] = engine.state.chronicle!.lore
    expect(lore).toMatchObject({ by: 'chronicler', teller: 'npc_mirte', fame: 4 })
    expect(lore!.story).toMatch(/Nobody who saw it has slept well since/)
    expect(engine.state.npcs['npc_mirte']!.thoughts![0]!.text).toMatch(/You still owe Harmen/)
    expect(engine.state.chronicle!.news['molenend']!.text).toMatch(/Harmen Molenaar drowned/)
    // Mirte saw it: she tells it as her own story, on her mind the debt.
    engine.state.player.location = engine.state.npcs['npc_mirte']!.location
    await engine.handle('talk mirte')
    await engine.handle(`ask mirte about ${lore!.name}`)
    const prompt = mock.calls.at(-1)!.prompt
    expect(prompt).toMatch(new RegExp(`${lore!.id} \\(level 3\\)`))
    expect(prompt).toMatch(/ON YOUR MIND: You still owe Harmen/)
  })

  it('turns down names the world does not know, and writes that part from the template', async () => {
    const { engine } = game('invent')
    await engine.handle('@kill harmen drowned in the Blackmere')
    const [run] = await engine.runChronicler()
    expect(run!.problems.join(' ')).toMatch(/Oswin/)
    expect(engine.state.chronicle!.lore[0]).toMatchObject({ by: 'template' })
  })

  it('may look things up before it writes', async () => {
    const { engine, mock } = game('lookup')
    await engine.handle('@kill harmen drowned in the Blackmere')
    await engine.runChronicler()
    expect(chronicled(mock)).toHaveLength(2)
    expect(chronicled(mock)[1]!.prompt).toMatch(/LOOKED UP/)
  })

  it('replays the chronicle from the log without calling the model again', async () => {
    // Nothing moved by hand here: a replay only knows what the log knows.
    const { engine, mock } = game('good', 3, false)
    await engine.handle('@kill harmen drowned in the Blackmere')
    engine.tick(10)
    await engine.runChronicler()
    engine.tick(30)
    const calls = mock.calls.length
    const replayed = await Engine.replay(content, 3, engine.save().log)
    expect(replayed.state).toEqual(engine.state)
    expect(mock.calls.length).toBe(calls)
  })

  it('works an open thread out into a request that the giver asks and the player can do', async () => {
    const { engine } = game('quest')
    await engine.handle('@kill harmen drowned in the Blackmere')
    await engine.runChronicler()
    const request = engine.state.requests.find((r) => r.source === 'chronicler')!
    expect(request).toMatchObject({ kind: 'visit', status: 'open' })
    engine.state.player.location = engine.state.npcs[request.npc]!.location
    const asked = texts(await engine.handle(`talk ${content.npcs.get(request.npc)!.name.split(' ')[0]}`))
    expect(asked).toContain(request.ask!)
    expect(engine.status().journal.quests.map((q) => q.id)).toContain(request.id)
    await engine.handle('bye')
    engine.state.player.location = engine.state.npcs[request.target!]!.location
    await engine.handle(`talk ${content.npcs.get(request.target!)!.name.split(' ')[0]}`)
    expect(request.status).toBe('done')
  })

  it('costs less than 3 dollar cents for an ordinary night with a strong model', async () => {
    const { engine } = game()
    await engine.handle('@kill harmen drowned in the Blackmere')
    const input = buildInput(engine.world, engine.state.chronicle!.pending[0]!)
    const request = buildRequest(input, assignKeys(input), DEFAULT_LIMITS, [], DEFAULT_LIMITS.lookups)
    const tokens = (text: string) => Math.ceil(text.length / 4)
    const fixed = tokens(request.system)
    const overview = tokens(request.prompt) + tokens(JSON.stringify(request.schema))
    // The fixed part is cached from the second run on; the answer is at most the token limit.
    const usage = { inputTokens: fixed + overview, cachedTokens: fixed, outputTokens: DEFAULT_LIMITS.maxTokens }
    expect(costUsd('claude-sonnet-5', usage)!).toBeLessThan(0.03)
    // With the domains of people named in talks (M10.9), a sentence of the world's own, and the world's voice (M10.10).
    expect(fixed).toBeLessThan(5300)
  })
})

describe('M3.1: requests come up out of what happens', () => {
  it('asks the player to find a lost thing, and pays when it comes back', async () => {
    const engine = new Engine(content, { seed: 6 })
    at(engine, 15, 10)
    expect(startStory(engine.world, 'lost_thing')).toBe(true)
    const request = engine.state.requests.at(-1)!
    expect(request).toMatchObject({ kind: 'recover', source: 'motor', status: 'open' })
    const owner = request.npc
    const place = Object.entries(engine.state.ground).find(([, items]) => items[request.item!])![0]
    engine.state.player.location = engine.state.npcs[owner]!.location
    const opening = texts(await engine.handle(`talk ${content.npcs.get(owner)!.name.split(' ')[0]}`))
    expect(opening).toMatch(/I've lost my .*bring it back to me\?/)
    expect(opening).toMatch(/New in your journal/)
    await engine.handle('bye')
    engine.state.player.location = place
    await engine.handle(`take ${request.item}`)
    engine.state.player.location = engine.state.npcs[owner]!.location
    const money = engine.state.player.money
    await engine.handle(`give ${request.item} to ${content.npcs.get(owner)!.name.split(' ')[0]}`)
    expect(request.status).toBe('done')
    expect(engine.state.player.money).toBe(money + request.reward!)
    // The owner may also give a quest of their own when spoken to: find the request among them.
    const { requestName } = await import('../src/engine/requests')
    expect(engine.status().journal.quests.find((q) => q.name.includes(requestName(engine.world, request)))?.name).toMatch(/\(done\)/)
  })

  it('asks for herbs when someone falls ill, and the herbs help', async () => {
    const engine = new Engine(content, { seed: 2 })
    at(engine, 15, 9)
    expect(startStory(engine.world, 'fever')).toBe(true)
    const request = engine.state.requests.find((r) => r.item === 'herbs')!
    const sick = engine.state.stories!.active.find((s) => s.kind === 'sickness')!.roles['name']!
    expect(request.ask).toMatch(/fever.*bundle of herbs from Aaltje/)
    engine.state.player.money += 100
    engine.state.player.location = 'loc_aaltje_cottage'
    await engine.handle('buy herbs')
    engine.state.player.location = engine.state.npcs[request.npc]!.location
    await engine.handle('talk ' + content.npcs.get(request.npc)!.name.split(' ')[0])
    await engine.handle('bye')
    await engine.handle(`give herbs to ${content.npcs.get(request.npc)!.name.split(' ')[0]}`)
    expect(request.status).toBe('done')
    expect(engine.state.npcs[sick]!.sickUntil!).toBeLessThanOrEqual(engine.world.now + 6 * 60)
  })
})

describe('M3.1: the AI chooses what NPCs want', () => {
  function game(mode: ConstructorParameters<typeof MockLlm>[0] = 'good', seed = 4) {
    const mock = new MockLlm(mode)
    const rejected: LlmRejection[] = []
    const engine = new Engine(content, { seed, llm: { complete: (r) => mock.complete(r), report: (r) => rejected.push(r) }, builder: true })
    return { engine, mock, rejected }
  }
  const brainCalls = (mock: MockLlm) => mock.calls.filter((c) => c.role === 'brain')

  it('plans the day when an NPC gets up, and the NPC carries out a valid goal', async () => {
    const { engine, mock } = game()
    at(engine, 15, 7)
    const waiting = engine.state.brain!.pending.map((p) => p.npc)
    expect(waiting).toContain('npc_mirte')
    await engine.runBrain()
    const request = brainCalls(mock).find((c) => c.meta!['npc'] === 'npc_gerrit')!
    expect(request.prompt).toMatch(/WHY YOU CHOOSE NOW: You have just got up/)
    // The catalogue is in the cached part (M8.2, after the review), the whole of it for everyone since M10.26, and which
    // goals are open to them now after the mark; places and people have short keys.
    expect(request.system.slice(0, request.cacheShared)).toMatch(/THE GOALS:\n {2}Work \(target none\)/)
    expect(request.system.slice(request.cacheBreak)).toMatch(/GOALS YOU MAY CHOOSE NOW: Work, /)
    expect(request.prompt).toMatch(/PLACES YOU KNOW: l1 /)
    const gerrit = engine.state.npcs['npc_gerrit']!
    const goal = gerrit.goals.find((g) => g.source === 'ai')!
    expect(goal).toMatchObject({ type: 'Visit', priority: 0.8 })
    // Within a few hours he goes there, and the goal is done.
    let went = false
    for (let i = 0; i < 4 * 60 && !went; i++) {
      engine.tick(1)
      went = gerrit.location === goal.target && /visiting|chatting/.test(gerrit.activity)
    }
    expect(went).toBe(true)
  })

  it('turns down goals outside the catalogue, the NPC\'s knowledge or the gates, and the utility function carries on', async () => {
    const { engine, rejected } = game('invent')
    at(engine, 15, 7)
    const results = await engine.runBrain()
    const mirte = results.find((r) => engine.state.brain!.pending.length === 0 && r.rejected.length)!
    expect(mirte.accepted).toBe(0)
    // Steal is in the catalogue since M7.2, but a person is not a thing to steal, and the gate would stop her anyway.
    expect(mirte.rejected.join(' ')).toMatch(/Steal npc_lubbert: not something/)
    expect(mirte.rejected.join(' ')).toMatch(/Visit loc_the_moon: not something .* knows/)
    expect(rejected.some((r) => r.reason === 'goal')).toBe(true)
    expect(Object.values(engine.state.npcs).every((n) => n.goals.every((g) => g.source !== 'ai'))).toBe(true)
    // The schedule still runs: Mirte bakes.
    at(engine, 15, 9)
    expect(engine.state.npcs['npc_mirte']!.activity).not.toBe('taking it easy')
  })

  it('falls back on the utility function when the reply is no JSON at all', async () => {
    const { engine } = game('invalid')
    at(engine, 15, 7)
    const [first] = await engine.runBrain()
    expect(first!.rejected).toEqual(['no reply: the utility function decides'])
  })

  it('thinks again when news concerns someone near, and at most six times a day', async () => {
    const { engine } = game()
    at(engine, 15, 7)
    await engine.runBrain()
    await engine.handle('@kill jan drowned in the Blackmere')
    engine.tick(3 * 60)
    const grietje = engine.state.brain!.pending.find((p) => p.npc === 'npc_grietje_visser')
    expect(grietje?.trigger).toMatch(/You just heard: Jan Visser drowned in the Blackmere/)
    for (let i = 0; i < 10; i++) {
      await engine.runBrain()
      engine.tick(60)
    }
    expect(engine.state.brain!.counts['npc_grietje_visser']!.n).toBeLessThanOrEqual(6)
  })

  it('gives goal choices of people with a quest role priority when the budget runs low', () => {
    const { engine } = game()
    const choice = (npc: string) => goalRequest(engine.world, { id: 'c', npc, t: engine.world.now, trigger: 'test' })
    expect(choice('npc_harmen').priority).toBe('normal')
    expect(choice('npc_teunis').priority).toBe('low')
  })

  it('replays the goal choices from the log without calling the model again', async () => {
    const { engine, mock } = game()
    at(engine, 15, 7)
    await engine.runBrain()
    engine.tick(60)
    const calls = mock.calls.length
    const replayed = await Engine.replay(content, 4, engine.save().log)
    expect(replayed.state).toEqual(engine.state)
    expect(mock.calls.length).toBe(calls)
  })
})
