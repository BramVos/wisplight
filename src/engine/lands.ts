import type { Content, Land, WorldDef } from './content'
import type { Voice } from './dialogue/voiceSchema'
import type { NamesSchema } from './growth/schema'
import type { z } from 'zod'
import { DEFAULT_MONEY, type MoneyUnit } from './items'
import type { MapPalette } from './map/palette'

// Lands (M10.23; Bram, 28 September 2026: what if the stranger goes to
// another continent, with a dynamic of its own?). A world has a home land,
// which is the world itself, and may have other lands in
// content/<world>/lands/<land>/, each with its own frame: its voice kit, its
// faiths and coins, its law, its names, its palette. An area belongs to a
// land (`land:`, or the folder it is in); a place that grows in play takes
// the land of what it grows from. Whoever asks for the frame of a land gets
// the land's own where it has one, and the world's where it does not; the
// calendar and the clock are always the world's.

/** A frame: what a land is played under, the land's own over the world's. */
export interface Frame {
  /** The land, or undefined for the world's home land. */
  land?: Land
  /** What the land is called: the land's name, or the world's word for its land. */
  name: string
  /** The fixed block every model call gets. */
  frame?: string
  voice?: Voice
  faiths: WorldDef['faiths']
  names?: z.infer<typeof NamesSchema>
  /** Its coins, largest first, and how many of its smallest one of the world's smallest buys. */
  coins: readonly MoneyUnit[]
  rate: number
  law?: WorldDef['law']
  standing?: WorldDef['standing']
  sketch?: WorldDef['sketch']
  palette?: MapPalette
  pictures?: WorldDef['pictures']
}

/** The land an area belongs to; undefined is the home land. */
export function landOfArea(content: Pick<Content, 'areas' | 'lands'>, area: string | undefined): Land | undefined {
  const id = area ? content.areas.get(area)?.land : undefined
  return id ? content.lands.get(id) : undefined
}

/** The frame of a land (undefined: the home land): the land's own where it has one, else the world's. */
export function frameOf(content: Pick<Content, 'world' | 'voice' | 'lands'>, land?: Land | string): Frame {
  const w = content.world
  const l = typeof land === 'string' ? content.lands.get(land) : land
  const home: Frame = {
    name: w.words?.land ?? w.name,
    ...(w.frame ? { frame: w.frame } : {}),
    ...(content.voice ? { voice: content.voice } : {}),
    faiths: w.faiths,
    ...(w.names ? { names: w.names } : {}),
    coins: w.money?.units ?? DEFAULT_MONEY,
    rate: 1,
    ...(w.law ? { law: w.law } : {}),
    ...(w.standing ? { standing: w.standing } : {}),
    ...(w.sketch ? { sketch: w.sketch } : {}),
    ...(w.map?.palette ? { palette: w.map.palette } : {}),
    ...(w.pictures ? { pictures: w.pictures } : {}),
  }
  if (!l) return home
  // A land without a law of its own keeps the world's kind of law, but not its officer or its office: those are at home.
  const law = l.law ?? (w.law ? { ...w.law, where: `in ${l.name}`, npc: undefined, office: undefined } : undefined)
  return {
    ...home,
    land: l,
    name: l.words?.land ?? l.name,
    frame: l.frame,
    ...(l.voice ? { voice: l.voice } : {}),
    faiths: l.faiths ?? home.faiths,
    ...(l.names ? { names: l.names } : {}),
    ...(l.money ? { coins: l.money.units, rate: l.money.rate } : {}),
    ...(law ? { law } : {}),
    ...(l.standing ? { standing: l.standing } : {}),
    ...(l.sketch ? { sketch: l.sketch } : {}),
    ...(l.palette ? { palette: l.palette } : {}),
    ...(l.pictures ? { pictures: l.pictures } : {}),
  }
}

/** Every faith of the world and of its lands (M10.23), for looking one up by id. */
export function allFaiths(content: Pick<Content, 'world' | 'lands'>): WorldDef['faiths'] {
  const all = [...content.world.faiths, ...[...content.lands.values()].flatMap((l) => l.faiths ?? [])]
  return all.filter((f, i) => all.findIndex((g) => g.id === f.id) === i)
}
