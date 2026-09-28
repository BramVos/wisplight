import { describe, expect, it } from 'vitest'
import { loadContent } from '../src/engine'
import { designText, withDesign, type DesignLog } from '../src/engine/designlog'
import { newWorldFiles } from '../src/engine/editor'
import { worldBook } from '../src/engine/worldbook'
import { WORLD_STEPS } from '../src/engine/worldguide'

// Milestone M10.20 (docs/ROADMAP.md), the world book's part: a step the
// designer skips is simply empty, and the book says which steps were left to
// the neutral default in "How this world was made".

const tiny = loadContent(newWorldFiles('reach', 'The Reach'))
const title = (id: string) => WORLD_STEPS.find((s) => s.id === id)!.title

function decide(log: DesignLog, step: string, decision: 'accepted' | 'changed' | 'rejected' | 'skipped', at: string): DesignLog {
  return withDesign(log, { decision: { step, decision, asked: 'Something.', say: '', questions: [], changed: [], reason: '', at } })
}

describe('M10.20: the steps left out, in the world book', () => {
  it('names each step that was skipped, turned down or never taken up, with its neutral default', () => {
    let log: DesignLog = { notes: ['There is no faith here, on purpose.'], answers: {}, decisions: [] }
    for (const step of WORLD_STEPS) if (step.id !== 'faiths' && step.id !== 'watcher' && step.id !== 'palette') log = decide(log, step.title, 'accepted', '2026-09-28 10:00')
    log = decide(log, title('faiths'), 'skipped', '2026-09-28 10:05')
    // Turned down, then asked again with a new answer: still not taken.
    log = decide(log, title('palette'), 'rejected', '2026-09-28 10:06')
    log = decide(log, title('palette'), 'changed', '2026-09-28 10:07')
    const book = worldBook(tiny, { design: designText('The Reach', log) })
    const chapter = book.slice(book.indexOf('How this world was made'))
    expect(chapter).toMatch(/### The steps of the guide/)
    expect(chapter).toContain(`- **${title('faiths')}** (skipped): ${WORLD_STEPS.find((s) => s.id === 'faiths')!.skipped}`)
    expect(chapter).toContain(`- **${title('palette')}** (proposal turned down):`)
    expect(chapter).toContain(`- **${title('watcher')}** (not taken up):`)
    expect(chapter).not.toContain(`**${title('frame')}**`)
    // The notes follow.
    expect(chapter).toMatch(/There is no faith here, on purpose\./)
  })

  it('every step taken says so; a log without steps says nothing about them', () => {
    let log: DesignLog = { notes: [], answers: {}, decisions: [] }
    for (const step of WORLD_STEPS) log = decide(log, step.title, 'accepted', '2026-09-28 11:00')
    expect(worldBook(tiny, { design: designText('The Reach', log) })).toMatch(/Every step of the guide was taken\./)
    const notesOnly = worldBook(tiny, { design: designText('The Reach', { notes: ['Made by hand.'], answers: {}, decisions: [] }) })
    expect(notesOnly).not.toMatch(/The steps of the guide/)
    expect(notesOnly).toMatch(/Made by hand\./)
  })
})

describe('M10.20: the world book as an atlas page', () => {
  it('the same text as the plain page, with the region, the cards, the swatches, the plates and the gallery', async () => {
    const { content } = await import('./helpers')
    const { worldAtlasHtml } = await import('../src/engine/worldatlas')
    const { worldBookHtml } = await import('../src/engine/worldbook')
    const markdown = worldBook(content, { folder: 'base' })
    const pictures = (id: string) => (id === 'area_veenhoek' || id === 'npc_mirte' ? 'data:image/jpeg;base64,AAAA' : undefined)
    const atlas = worldAtlasHtml(content, markdown, pictures, { written: '28 September 2026' })
    // A sheet per chapter, in the order of the book, and the date in the header.
    const titles = [...markdown.matchAll(/^## \d+\. (.+)$/gm)].map((m) => m[1])
    expect([...atlas.matchAll(/<section class="sheet ch-[^"]+" id="[^"]+"><header class="sheet-head"><div class="folio">Chapter<strong>\d+<\/strong><\/div><h2>([^<]+)<\/h2>/g)].map((m) => m[1])).toEqual(titles)
    expect(atlas).toContain('Written 28 September 2026')
    // The region in the world's own palette, with its places.
    const fen = content.world.map!.palette!.paper.terrain['fen']![0]!
    expect(atlas).toMatch(new RegExp(`\\.region \\.t-fen-0\\{fill:${fen}\\}`))
    expect(atlas).toMatch(/<text [^>]*>Veenhoek<\/text>/)
    // The coins and the calendar as cards, in place of their table and line: said once.
    expect(atlas).toMatch(/<div class="card"><b class="mark">gl<\/b><span class="name">guilder<\/span>/)
    expect(atlas).not.toMatch(/<th>Coin<\/th>/)
    expect(atlas).toMatch(/<span class="name">Louwmaand<\/span><span class="worth">30 days<\/span>/)
    expect(atlas).not.toMatch(/<p>Months: /)
    // The palette as swatches, the pictures there are, and nothing where there is none.
    expect(atlas).toMatch(/<div class="swatches">/)
    expect(atlas.match(/<figure class="plate">/g)).toHaveLength(1)
    expect(atlas).toMatch(/<div class="gallery"><figure><img src="data:image\/jpeg;base64,AAAA" alt="" loading="lazy"><figcaption>Mirte Bakker<small>/)
    // The plain page keeps the text and leaves the atlas's drawings out.
    const plain = worldBookHtml(content, markdown, pictures)
    expect(plain).toMatch(/<th>Coin<\/th>/)
    expect(plain).not.toMatch(/class="region"|class="cards|class="swatches"/)
  })

  it('a world without a region, coins or a palette of its own has no map, no cards and no swatches', async () => {
    const { worldAtlasHtml } = await import('../src/engine/worldatlas')
    const atlas = worldAtlasHtml(tiny, worldBook(tiny), () => undefined)
    expect(atlas).not.toMatch(/<figure class="region">|class="cards coins"|class="swatches"|class="gallery"/)
    expect(atlas).toMatch(/<h1>The Reach<\/h1>/)
  })

  it('a book takes the latest picture of a subject when the description changed since; the game does not', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { content } = await import('./helpers')
    const { cachedPictureIn } = await import('../src/node/worldbook')
    const dir = mkdtempSync(join(tmpdir(), 'wisplight-pictures-'))
    mkdirSync(join(dir, 'pictures', content.world.id), { recursive: true })
    writeFileSync(join(dir, 'pictures', content.world.id, 'area_veenhoek-00000000.jpg'), 'old')
    expect(cachedPictureIn(dir, content, 'area_veenhoek')).toBeUndefined()
    expect(cachedPictureIn(dir, content, 'area_veenhoek', { latest: true })).toBe(`data:image/jpeg;base64,${Buffer.from('old').toString('base64')}`)
    // Another subject whose id begins the same is never taken for it.
    const other = mkdtempSync(join(tmpdir(), 'wisplight-pictures-'))
    mkdirSync(join(other, 'pictures', content.world.id), { recursive: true })
    writeFileSync(join(other, 'pictures', content.world.id, 'area_veenhoek_quay-00000000.jpg'), 'quay')
    expect(cachedPictureIn(other, content, 'area_veenhoek', { latest: true })).toBeUndefined()
  })
})
