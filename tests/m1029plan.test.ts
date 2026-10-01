import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine } from '../src/engine'
import { personView } from '../src/engine/acquaintance'
import { personColour } from '../src/engine/colour'
import { journalPage } from '../src/engine/journal'
import { planHere, planText } from '../src/engine/plan'
import { loadContentFromDir } from '../src/node/content'

// M10.29 I, a plan of here (set out with Bram on 29 September 2026, the board
// "Wisplight plattegrond van hier"): the places of a settlement the stranger
// knows, laid out from the exits, north up; only data, drawn by the interface
// and as text for PLAN and the area's page of the journal.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const isle = await loadContentFromDir(root, 'isle')
const deepwell = await loadContentFromDir(join(import.meta.dirname, 'worlds'), 'other')

function stranger(): Engine {
  const engine = new Engine(quiet, { seed: 1 })
  engine.start()
  return engine
}
const said = async (engine: Engine, line: string) => (await engine.handle(line)).map((o) => o.text).join('\n')

describe('M10.29 I: a plan of here', () => {
  it('draws Port Vesper after one place, after five steps, and with a place only heard of', async () => {
    const engine = stranger()
    // A plan of one place says nothing (M10.33 R): it comes with the second place known.
    expect(planHere(engine.world)).toBeUndefined()
    // Heard of before it is seen: grey, with a question mark, and no way to it.
    ;(engine.state.player.journal ??= {})['loc_guest_quarters'] = engine.world.now
    const heard = planHere(engine.world)!
    expect(planText(heard)[0]).toBe('Port Vesper, as you know it (2 places; * where you are, ( ) only heard of):')
    expect(heard.boxes.find((b) => b.id === 'loc_guest_quarters')).toMatchObject({ kind: 'heard' })
    expect(heard.links).toEqual([])
    for (const step of ['e', 'e', 'n', 's', 's', 'n']) await engine.handle(step)
    const plan = planHere(engine.world)!
    expect(plan.known).toBe(5)
    // The area's own places lie as they always did, with the Lock Corridor between the lock and the Commons (M10.33 M).
    expect(planText(plan).slice(1, 6)).toEqual([
      '                                      [Guest Quarters]',
      '                                        |',
      '[Arrival Lock]-----[Lock Corridor]----[Commons*]',
      '                                        |',
      '                                      [Medical Bay]',
    ])
    // A way not taken is a stub with only its direction; out is a word at the box.
    expect(plan.stubs).toEqual(expect.arrayContaining([{ from: 'loc_commons', direction: 'northwest' }]))
    expect(plan.boxes.find((b) => b.id === 'loc_commons')!.words).toEqual(['out'])
  })

  it('draws no plan outside a settlement, and one of Port Vesper from the Workshop', async () => {
    const engine = stranger()
    engine.state.player.location = 'loc_coastal_service_path'
    expect(planHere(engine.world)).toBeUndefined()
    expect(await said(engine, 'plan')).toMatch(/^There is no plan of here/)
    engine.state.player.location = 'loc_workshop'
    // The workshops are part of Port Vesper (M10.33 L): the Arrival Lock stands on the same plan, of no other area.
    const plan = planHere(engine.world)!
    expect(plan.area).toBe('Port Vesper')
    expect(plan.boxes.find((b) => b.id === 'loc_arrival_lock')).toMatchObject({ kind: 'seen' })
    expect(plan.boxes.find((b) => b.id === 'loc_arrival_lock')!.other).toBeUndefined()
  })

  it('a click on a place you have seen walks there along the exits; PLAN and the area page give the text', async () => {
    const engine = stranger()
    for (const step of ['e', 'e', 's']) await engine.handle(step)
    const walked = await said(engine, 'walk to Arrival Lock')
    expect(engine.state.player.location).toBe('loc_arrival_lock')
    expect(walked.match(/^Arrival Lock$/gm)).toHaveLength(1)
    expect(walked).not.toMatch(/^Commons$/m)
    expect(walked).not.toMatch(/^Lock Corridor$/m)
    expect(await said(engine, 'plan')).toMatch(/\[Arrival Lock\*\]-+\[Lock Corridor\]-+\[Commons\]/)
    const page = journalPage(engine.world, engine.topics, 'area_port_vesper')
    expect(page?.planText?.[0]).toMatch(/^Port Vesper, as you know it \(4 places/)
  })

  it('shows people you know as dots in their colour where you last saw them, the same colour everywhere', async () => {
    const engine = stranger()
    engine.state.player.location = 'loc_commons'
    ;(engine.state.player.seen ??= []).push('loc_commons')
    ;(engine.state.relations ??= {})['npc_sana_holt'] = { ...(engine.state.relations['npc_sana_holt'] ?? {}), familiarity: 1 } as never
    ;(engine.state.player.people ??= {})['npc_sana_holt'] = { seen: { where: 'loc_commons', t: engine.world.now } } as never
    const colour = personColour(engine.world, 'npc_sana_holt')
    expect(colour).toMatch(/^#[0-9a-f]{6}$/)
    const commons = planHere(engine.world)!.boxes.find((b) => b.id === 'loc_commons')!
    // Seen here now (M10.33 I): a filled dot.
    expect(commons.people).toEqual([{ id: 'npc_sana_holt', name: 'Sana Holt', colour, now: true }])
    expect(personView(engine.world, 'npc_sana_holt').colour).toBe(colour)
    // A world may set it (Skerrow's Maren); Deepwell leaves it out, and gets one from the id.
    expect(personColour({ content: isle }, 'npc_maren')).toBe('#c8643c')
    const someone = [...deepwell.npcs.keys()][0]!
    expect(personColour({ content: deepwell }, someone)).toMatch(/^#[0-9a-f]{6}$/)
    expect(personColour({ content: deepwell }, someone)).toBe(personColour({ content: deepwell }, someone))
  })
})
