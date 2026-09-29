import { z } from 'zod'

// The colours of the map (M10; FO, chapter 4, "Weergave"; the proposal page
// approved on 28 September 2026). A palette is content per world: tokens per
// terrain and feature, for the dark style and the paper style, in world.yaml.
// Black and white is the paper style in greys. Every terrain has three or four
// muted tints; which one a hex gets comes from its seed. The same tokens paint
// the map, its legend and the journal.

const Colour = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const Tints = z.array(Colour).min(1).max(4)

export const MapStyleSchema = z
  .object({
    ground: Colour,
    unknown: Colour,
    label: Colour,
    label_shadow: Colour,
    terrain: z.record(z.string(), Tints).describe('Tints per terrain: the engine\'s lands (fen, water, woods, heath, fields), their kinds (bog, hummock, ridge, channel), a level\'s own (tunnel, crown), and any a world names.'),
    ways: z.object({ road: Colour, path: Colour, canal: Colour }).strict(),
    glyph: z.record(z.string(), Colour).refine((g) => typeof g['stairs'] === 'string', { message: 'needs a colour for stairs, the way up or down' }).describe('The colour of each sign on the land, by the sign\'s id (M10.20), and of `stairs`, the way up or down. `peat_edge` is the rim of a pit-shaped sign (the name is the Nethermarch\'s, kept so every world still loads); without it the rim is the sign\'s own colour, a little lighter.'),
    visited: Colour.optional().describe('A place you have been (after the M10 playtest): its marker, in a colour that stands out. A palette without one takes the default\'s.'),
    trail: Colour.optional().describe('The thin line of the way you walked.'),
  })
  .strict()
export type MapStyle = z.infer<typeof MapStyleSchema>

/** How a sign is drawn: the shapes the map knows. */
export const SIGN_SHAPES = ['pool', 'pit', 'tree', 'ruin', 'knoll', 'tuft', 'rock', 'warning', 'query'] as const
export type SignShape = (typeof SIGN_SHAPES)[number]

/** The most signs a world may name: the map keeps a sign in three bits of a hex. */
export const MAX_SIGNS = 7

/**
 * A sign on the land (M10.20; found building The Quiet Reach: the model
 * borrowed the Nethermarch's peat pit for a mine shaft, and had nowhere to
 * say danger or uncertain). What the legend calls it, how it is drawn, what
 * it means beyond its colour, on which land it lies and how often, and what
 * the stranger notices walking past.
 */
export const SignSchema = z
  .object({
    name: z.string().min(1),
    shape: z.enum(SIGN_SHAPES),
    means: z.enum(['danger', 'uncertain']).optional().describe('More than a colour can say: the map adds a mark (! or ?) and the legend the word.'),
    on: z.record(z.string(), z.number().min(0).max(1)).default({}).describe('On which land it lies, and on what share of those hexes (0 to 1): `{ fen: 0.1 }`.'),
    text: z.string().optional().describe('The line the stranger reads walking through its hex.'),
    firm: z.boolean().optional().describe('Firm ground: quicker to cross, never soft, and what a hidden path turns wet ground into.'),
    wet: z.boolean().optional().describe('Water in the ground: a way laid across it fills it in.'),
    stops: z.string().optional().describe('A walk stops here to look, with this line.'),
  })
  .strict()
export type Sign = z.infer<typeof SignSchema>

export const MapPaletteSchema = z
  .object({
    names: z.record(z.string(), z.string()).default({}).describe('What the legend calls each terrain in this world.'),
    signs: z
      .record(z.string().regex(/^[a-z0-9_]+$/), SignSchema)
      .refine((s) => Object.keys(s).length <= MAX_SIGNS, { message: `at most ${MAX_SIGNS} signs: the map keeps a sign in three bits of a hex` })
      .refine((s) => !('stairs' in s), { message: 'stairs is the way up or down, not a sign on the land' })
      .optional().describe('The signs on this world\'s land, in order (M10.20); without them the Nethermarch\'s five.'),
    dark: MapStyleSchema,
    paper: MapStyleSchema,
  })
  .strict()
  .superRefine((palette, ctx) => {
    for (const message of signProblems(palette)) ctx.addIssue({ code: 'custom', message })
  })
export type MapPalette = z.infer<typeof MapPaletteSchema>

/** The levels of a world, from below to above: one is shown at a time (M10). */
export const LevelSchema = z.object({ id: z.string().regex(/^[a-z0-9_]+$/), name: z.string() }).strict()
export type Level = z.infer<typeof LevelSchema>

export const SURFACE = 'surface'

export const WorldMapSchema = z
  .object({
    palette: MapPaletteSchema.optional(),
    levels: z.array(LevelSchema).default([{ id: SURFACE, name: 'ground level' }]).describe('The levels, from below to above; the surface is always there.'),
  })
  .strict()
export type WorldMap = z.infer<typeof WorldMapSchema>

export type MapStyleName = 'dark' | 'paper' | 'bw'

/**
 * The Nethermarch's signs, and what a world without its own gets: the pools
 * and peat pits of the fen, a willow, the stump of a wall and the hummocks,
 * with the shares and lines the generator always had.
 */
export const DEFAULT_SIGNS: Record<string, Sign> = {
  pool: { name: 'pool', shape: 'pool', on: { fen: 0.1 }, text: 'A black pool lies to one side, still as glass.', wet: true },
  peat_pit: { name: 'peat pit', shape: 'pit', on: { fen: 0.07 }, text: 'An old peat pit gapes beside you, full of brown water.', wet: true },
  willow: { name: 'willow', shape: 'tree', on: { fen: 0.05, fields: 0.04 }, text: 'A lone willow leans over the wet ground.' },
  ruin: { name: 'old wall', shape: 'ruin', on: { fen: 0.01, heath: 0.02 }, text: 'The stump of an old wall stands here, black with moss.', stops: 'Something stands out of the sedge here: an old wall.' },
  hummock: { name: 'hummock', shape: 'knoll', on: { fen: 0.12 }, text: 'The ground rises into a hummock, a little drier than the rest.', firm: true },
}

/** The signs of a world, in order: the index of one plus one is what a hex keeps. */
export function signsOf(palette: Pick<MapPalette, 'signs'> | undefined): [string, Sign][] {
  return Object.entries(palette?.signs ?? DEFAULT_SIGNS)
}

/**
 * What is wrong with the signs of a palette (M10.20): a sign without a colour
 * in a style, a colour for a sign that is not there, or more signs on a land
 * than it has hexes.
 */
export function signProblems(palette: Pick<MapPalette, 'signs' | 'dark' | 'paper'>): string[] {
  const problems: string[] = []
  const ids = signsOf(palette).map(([id]) => id)
  const share: Record<string, number> = {}
  for (const [, sign] of signsOf(palette)) for (const [land, part] of Object.entries(sign.on ?? {})) share[land] = (share[land] ?? 0) + part
  for (const [land, part] of Object.entries(share)) if (part > 1) problems.push(`palette signs: the signs on ${land} take ${Math.round(part * 100)}% of its hexes; together they may take at most all of them`)
  const lands = new Set([...LANDS, ...Object.keys(palette.dark.terrain), ...Object.keys(palette.paper.terrain)])
  for (const [id, sign] of signsOf(palette)) for (const land of Object.keys(sign.on ?? {})) if (!lands.has(land)) problems.push(`palette signs.${id}.on: there is no land ${land}; it is one of the engine's (${LANDS.join(', ')}) or a terrain of the palette`)
  for (const style of ['dark', 'paper'] as const) {
    const glyph = palette[style].glyph
    for (const id of ids) if (!glyph[id]) problems.push(`palette ${style}.glyph: no colour for the sign ${id}`)
    for (const key of Object.keys(glyph)) if (key !== 'stairs' && key !== 'peat_edge' && !ids.includes(key)) problems.push(`palette ${style}.glyph.${key}: there is no sign ${key}${palette.signs ? ' under palette.signs' : ' (a world without signs of its own has the pool, peat_pit, willow, ruin and hummock)'}`)
  }
  return problems
}

/** The lands the region generator knows (FO, chapter 4): a sign lies on one of these, or on a terrain a palette names. */
export const LANDS = ['fen', 'water', 'woods', 'heath', 'fields']

/** The terrains a legend can show, in order. */
export const TERRAIN_ORDER = ['fen', 'bog', 'hummock', 'ridge', 'water', 'channel', 'woods', 'heath', 'fields', 'tunnel', 'crown']

/**
 * The palette of the proposal page: the Nethermarch's, and what a world
 * without its own palette gets.
 */
export const DEFAULT_PALETTE: MapPalette = {
  names: { fen: 'fen', bog: 'boggy fen', hummock: 'hummock', ridge: 'dry ridge', water: 'open water', channel: 'channel', woods: 'woods', heath: 'heath', fields: 'fields', tunnel: 'tunnel', crown: 'crowns' },
  dark: {
    ground: '#101209',
    unknown: '#171a12',
    label: '#e3dcc5',
    label_shadow: '#0b0c07',
    terrain: {
      fen: ['#4a5337', '#434c32', '#515a3c', '#3f472f'],
      bog: ['#353b28', '#383f2a'],
      hummock: ['#5f6846', '#666f4b'],
      ridge: ['#747454', '#7c7b59'],
      water: ['#1c3540', '#1f3a46', '#1a313b', '#21404c'],
      channel: ['#2b4f5a', '#305762'],
      woods: ['#2f472d', '#2a4029', '#34502f', '#2b4329'],
      heath: ['#655561', '#5d4f5a', '#6d5c66', '#584b56'],
      fields: ['#777144', '#6f6a3f', '#7f7848', '#6a653c'],
      tunnel: ['#6b5a45', '#62523f'],
      crown: ['#5d7a48', '#56713f'],
    },
    ways: { road: '#cbb68a', path: '#b39f76', canal: '#88aab3' },
    glyph: { pool: '#8fb7c1', peat_pit: '#16120c', peat_edge: '#6b5c43', willow: '#a6b983', ruin: '#cdbba2', hummock: '#b1b682', stairs: '#e7d9a8' },
    visited: '#f0b04a',
    trail: '#e8a13c',
  },
  paper: {
    ground: '#e8dfc6',
    unknown: '#e2d8bd',
    label: '#2f271b',
    label_shadow: '#efe7d0',
    terrain: {
      fen: ['#c1bf97', '#bab88f', '#c8c6a0', '#b4b18a'],
      bog: ['#a9a780', '#a4a27b'],
      hummock: ['#d2d0a9', '#d7d5ae'],
      ridge: ['#dcd6ae', '#e1dbb3'],
      water: ['#9ebac0', '#a6c1c6', '#98b4ba', '#abc5ca'],
      channel: ['#86a9b1', '#8cafb7'],
      woods: ['#9eb08a', '#96a983', '#a5b690', '#91a47e'],
      heath: ['#c3abb6', '#baa3ae', '#cab2bc', '#b49ea8'],
      fields: ['#d8cfa2', '#d1c89b', '#ded5a8', '#cbc295'],
      tunnel: ['#a48c6a', '#9a8363'],
      crown: ['#8fa874', '#88a06d'],
    },
    ways: { road: '#8a6d43', path: '#a0865b', canal: '#5c8a94' },
    glyph: { pool: '#4f7c88', peat_pit: '#5a4a35', peat_edge: '#3f3325', willow: '#52683e', ruin: '#6d5a44', hummock: '#8b8a5b', stairs: '#2b2418' },
    visited: '#b0461c',
    trail: '#a4481f',
  },
}

/** A colour as grey, weighted as the eye weighs it. */
export function grey(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const g = Math.round(0.3 * (n >> 16) + 0.59 * ((n >> 8) & 255) + 0.11 * (n & 255))
  const h = g.toString(16).padStart(2, '0')
  return `#${h}${h}${h}`
}

/** The style to draw with: dark, paper, or paper in greys for black and white. */
export function mapStyle(palette: MapPalette | undefined, name: MapStyleName): MapStyle {
  const p = palette ?? DEFAULT_PALETTE
  if (name !== 'bw') return p[name]
  const paper = p.paper
  return {
    ground: '#f4f4f1',
    unknown: '#ededea',
    label: '#111111',
    label_shadow: '#ffffff',
    terrain: Object.fromEntries(Object.entries(paper.terrain).map(([k, tints]) => [k, tints.map(grey)])),
    ways: { road: '#1d1d1d', path: '#3a3a3a', canal: '#555555' },
    // Every sign in black; a pit darker, its rim and the firm ground lighter.
    glyph: { ...Object.fromEntries(signsOf(p).map(([id, sign]) => [id, sign.shape === 'pit' ? '#111111' : sign.firm ? '#444444' : '#222222'])), peat_edge: '#555555', stairs: '#111111' },
    visited: '#000000',
    trail: '#3a3a3a',
  }
}

/** The colours of a visited place and of your trail in a style, from the default palette when the world has none. */
export function markColours(style: MapStyle, name: MapStyleName): { visited: string; trail: string } {
  const fallback = name === 'dark' ? DEFAULT_PALETTE.dark : DEFAULT_PALETTE.paper
  return { visited: style.visited ?? fallback.visited!, trail: style.trail ?? fallback.trail! }
}

/** The tints of a terrain in a style, falling back on the default palette, then on fields. */
export function tintsOf(style: MapStyle, key: string, fallback: MapStyle = DEFAULT_PALETTE.dark): string[] {
  return style.terrain[key] ?? fallback.terrain[key] ?? style.terrain['fields'] ?? ['#777777']
}

/** What the legend calls a terrain in a world. */
export function terrainName(palette: MapPalette | undefined, key: string): string {
  return palette?.names[key] ?? DEFAULT_PALETTE.names[key] ?? key.replace(/_/g, ' ')
}
