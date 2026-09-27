import { mkdirSync, writeFileSync } from 'node:fs'
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

type Step = string | { wait: number } | { note: string }

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
      'buy rye',
      'buy rye',
      'buy rye',
      'inventory',
      'walk to veenhoek',
      'look',
      { note: 'Shortcut: into the bakery, if the walk ended elsewhere in Veenhoek.' },
      '@goto loc_veenhoek_bakery',
      'give three sacks of rye to mirte',
      { note: 'Mirte is out (to Waagdam on its market day, as it turns out). Come back next morning.' },
      'wait 10 hours',
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
      'east',
      'look',
      'east',
      'look',
      'tell the widow that fenna is sorry',
      { note: 'The widow is out. Wait for her at the hut, and speak as soon as she comes.' },
      'wait 8 hours',
      'tell the widow that fenna is sorry',
      'journal',
    ],
    after: [{ note: 'Back to the Vissers, to see how it ended.' }, '@goto loc_visser_house', 'look', { wait: 8 * DAY }, 'look'],
    words: /cat|Fenna|missing|Visser|widow/i,
  },
]

const say = (outputs: Output[]) => outputs.map((o) => o.text).join('\n')

async function play(line: Line, act: boolean): Promise<string> {
  const content = await loadContentFromDir(resolve(import.meta.dirname, '../content'), line.world)
  const engine = new Engine(content, { seed: line.seed, builder: true })
  const out: string[] = [say(engine.start())]
  const steps: [string, Step[]][] = [['RECOGNISE', line.recognise], ...(act ? [['INFLUENCE', line.influence] as [string, Step[]]] : []), ['AFTER', line.after]]
  for (const [phase, list] of steps) {
    out.push(`\n==== ${phase} (${engine.world.date()})`)
    for (const step of list) {
      if (typeof step === 'string') out.push(`\n> ${step}${step.startsWith('@') ? '   [build command: a shortcut]' : ''}\n${say(await engine.handle(step))}`)
      else if ('wait' in step) out.push(`\n[${step.wait / HOUR} hours pass]\n${say(engine.tick(step.wait))}`)
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
