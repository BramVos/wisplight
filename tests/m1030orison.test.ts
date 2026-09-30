import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, MockLlm } from '../src/engine'
import { STORY_TALKS, playTwenty } from '../src/node/talktrial'
import { loadContentFromDir } from '../src/node/content'

// M10.30 (5), played proof: the main line of The Quiet Reach, The Orison
// Recordings, from beginning to end with the mock model, as a new player
// would play it; build commands only for distance and time. And the trial of
// Niko and Tessa on the recordings runs on the mock as it will on a key.

const quietReach = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const said = (outs: { text: string }[]) => outs.map((o) => o.text).join('\n')

/** The steps of the main line, with what each must show; the playtest plays the same. */
export const ORISON: { step: string; shows?: RegExp }[] = [
  { step: 'journal the orison recordings', shows: /Ask Niko about the station/ },
  { step: '@goto loc_orison_listening_room' },
  { step: 'wait for niko' },
  { step: 'ask niko about the station', shows: /access sequence/ },
  { step: 'copy the original recordings', shows: /several segments of the repeating transmission were removed/ },
  { step: 'trace the antenna fault', shows: /unofficial bypass/ },
  { step: '@goto loc_workshop' },
  { step: 'wait for tessa' },
  { step: 'ask tessa about the drive test', shows: /7411/ },
  { step: 'type 7411', shows: /keypad blinks green/ },
  { step: 'in' },
  { step: 'up' },
  // On Primeday he works up at the Listening Room: the deck in the mornings of the other days.
  { step: 'wait for sorell', shows: /Ilyan has not come/ },
  { step: 'wait 14 hours' },
  { step: 'wait for sorell' },
  { step: 'confront sorell about the recordings' },
]

describe('M10.30 (5): The Orison Recordings played through', () => {
  it('goes from the first stage to an ending that solves it, with the mock model', async () => {
    const engine = new Engine(quietReach, { seed: 7, builder: true, llm: new MockLlm('good') })
    engine.start()
    expect(engine.state.questlog?.['story_the_orison_recordings']?.stage).toBe('s1')
    for (const { step, shows } of ORISON) {
      const out = said(await engine.handle(step))
      await engine.runModels()
      if (shows) expect(out, step).toMatch(shows)
    }
    const q = engine.state.questlog!['story_the_orison_recordings']!
    expect(q.path).toEqual(['s1', 's2', 's3', 's4', 's5'])
    expect(q.outcome).toBe('end1')
    expect(quietReach.quests.get('story_the_orison_recordings')!.outcomes!.find((o) => o.id === 'end1')!.solution).toBe(true)
  }, 240_000)

  it('plays the trial of Niko and Tessa on the mock: their first lines each', async () => {
    // Four lines each keep it quick; the trial on a key plays all ten.
    for (const talk of STORY_TALKS) {
      const lines = await playTwenty(quietReach, new MockLlm('good'), { npc: talk.npc, lines: talk.lines.slice(0, 4), model: (r) => r.model })
      expect(lines).toHaveLength(4)
      // The mock takes a line near a quest's deed for the deed (a line of the story, not of speech); a model does so less.
      expect(lines.filter((l) => l.said.length > 0).length).toBeGreaterThanOrEqual(2)
    }
    expect(STORY_TALKS.map((t) => t.lines.length)).toEqual([10, 10])
  }, 240_000)
})
