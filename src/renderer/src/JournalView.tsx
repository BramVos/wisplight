import { useEffect, useMemo, useRef, useState } from 'react'
import type { EngineClient, JournalPage, Reply } from './client'

// The journal as its own window (FO, chapter 2): everything the player has
// learnt, in parts and under headings, searchable, with the page of what you
// pick beside it. The clock stands still while it is open.

type Journal = Reply['status']['journal']

const PARTS: { key: keyof Journal; title: string }[] = [
  { key: 'quests', title: 'Quests' },
  { key: 'people', title: 'People' },
  { key: 'places', title: 'Places' },
  { key: 'lands', title: 'Lands' },
  { key: 'factions', title: 'Factions' },
  { key: 'events', title: 'Events' },
  { key: 'lore', title: 'Lore' },
  { key: 'things', title: 'Things' },
]

const YOU = [
  { id: 'sheet', name: 'Your character' },
  { id: 'map', name: 'The whole map' },
  { id: 'party', name: 'Your companions' },
  { id: 'lands', name: 'How the lands stand' },
]

export function JournalView({
  client,
  journal,
  start,
  talkingTo,
  onAsk,
  onClose,
}: {
  client: EngineClient
  journal: Journal
  start?: string
  talkingTo?: string
  onAsk: (topic: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<JournalPage>()
  const [part, setPart] = useState<keyof Journal | 'you' | 'all'>('all')
  const searchRef = useRef<HTMLInputElement>(null)
  const pageRef = useRef<HTMLElement>(null)

  const open = async (id: string) => {
    setPage((await client.page(id)) ?? undefined)
    // On a narrow screen the page is under the index: bring it into view.
    if (window.innerWidth <= 760) requestAnimationFrame(() => pageRef.current?.scrollIntoView({ block: 'start' }))
  }

  useEffect(() => {
    if (start) void open(start)
    else searchRef.current?.focus()
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // Only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const words = query.trim().toLowerCase()
  const matches = (name: string, group?: string) => !words || name.toLowerCase().includes(words) || Boolean(group?.toLowerCase().includes(words))

  // Each part, its entries under their headings, after the search.
  const shown = useMemo(
    () =>
      PARTS.filter(({ key }) => part === 'all' || part === key)
        .map(({ key, title }) => {
          const groups: { group: string; entries: { id: string; name: string }[] }[] = []
          // Searching for a part by its name ("lands", "people") shows all of it.
          const whole = Boolean(words) && title.toLowerCase().includes(words)
          for (const e of journal[key]) {
            if (!whole && !matches(e.name, e.group)) continue
            const group = e.group ?? ''
            const last = groups.at(-1)
            if (last && last.group === group) last.entries.push(e)
            else groups.push({ group, entries: [e] })
          }
          return { key, title, groups, count: groups.reduce((n, g) => n + g.entries.length, 0) }
        })
        .filter((p) => p.count > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [journal, words, part],
  )
  const you = YOU.filter((e) => (part === 'all' || part === 'you') && matches(e.name))
  const total = PARTS.reduce((n, { key }) => n + journal[key].length, 0)

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Journal">
      <div className="panel journal">
        <header className="panel-head">
          <h2>Journal</h2>
          <input
            ref={searchRef}
            className="journal-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`search ${total} entries`}
            aria-label="Search the journal"
            spellCheck={false}
          />
          <span className="muted small still">time stands still</span>
          <button type="button" className="link" onClick={onClose}>
            [Close]
          </button>
        </header>
        <nav className="tabs journal-parts" aria-label="Parts of the journal">
          {[{ key: 'all', title: 'All' }, ...PARTS.filter(({ key }) => journal[key].length > 0), { key: 'you', title: 'You' }].map(({ key, title }) => (
            <button key={key} type="button" className={part === key ? 'active' : ''} onClick={() => setPart(key as typeof part)}>
              {title}
            </button>
          ))}
        </nav>
        <div className="journal-body">
          <div className="journal-index">
            {shown.length === 0 && you.length === 0 && <p className="muted">{words ? `Nothing in your journal matches "${query.trim()}".` : 'Topics you learn appear here.'}</p>}
            {shown.map((p) => (
              <section key={p.key} className="journal-part">
                <h3>
                  {p.title} <span className="muted small">{p.count}</span>
                </h3>
                {p.groups.map((g) => (
                  <div key={`${p.key}:${g.group}`} className="journal-group">
                    {g.group && <h4>{g.group}</h4>}
                    <ul>
                      {g.entries.map((e) => (
                        <li key={e.id}>
                          <button type="button" className={`topic${page?.id === e.id ? ' current' : ''}`} onClick={() => void open(e.id)}>
                            {e.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
            {you.length > 0 && (
              <section className="journal-part">
                <h3>You</h3>
                <ul>
                  {you.map((e) => (
                    <li key={e.id}>
                      <button type="button" className={`topic${page?.id === e.id ? ' current' : ''}`} onClick={() => void open(e.id)}>
                        {e.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
          <article className="journal-page" aria-live="polite" ref={pageRef}>
            {!page ? (
              <p className="muted">Pick something on the left to read what you know about it.</p>
            ) : (
              <>
                <h3>{page.name}</h3>
                {page.kind === 'map' || page.kind === 'sheet' ? (
                  <pre className={page.kind === 'map' ? 'map whole' : 'sheet'}>{page.lines.join('\n')}</pre>
                ) : (
                  page.lines.map((line, index) => <p key={index}>{line}</p>)
                )}
                {page.sources.length > 0 && <p className="muted small">Heard from: {page.sources.join('; ')}</p>}
                {page.links.length > 0 && (
                  <ul className="journal-links">
                    {page.links.map((l) => (
                      <li key={l.id}>
                        <span className="muted">{l.label}: </span>
                        <button type="button" className="topic" onClick={() => void open(l.id)}>
                          {l.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {talkingTo && page.kind !== 'map' && page.kind !== 'sheet' && (
                  <button type="button" className="link" onClick={() => onAsk(page.name)}>
                    [Ask {talkingTo} about this]
                  </button>
                )}
              </>
            )}
          </article>
        </div>
      </div>
    </div>
  )
}
