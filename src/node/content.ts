import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadContent, type Content, type ContentFile } from '../engine'

// Reads every YAML file under a content folder, and CHRONICLER.md. Used by the Electron main
// process, the terminal client and the tests.

export async function readContentFiles(dir: string): Promise<ContentFile[]> {
  const entries = await readdir(dir, { recursive: true })
  // YAML content, and the chronicler's working instruction.
  const paths = entries.filter((entry) => /\.ya?ml$/.test(entry) || /(^|\/)CHRONICLER\.md$/.test(entry)).sort()
  return Promise.all(
    paths.map(async (path) => ({ path, text: await readFile(join(dir, path), 'utf8') })),
  )
}

export async function loadContentFromDir(dir: string): Promise<Content> {
  return loadContent(await readContentFiles(dir))
}
