import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Engine, type Output } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'

// M10.31 E, short names of people (a gap of M10.29 V: a name cut short found
// things and details, not people). TALK MA, ASK TES ABOUT ..., GIVE LAMP TO
// NI find the person by the start of a word of a name, as OPEN CAB finds the
// cabinet; when two fit, the game asks who is meant, for ASK, TELL and GIVE
// as it did for TALK.

const quiet = await loadContentFromDir(join(import.meta.dirname, '../content'), 'quietreach')
const text = (out: Output[]) => out.map((o) => o.text).join('\n')

/** The Commons with Mara, Tessa and Niko in it, and a lamp in the pack. */
async function commons(): Promise<Engine> {
  const engine = new Engine(quiet, { seed: 3, builder: true })
  engine.start()
  for (const c of ['@goto loc_commons', '@bring mara', '@bring tessa', '@bring niko']) await engine.handle(c)
  engine.state.player.inventory['field_lamp'] = 1
  return engine
}

describe('M10.31 E: short names of people', () => {
  it('finds one person by the start of a name', async () => {
    const engine = await commons()
    await engine.handle('talk ma')
    expect(engine.state.talk?.npc).toBe('npc_mara_venn')
    await engine.handle('bye')
    const said = await engine.handle('ask tes about the drive')
    expect(said.find((o) => o.kind === 'speech')?.text).toMatch(/^Tessa /)
    await engine.handle('bye')
    expect(text(await engine.handle('give lamp to ni'))).toMatch(/You give a field lamp to Niko/)
    expect(engine.state.npcs['npc_niko_serrin']!.inventory['field_lamp']).toBe(1)
  })

  it('asks who is meant when two fit, for ASK, TELL and GIVE too, and never by the article of a name', async () => {
    const engine = await commons()
    // "t": Tessa, and Niko the signal technician; not Mara, whose short name is "the port coordinator".
    const offered = async (command: string) => {
      await engine.handle(command)
      return engine.state.choice?.options.map((o) => o.command)
    }
    expect(await offered('talk t')).toEqual(['talk Niko Serrin', 'talk Tessa Rook'])
    expect(await offered('ask t about the drive')).toEqual(['ask Niko Serrin about the drive', 'ask Tessa Rook about the drive'])
    expect(await offered('tell t that the signal repeats')).toEqual(['tell Niko Serrin that the signal repeats', 'tell Tessa Rook that the signal repeats'])
    expect(await offered('give lamp to t')).toEqual(['give lamp to Niko Serrin', 'give lamp to Tessa Rook'])
    // The answer is the command with the whole name.
    expect(text(await engine.handle('2'))).toMatch(/You give a field lamp to Tessa/)
  })
})
