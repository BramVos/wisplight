import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, loadContent, MockLlm, markdownHtml } from '../src/engine'
import { newWorldFiles } from '../src/engine/editor'
import { worldBook } from '../src/engine/worldbook'
import { loadContentFromDir } from '../src/node/content'
import { worldBookFor } from '../src/node/worldbook'

// Milestone M10.18 (docs/ROADMAP.md): a world book per world, out of the
// content, never behind it; the chapters of the Nethermarch's book, and a
// kind the world does not have gives no chapter.

const root = resolve(import.meta.dirname, '../content')
const chapters = (book: string) => [...book.matchAll(/^## \d+\. (.+)$/gm)].map((m) => m[1])

describe('M10.18: the world book', () => {
  it('the books of the built-in worlds are what their content says (npm run worldbook)', async () => {
    for (const world of ['base', 'isle']) expect(readFileSync(join(root, world, 'WORLDBOOK.md'), 'utf8'), world).toBe(await worldBookFor(root, world))
  })

  it('the Nethermarch reads in the order of its own world book, then what the contract has besides', () => {
    const book = readFileSync(join(root, 'base', 'WORLDBOOK.md'), 'utf8')
    expect(chapters(book)).toEqual(['The world', 'The map of the land', 'History and lore', 'Powers', 'Faith', 'Towns and villages', 'The starting region', 'Places', 'People', 'Secrets and stories', 'Bestiary', 'Coins, measures and calendar', 'Quests', 'Names and speech', 'Trades and crafts', 'Transport', 'What happens when', 'The rules in short', 'The look and sound of the world'])
    expect(book).toMatch(/\| Mirte Bakker \|/)
    expect(book).toMatch(/When improvised \(old stone\) \(a signal of the game itself\): word goes round: "a dog barking across the water in the night"/)
    expect(book).toMatch(/a mark at The Kabouterberg: "The bowl at the mouth of the hollow is empty this morning/)
  })

  it('Deepwell gets its own book: no faith, no bestiary, no rules; and never a Nethermarch word', async () => {
    const deepwell = await loadContentFromDir(join(import.meta.dirname, 'worlds'), 'other')
    const book = worldBook(deepwell, { folder: 'other' })
    expect(chapters(book)).not.toContain('Faith')
    expect(chapters(book)).not.toContain('Bestiary')
    expect(chapters(book)).not.toContain('The rules in short')
    expect(chapters(book)).toContain('Transport')
    expect(book).not.toMatch(/\b(Nethermarch|Holleveen|guilder|stuiver|schout|Lantern)\b/)
  })

  it('the smallest world has a small book; a design log becomes its last chapter', () => {
    const tiny = loadContent(newWorldFiles('tiny', 'Tiny'))
    expect(chapters(worldBook(tiny))).toEqual(['The world', 'The starting region', 'Places', 'People', 'Trades and crafts'].filter((c) => c !== 'People'))
    const withLog = worldBook(tiny, { design: '# Design log\n\n2026-09-28: no faith in this world, on purpose.' })
    expect(chapters(withLog).at(-1)).toBe('How this world was made')
    expect(withLog).toMatch(/no faith in this world, on purpose/)
  })

  it('the book as a web page: a picture where there is one, the rest as text', () => {
    const html = markdownHtml('## 8. Places\n\n### Veenhoek\n\n<!-- picture:area_veenhoek -->\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n', (key) => (key === 'area_veenhoek' ? '<figure>V</figure>' : undefined))
    expect(html).toBe('<h2>8. Places</h2>\n<h3>Veenhoek</h3>\n<figure>V</figure>\n<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>')
  })
})

describe('M10.18: the chronicle of a game', () => {
  it('what happened in this game, as Markdown: events, what was improvised, the chronicler\'s stories', async () => {
    const engine = new Engine((await import('./helpers')).content, { seed: 41, builder: true, llm: new MockLlm('good') })
    engine.start()
    await engine.handle('@goto loc_kabouterberg')
    engine.state.player.inventory['milk'] = 1
    await engine.handle('pour milk on the oak')
    engine.tick(24 * 60)
    const md = engine.chronicleMarkdown()
    expect(md).toMatch(/^# What happened in this game\n\nThe Nethermarch, /)
    expect(md).toMatch(/## Events\n/)
    expect(md).toMatch(/## What the stranger improvised\n\n- \*\*[^*]+:\*\* pour milk on the oak\. You pour and wait/)
  })
})
