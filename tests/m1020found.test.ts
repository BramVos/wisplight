import { describe, expect, it } from 'vitest'
import { discoveredAtlasHtml, discoveredBook, Engine } from '../src/engine'
import { content } from './helpers'

// Milestone M10.20 (Bram, 28 September 2026): an export of everything the
// player has found out so far, as the journal knows it, in the dress of the
// atlas; nothing the stranger has not seen, heard or been told. The whole
// world book is the editor's.

async function walked(): Promise<Engine> {
  const engine = new Engine(content, { seed: 3 })
  engine.start()
  for (const command of ['n', 'e', 'talk mirte', 'ask about bread', 'bye', 'w', 's']) await engine.handle(command)
  return engine
}

describe('M10.20: what you found out', () => {
  it('the journal part by part, each entry with its page; the land as far as seen', async () => {
    const engine = await walked()
    const book = discoveredBook(engine)
    expect(book).toMatch(/^# The Nethermarch: what Traveller found out\n/)
    const chapters = [...book.matchAll(/^## \d+\. (.+)$/gm)].map((m) => m[1])
    expect(chapters.slice(0, 4)).toEqual(['Where things stand', 'The land as you have seen it', 'Quests', 'People'])
    expect(book).toMatch(/\*\*Mirte Bakker\*\*\n\nMirte the baker\./)
    expect(book).toMatch(/\*\*Flour for Veenhoek\*\*/)
    expect(book).toMatch(/<!-- picture:seen -->/)
  })

  it('nothing the stranger has not found out: no one unheard of, no secret untold, no place not known', async () => {
    const engine = await walked()
    const book = discoveredBook(engine)
    const known = new Set(Object.keys(engine.state.player.journal ?? {}))
    for (const npc of content.npcs.values()) {
      if (!known.has(npc.id)) expect(book, npc.name).not.toContain(`**${npc.name}**`)
      for (const secret of npc.secrets) expect(book, `${npc.id}: ${secret.id}`).not.toContain(secret.text)
    }
    // The chronicle of the game knows what happened out of sight: it is not in here.
    expect(book).not.toContain('What happened in this game')
    expect(book).not.toContain('**The Blackmere**')
  })

  it('as a page: the map of what was seen, portraits only of the people met', async () => {
    const engine = await walked()
    const pictures = (id: string) => (id.startsWith('npc_') ? 'data:image/jpeg;base64,AAAA' : undefined)
    const page = discoveredAtlasHtml(engine, pictures, '28 September 2026')
    expect(page).toMatch(/<title>The Nethermarch: what Traveller found out<\/title>/)
    expect(page).toMatch(/<figure class="region"><style>[^<]*<\/style><svg [^>]*aria-label="The land Traveller has seen"/)
    expect(page).toMatch(/<text [^>]*>Veenhoek<\/text>/)
    const portraits = [...page.matchAll(/<figcaption>([^<]+)<small>/g)].map((m) => m[1])
    expect(portraits).toEqual(['Mirte Bakker'])
  })
})
