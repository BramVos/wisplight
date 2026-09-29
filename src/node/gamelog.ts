import { closeSync, mkdirSync, openSync, rmSync, writeSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DEFAULT_CALENDAR, GameClock, weekdayName, type Calendar, type EarlierLines, type Fact, type GameLogLine, type LogEntry } from '../engine'
import type { Archived } from '../engine/archive'
import { ZipWriter } from './zip'

// The game log (FO, chapter 3): everything that happens in a game, written as
// it happens, never cleaned up. Saving does not interrupt it. Loading an older
// save starts a new branch, so what happened after that save stays readable.
// A game can run for months, so nothing here holds the whole log in memory:
// every line is one INSERT, reading back the end is a LIMIT query, and the
// export streams row by row into the file.

export interface Session {
  game: string
  branch: number
}

export interface LogLine {
  id: number
  t: number
  kind: string
  text: string
}

/** Which part of the story to export: all of it, what happened since the save was loaded, or the last days. */
export type LogScope = { kind: 'all' } | { kind: 'loaded' } | { kind: 'days'; days: number }

/** Above this the export becomes a zip with parts of this size, so every part opens quickly. */
export const PART_BYTES = 10 * 1024 * 1024

const MINUTES_PER_DAY = 24 * 60

// What the player reads back: input, output and notes. Events and replay data stay hidden.
const READABLE = ['in', 'out', 'note']

export class GameLog {
  private readonly db: DatabaseSync

  /** The calendar of the world being played, for the weekday in the time stamps (M10.17). */
  calendar: Calendar = DEFAULT_CALENDAR

  constructor(readonly path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gamelog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game TEXT NOT NULL,
        branch INTEGER NOT NULL,
        t INTEGER NOT NULL,
        at TEXT NOT NULL,
        kind TEXT NOT NULL,
        text TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS branches (
        game TEXT NOT NULL,
        branch INTEGER NOT NULL,
        parent INTEGER,
        fork_id INTEGER,
        created TEXT NOT NULL,
        PRIMARY KEY (game, branch)
      );
      CREATE INDEX IF NOT EXISTS gamelog_by_branch ON gamelog (game, branch, id);
    `)
  }

  start(game: string): Session {
    this.db.prepare('INSERT INTO branches (game, branch, parent, fork_id, created) VALUES (?, 1, NULL, NULL, ?)').run(game, new Date().toISOString())
    return { game, branch: 1 }
  }

  /** A new branch that continues from line `atId` of an earlier branch. */
  fork(from: Session, atId: number): Session {
    const row = this.db.prepare('SELECT MAX(branch) AS max FROM branches WHERE game = ?').get(from.game) as { max: number | null }
    const branch = (row.max ?? 0) + 1
    this.db.prepare('INSERT INTO branches (game, branch, parent, fork_id, created) VALUES (?, ?, ?, ?, ?)').run(from.game, branch, from.branch, atId, new Date().toISOString())
    return { game: from.game, branch }
  }

  append(session: Session, t: number, kind: string, text: string): number {
    const result = this.db.prepare('INSERT INTO gamelog (game, branch, t, at, kind, text) VALUES (?, ?, ?, ?, ?, ?)').run(session.game, session.branch, t, new Date().toISOString(), kind, text)
    return Number(result.lastInsertRowid)
  }

  /** Writes one line from the engine's log stream. */
  write(session: Session, line: GameLogLine): void {
    if (line.kind === 'in') this.append(session, line.t, 'in', line.text)
    else if (line.kind === 'out') this.append(session, line.t, 'out', line.output.text)
    else if (line.kind === 'event') this.append(session, line.t, 'event', JSON.stringify(line.event))
    else if (line.kind === 'archive') this.append(session, line.t, 'archive', JSON.stringify(line.archived))
    else this.append(session, line.t, 'replay', JSON.stringify(line.entry))
  }

  /** Where a save made now sits in this history: the last line of the branch, or where it forked. */
  position(session: Session): number {
    const last = this.lastId(session)
    if (last > 0) return last
    const row = this.db.prepare('SELECT fork_id FROM branches WHERE game = ? AND branch = ?').get(session.game, session.branch) as { fork_id: number | null } | undefined
    return row?.fork_id ?? 0
  }

  lastId(session: Session): number {
    const row = this.db.prepare('SELECT MAX(id) AS id FROM gamelog WHERE game = ? AND branch = ?').get(session.game, session.branch) as { id: number | null }
    return row.id ?? 0
  }

  /** The branches this one grew from, each with the last line that belongs to this history. */
  private lineage(session: Session): { branch: number; upTo: number }[] {
    const result: { branch: number; upTo: number }[] = []
    let branch: number | null = session.branch
    let upTo = Number.MAX_SAFE_INTEGER
    while (branch !== null) {
      result.push({ branch, upTo })
      const row = this.db.prepare('SELECT parent, fork_id FROM branches WHERE game = ? AND branch = ?').get(session.game, branch) as { parent: number | null; fork_id: number | null } | undefined
      branch = row?.parent ?? null
      upTo = row?.fork_id ?? 0
    }
    return result
  }

  /** Every line of this history in order, one row at a time, oldest first. */
  private *rows(session: Session, kinds: string[], afterId = 0, scope: LogScope = { kind: 'all' }): Generator<LogLine> {
    const marks = kinds.map(() => '?').join(', ')
    const query = this.db.prepare(`SELECT id, t, kind, text FROM gamelog WHERE game = ? AND branch = ? AND id > ? AND id <= ? AND t >= ? AND kind IN (${marks}) ORDER BY id`)
    const fromT = scope.kind === 'days' ? (this.recent(session, 1)[0]?.t ?? 0) - scope.days * MINUTES_PER_DAY : Number.MIN_SAFE_INTEGER
    // Lines of a branch are all newer than the fork in its parent, so root first is oldest first.
    const lineage = this.lineage(session)
    for (const { branch, upTo } of scope.kind === 'loaded' ? lineage.slice(0, 1) : lineage.reverse()) {
      yield* query.iterate(session.game, branch, afterId, upTo, fromT, ...kinds) as IterableIterator<LogLine>
    }
  }

  /** When the first line of this part of the story was written, in real time (M10.29 U: the AI log goes with it). */
  firstAt(session: Session, scope: LogScope = { kind: 'all' }): string | undefined {
    for (const row of this.rows(session, READABLE, 0, scope)) return (this.db.prepare('SELECT at FROM gamelog WHERE id = ?').get(row.id) as { at?: string } | undefined)?.at
    return undefined
  }

  /** What a replay needs after a save: the recorded input, time and model replies. */
  tail(session: Session, afterId: number): LogEntry[] {
    return [...this.rows(session, ['replay'], afterId)].map((row) => JSON.parse(row.text) as LogEntry)
  }

  /** What left the saves of this history for the archive (M9.1), oldest first, one batch at a time. */
  *archive(session: Session): Generator<Archived> {
    for (const row of this.rows(session, ['archive'])) yield JSON.parse(row.text) as Archived
  }

  /** A fact from the archive, by its id: for the chronicle and the builder, when a save no longer holds it. */
  archivedFact(session: Session, id: string): Fact | undefined {
    for (const batch of this.archive(session)) {
      const fact = batch.facts.find((f) => f.id === id)
      if (fact) return fact
    }
    return undefined
  }

  /** The story so far as the player saw it, the last `count` lines, read from the end. */
  recent(session: Session, count = 40, kinds: readonly string[] = READABLE): LogLine[] {
    const marks = kinds.map(() => '?').join(', ')
    const query = this.db.prepare(`SELECT id, t, kind, text FROM gamelog WHERE game = ? AND branch = ? AND id <= ? AND kind IN (${marks}) ORDER BY id DESC LIMIT ?`)
    const newestFirst: LogLine[] = []
    for (const { branch, upTo } of this.lineage(session)) {
      if (newestFirst.length >= count) break
      newestFirst.push(...(query.all(session.game, branch, upTo, ...kinds, count - newestFirst.length) as unknown as LogLine[]))
    }
    return newestFirst.reverse()
  }

  /**
   * The game before, to show faded where it is picked up again (M10.29 S):
   * the last lines typed and shown, read from the end with a LIMIT, so a game
   * of months opens as fast; none when there are none, or none are wanted.
   */
  earlier(session: Session, count: number, calendar: Calendar = DEFAULT_CALENDAR): EarlierLines | undefined {
    if (count <= 0) return undefined
    const lines = this.recent(session, count, ['in', 'out']).filter((l) => l.text.trim())
    if (!lines.length) return undefined
    const t = lines[0]!.t
    return { when: `${weekdayName(t, calendar)} ${new GameClock(t).parts.day}`, lines: lines.map((l) => ({ you: l.kind === 'in', text: l.text })) }
  }

  /** The whole story as plain text. Only for short logs and tests; the app exports with `exportTo`. */
  text(session: Session): string {
    const out: string[] = []
    for (const row of this.rows(session, READABLE)) out.push(format(row, this.calendar))
    return out.join('\n')
  }

  /** Roughly how many bytes an export of this scope will be, without reading the text. */
  size(session: Session, scope: LogScope = { kind: 'all' }): number {
    const marks = READABLE.map(() => '?').join(', ')
    const query = this.db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(CAST(text AS BLOB))), 0) AS bytes FROM gamelog WHERE game = ? AND branch = ? AND id <= ? AND t >= ? AND kind IN (${marks})`)
    const fromT = scope.kind === 'days' ? (this.recent(session, 1)[0]?.t ?? 0) - scope.days * MINUTES_PER_DAY : Number.MIN_SAFE_INTEGER
    const lineage = this.lineage(session)
    let total = 0
    for (const { branch, upTo } of scope.kind === 'loaded' ? lineage.slice(0, 1) : lineage) {
      const row = query.get(session.game, branch, upTo, fromT, ...READABLE) as { n: number; bytes: number }
      // The time stamp and the line break that format() adds to each line.
      total += row.bytes + row.n * 24
    }
    return total
  }

  /**
   * Writes the story to a file, streaming, however long the game ran. A path
   * ending in .zip gets parts of about 10 MB (part-01.txt, part-02.txt, ...);
   * anything else is one text file. Returns the number of lines.
   */
  exportTo(session: Session, path: string, scope: LogScope = { kind: 'all' }): number {
    return path.toLowerCase().endsWith('.zip') ? this.exportZip(session, path, scope) : this.exportText(session, path, scope)
  }

  private exportText(session: Session, path: string, scope: LogScope): number {
    const fd = openSync(path, 'w')
    let lines = 0
    let buffer = ''
    try {
      for (const row of this.rows(session, READABLE, 0, scope)) {
        buffer += `${format(row, this.calendar)}\n`
        lines++
        if (buffer.length > 64 * 1024) {
          writeSync(fd, buffer)
          buffer = ''
        }
      }
      if (buffer) writeSync(fd, buffer)
    } finally {
      closeSync(fd)
    }
    return lines
  }

  private exportZip(session: Session, path: string, scope: LogScope): number {
    const zip = new ZipWriter(path)
    let lines = 0
    let part = 0
    let chunks: string[] = []
    let bytes = 0
    const flush = () => {
      if (chunks.length === 0) return
      zip.add(`wisplight-log-part-${String(++part).padStart(2, '0')}.txt`, Buffer.from(chunks.join(''), 'utf8'))
      chunks = []
      bytes = 0
    }
    try {
      for (const row of this.rows(session, READABLE, 0, scope)) {
        const line = `${format(row, this.calendar)}\n`
        if (bytes > 0 && bytes + Buffer.byteLength(line) > PART_BYTES) flush()
        chunks.push(line)
        bytes += Buffer.byteLength(line)
        lines++
      }
      flush()
      zip.finish()
    } catch (error) {
      zip.abort()
      rmSync(path, { force: true })
      throw error
    }
    return lines
  }

  close(): void {
    this.db.close()
  }
}

export function format(row: LogLine, calendar: Calendar = DEFAULT_CALENDAR): string {
  const clock = new GameClock(row.t).parts
  const stamp = `[${weekdayName(row.t, calendar)} ${clock.day} ${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}]`
  if (row.kind === 'in') return `${stamp} > ${row.text}`
  if (row.kind === 'note') return `${stamp} --- ${row.text} ---`
  return row.text
    .split('\n')
    .map((line, index) => (index === 0 ? `${stamp} ${line}` : `${' '.repeat(stamp.length + 1)}${line}`))
    .join('\n')
}
