import type { Card } from '../chronicler'
import { minuteOfDay } from './clock'
import { callName, CRAFT_RANKS, type Content, type ObjectInstance } from './content'
import { itemName, withArticle } from './items'
import { familyOf, householdOf } from './layer'
import { factById, passOn, recordFact } from './news'
import type { Output } from './commands'
import { tieTo } from './people'
import { notice } from './rules/player'
import type { Fact, GameState, Prop, Storyline } from './state'
import type { World } from './world'

// What the chronicler may place, and the chances that are there already
// (M10.5 part B; FO, chapter 11, "Gepland (M10.5)"). First he makes an
// existing chance visible: a sick woman in bed, a chest with a lock, the
// start of the dry ridge, old letters on an altar. Only then, and only where
// it fits the place, the owner and what went before, he places one new
// object from a template of the content: first the locked chest. The engine
// sets it down with an owner, a lock that is as hard as its make, what it
// holds from a bounded list and the owner's purse, and hints in the owner's
// words. It is lasting world: it follows its owner home and passes to an
// heir. The owner finds a loss at their own fixed moment, and knows who only
// when someone saw it. Never on the path of a quest; one per storyline, a
// few a week. Without a model the rules choose from the same.

const DAY = 24 * 60
/** At most this many new objects in a week of play. */
export const PROPS_PER_WEEK = 3

export function propsOf(world: World): Prop[] {
  return world.state.props?.list ?? []
}

export function propById(world: World, id: string): Prop | undefined {
  return propsOf(world).find((p) => p.id === id)
}

const groundKey = (p: Pick<Prop, 'location' | 'id'>) => `${p.location}/${p.id}`
const lockKey = (location: string, id: string) => `object:${location}/${id}`

/** The props of a game as objects of their places: the content of the game has them like any chest (M10.5). */
export function withProps(base: Content, state: GameState): Content {
  const list = state.props?.list ?? []
  if (!list.length) return base
  const locations = new Map(base.locations)
  for (const p of list) {
    const loc = locations.get(p.location)
    if (!loc) continue
    const instance: ObjectInstance = {
      id: p.id,
      type: base.props.get(p.template)?.type ?? 'strongbox',
      name: p.name,
      ...(p.owner ? { owner: p.owner } : {}),
      staff: [],
      state: {},
      state_text: {},
      ...(p.lock ? { lock: { key: p.lock.key, quality: p.lock.quality, material: p.lock.material } } : {}),
    }
    locations.set(loc.id, { ...loc, objects: [...loc.objects.filter((o) => o.id !== p.id), instance] })
  }
  return { ...base, locations }
}

/** Closed, open (picked, or opened by whoever may), or damaged (forced, or jammed by a bad pick). */
export function propState(world: World, p: Prop): 'closed' | 'open' | 'damaged' {
  const lock = world.state.locks?.[lockKey(p.location, p.id)]
  return lock === 'broken' || lock === 'jammed' ? 'damaged' : lock === 'open' || !p.lock ? 'open' : 'closed'
}

/** What a prop holds now. */
export function propContents(world: World, p: Prop): Record<string, number> {
  return (world.state.ground[groundKey(p)] ??= {})
}

function fill(world: World, text: string, p: Prop, things: string): string {
  const owner = p.owner && world.content.npcs.has(p.owner) ? world.npc(p.owner) : undefined
  const their = owner?.pronoun === 'she' ? 'her' : owner?.pronoun === 'he' ? 'his' : 'their'
  return text
    .replace(/\{owner\}/g, owner ? callName(owner) : 'someone')
    .replace(/\{their\}/g, their)
    .replace(/\{things\}/g, things)
    .replace(/\{place\}/g, world.content.locations.get(p.location)?.name ?? 'home')
}

function pick<T>(world: World, list: T[]): T {
  return list[Math.floor(world.rng.next('props') * list.length)] ?? list[0]!
}

/**
 * Places a new object from a template in its owner's home (M10.5). Refused
 * when it does not fit: no such template, an owner who is gone, a home of the
 * wrong kind, a storyline that has one already, an owner with one already,
 * or enough new things this week.
 */
export function placeProp(world: World, templateId: string, ownerId: string, opts: { line?: string; items?: string[] } = {}): Prop | { problem: string } {
  const tpl = world.content.props.get(templateId)
  if (!tpl) return { problem: `there is no template ${templateId}` }
  if (!world.content.npcs.has(ownerId) || !world.alive(ownerId) || world.npcState(ownerId).absent) return { problem: `${ownerId} cannot own it` }
  const home = world.npc(ownerId).home
  const place = world.content.locations.get(home)
  if (!place || !tpl.where.some((t) => place.tags.includes(t))) return { problem: `${templateId} does not fit ${home}` }
  const state = (world.state.props ??= { seq: 0, list: [] })
  // What went before: the owner is someone of the storyline it belongs to.
  const story = opts.line ? world.state.chronicle?.lines.find((l) => l.id === opts.line) : undefined
  if (story && !story.people.includes(ownerId) && !story.roles.some((r) => r.who === ownerId)) return { problem: `${ownerId} has no part in that storyline` }
  if (opts.line && state.list.some((p) => p.line === opts.line)) return { problem: 'the storyline has its object already' }
  if (state.list.some((p) => p.owner === ownerId && p.template === templateId)) return { problem: `${ownerId} has one already` }
  if (state.list.filter((p) => world.now - p.placed < 7 * DAY).length >= PROPS_PER_WEEK) return { problem: 'enough new things this week' }
  const id = `prop_${++state.seq}`
  // What it holds: the owner's own of the template's kind first, then of the bounded list; money from the purse.
  const owner = world.npcState(ownerId)
  const wanted = (opts.items?.filter((i) => tpl.items.includes(i)) ?? []).slice(0, tpl.max_items)
  const own = tpl.items.filter((i) => (owner.inventory[i] ?? 0) > 0 && !wanted.includes(i))
  const rest = tpl.items.filter((i) => !wanted.includes(i) && !own.includes(i))
  const items = [...wanted, ...own, ...(rest.length ? [pick(world, rest)] : [])].slice(0, Math.max(tpl.items.length ? 1 : 0, tpl.max_items))
  const contents: Record<string, number> = {}
  for (const i of items) {
    contents[i] = 1
    if ((owner.inventory[i] ?? 0) > 0) owner.inventory[i]! -= 1
  }
  const money = Math.floor(Math.max(0, owner.money) * tpl.money)
  owner.money -= money
  const prop: Prop = {
    id,
    template: tpl.id,
    name: '',
    location: home,
    owner: ownerId,
    ...(opts.line ? { line: opts.line } : {}),
    placed: world.now,
    ...(tpl.lock ? { lock: { key: `${id}_key`, quality: pick(world, tpl.lock.quality), material: pick(world, tpl.lock.material) } } : {}),
    money,
    expected: { ...contents },
    expectedMoney: money,
    checks: tpl.check_hour,
    hints: [],
  }
  prop.name = fill(world, tpl.name, prop, '')
  state.list.push(prop)
  world.state.ground[groundKey(prop)] = contents
  world.regrow()
  // The hints: facts in the owner's words, known to the owner and the house; the first says where it is and what is in it.
  const things = [...items.map((i) => withArticle(itemName(world.content, i, 1))), ...(money ? ['money'] : [])]
  const list = things.length > 1 ? `${things.slice(0, -1).join(', ')} and ${things.at(-1)}` : (things[0] ?? 'nothing much')
  const house = [ownerId, ...householdOf(world, ownerId).filter((h) => h !== ownerId && world.alive(h))]
  for (const [n, hint] of tpl.hints.entries()) {
    const fact = recordFact(world, {
      kind: 'prop_hint',
      about: [ownerId],
      place: home,
      belang: 1,
      title: `${callName(world.npc(ownerId))}'s ${world.content.objectTypes.get(tpl.type)?.name ?? 'chest'}`,
      text: { precise: fill(world, hint.precise, prop, list), village: fill(world, hint.village, prop, list), far: fill(world, hint.far, prop, list) },
      witnesses: n === 0 ? [ownerId] : house,
      ...(n === 0 && items[0] ? { claim: { subject: id, key: 'holds', value: items[0] } } : {}),
    })
    // The owner knows it, wherever they are; the house knows the rest.
    for (const who of n === 0 ? [ownerId] : house) {
      const heard = ((world.state.news!.heard[who] ??= {}))
      heard[fact.id] ??= { level: 3, reliability: 1, from: 'witness', t: world.now }
    }
    prop.hints.push(fact.id)
  }
  // The storyline it belongs to has the hints among its facts.
  const line = opts.line ? world.state.chronicle?.lines.find((l) => l.id === opts.line) : undefined
  if (line) {
    line.facts.push(...prop.hints)
    if (!line.people.includes(ownerId)) line.people.push(ownerId)
  }
  return prop
}

/** Whether a hint of what a prop holds is still so (M10.5): the journal says what was true then. */
export function hintHolds(world: World, fact: Fact): boolean | undefined {
  if (fact.claim?.key !== 'holds' || !fact.claim.subject.startsWith('prop_')) return undefined
  const p = propById(world, fact.claim.subject)
  if (!p) return false
  return (propContents(world, p)[fact.claim.value] ?? 0) > 0
}

/** Who a thing passes to when its owner dies: spouse, child, brother or sister, parent, the house. */
function heirOf(world: World, owner: string): string | undefined {
  const alive = (id: string) => world.content.npcs.has(id) && world.alive(id) && !world.npcState(id).absent
  const family = familyOf(world, owner).filter(alive)
  for (const role of ['spouse', 'child', 'sibling', 'parent']) {
    const heir = family.find((id) => tieTo(world, owner, id)?.role === role)
    if (heir) return heir
  }
  return family[0] ?? householdOf(world, owner).find((id) => id !== owner && alive(id))
}

/** A prop goes to a new place with everything in it and the state of its lock. */
function move(world: World, p: Prop, to: string): void {
  const from = groundKey(p)
  const lock = world.state.locks?.[lockKey(p.location, p.id)]
  const contents = world.state.ground[from]
  delete world.state.ground[from]
  if (lock) delete world.state.locks![lockKey(p.location, p.id)]
  p.location = to
  if (contents) world.state.ground[groundKey(p)] = contents
  if (lock) world.state.locks![lockKey(to, p.id)] = lock
}

/**
 * Every hour (M10.5): a prop whose owner died passes to an heir; one whose
 * owner moved goes along; and at the owner's fixed moment, at home and awake,
 * they look in it. Something gone, they know that it is gone; who took it
 * only when someone saw it happen, and the lock says whether it was forced.
 */
export function propsHour(world: World): void {
  const list = propsOf(world)
  if (!list.length) return
  let changed = false
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  for (const p of list) {
    if (p.owner && world.state.npcs[p.owner]?.dead) {
      const heir = heirOf(world, p.owner)
      if (heir) p.owner = heir
      else delete p.owner
      changed = true
    }
    if (!p.owner) continue
    const tpl = world.content.props.get(p.template)
    const home = world.npc(p.owner).home
    const fits = tpl && world.content.locations.get(home)?.tags.some((t) => tpl.where.includes(t))
    if (home !== p.location && fits) {
      move(world, p, home)
      changed = true
    }
    const s = world.state.npcs[p.owner]!
    if (hour === p.checks && s.location === p.location && s.activity !== 'asleep' && world.now - (p.missed ?? -DAY) > 12 * 60) lookInside(world, p)
  }
  if (changed) world.regrow()
}

/** The owner looks in it: what is gone against what they believe is there. */
function lookInside(world: World, p: Prop): void {
  const now = propContents(world, p)
  const gone = Object.entries(p.expected).filter(([i, n]) => (now[i] ?? 0) < n).map(([i]) => i)
  const money = p.expectedMoney - p.money
  p.expected = Object.fromEntries(Object.entries(now).filter(([, n]) => n > 0))
  p.expectedMoney = p.money
  if (!gone.length && money <= 0) return
  p.missed = world.now
  const owner = p.owner!
  const name = callName(world.npc(owner))
  const their = world.npc(owner).pronoun === 'she' ? 'her' : world.npc(owner).pronoun === 'he' ? 'his' : 'their'
  const what = [...gone.map((i) => withArticle(itemName(world.content, i, 1))), ...(money > 0 ? [world.money(money)] : [])].join(' and ')
  const state = propState(world, p)
  const trace = state === 'damaged' ? ', and the lock is broken' : ''
  // Who did it: only whoever saw it, and told.
  const seen = (world.state.crimes ?? []).find((c) => c.kind === 'theft' && c.victim === owner && c.place === p.location && c.witnesses.length > 0 && c.t >= p.placed)
  const witness = seen?.witnesses.find((w) => world.content.npcs.has(w))
  const knows = seen ? ` ${witness ? callName(world.npc(witness)) : 'Someone'} saw the stranger at it.` : ` ${world.npc(owner).pronoun === 'she' ? 'She does' : world.npc(owner).pronoun === 'he' ? 'He does' : 'They do'} not know who took it.`
  const memory = (world.npcState(owner).memory ??= [])
  memory.push({ t: world.now, note: `Someone has been at my ${world.content.objectTypes.get(world.content.props.get(p.template)?.type ?? '')?.name ?? 'chest'}: ${what} gone.${seen ? ' It was the stranger.' : ''}`, topics: [p.location], valence: -1 })
  if (memory.length > 30) memory.splice(0, memory.length - 30)
  recordFact(world, {
    kind: 'prop_loss',
    about: [owner],
    place: p.location,
    belang: 1,
    title: `${name} missing ${what}`,
    text: { precise: `${name} found ${their} ${p.name.replace(/^.*?'s /, '')} short: ${what} gone${trace}.${knows}`, village: `Someone has been at ${name}'s ${p.name.replace(/^.*?'s /, '')}, and ${what} is gone.`, far: 'A theft in a house.' },
    witnesses: [owner, ...householdOf(world, owner).filter((h) => h !== owner && world.state.npcs[h]?.location === p.location)],
    claim: { subject: owner, key: 'lost', value: gone[0] ?? 'money' },
  })
}

/**
 * Its owner opens it for the stranger (M10.5): leave to take from it today,
 * and why, in their own words: the hints, and what they know of the
 * storyline it belongs to. The good turn in return is the offer's.
 */
export function letOpen(world: World, owner: string, lock: string, place: string): Output[] {
  ;(world.state.locks ??= {})[lock] = 'open'
  const hour = Math.floor(minuteOfDay(world.now) / 60)
  const until = hour < 6 || hour >= 21 ? world.now + 3 * 60 : world.now - minuteOfDay(world.now) + 21 * 60
  ;(world.state.player.permits ??= {})[lock] = until
  const name = callName(world.npc(owner))
  const out: Output[] = [{ kind: 'narration', text: `${name} unlocks it and lifts the lid for you.` }]
  const prop = propById(world, lock.split('/').at(-1) ?? '')
  if (prop) {
    const line = prop.line ? world.state.chronicle?.lines.find((l) => l.id === prop.line) : undefined
    const told = [...prop.hints, ...(line?.facts ?? []).filter((f) => !prop.hints.includes(f))].slice(0, 4)
    for (const id of told) {
      const fact = factById(world, id)
      if (!fact || !world.state.news?.heard[owner]?.[id]) continue
      passOn(world, owner, 'player', id)
      out.push({ kind: 'text', text: `${name} tells you: ${fact.text.precise}` })
    }
  }
  const key = lock.replace(/^object:/, '')
  const object = world.location(place).objects.find((o) => o.id === key.split('/').at(-1))
  const inside = Object.entries((world.state.ground[key] ??= { ...(object?.contents ?? {}) })).filter(([, n]) => n > 0)
  const money = prop?.money ?? 0
  out.push({ kind: 'text', text: inside.length || money ? `In it: ${[...inside.map(([i, n]) => itemName(world.content, i, n)), ...(money ? [world.money(money)] : [])].join(', ')}. You may take what you need today.` : 'It is empty.' })
  return out
}

/**
 * A smith called in opens a lock (M10.5): reliable, but then someone else
 * knows. The smith saw it, and tells it as any news.
 */
export function openedBy(world: World, smith: string, lock: string, place: string): void {
  if (world.state.locks?.[lock] !== 'open' && world.state.locks?.[lock] !== 'broken') (world.state.locks ??= {})[lock] = 'open'
  const objectId = lock.split('/').at(-1) ?? ''
  const object = world.location(place).objects.find((o) => o.id === objectId)
  const what = object?.name ?? world.content.objectTypes.get(object?.type ?? '')?.name ?? 'the lock'
  const owner = object?.owner && world.content.npcs.has(object.owner) ? object.owner : undefined
  const name = callName(world.npc(smith))
  recordFact(world, {
    kind: 'lock_opened',
    about: [smith, ...(owner ? [owner] : [])],
    place,
    belang: 1,
    title: `${name} opening ${what} for the stranger`,
    text: { precise: `${name} opened the lock of ${what} for the stranger.`, village: `${name} was fetched to open ${what} for the stranger, they say.`, far: 'A smith opening a lock for a stranger.' },
    witnesses: [smith],
  })
  notice(world, `${name} works at the lock of ${what} with a hooked wire and a file, and it opens.`)
}

// ---------------------------------------------------------------- existing chances

/** A situation that is already there, in which a skill counts (M10.5). */
export interface Chance {
  id: string
  kind: 'sick' | 'hurt' | 'locked' | 'hidden' | 'inscription'
  skill: string
  place: string
  who?: string
  /** In the world's words, for the chronicler and the rules. */
  text: string
}

/** The chances in these areas: people ill or hurt, locks, what lies hidden, old letters; not the ones already made visible. */
export function chancesIn(world: World, areas: string[]): Chance[] {
  const inArea = (location: string) => areas.includes(world.content.locations.get(location)?.area ?? '')
  const out: Chance[] = []
  for (const [id, s] of Object.entries(world.state.npcs)) {
    if (!world.content.npcs.has(id) || s.dead || s.absent) continue
    const home = world.npc(id).home
    if (!inArea(home)) continue
    if ((s.sickUntil ?? 0) > world.now) out.push({ id: `sick:${id}`, kind: 'sick', skill: 'medicine', place: home, who: id, text: `${callName(world.npc(id))} lies ill at ${world.location(home).name}.` })
    else if ((s.wounds ?? 0) > 0) out.push({ id: `hurt:${id}`, kind: 'hurt', skill: 'medicine', place: s.location, who: id, text: `${callName(world.npc(id))} is hurt and has not been seen to.` })
  }
  for (const loc of world.content.locations.values()) {
    if (!areas.includes(loc.area)) continue
    for (const o of loc.objects) {
      const key = lockKey(loc.id, o.id)
      if (o.lock && world.state.locks?.[key] !== 'open' && world.state.locks?.[key] !== 'broken') {
        const npc = o.owner && world.content.npcs.has(o.owner) ? world.npc(o.owner) : undefined
        const owner = npc ? callName(npc) : undefined
        const their = npc?.pronoun === 'she' ? 'her' : npc?.pronoun === 'he' ? 'his' : 'their'
        const thing = o.name ? (npc ? o.name.replace(/^.*?'s /, `${their} `) : o.name) : `a ${world.content.objectTypes.get(o.type)?.name ?? 'chest'}`
        out.push({ id: `locked:${loc.id}/${o.id}`, kind: 'locked', skill: 'thievery', place: loc.id, ...(o.owner ? { who: o.owner } : {}), text: `${owner ? `${owner} keeps` : 'There is'} ${thing} under lock at ${loc.name}: a sure hand, a smith, or ${owner ?? 'its owner'}'s leave opens it.` })
      }
      const type = world.content.objectTypes.get(o.type)
      if (type?.inscription && !(world.state.player.found ?? []).includes(`read:${loc.id}/${o.id}`)) out.push({ id: `inscription:${loc.id}/${o.id}`, kind: 'inscription', skill: 'lore', place: loc.id, text: `There are old words on the ${type.name} at ${loc.name}, for someone who can read them.` })
    }
    for (const h of loc.hidden) {
      if ((world.state.player.found ?? []).includes(`${loc.id}/${h.id}`) || !h.topic) continue
      const topic = world.content.topics.get(h.topic)
      out.push({ id: `hidden:${loc.id}/${h.id}`, kind: 'hidden', skill: 'perception', place: loc.id, text: `${topic?.name ? `${topic.name.charAt(0).toUpperCase()}${topic.name.slice(1)}: sharp eyes` : 'Sharp eyes'} may find it at ${loc.name}.` })
    }
  }
  const surfaced = world.state.chances ?? {}
  return out.filter((c) => surfaced[c.id] === undefined)
}

/** The stranger as the chronicler sees them (M10.5): class, skills of trained or more, crafts; no numbers. */
export function playerCard(world: World): Card | undefined {
  const c = world.state.player.character
  if (!c || !world.content.rules) return undefined
  const rules = world.content.rules
  const klass = rules.classes.find((k) => k.id === c.class)?.name ?? c.class
  const ancestry = rules.ancestries.find((a) => a.id === c.ancestry)?.name ?? c.ancestry
  const byRank = (rank: number) => rules.skills.filter((s) => (c.ranks[s.id] ?? 0) === rank).map((s) => s.name.toLowerCase())
  const parts = [`${c.name}, a stranger: ${ancestry.toLowerCase()} ${klass.toLowerCase()}.`]
  for (const [rank, word] of [[3, 'Master of'], [2, 'Expert in'], [1, 'Trained in']] as const) {
    const list = byRank(rank)
    if (list.length) parts.push(`${word} ${list.join(', ')}.`)
  }
  const crafts = Object.entries(world.state.player.crafts ?? {}).filter(([id]) => world.content.crafts.has(id)).map(([id, p]) => `${CRAFT_RANKS[p.rank]} ${world.content.crafts.get(id)!.maker}`)
  if (crafts.length) parts.push(`Crafts: ${crafts.join(', ')}.`)
  return { id: 'player', kind: 'person', name: c.name, text: parts.join(' ') }
}

/** The skills the stranger is trained in or better. */
export function strengths(world: World): Set<string> {
  const c = world.state.player.character
  return new Set(Object.entries(c?.ranks ?? {}).filter(([, r]) => r >= 1).map(([s]) => s))
}

/** Marks a chance as made visible, so the rules do not make it visible again. */
export function surfaced(world: World, id: string): void {
  ;(world.state.chances ??= {})[id] = world.now
}


// ---------------------------------------------------------------- without a model

/** A chance in the words the news of its area would use: only what is so. */
function chanceNews(world: World, c: Chance): string {
  const who = c.who && world.content.npcs.has(c.who) ? callName(world.npc(c.who)) : 'someone'
  const place = world.location(c.place).name
  if (c.kind === 'sick') return `${who} has been laid up at ${place} with a fever, and it will not break.`
  if (c.kind === 'hurt') return `${who} is hurt, and nobody has seen to it.`
  if (c.kind === 'locked') {
    const object = world.location(c.place).objects.find((o) => c.id.endsWith(`/${o.id}`))
    const name = object?.name ?? `a ${world.content.objectTypes.get(object?.type ?? '')?.name ?? 'chest'}`
    return c.who ? `${who} keeps ${name.replace(/^.*?'s /, `${world.npc(c.who).pronoun === 'she' ? 'her' : world.npc(c.who).pronoun === 'he' ? 'his' : 'their'} `)} at ${place} under lock, and the key close.` : `There is ${name} under lock at ${place}, and nobody has the key.`
  }
  if (c.kind === 'hidden') {
    const h = world.location(c.place).hidden.find((x) => c.id.endsWith(`/${x.id}`))
    const topic = h?.topic ? world.content.topics.get(h.topic) : undefined
    return `${topic?.summary ?? 'Something was lost there once.'} Some say you can see it at ${place}, if you know how to look.`
  }
  const object = world.location(c.place).objects.find((o) => c.id.endsWith(`/${o.id}`))
  return `The old words on the ${world.content.objectTypes.get(object?.type ?? '')?.name ?? 'stone'} at ${place} are hard to read now; few can.`
}

/**
 * Without a model (M10.5): every other day the rules make one chance near
 * the stranger visible in the news of its area; half the time one the
 * stranger is good at, else any, for not every chance should fit them.
 */
export function motorChance(world: World): void {
  const times = Object.values(world.state.chances ?? {})
  if (times.length && world.now - Math.max(...times) < 2 * DAY) return
  const area = world.content.locations.get(world.state.player.location)?.area
  if (!area) return
  // Other news of the area stands: a shortage, a death. A chance does not push it out.
  const news = world.state.areaNews?.[area]
  if (news && news !== world.state.chanceNews?.[area]) return
  const list = chancesIn(world, [area])
  if (!list.length) return
  const good = strengths(world)
  const fitting = list.filter((c) => good.has(c.skill))
  const pool = fitting.length && world.rng.next('props') < 0.5 ? fitting : list
  const chance = pool[Math.floor(world.rng.next('props') * pool.length)] ?? pool[0]!
  surfaced(world, chance.id)
  // The news of the area: the stranger hears it there, once, as any news of the day.
  const where = world.location(chance.place).area
  const text = chanceNews(world, chance)
  ;(world.state.areaNews ??= {})[where] = text
  ;(world.state.chanceNews ??= {})[where] = text
}

/**
 * Without a model (M10.5): for an open storyline with no chance left in its
 * places, now and then the rules place an object from a template for someone
 * of its cast, where it fits; one per storyline, a few a week.
 */
export function motorProp(world: World, line: Storyline): void {
  if (!line.open || !world.content.props.size || propsOf(world).some((p) => p.line === line.id)) return
  const areas = [...new Set(line.places.map((p) => world.content.locations.get(p)?.area).filter((a): a is string => Boolean(a)))]
  if (!areas.length || chancesIn(world, areas).length) return
  if (world.rng.next('props') >= 1 / 3) return
  const owners = [...new Set([...line.roles.map((r) => r.who), ...line.people])].filter((id) => world.content.npcs.has(id))
  for (const tpl of [...world.content.props.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const owner of owners) if (!('problem' in placeProp(world, tpl.id, owner, { line: line.id }))) return
  }
}
