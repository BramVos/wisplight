import { checkContent, RELATION_ROLES, type RelationRole } from '../content'
import type { LlmRequest } from '../dialogue/llm'
import { worldFrame } from '../dialogue/prompt'
import { knowsOfPerson } from '../acquaintance'
import { isRole, setTie } from '../layer'
import { recordFact } from '../news'
import { tieTo } from '../people'
import { openRequest } from '../requests'
import { crossesLimits, readsAsInstruction, worldText } from '../safety'
import { chronicleState } from '../storylines'
import type { World } from '../world'
import { districtOf, districtsOf } from './districts'
import { growth } from './growth'

// The weave round (M10.22; Bram, 28 September 2026: does the chronicler come
// by after a district to lay connections, family across districts, storylines
// that reach back to Veenhoek and old characters?). After a district of a far
// town is made in play, the chronicler gets its new people, the people the
// stranger knows and where they came from, and proposes only connections, no
// new places: bonds between a new person and one who was there before, at
// most two secrets, and one thread back home (a visit someone asks the
// stranger to make). The engine checks each and records it, with why.

/** What the chronicler proposes. */
export interface WeaveReply {
  bonds: { a: string; b: string; role: string; why: string }[]
  secrets: { who: string; text: string; hint: string }[]
  thread?: { from: string; to: string; name: string; ask: string; why: string } | null
  /** A new person in an open storyline (M10.22: a line across areas): a messenger, someone who heard of it, someone it touches. */
  echo?: { who: string; line: string; text: string } | null
}

const MOST_BONDS = 4
const MOST_SECRETS = 2
/** The people the stranger knows, shown to the chronicler: enough to choose from, few enough to stay small. */
const MOST_KNOWN = 16

/** A line the chronicler wrote, when it is fit to keep: short, within the limits, and no instruction to a model. */
function fit(text: unknown, most: number): string | undefined {
  if (typeof text !== 'string') return undefined
  const t = text.trim()
  if (!t || t.length > most || crossesLimits(t) || readsAsInstruction(t)) return undefined
  return t
}

/** The new people of a district, and the people the stranger knows who were there before: the two sides of a bond. */
function sides(world: World, key: string): { fresh: string[]; known: string[]; home?: string } {
  const [topic, id] = key.split(':') as [string, string]
  const fresh = (districtOf(world, topic, id)?.npcs ?? []).map((n) => String(n['id'])).filter((n) => world.content.npcs.has(n))
  const journeys = world.state.player.journeys ?? []
  // Where the stranger came from: the start of their last journey out, or where the game began.
  const from = journeys.at(-1)?.from
  const home = world.content.locations.get(from ?? '')?.area ?? world.content.locations.get(world.content.world.start.location)?.area
  const known = [...world.content.npcs.keys()]
    .filter((n) => !fresh.includes(n) && world.alive(n) && knowsOfPerson(world, n))
    .sort((a, b) => Number(world.npc(b).home && world.content.locations.get(world.npc(b).home)?.area === home) - Number(world.npc(a).home && world.content.locations.get(world.npc(a).home)?.area === home) || a.localeCompare(b))
    .slice(0, MOST_KNOWN)
  return { fresh, known, ...(home ? { home } : {}) }
}

/**
 * The request for the chronicler: the stable part first (the frame and the
 * rules), then this district's people, the people known, the open lines.
 */
export function weaveRequest(world: World, key: string): LlmRequest {
  const [topic, id] = key.split(':') as [string, string]
  const town = world.content.topics.get(topic)?.name ?? topic
  const quarter = districtsOf(world.content, topic).find((d) => d.id === id)?.name ?? id
  const { fresh, known, home } = sides(world, key)
  const card = (n: string) => {
    const npc = world.npc(n)
    const where = world.content.areas.get(world.content.locations.get(npc.home)?.area ?? '')?.name ?? ''
    return `  ${n}: ${npc.name}, ${world.content.professions.get(npc.profession)?.name ?? npc.profession}${where ? `, of ${where}` : ''}. ${npc.public_facts[0] ?? ''}`
  }
  const open = chronicleState(world)
    .lines.filter((l) => l.open && l.people.length)
    .slice(-5)
  const lines = open.map((l) => `  ${l.id}: ${l.title} (with ${l.people.slice(0, 3).map((p) => world.npc(p).name).join(', ')})`)
  const text = { type: 'string' }
  const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
  return {
    role: 'chronicler',
    system: [
      worldText(worldFrame(world.content)),
      '',
      'You weave new people of a far town into a text game that already has people. You propose connections only, never new places or people.',
      `BONDS: at most ${MOST_BONDS}, each between one NEW person and one KNOWN person, by their ids, with a role from ROLES (what b is to a: "child" means b is a's child) and why, in one plain sentence the chronicle keeps. A niece among the bakers, a creditor, an old friend from before: small and believable, never a secret love or a crime unless the frame invites it.`,
      `SECRETS: at most ${MOST_SECRETS}, each for one NEW person: what they hide (one sentence) and a hint someone watchful might notice (one sentence).`,
      'THREAD: one at most, or null: a NEW person asks the stranger to go and see a KNOWN person from HOME (to carry word, a letter, a greeting), with a short name for it, what they say when asking (in their voice, one or two sentences), and why it matters. It must reach back to where the stranger came from.',
      'ECHO: one at most, or null: a NEW person who has a part in one of the OPEN STORYLINES (a messenger from it, someone who heard of it and recognises the stranger, someone it touches), by the line\'s id, with what happens, in one sentence the chronicle keeps.',
      'Use only ids given below. JSON only.',
    ].join('\n'),
    prompt: [
      `TOWN: ${town}, ${quarter}.`,
      'NEW (just met):',
      ...fresh.map(card),
      'KNOWN (people the stranger knows, those from home first):',
      ...known.map(card),
      ...(home ? [`HOME: ${world.content.areas.get(home)?.name ?? home}`] : []),
      ...(lines.length ? ['OPEN STORYLINES:', ...lines] : []),
      `ROLES: ${RELATION_ROLES.join(', ')}`,
    ].join('\n'),
    schemaName: 'weave',
    schema: object({
      bonds: { type: 'array', items: object({ a: text, b: text, role: text, why: text }) },
      secrets: { type: 'array', items: object({ who: text, text, hint: text }) },
      thread: { anyOf: [object({ from: text, to: text, name: text, ask: text, why: text }), { type: 'null' }] },
      echo: { anyOf: [object({ who: text, line: text, text }), { type: 'null' }] },
    }),
    maxTokens: 1200,
    meta: { weave: key, town, fresh, known, lines: open.map((l) => l.id) },
  }
}

/** The chronicler's reply, or null when it cannot be read. */
export function weaveReply(text: string): WeaveReply | null {
  try {
    const v = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as WeaveReply
    return Array.isArray(v.bonds) && Array.isArray(v.secrets) ? v : null
  } catch {
    return null
  }
}

/**
 * What the engine keeps of a weave: each bond between a new and a known
 * person who are not tied yet, with a role from the list; each secret on a
 * new person, checked as content; the thread as a visit a new person asks
 * of the stranger. Each goes into the chronicle with why. Returns what was kept.
 */
export function applyWeave(world: World, key: string, reply: WeaveReply | null): { bonds: number; secrets: number; thread: boolean; echo: boolean } {
  const g = growth(world)
  g.weavePending = (g.weavePending ?? []).filter((k) => k !== key)
  const kept = { bonds: 0, secrets: 0, thread: false, echo: false }
  if (!reply) return kept
  const { fresh } = sides(world, key)
  // The other side is someone who was there before, alive: checked on the world as it is, so a replay keeps the same.
  const before = (n: string) => !fresh.includes(n) && world.content.npcs.has(n) && world.alive(n)
  const [topic, id] = key.split(':') as [string, string]
  const town = world.content.topics.get(topic)?.name ?? topic
  const place = (n: string) => world.state.npcs[n]?.location ?? world.npc(n).home
  for (const b of reply.bonds.slice(0, MOST_BONDS)) {
    const pair = (fresh.includes(b.a) && before(b.b)) || (fresh.includes(b.b) && before(b.a)) ? [b.a, b.b] : undefined
    const why = fit(b.why, 240)
    if (!pair || !why || !isRole(b.role) || tieTo(world, b.a, b.b) || tieTo(world, b.b, b.a)) continue
    setTie(world, b.a, b.b, b.role as RelationRole, 1, why)
    recordFact(world, { kind: 'weave', about: [b.a, b.b], place: place(b.a), belang: 1, title: `${world.npc(b.a).name} and ${world.npc(b.b).name}`, text: { precise: why, village: why, far: `${world.npc(b.a).name} has people far away.` } })
    kept.bonds++
  }
  const district = districtOf(world, topic, id)
  for (const s of reply.secrets.slice(0, MOST_SECRETS)) {
    const text = fit(s.text, 240)
    const hint = fit(s.hint, 240)
    const raw = district?.npcs.find((n) => n['id'] === s.who)
    if (!raw || !text || !hint) continue
    const had = raw['secrets']
    const list = Array.isArray(had) ? [...(had as unknown[])] : []
    raw['secrets'] = [...list, { id: `woven_${list.length + 1}`, text, hint, dc: 16, about: [] }]
    world.regrow()
    if (checkContent(world.content).length) {
      raw['secrets'] = had
      world.regrow()
      continue
    }
    kept.secrets++
  }
  const t = reply.thread
  if (t && fresh.includes(t.from) && before(t.to) && world.alive(t.from)) {
    const name = fit(t.name, 80)
    const ask = fit(t.ask, 300)
    const why = fit(t.why, 240)
    if (name && ask && why && openRequest(world, { npc: t.from, kind: 'visit', target: t.to, name, ask, stakes: why, source: 'chronicler' })) {
      recordFact(world, { kind: 'weave', about: [t.from, t.to], place: place(t.from), belang: 1, title: name, text: { precise: why, village: `${world.npc(t.from).name} of ${town} has word for ${world.npc(t.to).name}.`, far: `Someone in ${town} has word for home.` } })
      kept.thread = true
    }
  }
  // The echo: a fact with the line's pattern and one of its people, so it goes on that line, and the line runs on here.
  const e = reply.echo
  const line = e ? chronicleState(world).lines.find((l) => l.id === e.line && l.open && l.people.length) : undefined
  const echo = e ? fit(e.text, 240) : undefined
  if (e && line && echo && fresh.includes(e.who) && world.alive(e.who)) {
    recordFact(world, { kind: 'weave', pattern: line.pattern, about: [e.who, line.people[0]!], place: place(e.who), belang: 1, title: line.title, text: { precise: echo, village: echo, far: `There is news from ${town}.` } })
    kept.echo = line.people.includes(e.who)
  }
  return kept
}
