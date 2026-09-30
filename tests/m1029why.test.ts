import { describe, expect, it } from 'vitest'
import { Engine, loadContent, MockLlm, type Content } from '../src/engine'
import { readContentFiles } from '../src/node/content'
import { content } from './helpers'

// M10.29 C (Bram's playtest: why am I here, and whom do I know?): who the
// stranger came as, the reason, whom to ask for, who knows them from before
// and how, once at arrival, on the page of that person and to the speaker; a
// page "Why you are here"; the world's intro as a moment card; and a world
// without classes (The Quiet Reach) that has backgrounds all the same.

const said = (outs: { text: string }[]) => outs.map((o) => o.text).join('\n')
const load = async (root: string, world: string): Promise<Content> => loadContent(await readContentFiles(root, world))

describe('M10.29 C: why you are here', () => {
  it('opens The Quiet Reach with its intro as a card, the reason, whom to ask for, and the page Why you are here', async () => {
    const reach = await load('content', 'quietreach')
    const engine = new Engine(reach, { seed: 1 })
    const start = engine.start()
    expect(start[0]).toMatchObject({ kind: 'card', card: { kind: 'intro', title: 'The Quiet Reach', link: 'why' } })
    expect(said(start)).toMatch(/You keep old machines alive for a living/)
    expect(said(start)).toMatch(/You were told to ask for the research lead/)
    // One line for what is in the journal (M10.33 B).
    expect(said(start)).toMatch(/Why you are here, and the name, are in your journal \(J\)\./)
    const why = engine.page('why')!
    expect(why.name).toBe('Why you are here')
    expect(why.lines[0]).toMatch(/^The supply ship settles onto the pad/)
    expect(why.lines.join('\n')).toMatch(/You came as a systems engineer\. You could have come as someone else/)
    expect(why.lines.join('\n')).toMatch(/ {2}BACKGROUND Signal linguist: /)
    expect(why.links).toContainEqual({ id: 'npc_ilyan_sorell', name: 'Ilyan', label: 'ask for' })
  })

  it('lets a stranger in a world without classes choose who they came as, once, and who knows them from before and how', async () => {
    const reach = await load('content', 'quietreach')
    const llm = new MockLlm('good')
    const engine = new Engine(reach, { seed: 1, llm })
    engine.start()
    const chose = said(await engine.handle('background signal linguist'))
    expect(chose).toMatch(/You came as a signal linguist\./)
    expect(chose).toMatch(/You know Niko, you have traded notes on the transmission with him by relay for weeks\./)
    expect(said(await engine.handle('background navigator'))).toMatch(/You came as a signal linguist; that does not change now\./)
    expect(engine.page('npc_niko_serrin')!.lines).toContain('You know Niko from before: you have traded notes on the transmission with him by relay for weeks.')
    // The speaker knows it too.
    const niko = engine.state.npcs['npc_niko_serrin']!
    Object.assign(niko, { location: engine.state.player.location, activity: 'standing about', busyUntil: engine.world.now + 600, plan: [] })
    await engine.handle('talk niko')
    await engine.handle('How is the work going?')
    const prompt = llm.calls.filter((c) => c.schemaName === 'npc_reply').at(-1)!.prompt
    expect(prompt).toMatch(/YOU KNOW THE STRANGER from before \(as they would put it: you have traded notes on the transmission/)
  })

  it('leaves the background to CREATE in a world with classes, and Deepwell plays the intro alone', async () => {
    const engine = new Engine(content, { seed: 1 })
    engine.start()
    expect(said(await engine.handle('background smuggler'))).toMatch(/Your background comes with who you are/)
    const deepwell = await load('tests/worlds', 'other')
    const other = new Engine(deepwell, { seed: 1 })
    const start = other.start()
    if (deepwell.world.intro) expect(start[0]).toMatchObject({ kind: 'card', card: { kind: 'intro' } })
    expect(other.page('why')!.lines.join('\n')).not.toMatch(/BACKGROUND /)
  })

  it('checks a background: two skills where there are classes, and people who are people of the world', async () => {
    const files = await readContentFiles('content', 'quietreach')
    const odd = files.map((f) => (f.path.endsWith('rules/rules.yaml') ? { ...f, text: f.text.replace('knows: [{ who: npc_niko_serrin', 'knows: [{ who: npc_nobody') } : f))
    expect(() => loadContent(odd)).toThrow(/rules background signal_linguist: unknown NPC npc_nobody/)
    const base = await readContentFiles('content', 'base')
    const noSkills = base.map((f) => (f.path.endsWith('rules/rules.yaml') ? { ...f, text: f.text.replace(/skills: \[[a-z_]+, [a-z_]+\]/, 'skills: []') } : f))
    expect(() => loadContent(noSkills)).toThrow(/two skills, since this world has classes/)
  })
})
