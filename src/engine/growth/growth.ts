import { withProps } from '../props'
import { withFarPlaces, type FarPlace } from './far'
import { addCrowd, endCrowd } from './crowds'
import { isRestDay } from '../clock'
import { callName, LocationSchema, lockedIds, NpcSchema, type Content, type Npc } from '../content'
import { economy, ledgerOf } from '../economy/ledger'
import { recordFact } from '../news'
import { newNpcState, objectKey, serviceKey, type GameState } from '../state'
import type { World } from '../world'
import type { Newcomer } from './schema'

// Growth (M8.5; design: signalen en nasleep, "Groei"). What a game adds to its
// world is kept in the game state and laid over the content: people who came
// from a template, places a project built, a workshop more. Every system then
// sees them as if they had been written, and a save carries them. What is
// made is checked as content before it enters the world.

const DAY = 24 * 60
/** A season: a quarter of a year of 13 months of 30 days, and the five days. */
const SEASON = 91 * DAY

export interface ProjectState {
  settlement: string
  started: number
  /** Workdays done, and what was used and paid so far. */
  days: number
  used: Record<string, number>
  paid: number
  /** Money put in by others: the player, by who. */
  invested: Record<string, number>
  done?: number
}

export interface GrowthState {
  /** People who came during the game, as content. */
  people: Npc[]
  projects: Record<string, ProjectState>
  /** How many came this season. */
  season?: { n: number; arrived: number }
  /** More hands at a workshop than the content names: settlement:workshop to people. */
  hands: Record<string, string[]>
  /** Far places made playable in this game (M9.1), by topic, and those waiting for the chronicler. */
  far?: Record<string, FarPlace>
  farPending?: string[]
  /** How a far place without a road is reached (M10.12): the passage and its stop, kept while the chronicler words it. */
  farVia?: Record<string, import('./far').FarVia>
}

export function growth(world: World): GrowthState {
  return (world.state.growth ??= { people: [], projects: {}, hands: {} })
}

/** The content of a game: the world's own, with the people who came and what was built. */
export function grownContent(base: Content, state: GameState): Content {
  // Objects the chronicler placed (M10.5) stand in their places like any other.
  return withProps(grownOnly(base, state), state)
}

function grownOnly(base: Content, state: GameState): Content {
  const g = state.growth
  const built = g ? Object.entries(g.projects).filter(([, p]) => p.done !== undefined).map(([id]) => base.projects.get(id)!).filter(Boolean) : []
  if (g?.far && Object.keys(g.far).length) base = withFarPlaces(base, state)
  // A settlement that changed rank (M9.1): its kind is the game's now.
  if (state.ranks && Object.keys(state.ranks).length) {
    const areas = new Map(base.areas)
    for (const [id, kind] of Object.entries(state.ranks)) if (areas.has(id)) areas.set(id, { ...areas.get(id)!, kind })
    base = { ...base, areas }
  }
  if (!g || (g.people.length === 0 && built.length === 0)) return base
  const npcs = new Map(base.npcs)
  // Someone the editor adopted into the world is the world's now, with the same id (M9.1).
  for (const n of g.people) if (!base.npcs.has(n.id)) npcs.set(n.id, n)
  const locations = built.length ? new Map(base.locations) : base.locations
  const settlements = built.length ? new Map(base.settlements) : base.settlements
  for (const p of built.sort((a, b) => a.id.localeCompare(b.id))) {
    // A place the editor adopted into the world (M9.1) is the world's now, with the same id.
    if (p.place && !base.locations.has(String(p.place['id']))) {
      const place = LocationSchema.parse(p.place)
      locations.set(place.id, place)
      if (p.link) {
        const from = locations.get(p.link.from)!
        locations.set(from.id, { ...from, exits: { ...from.exits, [p.link.direction]: { to: place.id, minutes: 1 } } })
      }
    }
    if (p.workshops.length) {
      const s = settlements.get(p.settlement)!
      settlements.set(s.id, { ...s, workshops: [...s.workshops, ...p.workshops] })
    }
  }
  return { ...base, npcs, locations, settlements }
}

/** Who works a workshop besides those the content names: newcomers who took up the trade. */
export function handsAt(world: World, settlement: string, workshop: string): string[] {
  return world.state.growth?.hands[`${settlement}:${workshop}`] ?? []
}

// ---------------------------------------------------------------- newcomers

/** A newcomer template for a workshop, or for a good its workshop makes, if the content has one. */
export function templateFor(world: World, key: string): Newcomer | undefined {
  const makes = (trade: string) => [...world.content.settlements.values()].some((s) => s.workshops.some((w) => w.id === trade && key in w.makes))
  return [...world.content.newcomers.values()].sort((a, b) => a.id.localeCompare(b.id)).find((n) => n.trade === key || makes(n.trade))
}

/** A house in the settlement nobody lives in: one the layer found empty, or one the content says stands empty (tag vacant). */
function freeHouseIn(world: World, settlement: string): string | undefined {
  const vacant = [...world.content.locations.values()].filter((l) => l.tags.includes('vacant')).map((l) => l.id)
  const empty = [...new Set([...Object.keys(world.state.layer?.empty ?? {}), ...vacant])].sort()
  const lived = new Set(Object.keys(world.state.npcs).filter((id) => !world.state.npcs[id]!.dead).map((id) => world.npc(id).home))
  return empty.find((h) => world.content.locations.get(h)?.area === settlement && !lived.has(h))
}

const fillText = (text: string, vars: Record<string, string>, pronoun: 'she' | 'he' | 'they') => {
  const forms = { she: ['she', 'her', 'woman'], he: ['he', 'his', 'man'], they: ['they', 'their', 'person'] }[pronoun]
  return text
    .replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole)
    .replaceAll('{they}', forms[0]!)
    .replaceAll('{their}', forms[1]!)
    .replaceAll('{man}', forms[2]!)
}

/**
 * Newcomers arrive (verb arrive, M8.5): a household from a template comes to
 * live in a free house of the settlement and takes up the trade nobody works
 * there. Names from the world's tables, famous to nobody, knowing nobody,
 * checked as content. At most so many a season. False when it cannot be now.
 */
export function arrive(world: World, templateId: string, settlement: string): string[] | undefined {
  const t = world.content.newcomers.get(templateId)
  const s = world.content.settlements.get(settlement)
  const names = world.content.world.names
  if (!t || !s || !names) return undefined
  const g = growth(world)
  const season = Math.floor(world.now / SEASON)
  if (g.season?.n !== season) g.season = { n: season, arrived: 0 }
  if (g.season.arrived + t.people.length > world.content.world.newcomers_per_season) return undefined
  const home = freeHouseIn(world, settlement)
  if (!home) return undefined
  const taken = new Set([...world.content.npcs.values()].flatMap((n) => [n.name.split(' ')[0]!, n.name]))
  const locked = lockedIds(world.base)
  const rng = (lo: number, hi: number) => world.rng.int('growth', lo, hi)
  const pick = <T>(list: T[]): T => list[rng(0, list.length - 1)]!
  const family = pick(names.family.filter((f) => ![...taken].some((n) => n.endsWith(` ${f}`))).length ? names.family.filter((f) => ![...taken].some((n) => n.endsWith(` ${f}`))) : names.family)
  const from = world.content.outlands.get(t.from)?.name ?? world.content.areas.get(t.from)?.name ?? t.from
  const area = world.content.areas.get(settlement)?.name ?? settlement
  const household = `hh_${family.toLowerCase().replace(/[^a-z]/g, '')}_${Math.floor(world.now / DAY)}`
  const people: Npc[] = []
  for (const m of t.people) {
    const pronoun = m.pronoun ?? (m.role === 'spouse' && people[0] ? (people[0].pronoun === 'he' ? 'she' : 'he') : pick(['she', 'he'] as const))
    const pool = names[pronoun === 'they' ? pick(['she', 'he'] as const) : pronoun].filter((n) => !taken.has(n))
    const given = pool.length ? pick(pool) : pick(names[pronoun === 'she' ? 'she' : 'he'])
    taken.add(given)
    const name = `${given} ${family}`
    // An id is a key (M9.1): never one the world has, or ever had, or this game gave already.
    const stem = `npc_${given}_${family}`.toLowerCase().replace(/[^a-z0-9_]/g, '')
    const used = (candidate: string) => world.content.npcs.has(candidate) || locked.has(candidate) || people.some((p) => p.id === candidate)
    let id = stem
    for (let n = 2; used(id); n++) id = `${stem}_${n}`
    const vars = { name: given, from, area }
    const raw = {
      id,
      name,
      short: m.role === 'head' ? `${given} the ${world.content.professions.get(m.profession)?.name ?? m.profession}` : given,
      pronoun,
      age: rng(m.age[0], Math.max(m.age[0], m.age[1])),
      profession: m.profession,
      home,
      ...(m.role === 'head' ? { work: world.content.settlements.get(settlement)!.workshops.find((w) => w.id === t.trade)?.at ?? home } : {}),
      household,
      fame: 0,
      appearance: fillText(pick(m.looks), vars, pronoun),
      // Around the middle, as nobody here knows them yet.
      personality: { warmth: rng(-1, 2), courage: rng(-1, 1), honesty: rng(-1, 2), temper: rng(-1, 1), curiosity: rng(0, 2), diligence: rng(0, 2) },
      child: m.role === 'child',
      aliases: [given.toLowerCase()],
      public_facts: m.role === 'head' ? t.facts.map((f) => fillText(f, vars, pronoun)) : [`${given} is one of the ${family}s, who came from ${from}.`],
      ...(t.speech && m.role === 'head' ? { speech: t.speech } : {}),
      money: m.role === 'child' ? 1 : 20,
      inventory: {},
      knows_areas: [settlement],
      portrait: 'generic',
      // The faith of where they came from, when it is not the common one here (M9.1).
      ...(world.content.outlands.get(t.from)?.faith ? { faith: world.content.outlands.get(t.from)!.faith } : {}),
      relations: [] as { to: string; role: string; bond: number }[],
    }
    people.push(NpcSchema.parse(raw))
  }
  // One household: spouses, parents and children.
  const head = people[0]!
  for (const p of people) {
    const role = t.people[people.indexOf(p)]!.role
    for (const q of people) {
      if (p === q) continue
      const other = t.people[people.indexOf(q)]!.role
      const tie = role === 'child' ? (other === 'child' ? 'sibling' : 'parent') : other === 'child' ? 'child' : 'spouse'
      p.relations.push({ to: q.id, role: tie, bond: 2 } as Npc['relations'][number])
    }
  }
  // Checked as content: the world must load with them.
  const next = { ...world.content, npcs: new Map([...world.content.npcs, ...people.map((p) => [p.id, p] as const)]) }
  for (const p of people) {
    if (!next.locations.has(p.home) || !next.professions.has(p.profession)) return undefined
    if (p.relations.some((r) => r.to && !next.npcs.has(r.to))) return undefined
  }
  g.people.push(...people)
  g.season.arrived += people.length
  ;(g.hands[`${settlement}:${t.trade}`] ??= []).push(head.id)
  if (world.state.layer?.empty) delete world.state.layer.empty[home]
  world.regrow()
  for (const p of people) world.state.npcs[p.id] = { ...newNpcState(p, world.now), location: home }
  const trade = world.content.settlements.get(settlement)!.workshops.find((w) => w.id === t.trade)?.name ?? t.trade
  recordFact(world, {
    kind: 'arrived',
    about: [head.id, settlement],
    place: home,
    belang: 2,
    title: `the ${family}s came to ${area}`,
    text: {
      precise: `${callName(head)} ${family} came from ${from} with ${head.pronoun === 'she' ? 'her' : head.pronoun === 'he' ? 'his' : 'their'} household to live in ${area} and work ${trade}.`,
      village: `There are new people in the empty house: the ${family}s, from ${from}. ${callName(head)} is to work ${trade}.`,
      far: `A family from ${from} settled in ${area}.`,
    },
  })
  return people.map((p) => p.id)
}

// ---------------------------------------------------------------- projects

/** A project begins (verb build): false when it is running or done, or what must come first is not finished. */
export function startProject(world: World, id: string): boolean {
  const p = world.content.projects.get(id)
  if (!p) return false
  const g = growth(world)
  if (g.projects[id]) return g.projects[id]!.done === undefined
  if (p.after && g.projects[p.after]?.done === undefined) return false
  g.projects[id] = { settlement: p.settlement, started: world.now, days: 0, used: {}, paid: 0, invested: {} }
  // Nameless workers at the site while it is built (M9.1).
  if (p.crowd) addCrowd(world, { id: `crowd_${id}`, ...p.crowd, cause: id })
  const area = world.content.areas.get(p.settlement)?.name ?? p.settlement
  recordFact(world, {
    kind: 'project',
    about: [p.settlement],
    place: p.link?.from ?? placeIn(world, p.settlement),
    belang: 2,
    claim: { subject: id, key: 'project', value: 'begun' },
    title: `work begins on ${p.name}`,
    text: { precise: `In ${area} they have begun on ${p.name}. It will take ${p.days} workdays.`, village: `They're building ${p.name} in ${area}. There'll be work for anyone with a strong back.`, far: `${area} is building.` },
  })
  return true
}

function placeIn(world: World, settlement: string): string {
  return [...world.content.locations.values()].filter((l) => l.area === settlement).sort((a, b) => a.id.localeCompare(b.id))[0]?.id ?? world.content.world.start.location
}

/**
 * A workday on every running project (M8.5), with the ledgers: a day's share
 * of the materials from the settlement's store and of the money from its purse
 * and what others put in. Short of either, the day is lost. Finished, the new
 * place and workshop enter the world, its flags are set, and those who put
 * money in get it back with a fifth more.
 */
export function projectsDay(world: World): void {
  const g = world.state.growth
  if (!g) return
  if (isRestDay(world.now, world.calendar)) return
  for (const [id, state] of Object.entries(g.projects).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (state.done !== undefined) continue
    const p = world.content.projects.get(id)
    const l = ledgerOf(world, state.settlement)
    if (!p || !l) continue
    const share = Object.fromEntries(Object.entries(p.needs).map(([item, n]) => [item, Math.min(n - (state.used[item] ?? 0), Math.ceil(n / p.days))]))
    if (Object.entries(share).some(([item, n]) => (l.stock[item] ?? 0) < n)) continue
    const invested = Object.values(state.invested).reduce((a, b) => a + b, 0)
    const cost = Math.min(p.cost - state.paid, Math.ceil(p.cost / p.days))
    const fromPurse = Math.max(0, cost - Math.max(0, invested - state.paid))
    if (l.purse < fromPurse) continue
    l.purse -= fromPurse
    state.paid += cost
    for (const [item, n] of Object.entries(share)) {
      l.stock[item] = (l.stock[item] ?? 0) - n
      state.used[item] = (state.used[item] ?? 0) + n
      l.last.used[item] = (l.last.used[item] ?? 0) + n
    }
    state.days++
    if (state.days < p.days) continue
    state.done = world.now
    endCrowd(world, `crowd_${id}`)
    for (const flag of p.sets) (world.state.flags ??= {})[flag] = true
    world.regrow()
    if (p.place) {
      const place = world.content.locations.get(String(p.place['id']))!
      for (const obj of place.objects) world.state.objects[objectKey(place.id, obj.id)] ??= { ...obj.state }
      for (const svc of place.services) world.state.services[serviceKey(place.id, svc.id)] ??= { stock: Object.fromEntries(Object.entries(svc.sells).map(([item, x]) => [item, x.stock])) }
    }
    economy(world)
    for (const [who, amount] of Object.entries(state.invested)) {
      const back = Math.min(l.purse, Math.round(amount * 1.2))
      l.purse -= back
      if (who === 'player') world.state.player.money += back
      else if (world.state.npcs[who]) world.state.npcs[who]!.money += back
    }
    const area = world.content.areas.get(p.settlement)?.name ?? p.settlement
    recordFact(world, {
      kind: 'project',
      about: [p.settlement],
      place: String(p.place?.['id'] ?? p.link?.from ?? placeIn(world, p.settlement)),
      belang: 3,
      claim: { subject: id, key: 'project', value: 'done' },
      title: `${p.name} finished`,
      text: { precise: `${cap(p.name)} in ${area} is finished, after ${p.days} workdays.`, village: `${cap(p.name)} is done at last. Come and look.`, far: `${area} has built ${p.name}.` },
    })
  }
}

const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** The player puts money into a running project (INVEST): back with a fifth more when it is finished. */
export function invest(world: World, id: string, amount: number): boolean {
  const state = world.state.growth?.projects[id]
  if (!state || state.done !== undefined || amount <= 0 || world.state.player.money < amount) return false
  world.state.player.money -= amount
  state.invested['player'] = (state.invested['player'] ?? 0) + amount
  return true
}

/** Whether a project is finished (condition built). */
export function built(world: World, id: string): boolean {
  return world.state.growth?.projects[id]?.done !== undefined
}
