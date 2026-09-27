import type { Card, CardKind, ChronicleEvent, ChronicleInput, ChroniclerRequest, Id, Limits } from './types'

// The request in a fixed notation (design: lore and world change, "Hoe de
// kroniekschrijver de wereld ziet"). The fixed part (instruction, world,
// catalogue, how to answer) comes first and never changes between runs, so
// the providers cache it. People and places get short keys: p1, l1, ...

const PREFIX: Record<CardKind | 'line', string> = { person: 'p', place: 'l', area: 'a', lore: 't', request: 'q', item: 'i', realm: 'r', line: 's' }

export class Keys {
  private readonly toKey = new Map<Id, string>()
  private readonly toId = new Map<string, Id>()
  private readonly kinds = new Map<string, CardKind | 'line'>()
  private readonly counts = new Map<string, number>()

  add(id: Id, kind: CardKind | 'line'): string {
    // One key per id: a storyline looked up comes back as a card, with the same key.
    const known = this.toKey.get(`${kind}:${id}`) ?? this.any(id)
    if (known) return known
    const prefix = PREFIX[kind]
    const n = (this.counts.get(prefix) ?? 0) + 1
    this.counts.set(prefix, n)
    const key = `${prefix}${n}`
    this.toKey.set(`${kind}:${id}`, key)
    this.toId.set(key, id)
    this.kinds.set(key, kind)
    return key
  }

  key(id: Id, kind: CardKind | 'line'): string | undefined {
    return this.toKey.get(`${kind}:${id}`)
  }

  /** The key of an id, whatever kind it was given as. */
  any(id: Id): string | undefined {
    for (const kind of Object.keys(PREFIX) as (CardKind | 'line')[]) {
      const key = this.toKey.get(`${kind}:${id}`)
      if (key) return key
    }
    return undefined
  }

  id(key: string): Id | undefined {
    return this.toId.get(key.trim().toLowerCase())
  }

  kindOf(key: string): CardKind | 'line' | undefined {
    return this.kinds.get(key.trim().toLowerCase())
  }

  all(): { key: string; id: Id; kind: CardKind | 'line' }[] {
    return [...this.kinds.entries()].map(([key, kind]) => ({ key, id: this.toId.get(key)!, kind }))
  }

  of(kind: CardKind | 'line'): string[] {
    return [...this.kinds.entries()].filter(([, k]) => k === kind).map(([key]) => key)
  }
}

/** Keys for everything in the input, in a fixed order so the same input gives the same keys. */
export function assignKeys(input: ChronicleInput): Keys {
  const keys = new Keys()
  for (const line of input.lines) keys.add(line.id, 'line')
  for (const line of input.older ?? []) keys.add(line.id, 'line')
  for (const card of [...input.cards, ...input.lore, ...input.requests, ...input.areas, ...(input.realms ?? [])]) keys.add(card.id, card.kind)
  return keys
}

export function systemPrompt(input: ChronicleInput, limits: Limits): string {
  return [
    'You are the chronicler of a living world. The world runs by its own rules; you do not decide what happened or who knows it.',
    'You turn what happened into lore, keep a short note per storyline, work out requests for the player from open threads, and write the news of the day.',
    '',
    input.instruction.trim(),
    '',
    'WORLD',
    input.world.trim(),
    ...(input.catalogue ? ['', 'CATALOGUE', input.catalogue.trim()] : []),
    '',
    'HOW TO ANSWER',
    'The overview uses short keys: p person, l place, a area, t lore, q request, i item, s storyline. Answer with JSON that matches the schema, in keys.',
    `- lookup: up to ${limits.lookups} keys you need to know more about before you write. Use it only when you truly need it; then leave everything else empty and you get the cards.`,
    `- lore: for each storyline with an event of belang 3 or more, one lore topic. name; summary (what anyone may have heard, one sentence); details (the core as the village tells it, up to ${limits.textWords} words); story (as a witness tells it, up to ${limits.storyWords} words); far (one line as it sounds far away, which may be wrong the way retold news goes wrong); teller (the witness whose story it is, or empty); links (keys of lore or people it connects to).`,
    `- lines: update every storyline you were given. summary: at most ${limits.lineSummary} short lines. roles, hooks (open threads), next (what may follow), close (true when it is over).`,
    `- quests: at most ${limits.quests}. Turn an open thread into a request for the player, using one of the TEMPLATES and a giver from that storyline, or reword an open request (give its key). name; ask (what the giver says, in their own voice, one or two sentences); stakes (why it matters, one sentence).`,
    `- thoughts: at most ${limits.thoughts}. Something that stays on one person's mind, one sentence addressed to them: "You still owe Harmen three guilders."`,
    '- news: one line per area where something happened, as people there would say it.',
    '- tensions: at most one, and only when what happened would really change how two REALMS stand: between (two realm keys), delta (-5 to 5, positive is worse), why (a short clause).',
    '- plans: only for storylines marked PLAN, and only when the event has consequences the world should feel: a name and up to 3 phases (after: hours from now, 0 to 240), each with effects: {place, state} for places of the storyline (flooded, damaged, destroyed, abandoned, occupied, normal), {news, area}, {market (an item key), factor 0.5 to 1.5}, {flee (an area key), to (a place key), days 1 to 14}. At most 10 effects in all. Leave plans empty when nothing lasting follows.',
    'Rules: only facts from the overview; never invent what happened, who was there or when. Use only names from the overview. A rumour marked untrue stays a rumour. Things marked PRIVATE may go into thoughts, never into lore or news. Plain words, the tone of the world.',
  ].join('\n')
}

function eventLine(event: ChronicleEvent, keys: Keys): string {
  const key = (id: Id) => keys.any(id) ?? id
  const seen = event.witnesses.length ? `, seen by ${event.witnesses.map(key).join(' ')}` : ''
  return `${event.when} at ${key(event.place)}, ${event.who.map(key).join(' ') || 'nobody named'}${seen}, belang ${event.belang}${event.untrue ? ', UNTRUE rumour' : ''}: ${event.text}`
}

function cardLine(card: Card, keys: Keys): string {
  return `${keys.key(card.id, card.kind) ?? keys.any(card.id)} ${card.name}: ${card.text}`
}

export function userPrompt(input: ChronicleInput, keys: Keys, lookedUp: Card[], lookupsLeft: number): string {
  const byKind = (kind: Card['kind']) => input.cards.filter((c) => c.kind === kind).map((c) => cardLine(c, keys))
  const lines: string[] = [`NOW: ${input.now}`]
  const section = (title: string, rows: string[]) => {
    if (rows.length) lines.push(title, ...rows.map((r) => `  ${r}`))
  }
  section('CAST', byKind('person'))
  section('PLACES', byKind('place'))
  section('THINGS', byKind('item'))
  section('AREAS', input.areas.map((c) => cardLine(c, keys)))
  section('REALMS', (input.realms ?? []).map((c) => cardLine(c, keys)))
  section('LORE THAT MAY RELATE', input.lore.map((c) => cardLine(c, keys)))
  section('OPEN REQUESTS', input.requests.map((c) => cardLine(c, keys)))
  section(
    'TEMPLATES',
    input.templates.map((t) => `${t.kind}${t.needs.length ? ` (needs ${t.needs.join(' and ')})` : ''}: ${t.text}`),
  )
  if (input.older?.length) section('OLDER STORYLINES, to look up', input.older.map((o) => `${keys.key(o.id, 'line')} ${o.title}`))
  lines.push('STORYLINES')
  for (const line of input.lines) {
    lines.push(`  ${keys.key(line.id, 'line')} "${line.title}"${line.pattern ? ` [${line.pattern}]` : ''}${input.mayPlan?.includes(line.id) ? ' PLAN' : ''}`)
    if (line.roles.length) lines.push(`    roles: ${line.roles.map((r) => `${r.role}=${keys.any(r.who) ?? r.who}`).join(', ')}`)
    if (line.summary.length) lines.push(`    so far: ${line.summary.join(' / ')}`)
    if (line.hooks.length) lines.push(`    open threads: ${line.hooks.join(' / ')}`)
    if (line.next) lines.push(`    you expected: ${line.next}`)
    if (line.events.length) lines.push('    new:', ...line.events.map((e) => `      ${eventLine(e, keys)}`))
    if (line.earlier.length) lines.push('    earlier:', ...line.earlier.map((e) => `      ${eventLine(e, keys)}`))
  }
  section('LOOKED UP', lookedUp.map((c) => cardLine(c, keys)))
  lines.push(lookupsLeft > 0 ? `Write the chronicle now, or look up at most ${lookupsLeft} keys first.` : 'Write the chronicle now. No more lookups.')
  return lines.join('\n')
}

const text = { type: 'string' }
const keysOf = (list: string[]) => ({ type: 'string', enum: list.length ? list : [''] })

/** The reply schema, built per call with exactly the keys of this overview. */
export function replySchema(input: ChronicleInput, keys: Keys, lookupsLeft: number): Record<string, unknown> {
  const people = keys.of('person')
  const lines = input.lines.map((l) => keys.key(l.id, 'line')!)
  const linkable = [...keys.of('lore'), ...people, ...keys.of('place')]
  const lookupable = [...people, ...keys.of('place'), ...keys.of('lore'), ...keys.of('line'), ...keys.of('item')]
  const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
  return object({
    lookup: { type: 'array', items: keysOf(lookupsLeft > 0 ? lookupable : []) },
    lore: {
      type: 'array',
      items: object({ line: keysOf(lines), name: text, summary: text, details: text, story: text, far: text, teller: keysOf(['', ...people]), links: { type: 'array', items: keysOf(linkable) } }),
    },
    lines: {
      type: 'array',
      items: object({
        line: keysOf(lines),
        summary: { type: 'array', items: text },
        roles: { type: 'array', items: object({ role: text, who: keysOf(people) }) },
        hooks: { type: 'array', items: text },
        next: text,
        close: { type: 'boolean' },
      }),
    },
    quests: {
      type: 'array',
      items: object({
        request: keysOf(['', ...keys.of('request')]),
        line: keysOf(lines),
        template: keysOf(input.templates.map((t) => t.kind)),
        giver: keysOf(people),
        item: keysOf(['', ...keys.of('item')]),
        target: keysOf(['', ...people]),
        name: text,
        ask: text,
        stakes: text,
      }),
    },
    thoughts: { type: 'array', items: object({ who: keysOf(people), text }) },
    news: { type: 'array', items: object({ area: keysOf(keys.of('area')), text }) },
    ...(input.realms?.length ? { tensions: { type: 'array', items: object({ between: { type: 'array', items: keysOf(keys.of('realm')) }, delta: { type: 'integer' }, why: text }) } } : {}),
    ...(input.mayPlan?.length
      ? {
          plans: {
            type: 'array',
            items: object({
              line: keysOf(input.mayPlan.map((id) => keys.key(id, 'line')!).filter(Boolean)),
              name: text,
              phases: {
                type: 'array',
                items: object({
                  after: { type: 'integer' },
                  effects: {
                    type: 'array',
                    items: {
                      anyOf: [
                        object({ place: keysOf(keys.of('place')), state: { type: 'string', enum: ['flooded', 'damaged', 'destroyed', 'abandoned', 'occupied', 'normal'] } }),
                        object({ news: text, area: keysOf(keys.of('area')) }),
                        object({ market: keysOf(keys.of('item')), factor: { type: 'number' } }),
                        object({ flee: keysOf(keys.of('area')), to: keysOf(keys.of('place')), days: { type: 'integer' } }),
                      ],
                    },
                  },
                }),
              },
            }),
          },
        }
      : {}),
  })
}

export function buildRequest(input: ChronicleInput, keys: Keys, limits: Limits, lookedUp: Card[], lookupsLeft: number): ChroniclerRequest {
  return {
    role: 'chronicler',
    system: systemPrompt(input, limits),
    prompt: userPrompt(input, keys, lookedUp, lookupsLeft),
    schemaName: 'chronicle',
    schema: replySchema(input, keys, lookupsLeft),
    maxTokens: limits.maxTokens,
    meta: mockMeta(input, keys, lookupsLeft),
  }
}

/** For a stand-in model in tests: what each key stands for, and the storylines in keys. */
export type ChronicleMeta = {
  cards: { key: string; id: Id; kind: CardKind | 'line'; name: string; text: string }[]
  lines: { key: string; title: string; belang: number; who: string[]; witnesses: string[]; place: string; text: string }[]
  lookupsLeft: number
}

function mockMeta(input: ChronicleInput, keys: Keys, lookupsLeft: number): ChronicleMeta {
  const cards = [...input.cards, ...input.lore, ...input.requests, ...input.areas]
  const k = (id: Id) => keys.any(id) ?? id
  return {
    cards: keys.all().map((entry) => {
      const card = cards.find((c) => c.id === entry.id && c.kind === entry.kind)
      return { ...entry, name: card?.name ?? entry.id, text: card?.text ?? '' }
    }),
    lines: input.lines.map((l) => {
      const big = [...l.events].sort((a, b) => b.belang - a.belang)[0]
      return { key: keys.key(l.id, 'line')!, title: l.title, belang: big?.belang ?? 0, who: (big?.who ?? []).map(k), witnesses: (big?.witnesses ?? []).map(k), place: big ? k(big.place) : '', text: big?.text ?? '' }
    }),
    lookupsLeft,
  }
}
