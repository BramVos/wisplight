import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { withReference } from '../src/engine/quests/reference'

// Writes the reference of the plan language into content/CHRONICLER.md (M8.3),
// between its markers, from the schemas and the permission table.

const file = resolve(import.meta.dirname, '../content/CHRONICLER.md')
await writeFile(file, withReference(await readFile(file, 'utf8')))
console.log('content/CHRONICLER.md: reference written')
