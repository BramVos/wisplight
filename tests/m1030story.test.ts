import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, type Content, type LlmClient, type LlmRejection, type LlmRequest } from '../src/engine'
import { improvisable, improviseRequest, readImprovisation } from '../src/engine/improvise'
import { parseCommand } from '../src/engine/parser'
import { hiddenNamed, storyHere, storyLines } from '../src/engine/quests/knows'
import { checkQuests, questWarnings } from '../src/engine/quests/check'
import { loadContentFromDir } from '../src/node/content'
import { content } from './helpers'

const isleContent = await loadContentFromDir(join(import.meta.dirname, '../content'), 'isle')
const otherContent = await loadContentFromDir(join(import.meta.dirname, 'worlds'), 'other')

// M10.30 (2) and (3), from Bram's log of 29 September 2026: Niko, Tessa and an
// improvisation each told their own plot of the recordings. A stage says per
// person what they know of the story and may say (knows); that goes to their
// voice as all they know, and to an improvisation at a place of the story.
// What the story keeps hidden (truths) no reply and no improvisation names
// before its stage. The journal and QUESTS say where a quest stands and what
// to do now (goal).

const DAY = 24 * 60
const said = (outs: { text: string }[]) => outs.map((o) => o.text).join('\n')

/** A model that says what it is told, one reply a call, and keeps what was reported. */
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
      const text = JSON.stringify({ reply, names: [], mentioned_topics: [], effects: [], memory_note: 'The stranger asked after Fenna.', ends_conversation: false, keep_talking: 'no' })
      return { text, provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
    report: (r) => reports.push(r),
  }
}

/** Grietje at home and free, the stranger with her. */
function atGrietje(llm?: LlmClient): Engine {
  const engine = new Engine(content, { seed: 4, builder: true, ...(llm ? { llm } : {}) })
  engine.tick(((10 * 60 - (engine.world.now % DAY)) + DAY) % DAY)
  const s = engine.state.npcs['npc_grietje_visser']!
  Object.assign(s, { location: engine.state.player.location, activity: 'standing about', busyUntil: engine.world.now + 600, plan: [] })
  return engine
}

describe('M10.30 (2): what people know per stage', () => {
  it('gives the speaker their own line of the stage, before and after the quest begins, and none after it ends', () => {
    const engine = atGrietje()
    expect(storyLines(engine.world, 'npc_grietje_visser').join('\n')).toMatch(/THE STORY AS YOU KNOW IT[^\n]*\n {2}The Grey Cat on the Doorstep: Grietje knows Fenna went into the Kattenbroek/)
    // Someone without a line of this stage hears nothing of it.
    expect(storyLines(engine.world, 'npc_mirte')).toEqual([])
    engine.state.questlog = { grey_cat_on_the_doorstep: { stage: 'the_cat_is_fenna', started: 0, stageAt: 0, path: ['missing', 'the_cat_is_fenna'], done: [] } }
    expect(storyLines(engine.world, 'npc_grietje_visser').join('\n')).toMatch(/the grey cat is her Fenna/)
    engine.state.questlog.grey_cat_on_the_doorstep!.ended = engine.world.now
    expect(storyLines(engine.world, 'npc_grietje_visser')).toEqual([])
  })

  it('keeps a hidden truth out of every mouth until its stage, save what the game gave the speaker', () => {
    const engine = atGrietje()
    const world = engine.world
    expect(hiddenNamed(world, 'Aye, the cat is Fenna, I know it.', 'npc_grietje_visser')).toBe('The Grey Cat on the Doorstep')
    expect(hiddenNamed(world, 'Some say the widow turned the girl into a cat.')).toBe('The Grey Cat on the Doorstep')
    expect(hiddenNamed(world, 'That cat looks at me with her eyes.', 'npc_grietje_visser')).toBeUndefined()
    // The widow, once her secret is told, may say it; before, not even she.
    expect(hiddenNamed(world, 'The cat is Fenna, paying her debt in fur.', 'npc_kaatje')).toBeDefined()
    ;(engine.state.flags ??= {})['secret:npc_kaatje:fenna_lied'] = true
    expect(hiddenNamed(world, 'The cat is Fenna, paying her debt in fur.', 'npc_kaatje')).toBeUndefined()
    // What the game put in the talk counts as given; from its stage on, anyone may say it.
    expect(hiddenNamed(world, 'The cat is Fenna.', 'npc_mirte', 'KNOWLEDGE: the cat is Fenna, they say.')).toBeUndefined()
    engine.state.questlog = { grey_cat_on_the_doorstep: { stage: 'the_cat_is_fenna', started: 0, stageAt: 0, path: ['missing', 'the_cat_is_fenna'], done: [] } }
    expect(hiddenNamed(world, 'The cat is Fenna, poor lamb.', 'npc_mirte')).toBeUndefined()
  })

  it('sends the line to the voice and asks again when a reply names what the story keeps', async () => {
    const llm = scripted('The cat is Fenna. I know it in my bones.', 'I don\'t know what became of her. The fen keeps its own counsel.')
    const engine = atGrietje(llm)
    await engine.handle('talk grietje')
    const out = said(await engine.handle('What do you think happened to Fenna?'))
    expect(out).toMatch(/I don't know what became of her/)
    expect(out).not.toMatch(/The cat is Fenna/)
    expect(JSON.stringify(llm.calls[0])).toMatch(/THE STORY AS YOU KNOW IT/)
    expect(llm.reports.some((r) => r.reason === 'leak' && /keeps hidden/.test(r.detail ?? ''))).toBe(true)
  }, 30_000)

  it('gives an improvisation at a place of the story all that is known of it, and refuses one that names more', async () => {
    const quests = new Map(content.quests)
    const milk = quests.get('milk_for_the_kabouters')!
    quests.set(milk.id, {
      ...milk,
      stages: milk.stages!.map((s, i) => (i ? s : { ...s, knows: { npc_aaltje: 'Aaltje knows the kabouters want milk left at the oak, and nothing more.' } })),
      truths: [{ text: 'The kabouters took the Bakkers\' rings.', words: ['kabouters? (?:took|stole)'], when: [] }],
    })
    const world: Content = { ...content, quests }
    const engine = new Engine(world, { seed: 31, builder: true })
    engine.start()
    await engine.handle('@goto loc_kabouterberg')
    engine.state.player.inventory['milk'] = 2
    const imp = improvisable(engine.world, parseCommand('pour milk on the oak'))!
    expect(storyHere(engine.world, engine.state.player.location).join('\n')).toMatch(/THE STORY HERE[^\n]*\n {2}Milk for the Kabouters: Aaltje knows the kabouters want milk/i)
    expect(improviseRequest(engine.world, imp).prompt).toMatch(/THE STORY HERE/)
    const told = (narration: string) => readImprovisation(engine.world, imp, JSON.stringify({ narration, effect: { kind: 'nothing', id: '', delta: 0, title: '' }, spent: false }))
    expect(told('The milk soaks into the moss. Somewhere under the roots, something laughs.')).not.toHaveProperty('problem')
    expect(told('The milk soaks in, and you know at once the kabouters took the rings.')).toEqual({ problem: 'invented' })
  })

  it('refuses knows of nobody, a truth of an unknown stage or a bad pattern, and warns of a truth the journal gives away', () => {
    const quests = new Map(content.quests)
    const cat = quests.get('grey_cat_on_the_doorstep')!
    quests.set(cat.id, {
      ...cat,
      stages: cat.stages!.map((s, i) => (i ? s : { ...s, knows: { ...s.knows, npc_nobody: 'Nobody knows.' } })),
      truths: [
        { text: 'x', words: ['(unclosed'], from: 'the_cat_is_fenna', when: [] },
        { text: 'y', words: ['cat'], from: 'no_such_stage', when: [] },
        { text: 'The widow is behind it.', words: ['fen took her'], from: 'the_cat_is_fenna', when: [] },
      ],
    })
    const problems = checkQuests({ ...content, quests }).join('\n')
    expect(problems).toMatch(/grey_cat_on_the_doorstep\.missing\.knows: unknown NPC npc_nobody/)
    expect(problems).toMatch(/truths\.1: bad pattern \(unclosed/)
    expect(problems).toMatch(/truths\.2: unknown stage no_such_stage/)
    expect(questWarnings(content).join('\n')).not.toMatch(/truth/)
    // "Jan says the fen took her" is in the ask.
    expect(questWarnings({ ...content, quests }).join('\n')).toMatch(/grey_cat_on_the_doorstep: truth 3 \("The widow is behind it\."\) is in the ask/)
  })
})

describe('M10.30 (3): a quest shows where it stands and what to do now', () => {
  it('puts the goal on the page and in QUESTS, and finds the page by the quest\'s name', async () => {
    const engine = atGrietje()
    expect(said(await engine.handle('quests'))).toMatch(/You have taken nothing up yet/)
    await engine.handle('talk grietje')
    await engine.handle('bye')
    expect(engine.state.questlog?.['grey_cat_on_the_doorstep']).toBeDefined()
    expect(engine.page('quest_grey_cat_on_the_doorstep')!.lines).toContain('Now: Find out what happened to Fenna Visser.')
    const list = said(await engine.handle('quests'))
    expect(list).toMatch(/^Open:\n {2}The Grey Cat on the Doorstep: Fenna Visser is missing\.[^\n]* Now: Find out what happened to Fenna Visser\./)
    expect(said(await engine.handle('journal grey cat'))).toMatch(/^The Grey Cat on the Doorstep\nSo far:\n- Fenna Visser is missing/)
    expect(said(await engine.handle('help journal'))).toMatch(/quests \(what you took up/)
  }, 30_000)
})

describe('M10.30 (2), (3) in the other worlds', () => {
  it('Skerrow: the stranded stranger has a goal, each islander their own piece, and the key stays in the barrow till found', async () => {
    const engine = new Engine(isleContent, { seed: 3 })
    engine.start()
    expect(said(await engine.handle('quests'))).toMatch(/Off Skerrow: [^\n]* Now: Find a way off Skerrow before the winter storms close the sea\./)
    expect(storyLines(engine.world, 'npc_brannoc').join('\n')).toMatch(/the Kittiwake wants a new sail and a pot of pitch/)
    const key = 'The key lies in the barrow, by the old gentleman\'s tail.'
    expect(hiddenNamed(engine.world, key, 'npc_maren')).toBe('Off Skerrow')
    // Elowen's secret, once told, is hers to say; the key in the stranger's hand frees it for everyone.
    ;(engine.state.flags ??= {})['secret:npc_elowen:key_in_barrow'] = true
    expect(hiddenNamed(engine.world, key, 'npc_elowen')).toBeUndefined()
    expect(hiddenNamed(engine.world, key, 'npc_maren')).toBe('Off Skerrow')
    engine.state.flags['has_key'] = true
    expect(hiddenNamed(engine.world, key, 'npc_maren')).toBeUndefined()
  })

  it('Deepwell, without knows or truths, talks as before and has nothing to show', async () => {
    const engine = new Engine(otherContent, { seed: 3 })
    engine.start()
    for (const id of engine.world.content.npcs.keys()) expect(storyLines(engine.world, id)).toEqual([])
    expect(hiddenNamed(engine.world, 'The cat is Fenna.')).toBeUndefined()
    expect(said(await engine.handle('quests'))).toMatch(/You have taken nothing up yet|Open:/)
  })
})
