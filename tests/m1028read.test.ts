import { describe, expect, it } from 'vitest'
import { MockLlm, type LlmRequest } from '../src/engine'
import { answerOf, readCard, readScoreReply, readScoreRequest } from '../src/engine/dialogue/readscore'
import { runSituation, trialSituations } from '../src/engine/dialogue/testset'
import { readScore } from '../src/node/ai/advisor'
import { content } from './helpers'

// M10.28, the voice comparison (Bram, 29 September 2026: the situation set
// scores words and facts, not whether the lines read well, and the answers
// were kept nowhere). Every answer is kept with the player's line before it,
// and one call on the brain reads a series: 0 to 3 on four questions per
// answer, and the three weakest with why.

describe('M10.28: the answers kept, and how they read', () => {
  it('keeps each line the player said with what came back, and whether the model or the rules answered', async () => {
    const [situation] = trialSituations(content, 1)
    const run = await runSituation(content, situation!, new MockLlm('good'))
    expect(run.turns.map((t) => t.said)).toEqual(situation!.lines)
    const answers = run.turns.map((t) => answerOf(t.outputs))
    expect(answers.some((a) => a.byModel && a.answer.length > 0)).toBe(true)
  })

  it('asks the brain at low effort with a card per speaker, and reads the points back', async () => {
    const card = readCard(content, 'npc_mirte')
    expect(card).toMatch(/^Mirte/)
    const items = [
      { card, said: 'What do you bake?', answer: '"Rye, mostly. Hungry?"' },
      { card, said: 'Is the mill turning?', answer: '"No."' },
    ]
    const request = readScoreRequest(items)
    expect(request).toMatchObject({ role: 'brain', effort: 'low', schemaName: 'read_score' })
    expect(request.prompt).toMatch(/1\. \[1\] The player: "What do you bake\?"/)
    const read = readScoreReply(JSON.stringify({ answers: [{ n: 1, person: 3, natural: 3, answers: 3, onward: 3 }, { n: 2, person: 1, natural: 2, answers: 1, onward: 0 }], weakest: [{ n: 2, why: 'It stops the talk.' }] }), 2)!
    expect(read.score).toBeCloseTo(16 / 24, 6)
    expect(read.byQuestion.onward).toBeCloseTo(1.5, 6)
    expect(read.weakest).toEqual([{ n: 2, why: 'It stops the talk.' }])
    // An answer skipped, or a point out of bounds, is no score.
    expect(readScoreReply(JSON.stringify({ answers: [{ n: 1, person: 3, natural: 3, answers: 3, onward: 3 }], weakest: [] }), 2)).toBeUndefined()
    expect(readScoreReply(JSON.stringify({ answers: [{ n: 1, person: 4, natural: 3, answers: 3, onward: 3 }], weakest: [] }), 1)).toBeUndefined()
  })

  it('reads only what the model said, and gives a score and what it cost', async () => {
    const mock = new MockLlm('good')
    const asked: LlmRequest[] = []
    const gateway = { complete: async (r: LlmRequest) => (asked.push(r), mock.complete(r)) }
    const read = await readScore(gateway as never, content, [
      { npc: 'npc_mirte', said: 'Hello.', answer: '"Evening."', byModel: false },
      { npc: 'npc_mirte', said: 'What do you bake?', answer: '"Rye, mostly."', byModel: true },
      { npc: 'npc_gerrit', said: 'Any news?', answer: '"The dyke holds, for now."', byModel: true },
    ])
    expect(asked).toHaveLength(1)
    expect((asked[0]!.meta as { count: number }).count).toBe(2)
    expect(read!.score).toBeGreaterThan(0)
    expect(read!.weakest[0]!.n).toBe(2)
  })
})
