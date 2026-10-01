import { callName } from './content'
import { remember } from './npc/execute'
import type { Evidence } from './state'
import type { World } from './world'

// Evidence is something you have (M10.34 C; the external review of 30
// September, V03): "Tessa gives you the test telemetry" was a line of text and
// nothing more, so INVENTORY showed nothing and the stranger could not read,
// show or use what a story had given. A deed that gives evidence puts it in
// the dossier: what it is, from whom, by which deed, and who saw it. READ and
// SHOW work on it, a condition asks for it (holds), and INVENTORY and the
// quest page list it.

/** The dossier, by id. */
export function dossier(world: World): Record<string, Evidence> {
  return world.state.player.dossier ?? {}
}

/** Whether the stranger holds this evidence. */
export function holdsEvidence(world: World, id: string): boolean {
  return Boolean(dossier(world)[id])
}

/** Evidence the stranger now holds: from whom and by which deed, seen by whoever stands here. */
export function addEvidence(world: World, e: { evidence: string; name: string; text?: string }, by?: { quest?: string; deed?: string; with?: string; text?: string }): void {
  const here = world.state.player.location
  const seen = Object.entries(world.state.npcs)
    .filter(([id, s]) => s.location === here && !s.dead && world.present(id))
    .map(([id]) => id)
  ;(world.state.player.dossier ??= {})[e.evidence] = {
    name: e.name,
    text: (e.text ?? by?.text ?? e.name).trim(),
    ...(by?.quest ? { quest: by.quest } : {}),
    ...(by?.deed ? { deed: by.deed } : {}),
    ...(by?.with ? { from: by.with } : {}),
    t: world.now,
    seen,
  }
}

const plain = (s: string) => s.toLowerCase().replace(/^(?:the|a|an|my|your)\s+/, '').trim()

/** Evidence by the words the stranger uses for it ("telemetry", "the copies"); none when the words fit nothing held. */
export function evidenceByWords(world: World, words: string): [string, Evidence] | undefined {
  const wanted = plain(words)
  if (!wanted) return undefined
  const all = Object.entries(dossier(world))
  const named = (e: Evidence) => plain(e.name)
  return (
    all.find(([id, e]) => named(e) === wanted || id === wanted.replace(/\s+/g, '_')) ??
    all.find(([, e]) => wanted.split(/\s+/).every((w) => named(e).split(/[^a-z0-9']+/).some((n) => n === w || n.replace(/s$/, '') === w.replace(/s$/, ''))))
  )
}

/** Someone as the stranger knows them: by name, or as they were seen ("the port coordinator"). */
const known = (world: World, id: string) => (world.knowsName(id) ? callName(world.npc(id)) : world.seenName(id))

/** Who gave it, in the stranger's words. */
function giver(world: World, e: Evidence): string {
  return e.from && world.content.npcs.has(e.from) ? known(world, e.from) : ''
}

/** READ <evidence>: what it says, and where it came from. */
export function readEvidence(world: World, words: string): string | undefined {
  const found = evidenceByWords(world, words)
  if (!found) return undefined
  const [, e] = found
  const from = giver(world, e)
  const how = [from ? `from ${from}` : '', e.deed ? `by: ${named(world, e.deed)}` : ''].filter(Boolean).join(', ')
  const seen = e.seen.filter((n) => n !== e.from && world.content.npcs.has(n)).map((n) => known(world, n))
  const and = seen.length > 1 ? `${seen.slice(0, -1).join(', ')} and ${seen.at(-1)}` : seen[0]
  return `${capital(e.name)}${how ? ` (${how})` : ''}: ${e.text}${and ? ` ${capital(and)} saw it.` : ''}`
}

/**
 * SHOW <evidence> [TO <someone>]: shown to someone here, or to whoever you are
 * talking with. They remember it; in a talk, their next answer hears it.
 */
export function showEvidence(world: World, words: string, npcId: string | undefined): string {
  const found = evidenceByWords(world, words)
  if (!found) return Object.keys(dossier(world)).length ? `You hold nothing called that. ${holdingLine(world)}` : 'You hold no evidence of anything yet.'
  const [, e] = found
  if (!npcId) return `Show ${e.name} to whom?`
  const who = known(world, npcId)
  if (!e.seen.includes(npcId)) e.seen.push(npcId)
  remember(world, npcId, `The stranger showed you ${e.name}: ${e.text}`)
  const talk = world.state.talk
  if (talk?.npc === npcId) talk.heard = `The stranger shows you ${e.name}: ${e.text} Answer to what it shows, as you would.`
  return `You show ${who} ${e.name}.`
}

/** "You hold as evidence: the test telemetry (from Tessa), the copies of the recordings." */
export function holdingLine(world: World): string {
  const all = Object.values(dossier(world))
  if (!all.length) return ''
  return `You hold as evidence: ${all.map((e) => `${e.name}${giver(world, e) ? ` (from ${giver(world, e)})` : ''}`).join(', ')}.`
}

/** The evidence of one story, for its page in the journal. */
export function questEvidence(world: World, questId: string): string | undefined {
  const all = Object.values(dossier(world)).filter((e) => e.quest === questId)
  return all.length ? `Evidence: ${all.map((e) => `${e.name}${giver(world, e) ? ` (from ${giver(world, e)})` : ''}`).join(', ')}.` : undefined
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The words of a deed with the names of people as they are written ("ask Tessa about the drive test"). */
function named(world: World, words: string): string {
  const names = new Set([...world.content.npcs.values()].flatMap((n) => [n.name, n.short, callName(n)].join(' ').split(/\s+/)).filter((w) => /^[A-Z][a-z']+$/.test(w)))
  return words.replace(/\b[a-z][a-z']+\b/g, (w) => (names.has(capital(w)) ? capital(w) : w))
}
