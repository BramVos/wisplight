import { stringify } from 'yaml'
import type { Content, ContentFile } from './content'

// The content of a game written out as files again (M10.25): a region built
// in full in play runs the world build's own steps (worldStepRequest), and
// those read and check files as the editor has them. What loaded once loads
// again: every schema reads what it wrote (its one change of form, prose
// joined into lines, gives the same when done twice).

/** The lists of the content, by the key their files use and the name the content gives them. */
export const CONTENT_LISTS: readonly (readonly [string, keyof Content])[] = [
  ['items', 'items'],
  ['object_types', 'objectTypes'],
  ['professions', 'professions'],
  ['areas', 'areas'],
  ['locations', 'locations'],
  ['npcs', 'npcs'],
  ['topics', 'topics'],
  ['news', 'news'],
  ['patterns', 'patterns'],
  ['quests', 'quests'],
  ['regions', 'regions'],
  ['passages', 'passages'],
  ['gestures', 'gestures'],
  ['lodgings', 'lodgings'],
  ['factions', 'factions'],
  ['realms', 'realms'],
  ['plans', 'plans'],
  ['tides', 'tides'],
  ['watchers', 'watchers'],
  ['aftermath', 'aftermath'],
  ['intentions', 'intentions'],
  ['verbs', 'verbTexts'],
  ['creatures', 'creatures'],
  ['encounters', 'encounters'],
  ['settlements', 'settlements'],
  ['resources', 'resources'],
  ['routes', 'routes'],
  ['outlands', 'outlands'],
  ['newcomers', 'newcomers'],
  ['projects', 'projects'],
  ['crafts', 'crafts'],
  ['props', 'props'],
]

/** A value as the files hold it: plain data, without what is undefined. */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null))
}

const yaml = (data: Record<string, unknown>) => stringify(plain(data), { lineWidth: 0 })

/** The content as a folder of files under `prefix` (default game/): one file a list, the world, the rules, the lands. */
export function contentFilesOf(content: Content, prefix = 'game/'): ContentFile[] {
  const files: ContentFile[] = [{ path: `${prefix}world.yaml`, text: yaml({ world: content.world }) }]
  if (content.chronicler) files.push({ path: `${prefix}CHRONICLER.md`, text: content.chronicler })
  if (content.rules) files.push({ path: `${prefix}rules/rules.yaml`, text: yaml({ rules: content.rules }) })
  if (content.voice) files.push({ path: `${prefix}data/voice.yaml`, text: yaml({ voice: content.voice }) })
  if (content.journey) files.push({ path: `${prefix}data/journey.yaml`, text: yaml({ journey: content.journey }) })
  if (content.returning) files.push({ path: `${prefix}data/returning.yaml`, text: yaml({ returning: content.returning }) })
  if (content.tensions.length) files.push({ path: `${prefix}data/tensions.yaml`, text: yaml({ tensions: content.tensions }) })
  if (content.lock) files.push({ path: `${prefix}ids.lock`, text: yaml(content.lock as unknown as Record<string, unknown>) })
  for (const land of content.lands.values()) {
    const { voice, ...own } = land
    files.push({ path: `${prefix}lands/${land.id}/land.yaml`, text: yaml({ land: own }) })
    if (voice) files.push({ path: `${prefix}lands/${land.id}/voice.yaml`, text: yaml({ voice }) })
  }
  for (const [key, name] of CONTENT_LISTS) {
    const list = [...(content[name] as Map<string, unknown>).values()]
    if (list.length) files.push({ path: `${prefix}data/${key}.yaml`, text: yaml({ [key]: list }) })
  }
  return files
}
