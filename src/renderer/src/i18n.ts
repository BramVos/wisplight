// The words of the interface (M9.4, FO chapter 18: all texts outside the
// code, though version 1 is only English). Each language is a folder under
// locales/ with a JSON file per part of the interface: locales/en/settings.json
// holds the keys that start with "settings.". A missing word falls back to
// English, and a missing key shows as the key itself, so it is seen at once.
// The texts of the game itself (rooms, people, what happens) come from the
// world's content and the engine, not from here.

type Words = { [key: string]: string | Words }

const files = import.meta.glob<{ default: Words }>('./locales/*/*.json', { eager: true })

const languages: Record<string, Record<string, Words>> = {}
for (const [path, module] of Object.entries(files)) {
  const [, language, part] = /\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(path) ?? []
  if (language && part) (languages[language] ??= {})[part] = module.default
}

let language = 'en'

/** The language of the interface; English until another is chosen. */
export function setLanguage(next: string): void {
  if (languages[next]) language = next
}

function lookup(lang: string, key: string): string | undefined {
  const [part, ...path] = key.split('.')
  let node: string | Words | undefined = languages[lang]?.[part ?? '']
  for (const step of path) node = typeof node === 'object' ? node[step] : undefined
  return typeof node === 'string' ? node : undefined
}

/** The words for a key, with {name} places filled in. */
export function t(key: string, values: Record<string, string | number> = {}): string {
  const text = lookup(language, key) ?? lookup('en', key) ?? key
  return text.replace(/\{(\w+)\}/g, (all, name: string) => (name in values ? String(values[name]) : all))
}

/** The words for a number of things: the key's "one" or "other". */
export function tn(key: string, count: number, values: Record<string, string | number> = {}): string {
  return t(`${key}.${count === 1 ? 'one' : 'other'}`, { count, ...values })
}

/** Whether a key has words in English: for the check that no key is missing. */
export function hasWords(key: string): boolean {
  return lookup('en', key) !== undefined
}
