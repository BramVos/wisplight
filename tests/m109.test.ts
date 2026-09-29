import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyEdits, checkContent, Engine, entityYaml, GameClock, loadContent, MockLlm } from '../src/engine'
import { applyFarPlace, farRequest, farWords } from '../src/engine/growth/far'
import { registerSketch } from '../src/engine/sketches'
import { creationHelp } from '../src/engine/rules/player'
import { knowsOfPerson } from '../src/engine/acquaintance'
import { loadContentFromDir, readContentFiles } from '../src/node/content'
import { content } from './helpers'

// Milestone M10.9 (docs/ROADMAP.md): a reason to be here, and who else is
// named. Part A: every background says why you came, whom you were told to ask
// for, and what you heard that brought you.

const root = join(import.meta.dirname, '../content')
const isle = await loadContentFromDir(root, 'isle')
const said = (outputs: { text: string }[]) => outputs.map((o) => o.text).join('\n')

describe('M10.9: a reason to be here', () => {
  it('the opening tells why you came, after the world, and puts your contact in the journal', () => {
    const engine = new Engine(content, { seed: 1 })
    const out = engine.start()
    const at = out.findIndex((o) => /^You ran goods past the Count's tolls/.test(o.text))
    expect(at).toBe(1)
    expect(out[2]?.text).toMatch(/You were told to ask for Trijntje the innkeeper at the Drowned Goose\./)
    expect(engine.state.player.contact).toBe('npc_trijntje')
    expect(engine.state.player.journal?.['npc_trijntje']).toBeDefined()
    // What you heard that brought you is in the journal from the start.
    expect(engine.state.player.journal?.['the_count']).toBeDefined()
    // The contact is someone you know of, told to ask for them, not someone you met.
    expect(knowsOfPerson(engine.world, 'npc_trijntje')).toBe(true)
    const page = engine.page('npc_trijntje')
    expect(page?.lines.join(' ') + JSON.stringify(page?.sources ?? [])).toMatch(/you were told to ask for them when you came/)
  })

  it('a character made with CREATE gets the reason of their own background, and a new contact', async () => {
    const engine = new Engine(content, { seed: 2 })
    engine.start()
    const out = said(await engine.handle('create warden heathborn surveyor name=Anna'))
    expect(out).toMatch(/The Count sent you to help Master Cornelis measure the Holleveen/)
    expect(out).toMatch(/You were told to ask for Master Cornelis the surveyor/)
    expect(engine.state.player.contact).toBe('npc_cornelis')
    expect(engine.state.player.journal?.['drainage']).toBeDefined()
    // The surveyor reads the land: Lore and Perception.
    expect(engine.state.player.character?.ranks['lore']).toBeGreaterThanOrEqual(1)
    expect(engine.state.player.character?.ranks['perception']).toBeGreaterThanOrEqual(1)
  })

  it('CREATE without words shows the backgrounds with why you came', () => {
    const engine = new Engine(content, { seed: 3 })
    const help = creationHelp(engine.world)
    expect(help).toMatch(/Backgrounds, and why you came:/)
    expect(help).toMatch(/ {2}surveyor: The Count sent you to help Master Cornelis measure the Holleveen he means to drain, and to have the survey done before winter\./)
    // One sentence each, not the whole reason.
    expect(help).not.toMatch(/Nobody in the fen will thank you for it/)
  })

  it('Skerrow has its own reasons: a fugitive and a merchant from the wreck', async () => {
    const backgrounds = isle.rules!.backgrounds
    expect(backgrounds.every((b) => b.reason && b.contact && isle.npcs.has(b.contact))).toBe(true)
    for (const id of ['fugitive', 'merchant']) expect(backgrounds.find((b) => b.id === id)?.reason).toMatch(/ship|wreck|aboard|Grey Gull/i)
    const engine = new Engine(isle, { seed: 4 })
    engine.start()
    const out = said(await engine.handle('create knave islander fugitive name=Wyn'))
    expect(out).toMatch(/You were told to ask for/)
    expect(engine.state.player.contact).toBe(backgrounds.find((b) => b.id === 'fugitive')!.contact)
  })

  it('an old game without a reason plays on as it was', async () => {
    const plain = { ...content, rules: { ...content.rules!, backgrounds: content.rules!.backgrounds.map(({ reason: _r, contact: _c, heard: _h, ...b }) => b) } }
    const engine = new Engine(plain, { seed: 5 })
    const out = engine.start()
    expect(said(out)).not.toMatch(/You were told to ask for/)
    expect(engine.state.player.contact).toBeUndefined()
    expect(said(await engine.handle('look'))).toContain('Canal Quay')
  })

  it('the editor shows a background with its reason, and changes only that line', async () => {
    const files = await readContentFiles(root, 'base')
    const yaml = entityYaml(files, 'background', 'surveyor')!
    expect(yaml).toMatch(/reason: "The Count sent you/)
    expect(yaml).toMatch(/contact: npc_cornelis/)
    const before = files.find((f) => f.path === 'base/rules/rules.yaml')!.text
    const surveyor = loadContent(files).rules!.backgrounds.find((b) => b.id === 'surveyor')!
    const result = applyEdits(files, [{ kind: 'background', id: 'surveyor', data: { id: 'surveyor', name: 'Surveyor', skills: ['lore', 'perception'], talent: 'keen_eyes', knows: ['npc_cornelis'], topics: ['drainage', 'the_count'], reason: 'The Count sent you to measure the fen.', contact: 'npc_cornelis', heard: 'drainage' } }])
    expect(result.problems).toEqual([])
    expect(surveyor.reason).not.toBe('The Count sent you to measure the fen.')
    const after = result.changes.find((c) => c.path === 'base/rules/rules.yaml')!.text
    const changed = after.split('\n').filter((line, i) => line !== before.split('\n')[i])
    expect(changed).toHaveLength(1)
    expect(changed[0]).toMatch(/^ {4}- \{ id: surveyor, .*reason: "The Count sent you to measure the fen\."/)
  })

  it('a new background from the editor goes into the rules, and a contact must be someone', async () => {
    const files = await readContentFiles(root, 'isle')
    const data = { id: 'beachcomber', name: 'Beachcomber', skills: ['survival', 'perception'], talent: 'haggler', knows: [], topics: [], reason: 'You came for what the sea gives up. Maren buys what you find.', contact: 'npc_maren' }
    const result = applyEdits(files, [{ kind: 'background', id: 'beachcomber', data }])
    expect(result.problems).toEqual([])
    expect(result.content!.rules!.backgrounds.at(-1)?.id).toBe('beachcomber')
    expect(result.changes.map((c) => c.path).sort()).toEqual(['isle/ids.lock', 'isle/rules/rules.yaml'])
    const wrong = applyEdits(files, [{ kind: 'background', id: 'beachcomber', data: { ...data, contact: 'npc_nobody' } }])
    expect(wrong.problems.join(' ')).toMatch(/npc_nobody/)
  })
})

describe('M10.9: the contact expects you', () => {
  it('the one you were told to ask for knows it, and why you came', async () => {
    const { turnPrompt } = await import('../src/engine/dialogue/prompt')
    const engine = new Engine(content, { seed: 6 })
    engine.start()
    const ctx = { npcId: 'npc_trijntje', act: 'chat', tier: 'short', attitude: { band: 'Neutral', score: 0 }, mood: 'calm', packet: { known: [], unknown: [] }, memories: [], history: [], playerText: 'Evening.' }
    const prompt = turnPrompt(engine.world, ctx as never)
    expect(prompt).toMatch(/THE STRANGER was told to ask for you when they came\. What brought them, in their words: "You ran goods past the Count's tolls/)
    expect(turnPrompt(engine.world, { ...ctx, npcId: 'npc_gerrit' } as never)).not.toMatch(/told to ask for you/)
  })
})

// Part B: people named in a talk who are not in the world yet.

function stay(engine: Engine, npcId: string, location = engine.state.player.location): void {
  const s = engine.state.npcs[npcId]!
  s.location = location
  s.activity = 'standing about'
  s.busyUntil = engine.world.now + 600
  s.plan = []
  s.note = undefined
}

async function named(someone: MockLlm['someone'], ask = 'Do you have family around here?', seed = 9) {
  const mock = new MockLlm('good')
  mock.someone = someone
  const engine = new Engine(content, { seed, llm: mock, builder: true })
  stay(engine, 'npc_gerrit')
  await engine.handle('talk gerrit')
  const out = said(await engine.handle(ask))
  return { engine, mock, out }
}

describe('M10.9: someone named in a talk', () => {
  it('the voice may name one person with a bond and a place, in a talk about family; the journal has them under the speaker', async () => {
    const { engine, mock, out } = await named({ name: 'Aldert', bond: 'cousin', place: 'Waagdam', what: 'a carter' })
    expect(out).toMatch(/My cousin Aldert is a carter in \[?Waagdam\]?/)
    // The game offered it: the bonds of the world, the places that exist.
    const request = mock.calls.at(-1)!
    expect(request.prompt).toMatch(/SOMEONE NEW: this talk touches your family, your trade or your past\..*your cousin, aunt, uncle, brother-in-law/)
    expect(JSON.stringify(request.schema)).toMatch(/"person"/)
    const [s] = engine.state.lore!.people!
    expect(s).toMatchObject({ id: 'sketch_aldert_gerrit', name: 'Aldert', bond: 'cousin', of: 'npc_gerrit', place: 'area_waagdam', placeName: 'Waagdam', what: 'a carter', known_by: ['npc_gerrit'] })
    // A page of their own, under Gerrit: who, from whom and when; no family name, no map.
    const page = engine.page(s!.id)!
    expect(page.lines[0]).toMatch(/^Gerrit's cousin, a carter in Waagdam; heard from Gerrit, \d+ \w+\.$/)
    expect(page.links.map((l) => l.label)).toContain('told by')
    expect(page.hexMap).toBeUndefined()
    const people = engine.status().journal.people.map((p) => p.name)
    expect(people.indexOf('Aldert (Gerrit\'s cousin)')).toBe(people.findIndex((n) => /^Gerrit/.test(n)) + 1)
    expect(engine.page('npc_gerrit')!.links).toContainEqual(expect.objectContaining({ id: s!.id, label: 'cousin' }))
    // Gerrit knows him from now on and keeps the same story.
    mock.someone = undefined
    const answer = said(await engine.handle('ask about aldert'))
    const again = mock.calls.at(-1)!
    // Who speaks and their people go with the talk since M10.28, told again once they change.
    expect(again.prompt).toMatch(/YOUR PEOPLE: .*Aldert, your kinsman\. Your cousin, a carter in Waagdam; you spoke of him to the stranger/)
    expect(again.prompt).toMatch(/Aldert is your cousin, a carter in Waagdam\. What you said of him: "My cousin Aldert is a carter in Waagdam\."/)
    // The name leads to their page (M10.8), as any name.
    expect(answer).toMatch(/\[Aldert\] is your cousin/)
  })

  it('is refused without a bond from the list, with a family name, or when the talk is not about it', async () => {
    const nobond = await named({ name: 'Aldert', bond: 'drinking companion', place: 'Waagdam' })
    expect(nobond.engine.state.lore?.people ?? []).toEqual([])
    expect(nobond.mock.calls.at(-1)!.prompt).toMatch(/NOTE: "drinking companion" is not a bond you may give/)
    const surname = await named({ name: 'Aldert Visser', bond: 'cousin', place: 'Waagdam' })
    expect(surname.engine.state.lore?.people ?? []).toEqual([])
    const offTopic = await named({ name: 'Aldert', bond: 'cousin', place: 'Waagdam' }, 'Lovely weather for ducks, is it not?')
    expect(offTopic.engine.state.lore?.people ?? []).toEqual([])
    expect(offTopic.mock.calls.find((c) => c.role === 'voice')!.prompt).not.toMatch(/SOMEONE NEW/)
    const nowhere = await named({ name: 'Aldert', bond: 'cousin', place: 'Atlantis' })
    expect(nowhere.engine.state.lore?.people ?? []).toEqual([])
  })

  it('once a talk, and not without a model', async () => {
    const { engine, mock } = await named({ name: 'Aldert', bond: 'cousin', place: 'Waagdam' })
    mock.someone = { name: 'Wobbe', bond: 'old friend', place: 'Molenend' }
    await engine.handle('And what about your old trade, before the peat?')
    expect(engine.state.lore!.people!.map((p) => p.name)).toEqual(['Aldert'])
    const plain = new Engine(content, { seed: 9 })
    stay(plain, 'npc_gerrit')
    await plain.handle('talk gerrit')
    await plain.handle('Do you have family around here?')
    expect(plain.state.lore?.people ?? []).toEqual([])
  })

  it('becomes a person when the stranger comes to their village, with the bond as a relation', async () => {
    const { engine } = await named({ name: 'Aldert', bond: 'cousin', place: 'Waagdam', what: 'a carter' })
    await engine.handle('bye')
    await engine.handle('@goto loc_waagdam_market')
    engine.tick(1)
    const s = engine.state.lore!.people![0]!
    expect(s.npc).toBeDefined()
    const aldert = engine.content.npcs.get(s.npc!)!
    expect(aldert.name).toMatch(/^Aldert \w+/)
    expect(engine.world.location(aldert.home).area).toBe('waagdam')
    expect(aldert.relations).toEqual([expect.objectContaining({ to: 'npc_gerrit', role: 'kin' })])
    // Gerrit's own people: Aldert the person now, not the sketch.
    const { ties } = await import('../src/engine/people')
    expect(ties(engine.world, 'npc_gerrit').filter((t) => t.name.startsWith('Aldert'))).toEqual([expect.objectContaining({ id: s.npc, role: 'kin' })])
    expect(checkContent(engine.content)).toEqual([])
    // Fixed in the save.
    const loaded = Engine.fromSave(content, engine.save())
    expect(loaded.content.npcs.has(s.npc!)).toBe(true)
    expect(loaded.page(s.id)!.links).toContainEqual(expect.objectContaining({ label: 'told by' }))
  })

  it('at a far place the chronicler makes them a person, with the same first name', async () => {
    const { engine } = await named({ name: 'Aldert', bond: 'trading partner', place: 'Zwolderkamp', what: 'a lamp-oil merchant' }, 'Who do you trade with, then?')
    const s = engine.state.lore!.people![0]!
    expect(s.place).toBe('zwolderkamp')
    const request = farRequest(engine.world, 'zwolderkamp')
    expect(request.prompt).toMatch(/NAMED .*\n {2}sketch_aldert_gerrit: Aldert, Gerrit's trading partner, a lamp-oil merchant in Zwolderkamp/)
    const words = farWords((await new MockLlm('good').complete(request)).text)
    const far = applyFarPlace(engine.world, 'zwolderkamp', words)!
    expect(far.npcs.map((n) => n['name'])).toEqual(['Wendel Hoorn', 'Aleid Kramer', 'Aldert Brinkman'])
    expect(s.npc).toBe(far.sketches![s.id])
    expect(engine.content.npcs.get(s.npc!)!.relations[0]).toMatchObject({ to: 'npc_gerrit', role: 'acquaintance' })
  })

  it('the chronicler sees them, and may bring one by a letter or a visit', async () => {
    for (const how of ['letter', 'visit'] as const) {
      const mock = new MockLlm('good')
      const engine = new Engine(content, { seed: 3, llm: mock, builder: true })
      engine.tick(GameClock.from(211, 9, 15, 11).minutes - engine.world.now)
      engine.state.npcs['npc_mirte']!.location = engine.state.npcs['npc_harmen']!.location
      registerSketch(engine.world, 'npc_mirte', { name: 'Wobbe', pronoun: 'he', bond: 'cousin', place: 'Waagdam', what: 'a weaver' }, 'My cousin Wobbe weaves in Waagdam.', () => false)
      mock.chronicle = (meta) => {
        const card = meta.cards.find((c) => c.kind === 'named')
        return card ? { named: [{ who: card.key, how, text: 'He heard of the drowning and wants to help.' }] } : {}
      }
      await engine.handle('@kill harmen drowned in the Blackmere')
      const [run] = await engine.runChronicler()
      expect(run!.problems).toEqual([])
      const request = mock.calls.filter((c) => c.role === 'chronicler')[0]!
      expect(request.prompt).toMatch(/NAMED \(spoken of in talks, not met yet\)\n {2}n1 Wobbe: Mirte's cousin, a weaver in Waagdam/)
      const s = engine.state.lore!.people![0]!
      const mind = engine.state.npcs['npc_mirte']!.thoughts!.map((t) => t.text).join(' ')
      if (how === 'letter') {
        expect(s.letters).toEqual([expect.objectContaining({ text: 'He heard of the drowning and wants to help.' })])
        expect(mind).toMatch(/A letter came from your cousin Wobbe/)
        expect(s.npc).toBeUndefined()
      } else {
        expect(engine.content.npcs.get(s.npc!)!.home).toBe(content.npcs.get('npc_mirte')!.home)
        expect(mind).toMatch(/Your cousin Wobbe has come to stay/)
      }
    }
  })
})
