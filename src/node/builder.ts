import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { applyChange, builderView, type BuilderData, type BuildKind, type ChangeResult } from '../engine/builder'
import { readContentFiles } from './content'

// The world builder on disk (FO, chapter 15): the same view and changes as
// src/engine/builder.ts, with the changed file written back into the content
// folder. Only in a development build.

export type { BuilderData, BuildKind }

export async function builderData(dir: string): Promise<BuilderData> {
  return builderView(await readContentFiles(dir))
}

export async function saveChange(dir: string, kind: BuildKind, id: string, patch: Record<string, unknown>): Promise<ChangeResult> {
  const result = applyChange(await readContentFiles(dir), kind, id, patch)
  if (result.ok && result.file && result.text !== undefined) await writeFile(join(dir, result.file), result.text)
  return result
}
