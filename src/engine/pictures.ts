import type { Content } from './content'

// Pictures of places and people (after the M7 playtest). The engine only says
// what a picture shows: the description from the content, in the one style of
// the world. Making it is the job of an image model through the AI gateway,
// once per subject; the picture is kept and shown again. A changed description
// gives a new key, so the builder's edits get a new picture.
//
// Places share one picture per area: the quay, the green and the bakery all
// show Veenhoek. Everyone with a name has a portrait of their own; someone
// generic (portrait: generic in the content) gets a plain figure without a
// face, which costs nothing.

export interface PictureSubject {
  id: string
  kind: 'person' | 'place'
  name: string
  prompt: string
  /** Changes when what the picture shows changes. */
  key: string
  /** A plain figure instead of a picture from the model. */
  plain?: string
}

const STYLE = 'A small illustration in the manner of a 17th-century Dutch etching with a light ink wash: muted greys, browns and greens, fine lines.'
const RULES = 'No text, no letters, no border, no frame. Nothing gory. Folklore, not photography.'
const KIND: Record<string, string> = { city: 'a walled city with its charter', town: 'a small walled town', village: 'a village', hamlet: 'a hamlet', inn: 'an inn by the road', route: 'a road across the land', wilderness: 'wild country' }

export function pictureSubject(content: Content, id: string): PictureSubject | undefined {
  const style = content.world.pictures?.style ?? STYLE
  const npc = content.npcs.get(id)
  if (npc) {
    if (npc.portrait === 'generic') return { id, kind: 'person', name: npc.name, prompt: '', key: 'plain', plain: plainFigure(npc.pronoun) }
    const job = content.professions.get(npc.profession)?.name ?? npc.profession
    const prompt = `${style} A portrait, head and shoulders, of ${npc.name}, ${npc.age}, ${job}. ${npc.appearance} ${RULES}`
    return { id, kind: 'person', name: npc.name, prompt, key: hash(prompt) }
  }
  // A place, an area, or the topic an area is known by: the picture of its area.
  const areaId = content.locations.get(id)?.area ?? (id.startsWith('area_') ? id.slice(5) : [...content.areas.values()].find((a) => a.topic === id)?.id)
  const area = areaId ? content.areas.get(areaId) : undefined
  if (!area) return undefined
  const places = [...content.locations.values()].filter((l) => l.area === area.id)
  const first = places.find((l) => l.tags.includes('edge')) ?? places[0]
  const prompt = `${style} A view of ${area.name}, ${KIND[area.kind] ?? 'a place'} in a low, wet land: ${clean(area.summary)} ${first ? clean(first.description.day) : ''} ${RULES}`
  return { id: `area_${area.id}`, kind: 'place', name: area.name, prompt, key: hash(prompt) }
}

/** Descriptions without the topic brackets, the exits and the hard line breaks. */
function clean(text: string): string {
  return text.replace(/\[([^\]]+)\]/g, '$1').replace(/\s+/g, ' ').trim()
}

/** A plain figure, head and shoulders, without a face: a woman, a man, or neither. */
export function plainFigure(pronoun: string | undefined): string {
  const hair = pronoun === 'she' ? '<path d="M28 44c0-16 10-26 22-26s22 10 22 26c0 10-4 18-6 22H34c-2-4-6-12-6-22z" fill="#3a382e"/>' : pronoun === 'he' ? '<path d="M33 38c0-12 8-19 17-19s17 7 17 19c-4-5-10-7-17-7s-13 2-17 7z" fill="#3a382e"/>' : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#22231c"/>${hair}<ellipse cx="50" cy="42" rx="15" ry="18" fill="#6b6857"/><path d="M18 100c2-22 16-32 32-32s30 10 32 32z" fill="#55533f"/></svg>`
  return `data:image/svg+xml;base64,${toBase64(svg)}`
}

function toBase64(text: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes = Array.from(new TextEncoder().encode(text))
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i]!, bytes[i + 1], bytes[i + 2]]
    const n = (a << 16) | (b << 8) | c
    out += alphabet[(n >> 18) & 63]! + alphabet[(n >> 12) & 63]! + (i + 1 < bytes.length ? alphabet[(n >> 6) & 63]! : '=') + (i + 2 < bytes.length ? alphabet[n & 63]! : '=')
  }
  return out
}

/** A short, stable fingerprint (FNV-1a), enough to tell descriptions apart. */
export function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
