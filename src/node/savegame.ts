import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Checkpoint, CheckpointedSave, SaveData } from '../engine'

// Savegames live in one SQLite file: a snapshot of the state, the input log
// that produced it, and the world events for inspection (FO, chapter 3).
// Since M9.3 a save is a checkpoint plus the log since: the checkpoint is
// written once, and the saves after it only add their tail.

export interface SaveSummary {
  id: number
  slot: string
  createdAt: string
  gameMinutes: number
}

interface SaveRow {
  world: string
  version: number
  state: string
  log: string
  session: string | null
  created_at: string
  checkpoint: number | null
  tail: string | null
  content: string | null
}

const SELECT = 'SELECT world, version, state, log, session, created_at, checkpoint, tail, content FROM saves'

export class SaveStore {
  private readonly db: DatabaseSync
  /** Checkpoints written from this run, so the next autosave on one only adds its tail. */
  private readonly written = new WeakMap<Checkpoint, number>()

  constructor(readonly path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS saves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slot TEXT NOT NULL,
        created_at TEXT NOT NULL,
        world TEXT NOT NULL,
        version INTEGER NOT NULL,
        game_minutes INTEGER NOT NULL,
        seed INTEGER NOT NULL,
        state TEXT NOT NULL,
        log TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS events (
        save_id INTEGER NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        t INTEGER NOT NULL,
        kind TEXT NOT NULL,
        location TEXT NOT NULL,
        actor TEXT,
        text TEXT NOT NULL,
        PRIMARY KEY (save_id, seq)
      );
      CREATE INDEX IF NOT EXISTS saves_by_slot ON saves (slot, id);
    `)
    // Saves from before the game log have no place in it.
    const columns = this.db.prepare('PRAGMA table_info(saves)').all() as { name: string }[]
    if (!columns.some((c) => c.name === 'session')) this.db.exec('ALTER TABLE saves ADD COLUMN session TEXT')
    // Checkpoints (M9.3): older saves keep their whole state and log, and load as before.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        world TEXT NOT NULL,
        content TEXT NOT NULL,
        seed INTEGER NOT NULL,
        game_minutes INTEGER NOT NULL,
        log_at INTEGER NOT NULL,
        state TEXT NOT NULL,
        log TEXT NOT NULL
      );
    `)
    if (!columns.some((c) => c.name === 'checkpoint')) this.db.exec('ALTER TABLE saves ADD COLUMN checkpoint INTEGER; ALTER TABLE saves ADD COLUMN tail TEXT; ALTER TABLE saves ADD COLUMN content TEXT')
  }

  /** A whole save, or (M9.3) a checkpoint and the log since: the checkpoint's text is written as it is, once. */
  save(slot: string, data: SaveData | CheckpointedSave, keep = 5): number {
    this.db.exec('BEGIN')
    try {
      const now = new Date().toISOString()
      let id: number
      if ('checkpoint' in data) {
        const cp = data.checkpoint
        let cpId = this.written.get(cp)
        if (cpId === undefined || !this.db.prepare('SELECT 1 FROM checkpoints WHERE id = ?').get(cpId)) {
          const row = this.db
            .prepare('INSERT INTO checkpoints (created_at, world, content, seed, game_minutes, log_at, state, log) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(now, cp.world, cp.content, cp.seed, cp.minutes, cp.at, cp.state, cp.log)
          cpId = Number(row.lastInsertRowid)
          this.written.set(cp, cpId)
        }
        const result = this.db
          .prepare("INSERT INTO saves (slot, created_at, world, version, game_minutes, seed, state, log, session, checkpoint, tail, content) VALUES (?, ?, ?, ?, ?, ?, '', '', ?, ?, ?, ?)")
          .run(slot, now, data.world, data.version, data.minutes, data.seed, data.session ? JSON.stringify(data.session) : null, cpId, JSON.stringify(data.tail), data.content)
        id = Number(result.lastInsertRowid)
      } else {
        const result = this.db
          .prepare('INSERT INTO saves (slot, created_at, world, version, game_minutes, seed, state, log, session, content) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(slot, now, data.world, data.version, data.state.minutes, data.state.seed, JSON.stringify(data.state), JSON.stringify(data.log), data.session ? JSON.stringify(data.session) : null, data.content ?? null)
        id = Number(result.lastInsertRowid)
      }
      const insert = this.db.prepare('INSERT INTO events (save_id, seq, t, kind, location, actor, text) VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const e of 'checkpoint' in data ? data.events : data.state.events) insert.run(id, e.seq, e.t, e.kind, e.location, e.actor ?? null, e.text)
      // Keep the last few saves per slot so an autosave never eats the only good one.
      const old = this.db.prepare('SELECT id FROM saves WHERE slot = ? ORDER BY id DESC LIMIT -1 OFFSET ?').all(slot, keep) as { id: number }[]
      for (const row of old) {
        this.db.prepare('DELETE FROM events WHERE save_id = ?').run(row.id)
        this.db.prepare('DELETE FROM saves WHERE id = ?').run(row.id)
      }
      // A checkpoint no save stands on any more goes too.
      if (old.length) this.db.exec('DELETE FROM checkpoints WHERE id NOT IN (SELECT checkpoint FROM saves WHERE checkpoint IS NOT NULL)')
      this.db.exec('COMMIT')
      return id
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  /** The last save in a slot. One with a tail is whole once Engine.restore has played it. */
  load(slot: string): SaveData | undefined {
    return this.read(this.db.prepare(`${SELECT} WHERE slot = ? ORDER BY id DESC LIMIT 1`).get(slot) as SaveRow | undefined)
  }

  /** Whether there is any save, without reading one. */
  any(): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM saves LIMIT 1').get())
  }

  /** The most recent save in any slot. */
  latest(): SaveData | undefined {
    return this.read(this.db.prepare(`${SELECT} ORDER BY id DESC LIMIT 1`).get() as SaveRow | undefined)
  }

  private read(row: SaveRow | undefined): (SaveData & { createdAt: string }) | undefined {
    if (!row) return undefined
    const cp = row.checkpoint === null ? undefined : (this.db.prepare('SELECT state, log FROM checkpoints WHERE id = ?').get(row.checkpoint) as { state: string; log: string } | undefined)
    if (row.checkpoint !== null && !cp) throw new Error('The checkpoint of this save is missing')
    return {
      version: row.version as 1 | 2,
      world: row.world,
      state: JSON.parse(cp?.state ?? row.state),
      log: JSON.parse(cp?.log ?? row.log),
      ...(row.tail ? { tail: JSON.parse(row.tail) } : {}),
      ...(row.content ? { content: row.content } : {}),
      ...(row.session ? { session: JSON.parse(row.session) } : {}),
      createdAt: row.created_at,
    }
  }

  /** How big the store's saves are (M9.3), to see what a checkpoint saves. */
  sizes(): { checkpoints: number; checkpointBytes: number; saves: number; saveBytes: number } {
    const c = this.db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(state) + LENGTH(log)), 0) AS bytes FROM checkpoints').get() as { n: number; bytes: number }
    const s = this.db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(state) + LENGTH(log) + LENGTH(COALESCE(tail, ''))), 0) AS bytes FROM saves").get() as { n: number; bytes: number }
    return { checkpoints: c.n, checkpointBytes: c.bytes, saves: s.n, saveBytes: s.bytes }
  }

  list(): SaveSummary[] {
    return (this.db.prepare('SELECT id, slot, created_at, game_minutes FROM saves ORDER BY id DESC').all() as {
      id: number
      slot: string
      created_at: string
      game_minutes: number
    }[]).map((r) => ({ id: r.id, slot: r.slot, createdAt: r.created_at, gameMinutes: r.game_minutes }))
  }

  close(): void {
    this.db.close()
  }
}
