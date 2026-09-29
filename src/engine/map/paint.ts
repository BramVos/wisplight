import { stringify } from 'yaml'
import { loadContent, type Content, type ContentFile, type Region } from '../content'
import type { LlmRequest } from '../dialogue/llm'
import { worldPrefix } from '../edit'
import type { Draft } from '../editor'
import { DEFAULT_PALETTE, LANDS, type MapPalette } from './palette'
import { placesInDrawing } from './regiondraft'

// The map painted as a table (M10.26, Bram: can the map be made as well with a
// cheaper model?). The layout is code (regiondraft.ts, free: the places from
// their exits and minutes); the model only fills a table: per terrain its
// character, name, colours, how it walks and the line the stranger reads, the
// drawing as rows of characters, and a line per path and per edge. Code writes
// the region and the palette from it, and the checks of any step judge it. The
// whole palette in world.yaml, signs and styles, stays the Palette step's.

export interface PaintTable {
  say: string
  lands: { key: string; name: string; char: string; like: string; dark: string; paper: string; text: string }[]
  drawing: string[]
  paths: { name: string; text: string }[]
  beyond: { side: string; text: string }[]
}

const ENGINE_LANDS = LANDS as readonly string[]
const SIDES = ['north', 'east', 'south', 'west']

export const MAP_PAINT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['say', 'lands', 'drawing', 'paths', 'beyond'],
  properties: {
    say: { type: 'string' },
    lands: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'name', 'char', 'like', 'dark', 'paper', 'text'],
        properties: {
          key: { type: 'string' },
          name: { type: 'string' },
          char: { type: 'string' },
          like: { type: 'string', enum: ['woods', 'fields', 'fen', 'water', 'heath'] },
          dark: { type: 'string' },
          paper: { type: 'string' },
          text: { type: 'string' },
        },
      },
    },
    drawing: { type: 'array', items: { type: 'string' } },
    paths: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'text'], properties: { name: { type: 'string' }, text: { type: 'string' } } } },
    beyond: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['side', 'text'], properties: { side: { type: 'string', enum: SIDES }, text: { type: 'string' } } } },
  },
}

/** The same for every world, and cached: what the table is and how it is judged. */
const INSTRUCTION = [
  'YOU PAINT THE REGION MAP OF A WORLD WITH ITS DESIGNER, AS A TABLE.',
  'The places are laid out already, from their exits and minutes. You decide what lies between them, from the designer\'s words: where the sea is, the shallows, the scrub, the rock, the fields. Keep to the words; add no land they do not name, and give every land they name a place in the drawing.',
  'Answer in JSON with:',
  '- say: one or two sentences to the designer: what you painted and where.',
  '- lands: every terrain of the drawing, one row each: key (lower case, a-z, 0-9, _), name (the bare name the legend shows, lower case: "black basalt", "tidal shallows"; the game says "On the black basalt" itself), char (one character that stands for it in the drawing, never a letter used twice, never a space, never one of the way characters below), like (how it walks: woods, fields, fen, water or heath), dark and paper (its colour as #rrggbb on the dark map and on the pale paper map; where the designer gave colours, those), text (the line the stranger reads walking there: one sentence, second person, present tense, a sense other than sight where it fits).',
  '- drawing: the rows of the drawing from north to south, exactly as many rows as asked and exactly as many characters in each, one character a zone, only the chars of your lands and the way characters. The top row is the north, the first character of a row the west. Never write a name or a mark in it: the places stand at their row and column already, and the drawing says only the land under them.',
  '- paths: for every path named below, its name as given and the line the stranger reads walking it.',
  '- beyond: for each side (north, east, south, west) the line the stranger reads on reaching that edge: what lies that way and how far, from the designer\'s words; say plainly when nobody knows.',
  'CHECK BEFORE YOU ANSWER: the drawing has the asked rows and width; each place stands on a land that fits what it is (a port by the water, a ridge on high ground), at the row and column given; every char in the drawing is a land of your table; every colour is #rrggbb.',
].join('\n')

/** The region a map step paints: the one the layout made, or the world's own when it has one already. */
function regionOf(content: Content): Region | undefined {
  return [...content.regions.values()][0]
}

/** The request that paints the region of these files (the layout's, laid out already), from the designer's words. */
export function paintRequest(laid: ContentFile[], said: string): LlmRequest | undefined {
  let content: Content
  try {
    content = loadContent(laid)
  } catch {
    return undefined
  }
  const region = regionOf(content)
  if (!region) return undefined
  const rows = region.zones.split('\n').filter((line) => line.length > 0)
  const width = Math.max(...rows.map((r) => r.length))
  const [across, down] = region.zone ?? [0.5, 1]
  const ways = Object.entries(region.legend).filter(([, v]) => v === 'road' || v === 'path' || v === 'canal')
  const areas = [...content.areas.values()].filter((a) => a.pos && a.id !== region.area)
  const palette = content.world.map?.palette ?? DEFAULT_PALETTE
  const own = Object.entries(region.lands)
  const world = [
    `THE WORLD: ${content.world.name}.`,
    ...(content.world.frame ? [`ITS FRAME: ${content.world.frame.trim().slice(0, 1500)}`] : []),
    '',
    `THE DRAWING: ${rows.length} rows of ${width} characters; one character is ${across * 1000} m east to west and ${down * 1000} m north to south; the map is ${region.size[0]} by ${region.size[1]} km.`,
    placesInDrawing(content),
    `THE PLACES: ${areas.map((a) => `${a.name} (${a.kind}): ${a.summary}`).join(' | ')}`,
    `THE PATHS: ${region.paths.length ? region.paths.map((p) => `${p.name} (${p.kind})`).join('; ') : 'none'}.`,
    ...(ways.length ? [`WAY CHARACTERS, to keep where you draw a way and never to use for a land: ${ways.map(([c, v]) => `${c} ${v}`).join(', ')}.`] : []),
    `THE LANDS OF THE ENGINE, as keys when they fit as they are: ${ENGINE_LANDS.map((l) => `${l}${palette.names[l] ? ` (here: ${palette.names[l]})` : ''}`).join(', ')}.`,
    ...(own.length ? [`THE LANDS IT HAS NOW: ${own.map(([k, l]) => `${k} (${palette.names[k] ?? k}, walks like ${l.like})`).join(', ')}.`] : []),
    '',
    `THE DESIGNER SAYS: ${said.trim() || '(nothing; paint the land from the places and the frame)'}`,
  ].join('\n')
  const system = `${INSTRUCTION}\n\n${world}`
  return {
    role: 'chronicler',
    system,
    // The instruction and the world stay the same for a second try, which then reads them from the cache.
    cacheBreak: system.length,
    cacheHour: true,
    prompt: `Paint the map: the table, with ${rows.length} rows of ${width} characters.`,
    schemaName: 'map_paint',
    schema: MAP_PAINT_SCHEMA,
    // The drawing is most of it: a token or so a character, and the lines.
    maxTokens: Math.min(12000, 2500 + rows.length * width),
    effort: 'low',
    // A table, measured on The Quiet Reach and Skerrow (docs/worldbuild/cost-measure.md): the player's lighter
    // model loads it twice in a row on both, at a tenth of the Palette step on Opus; Haiku 4.5 did not.
    tier: 'light',
    meta: { prefix: worldPrefix(laid), step: 'map', rows: rows.length, cols: width, paths: region.paths.map((p) => p.name), ways: Object.fromEntries(ways) },
  }
}

/** A second try after a wrong map (M10.26): the cached instruction and world again, the table as it stood, and what stood wrong. */
export function paintFixRequest(request: LlmRequest, table: string, wrong: string[]): LlmRequest {
  return {
    ...request,
    prompt: [request.prompt, '', 'YOUR TABLE AS IT STANDS:', table, '', 'WHAT STOOD WRONG:', ...wrong.map((w) => `- ${w}`), '', 'Answer with the whole table again, with only what stood wrong put right.'].join('\n'),
    meta: { ...request.meta, fix: wrong },
  }
}

/** Three tints of a colour, a shade darker and lighter, for the seed to pick from. */
function tints(colour: string): string[] {
  const shade = (by: number) =>
    `#${[1, 3, 5]
      .map((i) => Math.max(0, Math.min(255, parseInt(colour.slice(i, i + 2), 16) + by)))
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')}`
  return [colour.toLowerCase(), shade(-8), shade(8)]
}

/**
 * The table read into a proposal: the region's legend, lands, drawing, paths
 * and edges (merge: only those fields), and the palette's names and tints for
 * its lands in world.yaml, the rest of the palette as it was. What does not fit
 * the drawing or the table says why, for the fix round.
 */
export function readPaint(laid: ContentFile[], text: string): Draft {
  const none = (problem: string): Draft => ({ say: '', questions: [], changes: [], problems: [problem] })
  let content: Content
  try {
    content = loadContent(laid)
  } catch {
    return none('The world does not load, so there is no map to paint.')
  }
  const region = regionOf(content)
  if (!region) return none('There is no region map to paint; the layout makes one from the places.')
  let table: PaintTable
  try {
    table = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')) as PaintTable
  } catch {
    return none('The chronicler did not answer in the agreed form.')
  }
  const problems: string[] = []
  const rows = region.zones.split('\n').filter((line) => line.length > 0)
  const width = Math.max(...rows.map((r) => r.length))
  const ways = Object.fromEntries(Object.entries(region.legend).filter(([, v]) => v === 'road' || v === 'path' || v === 'canal'))
  // A land drawn with a way's character is that way, which stays the engine's: it is left out, and said.
  const asWays = (Array.isArray(table.lands) ? table.lands : []).filter((l) => typeof l.char === 'string' && ways[l.char])
  const lands = (Array.isArray(table.lands) ? table.lands : []).filter((l) => !asWays.includes(l))
  const chars = new Map<string, string>()
  for (const land of lands) {
    const where = `land ${land.key}`
    if (!/^[a-z0-9_]+$/.test(land.key ?? '')) problems.push(`${where}: a key is lower case, a-z, 0-9 and _`)
    if (typeof land.char !== 'string' || [...land.char].length !== 1 || /\s/.test(land.char)) problems.push(`${where}: char is one character, not a space`)
    else if (chars.has(land.char)) problems.push(`${where}: ${land.char} is the char of ${chars.get(land.char)} already`)
    else chars.set(land.char, land.key)
    if (!['woods', 'fields', 'fen', 'water', 'heath'].includes(land.like)) problems.push(`${where}: like is woods, fields, fen, water or heath`)
    for (const [field, colour] of [['dark', land.dark], ['paper', land.paper]] as const) if (!/^#[0-9a-fA-F]{6}$/.test(colour ?? '')) problems.push(`${where}: ${field} is a colour as #rrggbb`)
  }
  // A drawing a row or a character or two off is made to size, as the map would read it (a short row takes the land
  // beside it, a missing row the one above); more than that is a drawing of another size, for the fix round.
  const given = (Array.isArray(table.drawing) ? table.drawing : []).map((row) => String(row))
  const off = given.map((row) => row.length - width).filter((d) => d !== 0)
  if (!given.length || Math.abs(given.length - rows.length) > 2) problems.push(`the drawing has ${given.length} rows; it needs ${rows.length}`)
  given.forEach((row, i) => {
    if (Math.abs(row.length - width) > 2) problems.push(`row ${i + 1} of the drawing has ${row.length} characters; it needs ${width}`)
  })
  const drawing = [...Array(rows.length).keys()].map((i) => {
    const row = given[Math.min(i, given.length - 1)] ?? ''
    return row.length >= width ? row.slice(0, width) : row + (row.at(-1) ?? ' ').repeat(width - row.length)
  })
  const sized = given.length !== rows.length || off.length > 0
  if (!chars.size) problems.push('the table has no lands')
  if (problems.length) return { say: typeof table.say === 'string' ? table.say : '', questions: [], changes: [], problems: problems.slice(0, 12) }
  // A name or a mark written in the drawing takes the land beside it, as the map reads any character no land has.
  const strange = [...new Set(drawing.join('').split('').filter((c) => !chars.has(c) && !ways[c]))]
  // The region: only the fields the painting sets, over what the layout made.
  const texts = new Map((table.paths ?? []).map((p) => [p.name, p.text]))
  const sides = new Map((table.beyond ?? []).filter((b) => SIDES.includes(b.side)).map((b) => [b.side, b.text]))
  const painted = {
    legend: { ...ways, ...Object.fromEntries([...chars].map(([c, key]) => [c, key])) },
    lands: Object.fromEntries(lands.filter((l) => !ENGINE_LANDS.includes(l.key)).map((l) => [l.key, { like: l.like, text: l.text }])),
    zones: `${drawing.join('\n')}\n`,
    paths: region.paths.map((p) => (texts.get(p.name) ? { ...p, text: texts.get(p.name) } : p)),
    beyond: SIDES.filter((side) => sides.has(side) || region.beyond.some((b) => b.side === side)).map((side) => {
      const had = region.beyond.find((b) => b.side === side)
      return { side, text: sides.get(side) ?? had!.text, toward: had?.toward ?? [] }
    }),
  }
  // The palette: its names and tints for these lands, everything else as it was.
  const palette: MapPalette = structuredClone(content.world.map?.palette ?? DEFAULT_PALETTE)
  for (const land of lands) {
    // The bare name (M10.26: Sonnet wrote "On the black basalt"; the game puts "On the" before it itself).
    palette.names[land.key] = String(land.name).replace(/^(on|in|among|at|by|across)\s+/i, '').replace(/^the\s+/i, '')
    palette.dark.terrain[land.key] = tints(land.dark)
    palette.paper.terrain[land.key] = tints(land.paper)
  }
  const map = { ...(content.world.map ?? {}), palette }
  const notes = [
    ...(sized ? [`The drawing came as ${given.length} rows of ${[...new Set(given.map((r) => r.length))].join(' or ')} characters and is made ${rows.length} of ${width}, each row with the land at its end.`] : []),
    ...(strange.length ? [`The drawing has ${strange.join(' ')}, which is no land: the map reads each as the land beside it.`] : []),
    ...(asWays.length ? [`${asWays.map((l) => l.key).join(' and ')} use${asWays.length === 1 ? 's' : ''} the character of a way, and ways stay ways: left out of the lands.`] : []),
  ]
  const said = typeof table.say === 'string' ? table.say : ''
  return {
    say: notes.length ? `${said} (${notes.join(' ')})`.trim() : said,
    questions: [],
    changes: [{ kind: 'region', id: region.id, merge: true, yaml: stringify(JSON.parse(JSON.stringify(painted)), { lineWidth: 0 }) }],
    world: stringify({ map: JSON.parse(JSON.stringify(map)) }, { lineWidth: 0 }),
    problems: [],
  }
}
