import { describe, expect, it } from 'vitest'
import { Engine, MockLlm, type Content } from '../src/engine'
import { historyOf } from '../src/engine/pasttalks'
import { content } from './helpers'

// M10.29 J (Bram's playtest: what did she say yesterday?): per person a ring
// of the lines of earlier talks in the save (the knob talk.kept_lines, 40);
// the talk window shows the last lines of the talk before, faded above the
// new one, and the journal page of the person has them by day. They never go
// to the model.

const DAY = 24 * 60

async function twoTalks(world: Content = content) {
  const llm = new MockLlm('good')
  const engine = new Engine(world, { seed: 4, llm })
  engine.tick(((10 * 60 - (engine.world.now % DAY)) + DAY) % DAY)
  const stay = () => {
    const s = engine.state.npcs['npc_mirte']!
    Object.assign(s, { location: engine.state.player.location, activity: 'standing about', busyUntil: engine.world.now + 600, plan: [] })
  }
  stay()
  await engine.handle('talk mirte')
  await engine.handle('What bread do you have today?')
  await engine.handle('What happened to the mill?')
  await engine.handle('bye')
  engine.tick(DAY)
  stay()
  await engine.handle('talk mirte')
  return { engine, llm }
}

describe('M10.29 J: earlier talks', () => {
  it('shows the lines of the talk before above the new one, and keeps them on her page by day', async () => {
    const { engine, llm } = await twoTalks()
    const earlier = engine.status().talk!.earlier!
    expect(earlier.when).toMatch(/^\w+ \d+$/)
    expect(earlier.lines.map((l) => l.you)).toContain(true)
    expect(earlier.lines.find((l) => l.you)!.text).toBe('What bread do you have today?')
    expect(earlier.lines.some((l) => !l.you && /Mirte/.test(l.text))).toBe(true)
    // Nothing of it goes to the model.
    await engine.handle('And today?')
    const prompt = llm.calls.filter((c) => c.schemaName === 'npc_reply').at(-1)!
    expect([prompt.prompt, ...(prompt.turns ?? []).map((t) => t.text)].join('\n')).not.toMatch(/What bread do you have today/)
    // Her page (M10.29 R): About says where you left it; History has every talk, by day, the newest first.
    const page = engine.page('npc_mirte')!
    expect(page.lines.some((l) => /^Last time: /.test(l))).toBe(true)
    expect(page.history![0]!.talks.at(-1)!.length).toBeGreaterThan(0)
    const older = page.history!.flatMap((d) => d.talks).flat()
    expect(older).toContainEqual({ you: true, text: 'What bread do you have today?' })
    const text = (await engine.handle('journal mirte history')).map((o) => o.text).join('\n')
    expect(text).toMatch(/every talk:\n\w+ \d+:/)
    expect(text).toMatch(/ {2}You: "What bread do you have today\?"/)
    expect((await engine.handle('journal mirte')).map((o) => o.text).join('\n')).toMatch(/JOURNAL mirte HISTORY/)
    expect((await engine.handle('help')).map((o) => o.text).join('\n')).toMatch(/journal <person> history/)
  }, 60_000)

  it('lets an older talk leave the ring whole', async () => {
    const few: Content = { ...content, world: { ...content.world, knobs: { ...content.world.knobs, 'talk.kept_lines': 5 } } }
    const { engine } = await twoTalks(few)
    await engine.handle('And today, what is new?')
    const ring = engine.state.pastTalks!['npc_mirte']!
    expect(ring.length).toBeLessThanOrEqual(5)
    // Only whole talks: the first line kept is the first line of its talk.
    expect(new Set(ring.map((l) => l.talk)).size).toBe(1)
  }, 60_000)

  it('groups the lines of an old save, which have no talk, by how close they were said', () => {
    const engine = new Engine(content, { seed: 4 })
    const t = engine.world.now
    engine.state.pastTalks = {
      npc_mirte: [
        { t, you: true, text: 'Morning.' },
        { t, you: false, text: 'Mirte nods.' },
        { t: t + 2, you: true, text: 'Any rye?' },
        { t: t + 2, you: false, text: 'Mirte: "Tomorrow."' },
        { t: t + 300, you: true, text: 'Back again.' },
      ],
    }
    const talks = historyOf(engine.world, 'npc_mirte').flatMap((d) => d.talks)
    expect(talks.map((talk) => talk.length)).toEqual([4, 1])
  })

  it('keeps at most the knob of lines, and none at nought', async () => {
    const few: Content = { ...content, world: { ...content.world, knobs: { ...content.world.knobs, 'talk.kept_lines': 3 } } }
    expect((await twoTalks(few)).engine.state.pastTalks!['npc_mirte']!.length).toBeLessThanOrEqual(3)
    const none: Content = { ...content, world: { ...content.world, knobs: { ...content.world.knobs, 'talk.kept_lines': 0 } } }
    const { engine } = await twoTalks(none)
    expect(engine.state.pastTalks?.['npc_mirte']).toBeUndefined()
    expect(engine.status().talk!.earlier).toBeUndefined()
  }, 60_000)
})
