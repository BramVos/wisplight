import { describe, expect, it } from 'vitest'
import { Engine, MockLlm } from '../src/engine'
import { TIER_TOKENS } from '../src/engine/dialogue/acts'
import { content } from './helpers'

// Findings from Bram's playtest after M8: a conversation that answered with a
// stock line and said nothing, what the player knows of someone, and the sheet.

const texts = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

describe('after the M8 playtest', () => {
  it('leaves room in the reply budget for the JSON around the words', () => {
    // The shortest replies ran out at 120 tokens once quest_action was added.
    expect(TIER_TOKENS.short).toBeGreaterThanOrEqual(300)
  })

  it('says so when the AI gave no answer and a stock line stands in', async () => {
    const engine = new Engine(content, { seed: 3, llm: new MockLlm('throw') })
    await engine.handle('north')
    await engine.handle('east')
    await engine.handle('talk mirte')
    const out = texts(await engine.handle('"What happened to the mill?'))
    // What happened, and that the line is the game's own (M10.8).
    expect(out).toMatch(/The AI took too long; this is the game's own line from what Mirte knows\./)
  })

  it('does not add that note when there is no AI at all', async () => {
    const engine = new Engine(content, { seed: 3 })
    await engine.handle('north')
    await engine.handle('east')
    await engine.handle('talk mirte')
    expect(texts(await engine.handle('"What happened to the mill?'))).not.toMatch(/The AI took too long|No answer from the AI|The AI gave no answer/)
  })

  it('remembers where the player saw someone, guesses their age, and knows it once told', async () => {
    const engine = new Engine(content, { seed: 3, llm: new MockLlm('good') })
    await engine.handle('north')
    await engine.handle('east')
    engine.tick(20)
    await engine.handle('talk mirte')
    let page = engine.page('npc_mirte')!
    expect(page.person?.lastSeen?.where).toBeTruthy()
    expect(page.person?.age?.known).toBe(false)
    expect(page.person?.age?.text).toMatch(/^about \d+ to \d+\?$/)
    await engine.handle('"How old are you, if I may ask?')
    page = engine.page('npc_mirte')!
    expect(page.person?.age).toEqual({ text: String(content.npcs.get('npc_mirte')!.age), known: true })
    expect(page.lines.join(' ')).toMatch(/\d+ years old\./)
  })

  it('gives the character sheet as data to lay out, beside the text', async () => {
    const engine = new Engine(content, { seed: 3 })
    const page = engine.page('sheet')!
    expect(page.lines.length).toBeGreaterThan(3)
    expect(page.sheet?.attributes.map((a) => a.name)).toHaveLength(4)
    expect(page.sheet?.skills.length).toBeGreaterThan(5)
    expect(page.sheet?.hp).toBeLessThanOrEqual(page.sheet!.maxHp)
  })
})
