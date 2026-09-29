import { describe, expect, it } from 'vitest'
import { Engine, GameClock, MockLlm, type LlmClient, type LlmRequest } from '../src/engine'
import { waitingHooks } from '../src/engine/modes'
import { tideState } from '../src/engine/tides'
import { content } from './helpers'

// M10.24: three play modes, one setting, for the chronicler, the weave and
// the great lines (never for talks). Continue: it makes what it makes and the
// chronicle says so. Think: what a night starts that is new waits for the
// morning, as a choice in the world, and the rest lies a week. Direct: what
// it would do is first a proposal, accepted or rejected.

const DAY = 24 * 60
const at = (engine: Engine, day: number, hour: number, minute = 0) => engine.tick(GameClock.from(211, 9, day, hour, minute).minutes - engine.world.now)
const texts = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

/** A drowning in the fen by day, which the chronicler works out at once, with a request for the stranger in it. */
async function drowning(mode?: 'think' | 'direct'): Promise<Engine> {
  const engine = new Engine(content, { seed: 3, llm: new MockLlm('quest'), builder: true })
  at(engine, 15, 11)
  // Mirte happens to be at the mill when it happens, and Klaas is out (as in M3.1): she is the one who saw it.
  engine.state.npcs['npc_mirte']!.location = engine.state.npcs['npc_harmen']!.location
  if (engine.state.npcs['npc_klaas']!.location === engine.state.npcs['npc_harmen']!.location) engine.state.npcs['npc_klaas']!.location = 'loc_molenend_lane'
  if (mode) engine.setPlayMode(mode)
  await engine.handle('@kill harmen drowned in the Blackmere')
  await engine.runChronicler()
  return engine
}

const fromChronicler = (engine: Engine) => engine.state.requests.filter((r) => r.source === 'chronicler')

describe('M10.24: play modes', () => {
  it('continue: the request comes at once, as before', async () => {
    const engine = await drowning()
    expect(fromChronicler(engine)).toHaveLength(1)
    expect(engine.state.modes?.hooks ?? []).toEqual([])
  })

  it('think: the new request waits and comes as a choice in the world; taken, it is asked; the log plays back to the same', async () => {
    const engine = await drowning('think')
    expect(fromChronicler(engine)).toHaveLength(0)
    const [hook] = waitingHooks(engine.world)
    expect(hook!.label).toMatch(/wants a word with you: Word to /)
    // The rest of the round went on: the lore of the drowning is there.
    expect(engine.state.chronicle!.lore.length).toBeGreaterThan(0)
    const shown = texts(await engine.handle('look'))
    expect(shown).toMatch(/The morning brings something new\. Take it up, or let it lie a week:\n {2}1\. .*wants a word with you: Word to .*\n {2}2\. Let it all lie for now/)
    // Once: not again at the next step.
    expect(texts(await engine.handle('look'))).not.toMatch(/The morning brings/)
    await engine.handle('hooks')
    expect(texts(await engine.handle('1'))).toMatch(/will be glad to see you: "Would you look in on /)
    expect(fromChronicler(engine)).toHaveLength(1)
    expect(waitingHooks(engine.world)).toEqual([])
    const replayed = await Engine.replay(content, 3, engine.save().log)
    expect(replayed.state.requests).toEqual(engine.state.requests)
    expect(replayed.state.playMode).toBe('think')
  })

  it('think: a hook not taken lies a week, then it is gone', async () => {
    const engine = await drowning('think')
    engine.tick(6 * DAY)
    expect(waitingHooks(engine.world)).toHaveLength(1)
    engine.tick(2 * DAY)
    expect(waitingHooks(engine.world)).toEqual([])
    expect(texts(await engine.handle('hooks'))).toMatch(/Nothing new is waiting for you/)
  })

  it('direct: what the chronicler would do is a proposal; accepted it happens, rejected the rules do it', async () => {
    const accepted = await drowning('direct')
    expect(fromChronicler(accepted)).toHaveLength(0)
    expect(accepted.state.chronicle!.pending).toEqual([])
    const listed = texts(await accepted.handle('proposals'))
    expect(listed).toMatch(/The chronicler proposes \(ACCEPT or REJECT, the first first\):\nThe night round \(proposal_1\):/)
    expect(listed).toMatch(/\+ request of .*: Word to /)
    expect(listed).toMatch(/\+ lore: The Tale of/)
    expect(texts(await accepted.handle('accept'))).toMatch(/Done as proposed/)
    expect(fromChronicler(accepted)).toHaveLength(1)
    const rejected = await drowning('direct')
    expect(texts(await rejected.handle('reject'))).toMatch(/the world takes its own course/)
    expect(fromChronicler(rejected)).toHaveLength(0)
    expect(rejected.state.chronicle!.lore.every((l) => l.by === 'template')).toBe(true)
    const replayed = await Engine.replay(content, 3, accepted.save().log)
    expect(replayed.state.requests).toEqual(accepted.state.requests)
  })

  it("direct: the month's judgement of the great lines waits for the player too", async () => {
    const engine = new Engine(content, { seed: 3, llm: new MockLlm('good') })
    engine.start()
    engine.setPlayMode('direct')
    const p = new GameClock(engine.world.now).parts
    const start = engine.world.now - (engine.world.now % DAY)
    engine.tick(start + ((p.month === 13 ? 5 : 30) - p.day + 1) * DAY + 3 * 60 - engine.world.now)
    tideState(engine.world, 'great_flood').pressure = 60
    engine.tick(65)
    await engine.runModels()
    expect(tideState(engine.world, 'great_flood').stage).toBe('calm')
    const judgement = engine.state.modes!.proposals.find((x) => x.kind === 'tides')!
    expect(judgement.lines.join('\n')).toMatch(/great flood: threat\. The signs have been gathering all month\./i)
    await engine.handle(`accept ${judgement.id}`)
    expect(tideState(engine.world, 'great_flood').stage).toBe('threat')
  }, 120_000)

  it("follows the player's setting through the model client, and keeps each change in the log", async () => {
    const mock = new MockLlm('quest')
    let mode: 'continue' | 'direct' = 'direct'
    const llm: LlmClient = { complete: (r: LlmRequest) => mock.complete(r), playMode: () => mode }
    const engine = new Engine(content, { seed: 3, llm, builder: true })
    at(engine, 15, 11)
    engine.state.npcs['npc_mirte']!.location = engine.state.npcs['npc_harmen']!.location
    await engine.handle('@kill harmen drowned in the Blackmere')
    await engine.runModels()
    expect(engine.state.playMode).toBe('direct')
    expect(engine.state.modes!.proposals).toHaveLength(1)
    mode = 'continue'
    await engine.runModels()
    expect(engine.state.playMode).toBe('continue')
    expect(engine.save().log.filter((e) => e.k === 'mode').map((e) => (e as { v: string }).v)).toEqual(['direct', 'continue'])
  })
})
