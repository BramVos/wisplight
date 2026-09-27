import { parse } from 'yaml'
import type { ContentFile } from './content'

// More than one world in one content folder (M8): content/<folder>/ holds a
// world with its own world.yaml; base is the Nethermarch. CHRONICLER.md at the
// top is the chronicler's shared working instruction, and a world adds its own
// part in its folder. Pure, so the desktop app, the tests and the browser
// preview pick a world the same way.

export interface WorldInfo {
  /** The folder under content/, which is also how a savegame refers to it. */
  folder: string
  id: string
  name: string
  intro?: string
}

export const DEFAULT_WORLD = 'base'

/** Every world among the files of a content folder: the Nethermarch first, then by name. */
export function worldsIn(files: ContentFile[]): WorldInfo[] {
  const worlds: WorldInfo[] = []
  for (const file of files) {
    const match = file.path.match(/^(?:([^/]+)\/)?world\.ya?ml$/)
    if (!match) continue
    const data = parse(file.text) as { world?: { id?: string; name?: string; intro?: string } } | null
    const folder = match[1] ?? ''
    worlds.push({ folder, id: data?.world?.id ?? folder, name: data?.world?.name ?? folder, ...(data?.world?.intro ? { intro: data.world.intro } : {}) })
  }
  return worlds.sort((a, b) => (a.folder === DEFAULT_WORLD ? -1 : b.folder === DEFAULT_WORLD ? 1 : a.name.localeCompare(b.name)))
}

/** The files of one world, and the shared instruction. A folder with a single world at its root is that world. */
export function filesOfWorld(files: ContentFile[], folder: string = DEFAULT_WORLD): ContentFile[] {
  if (files.some((f) => /^world\.ya?ml$/.test(f.path))) return files
  return files.filter((f) => f.path.startsWith(`${folder}/`) || f.path === 'CHRONICLER.md')
}
