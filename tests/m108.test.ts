import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { personView, toldAge } from '../src/engine/acquaintance'
import { stockNotice } from '../src/engine/dialogue/conversation'
import { swearRight } from '../src/engine/dialogue/guard'
import { MockLlm } from '../src/engine/dialogue/mock'
import { systemPrompt } from '../src/engine/dialogue/prompt'
import type { LlmClient, LlmRequest } from '../src/engine/dialogue/llm'
import { ownWords } from '../src/engine/people'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

// Milestone M10.8 (docs/ROADMAP.md): what Bram found playing Veenhoek and
// Skerrow on 28 September 2026, the engine half: stock lines, what the
// stranger knows of people, talks that go on, the time a reply may take,
// the world's own oaths and people spoken of as one's own.

const isle = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')
const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

function stay(engine: Engine, npcId: string, location: string, minutes = 600): void {
  const s = engine.state.npcs[npcId]!
  s.location = location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + minutes
  s.plan = []
  s.note = undefined
}

describe('M10.8: stock lines that fit, and why they stood in', () => {
  it('a wish is nodded at, not shrugged at as a question', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    stay(engine, 'npc_gerrit', engine.state.player.location)
    await engine.handle('talk gerrit')
    const out = said(await engine.handle('I hope you can make the Count understand, good sir'))
    expect(out).not.toMatch(/Can't say I know/)
    expect(out).toMatch(/Gerrit (nods|grunts|makes a noise)/)
  })

  it('says what happened when the model gave nothing, and keeps it for the dev menu', () => {
    expect(stockNotice({ kind: 'timeout', message: 'the model took too long' }, 'Tamsin')).toBe("(The AI took too long; this is the game's own line from what Tamsin knows.)")
    expect(stockNotice({ kind: 'checks', message: 'x' }, 'Jan')).toMatch(/did not pass the checks/)
    expect(stockNotice({ kind: 'config', message: 'no API key for anthropic' }, 'Jan')).toMatch(/No AI: no API key for anthropic/)
  })

  it('asks for a reply within the time the player set, not six seconds', async () => {
    const seen: number[] = []
    const mock = new MockLlm('good')
    const client: LlmClient = {
      complete: async (r: LlmRequest) => {
        if (r.role === 'voice') seen.push(r.timeoutMs ?? Infinity)
        return mock.complete(r)
      },
      replyWithinMs: () => 15_000,
    }
    const engine = new Engine(content, { seed: 4, llm: client })
    stay(engine, 'npc_gerrit', engine.state.player.location)
    await engine.handle('talk gerrit')
    await engine.handle('"What is the weather doing?')
    expect(seen.length).toBeGreaterThan(0)
    expect(Math.max(...seen)).toBeGreaterThan(10_000)
    expect(Math.max(...seen)).toBeLessThanOrEqual(15_000)
  })

  it("marks the model's lines and the game's own apart, while a model is in play", async () => {
    const engine = new Engine(content, { seed: 4, llm: new MockLlm('good') })
    stay(engine, 'npc_gerrit', engine.state.player.location)
    const greeting = await engine.handle('talk gerrit')
    expect(greeting.find((o) => o.kind === 'speech')?.source).toBe('rules')
    // A question the rules cannot answer (M10.28: what they do is on the card, and the rules say it).
    const reply = await engine.handle('"What is the weather doing?')
    expect(reply.find((o) => o.kind === 'speech')?.source).toBe('model')
    const offline = new Engine(content, { seed: 4 })
    stay(offline, 'npc_gerrit', offline.state.player.location)
    expect((await offline.handle('talk gerrit')).find((o) => o.kind === 'speech')?.source).toBeUndefined()
  })
})

describe('M10.8: what the stranger knows of people', () => {
  it('everyone knows the name of the famous, the Count at least by name', () => {
    const engine = new Engine(content, { seed: 4 })
    const knowledge = (engine as unknown as { dialogue: { knowledge: { level(n: string, t: string): number } } }).dialogue.knowledge
    for (const id of ['npc_gerrit', 'npc_wouter', 'npc_kaatje', 'npc_teunis']) expect(knowledge.level(id, 'the_count')).toBeGreaterThanOrEqual(1)
  })

  it('the journal lists under People only who was met, seen or told of, by the name as told', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    stay(engine, 'npc_gerrit', engine.state.player.location)
    for (const c of ['talk gerrit', '2', 'bye']) await engine.handle(c)
    const people = engine.status().journal.people
    for (const p of people) {
      if (!engine.world.content.npcs.has(p.id)) continue
      const met = (engine.state.relations?.[p.id]?.familiarity ?? 0) > 0
      const seen = Boolean(engine.state.player.people?.[p.id]?.seen)
      const told = (engine.state.player.sources?.[p.id]?.length ?? 0) > 0
      expect(met || seen || told).toBe(true)
      // The whole name only for who the stranger talked with.
      if (!met) expect(p.name).not.toMatch(/ /)
    }
    expect(people.find((p) => p.id === 'npc_gerrit')?.name).toBe(engine.world.npc('npc_gerrit').name)
    expect(people.length).toBeLessThan(10)
  })

  it('a hidden trade shows its cover and a plain short name, until someone else tells it', async () => {
    const engine = new Engine(isle, { seed: 7, builder: true })
    stay(engine, 'npc_tamsin', engine.state.player.location)
    const talk = said(await engine.handle('talk tamsin'))
    expect(talk).toMatch(/You are talking with Old Tamsin\./)
    expect(personView(engine.world, 'npc_tamsin').work).toBe('an old woman who keeps goats')
    const self = said(await engine.handle('"What do you do?'))
    expect(self).not.toMatch(/hedge-witch/)
    await engine.handle('bye')
    stay(engine, 'npc_pip', engine.state.player.location)
    await engine.handle('talk pip')
    await engine.handle('ask about tamsin')
    expect(personView(engine.world, 'npc_tamsin').work).toBe('hedge-witch')
  })

  // Since M10.33 F a plain trade is known at first sight, as the head of the talk and the line Here: say it; only a hidden one waits.
  it('a plain trade is known at first sight, as the head of the talk says it', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    stay(engine, 'npc_gerrit', engine.state.player.location)
    engine.tick(15)
    expect(personView(engine.world, 'npc_gerrit').work).not.toBe('?')
  })

  it('the age, once told, is on the page of the person, for the card beside the talk', () => {
    const engine = new Engine(content, { seed: 4 })
    engine.state.player.journal!['npc_gerrit'] = engine.world.now
    toldAge(engine.world, 'npc_gerrit')
    expect(engine.page('npc_gerrit')?.person?.age).toEqual({ text: String(engine.world.npc('npc_gerrit').age), known: true })
  })
})

describe('M10.8: talks that go on while they are about something', () => {
  it('a talk with a quest between them goes on for ten turns', async () => {
    const engine = new Engine(isle, { seed: 7, builder: true })
    stay(engine, 'npc_tamsin', engine.state.player.location)
    await engine.handle('talk tamsin')
    for (let i = 0; i < 10; i++) await engine.handle(`"The wind is from the west today, turn ${i}.`)
    expect(engine.state.talk?.npc).toBe('npc_tamsin')
  })

  it('small talk with someone at work stops after four, and they say so a turn ahead', async () => {
    // Teunis at the horse mill: no quest of his, nothing to tell about the weather. (Gerrit would bring up the polder,
    // his quest would begin, and the talk would rightly go on.)
    const engine = new Engine(content, { seed: 4, builder: true })
    await engine.handle('@time 9')
    await engine.handle('@goto loc_waagdam_horse_mill')
    stay(engine, 'npc_teunis', 'loc_waagdam_horse_mill')
    engine.state.npcs['npc_teunis']!.activity = 'at work'
    await engine.handle('talk teunis')
    const lines: string[] = []
    for (let i = 0; i < 4; i++) lines.push(said(await engine.handle(`"Fine weather for it, turn ${i}.`)))
    expect(lines[2]).toMatch(/I must get back to my work, but go on\./)
    expect(engine.state.talk).toBeUndefined()
  })
})

describe('M10.8: a word that always does something', () => {
  it('LOOK at a place the stranger knows but cannot see says what they know and which way it lies', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    await engine.handle('@goto loc_towpath_w')
    engine.state.player.journal!['graafhaven'] = engine.world.now
    expect(said(await engine.handle('look graafhaven'))).toMatch(/Graafhaven lies west of here, about .+ on foot\./)
  })

  it('a quest begun by a talk waits for its subject, not the greeting', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    stay(engine, 'npc_gerrit', engine.state.player.location)
    expect(said(await engine.handle('talk gerrit'))).not.toMatch(/New quest: The Drainage Question/)
    expect(said(await engine.handle('ask about the drainage'))).toMatch(/New quest: The Drainage Question/)
  })
})

describe("M10.8: the world's own oaths, and one's own people", () => {
  it('nobody swears by Christ: the oath of the speaker\'s faith stands in', () => {
    expect(swearRight('"Christ, yes," Jan says.', ["Saint Brand's light"])).toBe(`"Saint Brand's light, yes," Jan says.`)
    expect(swearRight('"What the hell happened?"', ['by the Lantern'])).toBe('"What, by the Lantern, happened?"')
    const engine = new Engine(content, { seed: 4 })
    expect(systemPrompt(engine.world, 'npc_jan_visser')).toMatch(/You swear only by your own faith: "/)
    const skerrow = new Engine(isle, { seed: 4 })
    expect(systemPrompt(skerrow.world, 'npc_maren')).toMatch(/Tidemother keep us/)
  })

  it('speaks of their own people as their own, also without a model', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    expect(ownWords(engine.world, 'npc_jan_visser', 'Fenna Visser, fifteen, the daughter of Jan and Grietje, has been missing for four days.')).toBe('My daughter Fenna, fifteen, has been missing for four days.')
    stay(engine, 'npc_jan_visser', engine.state.player.location)
    await engine.handle('talk jan')
    const out = said(await engine.handle('ask about fenna'))
    expect(out).toMatch(/[Mm]y daughter \[?Fenna\]?, fifteen/)
    expect(out).not.toMatch(/the daughter of Jan/)
  })
})

describe('M10.8: weather with a memory, from the content', () => {
  it('moves by steps, so the sky holds a while, and a storm stays rare', () => {
    const engine = new Engine(content, { seed: 11 })
    const kinds: string[] = []
    for (let i = 0; i < 8 * 60; i++) {
      engine.tick(180)
      kinds.push(engine.state.weather!.kind)
    }
    const storms = kinds.filter((k) => k === 'storm').length / kinds.length
    expect(storms).toBeLessThan(0.1)
    // Runs, not draws: on average the sky stays more than one step.
    let changes = 0
    for (let i = 1; i < kinds.length; i++) if (kinds[i] !== kinds[i - 1]) changes++
    expect(kinds.length / Math.max(1, changes)).toBeGreaterThan(1.5)
    // The wind and the next step are known.
    expect(engine.state.weather!.wind).toBeDefined()
    expect(engine.state.weather!.next).toBeDefined()
  }, 60_000)

  it('an old save without wind or forecast plays on from the weather of that moment', () => {
    const engine = new Engine(content, { seed: 11 })
    engine.state.weather = { kind: 'fog', since: engine.world.now }
    engine.tick(6 * 60)
    expect(engine.state.weather!.next).toBeDefined()
  })

  it('LOOK SKY tells the wind, and what is coming to who can read it', async () => {
    const engine = new Engine(content, { seed: 11, builder: true })
    await engine.handle('create warden heathborn peat_cutter name=Tester')
    engine.tick(180)
    const out = said(await engine.handle('look sky'))
    expect(out).toMatch(/The wind: |The air is still\./)
    expect(out).toMatch(/You read the sky: /)
    const town = new Engine(content, { seed: 11, builder: true })
    town.tick(180)
    expect(said(await town.handle('look sky'))).toMatch(/What it will do next, you could not say\./)
  })

  it('Skerrow has its own sea weather', () => {
    expect(isle.world.weather?.prevailing).toBe('west')
    expect(isle.world.weather?.chances['winter']?.frost).toBeLessThan(content.world.weather?.chances['winter']?.frost ?? 1)
  })
})

describe('M10.8: the talk window reads the engine, and words that lead somewhere', () => {
  it('keeps every line of a talk, a second talk with the same person too, and the ended one for its window', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    stay(engine, 'npc_gerrit', engine.state.player.location)
    await engine.handle('talk gerrit')
    await engine.handle('2')
    const lines = engine.status().talk!.lines
    expect(lines[0]).toMatchObject({ kind: 'input', text: 'talk gerrit' })
    expect(lines.some((l) => l.kind === 'text' && /What's new around here\?/.test(l.text))).toBe(true)
    await engine.handle('bye')
    expect(engine.status().talk).toBeUndefined()
    expect(engine.status().lastTalk?.lines.some((l) => l.kind === 'input' && l.text === 'bye')).toBe(true)
    stay(engine, 'npc_gerrit', engine.state.player.location)
    await engine.handle('talk gerrit')
    expect(engine.status().talk!.lines[0]).toMatchObject({ kind: 'input', text: 'talk gerrit' })
    expect(engine.status().lastTalk).toBeUndefined()
  })

  it('a word in [brackets] is a link only when it leads somewhere', async () => {
    const engine = new Engine(content, { seed: 4, builder: true })
    const quay = said(await engine.handle('look'))
    // The Graafse Vaart is nowhere the stranger can follow yet: plain text.
    expect(quay).toMatch(/The Graafse Vaart runs east and west/)
    const green = said(await engine.handle('north'))
    // The bakery is an exit here: a link.
    expect(green).toMatch(/\[Bakery\]/)
  })
})
