import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { applyEdits, editorView, entities, entityYaml, loadContent, newWorldFiles, simulate, withReturnExits, type Edit, type EditorView, type EntityKind, type FileChange, type Raw, type SimReport } from '../engine'
import { listWorlds, readContentFiles, type WorldInfo } from './content'

// The editor on disk (M8): the same view and edits as src/engine/editor.ts
// and edit.ts, with the changed files written into content/<world>/. Only
// files inside the content folder are ever written.

export type { WorldInfo }

export interface SaveOutcome {
  ok: boolean
  problems: string[]
  warnings: string[]
  changes: FileChange[]
}

export class ContentEditor {
  constructor(readonly root: string) {}

  worlds(): Promise<WorldInfo[]> {
    return listWorlds(this.root)
  }

  async view(world: string): Promise<EditorView> {
    return editorView(await readContentFiles(this.root, world))
  }

  async entity(world: string, kind: EntityKind, id: string): Promise<{ raw: Raw; yaml: string; file: string } | undefined> {
    const files = await readContentFiles(this.root, world)
    const found = entities(files, kind).find((e) => e.id === id)
    return found ? { raw: found.raw, yaml: entityYaml(files, kind, id) ?? '', file: found.file } : undefined
  }

  /** Checks edits against the world (with the ways back of changed exits) and, unless it is only a look, writes the files that change. */
  async save(world: string, edits: Edit[], write = true): Promise<SaveOutcome> {
    const files = await readContentFiles(this.root, world)
    const result = applyEdits(files, withReturnExits(files, edits))
    if (!result.ok) return { ok: false, problems: result.problems, warnings: [], changes: [] }
    if (write) {
      for (const change of result.changes) {
        const path = this.inside(change.path)
        await mkdir(dirname(path), { recursive: true })
        await writeFile(path, change.text)
      }
    }
    return { ok: true, problems: [], warnings: result.content ? editorView(result.files).warnings : [], changes: result.changes }
  }

  /** A new world from the smallest content that loads. */
  async createWorld(folder: string, name: string): Promise<{ ok: boolean; problems: string[] }> {
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(folder)) return { ok: false, problems: ['A world folder is 2 to 31 lower-case letters, digits or underscores, starting with a letter.'] }
    if (existsSync(join(this.root, folder))) return { ok: false, problems: [`There is already a folder called ${folder}.`] }
    const files = newWorldFiles(folder, name.trim() || folder)
    try {
      loadContent(files)
    } catch (error) {
      return { ok: false, problems: [String(error)] }
    }
    for (const file of files) {
      const path = this.inside(file.path)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, file.text)
    }
    return { ok: true, problems: [] }
  }

  async simulate(world: string, days: number, seed: number): Promise<SimReport> {
    return simulate(loadContent(await readContentFiles(this.root, world)), Math.min(60, Math.max(1, Math.round(days))), seed)
  }

  private inside(path: string): string {
    if (path.includes('..') || path.startsWith('/')) throw new Error(`${path} is not inside the content folder.`)
    return join(this.root, path)
  }
}
