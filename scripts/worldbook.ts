import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { listWorlds } from '../src/node/content'
import { worldAtlasFor, writeWorldBook } from '../src/node/worldbook'

// npm run worldbook [world ...] (M10.18): content/<world>/WORLDBOOK.md out of the content, for every world or these.
// With --html (M10.20): the book as an atlas page as well, in out/worldbook/<world>.html, with the pictures the app has made.

const root = resolve(import.meta.dirname, '../content')
const html = process.argv.includes('--html')
const only = process.argv.slice(2).filter((a) => !a.startsWith('--'))
let broken = 0
for (const world of (await listWorlds(root)).filter((w) => !only.length || only.includes(w.folder))) {
  // A world that does not load (a local copy of proofs left from before a rule, M10.33) is reported, and the books of
  // the others are written all the same.
  try {
    console.log(`content/${world.folder}/WORLDBOOK.md: ${(await writeWorldBook(root, world.folder)) ? 'written' : 'up to date'}`)
  } catch (error) {
    broken++
    const problems = (error as { problems?: string[] }).problems
    console.log(`content/${world.folder}/WORLDBOOK.md: not written, the world does not load: ${problems?.[0] ?? String(error)}${problems && problems.length > 1 ? ` (and ${problems.length - 1} more)` : ''}`)
    continue
  }
  if (!html) continue
  const dir = resolve(import.meta.dirname, '../out/worldbook')
  mkdirSync(dir, { recursive: true })
  const page = await worldAtlasFor(root, world.folder)
  writeFileSync(resolve(dir, `${world.folder}.html`), page, 'utf8')
  console.log(`out/worldbook/${world.folder}.html: written (${Math.round(page.length / 1024)} KB)`)
}
if (broken) process.exitCode = 1
