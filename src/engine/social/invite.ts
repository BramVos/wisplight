import { callName } from '../content'
import type { Offer } from '../dialogue/offers'
import { familyOf } from '../layer'
import type { World } from '../world'

// Coming along at someone's asking (M10.3, left over; decided with Bram on 28
// September 2026). A plan or a watcher says: this person asks the stranger to
// come with them somewhere (invite). They go and find the stranger, as
// anyone with something to ask does (seek_player), and make the offer
// themselves: "Will you walk with me to the dyke?" A yes is the same
// agreement lead in the register as any; a no, or no answer, and they go
// alone or wait, as the step says. A child asks only at home or with a
// parent by, and only as far as a child may go (the rule of lead).

const DAY = 24 * 60
/** Further than this from home, a child does not go (the rule of lead). */
const CHILD_RANGE = 45

export interface Invitation {
  place: string
  person?: string
  otherwise: 'alone' | 'wait'
  until: number
  /** When they asked: from then on, no answer is a no. */
  asked?: number
}

/**
 * Someone sets out to ask the stranger along: to find them, and then the
 * offer. False when they cannot: gone, following the stranger already, a
 * place they do not know, or a child asked to go too far.
 */
export function invite(world: World, who: string, place: string, opts: { person?: string; line?: string; otherwise?: 'alone' | 'wait'; hours?: number } = {}): boolean {
  if (!world.content.npcs.has(who) || !world.present(who) || !world.content.locations.has(place)) return false
  const s = world.npcState(who)
  if (s.following || s.dead) return false
  const npc = world.npc(who)
  if (npc.child && (world.route(npc.home, place)?.minutes ?? Infinity) > CHILD_RANGE) return false
  const until = world.now + (opts.hours ?? 24) * 60
  const where = world.location(place).name
  s.inviting = { place, ...(opts.person ? { person: opts.person } : {}), otherwise: opts.otherwise ?? 'alone', until }
  s.seeking = { line: opts.line ?? `There you are. Will you come with me to ${where}?`, since: world.now, until }
  return true
}

/** Whether they can ask now: a child only at home or with a parent by. */
function mayAsk(world: World, who: string): boolean {
  const npc = world.npc(who)
  if (!npc.child) return true
  const s = world.npcState(who)
  if (s.location === npc.home) return true
  return familyOf(world, who).some((id) => world.state.npcs[id]?.location === s.location && !world.npc(id).child)
}

/** The offer they make when they found the stranger: to walk ahead to the place, and the stranger with them. */
export function inviteOffer(world: World, who: string): Offer | undefined {
  const s = world.npcState(who)
  const inv = s.inviting
  if (!inv || world.now > inv.until) return undefined
  if (!mayAsk(world, who)) {
    declined(world, who)
    return undefined
  }
  inv.asked = world.now
  const where = world.location(inv.place).name
  const whom = inv.person && world.content.npcs.has(inv.person) ? callName(world.npc(inv.person)) : undefined
  return {
    key: `lead:${inv.person ?? inv.place}`,
    kind: 'lead',
    place: inv.place,
    ...(inv.person ? { person: inv.person } : {}),
    what: `walk ahead to ${where}${whom ? `, to ${whom}` : ''}, with the stranger`,
    intent: `come along to ${where}`,
    deed: `take the stranger to ${where}${whom ? `, to ${whom}` : ''}`,
    decision: 'yes',
    reasons: ['you asked the stranger to come along'],
    invite: true,
  }
}

/** A yes: the invitation is done, the lead agreement takes over. */
export function accepted(world: World, who: string): void {
  delete world.npcState(who).inviting
}

/** A no, or no answer: they go alone, or wait where they are, as the step said. */
export function declined(world: World, who: string): void {
  const s = world.npcState(who)
  const inv = s.inviting
  if (!inv) return
  delete s.inviting
  if (inv.otherwise !== 'alone' || s.location === inv.place) return
  s.goals = s.goals.filter((g) => g.id !== `invite_${who}`)
  s.goals.push({ id: `invite_${who}`, type: 'Visit', target: inv.place, priority: 0.9, source: 'ai', created: world.now, until: world.now + DAY / 2 })
  s.plan = []
  s.planGoal = undefined
  s.busyUntil = Math.min(s.busyUntil, world.now)
}

/**
 * Every hour: an invitation asked and left unanswered once the talk is over,
 * or one never asked in its time, is a no.
 */
export function invitesHour(world: World): void {
  for (const id of Object.keys(world.state.npcs).sort()) {
    const inv = world.state.npcs[id]!.inviting
    if (!inv) continue
    const talking = world.state.talk?.npc === id
    if ((inv.asked !== undefined && !talking) || world.now > inv.until) declined(world, id)
  }
}
