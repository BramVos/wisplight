import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, LlmError, type LlmClient, type Output } from '../src/engine'
import { classify, tierFor } from '../src/engine/dialogue/acts'
import { fitLength } from '../src/engine/dialogue/guard'
import { loadContentFromDir } from '../src/node/content'

// M10.33 G, a short line that fits and never a cut one (found in Bram's AI
// log of 30 September 2026: there was no outage at Tessa. His question began
// with "Sorry", so it was taken for an apology with a limit of fifteen words;
// Haiku gave twenty-seven, and the answer was cut after `"Right.`). And a
// failure is said once, without its technical reason.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

describe('M10.33 G: a short line that fits, never a cut one', () => {
  it('takes a question after a courtesy for the question', () => {
    const asked = classify('Sorry you are going a bit fast, which notes are you talking about and what green light? What are we looking at?', 0)
    expect(asked).not.toBe('Apologize')
    expect(tierFor(asked)).not.toBe('short')
    expect(classify('Excuse me, where is the Workshop?', 0)).toBe('AskDirections')
    expect(classify('Good morning. You sent for me?', 0)).not.toBe('Greet')
    // A courtesy alone, or an apology that asks nothing, is still one.
    expect(classify('Sorry.', 0)).toBe('Apologize')
    expect(classify('Sorry, my mistake.', 0)).toBe('Apologize')
    expect(classify('Good morning!', 0)).toBe('Greet')
  })

  it('cuts at a whole sentence with its quotation closed and something said kept, and else keeps the reply whole', () => {
    const tessa = 'Tessa looks up from a test harness, wiping her hands on her work coat. "Right. Slow down. I\'m not making notes about anything yet. You\'ve just arrived."'
    expect(fitLength(tessa, 15)).toBe('Tessa looks up from a test harness, wiping her hands on her work coat. "Right."')
    expect(fitLength(tessa, 50)).toBe(tessa)
    // No sentence said within the limit: whole.
    expect(fitLength('Tessa looks up from a long test harness, wiping both her hands slowly on her old work coat. "Right."', 8)).toMatch(/"Right\."$/)
    const long = 'She nods. "The station is failing." She taps the board. "Power, heat and the buffer, all at once, and nobody here knows why it started."'
    expect(fitLength(long, 12)).toBe('She nods. "The station is failing." She taps the board.')
    expect(fitLength('Short and done.', 15)).toBe('Short and done.')
  })

  it('says a failure once, without its technical reason, and again only after a reply came', async () => {
    let fail = true
    const llm: LlmClient = {
      complete: async () => {
        if (fail) throw new LlmError('invalid', '503 credential validation failed')
        return { text: JSON.stringify({ reply: 'Sana nods. "Morning."' }), provider: 'mock', model: 'mock', usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 }, latencyMs: 0 }
      },
    }
    const engine = new Engine(quiet, { seed: 3, builder: true, llm })
    engine.start()
    for (const c of ['@goto loc_commons', '@bring sana', 'talk sana']) await engine.handle(c)
    const first = text(await engine.handle('"What do you make of the signal?'))
    const second = text(await engine.handle('"And the station on the ridge?'))
    expect(first).toMatch(/The AI gave no answer; this is the game's own line/)
    expect(first).not.toMatch(/503|credential/)
    expect(second).not.toMatch(/The AI gave no answer/)
    // A reply came: the next failure is said again.
    fail = false
    expect(text(await engine.handle('"Thank you.'))).not.toMatch(/The AI gave no answer/)
    fail = true
    expect(text(await engine.handle('"Who keeps the station running?'))).toMatch(/The AI gave no answer/)
  })
})
