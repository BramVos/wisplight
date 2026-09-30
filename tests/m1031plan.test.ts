import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { planHere, type PlanData } from '../src/engine/plan'
import { loadContentFromDir } from '../src/node/content'
import { planLayout } from '../src/renderer/src/PlanView'

// M10.31 A, the plan as a window (Bram, 30 September 2026: the plan of here
// does not scroll and is hard to see). A click on the small plan or [Plan]
// opens it about twice the size with the whole area in it; an area that does
// not fit moves with the wheel and by dragging, from where you are in the
// middle. Checked in the browser on Port Vesper and on Waagdam; here the
// layout both use.

const root = join(import.meta.dirname, '../content')

/** A game that has been to these places, standing at the last. */
async function been(world: string, places: string[]): Promise<PlanData> {
  const engine = new Engine(await loadContentFromDir(root, world), { seed: 2, builder: true })
  engine.start()
  for (const place of places) await engine.handle(`@goto ${place}`)
  return planHere(engine.world)!
}

describe('M10.31 A: the plan as a window', () => {
  it('fits Port Vesper small and large, the window bigger', async () => {
    const plan = await been('quietreach', ['loc_arrival_lock', 'loc_guest_quarters', 'loc_medical_bay', 'loc_commons'])
    const small = planLayout(plan, false, { x: 0, y: 0 })
    const large = planLayout(plan, true, { x: 0, y: 0 })
    expect([small.fits, large.fits]).toEqual([true, true])
    expect(large.view.w * large.view.h).toBeGreaterThanOrEqual(4 * small.view.w * small.view.h)
    expect(large.cell.w).toBeGreaterThan(small.cell.w)
  })

  it('shows the whole of Waagdam in the window, while the small plan keeps where you are in the middle and moves', async () => {
    const places = ['west_gate', 'gate_street', 'harbour', 'smithy', 'market', 'waag', 'weighing_room', 'dirck_house', 'church', 'de_schaal', 'town_hall', 'notary', 'canal_street', 'market'].map((p) => `loc_waagdam_${p}`)
    const plan = await been('base', places)
    expect(plan.boxes.length).toBeGreaterThan(9)
    expect(planLayout(plan, true, { x: 0, y: 0 }).fits).toBe(true)
    const small = planLayout(plan, false, { x: 0, y: 0 })
    expect(small.fits).toBe(false)
    const here = plan.boxes.find((b) => b.kind === 'here')!
    expect(small.shift.x + (here.col + 0.5) * small.cell.w).toBeCloseTo(small.view.w / 2)
    // The wheel or a drag moves it, and never further than a little past the edge of the area.
    const moved = planLayout(plan, false, { x: -60, y: 0 })
    expect(moved.shift.x).toBeCloseTo(small.shift.x - 60)
    const far = planLayout(plan, false, { x: 5000, y: -5000 })
    expect(far.shift.x).toBe(24)
    const cols = Math.max(...plan.boxes.map((b) => b.col)) + 1
    expect(far.shift.x + cols * far.cell.w).toBeGreaterThan(0)
  })

  it('lets a window move too, when an area is larger than it', () => {
    const plan: PlanData = { area: 'Long Street', known: 20, links: [], stubs: [], boxes: Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, name: `Place ${i}`, kind: i === 3 ? 'here' : 'seen', col: i, row: 0, words: [], people: [] })) } as PlanData
    const large = planLayout(plan, true, { x: 0, y: 0 })
    expect(large.fits).toBe(false)
    expect(large.shift.x + 3.5 * large.cell.w).toBeCloseTo(large.view.w / 2)
  })
})
