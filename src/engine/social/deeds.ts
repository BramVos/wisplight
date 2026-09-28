import { callName } from '../content'
import { applyEffect, attitude, relation, type Attitude } from '../dialogue/relations'
import { openAgreements, settle } from '../agreements'
import { remember } from '../npc/execute'
import type { World } from '../world'

// How relations change (FO, chapter 8, "Hoe relaties veranderen"): deeds, not
// words, move people. Each deed has a fixed effect on affinity, trust and fear,
// weighed by the NPC's values and temper. Words in a conversation stay capped
// at five points (conversation.ts).

export type DeedKind =
  | 'help'
  | 'gift'
  | 'promise_kept'
  | 'promise_broken'
  | 'caught_lying'
  | 'insult'
  | 'threat'
  | 'violence'
  | 'violence_to_liked'
  | 'theft'
  | 'value'

/**
 * What a deed says about the values it touches: a tag and the values it
 * serves (+) or offends (-). A peat-cutter who sees you carrying the
 * surveyor's chains reads it as siding with the drainage.
 */
export const DEED_VALUES: Record<string, Record<string, number>> = {
  help_surveyor: { freedom: -1, tradition: -1, nature: -1, law: 1, order: 1 },
  thwart_survey: { freedom: 1, tradition: 1, nature: 1, law: -1, order: -1 },
  defend_peatcutters: { freedom: 1, tradition: 1 },
  old_rights: { tradition: 1, freedom: 1 },
  hand_over_to_schout: { law: 1, order: 1, justice: 1, freedom: -1 },
  mercy: { faith: 1, family: 1 },
  spare_prisoner: { faith: 1 },
  kill_prisoner: { faith: -1, law: -1, justice: -1, family: -1 },
  fight_witchcraft: { faith: 1, tradition: -1 },
  old_rite: { tradition: 1, faith: -1 },
  theft: { law: -1, justice: -1, wealth: -1, craft: -1 },
  courage: { freedom: 1 },
  fair_wage: { wealth: 1, justice: 1 },
  generosity: { family: 1, faith: 1 },
  cruelty: { family: -1, faith: -1, justice: -1 },
}

/** Deeds the NPC sees or hears of that touch its values: value x 2 per value, capped at 10. */
export function valueDelta(world: World, npcId: string, tag: string): number {
  const values = world.npc(npcId).values
  const weights = DEED_VALUES[tag] ?? {}
  let delta = 0
  for (const [value, sign] of Object.entries(weights)) delta += sign * (values[value] ?? 0) * 2
  return Math.max(-10, Math.min(10, delta))
}

/** A deed of the player's towards an NPC, or seen by one. Returns the change in attitude band, if any. */
export function deed(world: World, npcId: string, kind: DeedKind, opts: { amount?: number; tag?: string; victim?: string; note?: string } = {}): { before: Attitude; after: Attitude } {
  const npc = world.npc(npcId)
  const before = attitude(world, npcId).band
  const rel = relation(world.state, npcId)
  // Familiarity dampens a single event: someone who knows you well weighs one deed less (FO, chapter 8).
  const damp = 1 - Math.min(0.4, rel.familiarity / 250)
  const change = (type: 'affinity' | 'trust' | 'fear', delta: number) => applyEffect(world, npcId, type, Math.round(delta * (type === 'fear' ? 1 : damp)))
  switch (kind) {
    case 'help':
      change('affinity', Math.max(5, Math.min(15, opts.amount ?? 8)))
      change('trust', 5)
      break
    case 'gift': {
      const gifts = (world.state.gifts ??= {})
      const week = Math.floor(world.now / (7 * 24 * 60))
      const g = gifts[npcId]?.week === week ? gifts[npcId] : (gifts[npcId] = { week, count: 0 })
      g.count++
      const greed = 1 + 0.25 * (npc.values['wealth'] ?? 0)
      const worth = Math.max(1, Math.min(10, Math.round(Math.sqrt((opts.amount ?? 8) / 8) * 3 * greed)))
      change('affinity', Math.max(1, Math.round(worth / g.count)))
      break
    }
    case 'promise_kept':
      change('affinity', 3)
      change('trust', 10)
      break
    case 'promise_broken':
      change('affinity', -5)
      change('trust', -20)
      break
    case 'caught_lying':
      change('affinity', -5)
      change('trust', -15)
      break
    case 'insult':
      change('affinity', -(5 + Math.max(0, npc.personality.temper) * 3 + Math.min(4, opts.amount ?? 0)))
      break
    case 'threat':
      change('affinity', -10)
      change('trust', -5)
      change('fear', 15 + Math.max(0, -npc.personality.courage) * 5)
      break
    case 'violence':
      change('affinity', -40)
      change('trust', -30)
      change('fear', 30)
      break
    case 'violence_to_liked': {
      // Weighed by how much the witness cares for the victim.
      const bond = opts.victim ? (world.state.bonds?.[npcId]?.[opts.victim]?.affinity ?? 0) : 50
      const weight = Math.max(0.25, Math.min(1, bond / 50))
      change('affinity', -20 * weight)
      change('trust', -10 * weight)
      change('fear', 20 * weight)
      break
    }
    case 'theft':
      change('affinity', -15)
      change('trust', -25)
      break
    case 'value': {
      const delta = valueDelta(world, npcId, opts.tag ?? '')
      if (delta) change('affinity', delta)
      break
    }
  }
  if (opts.note) remember(world, npcId, opts.note)
  const after = attitude(world, npcId).band
  return { before, after }
}

/** Anger that lasts a while: a mood from -10 to +10 on top of the relation (FO, chapter 8, "Houding"). */
export function setMood(world: World, npcId: string, value: number, hours: number, reason: string): void {
  const state = world.npcState(npcId)
  state.mood = { value: Math.max(-10, Math.min(10, value)), until: world.now + hours * 60, reason }
}

export function moodValue(world: World, npcId: string): number {
  const mood = world.npcState(npcId).mood
  return mood && mood.until > world.now ? mood.value : 0
}

/**
 * Relations drift back slowly (FO, chapter 8): affinity one point a week
 * towards where it began, fear five points a week, trust not at all.
 */
export function weeklyDrift(world: World): void {
  for (const [npcId, rel] of Object.entries(world.state.relations ?? {})) {
    if (rel.affinity > 0) rel.affinity -= 1
    else if (rel.affinity < 0) rel.affinity += 1
    rel.fear = Math.max(0, rel.fear - 5)
    void npcId
  }
  for (const row of Object.values(world.state.bonds ?? {})) {
    for (const rel of Object.values(row)) rel.fear = Math.max(0, rel.fear - 5)
  }
}

// ---------------------------------------------------------------- relations between NPCs

/**
 * The four numbers between NPCs (FO, chapter 8): seeded once from who they are
 * to each other in the content, then moved by what happens between them.
 */
export function seedBonds(world: World): void {
  const bonds = (world.state.bonds ??= {})
  const content = world.content
  const set = (a: string, b: string, bond: number, familiar: number) => {
    if (!content.npcs.has(a) || !content.npcs.has(b)) return
    const row = (bonds[a] ??= {})
    row[b] ??= { affinity: bond * 25, trust: bond * 20, fear: 0, familiarity: familiar }
  }
  for (const npc of [...content.npcs.values()].sort((x, y) => x.id.localeCompare(y.id))) {
    for (const r of npc.relations) {
      if (!r.to || !content.npcs.has(r.to)) continue
      const family = ['parent', 'child', 'spouse', 'sibling', 'grandparent', 'grandchild', 'kin'].includes(r.role)
      set(npc.id, r.to, r.bond, family ? 95 : 60)
      set(r.to, npc.id, r.bond, family ? 95 : 60)
    }
  }
  // The debts in the content go into the ledger.
  const ledger = (world.state.ledger ??= [])
  if (ledger.length === 0) {
    for (const npc of [...content.npcs.values()].sort((x, y) => x.id.localeCompare(y.id))) {
      for (const r of npc.relations) if (r.owes && r.to) ledger.push({ id: `debt_${ledger.length + 1}`, from: npc.id, to: r.to, amount: r.owes, kind: 'money', t: world.now })
    }
  }
}

export function bondOf(world: World, a: string, b: string): { affinity: number; trust: number; fear: number; familiarity: number } | undefined {
  return world.state.bonds?.[a]?.[b]
}

/** Something between two NPCs changes how they see each other. */
export function shiftBond(world: World, a: string, b: string, affinity: number, trust = 0): void {
  const row = ((world.state.bonds ??= {})[a] ??= {})
  const rel = (row[b] ??= { affinity: 0, trust: 0, fear: 0, familiarity: 30 })
  rel.affinity = Math.max(-100, Math.min(100, rel.affinity + affinity))
  rel.trust = Math.max(-100, Math.min(100, rel.trust + trust))
}

/** Who owes whom, as the NPC would put it. */
export function debtsOf(world: World, npcId: string): string[] {
  return (world.state.ledger ?? [])
    .filter((d) => d.from === npcId || d.to === npcId)
    .map((d) => {
      const other = d.from === npcId ? d.to : d.from
      const name = other === 'player' ? 'the stranger' : world.content.npcs.has(other) ? callName(world.npc(other)) : other
      return d.from === npcId ? `you owe ${name} ${world.money(d.amount)}` : `${name} owes you ${world.money(d.amount)}`
    })
}

/** Debts to NPCs that are overdue: a broken promise, and the creditor comes asking (FO, chapter 8). */
export function debtsDue(world: World): void {
  for (const d of world.state.ledger ?? []) {
    if (d.from !== 'player' || d.due === undefined || world.now < d.due || d.note === 'overdue') continue
    d.note = 'overdue'
    // The player's word in the register (M10.2): missed, and the creditor judges it; an old save's debt as before.
    const word = openAgreements(world, 'player').find((a) => a.kind === 'give' && a.to === d.to && a.terms.debt === d.id)
    if (word) settle(world, word, 'missed', `the stranger did not pay ${callName(world.npc(d.to))} back within the week`, { fault: 'by', quiet: true })
    else deed(world, d.to, 'promise_broken')
    const s = world.npcState(d.to)
    s.grievance = { reason: 'debt', t: world.now, line: `"You owe me ${world.money(d.amount)}, and the week is up."` }
  }
}

/**
 * What the player carries openly, others see (FO, chapter 8, the example of
 * Gerrit): the surveyor's chains tell a peat-cutter whose side you are on.
 * Once a day per NPC and thing; a big drop in liking leaves a grievance.
 */
export function noticeCarried(world: World): void {
  const here = world.state.player.location
  const carried = Object.keys(world.state.player.inventory).filter((i) => (world.state.player.inventory[i] ?? 0) > 0 && world.content.items.get(i)?.tags.includes('survey'))
  if (!carried.length) return
  const day = Math.floor(world.now / (24 * 60))
  const seen = (world.state.coincidences ??= {})
  for (const npcId of world.npcsAt(here)) {
    const state = world.npcState(npcId)
    if (state.following || state.dead || state.activity === 'asleep') continue
    for (const item of carried) {
      const key = `seen|${npcId}|${item}|${day}`
      if (seen[key] !== undefined) continue
      seen[key] = world.now
      const npc = world.npc(npcId)
      const delta = valueDelta(world, npcId, 'help_surveyor') + (npc.quirks.includes('hates_the_count') ? -15 : 0)
      if (delta === 0) continue
      applyEffect(world, npcId, 'affinity', delta)
      if (delta > -5) continue
      remember(world, npcId, "saw the stranger carrying the surveyor's chains")
      if (npc.personality.temper >= 1) setMood(world, npcId, -10, 12, "the stranger with the surveyor's chains")
      state.grievance = { reason: 'help_surveyor', t: world.now, line: `"I saw you with the surveyor's chains. So whose side are you on, stranger?"` }
    }
  }
}
