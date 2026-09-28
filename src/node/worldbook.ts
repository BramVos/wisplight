import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadContent } from '../engine/content'
import { worldBook } from '../engine/worldbook'
import { readContentFiles } from './content'

// The world book on disk (M10.18): content/<world>/WORLDBOOK.md, written out
// of the content with the world's own CHRONICLER.md and its design log
// (DESIGN.md) when it has one. The script, the editor on every save and the
// test all go through here.

/** The world book of a world as it should read now. */
export async function worldBookFor(root: string, folder: string): Promise<string> {
  const files = await readContentFiles(root, folder)
  const own = files.find((f) => f.path === `${folder}/CHRONICLER.md`)?.text
  const designPath = join(root, folder, 'DESIGN.md')
  const design = existsSync(designPath) ? await readFile(designPath, 'utf8') : undefined
  return worldBook(loadContent(files), { folder, ...(own ? { chronicler: own } : {}), ...(design ? { design } : {}) })
}

/** Writes WORLDBOOK.md when it is not what the content says; true when it wrote. */
export async function writeWorldBook(root: string, folder: string): Promise<boolean> {
  const text = await worldBookFor(root, folder)
  const path = join(root, folder, 'WORLDBOOK.md')
  if (existsSync(path) && (await readFile(path, 'utf8')) === text) return false
  await writeFile(path, text, 'utf8')
  return true
}
