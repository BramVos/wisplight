import type { Content } from '../content'
import { STANDARD_SKILLS } from '../dialogue/checks'
import { isGameVerb } from '../parser'
import type { Condition, QuestEffect } from './schema'
import type { PlanEffect } from './plans'

// Checks written quests and plans against the rest of the content (FO,
// chapter 15: the builder refuses what the systems cannot carry out). Every
// person, place, thing, stage and ending a quest names must exist, and every
// pattern the player's words are matched against must be a valid expression.

type Refs = Omit<Content, 'world'>


/** "She gives you the test telemetry", "hands you his edited copies": a deed text that gives the stranger a thing; not a look or a smile. */
export const GIVES_YOU = /\b(?:gives|hands|passes|slides) you (?:the |a |an |his |her |their |its |some |a copy of )?(?!look\b|smile\b|nod\b|glance\b|shrug\b|wink\b|grin\b|hard look\b)[a-z'-]+(?: [a-z'-]+)?/i
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
      // Where people may point (M10.35 C): someone, to now, nothing, a person or a place there is.
      for (const [who, to] of Object.entries(s.points ?? {})) {
        npc(who, `${w}.${s.id}.points`)
        if (!['now', 'nothing'].includes(to) && !c.npcs.has(to) && !c.locations.has(to)) problems.push(`${w}.${s.id}.points: ${who} points to ${to}, which is not now, nothing, a person or a place`)
      }
      // A lie is shown up by a deed of this quest or by someone who knows better (M10.35 G).
      for (const [who, lie] of Object.entries(s.lies ?? {})) {
        npc(who, `${w}.${s.id}.lies`)
        for (const by of lie.shown_by) if (!c.npcs.has(by) && !(q.actions ?? []).some((a) => a.id === by)) problems.push(`${w}.${s.id}.lies: ${who}'s lie is shown up by ${by}, which is no deed of this quest and nobody`)
      }
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
/** The first words a say pattern can begin with: each choice of a leading group, or its first word. */
function firstWords(pattern: string): string[] {
  const p = pattern.replace(/^\^/, '')
  if (p.startsWith('(?:')) {
    let depth = 0
    for (let i = 0; i < p.length; i++) {
      if (p[i] === '(') depth++
      else if (p[i] === ')' && --depth === 0) return p.slice(3, i).split('|').flatMap((alt) => /^[a-z']+/i.exec(alt.trim())?.[0]?.toLowerCase() ?? [])
    }
  }
  return [/^[a-z']+/i.exec(p)?.[0]?.toLowerCase() ?? ''].filter(Boolean)
}

/** The verbs of the things at these places (M10.33 AA): their details, what is hidden there, objects, things carried. */
function placeVerbs(c: Refs, at: string[]): Set<string> {
  const verbs = new Set<string>()
  const places = at.flatMap((id) => (c.locations.has(id) ? [c.locations.get(id)!] : [...c.locations.values()].filter((l) => l.area === id)))
  const detailVerbs = (details: { verbs?: Record<string, unknown> }[] | undefined) => {
    for (const d of details ?? []) for (const v of Object.keys(d.verbs ?? {})) verbs.add(v.toLowerCase())
  }
  for (const l of places) {
    detailVerbs(l.details)
    for (const h of l.hidden ?? []) for (const v of h.verbs ?? []) verbs.add(v.toLowerCase())
    for (const o of l.objects ?? []) detailVerbs(c.objectTypes.get(o.type)?.details)
  }
  for (const item of c.items.values()) for (const v of Object.keys(item.verbs ?? {})) verbs.add(v.toLowerCase())
  for (const words of Object.values(c.voice?.verb_words ?? {})) for (const w of words) verbs.add(w.toLowerCase())
  return verbs
}

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
    // A deed on the world is the player's own verb on a thing of its place (M10.33 AA: "trace the antenna fault" was a
    // sentence the voice chose for the player), never a sentence only; a deed with someone is said to them.
    for (const a of q.actions ?? []) {
      if (a.with) continue
      const verbs = placeVerbs(c, a.at)
      if (!a.say.some((p) => firstWords(p).some((w) => isGameVerb(w) || verbs.has(w)))) warnings.push(`quest ${q.id}, action ${a.id}: a deed on the world is only a sentence ("${a.intent ?? a.say[0]}"); give it the verb of a thing at its place (a detail's verbs), or the person it is done with (with)`)
    }
    // A deed that says it gives the stranger something gives it (M10.34 C: "She gives you the test telemetry" was only a
    // line, and INVENTORY showed nothing): a thing, evidence, or what the stranger learns.
    for (const a of q.actions ?? []) {
      const gives = GIVES_YOU.exec(a.text)
      if (gives && !a.effects.some((e) => 'give' in e || 'seize' in e || 'evidence' in e || 'learn' in e)) warnings.push(`quest ${q.id}, action ${a.id}: its text says "${gives[0]}", and nothing is given: add the thing (give) or evidence (evidence: id, name, text)`)
    }
    // A lie is a game, not a trap (M10.35 G): what shows it up is a deed the stranger can come to, or someone who knows
    // better and says so at this stage; and it says no truth of the story before its time (its words are its own).
    for (const s of q.stages ?? []) {
      for (const [who, lie] of Object.entries(s.lies ?? {})) {
        const reachable = lie.shown_by.some((by) => (q.actions ?? []).some((a) => a.id === by) || Boolean(s.knows?.[by]) || Boolean(q.stages?.some((x) => x.knows?.[by])))
        if (!reachable) warnings.push(`quest ${q.id}, stage ${s.id}: ${who}'s lie has no way to be shown up (a deed of this quest, or someone who knows better at a stage): it is a trap, not a game`)
      }
    }
    // Somebody points the way (M10.35 C): a stage people know of where nobody may point anywhere leaves the stranger with
    // "I don't know" from all.
    for (const s of q.stages ?? []) {
      const pointing = Object.values(s.points ?? {}).filter((to) => to !== 'nothing')
      if (Object.keys(s.knows ?? {}).length && !pointing.length) warnings.push(`quest ${q.id}, stage ${s.id}: nobody may point the stranger anywhere (points), so whoever is asked what to do says they do not know`)
    }
    // An ending people can tell (M10.34 G): one that speaks to the stranger ("you") is told by witnesses in its news.
    for (const o of q.outcomes ?? []) {
      if (/\byou(?:r|rs|rself)?\b/i.test(o.text) && !o.news && !o.effects.some((e) => 'fact' in e)) warnings.push(`quest ${q.id}, outcome ${o.id}: its text speaks to the stranger, and nobody can tell it so: give it news (precise, and village and far if they differ), as a witness would tell it`)
    }
    // What the giver wants at a stage (M10.33 E): a stage with something to do and nobody to say it opens no talk.
    if (q.givers.length) for (const s of q.stages) if (s.goal && !s.asks?.trim()) warnings.push(`quest ${q.id}, stage ${s.id}: the giver never says what they want here (asks), so they will not open a talk with it; write it in their voice`)
  }
  return warnings
}
