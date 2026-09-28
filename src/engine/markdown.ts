// Markdown to HTML (M10.18), for the world book and the chronicle of a game:
// the little the books use (headings, paragraphs, lists, tables, code blocks,
// bold, italics and code), everything else escaped. A comment marks where a
// picture goes; the caller says what it is.

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inline(text: string): string {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
}

/** A Markdown text as HTML; a line "<!-- picture:x -->" becomes what picture(x) gives, or nothing. */
export function markdownHtml(markdown: string, picture: (key: string) => string | undefined = () => undefined): string {
  const lines = markdown.split('\n')
  const out: string[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    const marker = /^<!-- picture:([^ ]+) -->$/.exec(line.trim())
    if (marker) {
      const html = picture(marker[1]!)
      if (html) out.push(html)
      i++
    } else if (line.startsWith('```')) {
      const body: string[] = []
      for (i++; i < lines.length && !lines[i]!.startsWith('```'); i++) body.push(lines[i]!)
      out.push(`<pre>${escape(body.join('\n'))}</pre>`)
      i++
    } else if (/^#{1,4} /.test(line)) {
      const level = line.indexOf(' ')
      out.push(`<h${level}>${inline(line.slice(level + 1))}</h${level}>`)
      i++
    } else if (line.startsWith('|')) {
      const rows: string[][] = []
      for (; i < lines.length && lines[i]!.startsWith('|'); i++) if (!/^\|\s*---/.test(lines[i]!)) rows.push(lines[i]!.slice(1, -1).split(' | ').map((c) => c.trim()))
      const [head, ...body] = rows
      out.push(`<table><thead><tr>${head!.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`)
    } else if (line.startsWith('- ')) {
      const items: string[] = []
      for (; i < lines.length && lines[i]!.startsWith('- '); i++) items.push(`<li>${inline(lines[i]!.slice(2))}</li>`)
      out.push(`<ul>${items.join('')}</ul>`)
    } else if (line.trim()) {
      const para: string[] = []
      for (; i < lines.length && lines[i]!.trim() && !/^(#{1,4} |- |\||```|<!--)/.test(lines[i]!); i++) para.push(lines[i]!)
      out.push(`<p>${inline(para.join(' '))}</p>`)
    } else i++
  }
  return out.join('\n')
}

/** A whole page: a title, a quiet style that prints well, and the book. */
export function htmlPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>
body { font-family: Georgia, 'Times New Roman', serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; color: #222; background: #fdfcf8; }
h1, h2, h3 { font-weight: normal; } h2 { margin-top: 2.5rem; border-bottom: 1px solid #ccc; }
table { border-collapse: collapse; width: 100%; margin: 1rem 0; font-size: 0.9rem; } th, td { border: 1px solid #ddd; padding: 0.3rem 0.5rem; text-align: left; vertical-align: top; }
pre { white-space: pre-wrap; background: #f3f1ea; padding: 0.8rem; font-size: 0.85rem; }
figure { margin: 1rem 0; } figure img { max-width: 100%; } figure.portraits { display: flex; flex-wrap: wrap; gap: 0.8rem; } figure.portraits div { width: 8rem; font-size: 0.8rem; text-align: center; } figure.portraits img { width: 8rem; }
</style></head><body>
${body}
</body></html>
`
}
