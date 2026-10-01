import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MockLlm } from '../src/engine'
import { playRoute, playRoutes } from '../src/engine/newplayer'
import { playableWarnings } from '../src/engine/quests/playable'
import { plainWords } from '../src/engine/quests/engine'
import { loadContentFromDir } from '../src/node/content'

// M10.34 B, the played proof without shortcuts (the external review of 30
// September, V02): the proof of M10.33 AE went by @quest, @goto and @bring and
// stopped before the last stage, so green did not show that a player gets
// through a story to each of its endings. A route plays from a new game with
// nothing but what a player types; what it cannot do that way is "not tested".

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const isle = await loadContentFromDir(root, 'isle')

describe('M10.34 B: a real route to every ending', () => {
  it('plays every ending of the three stories of the Quiet Reach from a new game, without a build command', async () => {
    const runs = await playRoutes(quiet, new MockLlm('good'))
    expect(runs.map((r) => `${r.quest}/${r.ending}`)).toEqual([
      'story_short_on_the_count/end1',
      'story_short_on_the_count/end2',
      'story_short_on_the_count/end3',
      'story_a_second_opinion/end1',
      'story_a_second_opinion/end2',
      'story_a_second_opinion/end3',
      'story_the_orison_recordings/end1',
      'story_the_orison_recordings/end2',
      'story_the_orison_recordings/end3',
      'story_the_orison_recordings/end4',
    ])
    for (const r of runs) {
      expect(r.reached, `${r.quest}/${r.ending}: ${JSON.stringify(r.stages)}`).toBe(true)
      expect(r.stages.every((s) => s.status === 'passed')).toBe(true)
      expect(r.typed.filter((t) => t.startsWith('@'))).toEqual([])
    }
    // The Orison line goes the whole way: along the coast, the hatch searched for, the code Tessa gave typed at the door,
    // and Sorell waited for on the Peregrine until his day brings him there.
    const orison = runs.find((r) => r.ending === 'end1' && r.quest === 'story_the_orison_recordings')!
    expect(orison.typed).toEqual(expect.arrayContaining(['go out', 'go up', 'search hatch', 'go in', 'type 7411', 'confront sorell about recordings']))
    expect(orison.minutes).toBeGreaterThan(60 * 20)
  }, 60_000)

  it('plays every ending of Skerrow', async () => {
    const runs = await playRoutes(isle, new MockLlm('good'))
    expect(runs.filter((r) => !r.reached).map((r) => `${r.ending}: ${r.stages.at(-1)?.why}`)).toEqual([])
  }, 60_000)

  it('marks what a route cannot do as not tested, never as passed: the hangar code given only in the other story', async () => {
    // As it was before (M10.33 U): Tessa gave the hangar code once the antenna fault was traced, and only then.
    const npcs = new Map(quiet.npcs)
    const tessa = npcs.get('npc_tessa_rook')!
    npcs.set(tessa.id, { ...tessa, secrets: tessa.secrets.map((s) => (s.id === 'hangar_code' ? { ...s, given_when: [{ flag: 'story_the_orison_recordings_3' }] } : s)) })
    const before = { ...quiet, npcs }
    const run = await playRoute(before, 'story_short_on_the_count', 'end2')
    expect(run.reached).toBe(false)
    expect(run.stages.at(-1)).toEqual({ stage: 's3', status: 'not tested', why: 'Peregrine Hangar is locked (a code), and nothing on the way gives the stranger the code' })
    expect(run.stages.slice(0, -1).every((s) => s.status === 'passed')).toBe(true)
    // At the source: Check names it, and the Quiet Reach as it is now has no such line.
    expect(playableWarnings(before)).toContain("quest story_short_on_the_count, deed e2: it is done at Peregrine Hangar, behind a code (7411), and Tessa Rook gives the code by right only in another story: add a stage of this one to the secret's given_when")
    expect(playableWarnings(quiet)).toEqual([])
  }, 60_000)

  it('says why for what comes by a death, a companion or another story, and plays a story first that another waits for', async () => {
    const { content } = await import('./helpers')
    const why = async (q: string, e: string) => (await playRoute(content, q, e)).stages.at(-1)
    expect(await why('the_surveyors_lights', 'harmen_dead')).toMatchObject({ status: 'not tested', why: 'it ends by a death or by what befalls a place (on_death, on_place), not by a deed' })
    expect(await why('a_boat_and_a_bride', 'blessed')).toMatchObject({ stage: 'begin', why: "it did not begin: a companion's own story: it opens when Wouter Aalman has travelled with the stranger to bond 3" })
    expect(await why('the_vissers_to_safety', 'in_waagdam')).toMatchObject({ stage: 'begin', why: 'it begins from another story (The Grey Cat on the Doorstep), not by itself' })
    // A stall at the market waits for the end of Flour for Veenhoek: that story is played first.
    const stall = await playRoute(content, 'a_stall_at_the_market', 'council')
    expect(stall.reached).toBe(true)
    // The White Women: the way asked of someone, and the Water Wolf learnt from Aaltje before the riddle is answered.
    const riddle = await playRoute(content, 'the_white_womens_riddle', 'solved')
    expect(riddle.reached).toBe(true)
    expect(riddle.typed).toEqual(expect.arrayContaining(['where is The Giant-Bed at Reuzenrust', 'talk Old Aaltje']))
  }, 120_000)

  it('shows a class of letters on the quest page as its first letter', () => {
    expect(plainWords('ask (?:old )?aaltje to (?:apologi[sz]e|say sorry)(?: .*)?')).toBe('ask aaltje to apologise')
  })
})
