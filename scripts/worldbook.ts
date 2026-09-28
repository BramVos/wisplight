import { resolve } from 'node:path'
import { listWorlds } from '../src/node/content'
import { writeWorldBook } from '../src/node/worldbook'

// npm run worldbook [world ...] (M10.18): content/<world>/WORLDBOOK.md out of the content, for every world or these.

const root = resolve(import.meta.dirname, '../content')
const only = process.argv.slice(2)
for (const world of (await listWorlds(root)).filter((w) => !only.length || only.includes(w.folder))) {
  console.log(`content/${world.folder}/WORLDBOOK.md: ${(await writeWorldBook(root, world.folder)) ? 'written' : 'up to date'}`)
}
