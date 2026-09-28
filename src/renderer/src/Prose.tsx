import { Fragment, type ReactNode } from 'react'

// A model's explanation as text to read (M10.20; found building The Quiet
// Reach: the chronicler writes bold and lists, and the editor showed the
// stars and dashes in one block). The little Markdown a model uses:
// paragraphs, bold, italics, code, and lists, one level of nesting. Built as
// React elements, never as HTML, so nothing in the text can become markup.

/** Bold, italics and code within a line. */
export function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|(?<![\w*])\*([^*\s][^*]*?)\*(?![\w*])|(?<![\w_])_([^_\s][^_]*?)_(?![\w_])/g
  let last = 0
  let key = 0
  for (const m of text.matchAll(pattern)) {
    if (m.index! > last) out.push(text.slice(last, m.index))
    if (m[1] !== undefined) out.push(<strong key={key++}>{m[1]}</strong>)
    else if (m[2] !== undefined) out.push(<code key={key++}>{m[2]}</code>)
    else out.push(<em key={key++}>{m[3] ?? m[4]}</em>)
    last = m.index! + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type Block = { kind: 'p'; text: string } | { kind: 'ul' | 'ol'; items: { text: string; sub: string[] }[] }

const ITEM = /^(\s*)(?:[-*•]|\d+[.)])\s+(.*)$/

/** The blocks of a text: paragraphs, and lists with their nested items. */
export function blocks(text: string): Block[] {
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length) out.push({ kind: 'p', text: para.join(' ') })
    para = []
  }
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trimEnd()
    const item = ITEM.exec(line)
    if (!line.trim()) {
      flush()
      continue
    }
    if (item) {
      flush()
      const nested = item[1]!.length >= 2
      const ordered = /^\s*\d/.test(line)
      const list = out.at(-1)
      if (nested && list && list.kind !== 'p' && list.items.length) list.items.at(-1)!.sub.push(item[2]!)
      else if (list && list.kind === (ordered ? 'ol' : 'ul')) list.items.push({ text: item[2]!, sub: [] })
      else out.push({ kind: ordered ? 'ol' : 'ul', items: [{ text: item[2]!, sub: [] }] })
      continue
    }
    // A line that goes on from a list item belongs to it.
    const list = out.at(-1)
    if (!para.length && list && list.kind !== 'p' && /^\s{2,}/.test(raw)) {
      const last = list.items.at(-1)!
      last.text = `${last.text} ${line.trim()}`
      continue
    }
    para.push(line.trim())
  }
  flush()
  return out
}

/** A text with paragraphs, bold and lists, as it reads. */
export function Prose({ text, className }: { text: string; className?: string }) {
  return (
    <div className={`prose${className ? ` ${className}` : ''}`}>
      {blocks(text).map((b, i) =>
        b.kind === 'p' ? (
          <p key={i}>{inline(b.text)}</p>
        ) : (
          <Fragment key={i}>
            {(() => {
              const List = b.kind
              return (
                <List>
                  {b.items.map((item, j) => (
                    <li key={j}>
                      {inline(item.text)}
                      {item.sub.length > 0 && (
                        <ul>
                          {item.sub.map((s, k) => (
                            <li key={k}>{inline(s)}</li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </List>
              )
            })()}
          </Fragment>
        ),
      )}
    </div>
  )
}
