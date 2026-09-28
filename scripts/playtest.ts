import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { argv, stdout } from 'node:process'
import { Engine, type Output } from '../src/engine'
import { loadContentFromDir } from '../src/node/content'

// The playtest protocol per storyline (M9.4, docs/PLAYTEST.md): can the player
// recognise the problem, influence it, and understand how it ended? Each line
// is played twice from a new game: once as a player who acts, once as one who
// only lives there (the control). Recognising uses no build commands: only
// what a new player would type. Build commands appear later only as shortcuts
// for time and distance, never for knowledge, and each is marked. Without a
// model: what the rules and templates give is the floor a player can count on.
//
// npm run playtest [-- <line id>]; transcripts go to docs/playtest/<line>.txt.

type Step = string | { wait: number } | { note: string } | { askAround: true }

interface Line {
  id: string
  world: string
  title: string
  seed: number
  /** A new player looking around and talking: no build commands. */
  recognise: Step[]
  /** What the player does about it; build commands only for time and distance. */
  influence: Step[]
  /** Time for the world to answer, after acting or not. */
  after: Step[]
  /** Words that show the problem and its end in what the player sees. */
  words: RegExp
}

const HOUR = 60
const DAY = 24 * HOUR

export const LINES: Line[] = [
  {
    id: 'flour',
    world: 'base',
    title: 'Meel voor Veenhoek',
    seed: 7,
    recognise: ['look', 'north', 'east', 'talk mirte', '2', 'What happened to the mill?', 'bye', 'journal'],
    influence: [
      { note: 'Mirte named Lubbert in Waagdam: walk there and buy three sacks of rye.' },
      'west',
      'walk to waagdam',
      { note: 'Mirte only said where it lies; the walk ends outside the town. Walk on in.' },
      'walk to waagdam',
      'north',
      'look',
      { note: 'It is evening. Ask someone where the grain seller is, then wait for morning.' },
      'where is lubbert',
      'wait 10 hours',
      'wait 90',
      { note: 'Shortcut: across town to the grain shop the answer named.' },
      '@goto loc_waagdam_graanhandel',
      'struggle',
      'list',
      { note: 'Closed until seven. Wait for it.' },
      'wait 30',
      'list',
      'buy rye',
      'buy rye',
      'buy rye',
      'inventory',
      'walk to veenhoek',
      'look',
      { note: 'Shortcut: into the bakery, if the walk ended elsewhere in Veenhoek.' },
      '@goto loc_veenhoek_bakery',
      'give three sacks of rye to mirte',
      { note: 'Mirte is out (to Waagdam on its market day, as it turns out). Wait for her here.' },
      'wait 10 hours',
      'look',
      'give three sacks of rye to mirte',
    ],
    after: [{ wait: 2 * DAY }, 'journal', { wait: 4 * DAY }, 'look'],
    words: /flour|mill|rye|bread|Mirte|Lubbert|market day/i,
  },
  {
    id: 'cat',
    world: 'base',
    title: 'Het verdwenen meisje',
    seed: 7,
    recognise: ['look', 'north', 'look', 'west', 'look', 'talk to the cat', 'examine the cat', 'east', 'east', 'talk mirte', '2', 'bye', 'journal'],
    influence: [
      { note: 'Find out who the cat is: the cat itself pointed to Old Aaltje.' },
      'talk mirte',
      'where is aaltje',
      'bye',
      'west',
      'north',
      'look',
      'west',
      'look',
      'talk aaltje',
      'What do you know about the grey cat?',
      'ask about the cat',
      { note: 'Aaltje named four ways. The honest one: her draught, and talk to the cat.' },
      'ask for a draught',
      'bye',
      'east',
      'south',
      'west',
      'drink the draught',
      'talk to the cat',
      { note: 'To the widow in the Kattenbroek, to tell her what the cat said: ask Aaltje the way, and go by daylight.' },
      'east',
      'north',
      'west',
      'talk aaltje',
      'where is the kattenbroek',
      'where is the widow',
      'bye',
      'wait 10 hours',
      'east',
      'south',
      'walk to the kattenbroek',
      'struggle',
      'look',
      'walk to the kattenbroek',
      'struggle',
      'look',
      { note: 'Seen now, not reached: walk on to it, again if the mist turns you round, then on to the hut.' },
      'walk to the kattenbroek',
      'walk to the kattenbroek',
      'walk to the kattenbroek',
      'look',
      'east',
      'look',
      'tell the widow that fenna is sorry',
      { note: 'The widow is out. Wait for her at the hut, and speak as soon as she comes.' },
      'wait 8 hours',
      'tell the widow that fenna is sorry',
      'journal',
    ],
    after: [
      { note: 'Back to the Vissers, to see how it ended.' },
      '@goto loc_visser_house',
      'look',
      { wait: 8 * DAY },
      'look',
      { note: 'Shortcut: a month away, far from Veenhoek (the heath road at Reuzenrust), and back. Far off, the quest does not wait for ever (M10.6).' },
      '@goto loc_reuzenrust_road',
      { wait: 30 * DAY },
      '@goto loc_visser_house',
      'look',
      'journal',
    ],
    words: /cat|Fenna|missing|Visser|widow/i,
  },
  {
    id: 'dyke',
    world: 'base',
    title: 'De dijk bij Oude Zijl',
    // A seed where word of the leak never reaches Veenhoek by itself, and the dyke breaks without the player.
    seed: 1,
    recognise: [
      { note: 'Shortcut: a leak in the dyke comes when it comes; here it starts at once. Teunis from Waagdam comes upon it.' },
      '@plan dyke_leak',
      'north',
      { askAround: true },
      { note: 'Next morning to Waagdam, the market town, and ask around there.' },
      'wait 10 hours',
      'wait 5 hours',
      { note: 'Shortcut: ask the way and walk the hour to the market square of Waagdam.' },
      '@goto loc_waagdam_market',
      'look',
      { askAround: true },
      { note: 'Shortcut: across town to the horse mill.' },
      '@goto loc_waagdam_horse_mill',
      'look',
      { askAround: true },
      'journal',
    ],
    influence: [
      { note: 'Teunis saw the leak himself: a stranger alone is not believed, so ask him to take you to the dyke reeve and say it himself (M10.6).' },
      'talk teunis',
      '8',
      'Will you come with me to Sijbrand? He must hear it from you.',
      'east',
      'walk to oude zijl',
      'look',
      { note: 'Teunis knows the way on: the dyke house, and if Sijbrand is not in, follow Teunis where he looks for him.' },
      'north',
      'south',
      'up',
      'tell sijbrand about the dyke',
      'wait 60',
      'journal',
    ],
    after: [{ wait: 1 * DAY }, 'look', 'journal', { wait: 2 * DAY }, { note: 'Shortcut: back to the green of Veenhoek.' }, '@goto loc_veenhoek_green', 'look', { wait: 6 * HOUR }, 'look', 'journal'],
    words: /dyke|Oude Zijl|leak|Sijbrand|water|flood/i,
  },
  {
    id: 'off',
    world: 'isle',
    title: 'Weg van Skerrow',
    seed: 7,
    recognise: ['look', 'take all', 'north', 'north', 'look', { askAround: true }, 'east', 'look', 'examine the beacon', 'journal'],
    influence: [
      { note: 'The beacon is cold and Garrick asleep: one cask here, and the inn may sell more oil.' },
      'take all',
      'wait for garrick',
      'talk garrick',
      '2',
      'bye',
      'ask garrick to tend the beacon',
      'inventory',
      { note: 'Shortcut: down to the Salt Kettle in the Hythe, to buy the third cask.' },
      '@goto loc_skerrow_salt_kettle',
      'list',
      'buy lamp oil',
      { note: 'Shortcut: back up to the headland.' },
      '@goto loc_skerrow_headland',
      'fill the beacon',
      { note: 'Now there is oil: ask Garrick again, and again the next day if need be.' },
      'wait for garrick',
      'ask garrick to tend the beacon',
      'light the beacon',
      'wait 10 hours',
      'wait for garrick',
      'ask garrick to tend the beacon',
      'light the beacon',
      'journal',
    ],
    after: [{ wait: 2 * DAY }, 'look', 'journal', { wait: 40 * DAY }, 'look'],
    words: /ship|beacon|light|off the island|Garrick|winter/i,
  },
  {
    id: 'drowned',
    world: 'isle',
    title: 'Een verdrinking op Skerrow',
    seed: 7,
    recognise: [
      { note: 'Shortcut: to the Salt Kettle, where the island eats and talks.' },
      '@goto loc_skerrow_salt_kettle',
      '@time 12',
      { note: 'Shortcut: a death comes when it comes; here Wenna the fisher drowns at once.' },
      '@kill wenna drowned off the harbour wall',
      'wait 2 hours',
      'look',
      { askAround: true },
      'journal',
    ],
    influence: [
      { note: 'Go to those she left: Maren, who kept the inn with her.' },
      'wait for maren',
      'talk maren',
      'ask about wenna',
      'What happened to Wenna?',
      'bye',
      'west',
      { askAround: true },
    ],
    after: [
      { wait: 1 * DAY },
      'look',
      { askAround: true },
      'journal',
      { note: 'The burial is this afternoon on the headland (M10.7): go up, and see who comes.' },
      'north',
      'wait 60',
      'wait 60',
      'look',
      'wait 60',
      'look',
      { note: 'That evening at the Salt Kettle.' },
      '@goto loc_skerrow_salt_kettle',
      'wait 60',
      'wait 60',
      'wait 60',
      'look',
      { askAround: true },
      { wait: 6 * DAY },
      { note: 'A week on: the headland again, and the Kettle.' },
      '@goto loc_skerrow_headland',
      'look',
      '@goto loc_skerrow_salt_kettle',
      'look',
      { askAround: true },
    ],
    words: /Wenna|drown|dead|grief|mourn|burial|Tidemother|cairn/i,
  },
  {
    id: 'thief',
    world: 'isle',
    title: 'De speler als dief op Skerrow',
    seed: 7,
    recognise: [
      { note: 'Shortcut: to the Salt Kettle at night, when Maren sleeps.' },
      '@goto loc_skerrow_salt_kettle',
      '@time 2',
      'look',
      'steal pitch',
      'inventory',
      'wait 6 hours',
      'look',
      { askAround: true },
      'journal',
    ],
    influence: [
      { note: 'Make it right: give it back, and say sorry.' },
      'talk maren',
      'give pitch to maren',
      'I am sorry. I took it in the night.',
      'bye',
    ],
    after: [{ wait: 1 * DAY }, 'look', { askAround: true }, { wait: 3 * DAY }, 'look', { askAround: true }, 'journal'],
    words: /pitch|thief|stole|stolen|theft|Maren/i,
  },
  {
    // The test world (M10.17, tests/worlds/other): every milestone plays here too, to show it is generic.
    id: 'deepwell',
    world: 'other',
    title: 'Een nieuwkomer in Deepwell, de proefwereld zonder Nethermarch',
    seed: 5,
    recognise: ['look', 'e', 'list', { askAround: true }, 'journal'],
    influence: [
      { note: 'Eat, drink, and take the tram to the works and back.' },
      'buy stew',
      'eat stew',
      'drink from tap',
      'down',
      'take the tram',
      'look',
      'take the tram',
      'up',
    ],
    after: [{ wait: 1 * DAY }, 'look', { askAround: true }, 'time'],
    words: /tram|credit|chit|\bch\b|stew|Pell|canteen/i,
  },
]

/** A world from content/, or a test world from tests/worlds (Deepwell). */
function worldDir(world: string): string {
  const content = resolve(import.meta.dirname, '../content')
  return existsSync(resolve(content, world)) ? content : resolve(import.meta.dirname, '../tests/worlds')
}

const say = (outputs: Output[]) => outputs.map((o) => o.text).join('\n')

async function play(line: Line, act: boolean): Promise<string> {
  const content = await loadContentFromDir(worldDir(line.world), line.world)
  const engine = new Engine(content, { seed: line.seed, builder: true })
  const out: string[] = [say(engine.start())]
  const steps: [string, Step[]][] = [['RECOGNISE', line.recognise], ...(act ? [['INFLUENCE', line.influence] as [string, Step[]]] : []), ['AFTER', line.after]]
  for (const [phase, list] of steps) {
    out.push(`\n==== ${phase} (${engine.world.date()})`)
    for (const step of list) {
      if (typeof step === 'string') out.push(`\n> ${step}${step.startsWith('@') ? '   [build command: a shortcut]' : ''}\n${say(await engine.handle(step))}`)
      else if ('wait' in step) out.push(`\n[${step.wait / HOUR} hours pass]\n${say(engine.tick(step.wait))}`)
      else if ('askAround' in step) {
        // Whoever is here and awake: what's new?
        const here = engine.world.npcsAt(engine.state.player.location).filter((id) => engine.world.npcState(id).activity !== 'asleep')
        if (!here.length) out.push('\n# Nobody here to ask.')
        for (const id of here.slice(0, 3)) for (const c of [`talk ${engine.world.npc(id).short.toLowerCase()}`, '2', 'bye']) out.push(`\n> ${c}\n${say(await engine.handle(c))}`)
      }
      else out.push(`\n# ${step.note}`)
    }
  }
  const quests = Object.entries(engine.state.questlog ?? {}).map(([id, q]) => `${id}: ${q.outcome ?? `open, stage ${q.stage}`}`)
  out.push(`\n==== END (${engine.world.date()})\nQuests: ${quests.join('; ') || 'none'}`)
  return out.join('\n')
}

const only = argv[2]
const dir = resolve(import.meta.dirname, '../docs/playtest')
mkdirSync(dir, { recursive: true })
for (const line of LINES.filter((l) => !only || l.id === only)) {
  const acted = await play(line, true)
  const control = await play(line, false)
  writeFileSync(resolve(dir, `${line.id}.txt`), `${line.title} (${line.world}), seed ${line.seed}\n\n######## THE PLAYER ACTS\n${acted}\n\n######## CONTROL: THE PLAYER DOES NOTHING\n${control}\n`)
  const first = acted.split('\n').findIndex((l) => line.words.test(l) && !l.startsWith('>'))
  stdout.write(`${line.id}: transcript written; the problem is first named on line ${first + 1}\n`)
}
