import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readCard, readScoreReply, readScoreRequest } from '../src/engine/dialogue/readscore'
import { loadContentFromDir } from '../src/node/content'

// M10.35 E, false hints counted (the cause: the read score of M10.33 W counted made-up facts per answer, not made-up
// hints, while a false hint costs the player an hour and a false fact a sentence). The reader counts per answer the acts,
// places to look, things to get and people who would let the stranger in that the answer points to and its GIVEN does
// not hold. The problem lines of Bram's transcripts of 29 and 30 September are the negative examples, kept with the
// prompt the game gives today; the measure itself, and the model per tier it chooses, is a run on Bram's key.

const root = join(import.meta.dirname, '..')
const quiet = await loadContentFromDir(join(root, 'content'), 'quietreach')

describe('M10.35 E: false hints counted', () => {
  it('asks the reader for the false hints of each answer, with the examples of Bram\'s transcripts', () => {
    const request = readScoreRequest([{ card: 'Niko Serrin, the signal technician.', said: 'How do I check the wiring?', answer: '"There\'s a multimeter under the bench."', given: 'KNOWLEDGE: the antenna wiring is old.' }])
    expect(request.system).toMatch(/hints: how many things the answer points the player to that its GIVEN does not hold: an act to do, a place to look, a thing to find or get, someone who would let them in/)
    expect(request.system).toMatch(/"the multimeter under the bench", "bring the last three run logs from the common deck", "ask Sorell for the raw power traces", "photograph it", "Mara can let you in"/)
    expect(JSON.stringify(request.schema)).toMatch(/"hints":\{"type":"integer","minimum":0,"maximum":9\}/)
  })

  it('counts them only for answers read with what they were given', () => {
    const reply = JSON.stringify({ answers: [{ n: 1, person: 2, natural: 3, answers: 2, onward: 1, invented: 0, hints: 2 }, { n: 2, person: 2, natural: 3, answers: 2, onward: 1, invented: 0, hints: 0 }, { n: 3, person: 3, natural: 3, answers: 2, onward: 0, invented: 0, hints: 4 }], weakest: [] })
    expect(readScoreReply(reply, 3, [true, true, false])?.hints).toBe(1)
  })

  it('keeps the problem lines of the transcripts as a set to read, each with the prompt the game gives today', () => {
    const rows = readFileSync(join(root, 'docs/playtest/voice/false-hints-2026-09-30.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { label: string; world: string; npc: string; said: string; reply: string; given: string })
    expect(rows.length).toBeGreaterThanOrEqual(6)
    for (const row of rows) {
      expect(row).toMatchObject({ label: 'false-hints', world: 'quietreach' })
      expect(quiet.npcs.has(row.npc)).toBe(true)
      expect(row.given).toMatch(/PLAYER SAYS: <<[^>]+>>/)
    }
    const request = readScoreRequest(rows.map((r) => ({ card: readCard(quiet, r.npc), said: r.said, answer: r.reply, given: r.given })))
    expect(request.prompt).toMatch(/multimeter under the bench/)
    expect(request.prompt.match(/GIVEN: /g)).toHaveLength(rows.length)
  })
})
