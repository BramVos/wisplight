import { lockedIds, NpcSchema, type Npc } from '../content'
import { recordFact } from '../news'
import { newNpcState } from '../state'
import type { World } from '../world'
import { growth } from './growth'

// Nameless groups (M9.1; design: signalen en nasleep, "Groei": "een groep
// telt naamlozen, en pas wie de speler aanspreekt, krijgt een naam en een
// kaart"). Workers at a wall, refugees in a church: a group is a record with
// a number and a place, and costs no simulation per person. Whoever the
// player speaks to becomes a person: a name from the world's tables, a card
// checked as content, their place among the others. When the group breaks
// up, those with a name go with it.

export interface Crowd {
  id: string
  /** Of them all: wall workers, refugees from the border. */
  name: string
  /** One of them, as the player may call them: a wall worker, a refugee. */
  one: string
  at: string
  count: number
  /** Where they come from: an area, a region beyond the map, a realm. */
  from: string
  profession: string
  looks: string[]
  since: number
  until?: number
  /** Those who got a name when the player spoke to them. */
  named: string[]
  /** What brought them: a project, a plan. */
  cause?: string
  /** It broke up. */
  over?: boolean
}

export type CrowdInput = Pick<Crowd, 'id' | 'name' | 'one' | 'at' | 'count' | 'from' | 'profession'> & Partial<Pick<Crowd, 'looks' | 'until' | 'cause'>>

const LOOKS = ['Mud to the knees and a tired, careful face.', 'Thin, with big hands and a coat mended many times.', 'Young and restless, with a bundle that never leaves {their} side.', 'Grey at the temples, sunburnt, quick to look away.']

/** A group comes, or is there already. */
export function addCrowd(world: World, input: CrowdInput): Crowd {
  const crowds = (world.state.crowds ??= [])
  const there = crowds.find((c) => c.id === input.id && (c.until === undefined || c.until > world.now))
  if (there) return there
  const crowd: Crowd = { looks: LOOKS, named: [], since: world.now, ...input }
  crowds.push(crowd)
  return crowd
}

/** The groups at a place now. */
export function crowdsAt(world: World, location: string): Crowd[] {
  return (world.state.crowds ?? []).filter((c) => c.at === location && c.count > 0 && (c.until === undefined || c.until > world.now))
}

/** For the description of a place: who stands about in numbers. */
export function crowdLines(world: World, location: string): string[] {
  return crowdsAt(world, location).map((c) => `${c.count > 12 ? `Some ${Math.round(c.count / 5) * 5}` : c.count > 3 ? 'A handful of' : c.count === 1 ? 'One of the' : 'A few'} ${c.name} ${c.count === 1 ? 'is' : 'are'} here.`)
}

/** The group someone means with words like "a worker" or "one of the refugees", at the player's place. */
export function crowdHere(world: World, words: string): Crowd | undefined {
  const w = words.toLowerCase().replace(/^(?:to\s+)?(?:a|an|the|one of the|someone of the|some)\s+/, '').trim()
  if (!w) return undefined
  const stem = (s: string) => s.replace(/s$/, '')
  const said = w.split(/\s+/).filter((x) => x.length > 3).map(stem)
  return crowdsAt(world, world.state.player.location).find((c) => said.some((x) => [...c.one.toLowerCase().split(/\s+/), ...c.name.toLowerCase().split(/\s+/)].map(stem).includes(x)))
}

/**
 * One of a group gets a name and a card (M9.1): made like a newcomer, checked
 * as content, and from now on a person of the world. Undefined when the world
 * has no names to give.
 */
export function nameOne(world: World, crowd: Crowd): string | undefined {
  const names = world.content.world.names
  if (!names || crowd.count <= 0 || !world.content.professions.has(crowd.profession) || !world.content.locations.has(crowd.at)) return undefined
  const rng = (lo: number, hi: number) => world.rng.int('growth', lo, hi)
  const pick = <T>(list: T[]): T => list[rng(0, list.length - 1)]!
  const pronoun = pick(['she', 'he'] as const)
  const taken = new Set([...world.content.npcs.values()].map((n) => n.name))
  const given = pick(names[pronoun].filter((n) => ![...taken].some((t) => t.startsWith(`${n} `))).length ? names[pronoun].filter((n) => ![...taken].some((t) => t.startsWith(`${n} `))) : names[pronoun])
  const family = pick(names.family)
  const locked = lockedIds(world.base)
  const stem = `npc_${given}_${family}`.toLowerCase().replace(/[^a-z0-9_]/g, '')
  let id = stem
  for (let n = 2; world.content.npcs.has(id) || locked.has(id); n++) id = `${stem}_${n}`
  const from = world.content.areas.get(crowd.from)?.name ?? world.content.outlands.get(crowd.from)?.name ?? world.content.realms.get(crowd.from)?.name ?? crowd.from
  const forms = pronoun === 'she' ? ['she', 'her'] : ['he', 'his']
  const npc: Npc = NpcSchema.parse({
    id,
    name: `${given} ${family}`,
    short: `${given}, one of the ${crowd.name}`,
    pronoun,
    age: rng(18, 55),
    profession: crowd.profession,
    home: crowd.at,
    work: crowd.at,
    fame: 0,
    appearance: pick(crowd.looks).replaceAll('{they}', forms[0]!).replaceAll('{their}', forms[1]!),
    personality: { warmth: rng(-1, 1), courage: rng(-1, 1), honesty: rng(-1, 1), temper: rng(-1, 1), curiosity: rng(-1, 1), diligence: rng(0, 2) },
    aliases: [given.toLowerCase(), ...crowd.one.toLowerCase().split(/\s+/).filter((x) => x.length > 3)],
    public_facts: [`${given} is one of the ${crowd.name}, from ${from}.`],
    money: rng(0, 8),
    inventory: {},
    knows_areas: [world.location(crowd.at).area, ...(world.content.areas.has(crowd.from) ? [crowd.from] : [])],
    portrait: 'generic',
    ...(world.content.outlands.get(crowd.from)?.faith ? { faith: world.content.outlands.get(crowd.from)!.faith } : {}),
  })
  growth(world).people.push(npc)
  world.regrow()
  world.state.npcs[id] = { ...newNpcState(world.npc(id), world.now), location: crowd.at }
  crowd.count -= 1
  crowd.named.push(id)
  return id
}

/** Groups whose time is over break up: those with a name go with the others. */
export function crowdsHour(world: World): void {
  for (const crowd of world.state.crowds ?? []) {
    if (crowd.until === undefined || crowd.until > world.now || crowd.over) continue
    crowd.over = true
    for (const id of crowd.named) {
      const s = world.state.npcs[id]
      if (!s || s.absent || s.dead || s.following) continue
      s.absent = true
      s.activity = 'gone'
    }
    const where = world.location(crowd.at)
    recordFact(world, { kind: 'crowd', about: [where.area], place: crowd.at, belang: 1, title: `the ${crowd.name} are gone`, text: { precise: `The ${crowd.name} have gone from ${where.name}.`, village: `The ${crowd.name} have gone.`, far: `The ${crowd.name} have gone.` } })
  }
}

/** The group a project brings while it is built, and sends off when it is done. */
export function endCrowd(world: World, id: string): void {
  for (const c of world.state.crowds ?? []) if (c.id === id && (c.until === undefined || c.until > world.now)) c.until = world.now
}
