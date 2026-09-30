import type { Content } from '../content'
import { STANDARD_SKILLS } from '../dialogue/checks'
import type { Condition, QuestEffect } from './schema'
import type { PlanEffect } from './plans'

// Checks written quests and plans against the rest of the content (FO,
// chapter 15: the builder refuses what the systems cannot carry out). Every
// person, place, thing, stage and ending a quest names must exist, and every
// pattern the player's words are matched against must be a valid expression.

type Refs = Omit<Content, 'world'>

export function checkQuests(c: Refs): string[] {
  const problems: string[] = []
  const place = (id: string, where: string) => {
    if (!c.locations.has(id) && !c.areas.has(id)) problems.push(`${where}: unknown place ${id}`)
  }
  const npc = (id: string, where: string) => {
    if (!c.npcs.has(id)) problems.push(`${where}: unknown NPC ${id}`)
  }
  const item = (id: string, where: string) => {
    if (!c.items.has(id)) problems.push(`${where}: unknown item ${id}`)
  }
  const topic = (id: string, where: string) => {
    if (!c.topics.has(id)) problems.push(`${where}: unknown topic ${id}`)
  }
  const questRef = (ref: string, where: string, kind: 'stage' | 'outcome') => {
    const [qid, sub] = ref.split(':')
    const q = c.quests.get(qid ?? '')
    if (!q) return problems.push(`${where}: unknown quest ${qid}`)
    if (kind === 'stage' && !q.stages?.some((s) => s.id === sub)) problems.push(`${where}: quest ${qid} has no stage ${sub}`)
    if (kind === 'outcome' && sub !== '*' && !q.outcomes?.some((o) => o.id === sub)) problems.push(`${where}: quest ${qid} has no outcome ${sub}`)
  }

  const condition = (x: Condition, where: string): void => {
    if ('knows' in x) {
      if (typeof x.knows === 'string') topic(x.knows, where)
    }
    else if ('has' in x) item(x.has, where)
    else if ('attitude' in x) npc(x.attitude, where)
    else if ('said' in x) {
      // A word said (M10.30): to someone who exists, at a place that does.
      if (x.to) npc(x.to, where)
      if (x.at) place(x.at, where)
    } else if ('talked' in x) npc(x.talked, where)
    else if ('at' in x) place(x.at, where)
    else if ('npc_at' in x) {
      npc(x.npc_at, where)
      place(x.place, where)
    } else if ('dead' in x) npc(x.dead, where)
    else if ('alive' in x) npc(x.alive, where)
    else if ('stage' in x) questRef(x.stage, where, 'stage')
    else if ('outcome' in x) questRef(x.outcome, where, 'outcome')
    else if ('reputation' in x) {
      if (!c.factions.has(x.reputation)) problems.push(`${where}: unknown faction ${x.reputation}`)
    } else if ('companion' in x) npc(x.companion, where)
    else if ('place_state' in x) place(x.place_state, where)
    else if ('here' in x) npc(x.here, where)
    else if ('any' in x) x.any.forEach((y) => condition(y, where))
    else if ('all' in x) x.all.forEach((y) => condition(y, where))
    else if ('not' in x) condition(x.not, where)
  }

  const effect = (e: QuestEffect | PlanEffect, where: string, stages: Set<string>, outcomes: Set<string>): void => {
    if ('give' in e) item(e.give, where)
    else if ('take' in e) item(e.take, where)
    else if ('relation' in e) npc(e.relation, where)
    else if ('reputation' in e) {
      if (!c.factions.has(e.reputation)) problems.push(`${where}: unknown faction ${e.reputation}`)
    } else if ('fact' in e) {
      for (const a of e.fact.about) if (!c.topics.has(a) && !c.npcs.has(a)) problems.push(`${where}: fact about unknown ${a}`)
      if (e.fact.place) place(e.fact.place, where)
    } else if ('goal' in e) {
      npc(e.goal, where)
      if (!c.locations.has(e.target) && !c.npcs.has(e.target)) problems.push(`${where}: unknown goal target ${e.target}`)
    } else if ('grievance' in e) npc(e.grievance, where)
    else if ('stage' in e) {
      if (!stages.has(e.stage)) problems.push(`${where}: unknown stage ${e.stage}`)
    } else if ('outcome' in e) {
      if (!outcomes.has(e.outcome)) problems.push(`${where}: unknown outcome ${e.outcome}`)
    } else if ('restore' in e) {
      npc(e.restore, where)
      if (e.at) place(e.at, where)
    } else if ('move' in e) {
      npc(e.move, where)
      place(e.to, where)
    } else if ('place' in e && 'state' in e) place(e.place, where)
    else if ('plan' in e) {
      if (!c.plans.has(e.plan)) problems.push(`${where}: unknown plan ${e.plan}`)
    } else if ('start' in e) {
      if (!c.quests.has(e.start)) problems.push(`${where}: unknown quest ${e.start}`)
    } else if ('kill' in e) npc(e.kill, where)
    else if ('learn' in e) topic(e.learn, where)
    else if ('encounter' in e) {
      if (!c.encounters.has(e.encounter)) problems.push(`${where}: unknown encounter ${e.encounter}`)
    } else if ('hand' in e) {
      item(e.hand, where)
      npc(e.to, where)
    } else if ('send' in e) {
      npc(e.send, where)
      place(e.to, where)
    } else if ('vanish' in e) npc(e.vanish, where)
    else if ('join' in e) {
      if (!c.factions.has(e.join)) problems.push(`${where}: unknown faction ${e.join}`)
    } else if ('seize' in e) {
      item(e.seize, where)
      npc(e.from, where)
    } else if ('flee' in e) place(e.to, where)
    else if ('close' in e) e.close.forEach((l) => place(l, where))
    else if ('open' in e) e.open.forEach((l) => place(l, where))
    else if ('market' in e) item(e.market, where)
    else if ('tension' in e) e.tension.forEach((r) => c.realms.has(r) || problems.push(`${where}: unknown realm ${r}`))
    else if ('news' in e && 'area' in e) place(e.area, where)
  }

  for (const q of c.quests.values()) {
    if (!q.stages?.length) continue
    const w = `quest ${q.id}`
    const stages = new Set(q.stages.map((s) => s.id))
    const outcomes = new Set((q.outcomes ?? []).map((o) => o.id))
    const target = (to: string, where: string) => {
      if (!stages.has(to) && !outcomes.has(to) && !c.quests.has(to)) problems.push(`${where}: ${to} is no stage, outcome or quest`)
    }
    for (const t of q.starts?.talk ?? []) npc(t, `${w}.starts`)
    for (const t of q.starts?.at ?? []) place(t, `${w}.starts`)
    for (const x of q.starts?.when ?? []) condition(x, `${w}.starts`)
    for (const s of q.stages) {
      for (const e of s.on_enter) effect(e, `${w}.${s.id}`, stages, outcomes)
      // What people know per stage (M10.30): someone of this world.
      for (const who of Object.keys(s.knows ?? {})) npc(who, `${w}.${s.id}.knows`)
      for (const n of s.next) {
        target(n.to, `${w}.${s.id}.next`)
        for (const x of n.when) condition(x, `${w}.${s.id}.next`)
        for (const e of n.effects) effect(e, `${w}.${s.id}.next`, stages, outcomes)
      }
    }
    // What the story keeps hidden (M10.30): patterns that compile, and a stage that gives it out.
    for (const [i, truth] of (q.truths ?? []).entries()) {
      const where = `${w}.truths.${i + 1}`
      if (truth.from && !stages.has(truth.from)) problems.push(`${where}: unknown stage ${truth.from}`)
      for (const x of truth.when) condition(x, where)
      for (const p of truth.words) {
        try {
          new RegExp(p, 'i')
        } catch {
          problems.push(`${where}: bad pattern ${p}`)
        }
      }
    }
    for (const a of q.actions ?? []) {
      const where = `${w}.actions.${a.id}`
      for (const p of a.say) {
        try {
          new RegExp(`^(?:${p})$`, 'i')
        } catch {
          problems.push(`${where}: bad pattern ${p}`)
        }
      }
      for (const l of a.at) place(l, where)
      if (a.with) npc(a.with, where)
      if (a.check && !(c.rules ? c.rules.skills.some((s) => s.id === a.check!.skill) : (STANDARD_SKILLS as readonly string[]).includes(a.check.skill))) problems.push(`${where}: unknown skill ${a.check.skill}`)
      for (const x of a.when) condition(x, where)
      for (const e of [...a.effects, ...a.fail]) effect(e, where, stages, outcomes)
    }
    for (const o of q.outcomes ?? []) {
      for (const x of o.when) condition(x, `${w}.outcomes.${o.id}`)
      for (const e of o.effects) effect(e, `${w}.outcomes.${o.id}`, stages, outcomes)
    }
    for (const [who, to] of Object.entries(q.on_death ?? {})) {
      npc(who, `${w}.on_death`)
      target(to, `${w}.on_death`)
    }
    for (const [key, to] of Object.entries(q.on_place ?? {})) {
      place(key.split(':')[0]!, `${w}.on_place`)
      target(to, `${w}.on_place`)
    }
  }
  // What the things of the world may wait for and do (M10.30): a way, something hidden, a deed on a detail.
  const skillKnown = (skill: string) => (c.rules ? c.rules.skills.some((s) => s.id === skill) : (STANDARD_SKILLS as readonly string[]).includes(skill))
  const deeds = (details: readonly { words: string[]; verbs?: Record<string, unknown> }[], at: string) => {
    for (const d of details) {
      for (const [verb, v] of Object.entries(d.verbs ?? {})) {
        if (typeof v === 'string') continue
        const deed = v as { when: Condition[]; effects: QuestEffect[]; check?: { skill: string } }
        const where = `${at}.details.${d.words[0]}.${verb}`
        for (const x of deed.when) condition(x, where)
        // No quest of its own: a stage or an ending of one is not the deed's to set.
        for (const e of deed.effects) effect(e, where, new Set(), new Set())
        if (deed.check && !skillKnown(deed.check.skill)) problems.push(`${where}: unknown skill ${deed.check.skill}`)
      }
    }
  }
  for (const loc of c.locations.values()) {
    for (const [dir, exit] of Object.entries(loc.exits)) for (const x of exit?.when ?? []) condition(x, `${loc.id}.exits.${dir}`)
    for (const h of loc.hidden) {
      for (const x of h.when ?? []) condition(x, `${loc.id}.hidden.${h.id}`)
      if (h.when && !h.words?.length) problems.push(`${loc.id}.hidden.${h.id}: only its words find it, and it has none`)
    }
    deeds(loc.details ?? [], loc.id)
  }
  for (const t of c.objectTypes.values()) deeds(t.details ?? [], `object type ${t.id}`)
  for (const p of c.plans.values()) {
    for (const [name, g] of Object.entries(p.groups)) {
      for (const a of g.areas) if (!c.areas.has(a)) problems.push(`plan ${p.id}.groups.${name}: unknown area ${a}`)
      for (const n of [...g.npcs, ...g.except]) npc(n, `plan ${p.id}.groups.${name}`)
    }
    for (const phase of p.phases) {
      for (const e of phase.effects) {
        if ('flee' in e && !p.groups[e.flee]) problems.push(`plan ${p.id}: unknown group ${e.flee}`)
        effect(e, `plan ${p.id}`, new Set(), new Set())
      }
    }
  }
  return problems
}

/** Quests the design rule would frown on: fewer than three real ways to solve them. */
export function questWarnings(c: Refs): string[] {
  const warnings: string[] = []
  for (const q of c.quests.values()) {
    if (!q.stages?.length) continue
    const solutions = (q.outcomes ?? []).filter((o) => o.solution).length
    if (solutions < 3) warnings.push(`quest ${q.id}: ${solutions} solution${solutions === 1 ? '' : 's'}, the design asks for at least three`)
    // A hidden truth (M10.30) the giver's words or a journal line before its stage already say.
    for (const [i, truth] of (q.truths ?? []).entries()) {
      const until = truth.from ? q.stages.findIndex((s) => s.id === truth.from) : q.stages.length
      const early = [q.ask ?? '', ...q.stages.slice(0, Math.max(0, until)).flatMap((s) => [s.text, s.asks ?? ''])]
      const says = (text: string) => truth.words.some((w) => {
        try {
          return new RegExp(w, 'i').test(text)
        } catch {
          return false
        }
      })
      if (early.some(says)) warnings.push(`quest ${q.id}: truth ${i + 1} ("${truth.text}") is in the ask or a journal line before its stage, so the stranger reads it before anyone may say it`)
    }
    // What the giver wants at a stage (M10.33 E): a stage with something to do and nobody to say it opens no talk.
    if (q.givers.length) for (const s of q.stages) if (s.goal && !s.asks?.trim()) warnings.push(`quest ${q.id}, stage ${s.id}: the giver never says what they want here (asks), so they will not open a talk with it; write it in their voice`)
  }
  return warnings
}
