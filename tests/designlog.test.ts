import { describe, expect, it } from 'vitest'
import { designLog, designPrompt, designText, withDesign, type DesignLog } from '../src/engine/designlog'

// The design log of a world (M10.18): what was asked, said and decided, the
// designer's notes, and the answers still being written.

const empty: DesignLog = { notes: [], answers: {}, decisions: [] }
const at = new Date(2026, 8, 28, 14, 3)

describe('the design log', () => {
  it('keeps a note, an answer being written and a decision, and reads back what it wrote', () => {
    let log = withDesign(empty, { note: 'There is no faith here: the reach remembers what the gods did.' })
    log = withDesign(log, { answer: { step: 'Calendar and weather', text: '| Month | Days |\n| --- | --- |\n| Thaw | 30 |\n## 2. Money\nCopper only.' } })
    log = withDesign(log, { decision: { step: 'Frame', decision: 'accepted', asked: 'A quiet reach of islands.\nNo magic.', say: 'A frame for a quiet reach.', questions: ['Who lives there?'], changed: ['world: frame, words', 'CHRONICLER.md'], reason: '' } }, at)
    const text = designText('The Quiet Reach', log)
    expect(text).toMatch(/^# Design log: The Quiet Reach\n\n## Notes\n- There is no faith here/)
    expect(text).toContain('### 2026-09-28 14:03 · Frame · accepted\n- Asked: A quiet reach of islands.\n  No magic.\n- Chronicler: A frame for a quiet reach.\n- Questions back: Who lives there?\n- Changed: world: frame, words\n  CHRONICLER.md')
    // A pasted heading in an answer is indented, so it cannot break the log.
    expect(text).toContain('### Calendar and weather\n  | Month | Days |\n  | --- | --- |\n  | Thaw | 30 |\n  ## 2. Money\n  Copper only.')
    expect(designLog(text)).toEqual(log)
  })

  it('clears the answer of a step once it is decided, and keeps it while the designer asks again', () => {
    let log = withDesign(empty, { answer: { step: 'Money', text: 'Copper only.' } })
    log = withDesign(log, { decision: { step: 'Money', decision: 'changed', asked: 'Copper only.', say: 'One coin.', questions: [], changed: [], reason: 'asked again' } }, at)
    expect(log.answers['Money']).toBe('Copper only.')
    log = withDesign(log, { decision: { step: 'Money', decision: 'rejected', asked: 'Copper only.', say: 'One coin.', questions: [], changed: [], reason: 'Too plain.' } }, at)
    expect(log.answers['Money']).toBeUndefined()
    const skipped = designLog(designText('X', withDesign(empty, { decision: { step: 'Faiths', decision: 'skipped', asked: '', say: '', questions: [], changed: [], reason: '' } }, at)))
    expect(skipped.decisions).toEqual([{ at: '2026-09-28 14:03', step: 'Faiths', decision: 'skipped', asked: '', say: '', questions: [], changed: [], reason: '' }])
  })

  it('tells the chronicler the notes and the last decisions, with what was turned down and why', () => {
    let log = withDesign(empty, { note: 'No faith.' })
    log = withDesign(log, { decision: { step: 'Money', decision: 'rejected', asked: 'Gold and silver.', say: 'Crowns.', questions: [], changed: ['world: money'], reason: 'No crowns: there is no king.' } }, at)
    const files = [
      { path: 'reach/world.yaml', text: 'world: {}' },
      { path: 'reach/DESIGN.md', text: designText('The Quiet Reach', log) },
    ]
    const prompt = designPrompt(files)
    expect(prompt).toMatch(/^WHAT THE DESIGNER HAS SAID AND DECIDED BEFORE/)
    expect(prompt).toContain('- No faith.')
    expect(prompt).toContain('- Money, rejected (world: money): Gold and silver. Reason: No crowns: there is no king.')
    expect(designPrompt([{ path: 'reach/world.yaml', text: 'world: {}' }])).toBe('')
  })

  it('reads a log edited by hand, leaving out what does not fit', () => {
    const log = designLog('# Design log: X\n\n## Notes\n- one\nstray line\n- two\n\n## Decisions\n### not a heading\n- Asked: lost\n### 2026-01-02 03:04 · Places · accepted\n- Asked: a harbour\n')
    expect(log.notes).toEqual(['one', 'two'])
    expect(log.decisions).toHaveLength(1)
    expect(log.decisions[0]).toMatchObject({ step: 'Places', decision: 'accepted', asked: 'a harbour' })
  })
})
