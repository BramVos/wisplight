import { z } from 'zod'
import { within } from './reply'
import type { ChroniclerModel, ChroniclerRequest, ChroniclerUsage } from './types'

// Generating a far place up to its outline (design: lore and world change, "De
// wereld buiten de kaart", level 2): areas, a few places with a line each,
// routes, important people as roles, dangers and local lore. What the world
// book already says comes first and is never contradicted; what is generated
// is fixed in the savegame from then on.

export interface OutlineInput {
  instruction: string
  world: string
  place: { id: string; name: string; kind: string; where: string; known: string[] }
  /** Names already used in the world, which the outline may not give to anything new. */
  taken: string[]
  /** Other places nearby that the outline may mention. */
  neighbours: { name: string; text: string }[]
}

export interface Outline {
  summary: string
  areas: { name: string; text: string }[]
  places: { name: string; kind: string; text: string }[]
  routes: { to: string; text: string }[]
  people: { role: string; text: string }[]
  dangers: string[]
  lore: { name: string; text: string }[]
}

const Schema = z.object({
  summary: z.string(),
  areas: z.array(z.object({ name: z.string(), text: z.string() })).default([]),
  places: z.array(z.object({ name: z.string(), kind: z.string(), text: z.string() })).default([]),
  routes: z.array(z.object({ to: z.string(), text: z.string() })).default([]),
  people: z.array(z.object({ role: z.string(), text: z.string() })).default([]),
  dangers: z.array(z.string()).default([]),
  lore: z.array(z.object({ name: z.string(), text: z.string() })).default([]),
})

export function outlineRequest(input: OutlineInput): ChroniclerRequest {
  const text = { type: 'string' }
  const object = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties })
  const named = { type: 'array', items: object({ name: text, text }) }
  const system = [
    'You are the chronicler of a living world. Here you work a far place out to its outline, so the game can speak of it and later make it playable.',
    '',
    input.instruction.trim(),
    '',
    'WORLD',
    input.world.trim(),
    '',
    'HOW TO ANSWER',
    'JSON only. summary: two sentences. areas: two to four parts of the place. places: three to eight, each with a kind and one line. routes: how you get there and on, one line each. people: important people as roles (the lord, the harbour master), never with names of living people from elsewhere. dangers: one line each. lore: one or two local stories, a line each.',
    'What is KNOWN is true and comes first; never contradict it. New names are allowed here, but never one of the TAKEN names. Plain words, the tone of the world, late-medieval.',
  ].join('\n')
  return {
    role: 'chronicler',
    system,
    // The same for every far place of a world, but not marked: a place is worked out once, and a mark only costs a write.
    cacheBreak: 0,
    prompt: [
      `PLACE: ${input.place.name}, a ${input.place.kind}. ${input.place.where}`,
      'KNOWN:',
      ...input.place.known.map((k) => `  ${k}`),
      ...(input.neighbours.length ? ['NEARBY:', ...input.neighbours.map((n) => `  ${n.name}: ${n.text}`)] : []),
      `TAKEN: ${input.taken.join(', ')}`,
      'Work it out to its outline now.',
    ].join('\n'),
    schemaName: 'outline',
    schema: object({
      summary: text,
      areas: named,
      places: { type: 'array', items: object({ name: text, kind: text, text }) },
      routes: { type: 'array', items: object({ to: text, text }) },
      people: { type: 'array', items: object({ role: text, text }) },
      dangers: { type: 'array', items: text },
      lore: named,
    }),
    maxTokens: 1400,
    meta: { outline: input.place.id, name: input.place.name },
  }
}

/** Reads the reply: the shape, the lengths, and no name that is already taken for something else. */
export function readOutline(text: string, input: OutlineInput): { outline?: Outline; problems: string[] } {
  let json: unknown
  try {
    json = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))
  } catch {
    return { problems: ['the reply is not JSON'] }
  }
  const parsed = Schema.safeParse(json)
  if (!parsed.success) return { problems: ['the reply does not match the outline schema'] }
  const problems: string[] = []
  const taken = new Set(input.taken.map((t) => t.toLowerCase()))
  const fresh = <T extends { name: string }>(list: T[], what: string) =>
    list.filter((item) => {
      if (taken.has(item.name.trim().toLowerCase()) && item.name.trim().toLowerCase() !== input.place.name.toLowerCase()) {
        problems.push(`${what} "${item.name}": that name is already something else`)
        return false
      }
      return true
    })
  const line = (t: string) => within(t, 40) ?? ''
  const o = parsed.data
  const outline: Outline = {
    summary: within(o.summary, 60) ?? '',
    areas: fresh(o.areas, 'area').slice(0, 4).map((a) => ({ name: a.name.trim(), text: line(a.text) })),
    places: fresh(o.places, 'place').slice(0, 8).map((p) => ({ name: p.name.trim(), kind: p.kind.trim(), text: line(p.text) })),
    routes: o.routes.slice(0, 4).map((r) => ({ to: r.to.trim(), text: line(r.text) })),
    people: o.people.slice(0, 6).map((p) => ({ role: p.role.trim(), text: line(p.text) })),
    dangers: o.dangers.slice(0, 4).map(line),
    lore: fresh(o.lore, 'lore').slice(0, 2).map((l) => ({ name: l.name.trim(), text: line(l.text) })),
  }
  if (!outline.summary) problems.push('no summary')
  return { outline: outline.summary ? outline : undefined, problems }
}

export async function outline(input: OutlineInput, model: ChroniclerModel): Promise<{ outline?: Outline; problems: string[]; usage: ChroniclerUsage }> {
  const reply = await model.complete(outlineRequest(input))
  return { ...readOutline(reply.text, input), usage: reply.usage }
}
