import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { contractMarkdown } from '../src/engine/contract'

// npm run content:contract (M10.17): docs/CONTENT.md from the schemas, everything a world can have.
writeFileSync(join(import.meta.dirname, '../docs/CONTENT.md'), contractMarkdown(), 'utf8')
console.log('docs/CONTENT.md: written')
