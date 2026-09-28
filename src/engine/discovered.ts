import type { Engine, JournalEntry } from './engine'
import { DEFAULT_PALETTE } from './map/palette'
import { hexMapData, type HexMapData } from './map/view'
import { escapeHtml } from './markdown'
import { hexMapSvg, worldAtlasHtml } from './worldatlas'

// What you have found out (M10.20; Bram, 28 September 2026: "een export van
// alles wat jij hebt ontdekt tot nu toe"): the journal of this game as a book,
// part by part, each entry with its page, and the land as far as the stranger
// has seen it. Only what the stranger saw, heard or was told: no secrets not
// yet told, no quest stages not reached, and not the chronicle of the game,
// which knows what happened out of sight. The whole world book, everything,
// is the editor's.

const PARTS: [keyof ReturnType<Engine['status']>['journal'], string][] = [
  ['quests', 'Quests'],
  ['people', 'People'],
  ['places', 'Places'],
  ['lands', 'Lands'],
  ['factions', 'Powers'],
  ['events', 'Events'],
  ['lore', 'Lore'],
  ['things', 'Things'],
]

const para = (text: string | undefined): string[] => (text?.trim() ? [text.trim(), ''] : [])

/** Who the stranger is in this game: the character's name, or "the stranger". */
function whoOf(engine: Engine): string {
  return engine.state.player.character?.name ?? 'the stranger'
}

/** What the stranger has found out, as Markdown with the atlas's markers (M10.20). */
export function discoveredBook(engine: Engine): string {
  const world = engine.world
  const status = engine.status()
  const who = whoOf(engine)
  const chapters: { title: string; body: string[] }[] = []
  const add = (title: string, body: string[]) => {
    if (body.some((l) => l.trim())) chapters.push({ title, body })
  }

  add('Where things stand', [...para(`It is ${world.date()}. You are at ${status.location}${status.area && status.area !== status.location ? `, in ${status.area}` : ''}, with ${status.money}.`)])
  if (hexMapData(world, { whole: true })?.hexes.length) add('The land as you have seen it', ['<!-- picture:seen -->', '', ...para('Only the land you have seen, and the places you know of; the rest is blank.')])

  // What is still to find (M10.20; Bram: "zodat ze zien wat ze nog niet hebben ontdekt"): only how many, never what.
  const { content } = world
  const journal = world.state.player.journal ?? {}
  const knows = (id: string) => journal[id] !== undefined
  const flags = world.state.flags ?? {}
  const unknown = (n: number, one: string, many: string, lead: string, tiles = true): string[] => (n > 0 ? [...(tiles ? [`<!-- picture:unknown-${n} -->`, ''] : []), `${lead} ${n} ${n === 1 ? one : many}.`, ''] : [])
  const areaOf = (name: string) => [...content.areas.values()].find((a) => a.name === name)
  const placesLeft = (areaId: string) => [...content.locations.values()].filter((l) => l.area === areaId && !knows(l.id)).length

  for (const [part, title] of PARTS) {
    const entries = status.journal[part]
    const body: string[] = part === 'people' && entries.length ? ['<!-- picture:portraits -->', ''] : []
    let group: string | undefined
    const closeGroup = () => {
      // Under an area the stranger knows: how many of its places are still to find.
      const area = part === 'places' && group ? areaOf(group) : undefined
      if (area) body.push(...unknown(placesLeft(area.id), 'place', 'places', 'Still to find here:'))
    }
    for (const entry of entries as JournalEntry[]) {
      const page = engine.page(entry.id)
      if (!page) continue
      if (entry.group && entry.group !== group) {
        closeGroup()
        group = entry.group
        body.push(`### ${group}`, '')
      }
      body.push(`**${page.name}**`, '')
      if (entry.id.startsWith('area_')) body.push(`<!-- picture:${entry.id} -->`, '')
      const lines = page.lines.filter((l) => l.trim())
      const items = lines.filter((l) => l.startsWith('- '))
      for (const line of lines.filter((l) => !l.startsWith('- '))) body.push(line, '')
      if (items.length) body.push(...items, '')
      // A secret this person has not told the stranger: that there is one, not what.
      const untold = content.npcs.get(entry.id)?.secrets.filter((x) => !flags[`secret:${entry.id}:${x.id}`]).length ?? 0
      if (untold) body.push(`? ${untold === 1 ? 'Something not yet told.' : `${untold} things not yet told.`}`, '')
      if (page.sources.length) body.push(`*Heard from: ${page.sources.join('; ')}.*`, '')
      if (page.links.length) body.push(`See also: ${page.links.map((l) => l.name).join(', ')}.`, '')
    }
    closeGroup()
    if (part === 'places') {
      const areas = [...content.areas.values()].filter((a) => !knows(`area_${a.id}`) && !(a.topic && knows(a.topic)) && [...content.locations.values()].some((l) => l.area === a.id && !knows(l.id)) && ![...content.locations.values()].some((l) => l.area === a.id && knows(l.id)))
      if (areas.length) body.push('### Beyond what you know', '', ...unknown(areas.length, 'part of the land', 'parts of the land', 'Not yet heard of:'))
    }
    // The people still to meet stand in the gallery as question marks; here only how many.
    if (part === 'people') body.push(...unknown([...content.npcs.values()].filter((n) => !knows(n.id)).length, 'person', 'people', 'Not yet met or heard of:', false))
    if (part === 'quests') {
      const found = new Set(status.journal.quests.map((q) => q.id))
      body.push(...unknown([...content.quests.values()].filter((q) => !found.has(`quest_${q.id}`)).length, 'quest', 'quests', 'Not yet come upon:'))
    }
    if (part === 'lore') body.push(...unknown([...content.topics.values()].filter((t) => t.kind === 'lore' && !knows(t.id)).length, 'story', 'stories', 'Not yet heard:'))
    add(title, body)
  }

  const head = [`# ${world.content.world.name}: what ${who} found out`, '', `Everything found out so far in this game, from the journal: what the stranger saw, heard or was told, and nothing else.`, '']
  chapters.forEach((c, i) => head.push(`## ${i + 1}. ${c.title}`, '', ...c.body))
  return head.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n'
}

/** The part of the region worth drawing: what was seen and the places known, with a margin; the whole once most of it is known. */
function seenWindow(data: HexMapData, margin = 6): HexMapData {
  const cols: number[] = []
  const rows: number[] = []
  for (let i = 0; i < data.hexes.length; i += 5) {
    cols.push(data.hexes[i]!)
    rows.push(data.hexes[i + 1]!)
  }
  for (const p of data.places) {
    cols.push(p.c)
    rows.push(p.r)
  }
  if (!cols.length) return data
  const left = Math.max(data.left, Math.min(...cols) - margin)
  const right = Math.min(data.left + data.width - 1, Math.max(...cols) + margin)
  const top = Math.min(data.top, Math.max(...rows) + margin)
  const bottom = Math.max(data.top - data.height + 1, Math.min(...rows) - margin)
  // An odd column is half a hex north: start on an even one, so the drawing keeps its shape.
  const even = left % 2 === 1 && left > data.left ? left - 1 : left
  return { ...data, left: even, top, width: right - even + 1, height: top - bottom + 1 }
}

/** Question marks for what is still to find (M10.20): one each, up to eight, then how many more. */
function unknownFigures(n: number): string {
  const shown = Math.min(n, n > 8 ? 7 : 8)
  return `${Array.from({ length: shown }, () => '<figure class="unknown"><div class="q">?</div><figcaption>?</figcaption></figure>').join('')}${n > shown ? `<figure class="unknown"><div class="q">+${n - shown}</div><figcaption>?</figcaption></figure>` : ''}`
}

function unknownTiles(n: number): string {
  return n > 0 ? `<div class="unknowns">${unknownFigures(n)}</div>` : ''
}

/** What the stranger found out, as an atlas page (M10.20), with the pictures there are of what they know. */
export function discoveredAtlasHtml(engine: Engine, pictures: (id: string) => string | undefined = () => undefined, written?: string): string {
  const world = engine.world
  const status = engine.status()
  const journal = status.journal
  const palette = world.content.world.map?.palette ?? DEFAULT_PALETTE
  const who = whoOf(engine)
  // Portraits only of the people met.
  const met = journal.people.filter((e) => engine.page(e.id)?.person?.met).map((e) => e.id)
  return worldAtlasHtml(world.content, discoveredBook(engine), pictures, {
    ...(written ? { written } : {}),
    book: `what ${who} found out`,
    lede: `It is ${world.date()}. You are at ${status.location}.`,
    stats: [
      [journal.places.length, 'place', 'places'],
      [journal.people.length, 'person', 'people'],
      [journal.quests.length, 'quest', 'quests'],
      [journal.lore.length + journal.events.length, 'story', 'stories'],
    ],
    people: met,
    figures: (key) => {
      const tiles = /^unknown-(\d+)$/.exec(key)
      if (tiles) return unknownTiles(Number(tiles[1]))
      if (key === 'portraits') {
        const faces = met.map((id) => ({ npc: world.content.npcs.get(id)!, src: pictures(id) })).filter((f) => f.npc)
        const strangers = [...world.content.npcs.values()].filter((n) => (world.state.player.journal ?? {})[n.id] === undefined).length
        return `<div class="gallery">${faces.map((f) => (f.src ? `<figure><img src="${f.src}" alt="" loading="lazy"><figcaption>${escapeHtml(f.npc.name)}<small>${escapeHtml(f.npc.short)}</small></figcaption></figure>` : `<figure class="unknown"><div class="q">${escapeHtml(f.npc.name.charAt(0))}</div><figcaption>${escapeHtml(f.npc.name)}<small>${escapeHtml(f.npc.short)}</small></figcaption></figure>`)).join('')}${unknownFigures(strangers)}</div>`
      }
      if (key !== 'seen') return undefined
      const data = hexMapData(world, { whole: true })
      return data ? hexMapSvg(seenWindow(data), palette, `The land ${who} has seen`) : ''
    },
  })
}
