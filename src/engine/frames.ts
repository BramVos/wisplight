import type { Content } from './content'
import { KNOBS, knob, type KnobId } from './knobs'
import { playModeOf, type PlayMode } from './modes'
import { reachOf, type Reach } from './reach'
import { stories, type Tempo } from './stories'
import type { Driver } from './tideschema'
import { tideState } from './tides'
import type { World } from './world'

// The frames once (M10.24; Bram, 28 September 2026: the player sets the
// frames at the start and then plays on, and the game does not ask for them
// again). What a game is played under, on one screen: the world and its
// lands, the great lines, three dials for how the world moves (how much
// happens by itself, how often a storyline comes looking for the stranger,
// how much the world grows in a season) and the play mode; the budget and
// the threshold for asking are the app's and sit beside them on the screen.
// The dials are knobs of this game (state.knobs over the world's own), set
// by the command FRAMES, so a replay sets them as the game did.

export type DialId = 'events' | 'lines' | 'growth' | 'region'

export interface Dial {
  id: DialId
  name: string
  about: string
  choices: { id: string; name: string }[]
  chosen: string
}

export interface FramesView {
  world: { name: string; land: string; region: string }
  lands: { id: string; name: string; reach: Reach; why?: string; tongue?: string }[]
  lines: { id: string; name: string; kind: string; stage: 'calm' | 'threat' | 'event'; driven: string }[]
  dials: Dial[]
  mode: PlayMode
}

/**
 * How often a storyline comes looking for the stranger: the belang from which
 * news calls the chronicler by day, and the hooks of the pulse in a week.
 */
const LINES: Record<string, { belang: (world: number) => number; hooks: number }> = { often: { belang: (w) => Math.max(3, w - 1), hooks: 2 }, seldom: { belang: (w) => Math.min(6, w + 1), hooks: 0.5 } }
/** How much the world grows in a season: the people named in passing and the things placed, by a factor. */
const GROWTH: Record<string, number> = { little: 0.5, much: 2 }
const GROWTH_KNOBS = ['sketches.per_day', 'sketches.per_area_season', 'props.per_week'] as const satisfies readonly KnobId[]

/** The world's own value of a knob, without this game's. */
function worlds(world: World, id: KnobId): number {
  return knob({ content: world.content }, id) as number
}

/** A knob of this game, kept within its bounds; the world's value when it is the same. */
function setKnob(world: World, id: KnobId, value: number | undefined): void {
  const def = KNOBS[id] as { min: number; max: number }
  const knobs = (world.state.knobs ??= {})
  if (value === undefined || value === worlds(world, id)) delete knobs[id]
  else knobs[id] = Math.min(def.max, Math.max(def.min, Math.round(value)))
}

function dials(world: World): Dial[] {
  const chosen = world.state.frames ?? {}
  return [
    {
      id: 'events',
      name: 'How much happens by itself',
      about: 'Small stories of the world: a quarrel, a find, a theft.',
      choices: [
        { id: 'calm', name: 'calm' },
        { id: 'normal', name: 'normal' },
        { id: 'dramatic', name: 'dramatic' },
      ],
      chosen: stories(world).tempo,
    },
    {
      id: 'lines',
      name: 'How often a storyline comes looking for you',
      about: 'How many hooks reach you in a week (a request, a visitor, a letter), and from how big a piece of news the chronicler comes by day.',
      choices: [
        { id: 'often', name: 'often' },
        { id: 'world', name: 'as the world has it' },
        { id: 'seldom', name: 'seldom' },
      ],
      chosen: chosen.lines ?? 'world',
    },
    {
      id: 'growth',
      name: 'How much the world grows in a season',
      about: 'New people named in passing, and things the chronicler places.',
      choices: [
        { id: 'little', name: 'little' },
        { id: 'world', name: 'as the world has it' },
        { id: 'much', name: 'much' },
      ],
      chosen: chosen.growth ?? 'world',
    },
    // How full a new region is built (M10.25): the price of each stands beside it on the screen.
    {
      id: 'region',
      name: 'How full a new region is built',
      about: 'Outline: what there is, and the rest when you come there. Story: a quest, customs, lore and secrets at arrival. Full: the world build in small, while you travel.',
      choices: [
        { id: 'outline', name: 'outline' },
        { id: 'story', name: 'story' },
        { id: 'full', name: 'full' },
      ],
      chosen: regionSetting(world),
    },
  ]
}

/** What drives a great line, in a few words for the player. */
function driven(content: Content, drivers: readonly Driver[]): string {
  const words = drivers
    .filter((d) => d.weight > 0)
    .map((d) => {
      if ('season' in d) return d.season
      if ('tension' in d) return `tension between ${d.tension.map((r) => content.realms.get(r)?.name ?? r).join(' and ')}`
      if ('short' in d) return `want in ${content.areas.get(d.short.settlement)?.name ?? d.short.settlement.replace(/_/g, ' ')}`
      if ('flag' in d) return d.flag.replace(/_/g, ' ')
      return d.fact.by === 'player' ? 'what you do' : `${(d.fact.kind ?? 'news').replace(/_/g, ' ')}`
    })
  return [...new Set(words)].join(', ') || 'nothing yet'
}

/** The frames a world sets, before any game (the editor shows them above the steps): its lands and its great lines. */
export function worldFrames(content: Content): Pick<FramesView, 'lands'> & { lines: Omit<FramesView['lines'][number], 'stage'>[] } {
  const w = content.world
  const lands = [...content.lands.values()].map((land) => {
    const set = w.reach?.find((r) => r.between.includes(land.id) && r.between.includes(w.id))
    const why = set?.why?.trim().replace(/\.$/, '')
    return { id: land.id, name: land.name, reach: reachOf(content, w.id, land.id), ...(why ? { why } : {}), ...(land.language ? { tongue: land.language.name } : {}) }
  })
  const lines = [...content.tides.values()].map((tide) => ({ id: tide.id, name: tide.name, kind: tide.kind, driven: driven(content, tide.drivers) }))
  return { lands, lines }
}

/**
 * How full a new region is built (M10.25; Bram, 29 September 2026): outline,
 * what there was (the outline, and the rest when the stranger comes there);
 * story, the outline and the story round (the default with a model); full,
 * the world build in small over the region. A knob of this game.
 */
export type RegionSetting = 'outline' | 'story' | 'full'
export const REGION_SETTINGS: readonly RegionSetting[] = ['outline', 'story', 'full']

export function regionSetting(world: Pick<World, 'state' | 'aiLive'>): RegionSetting {
  return world.state.frames?.region ?? (world.aiLive ? 'story' : 'outline')
}

/** The frames of a game, for the screen and the terminal. */
export function framesView(world: World): FramesView {
  const { lands, lines } = worldFrames(world.content)
  return {
    world: { name: world.content.world.name, land: world.words.land, region: world.words.region },
    lands,
    lines: lines.map((l) => ({ ...l, stage: tideState(world, l.id).stage })),
    dials: dials(world),
    mode: playModeOf(world),
  }
}

const REACH: Record<Reach, string> = { none: 'unknown to each other', rumour: 'known by rumour', trade: 'joined by trade', close: 'close neighbours' }
const MODES: Record<PlayMode, string> = { continue: 'play on: the world goes on by itself', think: 'think along: what a night brings waits for you in the morning', direct: 'direct: what the chronicler would do waits for you as a proposal' }

/** The frames as lines, for the journal and the terminal. */
export function framesLines(world: World): string[] {
  const view = framesView(world)
  return [
    `${view.world.name}: ${view.world.region}, in ${view.world.land}.`,
    ...(view.lands.length ? ['', 'The lands:', ...view.lands.map((l) => `  ${l.name}: ${REACH[l.reach]}${l.why ? ` (${l.why})` : ''}${l.tongue ? `; they speak ${l.tongue}` : ''}.`)] : []),
    ...(view.lines.length ? ['', 'The great lines:', ...view.lines.map((l) => `  ${l.name} (${l.kind}): ${l.stage === 'calm' ? 'calm' : l.stage === 'threat' ? 'a threat' : 'broken'}; driven by ${l.driven}.`)] : []),
    '',
    'How the world moves:',
    ...view.dials.map((d) => `  ${d.name}: ${d.choices.find((c) => c.id === d.chosen)?.name ?? d.chosen} (FRAMES ${d.id.toUpperCase()} ${d.choices.map((c) => c.id.toUpperCase()).join(', ')}).`),
    '',
    `Play mode: ${MODES[view.mode]}. The play mode, the budget and when the game asks before a costly call are in Settings.`,
  ]
}

/**
 * The command FRAMES: without words the frames; with a dial and a choice, that
 * dial for this game (FRAMES LINES OFTEN). Returns what to tell the player.
 */
export function setFrame(world: World, dial: string | undefined, choice: string | undefined): { text: string; ok: boolean } {
  const d = dials(world).find((x) => x.id === dial?.toLowerCase())
  const c = d?.choices.find((x) => x.id === choice?.toLowerCase() || x.name === choice?.toLowerCase())
  if (!d || !c) return { ok: false, text: 'FRAMES EVENTS CALM, NORMAL or DRAMATIC; FRAMES LINES OFTEN, WORLD or SELDOM; FRAMES GROWTH LITTLE, WORLD or MUCH; FRAMES REGION OUTLINE, STORY or FULL.' }
  if (d.id === 'events') stories(world).tempo = c.id as Tempo
  const frames = (world.state.frames ??= {})
  if (d.id === 'lines') {
    const way = LINES[c.id]
    setKnob(world, 'story.urgent_belang', way ? way.belang(worlds(world, 'story.urgent_belang')) : undefined)
    setKnob(world, 'story.hooks_per_week', way ? worlds(world, 'story.hooks_per_week') * way.hooks : undefined)
    if (way) frames.lines = c.id as 'often' | 'seldom'
    else delete frames.lines
  }
  if (d.id === 'growth') {
    const factor = GROWTH[c.id]
    for (const id of GROWTH_KNOBS) setKnob(world, id, factor ? worlds(world, id) * factor : undefined)
    if (factor) frames.growth = c.id as 'little' | 'much'
    else delete frames.growth
  }
  if (d.id === 'region') frames.region = c.id as RegionSetting
  return { ok: true, text: `${d.name}: ${c.name}.` }
}
