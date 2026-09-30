import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MockLlm } from '../src/engine'
import { playableWarnings } from '../src/engine/quests/playable'
import { playByNow, stuckQuests } from '../src/engine/newplayer'
import { loadContentFromDir } from '../src/node/content'

// M10.33 AE: every quest played as a new player. Cause: the check of whether a quest can be done looked at places,
// flags and endings, not at whether the thing a deed names is there or the Now line is what the player types; and the
// playtest typed the magic words of the Quiet Reach's main line, so it passed by construction. Now Check names both
// (playable.ts), the game reads a Now line with its place after it, and every quest is played by its Now lines alone.

const root = join(import.meta.dirname, '../content')
const worlds = {
  base: await loadContentFromDir(root),
  isle: await loadContentFromDir(root, 'isle'),
  quietreach: await loadContentFromDir(root, 'quietreach'),
  other: await loadContentFromDir(join(import.meta.dirname, 'worlds'), 'other'),
}

describe('M10.33 AE: every quest played as a new player', () => {
  it('plays every quest of every world by its Now lines, none stuck', async () => {
    const stuck: string[] = []
    for (const content of Object.values(worlds)) {
      for (const { quest, runs } of await stuckQuests(content, new MockLlm('good'))) for (const r of runs) if (!r.moved) stuck.push(`${quest}@${r.stage}`)
    }
    // Orison s3 moved with M10.33 AA: the trace is typed on the feed in the Cable Gallery, under the floor.
    expect(stuck).toEqual([])
  }, 300_000)

  it('does The Short on the Count to its last stage by its Now lines, the manifests read at the lock', async () => {
    const runs = await playByNow(worlds.quietreach, 'story_short_on_the_count', new MockLlm('good'))
    expect(runs.map((r) => [r.stage, r.moved])).toEqual([['s1', true], ['s2', true]])
    expect(runs[0]!.steps).toContain('Compare the cargo manifests at the Arrival Lock')
  }, 120_000)

  it('Check: a deed done to a thing that is not there, a Now line the player cannot type, a Now line at the wrong place', () => {
    const q = worlds.quietreach.quests.get('story_short_on_the_count')!
    const quests = new Map(worlds.quietreach.quests)
    quests.set(q.id, {
      ...q,
      stages: q.stages!.map((s) => (s.id === 's1' ? { ...s, goal: 'Look into the manifests in the Commons' } : s)),
      actions: q.actions!.map((a) => (a.id === 'a1' ? { ...a, intent: 'compare the shipping ledgers', say: ['compare (?:the )?shipping ledgers'] } : a)),
    })
    const found = playableWarnings({ ...worlds.quietreach, quests })
    expect(found).toContain('quest story_short_on_the_count, deed a1: "compare the shipping ledgers" is done to shipping ledgers, and there is no ledgers at Arrival Lock (no detail, object, thing or person by that word)')
    expect(found.join('\n')).toMatch(/stage s1: the Now line "Look into the manifests in the Commons" is not what the player types for its deed/)
    expect(found.join('\n')).toMatch(/stage s1: the Now line sends the stranger to Commons, but its deed is done at Arrival Lock/)
    // The worlds as they are: only the antenna fault, which M10.33 AA moves.
    for (const [name, content] of Object.entries(worlds)) expect(playableWarnings(content).filter((w) => !/story_the_orison_recordings, stage s3/.test(w)), name).toEqual([])
  })
})
