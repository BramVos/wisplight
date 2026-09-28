import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { loadContent, type Content } from '../engine/content'
import { pictureSubject } from '../engine/pictures'
import { worldAtlasHtml } from '../engine/worldatlas'
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

/**
 * A picture the app already made for this world, from its pictures folder, as
 * a data URL; never a new one. The game wants the picture of the description
 * as it is now; a book (M10.20) may take the latest there is of that subject,
 * made for an earlier description, rather than none.
 */
export function cachedPictureIn(dataDir: string, content: Content, id: string, options: { latest?: boolean } = {}): string | undefined {
  const subject = pictureSubject(content, id)
  if (!subject || subject.plain) return undefined
  const dir = join(dataDir, 'pictures', content.world.id.replace(/[^a-z0-9_-]/gi, ''))
  const exact = join(dir, `${subject.id}-${subject.key}.jpg`)
  const own = (file: string) => `data:image/jpeg;base64,${readFileSync(file).toString('base64')}`
  if (existsSync(exact)) return own(exact)
  if (!options.latest || !existsSync(dir)) return undefined
  const older = readdirSync(dir)
    .filter((f) => f.startsWith(`${subject.id}-`) && /^[0-9a-f]+\.jpg$/.test(f.slice(subject.id.length + 1)))
    .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0]
  return older ? own(join(dir, older.f)) : undefined
}

/** Where the desktop app keeps its data on this machine (Electron's userData), for the script's pictures. */
export function appDataDir(): string {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'wisplight')
  if (process.platform === 'win32') return join(process.env['APPDATA'] ?? join(homedir(), 'AppData', 'Roaming'), 'wisplight')
  return join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'wisplight')
}

/** The world book as an atlas page (M10.20), with the pictures the app has made, dated today. */
export async function worldAtlasFor(root: string, folder: string, dataDir = appDataDir(), now = new Date()): Promise<string> {
  const content = loadContent(await readContentFiles(root, folder))
  const written = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  return worldAtlasHtml(content, await worldBookFor(root, folder), (id) => cachedPictureIn(dataDir, content, id, { latest: true }), { written })
}
