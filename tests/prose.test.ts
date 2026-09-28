import { describe, expect, it } from 'vitest'
import { blocks } from '../src/renderer/src/Prose'

// Milestone M10.20 (docs/ROADMAP.md): the chronicler's explanation as text to
// read. Found building The Quiet Reach: its bold and lists showed as stars
// and dashes in one block.

describe('M10.20: the chronicler says it in paragraphs, bold and lists', () => {
  it('reads paragraphs, lists with a nested level, and a line that goes on from an item', () => {
    const say = `Here is the frame for The Quiet Reach, built from what you wrote. Where things stand:

- **Frame.** The WORLD part covers the setting,
  the technology and the limits.
- **Not changed yet.**
  - The starting place still has the id loc_first_place.
  - The true origin of the signal is fixed truth.
1. Money first.
2. Then faith.

That is all.`
    expect(blocks(say)).toEqual([
      { kind: 'p', text: 'Here is the frame for The Quiet Reach, built from what you wrote. Where things stand:' },
      {
        kind: 'ul',
        items: [
          { text: '**Frame.** The WORLD part covers the setting, the technology and the limits.', sub: [] },
          { text: '**Not changed yet.**', sub: ['The starting place still has the id loc_first_place.', 'The true origin of the signal is fixed truth.'] },
        ],
      },
      { kind: 'ol', items: [{ text: 'Money first.', sub: [] }, { text: 'Then faith.', sub: [] }] },
      { kind: 'p', text: 'That is all.' },
    ])
  })
})

describe('M10.20: as the editor shows it', () => {
  it('bold, lists and code become elements; markup in the text stays text', async () => {
    const { createElement } = await import('react')
    const { renderToStaticMarkup } = await import('react-dom/server')
    const { Prose } = await import('../src/renderer/src/Prose')
    const html = renderToStaticMarkup(createElement(Prose, { text: 'Where things stand:\n\n- **Frame.** set, with `loc_first_place`\n  - one *level* down\n\n<script>alert(1)</script> stays text.' }))
    expect(html).toBe('<div class="prose"><p>Where things stand:</p><ul><li><strong>Frame.</strong> set, with <code>loc_first_place</code><ul><li>one <em>level</em> down</li></ul></li></ul><p>&lt;script&gt;alert(1)&lt;/script&gt; stays text.</p></div>')
  })
})
