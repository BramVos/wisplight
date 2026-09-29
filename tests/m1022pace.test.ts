import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { Engine, MockLlm } from '../src/engine'
import { requestRun, urgentRun } from '../src/engine/storylines'
import { Pacer } from '../src/node/pacer'
import { content, runUntil } from './helpers'

// M10.22: the cadence is game time with a brake in real time (Bram: how often
// is "monthly" exactly, also when someone changes the length of play or plays
// in real time?). The night round runs once a game day and the great lines on
// the first of the month, but never more often than the app's knobs allow in
// real play, and at least once a session and once in so many sessions.

const folders: string[] = []
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})
const MIN = 60_000

describe('M10.22: a brake in real time', () => {
  it('lets the first night round of a session run, then one every so many minutes; the great lines every two hours', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-m1022pace-'))
    folders.push(dir)
    let now = 1_000_000
    const limits = () => ({ nightMinutes: 20, tidesMinutes: 120, tidesEverySessions: 10 })
    const pacer = new Pacer(join(dir, 'pace.json'), limits, () => now)
    pacer.startSession()
    expect(pacer.pace()).toEqual({ night: true, tides: true })
    pacer.ran({ night: true, tides: true })
    now += 5 * MIN
    expect(pacer.pace()).toEqual({ night: false, tides: false })
    now += 15 * MIN
    expect(pacer.pace()).toEqual({ night: true, tides: false })
    now += 100 * MIN
    expect(pacer.pace().tides).toBe(true)
    // A new session (the app started again, the file read back): its first night round is never held.
    pacer.ran({ night: true, tides: false })
    const again = new Pacer(join(dir, 'pace.json'), limits, () => now + MIN)
    expect(again.startSession().tidesDue).toBe(false)
    expect(again.pace().night).toBe(true)
    expect(again.view()[0]).toMatch(/^Night round: last .*; next from now \(the first of this session\) \(at most every 20 minutes\)\.$/)
  })

  it('judges the great lines when the months do not come, once in so many sessions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-m1022pace-'))
    folders.push(dir)
    const pacer = new Pacer(join(dir, 'pace.json'), () => ({ nightMinutes: 20, tidesMinutes: 120, tidesEverySessions: 3 }))
    expect([1, 2, 3].map(() => pacer.startSession().tidesDue)).toEqual([false, false, true])
    pacer.ran({ night: false, tides: true })
    expect(pacer.startSession().tidesDue).toBe(false)
  })

  it('holds the night run while the pace says so; a run that cannot wait goes at once', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 3, llm: mock })
    runUntil(engine, 15, 10)
    requestRun(engine.world, 'night', [], ['sig_waiting'])
    urgentRun(engine.world, 5, [], ['sig_urgent'])
    expect(engine.state.chronicle!.pending.map((r) => r.reason)).toEqual(['night', 'urgent'])
    const ran = await engine.runModels({ night: false, tides: false })
    expect(ran.night).toBe(false)
    expect(engine.state.chronicle!.pending.map((r) => r.reason)).toEqual(['night'])
    expect((await engine.runModels({ night: true })).night).toBe(true)
    expect(engine.state.chronicle!.pending).toEqual([])
  }, 60_000)

  it('judges the great lines now when the host says they are due, and a replay does the same', async () => {
    const mock = new MockLlm('good')
    const engine = new Engine(content, { seed: 4, llm: mock })
    runUntil(engine, 15, 10)
    expect(engine.judgeTidesNow()).toBe(true)
    expect(engine.state.tides?.pending).toBe(true)
    expect(engine.judgeTidesNow()).toBe(false)
    expect(await engine.runModels({ tides: false })).toMatchObject({ tides: false })
    expect(engine.state.tides?.pending).toBe(true)
    expect(await engine.runModels({})).toMatchObject({ tides: true })
    const replayed = await Engine.replay(content, 4, engine.save().log)
    expect(replayed.state.tides).toEqual(engine.state.tides)
  }, 60_000)
})
