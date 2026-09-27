import { describe, expect, it } from 'vitest'
import { chronicle, type ChronicleInput, type ChroniclerModel, type ChroniclerRequest } from '../src/chronicler'

// The chronicler as a module of its own: any application can describe what
// happened in its terms and get lore, notes, requests and news back.

const input: ChronicleInput = {
  instruction: 'Write the lore of a small village.',
  world: 'A village by a river. Plain folk.',
  now: 'Monday 3 May, 04:00',
  lines: [
    {
      id: 'story-7',
      title: "Henk's lost cat",
      summary: [],
      roles: [],
      hooks: [],
      events: [{ id: 'ev-1', when: 'Sunday 2 May 18:00', place: 'mill', who: ['henk'], witnesses: ['anna'], belang: 3, text: "Henk's cat Moor went into the mill and did not come out." }],
      earlier: [],
    },
  ],
  cards: [
    { id: 'henk', kind: 'person', name: 'Henk', text: 'Henk, 60, the miller.' },
    { id: 'anna', kind: 'person', name: 'Anna', text: 'Anna, 30, the baker.' },
    { id: 'mill', kind: 'place', name: 'The Mill', text: 'The old mill by the river.' },
    { id: 'milk', kind: 'item', name: 'jug of milk', text: 'Fresh milk.' },
  ],
  lore: [{ id: 'mill-ghost', kind: 'lore', name: 'The Mill Ghost', text: 'Some say a ghost lives in the mill.' }],
  requests: [],
  areas: [{ id: 'village', kind: 'area', name: 'The Village', text: 'A village by a river.' }],
  templates: [{ kind: 'fetch', text: 'bring the giver an item', needs: ['item'] }],
  older: [{ id: 'story-2', title: 'The flood of last spring' }],
}

function model(replies: (request: ChroniclerRequest) => object): ChroniclerModel & { calls: ChroniclerRequest[] } {
  const calls: ChroniclerRequest[] = []
  return {
    calls,
    complete: async (request) => {
      calls.push(request)
      return { text: JSON.stringify(replies(request)), usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 60 } }
    },
  }
}

const empty = { lookup: [], lore: [], lines: [], quests: [], thoughts: [], news: [] }

describe('the chronicler, on its own', () => {
  it('shows the model short keys and gives back the caller\'s own ids', async () => {
    const m = model(() => ({
      ...empty,
      lore: [{ line: 's1', name: 'The Cat in the Mill', summary: 'A cat went into the mill.', details: "Henk's cat went in and stayed.", story: 'Anna saw it go.', far: 'A cat haunts a mill, they say.', teller: 'p2', links: ['t1'] }],
      quests: [{ request: '', line: 's1', template: 'fetch', giver: 'p1', item: 'i1', target: '', name: 'Milk for Moor', ask: 'Bring me milk to tempt her out?', stakes: 'He misses her.' }],
      news: [{ area: 'a1', text: "Henk's cat is lost in the mill." }],
    }))
    const result = await chronicle(input, m)
    expect(m.calls[0]!.prompt).toMatch(/p1 Henk: Henk, 60, the miller\./)
    expect(m.calls[0]!.prompt).toMatch(/s1 "Henk's lost cat"/)
    expect(m.calls[0]!.system).toMatch(/Write the lore of a small village\./)
    expect(result.output.lore[0]).toMatchObject({ line: 'story-7', teller: 'anna', links: ['mill-ghost'] })
    expect(result.output.quests[0]).toMatchObject({ giver: 'henk', item: 'milk', template: 'fetch' })
    expect(result.output.news[0]).toMatchObject({ area: 'village' })
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, cachedTokens: 60 })
  })

  it('keeps the fixed part of the prompt the same, so it can be cached', async () => {
    const m = model((r) => (r.prompt.includes('LOOKED UP') ? empty : { ...empty, lookup: ['s2'] }))
    await chronicle(input, m, (ids) => ids.map((id) => ({ id, kind: 'lore' as const, name: 'The flood', text: 'The river rose.' })))
    expect(m.calls).toHaveLength(2)
    expect(m.calls[0]!.system).toBe(m.calls[1]!.system)
    expect(m.calls[1]!.prompt).toMatch(/LOOKED UP\n {2}s2 The flood: The river rose\./)
  })

  it('looks things up at most three times', async () => {
    const m = model(() => ({ ...empty, lookup: ['p1'] }))
    const result = await chronicle(input, m, () => [])
    expect(result.calls).toBe(4)
  })

  it('drops what does not fit and keeps the rest', async () => {
    const m = model(() => ({
      ...empty,
      lore: [{ line: 's9', name: 'Nowhere', summary: 'x', details: '', story: '', far: '', teller: '', links: [] }],
      quests: [{ request: '', line: 's1', template: 'fetch', giver: 'p1', item: '', target: '', name: 'Something', ask: 'Bring me something.', stakes: '' }],
      news: [{ area: 'a1', text: 'All quiet.' }],
    }))
    const result = await chronicle(input, m)
    expect(result.output.lore).toEqual([])
    expect(result.output.quests).toEqual([])
    expect(result.output.news).toHaveLength(1)
    expect(result.problems.join(' ')).toMatch(/unknown storyline s9.*fetch needs an item/)
  })

  it('reports a reply that is not JSON instead of failing', async () => {
    const result = await chronicle(input, { complete: async () => ({ text: 'Once upon a time.', usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0 } }) })
    expect(result.problems).toEqual(['the reply is not JSON'])
    expect(result.output.lore).toEqual([])
  })
})
