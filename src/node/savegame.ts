import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { SaveData } from '../engine'

// Savegames live in one SQLite file: a snapshot of the state, the input log
// that produced it, and the world events for inspection (FO, chapter 3).

export interface SaveSummary {
  id: number
  slot: string
  createdAt: string
  gameMinutes: number
}

export class SaveStore {
  private readonly db: DatabaseSync

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
  }

  save(slot: string, data: SaveData, keep = 5): number {
    this.db.exec('BEGIN')
    try {
      const result = this.db
        .prepare('INSERT INTO saves (slot, created_at, world, version, game_minutes, seed, state, log) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(slot, new Date().toISOString(), data.world, data.version, data.state.minutes, data.state.seed, JSON.stringify(data.state), JSON.stringify(data.log))
      const id = Number(result.lastInsertRowid)
      const insert = this.db.prepare('INSERT INTO events (save_id, seq, t, kind, location, actor, text) VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const e of data.state.events) insert.run(id, e.seq, e.t, e.kind, e.location, e.actor ?? null, e.text)
      // Keep the last few saves per slot so an autosave never eats the only good one.
      const old = this.db.prepare('SELECT id FROM saves WHERE slot = ? ORDER BY id DESC LIMIT -1 OFFSET ?').all(slot, keep) as { id: number }[]
      for (const row of old) {
        this.db.prepare('DELETE FROM events WHERE save_id = ?').run(row.id)
        this.db.prepare('DELETE FROM saves WHERE id = ?').run(row.id)
      }
      this.db.exec('COMMIT')
      return id
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  load(slot: string): SaveData | undefined {
    const row = this.db.prepare('SELECT world, version, state, log FROM saves WHERE slot = ? ORDER BY id DESC LIMIT 1').get(slot) as
      | { world: string; version: number; state: string; log: string }
      | undefined
    if (!row) return undefined
    return { version: row.version as 1, world: row.world, state: JSON.parse(row.state), log: JSON.parse(row.log) }
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
