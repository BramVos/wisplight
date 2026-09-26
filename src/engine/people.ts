import { callName, type RelationRole } from './content'
import type { Fact } from './state'
import type { World } from './world'

// Who people are to each other (FO, chapter 8, "De relatie"): family, love,
// work, debt and old grudges come from the content, written once and the other
// side derived; everyone else in the same village is a villager. How close
// someone is decides how news reaches them and how they speak of each other.
// The changing numbers between NPCs arrive with the rest of chapter 8 in M6.

export type TieKind = 'family' | 'love' | 'friend' | 'rival' | 'work' | 'debt' | 'teaching' | 'neighbour' | 'known'

export interface Tie {
  /** An NPC id or a topic id; undefined for someone who is not in the game. */
  id?: string
  name: string
  pronoun: 'she' | 'he' | 'they'
  role: RelationRole
  kind: TieKind
  /** -3 bitter to 3 would give their life for them. */
  bond: number
  status: 'alive' | 'dead' | 'missing' | 'away'
  private: boolean
  note?: string
}

const INVERSE: Record<RelationRole, RelationRole> = {
  parent: 'child',
  child: 'parent',
  spouse: 'spouse',
  sibling: 'sibling',
  grandparent: 'grandchild',
  grandchild: 'grandparent',
  kin: 'kin',
  sweetheart: 'sweetheart',
  friend: 'friend',
  rival: 'rival',
  employer: 'employee',
  employee: 'employer',
  foreman: 'crew',
  crew: 'foreman',
  creditor: 'debtor',
  debtor: 'creditor',
  teacher: 'pupil',
  pupil: 'teacher',
  neighbour: 'neighbour',
  acquaintance: 'acquaintance',
}

const KIND: Record<RelationRole, TieKind> = {
  parent: 'family',
  child: 'family',
  spouse: 'family',
  sibling: 'family',
  grandparent: 'family',
  grandchild: 'family',
  kin: 'family',
  sweetheart: 'love',
  friend: 'friend',
  rival: 'rival',
  employer: 'work',
  employee: 'work',
  foreman: 'work',
  crew: 'work',
  creditor: 'debt',
  debtor: 'debt',
  teacher: 'teaching',
  pupil: 'teaching',
  neighbour: 'neighbour',
  acquaintance: 'known',
}

// What the other is, by their pronoun: she, he, they.
const NOUNS: Record<RelationRole, [string, string, string]> = {
  parent: ['mother', 'father', 'parent'],
  child: ['daughter', 'son', 'child'],
  spouse: ['wife', 'husband', 'spouse'],
  sibling: ['sister', 'brother', 'sibling'],
  grandparent: ['grandmother', 'grandfather', 'grandparent'],
  grandchild: ['granddaughter', 'grandson', 'grandchild'],
  kin: ['kinswoman', 'kinsman', 'relative'],
  sweetheart: ['sweetheart', 'sweetheart', 'sweetheart'],
  friend: ['friend', 'friend', 'friend'],
  rival: ['rival', 'rival', 'rival'],
  employer: ['employer', 'employer', 'employer'],
  employee: ['hired hand', 'hired hand', 'hired hand'],
  foreman: ['forewoman', 'foreman', 'foreman'],
  crew: ['crew', 'crew', 'crew'],
  creditor: ['creditor', 'creditor', 'creditor'],
  debtor: ['debtor', 'debtor', 'debtor'],
  teacher: ['teacher', 'teacher', 'teacher'],
  pupil: ['pupil', 'pupil', 'pupil'],
  neighbour: ['neighbour', 'neighbour', 'neighbour'],
  acquaintance: ['acquaintance', 'acquaintance', 'acquaintance'],
}

const PRONOUN_INDEX = { she: 0, he: 1, they: 2 } as const

/** What the other is to someone: "daughter", "hired hand". */
export function noun(tie: Pick<Tie, 'role' | 'pronoun'>): string {
  return NOUNS[tie.role][PRONOUN_INDEX[tie.pronoun]]
}

/** Family and love: the people whose loss or trouble goes to the heart. */
export function isNear(tie: Tie | undefined): boolean {
  return !!tie && (tie.kind === 'family' || tie.kind === 'love' || (tie.kind === 'friend' && tie.bond >= 2))
}

/** Everyone this NPC has a tie with, own relations first, then the ones others wrote about them. */
export function ties(world: World, npcId: string): Tie[] {
  let list = world.tieCache.get(npcId) as Tie[] | undefined
  if (!list) {
    list = buildTies(world, npcId)
    world.tieCache.set(npcId, list)
  }
  // Life and death change during the game; the rest is content.
  return list.map((tie) => (tie.id && world.state.npcs[tie.id]?.dead ? { ...tie, status: 'dead' as const } : tie))
}

function buildTies(world: World, npcId: string): Tie[] {
  const npc = world.npc(npcId)
  const list: Tie[] = []
  for (const r of npc.relations) {
    const other = r.to ? world.content.npcs.get(r.to) : undefined
    const topic = r.to && !other ? world.content.topics.get(r.to) : undefined
    const name = other ? callName(other) : topic ? (topic.kind === 'person' ? callName(topic) : topic.name) : r.name!
    const pronoun = other?.pronoun ?? r.pronoun ?? 'they'
    list.push({ id: r.to, name, pronoun, role: r.role, kind: KIND[r.role], bond: r.bond, status: r.status, private: r.private, note: r.note })
  }
  const own = new Set(list.map((t) => t.id).filter(Boolean))
  for (const other of [...world.content.npcs.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    if (other.id === npcId || own.has(other.id)) continue
    const theirs = other.relations.find((r) => r.to === npcId)
    if (!theirs) continue
    const role = INVERSE[theirs.role]
    list.push({ id: other.id, name: callName(other), pronoun: other.pronoun, role, kind: KIND[role], bond: theirs.bond, status: 'alive', private: theirs.private })
  }
  return list
}

export function tieTo(world: World, npcId: string, otherId: string): Tie | undefined {
  if (!world.content.npcs.has(npcId)) return undefined
  return ties(world, npcId).find((t) => t.id === otherId)
}

/** How close two people are: their tie, or 1 for people of the same village, else 0. */
export function closeness(world: World, a: string, b: string): number {
  const tie = tieTo(world, a, b)
  if (tie) return tie.bond
  const home = (id: string) => world.location(world.npc(id).home).area
  return world.content.npcs.has(a) && world.content.npcs.has(b) && home(a) === home(b) ? 1 : 0
}

/** The NPCs to whom someone is near: family, sweethearts and close friends. */
export function nearOf(world: World, personId: string): string[] {
  return Object.keys(world.state.npcs)
    .sort()
    .filter((id) => id !== personId && !world.state.npcs[id]!.dead && isNear(tieTo(world, id, personId)))
}

// ---------------------------------------------------------------- what the NPC says about them

function describe(tie: Tie): string {
  const them = tie.pronoun === 'she' ? 'her' : tie.pronoun === 'he' ? 'him' : 'them'
  switch (tie.role) {
    case 'employee':
      return 'works for you'
    case 'crew':
      return 'works in your crew'
    case 'creditor':
      return `you owe ${them} money`
    case 'debtor':
      return 'owes you money'
    case 'acquaintance':
      return 'someone you know'
    default:
      return `your ${noun(tie)}`
  }
}

const STATUS: Record<Tie['status'], string> = { alive: '', dead: 'dead', missing: 'missing', away: 'away' }

/** The fixed line of the character card: who the NPC's own people are. */
export function peopleLine(world: World, npcId: string): string | undefined {
  const own = buildTies(world, npcId)
  if (own.length === 0) return undefined
  const text = own.map((tie) => {
    const status = STATUS[tie.status] ? ` (${STATUS[tie.status]})` : ''
    return `${tie.private ? 'PRIVATE, not for people you do not trust: ' : ''}${tie.name}, ${describe(tie)}${status}${tie.note ? `. ${tie.note}` : ''}`
  })
  return `YOUR PEOPLE: ${text.join('; ')}.`
}

/** What is going on with the NPC's own people right now, as far as the NPC knows. */
export function peopleNow(world: World, npcId: string): string[] {
  const lines: string[] = []
  const heard = world.state.news?.heard[npcId] ?? {}
  const facts = world.state.news?.facts ?? []
  for (const tie of ties(world, npcId)) {
    if (!tie.id || !world.content.npcs.has(tie.id)) continue
    const death = facts.find((f) => f.kind === 'death' && f.about.includes(tie.id!) && heard[f.id])
    if (death) {
      lines.push(`${tie.name}, ${describe(tie)}, is dead: ${death.text.precise}${isNear(tie) ? ' You are grieving.' : ''}`)
      continue
    }
    const state = world.state.npcs[tie.id]!
    const home = world.npc(npcId).household
    const knowsIll = (home && home === world.npc(tie.id).household) || facts.some((f) => f.kind === 'sickness' && f.about.includes(tie.id!) && heard[f.id])
    if (state.sickUntil !== undefined && state.sickUntil > world.now && knowsIll) lines.push(`${tie.name}, ${describe(tie)}, is ill in bed.`)
  }
  return lines.length ? [`YOUR PEOPLE NOW: ${lines.join(' ')}`] : []
}

/** Someone near to this NPC whose death it has heard of in the last two months. */
export function mourning(world: World, npcId: string): Tie | undefined {
  const heard = world.state.news?.heard[npcId] ?? {}
  const deaths = (world.state.news?.facts ?? []).filter((f) => f.kind === 'death' && heard[f.id] && world.now - f.t < 60 * 24 * 60)
  return ties(world, npcId).find((tie) => isNear(tie) && deaths.some((f) => f.about.includes(tie.id ?? '')))
}

/** When this NPC heard that someone near to them died, if it did. */
export function griefSince(world: World, npcId: string): number | undefined {
  const heard = world.state.news?.heard[npcId] ?? {}
  const near = new Set(ties(world, npcId).filter(isNear).map((t) => t.id))
  const times = (world.state.news?.facts ?? []).filter((f) => f.kind === 'death' && heard[f.id] && f.about.some((id) => near.has(id))).map((f) => heard[f.id]!.t)
  return times.length ? Math.max(...times) : undefined
}

/** Someone near to this NPC who is missing: a daughter who never came home. */
export function missing(world: World, npcId: string): Tie | undefined {
  return ties(world, npcId).find((tie) => isNear(tie) && tie.status === 'missing')
}

/** Kinds of news the family should hear first: someone runs to tell them. */
export const FAMILY_NEWS = new Set(['death', 'sickness', 'injury', 'missing', 'found', 'arrest'])

export function isFamilyNews(fact: Fact): boolean {
  return FAMILY_NEWS.has(fact.kind)
}
