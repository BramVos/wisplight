import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { listWorlds } from '../src/node/content'
import { worldAtlasFor, writeWorldBook } from '../src/node/worldbook'

// npm run worldbook [world ...] (M10.18): content/<world>/WORLDBOOK.md out of the content, for every world or these.
// With --html (M10.20): the book as an atlas page as well, in out/worldbook/<world>.html, with the pictures the app has made.

const root = resolve(import.meta.dirname, '../content')
const html = process.argv.includes('--html')
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
for (const world of (await listWorlds(root)).filter((w) => !only.length || only.includes(w.folder))) {
  console.log(`content/${world.folder}/WORLDBOOK.md: ${(await writeWorldBook(root, world.folder)) ? 'written' : 'up to date'}`)
  if (!html) continue
  const dir = resolve(import.meta.dirname, '../out/worldbook')
  mkdirSync(dir, { recursive: true })
  const page = await worldAtlasFor(root, world.folder)
  writeFileSync(resolve(dir, `${world.folder}.html`), page, 'utf8')
  console.log(`out/worldbook/${world.folder}.html: written (${Math.round(page.length / 1024)} KB)`)
}
