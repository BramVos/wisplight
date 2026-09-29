import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { adoptPlaceEdits } from '../src/engine/edit'
import { grownContent, projectsDay, type ProjectState } from '../src/engine/growth/growth'
import { ledgerOf } from '../src/engine/economy/ledger'
import { isRestDay } from '../src/engine/clock'
import type { Content } from '../src/engine/content'
import { content } from './helpers'

// M10.28, minutes on the ways the game lays itself (Bram asked, 29 September
// 2026): the chronicler sets minutes on every exit it writes, but a place a
// project builds always got a way in of one minute, since the project's link
// knew no minutes. The link may say its minutes now; left out, three, as in a
// district; a save where it was built before keeps its one minute.

const finished = (minutes?: number): ProjectState => ({ settlement: 'waagdam', started: 0, days: 8, used: {}, paid: 320, invested: {}, done: 100, ...(minutes !== undefined ? { minutes } : {}) })

/** The Nethermarch with the brickworks' link as a test wants it. */
function withLink(minutes?: number): Content {
  const project = content.projects.get('waagdam_brickworks')!
  const link = { from: project.link!.from, direction: project.link!.direction, ...(minutes !== undefined ? { minutes } : {}) }
  return { ...content, projects: new Map(content.projects).set(project.id, { ...project, link }) }
}

const wayIn = (c: Content) => c.locations.get('loc_waagdam_harbour')!.exits['south']

describe('M10.28: the minutes of a way a project lays', () => {
  it('gives the brickworks the six minutes the Nethermarch says, when it is finished in play', () => {
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    const state = engine.state
    ;(state.growth ??= { people: [], projects: {}, hands: {} }).projects['waagdam_brickworks'] = finished()
    expect(wayIn(grownContent(content, state))).toMatchObject({ to: 'loc_waagdam_brickworks', minutes: 6 })
  })

  it('without minutes in the project: three when finished now, one in a save from before', () => {
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    const state = engine.state
    const bare = withLink()
    ;(state.growth ??= { people: [], projects: {}, hands: {} }).projects['waagdam_brickworks'] = finished(3)
    expect(wayIn(grownContent(bare, state))?.minutes).toBe(3)
    state.growth.projects['waagdam_brickworks'] = finished()
    expect(wayIn(grownContent(bare, state))?.minutes).toBe(1)
  })

  it('stamps the minutes on the project when the last workday is done', () => {
    const engine = new Engine(withLink(), { seed: 1 })
    engine.start()
    const world = engine.world
    const g = (engine.state.growth ??= { people: [], projects: {}, hands: {} })
    g.projects['waagdam_brickworks'] = { ...finished(), done: undefined, days: 7, paid: 280, used: { peat: 35 } }
    const ledger = ledgerOf(world, 'waagdam')!
    ledger.stock['peat'] = 100
    ledger.purse = 1000
    // The last workday, on a day that is no rest day.
    while (isRestDay(world.now, world.calendar)) engine.tick(24 * 60)
    projectsDay(world)
    const p = g.projects['waagdam_brickworks']!
    expect(p.done).toBeDefined()
    expect(p.minutes).toBe(3)
  })

  it('takes the place into the world with its minutes, or three', () => {
    const project = { id: 'p', link: { from: 'loc_a', direction: 'south', minutes: 7 }, place: { id: 'loc_b' } }
    const from = { id: 'loc_a', exits: {} }
    const exit = (edits: ReturnType<typeof adoptPlaceEdits>) => ((edits.find((e) => e.id === 'loc_a')!.data as { exits: Record<string, { minutes?: number }> }).exits['south'])
    expect(exit(adoptPlaceEdits(project, from))).toEqual({ to: 'loc_b', minutes: 7 })
    expect(exit(adoptPlaceEdits({ ...project, link: { from: 'loc_a', direction: 'south' } }, from))).toEqual({ to: 'loc_b', minutes: 3 })
  })
})
