import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, type Output } from '../src/engine'
import type { LlmClient, LlmRejection } from '../src/engine/dialogue/llm'
import { offersFor } from '../src/engine/dialogue/offers'
import { loadContentFromDir } from '../src/node/content'

// M10.33 AG, an agreement never comes out of prose ("Mara agrees to tell Ilyan
// about Tessa", and nobody asked), and AC, an offer looks at the world ("Tessa
// offers to wait with you for Mara" while Mara sat beside her). An offer is
// the game's, and the voice only chooses it in the fixed schema: `action`
// where the player's words ask for that kind of thing, else at most `propose`,
// which waits for the player's yes.

const root = join(import.meta.dirname, '../content')
const isle = await loadContentFromDir(root, 'isle')
const quiet = await loadContentFromDir(root, 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

function scripted(...replies: { reply: string; action?: string; propose?: string }[]): LlmClient & { reports: LlmRejection[] } {
  let i = 0
  const reports: LlmRejection[] = []
  return {
    reports,
    complete: async () => {
      const r = replies[Math.min(i++, replies.length - 1)]!
      const body = { reply: r.reply, names: [], mentioned_topics: [], effects: [], memory_note: 'The stranger talked to me.', ends_conversation: false, keep_talking: 'no', action: r.action ?? 'none', propose: r.propose ?? 'none' }
      return { text: JSON.stringify(body), provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
    report: (r) => reports.push(r),
  }
}

/** Pip beside the stranger, with a voice that answers as scripted. */
function withPip(llm: LlmClient): Engine {
  const engine = new Engine(isle, { seed: 7, llm })
  const s = engine.state.npcs['npc_pip']!
  s.location = engine.state.player.location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + 600
  s.plan = []
  return engine
}

const agreements = (engine: Engine) => engine.state.agreements?.list ?? []

describe('M10.33 AG: an agreement never comes out of prose', () => {
  it('makes nothing of "agrees to" and "will tell" in a reply that proposes nothing', async () => {
    const llm = scripted({ reply: 'Pip nods hard. "I will tell my father. Pip agrees to tell him everything."' }, { reply: 'Pip nods. "He is at the harbour, most days."' })
    const engine = withPip(llm)
    await engine.handle('talk pip')
    const out = text(await engine.handle('Do you know Brannoc?'))
    expect(agreements(engine)).toHaveLength(0)
    expect(engine.status().talk?.proposal).toBeUndefined()
    expect(out).not.toMatch(/agrees to/)
    expect(llm.reports.map((r) => r.reason)).toContain('promise')
  })

  it('takes a choice the player did not ask for as a proposal that waits for yes, and one asked for as done', async () => {
    const engine = withPip(scripted({ reply: 'Pip grins. "Come on, I\'ll take you to him."', action: 'lead:npc_brannoc' }))
    await engine.handle('talk pip')
    await engine.handle('Do you know Brannoc?')
    expect(agreements(engine)).toHaveLength(0)
    expect(engine.status().talk?.proposal).toMatch(/Pip offers to take you/)
    const asked = withPip(scripted({ reply: 'Pip grins. "Come on, then."', action: 'lead:npc_brannoc' }))
    await asked.handle('talk pip')
    expect(text(await asked.handle('Can you take me to your father?'))).toMatch(/Pip agrees to take you/)
    expect(agreements(asked)).toHaveLength(1)
  })
})

describe('M10.33 AC: an offer looks at the world', () => {
  it('offers no leading to, fetching, waiting for or word taken to someone who stands here', () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    const here = engine.state.player.location
    for (const id of ['npc_tessa_rook', 'npc_mara_venn']) engine.world.npcState(id).location = here
    const offers = offersFor(engine.world, 'npc_tessa_rook', ['npc_mara_venn'], 'Could you wait with me for Mara, or fetch her?')
    expect(offers.filter((o) => o.person === 'npc_mara_venn')).toEqual([])
  })

  it('offers no walk to where the stranger stands', () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    const here = engine.state.player.location
    engine.world.npcState('npc_mara_venn').location = here
    expect(offersFor(engine.world, 'npc_mara_venn', [here], 'Can you show me the way here?').filter((o) => o.place === here && o.kind === 'lead')).toEqual([])
  })

  it('offers nothing the stranger already carries, unless they ask for another', () => {
    const engine = new Engine(quiet, { seed: 3, builder: true })
    engine.start()
    const here = engine.state.player.location
    engine.world.npcState('npc_sana_holt').location = here
    engine.world.npcState('npc_sana_holt').inventory['herbal_tea'] = 3
    expect(offersFor(engine.world, 'npc_sana_holt', ['herbal_tea'], 'Could I have some tea?').length).toBeGreaterThan(0)
    engine.state.player.inventory['herbal_tea'] = 1
    expect(offersFor(engine.world, 'npc_sana_holt', ['herbal_tea'], 'Could I have some tea?')).toEqual([])
    expect(offersFor(engine.world, 'npc_sana_holt', ['herbal_tea'], 'Could I have another tea?').length).toBeGreaterThan(0)
  })
})
