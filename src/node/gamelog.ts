import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { GameClock, type GameLogLine, type LogEntry } from '../engine'

// The game log (FO, chapter 3): everything that happens in a game, written as
// it happens, never cleaned up. Saving does not interrupt it. Loading an older
// save starts a new branch, so what happened after that save stays readable.

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

// What the player reads back: input, output and notes. Events and replay data stay hidden.
const READABLE = ['in', 'out', 'note']

export class GameLog {
  private readonly db: DatabaseSync

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

  private lines(session: Session, kinds: string[], afterId = 0): LogLine[] {
    const rows: LogLine[] = []
    const marks = kinds.map(() => '?').join(', ')
    for (const { branch, upTo } of this.lineage(session)) {
      rows.push(
        ...(this.db
          .prepare(`SELECT id, t, kind, text FROM gamelog WHERE game = ? AND branch = ? AND id > ? AND id <= ? AND kind IN (${marks}) ORDER BY id`)
          .all(session.game, branch, afterId, upTo, ...kinds) as unknown as LogLine[]),
      )
    }
    return rows.sort((a, b) => a.id - b.id)
  }

  /** What a replay needs after a save: the recorded input, time and model replies. */
  tail(session: Session, afterId: number): LogEntry[] {
    return this.lines(session, ['replay'], afterId).map((row) => JSON.parse(row.text) as LogEntry)
  }

  /** The story so far as the player saw it, the last `count` lines. */
  recent(session: Session, count = 40): LogLine[] {
    return this.lines(session, READABLE).slice(-count)
  }

  /** The whole story as plain text, for the export. */
  text(session: Session): string {
    return this.lines(session, READABLE)
      .map((row) => format(row))
      .join('\n')
  }

  close(): void {
    this.db.close()
  }
}

export function format(row: LogLine): string {
  const clock = new GameClock(row.t).parts
  const stamp = `[${clock.weekday} ${clock.day} ${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}]`
  if (row.kind === 'in') return `${stamp} > ${row.text}`
  if (row.kind === 'note') return `${stamp} --- ${row.text} ---`
  return row.text
    .split('\n')
    .map((line, index) => (index === 0 ? `${stamp} ${line}` : `${' '.repeat(stamp.length + 1)}${line}`))
    .join('\n')
}
