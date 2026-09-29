import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildInput, draftRequest, Engine, lineDiff, loadContent, MockLlm, readVoice, saveVoice, voiceRequest, voiceYaml, type ContentFile, type LlmClient, type LlmRejection, type LlmRequest } from '../src/engine'
import { devView } from '../src/engine/dev'
import { systemPrompt, turnPrompt } from '../src/engine/dialogue/prompt'
import { characterOfRun, runSituation, SITUATIONS } from '../src/engine/dialogue/testset'
import { characterChecks, characterScore, fixNotHere, groupOf, strayNumbers, talkSeed, voiceLines } from '../src/engine/dialogue/voice'
import { loadContentFromDir, readContentFiles } from '../src/node/content'
import { content } from './helpers'

// Milestone M10.10 (docs/ROADMAP.md): in character. A voice kit per world
// (oaths, sayings, address, time, what is not here), a VOICE block that keeps
// sayings rare (Bram: character is not a trick of sayings), a guard per
// world, numbers from the engine, and a character score per model.

const root = join(import.meta.dirname, '../content')
const isle = await loadContentFromDir(root, 'isle')
const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

function stay(engine: Engine, npcId: string): void {
  const s = engine.state.npcs[npcId]!
  s.location = engine.state.player.location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + 600
  s.plan = []
  s.note = undefined
}

/** A model that says what it is told, and keeps what the game reported. */
function scripted(...replies: string[]): LlmClient & { reports: LlmRejection[]; calls: LlmRequest[] } {
  let i = 0
  const reports: LlmRejection[] = []
  const calls: LlmRequest[] = []
  return {
    reports,
    calls,
    complete: async (request) => {
      calls.push(request)
      const reply = replies[Math.min(i++, replies.length - 1)]!
      const text = JSON.stringify({ act: 'SmallTalk', reply, names: [], mentioned_topics: [], effects: [], memory_note: 'The stranger talked to me.', ends_conversation: false, keep_talking: 'no' })
      return { text, provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
    report: (r) => reports.push(r),
  }
}

async function talkWith(llm: LlmClient, npc = 'npc_mirte', line = 'How is the bread today?', world = content) {
  const engine = new Engine(world, { seed: 4, llm })
  stay(engine, npc)
  await engine.handle(`talk ${world.npcs.get(npc)!.name.split(' ')[0]!.toLowerCase()}`)
  const out = said(await engine.handle(line))
  return { engine, out }
}

describe('M10.10: a voice kit per world', () => {
  it('both worlds have one, and it must fit the world', async () => {
    expect(content.voice?.groups.map((g) => g.id)).toEqual(['fen', 'town', 'cloister', 'counts_men'])
    expect(isle.voice?.oaths['tidemother']).toContain('salt and tide')
    const files = await readContentFiles(root, 'base')
    const wrong = files.map((f) => (f.path === 'base/data/voice.yaml' ? { ...f, text: f.text.replace('    lantern: [', '    candles: [').replace('default_group: fen', 'default_group: nobody') } : f))
    expect(() => loadContent(wrong)).toThrow(/voice\.oaths: unknown faith candles[\s\S]*voice\.default_group: nobody is no group/)
  })

  it('a speaker talks like their trade, their village, or their own voice', () => {
    const engine = new Engine(content, { seed: 1 })
    expect(groupOf(engine.world, 'npc_everhard')?.id).toBe('counts_men')
    expect(groupOf(engine.world, 'npc_dirck')?.id).toBe('town')
    expect(groupOf(engine.world, 'npc_mirte')?.id).toBe('fen')
    // His own voice in the content: a pedlar of the Goose who talks like Waagdam.
    expect(groupOf(engine.world, 'npc_kobus')?.id).toBe('town')
    expect(groupOf(new Engine(isle, { seed: 1 }).world, 'npc_tamsin')?.id).toBe('heights')
  })
})

describe('M10.10: character is not a trick of sayings', () => {
  it('a saying goes with some talks only, as one that may be used once, and none after one was used', () => {
    const engine = new Engine(content, { seed: 1 })
    const block = (began: number, flourished = false) => voiceLines(engine.world, 'npc_mirte', talkSeed('npc_mirte', began), flourished)
    const talks = Array.from({ length: 60 }, (_, i) => block(i))
    const withSaying = talks.filter((lines) => lines.some((l) => /^VOICE: a saying/.test(l))).length
    expect(withSaying).toBeGreaterThan(5)
    expect(withSaying).toBeLessThan(35)
    for (const lines of talks) {
      // At most four lines in the prompt, and never more than one saying.
      expect(lines.length).toBeLessThanOrEqual(4)
      expect(lines.join(' ').match(/"[^"]+"/g)?.filter((q) => /[.!]"$/.test(q)).length ?? 0).toBeLessThanOrEqual(1)
    }
    const after = block(talks.findIndex((lines) => lines.some((l) => /^VOICE: a saying/.test(l))), true)
    expect(after[0]).toBe('VOICE: you used a saying or an oath in this talk already; no more of either.')
  })

  it('shows character in what someone dares and steers away from, and says a plain answer is often best', () => {
    const engine = new Engine(content, { seed: 1 })
    const mirte = systemPrompt(engine.world, 'npc_mirte')
    expect(mirte).toMatch(/Most replies are plain \("No, not today"\)/)
    expect(mirte).toMatch(/What you dare: You speak your mind to your equals/)
    expect(mirte).toMatch(/What others notice in you, which you do not explain: She tenses up whenever Harmen's name comes up\./)
    // The secret itself stays out.
    expect(mirte).not.toMatch(/since the wet spring/)
    expect(mirte).toMatch(/If you swear at all, and that is rare: You swear only by your own faith: "Saint Brand's light"/)
  })

  it('after a saying in a talk, the prompt asks for no more', async () => {
    const llm = scripted('Water always finds the weakest board, stranger.', 'Fresh this morning.')
    const { engine } = await talkWith(llm)
    expect(engine.state.talk?.flourished).toBe(true)
    await engine.handle('And the rye?')
    expect(llm.calls.at(-1)!.prompt).toMatch(/you used a saying or an oath in this talk already; no more of either/)
  })

  it('the prompt tells time, distance and money the world\'s way, and what is not here', () => {
    const engine = new Engine(content, { seed: 1 })
    engine.state.talk = { npc: 'npc_mirte', turnsLeft: 4, history: [], effects: 0, revealed: [], began: 0 }
    const prompt = turnPrompt(engine.world, { npcId: 'npc_mirte', act: 'SmallTalk', tier: 'short', attitude: { band: 'Neutral', score: 0 }, mood: 'calm', packet: { known: [], unknown: [] }, memories: [], history: [], playerText: 'Hello' } as never)
    expect(prompt).toMatch(/If you call the stranger anything, it is "(stranger|traveller)"/)
    expect(prompt).toMatch(/When it comes up: time .*; money in guilders, stuivers, duiten\./)
    expect(prompt).toMatch(/Not here: o'clock \(say bells\), potatoes \(say turnips\), potato \(say turnip\), tobacco/)
    expect(systemPrompt(engine.world, 'npc_mirte')).toMatch(/Numbers, ages, prices, dates and distances only as given, said as given/)
  })
})

describe('M10.10: the guard reads the world', () => {
  it('puts our oaths and words right in place, and says so in the AI log', async () => {
    const llm = scripted('Okay, by Christ, potatoes are dear on Sunday.')
    const { out, engine } = await talkWith(llm)
    // A name the speaker knows is bracketed the first time it comes up (M10.29).
    expect(out).toMatch(/Aye, \[?Saint Brand\]?'s light, turnips are dear on \[?Rustdag\]?\./)
    expect(llm.reports).toEqual(
      expect.arrayContaining([
        { reason: 'oath', fixed: 'our oath put right' },
        { reason: 'not_here', fixed: 'Okay > aye' },
        { reason: 'not_here', fixed: 'potatoes > turnips' },
        { reason: 'not_here', fixed: 'Sunday > Rustdag' },
      ]),
    )
    expect(engine.world.guard).toMatchObject({ oath: 1, not_here: 3 })
    // Live in the dev menu.
    expect(devView(engine, 'background').background!.guard).toEqual(['oaths of our world put right: 1', 'words that are not here put right: 3'])
  })

  it('asks again for a word with nothing to stand for it, then the stock line stands in', async () => {
    const llm = scripted('Tobacco would calm my nerves.', 'Tobacco, that is what I want.')
    const { out } = await talkWith(llm)
    expect(out).not.toMatch(/Tobacco/)
    expect(llm.reports.map((r) => r.reason)).toEqual(['anachronism', 'anachronism'])
    expect(llm.calls[1]!.prompt).toMatch(/NOTE: your last reply used "tobacco", which does not exist in this world/)
  })

  it('Skerrow keeps its own calendar and coins', () => {
    const engine = new Engine(isle, { seed: 1 })
    expect(fixNotHere(engine.world, 'Come back on Monday with ten dollars. We may march in May.').text).toBe('Come back on Moonday with ten silver pieces. We may march in May.')
  })

  it('notes a number nobody gave, and changes nothing', async () => {
    const llm = scripted('The loaves are 47 duiten this week.')
    const { out } = await talkWith(llm)
    expect(out).toMatch(/47 duiten/)
    expect(llm.reports).toContainEqual({ reason: 'number', fixed: '47 was not given' })
    expect(strayNumbers('Two loaves and one cake; four days ago, aged 44.', 'She is aged 44. It was four days ago.')).toEqual([])
    expect(strayNumbers('It cost twelve guilders.', 'A loaf costs 3 duiten.')).toEqual(['twelve'])
  })

  it('a world without a kit has no list of words that do not belong, only the fixed core (M10.17)', async () => {
    const plain = { ...content, voice: undefined }
    // A computer is no anachronism in every world: without a kit it stands.
    const llm = scripted('The computer says the bread is fresh.')
    const { out } = await talkWith(llm, 'npc_mirte', 'How is the bread today?', plain)
    expect(out).toMatch(/computer says/)
    expect(llm.reports).toEqual([])
    // A model speaking of models is refused in every world.
    const core = scripted('As ChatGPT I bake bread.', 'Fresh bread.')
    const again = await talkWith(core, 'npc_mirte', 'How is the bread today?', plain)
    expect(again.out).toMatch(/Fresh \[?bread\]?\./)
  })
})

describe('M10.10: a character score', () => {
  it('scores a reply by the rules: oaths, words, names, own people, numbers, restraint', () => {
    const plain = characterChecks(content, 'No, not today.', 'KNOWLEDGE: nothing.')
    expect(Object.values(plain).every(Boolean)).toBe(true)
    const bad = characterChecks(content, 'By Christ, the daughter of Jan and Grietje bought 12 potatoes. What the fen takes, it keeps. Water always finds the weakest board.', 'KNOWLEDGE: nothing.', 'invented')
    // Refused by the guard counts against it too (M10.19); it stays within the hard limits.
    expect(bad).toEqual({ oath: false, words: false, names: false, ownPeople: false, numbers: false, restraint: false, kept: false, limits: true })
    expect(characterScore([plain, bad])).toBe(9 / 16)
  })

  it('the test set scores a run through the game', async () => {
    const situation = SITUATIONS.find((s) => s.id === 'mirte_local')!
    const run = await runSituation(content, situation, new MockLlm('good'))
    const checks = characterOfRun(content, run)
    expect(checks.length).toBeGreaterThan(0)
    expect(characterScore(checks)).toBe(1)
  })
})

describe('M10.10: the kit in the editor, the chronicler and the writing aid', () => {
  it('opens the kit as YAML, and writes one change back leaving the rest of the file alone', async () => {
    const files = await readContentFiles(root, 'base')
    const kit = voiceYaml(files)
    expect(kit).toMatchObject({ file: 'base/data/voice.yaml', own: true })
    expect(kit.yaml).toMatch(/^oaths:/m)
    const result = saveVoice(files, kit.yaml.replace('- East, west, home is best.', '- East, west, home is best.\n  - A good neighbour is worth more than a far friend.'))
    expect(result.problems).toEqual([])
    const [change] = result.changes
    expect(change!.text).toMatch(/A good neighbour is worth more than a far friend\./)
    // The comments of the file stay, and only the new line is new.
    expect(change!.text).toMatch(/# Sayings of the whole Holleveen/)
    expect(lineDiff(change!.before!, change!.text).filter((l) => l.kind === '+' || l.kind === '-').map((l) => l.text)).toEqual(['    - A good neighbour is worth more than a far friend.'])
    expect(saveVoice(files, kit.yaml.replace('lantern:', 'candles:')).problems.join(' ')).toMatch(/unknown faith candles/)
  })

  it('a world without a kit gets one in data/voice.yaml, and the writing aid can propose it', async () => {
    const files = (await readContentFiles(root, 'isle')).filter((f) => !f.path.endsWith('voice.yaml'))
    expect(voiceYaml(files)).toMatchObject({ file: 'isle/data/voice.yaml', own: false, yaml: '' })
    const proposal = readVoice((await new MockLlm().complete(voiceRequest(files, ''))).text)
    expect(proposal.problems).toEqual([])
    const saved = saveVoice(files, proposal.yaml!)
    expect(saved.problems).toEqual([])
    expect(saved.changes[0]!.path).toBe('isle/data/voice.yaml')
    const next: ContentFile[] = [...files, { path: 'isle/data/voice.yaml', text: saved.changes[0]!.text }]
    expect(loadContent(next).voice?.not_here.map((n) => n.word)).toEqual(['potatoes', 'tobacco'])
  })

  it('the chronicler and the writing aid get the same voice', async () => {
    const engine = new Engine(content, { seed: 3, builder: true })
    await engine.handle('@kill harmen drowned in the Blackmere')
    const input = buildInput(engine.world, { id: 'x', lines: engine.state.chronicle!.lines.slice(-1).map((l) => l.id), why: 'night', t: engine.world.now } as never)
    expect(input.world).toMatch(/VOICE OF THIS WORLD\nPeople swear only by: "Saint Brand's light"/)
    const files = await readContentFiles(root, 'base')
    expect(draftRequest(files, 'a new pedlar').system).toMatch(/VOICE OF THIS WORLD/)
  })
})
