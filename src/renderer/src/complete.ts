// Tab completes (M10.29 K): the last word of what is typed, from the names
// the engine gives (status.completions): the journal's, who and what is here,
// the ways out, the pack.

/** The most names a line of choices shows. */
const MOST = 12

/**
 * The input with its last word completed: the longest tail, from the start of
 * a word, that starts a name or a word in a name ("talk to mar" finds "Mara
 * Venn", "l ter" finds "terminal" of the pocket terminal). One name is written
 * out with a space after; several are completed as far as they agree, and
 * given to choose from.
 */
export function complete(input: string, names: readonly string[]): { text: string; options: string[] } {
  const starts = [...input.matchAll(/(?:^|\s)(?=\S)/g)].map((m) => m.index + (/^\s/.test(m[0]) ? 1 : 0))
  for (const start of starts) {
    const tail = input.slice(start).toLowerCase()
    const fits = fitting(tail, names)
    if (!fits.length) continue
    const before = input.slice(0, start)
    if (fits.length === 1) return { text: `${before}${fits[0]} `, options: [] }
    const agreed = fits.reduce((common, name) => {
      let i = 0
      while (i < common.length && i < name.length && common[i]!.toLowerCase() === name[i]!.toLowerCase()) i++
      return common.slice(0, i)
    })
    return { text: agreed.length > tail.length ? `${before}${agreed}` : input, options: fits.slice(0, MOST) }
  }
  return { text: input, options: [] }
}

/** The names, or their rest from a word on, that start with the words typed; each once, shortest first. */
function fitting(tail: string, names: readonly string[]): string[] {
  const seen = new Set<string>()
  const fits: string[] = []
  for (const name of names) {
    for (const m of name.matchAll(/(?:^|\s)(?=\S)/g)) {
      const rest = name.slice(m.index + (/^\s/.test(m[0]) ? 1 : 0))
      if (!rest.toLowerCase().startsWith(tail) || seen.has(rest.toLowerCase())) continue
      seen.add(rest.toLowerCase())
      fits.push(rest)
      break
    }
  }
  return fits.sort((a, b) => a.length - b.length || a.localeCompare(b))
}
