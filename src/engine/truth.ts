import type { ChronicleEvent, ClaimOp, LoreOp } from '../chronicler'
import { cachedSystem, type LlmRequest } from './dialogue/llm'
import { callName } from './content'
import type { Fact } from './state'
import type { World } from './world'

// Truth in lore (M9.2; design: signalen en nasleep, "Na M9.1: waarheid en
// samenhang"). The chronicler may say nothing a fact does not carry. His lore
// comes with its claims as structure, each on an event of the storyline, and
// every claim is checked against that fact and against the world as it is. The
// text itself is filtered too, for what can be checked: a living person called
// dead, a house that is not theirs, a thing that is not theirs. What fails is
// not kept, and the template tells the story instead.

const DEATH = /\b(?:is dead|was killed|died|drowned|was buried|lies buried|lies in the churchyard|passed away|is no more)\b/i

/** Whether someone has this place or thing: in hand, as home, as their object or counter. */
function owns(world: World, who: string, what: string): boolean {
  const npc = world.state.npcs[who]
  if (npc?.inventory[what]) return true
  const card = world.content.npcs.get(who)
  if (!card) return false
  if (card.home === what || card.work === what) return true
  const place = world.content.locations.get(what)
  if (place && (place.services.some((s) => s.provider === who) || place.objects.some((o) => (o.owner ?? o.provider) === who))) return true
  return [...world.content.locations.values()].some((l) => l.objects.some((o) => o.id === what && (o.owner ?? o.provider) === who))
}

/** Why a claim does not hold, or undefined when it does. */
export function claimProblem(world: World, claim: ClaimOp, facts: Fact[]): string | undefined {
  const fact = facts.find((f) => f.id === claim.event)
  if (!fact) return `claim on ${claim.event}, which is no event of the storyline`
  const who = claim.subject
  const person = world.content.npcs.has(who)
  const name = person ? callName(world.npc(who)) : who
  const heard = world.state.news?.heard ?? {}
  switch (claim.key) {
    case 'present':
      return fact.about.includes(who) || fact.place === who || heard[who]?.[fact.id]?.from === 'witness' ? undefined : `${name} was not there`
    case 'dead': {
      const dead = Boolean(world.state.npcs[who]?.dead)
      const yes = /^(yes|true|dead)$/i.test(claim.value)
      if (!person) return `${who} is not a person`
      if (yes && !dead) return `${name} is alive`
      if (!yes && dead) return `${name} is dead`
      return yes && !(fact.kind === 'death' || fact.about.includes(who)) ? `the event does not tell of the death of ${name}` : undefined
    }
    case 'lives_at': {
      if (!person) return `${who} is not a person`
      const home = world.npc(who).home
      const area = world.content.locations.get(home)?.area
      return claim.value === home || claim.value === area ? undefined : `${name} does not live at ${claim.value}`
    }
    case 'owns':
      return person && owns(world, who, claim.value) ? undefined : `${name} does not have ${claim.value}`
    default: {
      // Any other key is the claim of the event itself.
      const c = fact.claim
      return c && c.subject === who && c.key === claim.key && (c.value === claim.value || c.far === claim.value) ? undefined : `no event says ${who} ${claim.key} ${claim.value}`
    }
  }
}

/** What can be checked in the words: a living person called dead, a home or a place called theirs that is not. */
export function textProblem(world: World, texts: string[]): string | undefined {
  const living = [...world.content.npcs.values()].filter((n) => !world.state.npcs[n.id]?.dead && !n.quirks.includes('spirit'))
  const places = [...world.content.locations.values()]
  const areas = [...world.content.areas.values()]
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  for (const text of texts.filter(Boolean)) {
    for (const sentence of text.split(/(?<=[.!?])\s+/)) {
      for (const n of living) {
        const names = [n.name, callName(n)].filter((x) => x.length > 2 && /^[A-Z]/.test(x))
        const named = names.find((x) => new RegExp(`\\b${esc(x)}\\b`).test(sentence))
        if (!named) continue
        const after = sentence.slice(sentence.search(new RegExp(`\\b${esc(named)}\\b`)))
        // "Gerrit is dead", "Gerrit drowned": within the clause that names him.
        if (DEATH.test(after.split(/[,;]| and | but /)[0]!)) return `${named} is alive`
        // "Gerrit, who lives at the mill": a home that is not his.
        const lives = /\blives? (?:in|at|by) (?:the )?([A-Z][\w' -]+?)(?=[,.;]|$| and | but )/.exec(after)
        if (lives) {
          const said = lives[1]!.trim().toLowerCase()
          const home = world.location(n.home)
          const area = world.content.areas.get(home.area)
          const known = [...places.map((p) => p.name), ...areas.map((a) => a.name)].some((x) => x.toLowerCase().replace(/^the /, '') === said.replace(/^the /, ''))
          if (known && ![home.name, area?.name ?? ''].some((x) => x.toLowerCase().replace(/^the /, '') === said.replace(/^the /, ''))) return `${named} does not live at ${lives[1]}`
        }
        // "Gerrit's mill": a place or thing that has an owner, and it is not him.
        const his = new RegExp(`\\b${esc(named)}'s ([a-z][a-z -]{2,30})`).exec(sentence)
        if (his) {
          const thing = his[1]!.trim().split(' ').slice(0, 3).join(' ')
          for (const p of places) {
            for (const o of p.objects) {
              const type = world.content.objectTypes.get(o.type)
              const label = [o.name, type?.name, ...(type?.aliases ?? [])].filter(Boolean).map((x) => x!.toLowerCase())
              const holder = o.owner ?? o.provider
              const which = label.find((x) => thing.startsWith(x))
              if (holder && holder !== n.id && which) return `the ${which} is not ${named}'s`
            }
          }
        }
      }
    }
  }
  return undefined
}

/** Why a piece of lore may not be kept, or undefined: its claims must rest on the storyline's facts, and hold. */
export function loreProblem(world: World, op: Pick<LoreOp, 'claims' | 'summary' | 'details' | 'story' | 'far'>, facts: Fact[]): string | undefined {
  if (!op.claims.length) return 'no claims: what it says rests on no event'
  for (const claim of op.claims) {
    const wrong = claimProblem(world, claim, facts)
    if (wrong) return wrong
  }
  return textProblem(world, [op.summary, op.details, op.story, op.far])
}

/**
 * The second look for big lore (M9.2): at belang 4 or more a small model reads
 * the facts and the lore and names what the lore says that no fact does.
 */
export function judgeRequest(op: Pick<LoreOp, 'name' | 'summary' | 'details' | 'story' | 'far'>, events: ChronicleEvent[]): LlmRequest {
  return {
    role: 'brain',
    ...cachedSystem('You check a story against the facts it was written from. List every thing the story says happened that the facts do not say: a person who was there, a death, a place, a deed, a cause. Colour and feeling are fine; new events, people or outcomes are not. JSON only.', '', '', 'none'),
    prompt: ['FACTS:', ...events.map((e) => `- ${e.text}`), 'STORY:', op.name, op.summary, op.details, op.story, op.far].filter(Boolean).join('\n'),
    schemaName: 'lore_check',
    schema: { type: 'object', additionalProperties: false, required: ['invented'], properties: { invented: { type: 'array', items: { type: 'string' } } } },
    maxTokens: 200,
    meta: { story: [op.summary, op.details, op.story, op.far].join(' '), facts: events.map((e) => e.text) },
  }
}

/** What the second look found, or undefined when its answer cannot be read (then the lore is not kept either). */
export function judged(text: string): string[] | undefined {
  try {
    const v = JSON.parse(text) as { invented?: unknown }
    return Array.isArray(v.invented) ? v.invented.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : undefined
  } catch {
    return undefined
  }
}
