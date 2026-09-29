import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadContent, MockLlm } from '../src/engine'
import { mapStepRequest, readMapStep } from '../src/engine/editor'
import { readContentFiles } from '../src/node/content'

// M10.25: the map belongs to the world build. After the last step the editor
// lays the region map out from the places and has the Palette step paint it,
// as one proposal with a diff, as the steps have.

const deepwell = () => readContentFiles(resolve(import.meta.dirname, 'worlds'), 'other')

describe('M10.25: the map after the world steps', () => {
  it('lays a world without a map out from its places and has the Palette step paint it, in one proposal', async () => {
    const files = await deepwell()
    expect(loadContent(files).regions.size).toBe(0)
    const { layout, request } = mapStepRequest(files, 'Ice under a black sky; the Domes glow, the rest is dark rock.')
    expect(layout.changes.some((c) => c.kind === 'region')).toBe(true)
    expect(request.schemaName).toBe('world_step')
    expect(request.meta).toMatchObject({ step: 'palette', map: true })
    // The Palette step sees the region just laid out, and the designer's words.
    expect(request.prompt).toMatch(/Ice under a black sky/)
    expect(request.prompt).toMatch(/Paint the region map just laid out/)
    const draft = readMapStep(files, layout, (await new MockLlm().complete(request)).text)
    expect(draft.problems).toEqual([])
    const content = draft.result!.content!
    expect(content.regions.size).toBe(1)
    expect(content.world.pictures?.style).toMatch(/Ice under a black sky/)
  })

  it('makes one change of a thing both the layout and the painting touch, the painting over the layout', async () => {
    const files = await deepwell()
    const { layout } = mapStepRequest(files, '')
    const region = layout.changes.find((c) => c.kind === 'region')!
    const reply = JSON.stringify({ say: 'Painted.', questions: [], changes: [{ kind: 'region', id: region.id, merge: true, yaml: 'name: The Crater Floor\n' }], world: '', rules: '', files: [] })
    const draft = readMapStep(files, layout, reply)
    expect(draft.problems).toEqual([])
    expect(draft.changes.filter((c) => c.kind === 'region')).toHaveLength(1)
    const made = draft.result!.content!.regions.get(region.id)!
    expect(made.name).toBe('The Crater Floor')
    // What the layout set stays: its drawing, its size and where it lies.
    const laid = loadContent(layout.result!.files).regions.get(region.id)!
    expect([made.zones, made.size, made.origin]).toEqual([laid.zones, laid.size, laid.origin])
  })
})
