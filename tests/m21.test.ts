import { describe, expect, it } from 'vitest'
import { Engine, GameClock, MockLlm, type LlmClient, type LlmRejection, type MockMode } from '../src/engine'
import { content, homeStart } from './helpers'

// Milestone M2.1 (docs/ROADMAP.md): coherence after the first playtest.

const at = (engine: Engine, day: number, hour: number, minute = 0) => engine.tick(GameClock.from(211, 9, day, hour, minute).minutes - engine.world.now)
const texts = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

async function talkTo(engine: Engine, npc: string, line: string) {
  engine.state.player.location = engine.state.npcs[npc]!.location
  await engine.handle(`talk ${content.npcs.get(npc)!.name.split(' ')[0]}`)
  return engine.handle(line)
}

function withMock(mode: MockMode, seed = 1) {
  const rejected: LlmRejection[] = []
  const mock = new MockLlm(mode)
  const llm: LlmClient = { complete: (r) => mock.complete(r), report: (r) => rejected.push(r) }
  const engine = new Engine(content, { seed, llm })
  at(engine, 15, 11)
  return { engine, mock, rejected }
}

describe('M2.1: far-away names become lore of the savegame', () => {
  it('records a new far place, tells the NPC about it later and shows it in the journal', async () => {
    const { engine, mock } = withMock('far')
    const outputs = await talkTo(engine, 'npc_mirte', 'What happened to the mill?')
    expect(texts(outputs)).toMatch(/Amber Coast/)
    const far = engine.state.lore!.far
    expect(far).toHaveLength(1)
    expect(far[0]).toMatchObject({ id: 'far_amber_coast', name: 'Amber Coast', kind: 'land', by: 'npc_mirte', known_by: ['npc_mirte'] })
    expect(far[0]!.line).toMatch(/Salt comes dear from the Amber Coast/)
    expect(engine.status().journal.places.map((p) => p.name)).toContain('Amber Coast (heard of)')

    mock.mode = 'good'
    await engine.handle('What do you know about the Amber Coast?')
    expect(mock.calls.at(-1)!.prompt).toMatch(/FAR PLACES you have spoken of: Amber Coast \(land\)/)
    expect(mock.calls.at(-1)!.prompt).toMatch(/far_amber_coast \(level 2\): Amber Coast is a land far away/)
  })

  it('does not let someone who never heard of the place talk about it as if they know it', async () => {
    const { engine, mock, rejected } = withMock('far')
    await talkTo(engine, 'npc_mirte', 'What happened to the mill?')
    await engine.handle('bye')
    rejected.length = 0
    const outputs = await talkTo(engine, 'npc_lubbert', 'What happened to the mill?')
    expect(rejected.map((r) => r.reason)).toContain('leak')
    expect(texts(outputs)).not.toMatch(/Amber Coast/)
    expect(engine.state.lore!.far).toHaveLength(1)
    expect(mock.calls.length).toBeGreaterThan(1)
  })

  it('allows at most one new place per reply', async () => {
    const { engine, rejected } = withMock('twofar')
    const outputs = await talkTo(engine, 'npc_mirte', 'What happened to the mill?')
    expect(rejected.map((r) => r.reason)).toEqual(['invented', 'invented'])
    expect(texts(outputs)).not.toMatch(/Kessmoor/)
    expect(engine.state.lore?.far ?? []).toHaveLength(0)
  })

  it('keeps far places through saving, loading and replaying', async () => {
    const mock = new MockLlm('far')
    const engine = new Engine(content, { seed: 9, llm: mock })
    for (const command of ['north', 'east', 'talk mirte', 'What happened to the mill?', 'bye']) await engine.handle(command)
    expect(engine.state.lore!.far).toHaveLength(1)
    const loaded = Engine.fromSave(content, engine.save())
    expect(loaded.status().journal.places.map((p) => p.name)).toContain('Amber Coast (heard of)')
    const replayed = await Engine.replay(content, 9, engine.save().log)
    expect(replayed.state).toEqual(engine.state)
  })
})

describe('M2.1: sleep, doors and what an NPC just did', () => {
  const outsideHut = 'loc_peat_cuttings'

  it('shuts a home at night, lets you knock, and wakes a sleeper with a cost', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 1, llm: mock })
    at(engine, 14, 23, 30)
    expect(engine.state.npcs['npc_wouter']).toMatchObject({ location: 'loc_wouter_hut', activity: 'asleep' })
    engine.state.player.location = outsideHut
    expect(texts(await engine.handle('south'))).toMatch(/shut for the night\. KNOCK/)
    expect(engine.state.player.location).toBe(outsideHut)

    const affinity = engine.state.relations?.['npc_wouter']?.affinity ?? 0
    expect(texts(await engine.handle('knock'))).toMatch(/Wouter opens the door a crack/)
    expect(engine.state.npcs['npc_wouter']).toMatchObject({ location: outsideHut, activity: 'standing in the doorway' })
    expect(engine.state.relations!['npc_wouter']!.affinity).toBe(affinity - 3)

    expect(texts(await engine.handle('talk wouter'))).toMatch(/Wouter rubs his eyes\. "What is it\? It's the middle of the night\."/)
    await engine.handle('What are you doing now?')
    const prompt = mock.calls.at(-1)!.prompt
    expect(prompt).toMatch(/Mood: just woken, groggy and cross/)
    expect(prompt).toMatch(/RECENTLY: .*you walked from [^;]+ to Wouter's Hut; .*you went to bed; (just now|\d+ minutes ago) you were woken by the stranger\./)
  })

  it('makes you wake a sleeping NPC before you can talk', async () => {
    const engine = new Engine(content, { seed: 1 })
    at(engine, 14, 23, 30)
    engine.state.player.location = 'loc_wouter_hut'
    expect(texts(await engine.handle('talk wouter'))).toMatch(/Wouter is asleep\. WAKE WOUTER if you must\./)
    expect(engine.state.talk).toBeUndefined()
    expect(texts(await engine.handle('wake wouter'))).toMatch(/wakes with a start/)
    expect(texts(await engine.handle('talk wouter'))).toMatch(/You are talking with Wouter/)
  })

  it('gives someone who goes to bed a few minutes before the lamp goes out', () => {
    const engine = new Engine(content, { seed: 1 })
    at(engine, 14, 21, 0)
    const wouter = engine.state.npcs['npc_wouter']!
    let ready = 0
    for (let minute = 0; minute < 240 && wouter.activity !== 'asleep'; minute++) {
      engine.tick(1)
      if (wouter.activity === 'getting ready for bed') ready++
    }
    expect(wouter).toMatchObject({ location: 'loc_wouter_hut', activity: 'asleep' })
    expect(ready).toBeGreaterThanOrEqual(9)
  })
})

describe('M2.1: people notice the stranger', () => {
  // Gerrit walks from home to work past the quay: the start before M10.33 M.
  it('lets a curious passer-by stop for a while instead of rushing through', () => {
    const engine = homeStart(new Engine(content, { seed: 1 }))
    const lines = texts(engine.tick(1))
    expect(lines).toMatch(/Gerrit comes from the east, on his way to [^.]+\./)
    expect(lines).toMatch(/Gerrit stops and looks you over\./)
    engine.tick(12)
    expect(engine.state.npcs['npc_gerrit']).toMatchObject({ location: 'loc_veenhoek_quay', activity: 'stopping to look at the stranger' })
    expect(texts(engine.tick(10))).toMatch(/Gerrit walks on (to the \w+|inside|outside|upstairs|downstairs)\./)
  })

  it('does not stop twice for the same stranger within a few hours', () => {
    const engine = homeStart(new Engine(content, { seed: 1 }))
    engine.tick(1)
    const gerrit = engine.state.npcs['npc_gerrit']!
    expect(gerrit.noticedPlayerAt).toBe(engine.world.now)
  })
})
