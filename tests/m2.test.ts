import { describe, expect, it } from 'vitest'
import { calendarOf, Engine, MockLlm, parseReply, runSituation, SITUATIONS, soundsLikeSpeech, timeGreeting, unknownNames, vocabularyOf, wordCount, WORLD_FRAME, type LlmClient, type LlmRejection, type MockMode } from '../src/engine'
import { content, newEngine } from './helpers'

// Milestone M2 (docs/ROADMAP.md): talking with NPCs, with the mock model only.

const speechOf = (outputs: { kind: string; text: string }[]) => outputs.filter((o) => o.kind === 'speech').map((o) => o.text)
const quoted = (text: string) => [...text.matchAll(/"([^"]*)"/g)].map((m) => m[1]!).join(' ')

async function talkTo(engine: Engine, npc: string): Promise<void> {
  engine.state.player.location = engine.state.npcs[npc]!.location
  await engine.handle(`talk ${content.npcs.get(npc)!.name.split(' ')[0]}`)
}

describe('M2: the fixed set of 50 conversation situations', () => {
  it('has 50 situations', () => {
    expect(SITUATIONS).toHaveLength(50)
  })

  it('gives valid schema, no knowledge leak and the right length in every situation', async () => {
    for (const situation of SITUATIONS) {
      const run = await runSituation(content, situation, new MockLlm('good'))
      if (situation.noCall) {
        expect(run.requests, situation.id).toHaveLength(0)
        continue
      }
      expect(run.requests.length, situation.id).toBeGreaterThan(0)
      for (const [index, text] of run.replies.entries()) {
        const reply = parseReply(text)
        expect(reply, `${situation.id}: schema`).toBeDefined()
        const schema = run.requests[index]!.schema as { properties: { mentioned_topics: { items: { enum: string[] } } } }
        for (const topic of reply!.mentioned_topics) expect(schema.properties.mentioned_topics.items.enum, `${situation.id}: topic ${topic}`).toContain(topic)
        const limit = run.requests[index]!.meta!['wordLimit'] as number
        expect(wordCount(quoted(reply!.reply)), `${situation.id}: length`).toBeLessThanOrEqual(limit)
      }
      for (const line of speechOf(run.outputs)) expect(line, situation.id).not.toMatch(/Weeping Stone/)
    }
    // Fifty games in a row: under a full parallel run this takes more than the default five seconds.
  }, 30_000)

  it('puts only what the NPC knows in the prompt, at the level of its roll', async () => {
    const run = await runSituation(content, SITUATIONS.find((s) => s.id === 'mirte_far')!, new MockLlm('good'))
    const [stavermouth, stone] = run.requests
    expect(stavermouth!.prompt).toMatch(/stavermouth \(level \d\): Stavermouth is a silting port[^\n]*Stavermouth lies north/)
    expect(stone!.prompt).toMatch(/UNKNOWN to you: the Weeping Stone/)
  })
})

describe('M2: guardrails', () => {
  const leakyRun = async (mode: MockMode) => {
    const rejected: LlmRejection[] = []
    const mock = new MockLlm(mode)
    const client: LlmClient = { complete: (request) => mock.complete(request), report: (r) => rejected.push(r) }
    const run = await runSituation(content, SITUATIONS.find((s) => s.id === 'mirte_local')!, client)
    return { run, rejected, mock }
  }

  it('throws away a reply that names a place the NPC cannot know, and answers with a template', async () => {
    const { run, rejected } = await leakyRun('leak')
    expect(speechOf(run.outputs).join(' ')).not.toMatch(/Weeping Stone/)
    expect(rejected.map((r) => r.reason)).toContain('leak')
    expect(run.requests).toHaveLength(2)
  })

  it('throws away words from outside the world', async () => {
    const { run, rejected } = await leakyRun('anachronism')
    expect(speechOf(run.outputs).join(' ')).not.toMatch(/\bphone\b/)
    expect(rejected.map((r) => r.reason)).toContain('anachronism')
  })

  it('throws away a reply that is not valid JSON', async () => {
    const { run, rejected } = await leakyRun('invalid')
    expect(speechOf(run.outputs).join(' ')).not.toMatch(/not in JSON/)
    expect(rejected.map((r) => r.reason)).toEqual(['schema', 'schema'])
  })

  it('throws away a reply that makes up a person', async () => {
    const { run, rejected } = await leakyRun('invent')
    expect(speechOf(run.outputs).join(' ')).not.toMatch(/Oswin/)
    expect(rejected.map((r) => r.reason)).toEqual(['invented', 'invented'])
    expect(run.requests[1]!.prompt).toMatch(/NOTE: you used Oswin, which does not exist/)
  })

  it('knows made-up names from names of the world', () => {
    const { months, weekdays } = calendarOf(content.world)
    const vocabulary = vocabularyOf(content, WORLD_FRAME, months, weekdays)
    // "father" is a word of the world (Geesje's late father); the made-up name is not.
    expect(unknownNames('Wendela nods. "The vicar is Father Oswin. A good man."', vocabulary)).toEqual(['Oswin'])
    expect(unknownNames('She smiles. "Saint Brand keep you. Ask Mirte, or the Old Powers, or Lubbert in Waagdam on Maandag."', vocabulary)).toEqual([])
    expect(unknownNames('"I\'ll tell you. Aye, it was Herfstmaand when I\'d heard it."', vocabulary)).toEqual([])
    // A name the player used may come back: "I know no Oswin."
    expect(unknownNames('She frowns. "I know no Oswin."', vocabulary, vocabularyOf('Do you know Oswin?'))).toEqual([])
  })

  it('trims a reply that runs too long', async () => {
    const { run } = await leakyRun('long')
    const answer = speechOf(run.outputs)[1]!
    expect(wordCount(quoted(answer))).toBeLessThanOrEqual(run.requests[0]!.meta!['wordLimit'] as number)
  })

  it('answers an injection attempt with a template, without calling the model', async () => {
    for (const situation of SITUATIONS.filter((s) => s.noCall)) {
      const mock = new MockLlm('good')
      const run = await runSituation(content, situation, mock)
      expect(mock.calls, situation.id).toHaveLength(0)
      expect(speechOf(run.outputs).join(' '), situation.id).toMatch(/strange way of talking/)
    }
  })
})

describe('M2: without a connection', () => {
  it('stays playable with fallback texts when every call fails', async () => {
    const engine = new Engine(content, { seed: 3, llm: new MockLlm('throw') })
    await talkTo(engine, 'npc_mirte')
    for (const line of ['What happened to the mill?', '1', '3', 'ask about the storm', 'where is waagdam']) {
      const outputs = await engine.handle(line)
      expect(speechOf(outputs).length, line).toBeGreaterThan(0)
    }
    await engine.handle('bye')
    const look = await engine.handle('look')
    expect(look[0]!.text).toMatch(/Bakery/)
  })

  it('stays playable with no model at all', async () => {
    const engine = newEngine(4)
    await talkTo(engine, 'npc_harmen')
    const outputs = await engine.handle('What happened to the mill?')
    expect(speechOf(outputs)[0]).toMatch(/Harmen/)
  })
})

describe('M2: talking', () => {
  it('reads sentences that start with a command word as speech', () => {
    expect(soundsLikeSpeech('tell', 'Tell me the story of the Haakman.')).toBe(true)
    expect(soundsLikeSpeech('where', 'Waar kan ik hier brood kopen?')).toBe(true)
    expect(soundsLikeSpeech('wait', 'Wait, what?')).toBe(true)
    expect(soundsLikeSpeech('give', 'Give me a loaf.')).toBe(true)
    expect(soundsLikeSpeech('tell', 'tell mirte about the storm')).toBe(false)
    expect(soundsLikeSpeech('ask', 'ask about the mill')).toBe(false)
    expect(soundsLikeSpeech('where', 'where is waagdam')).toBe(false)
    expect(soundsLikeSpeech('where', 'waar is de molen?')).toBe(false)
    expect(soundsLikeSpeech('wait', 'wait')).toBe(false)
  })

  it('lets the game, not the model, decide whether someone comes along', async () => {
    const run = await runSituation(content, SITUATIONS.find((s) => s.id === 'wendela_recruit')!, new MockLlm('good'))
    const [recruit, name] = run.requests
    expect(recruit!.meta!['act']).toBe('Recruit')
    expect(recruit!.prompt).toMatch(/DECISION \(made by the game, follow it\): You will not come along\./)
    expect(recruit!.prompt).toMatch(/hardly know this stranger/)
    expect(recruit!.prompt).toMatch(/deep water frighten/)
    expect(name!.prompt).not.toMatch(/DECISION/)
    expect(recruit!.system).toMatch(/Never agree to come along/)
  })

  it('tells the model the people who matter to the talk by name, so it has no need to make people up', async () => {
    const run = await runSituation(content, SITUATIONS.find((s) => s.id === 'wendela_recruit')!, new MockLlm('good'))
    // Since M9.3 in the changing part, and only those who belong to the conversation: at most twelve.
    const people = run.requests[0]!.prompt.split('\n').find((line) => line.startsWith('PEOPLE YOU KNOW:'))!
    expect(people).not.toContain('Sister Wendela')
    expect(people.split(', ').length).toBeLessThanOrEqual(12)
    expect(run.requests[0]!.system).not.toContain('PEOPLE YOU KNOW:')
    expect(run.requests[0]!.system).toContain('Veenhoek has no priest of its own')
  })

  it("lets only Wouter tell his gran's story as his own; others retell it", async () => {
    const aaltje = await runSituation(content, SITUATIONS.find((s) => s.id === 'aaltje_story')!, new MockLlm('good'))
    expect(aaltje.requests[0]!.prompt).toMatch(/STORY as Wouter the eel-fisher tells it\. Retell it in your own words; the people in it are Wouter the eel-fisher's family, not yours:/)
    expect(speechOf(aaltje.outputs).join(' ')).not.toMatch(/My gran/)
    const wouter = await runSituation(content, SITUATIONS.find((s) => s.id === 'wouter_story')!, new MockLlm('good'))
    expect(wouter.requests[0]!.prompt).toMatch(/STORY you may tell, in your own words:\n  My gran fished the Blackmere/)
  })

  it('asks for the story when the player says "Tell me the story of ..."', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 5, llm: mock })
    await talkTo(engine, 'npc_mirte')
    await engine.handle('Tell me the story of the Haakman.')
    expect(mock.calls.at(-1)!.meta!['act']).toBe('AskStory')
  })

  it('names people by their first name, and greets by the time of day', async () => {
    const engine = newEngine(6)
    engine.state.player.location = engine.state.npcs['npc_aaltje']!.location
    const outputs = await engine.handle('talk aaltje')
    expect(speechOf(outputs)[0]).toMatch(/^Aaltje /)
    expect(timeGreeting(7 * 60)).toBe('Morning.')
    expect(timeGreeting(19 * 60)).toBe('Evening.')
  })

  it('keeps the NPC in place while you talk', async () => {
    const engine = newEngine(7)
    await talkTo(engine, 'npc_mirte')
    const where = engine.state.npcs['npc_mirte']!.location
    engine.tick(180)
    expect(engine.state.npcs['npc_mirte']!.location).toBe(where)
    expect(engine.status().talk?.call).toBe('Mirte')
  })

  it('replays a conversation from the log, model replies included', async () => {
    const engine = new Engine(content, { seed: 8, llm: new MockLlm('good') })
    await engine.handle('north')
    await engine.handle('east')
    await engine.handle('talk mirte')
    await engine.handle('What happened to the mill?')
    await engine.handle('1')
    await engine.handle('bye')
    engine.tick(30)
    const replayed = await Engine.replay(content, 8, engine.save().log)
    expect(replayed.state).toEqual(engine.state)
  })
})
