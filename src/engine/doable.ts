import { callName } from './content'
import { tradesHere } from './commands'
import { shownExits } from './exits'
import { itemName } from './items'
import { active, allHold, plainWords } from './quests/engine'
import type { World } from './world'

// What can be done here (M10.33 D and AB), from what the place offers and
// never from a model: the next deed of an open quest here, the people here,
// the things with a verb of their own, a trade, the ways out. The player sees
// three of them as chips under the command bar ("You could: ..." in the
// terminal); the voice gets the deeds and the things as DOABLE HERE, so it
// asks the stranger only for what can be done.

export interface Doable {
  kind: 'quest' | 'person' | 'thing' | 'carried' | 'trade' | 'exit'
  /** What the chip says. */
  label: string
  /** What it puts in the command bar. */
  command: string
}

const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** Everything that can be done here now, the deeds of the story first. */
export function doableHere(world: World): Doable[] {
  const here = world.state.player.location
  const area = world.content.locations.get(here)?.area
  const present = (id: string) => world.state.npcs[id]?.location === here && world.present(id)
  const out: Doable[] = []
  // The next deed of an open quest, done here or with someone who is here.
  for (const [quest, q] of active(world)) {
    for (const action of quest.actions ?? []) {
      if (action.once && q.done.includes(action.id)) continue
      const place = !action.at.length || action.at.includes(here) || (area !== undefined && action.at.includes(area))
      if (!place || (action.with && !present(action.with)) || (!action.at.length && !action.with)) continue
      if (!allHold(world, action.when, quest.id)) continue
      const words = (action.intent ?? plainWords(action.say[0] ?? '')).trim()
      if (words) out.push({ kind: 'quest', label: upper(words), command: plainWords(action.say[0] ?? words) })
    }
  }
  for (const id of world.npcsAt(here).filter(present)) {
    const npc = world.npc(id)
    // By name only once the stranger knows it (M10.33 S); else by what they are.
    const name = world.knowsName(id) ? callName(npc) : world.seenName(id)
    out.push({ kind: 'person', label: `Talk to ${name}`, command: `talk ${name.replace(/^(the|a|an)\s+/i, '').toLowerCase()}` })
    if (tradesHere(world, id) && !out.some((d) => d.kind === 'trade')) out.push({ kind: 'trade', label: 'See what is for sale', command: 'list' })
  }
  // Things with a verb of their own: the details of the place and of its objects, and what is written on an object.
  const location = world.location(here)
  const place = world.content.locations.get(here)
  const details = [...(place?.details ?? []), ...location.objects.flatMap((o) => world.content.objectTypes.get(o.type)?.details ?? [])]
  for (const d of details) {
    const verb = Object.keys(d.verbs ?? {})[0]
    if (verb) out.push({ kind: 'thing', label: upper(`${verb} the ${d.words[0]}`), command: `${verb} ${d.words[0]}` })
  }
  for (const o of location.objects) {
    const type = world.content.objectTypes.get(o.type)
    if (!type) continue
    const name = o.name ?? type.name
    if (type.inscription) out.push({ kind: 'thing', label: upper(`read the ${name}`), command: `read ${name}` })
    for (const a of type.affordances.filter((x) => x.actors.includes('player')).slice(0, 1)) out.push({ kind: 'thing', label: upper(`use the ${name} to ${a.verb}`), command: `use ${name} ${a.verb}` })
  }
  // What the stranger carries that has a verb of its own.
  for (const [id, n] of Object.entries(world.state.player.inventory)) {
    const verb = n > 0 ? Object.keys(world.content.items.get(id)?.verbs ?? {})[0] : undefined
    if (verb) out.push({ kind: 'carried', label: upper(`${verb} the ${itemName(world.content, id, 1)}`), command: `${verb} ${itemName(world.content, id, 1)}` })
  }
  // The ways out, with where they go when the stranger knows it.
  const journal = world.state.player.journal ?? {}
  for (const dir of shownExits(world, here)) {
    const to = location.exits[dir]?.to
    const known = to && journal[to] !== undefined ? world.content.locations.get(to)?.name : undefined
    out.push({ kind: 'exit', label: known ? `Go ${dir} (${known})` : `Go ${dir}`, command: `go ${dir}` })
  }
  const seen = new Set<string>()
  return out.filter((d) => !seen.has(d.command) && seen.add(d.command))
}

/** Three to try next (M10.33 D): the story's deed here, someone to talk to, a thing or a trade, a way out; what you carry last. */
export function nextSteps(world: World, most = 3): Doable[] {
  const all = doableHere(world)
  const order: Doable['kind'][] = ['quest', 'person', 'thing', 'trade', 'exit', 'carried']
  const picked: Doable[] = []
  // One of each kind first, in that order, then more of the first kinds.
  for (const kind of order) {
    const first = all.find((d) => d.kind === kind)
    if (first && picked.length < most) picked.push(first)
  }
  for (const d of all) if (picked.length < most && !picked.includes(d)) picked.push(d)
  return picked
}

/** What the voice may ask of the stranger here (M10.33 AB): the deeds of the story and the verbs of the things. */
export function doableLine(world: World): string | undefined {
  const acts = doableHere(world).filter((d) => d.kind === 'quest' || d.kind === 'thing' || d.kind === 'carried').map((d) => d.label.toLowerCase())
  return acts.length ? `DOABLE HERE (all the stranger can do with what is here and what they carry): ${acts.slice(0, 12).join('; ')}.` : undefined
}
