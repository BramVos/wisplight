import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parseDocument, stringify } from 'yaml'
import { loadContent, type Content, type ContentFile } from '../engine'
import { CONTENT_LISTS, grownLists, plainEntity } from '../engine/contentfiles'
import { readContentFiles } from './content'
import { writeWorldBook } from './worldbook'

// A copy of a world with the regions the played proof grew in it (M10.25, Bram:
// "leave the new generated pieces in a copy of the world so I can see what is
// generated, number them", and one copy may hold them all). content/<world>_proofs/
// is the world's own folder copied once, with a name of its own. Each
// region a proof grew goes in grown/<n>-<slug>/, as the lists the content has,
// numbered in the order they grew over every copy; its area carries the number,
// and PROOFS.md says what each one is. The copies stay out of git and out of
// the installers (.gitignore, electron-builder.yml).

export interface ProofRegion {
  /** The region's name. */
  name: string
  /** What the proof was: where, at which setting, with which model, what it cost. */
  lines: string[]
}

export interface KeptRegion {
  folder: string
  n: number
  kept: number
  /** Things this copy has already from an earlier region, by kind and id. */
  already: string[]
  /** Why the copy did not load with them; then they are kept aside as .yaml.off. */
  problems: string[]
}

export const proofFolder = (world: string) => `${world}_proofs`

/** How many of a list, in words: 8 places, 1 person. */
function counted(key: string, count: number): string {
  const nouns: Record<string, [string, string]> = { locations: ['place', 'places'], npcs: ['person', 'people'], aftermath: ['aftermath', 'aftermath'], news: ['piece of news', 'pieces of news'] }
  const [one, many] = nouns[key] ?? [key.replace(/_/g, ' ').replace(/s$/, ''), key.replace(/_/g, ' ')]
  return `${count} ${count === 1 ? one : many}`
}

const slugOf = (name: string) => name.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'region'

/** The next number, over every copy: the regions are numbered in the order they grew, in whichever world. */
export function nextProof(root: string): number {
  let most = 0
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const grown = join(root, entry.name, 'grown')
    if (!entry.isDirectory() || !entry.name.endsWith('_proofs') || !existsSync(grown)) continue
    for (const dir of readdirSync(grown)) most = Math.max(most, Number(dir.split('-')[0]) || 0)
  }
  return most + 1
}

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text, 'utf8')
}

/** The world's own folder copied once, its world.yaml with a name and id of its own and its lock on the new paths. */
async function copyOnce(root: string, world: string): Promise<string> {
  const folder = proofFolder(world)
  if (existsSync(join(root, folder, 'world.yaml'))) return folder
  for (const file of await readContentFiles(root, world)) {
    // The shared instruction stays at the root of the content, where every world reads it.
    if (!file.path.startsWith(`${world}/`)) continue
    const path = file.path.slice(world.length + 1)
    let text = file.text
    if (path === 'world.yaml') {
      // A name of its own, but the world's id: the home land goes by it (world.reach, an area's blend).
      const doc = parseDocument(text)
      doc.setIn(['world', 'name'], `${String(doc.getIn(['world', 'name']))}, with the proof regions`)
      text = doc.toString({ lineWidth: 0 })
    }
    if (path === 'ids.lock') text = text.replaceAll(`${world}/`, `${folder}/`)
    write(join(root, folder, path), text)
  }
  write(join(root, folder, 'PROOFS.md'), `# The regions the played proof grew\n\nA copy of \`content/${world}\` with every region the played proof of M10.25 grew in it, numbered in the order they grew. Each one is in \`grown/<number>-<name>/\`, and its area carries the number in the editor. A thing an earlier region grew already (the stranger's first lore, say) is kept once. It keeps the world's id, so its pictures are the world's, and a game saved in it opens in the world itself. Not in git and not in an installer; throw the folder away when you have seen it.\n`)
  return folder
}

/** Keeps what a game grew that its world does not have in the copy of that world, as the next numbered region. */
export async function keepRegion(root: string, world: string, base: Content, grown: Content, region: ProofRegion): Promise<KeptRegion> {
  const folder = await copyOnce(root, world)
  const n = nextProof(root)
  const now = await readContentFiles(root, folder)
  const have = loadContent(now)
  const dir = `${folder}/grown/${n}-${slugOf(region.name)}`
  const add: ContentFile[] = []
  const already: string[] = []
  const counts: string[] = []
  // A region stands on its own in the copy: the ways between it and the world are cut, since the world's
  // side of them is a change to a place of the world, and every region of the proofs came in at the same edge.
  const cut: string[] = []
  const alone = (data: Record<string, unknown>): Record<string, unknown> => {
    const exits = (data['exits'] ?? {}) as Record<string, { to: string }>
    const kept = Object.fromEntries(Object.entries(exits).filter(([dir, exit]) => {
      const out = base.locations.has(exit.to)
      if (out) cut.push(`${String(data['id'])} ${dir} to ${exit.to}`)
      return !out
    }))
    return { ...data, exits: kept }
  }
  // The same world and seed chart the same region again (the Driestromen at story and at full): an area the copy
  // has already goes by its number, in its own id and in every id and reference that carries it.
  const lists = grownLists(base, grown)
  const again = (lists.find(([key]) => key === 'areas')?.[1] ?? []).map((a) => a.id).filter((id) => have.areas.has(id))
  const renamed = (data: Record<string, unknown>): Record<string, unknown> =>
    again.length ? (JSON.parse(again.reduce((text, id) => text.replace(new RegExp(`(?<![a-z0-9])${id}(?![a-z0-9])`, 'g'), `${id}${n}`), JSON.stringify(data))) as Record<string, unknown>) : data
  for (const [key, list] of lists) {
    const name = CONTENT_LISTS.find(([k]) => k === key)![1]
    const had = have[name] as Map<string, unknown>
    const all = list.map((e) => renamed(plainEntity(e)))
    const fresh = all.filter((data) => !had.has(String(data['id']))).map((data) => {
      // The area carries the number, so the editor says which region a place is of.
      if (key === 'areas') return { ...data, name: `${n}. ${String(data['name'])}` }
      return key === 'locations' ? alone(data) : data
    })
    already.push(...all.filter((data) => had.has(String(data['id']))).map((data) => `${key} ${String(data['id'])}`))
    if (!fresh.length) continue
    add.push({ path: `${dir}/${key}.yaml`, text: stringify({ [key]: fresh }, { lineWidth: 0 }) })
    counts.push(counted(key, fresh.length))
  }
  for (const land of grown.lands.values()) {
    if (base.lands.has(land.id) || have.lands.has(land.id)) continue
    const { voice, ...own } = land
    add.push({ path: `${folder}/lands/${land.id}/land.yaml`, text: stringify({ land: plainEntity(own) }, { lineWidth: 0 }) })
    if (voice) add.push({ path: `${folder}/lands/${land.id}/voice.yaml`, text: stringify({ voice: plainEntity(voice) }, { lineWidth: 0 }) })
    counts.push(`the land ${land.name}`)
  }
  let problems: string[] = []
  try {
    loadContent([...now, ...add])
  } catch (error) {
    problems = (error as { problems?: string[] }).problems ?? [error instanceof Error ? error.message : String(error)]
  }
  // What does not load is kept aside where the loader does not look, to read all the same.
  for (const file of add) write(join(root, problems.length ? `${file.path}.off` : file.path), file.text)
  const kept = add.length
  const section = [
    '',
    `## ${n}. ${region.name}`,
    '',
    ...region.lines,
    '',
    `In \`grown/${dir.split('/grown/')[1]}/\`: ${counts.join(', ') || 'nothing new'}.`,
    ...(again.length ? [`The copy had ${again.join(', ')} from an earlier region, so this one's ids carry its number: ${again.map((id) => `${id}${n}`).join(', ')}.`] : []),
    ...(cut.length ? [`In the game it joined the world by ${cut.join('; ')}. Here it stands on its own: open it in the editor, or walk it with \`@goto ${cut[0]!.split(' ')[0]}\`.`] : []),
    ...(already.length ? [`Kept once, from an earlier region: ${already.join(', ')}.`] : []),
    ...(problems.length ? ['', 'The copy did not load with it, so its files end in .off:', ...problems.slice(0, 10).map((p) => `- ${p}`)] : []),
  ]
  writeFileSync(join(root, folder, 'PROOFS.md'), `${readFileSync(join(root, folder, 'PROOFS.md'), 'utf8').trimEnd()}\n${section.join('\n')}\n`, 'utf8')
  if (!problems.length) await writeWorldBook(root, folder)
  return { folder, n, kept, already, problems }
}
