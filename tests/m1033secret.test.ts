import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, type Output } from '../src/engine'
import type { Content } from '../src/engine/content'
import { solvableProblems } from '../src/engine/quests/solvable'
import { loadContentFromDir } from '../src/node/content'

// M10.33 U, a secret with a right (Bram, 30 September 2026: "iets simpels als
// een code krijgen is een crime"; an honest question with a good reason for
// the hangar code did nothing, behind a roll nobody saw). A secret may say
// when its keeper gives it (given_when): whoever asks about it then gets it
// without a roll. Without the right the game says so in view, and Check names
// a code a quest needs that only a roll gets.

const root = join(import.meta.dirname, '../content')
const quiet = await loadContentFromDir(root, 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

async function askTessa(flags: Record<string, boolean> = {}): Promise<{ engine: Engine; out: string }> {
  const engine = new Engine(quiet, { seed: 3, builder: true })
  engine.start()
  Object.assign((engine.state.flags ??= {}), flags)
  for (const c of ['@goto loc_workshop', '@bring tessa', 'talk tessa']) await engine.handle(c)
  return { engine, out: text(await engine.handle('ask tessa about the peregrine hangar')) }
}

describe('M10.33 U: a secret with a right', () => {
  it('keeps the hangar code in view before it matters: no hidden roll, and a way to go on', async () => {
    const { engine, out } = await askTessa()
    expect(out).toMatch(/Tessa keeps that close\. PERSUADE her, or ask again when it matters to what you are doing\./)
    expect(out).not.toMatch(/7411|seven four one one/i)
    expect(engine.state.flags?.['secret:npc_tessa_rook:hangar_code']).toBeUndefined()
  })

  it('gives the hangar code without a roll once the story needs the hangar', async () => {
    const { engine, out } = await askTessa({ story_the_orison_recordings_3: true })
    expect(out).toMatch(/seven four one one|7411/i)
    expect(engine.state.flags?.['secret:npc_tessa_rook:hangar_code']).toBe(true)
  })

  it('has Maren on Skerrow own up to the beacon oil to a castaway', async () => {
    const engine = new Engine(await loadContentFromDir(root, 'isle'), { seed: 3, builder: true })
    engine.start()
    for (const c of ['@goto loc_skerrow_salt_kettle', '@bring maren', 'talk maren', 'ask maren about the beacon']) await engine.handle(c)
    expect(engine.state.flags?.['secret:npc_maren:kept_the_oil']).toBe(true)
  })

  it('names a code a quest needs that only a roll gets, and not once someone gives it by right', () => {
    const tessa = quiet.npcs.get('npc_tessa_rook')!
    const withCode = (given_when: unknown[]): Content => {
      const npcs = new Map(quiet.npcs).set(tessa.id, { ...tessa, secrets: [...tessa.secrets, { id: 'passphrase', text: 'The night shift answers to the word amberline.', hint: 'She hums when the night shift comes up.', dc: 16, about: [], given_when } as never] })
      return { ...quiet, npcs }
    }
    const main = quiet.quests.get('story_the_orison_recordings')!
    const quest = { ...main, stages: main.stages!.map((s, i) => (i ? s : { ...s, next: [{ when: [{ said: 'amberline', to: tessa.id }], to: main.stages![1]!.id, effects: [] }] })) } as typeof main
    expect(solvableProblems(withCode([]), quest).join('\n')).toMatch(/the word "amberline" is told only in a secret that takes a roll/)
    expect(solvableProblems(withCode([{ flag: 'story_the_orison_recordings_1' }]), quest).join('\n')).not.toMatch(/amberline/)
  })
})
