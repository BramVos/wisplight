import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readLock, withLock } from '../src/engine/edit'
import { listWorlds, readContentFiles } from '../src/node/content'

// Writes the register of ids of every world (M9.1): each id there is now,
// and the tombstones of those that went. The editor keeps it up to date on
// every save; this is for content written by hand.

const root = resolve(import.meta.dirname, '../content')
for (const world of await listWorlds(root)) {
  const files = await readContentFiles(root, world.folder)
  const next = withLock(files, readLock(files))
  for (const file of next.filter((f) => /ids\.lock$/.test(f.path) && files.find((o) => o.path === f.path)?.text !== f.text)) {
    await writeFile(resolve(root, file.path), file.text)
    console.log(`content/${file.path}: written`)
  }
}
