import { useEffect, useMemo, useRef, useState } from 'react'
import type { EngineClient, JournalPage, Reply } from './client'
import { SheetView } from './SheetView'
import { runs } from './mapRuns'

// The journal as its own window (FO, chapter 2): everything the player has
// learnt, in parts and under headings, searchable, with the page of what you
// pick beside it. The clock stands still while it is open. Opened from a
// conversation it shows what lies within 15 km first; the rest is a search or
// a click away.

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

const NEAR_KM = 15

export function JournalView({
  client,
  journal,
  start,
  talkingTo,
  nearby = false,
  onAsk,
  onClose,
}: {
  client: EngineClient
  journal: Journal
  start?: string
  talkingTo?: string
  /** Only what lies within 15 km, until the player searches or asks for the rest. */
  nearby?: boolean
  onAsk: (topic: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<JournalPage>()
  const [part, setPart] = useState<keyof Journal | 'you' | 'all'>('all')
  const [onlyNear, setOnlyNear] = useState(nearby)
  const [picture, setPicture] = useState<string>()
  const searchRef = useRef<HTMLInputElement>(null)
  const pageRef = useRef<HTMLElement>(null)

  const open = async (id: string) => {
    const next = (await client.page(id)) ?? undefined
    setPage(next)
    setPicture(undefined)
    // A picture of a person or a place, when pictures are on (it may take a while the first time).
    if (next && (next.kind === 'person' || next.kind === 'place' || next.kind === 'area') && client.picture) {
      void client.picture(id).then((url) => setPicture((current) => (current === undefined ? url : current)))
    }
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
          const groups: { group: string; entries: { id: string; name: string; km?: number }[] }[] = []
          // Searching for a part by its name ("lands", "people") shows all of it.
          const whole = Boolean(words) && title.toLowerCase().includes(words)
          for (const e of journal[key]) {
            if (!whole && !matches(e.name, e.group)) continue
            // Near only: quests always, the rest when it has a place within 15 km.
            if (onlyNear && !words && key !== 'quests' && (e.km === undefined || e.km > NEAR_KM)) continue
            const group = e.group ?? ''
            const last = groups.at(-1)
            if (last && last.group === group) last.entries.push(e)
            else groups.push({ group, entries: [e] })
          }
          return { key, title, groups, count: groups.reduce((n, g) => n + g.entries.length, 0) }
        })
        .filter((p) => p.count > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [journal, words, part, onlyNear],
  )
  const you = YOU.filter((e) => (part === 'all' || part === 'you') && matches(e.name))
  const total = PARTS.reduce((n, { key }) => n + journal[key].length, 0)
  const listed = shown.reduce((n, p) => n + p.count, 0)

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
            {nearby && !words && (
              <p className="small">
                {onlyNear ? (
                  <>
                    <span className="muted">What lies within {NEAR_KM} km. </span>
                    <button type="button" className="link" onClick={() => setOnlyNear(false)}>
                      [Everything, {total - listed} more]
                    </button>
                  </>
                ) : (
                  <button type="button" className="link" onClick={() => setOnlyNear(true)}>
                    [Only what is near]
                  </button>
                )}
              </p>
            )}
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
                          {e.km !== undefined && <span className="muted small"> {e.km < 1 ? '< 1 km' : `${Math.round(e.km)} km`}</span>}
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
                {picture && <img className="page-picture" src={picture} alt={`${page.name}, as the chronicle pictures it`} />}
                {page.map && (
                  <pre className="map page-map" aria-label={`Where ${page.name} is: the star`}>
                    {page.map.rows.map((row, y) => (
                      <div key={y}>
                        {runs(row, page.map!.classes[y] ?? '').map(([t, cls], i) => (
                          <span key={i} className={`m-${cls === '@' ? 'you' : cls}`}>
                            {t}
                          </span>
                        ))}
                      </div>
                    ))}
                  </pre>
                )}
                {page.sheet ? (
                  <SheetView sheet={page.sheet} />
                ) : page.kind === 'map' || page.kind === 'sheet' ? (
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
