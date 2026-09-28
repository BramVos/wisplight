import { z } from 'zod'
import { GameClock, minuteOfDay } from './clock'
import { hasWeather, weather } from './weather'
import type { World } from './world'

// Sound, modest (M10.15; the review of 28 September 2026, taken over by
// Bram): an ambient sound per place from the content, and a bell on the hours
// it rings. The engine says what is to be heard; the app makes it (a small
// generator of noise and tone, no recordings), soft by default and easy to
// turn off. Nothing needs sound to be understood: the bell is a line in the
// text as well. A world without sound in its content is quiet.

/** The kinds of ambient sound the app can make. */
export const SOUND_KINDS = ['wind', 'reeds', 'rain', 'sea', 'surf', 'hearth', 'crowd', 'workshop', 'water', 'birds', 'hum', 'quiet'] as const
export type SoundKind = (typeof SOUND_KINDS)[number]

/** The sound of a place or an area: a kind, or a kind with a level and a kind of its own at night. */
export const SoundSchema = z.union([
  z.enum(SOUND_KINDS),
  z
    .object({
      kind: z.enum(SOUND_KINDS),
      /** How loud, from 0 to 1, before the player's own volume. */
      level: z.number().min(0).max(1).default(0.5),
      night: z.enum(SOUND_KINDS).optional(),
    })
    .strict(),
])
export type SoundDef = z.infer<typeof SoundSchema>

/**
 * A bell (M10.15): where it hangs, the hours it rings, heard in some areas and
 * far off in others, with a line in the text for whoever hears it. {hour} is
 * the hour in words ("noon", "six").
 */
export const BellSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    name: z.string(),
    at: z.string(),
    hours: z.array(z.number().int().min(0).max(23)).min(1),
    /** Where it is heard plainly; without it, the area of the place it hangs in. */
    heard: z.array(z.string()).default([]),
    /** Where it is heard far off, muffled. */
    far: z.array(z.string()).default([]),
    line: z.string(),
    far_line: z.string().optional(),
  })
  .strict()
export type Bell = z.infer<typeof BellSchema>

/** What the player hears now, for the app: a kind, how loud, and whether under a roof. */
export interface SoundNow {
  kind: SoundKind
  level: number
  indoors: boolean
  /** The last bell heard, and whether far off: the app rings it once when it changes. */
  bell?: { t: number; far: boolean }
}

/** Places with a roof over them. */
const ROOFED = ['indoors', 'private', 'shop', 'social', 'workshop', 'holy']

const HOURS = ['midnight', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'noon']

/** An hour in words, as a bell tells it: "six", "noon", "midnight". */
function hourWord(hour: number): string {
  return hour === 0 ? 'midnight' : hour === 12 ? 'noon' : HOURS[hour % 12]!
}

function kindOf(def: SoundDef | undefined, night: boolean): { kind: SoundKind; level: number } | undefined {
  if (!def) return undefined
  if (typeof def === 'string') return { kind: def, level: 0.5 }
  return { kind: night && def.night ? def.night : def.kind, level: def.level }
}

/**
 * The ambient sound where the player is (M10.15): the place's own, else its
 * area's; outdoors in rain the rain, under a roof the rain on it; quieter at
 * night and in mist. Undefined where the content gives none: silence.
 */
export function soundNow(world: World): SoundNow | undefined {
  const place = world.content.locations.get(world.state.player.location)
  const night = new GameClock(world.now).isNight
  const indoors = Boolean(place?.tags.some((t) => ROOFED.includes(t)))
  // Out on the land between the places (a hex of the region map): the sound of the area that stands for it.
  const land = !place && world.state.player.location.startsWith('hex:') ? world.content.regions.values().next().value?.area : undefined
  const own = kindOf(place?.sound ?? world.content.areas.get(place?.area ?? land ?? '')?.sound, night)
  const sky = hasWeather(world) ? weather(world) : undefined
  const wet = sky === 'rain' || sky === 'storm'
  let now = own
  // Rain drowns the rest outdoors, and drums on the roof inside; a storm is loud either way.
  if (wet && (own || !indoors)) now = { kind: 'rain', level: sky === 'storm' ? 0.8 : indoors ? 0.35 : 0.6 }
  if (!now) return lastBell(world)
  const level = Math.round(now.level * (night ? 0.7 : 1) * (sky === 'fog' ? 0.7 : 1) * 100) / 100
  const bell = world.state.bell
  return { kind: now.kind, level, indoors, ...(bell ? { bell: { t: bell.t, far: bell.far } } : {}) }
}

/** No ambient sound, but a bell may still have rung. */
function lastBell(world: World): SoundNow | undefined {
  const bell = world.state.bell
  return bell ? { kind: 'quiet', level: 0, indoors: false, bell: { t: bell.t, far: bell.far } } : undefined
}

/**
 * On the hour (M10.15): a bell that rings now, heard where the player is, is a
 * line in the text and a sound in the app, plainly or far off.
 */
export function bellsHour(world: World): void {
  const bells = world.content.world.bells
  if (!bells.length || minuteOfDay(world.now) % 60 !== 0) return
  const hour = new GameClock(world.now).parts.hour
  const place = world.content.locations.get(world.state.player.location)
  if (!place) return
  for (const bell of bells) {
    if (!bell.hours.includes(hour)) continue
    const heard = bell.heard.length ? bell.heard : [world.content.locations.get(bell.at)?.area ?? '']
    const plain = heard.includes(place.area)
    const far = !plain && bell.far.includes(place.area)
    if (!plain && !far) continue
    const line = (far ? (bell.far_line ?? `Far off, ${bell.name} rings for {hour}.`) : bell.line).replace('{hour}', hourWord(hour))
    world.notices.push(line)
    world.state.bell = { t: world.now, far }
    return
  }
}
