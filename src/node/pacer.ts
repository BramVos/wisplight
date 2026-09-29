import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

// The pace of the model rounds in real time (M10.22; Bram: how often is
// "monthly" exactly, also when someone changes the length of play or plays in
// real time?). The game's clock may run fast or in real time, so two brakes
// hold whatever the clock does: a night round at most every so many minutes
// of real play (the first of a session is never held), and a judgement of the
// great lines at most every so many; and when the months of the game do not
// come, a judgement at least once in so many sessions. pace.json in the app's
// folder keeps when they last ran.

export interface PaceFile {
  lastNightAt?: number
  lastTidesAt?: number
  sessions: number
  sessionsSinceTides: number
}

export interface PaceLimits {
  nightMinutes: number
  tidesMinutes: number
  tidesEverySessions: number
}

export class Pacer {
  private data: PaceFile = { sessions: 0, sessionsSinceTides: 0 }
  private nightThisSession = false

  constructor(
    private readonly path: string | undefined,
    private readonly limits: () => PaceLimits,
    private readonly now: () => number = Date.now,
  ) {
    if (path && existsSync(path)) {
      try {
        const read = JSON.parse(readFileSync(path, 'utf8')) as Partial<PaceFile>
        this.data = { ...this.data, ...read }
      } catch {
        // A damaged file starts over: it only holds when rounds last ran.
      }
    }
  }

  /** A new session: counted, and whether the great lines are due although no month came. */
  startSession(): { tidesDue: boolean } {
    this.data.sessions += 1
    this.data.sessionsSinceTides += 1
    this.nightThisSession = false
    this.write()
    return { tidesDue: this.data.sessionsSinceTides >= this.limits().tidesEverySessions }
  }

  /** What may run now. */
  pace(): { night: boolean; tides: boolean } {
    const now = this.now()
    const { nightMinutes, tidesMinutes } = this.limits()
    const night = !this.nightThisSession || this.data.lastNightAt === undefined || now - this.data.lastNightAt >= nightMinutes * 60_000
    const tides = this.data.lastTidesAt === undefined || now - this.data.lastTidesAt >= tidesMinutes * 60_000
    return { night, tides }
  }

  /** What ran, so the next waits. */
  ran(what: { night: boolean; tides: boolean }): void {
    if (!what.night && !what.tides) return
    const now = this.now()
    if (what.night) {
      this.data.lastNightAt = now
      this.nightThisSession = true
    }
    if (what.tides) {
      this.data.lastTidesAt = now
      this.data.sessionsSinceTides = 0
    }
    this.write()
  }

  /** For the dev menu: when each last ran and when the next may. */
  view(): string[] {
    const { nightMinutes, tidesMinutes, tidesEverySessions } = this.limits()
    const at = (t: number | undefined) => (t === undefined ? 'not yet' : new Date(t).toLocaleTimeString())
    const next = (t: number | undefined, minutes: number) => (t === undefined ? 'now' : new Date(t + minutes * 60_000).toLocaleTimeString())
    return [
      `Night round: last ${at(this.data.lastNightAt)}; next from ${this.nightThisSession ? next(this.data.lastNightAt, nightMinutes) : 'now (the first of this session)'} (at most every ${nightMinutes} minutes).`,
      `Great lines: last ${at(this.data.lastTidesAt)}; next from ${next(this.data.lastTidesAt, tidesMinutes)} (at most every ${tidesMinutes} minutes; at least once in ${tidesEverySessions} sessions, ${this.data.sessionsSinceTides} since the last).`,
    ]
  }

  private write(): void {
    if (!this.path) return
    mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, `${JSON.stringify(this.data)}\n`)
  }
}
