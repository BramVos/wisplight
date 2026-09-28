import { existsSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_WORLD, filesOfWorld, loadContent, worldsIn, type Content, type ContentFile, type WorldInfo } from '../engine'

// Reads the content of a world from disk (M8): every YAML file under its
// folder, the shared working instruction of the chronicler and the world's
// own part of it. Which files belong to which world is decided in
// src/engine/worlds.ts, the same way as in the browser preview. Used by the
// Electron main process, the terminal client and the tests.

export { DEFAULT_WORLD, type WorldInfo }

/** Every world in a content folder: the subfolders that have a world.yaml (or the folder itself). */
export async function listWorlds(root: string): Promise<WorldInfo[]> {
  const files: ContentFile[] = []
  if (existsSync(join(root, 'world.yaml'))) files.push({ path: 'world.yaml', text: await readFile(join(root, 'world.yaml'), 'utf8') })
  else {
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name, 'world.yaml')
      if (entry.isDirectory() && existsSync(path)) files.push({ path: `${entry.name}/world.yaml`, text: await readFile(path, 'utf8') })
    }
  }
  return worldsIn(files)
}

/**
 * The files of one world, with paths relative to the content folder (so the
 * builder can write them back). Without a folder: a single world at the root,
 * or the Nethermarch.
 */
/**
 * Every file under a folder, as paths with forward slashes (M9.4). Not
 * readdir's own recursive walk: the installed app reads its content from an
 * archive that does not support it, and on Windows it gives backslashes.
 */
async function walk(dir: string, prefix = ''): Promise<string[]> {
  const found: string[] = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = `${prefix}${entry.name}`
    if (entry.isDirectory()) found.push(...(await walk(join(dir, entry.name), `${path}/`)))
    else found.push(path)
  }
  return found
}

export async function readContentFiles(root: string, folder: string = DEFAULT_WORLD): Promise<ContentFile[]> {
  const single = existsSync(join(root, 'world.yaml'))
  const world = single ? '' : folder
  if (!/^[a-z0-9_-]*$/.test(world) || (world && !existsSync(join(root, world, 'world.yaml')))) throw new Error(`There is no world called "${folder}".`)
  const entries = await walk(join(root, world))
  const prefix = world ? `${world}/` : ''
  // The design log (M10.18) goes along, for the chronicler's prompt in the editor; the world book is made from these, never read.
  const paths = entries.filter((entry) => /\.ya?ml$/.test(entry) || /(^|\/)(CHRONICLER|DESIGN)\.md$/.test(entry) || /(^|\/)ids\.lock$/.test(entry)).sort()
  const files = await Promise.all(paths.map(async (path) => ({ path: `${prefix}${path}`, text: await readFile(join(root, world, path), 'utf8') })))
  if (world && existsSync(join(root, 'CHRONICLER.md'))) files.push({ path: 'CHRONICLER.md', text: await readFile(join(root, 'CHRONICLER.md'), 'utf8') })
  return filesOfWorld(files, world || undefined)
}

export async function loadContentFromDir(root: string, folder?: string): Promise<Content> {
  return loadContent(await readContentFiles(root, folder))
}
