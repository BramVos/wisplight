import { describe, expect, it } from 'vitest'
import { introduced, sceneryWarnings } from '../src/engine/builder'
import { answerChoice, choose } from '../src/engine/choice'
import { content, newEngine } from './helpers'

// After the M10 playtest (Bram, 28 September 2026): a command that can mean
// one thing does it; an unknown or missing target gets the options, numbered;
// with none, a message. What a description names can be looked at and handled.

// What was said, without the experience for finding a place on the first command there.
const said = (out: { text: string }[]) =>
  out
    .map((o) => o.text)
    .filter((t) => !/^\+\d+ experience/.test(t))
    .join('\n')

function at(location: string, seed = 3) {
  const engine = newEngine(seed)
  engine.state.player.location = location
  return engine
}

describe('choices', () => {
  it('does the one option that fits, offers several, and says so when there are none', () => {
    const engine = newEngine()
    const options = [
      { label: 'Mirte', command: 'talk mirte' },
      { label: 'Saartje', command: 'talk saartje' },
    ]
    expect(choose(engine.world, 'mirte', 'Talk to whom?', options, 'nobody')).toEqual({ run: 'talk mirte' })
    expect(choose(engine.world, '', 'Talk to whom?', options.slice(0, 1), 'nobody')).toEqual({ run: 'talk mirte' })
    expect(choose(engine.world, '', 'Talk to whom?', [], 'There is nobody here but you.')).toEqual({ show: [{ kind: 'error', text: 'There is nobody here but you.' }] })
    const shown = choose(engine.world, 'kees', 'Talk to whom?', options, 'nobody')
    expect('show' in shown && said(shown.show)).toBe('Talk to whom?\n  1. Mirte\n  2. Saartje')
    expect(answerChoice(engine.world, '3')).toEqual({ error: 'Choose a number from 1 to 2, or type something else.' })
    expect(answerChoice(engine.world, 'saartje')).toEqual({ run: 'talk saartje' })
    expect(answerChoice(engine.world, '1')).toEqual({ error: 'There is nothing to choose from just now.' })
    expect(answerChoice(engine.world, 'look')).toBeUndefined()
  })

  it('follows the path from the Kabouterberg back to Veenhoek, whatever you call it', async () => {
    const engine = at('loc_kabouterberg')
    expect(said(await engine.handle('look'))).toMatch(/or follow the path to Veenhoek\./)
    const out = said(await engine.handle('follow path to kabouterberg'))
    expect(out).toMatch(/You follow the path to Veenhoek/)
    expect(engine.state.player.location).not.toBe('loc_kabouterberg')
  })

  it('asks which way along a way that runs both ways, and takes the number', async () => {
    const engine = at('loc_veenhoek_quay')
    const out = said(await engine.handle('follow tow path'))
    expect(out).toMatch(/Follow it which way\?\n {2}1\. the tow path west to Oude Zijl\n {2}2\. the tow path east to Waagdam/)
    expect(engine.status().choice?.options).toEqual(['the tow path west to Oude Zijl', 'the tow path east to Waagdam'])
    expect(said(await engine.handle('2'))).toMatch(/You follow the tow path east to Waagdam/)
    expect(engine.state.choice).toBeUndefined()
  })

  it('talks to the only one here, and asks whom when there are more', async () => {
    const lonely = at('loc_kabouterberg')
    expect(said(await lonely.handle('talk'))).toBe('There is nobody here but you.')
    const engine = newEngine(3)
    const crowded = [...content.locations.keys()].find((id) => engine.world.npcsAt(id).filter((n) => engine.world.npcState(n).activity !== 'asleep').length >= 2)!
    engine.state.player.location = crowded
    const out = said(await engine.handle('talk'))
    expect(out).toMatch(/^Talk to whom\?\n {2}1\. /)
    await engine.handle('1')
    expect(engine.state.talk).toBeDefined()
  })

  it('offers what there is to look at, take, drop and walk to when the words fit nothing', async () => {
    const engine = at('loc_veenhoek_quay')
    const look = said(await engine.handle('look xyz'))
    expect(look).toMatch(/You see no "xyz" here\.\nLook at what\?\n {2}1\. old stone/)
    expect(said(await engine.handle('1'))).toMatch(/A worn stone, waist-high/)
    expect(said(await engine.handle('take'))).toBe('There is nothing here to take.')
    expect(said(await engine.handle('drop xyz'))).toMatch(/You don't have "xyz"\.\nDrop what\?\n {2}1\. /)
    expect(said(await engine.handle('walk to qqq'))).toBe('You don\'t know a place called "qqq".')
  })

  it('walks to a hex you have seen, as a click on the minimap sends it, and not to one you have not', async () => {
    const engine = at('loc_veenhoek_quay')
    const you = engine.status().hexMap!.you!
    expect(said(await engine.handle(`walk to ${you.c + 30},${you.r}`))).toMatch(/You have not seen that land yet/)
    expect(said(await engine.handle(`walk to ${you.c},${you.r}`))).toBe('You are there already.')
    expect(said(await engine.handle(`walk to ${you.c + 2},${you.r}`))).toMatch(/You make your way towards the tow path, near Veenhoek/)
    expect(engine.state.player.location).not.toBe('loc_veenhoek_quay')
  })
})

describe('what a description names', () => {
  it('can be looked at, taken or not, and answers other verbs (the Kabouterberg)', async () => {
    const engine = at('loc_kabouterberg')
    expect(said(await engine.handle('look hollow'))).toMatch(/^The hollow opens between the roots of the oak/)
    expect(said(await engine.handle('l milk'))).toMatch(/^A wooden bowl of milk at the mouth of the hollow/)
    expect(said(await engine.handle('drink milk'))).toMatch(/That milk is not yours to drink\./)
    expect(said(await engine.handle('take milk'))).toBe('You leave the bowl where it is. It was put there for the kabouters, not for you.')
    expect(said(await engine.handle('dig hill'))).toMatch(/Nobody digs in the Kabouterberg/)
    expect(said(await engine.handle('kick oak'))).toBe('You think better of it, and leave the oak be.')
    expect(engine.state.player.inventory['milk'] ?? 0).toBe(0)
  })

  it('finds a thing with no detail in the sentence of the description it is in', async () => {
    const engine = at('loc_kabouterberg')
    expect(said(await engine.handle('look roots'))).toBe('Between its roots a hollow opens into the hill, and someone has left a bowl of milk at its mouth.')
    expect(said(await engine.handle('look at the quiet'))).toBe('It is very quiet here; even the wind seems to go round.')
    expect(said(await engine.handle('take roots'))).toBe('That belongs where it is. You leave it.')
  })

  it('names in the editor what a description brings in with no detail', () => {
    expect(introduced('A low hill of pale sand rises, crowned by an oak older than anyone. Between its roots a hollow opens, and someone has left a bowl of milk.')).toEqual(['hill', 'oak', 'hollow', 'bowl'])
    const warnings = sceneryWarnings(content)
    expect(warnings.some((w) => w.startsWith('loc_kabouterberg'))).toBe(false)
    expect(warnings.length).toBeGreaterThan(0)
  })

  it('gives the picture of the area you are in', () => {
    expect(at('loc_kabouterberg_oak').status().scene).toBe('area_kabouterberg')
  })
})
