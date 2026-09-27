/** Groups a row of map characters into runs of the same colour. */
export function runs(row: string, classes: string): [string, string][] {
  const out: [string, string][] = []
  for (let i = 0; i < row.length; i++) {
    const cls = classes[i] ?? 'u'
    const last = out.at(-1)
    if (last && last[1] === cls) last[0] += row[i]
    else out.push([row[i]!, cls])
  }
  return out
}
