import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type LlmClient, type LlmRequest } from '../src/engine'
import { askedOfStranger } from '../src/engine/dialogue/aftertalk'
import { applyEffect, attitude } from '../src/engine/dialogue/relations'
import { decide, takeHook } from '../src/engine/modes'
import { startQuest, type QuestHost } from '../src/engine/quests/engine'
import { content } from './helpers'

// M10.30 (7): the night round makes a quest in play. Someone asked the
// stranger to do something (Bram's log: Ilyan and the recordings), no quest
// or request of theirs holds it, and their region has room: after the night
// round one call writes one quest in the form of the step Stories, with what
// each person knows per stage and what it keeps hidden. At most one a night.
// Continue: at once, and the asker asks when next spoken to. Think: a hook in
// the morning. Direct: a proposal.

const DAY = 24 * 60
const said = (outs: { text: string }[]) => outs.map((o) => o.text).join('\n')

/** The mock model, keeping every request; Harmen, spoken to, asks the stranger to look at his sails. */
function recording(): LlmClient & { calls: LlmRequest[] } {
  const mock = new MockLlm('good')
  const calls: LlmRequest[] = []
  const asks = JSON.stringify({ reply: 'The storm took my sails. Could you go and look at them for me?', names: [], mentioned_topics: [], effects: [], memory_note: 'I asked the stranger to look at my sails; the storm tore them.', ends_conversation: false, keep_talking: 'no' })
  return {
    calls,
    complete: async (r) => {
      calls.push(r)
      if (r.schemaName === 'npc_reply') return { text: asks, provider: 'mock', model: 'mock-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
      return mock.complete(r)
    },
  }
}

/** Harmen asks the stranger, in a talk, to look at his sails; then the night comes. */
async function askedAndNight(mode?: 'think' | 'direct', seed = 3) {
  const llm = recording()
  const engine = new Engine(content, { seed, builder: true, llm })
  if (mode) engine.setPlayMode(mode)
  const world = engine.world
  await engine.handle('@goto loc_molenend_mill')
  await engine.handle('@bring harmen')
  await engine.handle('talk harmen')
  await engine.handle('What happened to the mill?')
  await engine.handle('bye')
  const asked = Object.values(world.state.news!.facts).find((f) => f.kind === 'asked_stranger')!
  engine.tick(((4 * 60 - (world.now % DAY)) + DAY) % DAY || DAY)
  await engine.runModels()
  return { engine, llm, asked }
}

describe('M10.30 (7): a quest made in play', () => {
  it('makes one quest of the ask after the night round, from what was said, and Harmen asks it when next spoken to', async () => {
    const { engine, llm, asked } = await askedAndNight()
    const request = llm.calls.find((c) => c.schemaName === 'night_quest')!
    expect(request.prompt).toContain(`THE ASKER: p1. ${asked.text.precise}`)
    expect(request.prompt).toMatch(/WHAT WAS SAID[^\n]*\n {2}Harmen \([^)]+\): I asked the stranger to look at my sails/)
    // The world's own truth goes with the rules, never the whole world guide.
    expect(request.system).toContain("THE WORLD'S OWN TRUTH")
    expect(request.system).not.toMatch(/STEP: SIGNALS/)
    const made = engine.state.made!.quests
    expect(made).toHaveLength(1)
    const quest = engine.content.quests.get(made[0]!.id)!
    expect(quest).toMatchObject({ name: 'What Harmen Asked', givers: ['npc_harmen'], starts: { talk: ['npc_harmen'] } })
    expect(quest.stages![0]).toMatchObject({ goal: 'Look round where it happened.', knows: { npc_harmen: 'Harmen knows what they asked, and no more.' } })
    expect(quest.truths?.[0]?.from).toBe('s2')
    // Harmen asks it the next time the stranger speaks to him.
    Object.assign(engine.state.npcs['npc_harmen']!, { location: engine.state.player.location, activity: 'standing about', busyUntil: engine.world.now + 600, plan: [] })
    // Harmen counts every stuiver: he asks once he is not wary of the stranger.
    applyEffect(engine.world, 'npc_harmen', 'affinity', 40)
    expect(attitude(engine.world, 'npc_harmen').band).not.toMatch(/Wary|Unfriendly|Hostile/)
    expect(said(await engine.handle('talk harmen'))).toMatch(/You said you would help\. Go and look/)
    expect(engine.state.questlog?.[made[0]!.id]).toBeDefined()
    // Once a night, and never twice for the same ask.
    await engine.runModels()
    expect(llm.calls.filter((c) => c.schemaName === 'night_quest')).toHaveLength(1)
    // A replay makes the same quest without the model.
    const replayed = await Engine.replay(content, 3, engine.save().log)
    expect(replayed.state.made?.quests.map((q) => q.id)).toEqual(made.map((q) => q.id))
  }, 60_000)

  it('think: the quest waits as a hook and comes into the world when taken up; direct: it waits as a proposal', async () => {
    const think = (await askedAndNight('think')).engine
    const made = think.state.made!.quests[0]!
    expect(made.held).toBe(true)
    expect(think.content.quests.has(made.id)).toBe(false)
    const hook = think.state.modes!.hooks.find((h) => h.made === made.id)!
    expect(hook.label).toBe('Harmen wants a word with you: What Harmen Asked')
    expect(said(takeHook(think.world, hook.id))).toMatch(/Harmen will be glad to see you: "You said you would help/)
    expect(think.content.quests.has(made.id)).toBe(true)

    const direct = (await askedAndNight('direct')).engine
    expect(direct.state.made?.quests ?? []).toHaveLength(0)
    const proposal = direct.state.modes!.proposals.find((p) => p.kind === 'made')!
    expect(proposal.lines[0]).toBe('+ a matter of Harmen: What Harmen Asked. "You said you would help. Go and look, and tell me what you find."')
    decide(direct.world, true, proposal.id)
    expect(direct.content.quests.has(direct.state.made!.quests[0]!.id)).toBe(true)
  }, 60_000)

  it('makes none while the region has its fill, nor for someone whose own quest is running', async () => {
    const llm = recording()
    const engine = new Engine(content, { seed: 3, builder: true, llm })
    const host = (engine as unknown as { questHost: QuestHost }).questHost
    startQuest(engine.world, host, 'flour_for_veenhoek')
    startQuest(engine.world, host, 'the_honest_scale')
    askedOfStranger(engine.world, 'npc_harmen', 'Could you go and look at my sails?')
    // Mirte gives flour_for_veenhoek: her ask belongs to it.
    askedOfStranger(engine.world, 'npc_mirte', 'Could you bring me flour from Waagdam?')
    engine.tick(((4 * 60 - (engine.world.now % DAY)) + DAY) % DAY || DAY)
    await engine.runModels()
    expect(llm.calls.filter((c) => c.schemaName === 'night_quest')).toHaveLength(0)
    expect(engine.state.made?.quests ?? []).toHaveLength(0)
  }, 60_000)
})
