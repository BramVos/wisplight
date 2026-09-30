import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, type Output } from '../src/engine'
import { setsTask } from '../src/engine/dialogue/guard'
import type { LlmClient, LlmRejection } from '../src/engine/dialogue/llm'
import { loadContentFromDir } from '../src/node/content'

// M10.33 V, what someone asks of the stranger comes from the game (Bram, 30
// September 2026: Ilyan said "Meet me at the Peregrine Hangar in ten minutes,
// bring what you need for the ridge", nothing in the content asked it, and
// the player could not tell a quest from a line). A meeting is only ever an
// offer of the game; a task only what the speaker's story or request gives.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

function scripted(...replies: string[]): LlmClient & { reports: LlmRejection[] } {
  let i = 0
  const reports: LlmRejection[] = []
  return {
    reports,
    complete: async () => {
      const reply = replies[Math.min(i++, replies.length - 1)]!
      const body = { reply, names: [], mentioned_topics: [], effects: [], memory_note: 'The stranger talked to me.', ends_conversation: false, keep_talking: 'no', action: 'none', propose: 'none' }
      return { text: JSON.stringify(body), provider: 'mock', model: 'script-1', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0 }, latencyMs: 1 }
    },
    report: (r) => reports.push(r),
  }
}

async function talkTo(llm: LlmClient, who: string, place: string): Promise<Engine> {
  const engine = new Engine(quiet, { seed: 3, builder: true, llm })
  engine.start()
  for (const c of [`@goto ${place}`, `@bring ${who}`, `talk ${who}`]) await engine.handle(c)
  return engine
}

describe('M10.33 V: what someone asks of the stranger comes from the game', () => {
  it('knows a meeting and a task set for the stranger, and not plain talk', () => {
    expect(setsTask('Ilyan nods. "Meet me at the Peregrine Hangar in ten minutes."')).toBe('meeting')
    expect(setsTask('"Bring what you need for the ridge."')).toBe('task')
    expect(setsTask('"I need you to check the coupling."')).toBe('task')
    expect(setsTask('"The hangar is north of the Commons."')).toBeUndefined()
    expect(setsTask('"Niko went to see the ridge yesterday."')).toBeUndefined()
  })

  it('asks again for a meeting nothing gives, even from the giver of a running quest', async () => {
    const llm = scripted('Ilyan nods. "Meet me at the Peregrine Hangar in ten minutes."', 'Ilyan nods. "Niko will know more than I do."')
    const engine = await talkTo(llm, 'ilyan', 'loc_medical_bay')
    const out = text(await engine.handle('"What happens now?'))
    expect(llm.reports.map((r) => `${r.reason} ${r.detail ?? ''}`)).toContain('invented a meeting nothing gives')
    expect(out).not.toMatch(/Meet me/)
    expect(out).toMatch(/\[?Niko\]? will know more/)
  })

  it('asks again for a task from someone with no matter with the stranger, and lets the giver of a quest ask one', async () => {
    const sana = scripted('Sana nods. "I need you to bring me the crates from the lock."', 'Sana nods. "Not much, love. Tea?"')
    const engine = await talkTo(sana, 'sana', 'loc_commons')
    expect(text(await engine.handle('"Anything I can do?'))).not.toMatch(/bring me the crates/)
    expect(sana.reports.map((r) => r.reason)).toContain('invented')
    const ilyan = scripted('Ilyan nods. "Go and ask Niko Serrin what he has seen."')
    const giver = await talkTo(ilyan, 'ilyan', 'loc_medical_bay')
    expect(text(await giver.handle('"What should I do first?'))).toMatch(/Go and ask/)
    expect(ilyan.reports).toEqual([])
  })

  it('takes directions asked for as no task', async () => {
    const llm = scripted('Sana points. "Go to the lock and turn east; the Workshop is past the gate."')
    const engine = await talkTo(llm, 'sana', 'loc_commons')
    await engine.handle('where is the workshop')
    expect(llm.reports.map((r) => r.reason)).not.toContain('invented')
  })

  it('shows what the journal says to do now beside the talk with the giver', async () => {
    const engine = await talkTo(scripted('Ilyan nods. "Morning."'), 'ilyan', 'loc_medical_bay')
    expect(engine.status().talk?.now).toBe('Ask Niko about the station')
  })
})
