import { useEffect, useMemo, useRef, useState } from 'react'
import type { EngineClient, JournalPage, Reply } from './client'
import { SheetView } from './SheetView'
import { HexMap, LandMap } from './HexMap'
import { useMapLook } from './display'
import { runs } from './mapRuns'
import { t, tn } from './i18n'

// The journal as its own window (FO, chapter 2): everything the player has
// learnt, in parts and under headings, searchable, with the page of what you
// pick beside it. The clock stands still while it is open. Opened from a
// conversation it shows what lies within 15 km first; the rest is a search or
// a click away.

type Journal = Reply['status']['journal']

const journalParts = (): { key: keyof Journal; title: string }[] => [
  { key: 'quests', title: t('journal.parts.quests') },
  { key: 'people', title: t('journal.parts.people') },
  { key: 'places', title: t('journal.parts.places') },
  { key: 'lands', title: t('journal.parts.lands') },
  { key: 'factions', title: t('journal.parts.factions') },
  { key: 'events', title: t('journal.parts.events') },
  { key: 'lore', title: t('journal.parts.lore') },
  { key: 'things', title: t('journal.parts.things') },
]

const yours = () => [
  // Why you are here (M10.29 C): the intro, the reason, whom to ask for.
  { id: 'why', name: t('journal.you.why') },
  { id: 'sheet', name: t('journal.you.sheet') },
  { id: 'map', name: t('journal.you.map') },
  { id: 'land', name: t('journal.you.land') },
  { id: 'tides', name: t('journal.you.tides') },
  { id: 'waiting', name: t('journal.you.waiting') },
  { id: 'wishes', name: t('journal.you.wishes') },
  { id: 'lodging', name: t('journal.you.lodging') },
  { id: 'party', name: t('journal.you.party') },
  { id: 'promises', name: t('journal.you.promises') },
  { id: 'lands', name: t('journal.you.lands') },
]

const NEAR_KM = 15

export function JournalView({
  client,
  journal,
  start,
  talkingTo,
  nearby = false,
  onAsk,
  onCommand,
  onClose,
}: {
  client: EngineClient
  journal: Journal
  start?: string
  talkingTo?: string
  /** Only what lies within 15 km, until the player searches or asks for the rest. */
  nearby?: boolean
  onAsk: (topic: string) => void
  /** A command from a page (M10.12): setting off from the land map. */
  onCommand?: (command: string) => void
  onClose: () => void
}) {
  const mapLook = useMapLook()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<JournalPage>()
  const [part, setPart] = useState<keyof Journal | 'you' | 'all'>('all')
  const [onlyNear, setOnlyNear] = useState(nearby)
  const [picture, setPicture] = useState<string>()
  // A person's page in two tabs (M10.29 R): About, and every talk as it went.
  const [personTab, setPersonTab] = useState<'about' | 'history'>('about')
  useEffect(() => setPersonTab('about'), [page?.id])
  const searchRef = useRef<HTMLInputElement>(null)
  const pageRef = useRef<HTMLElement>(null)
  const parts = journalParts()

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
      parts.filter(({ key }) => part === 'all' || part === key)
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
  const you = yours().filter((e) => (part === 'all' || part === 'you') && matches(e.name))
  const total = parts.reduce((n, { key }) => n + journal[key].length, 0)
  const listed = shown.reduce((n, p) => n + p.count, 0)

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t('journal.title')}>
      <div className="panel journal">
        <header className="panel-head">
          <h2>{t('journal.title')}</h2>
          <input
            ref={searchRef}
            className="journal-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tn('journal.head.search', total)}
            aria-label={t('journal.head.searchLabel')}
            spellCheck={false}
          />
          <span className="muted small still">{t('journal.head.still')}</span>
          {client.exportDiscovered && (
            <button type="button" className="link" onClick={() => void client.exportDiscovered!()}>
              [{t('journal.head.discovered')}]
            </button>
          )}
          {client.exportChronicle && (
            <button type="button" className="link" onClick={() => void client.exportChronicle!()}>
              [{t('journal.head.chronicle')}]
            </button>
          )}
          <button type="button" className="link" onClick={onClose}>
            [{t('journal.head.close')}]
          </button>
        </header>
        <nav className="tabs journal-parts" aria-label={t('journal.parts.label')}>
          {[{ key: 'all', title: t('journal.parts.all') }, ...parts.filter(({ key }) => journal[key].length > 0), { key: 'you', title: t('journal.parts.you') }].map(({ key, title }) => (
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
                    <span className="muted">{t('journal.index.within', { km: NEAR_KM })}</span>
                    <button type="button" className="link" onClick={() => setOnlyNear(false)}>
                      [{tn('journal.index.everything', total - listed)}]
                    </button>
                  </>
                ) : (
                  <button type="button" className="link" onClick={() => setOnlyNear(true)}>
                    [{t('journal.index.onlyNear')}]
                  </button>
                )}
              </p>
            )}
            {shown.length === 0 && you.length === 0 && <p className="muted">{words ? t('journal.index.noMatch', { query: query.trim() }) : t('journal.index.empty')}</p>}
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
                          {e.km !== undefined && <span className="muted small"> {e.km < 1 ? t('journal.index.underKm') : t('journal.index.km', { km: Math.round(e.km) })}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
            {you.length > 0 && (
              <section className="journal-part">
                <h3>{t('journal.parts.you')}</h3>
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
              <p className="muted">{t('journal.page.empty')}</p>
            ) : (
              <>
                <h3>{page.name}</h3>
                {picture && <img className="page-picture" src={picture} alt={t('journal.page.picture', { name: page.name })} />}
                {page.map && (
                  <pre className="map page-map" aria-label={t('journal.page.map', { name: page.name })}>
                    {page.map.rows.map((row, y) => (
                      <div key={y}>
                        {runs(row, page.map!.classes[y] ?? '').map(([run, cls], i) => (
                          <span key={i} className={`m-${cls === '@' ? 'you' : cls}`}>
                            {run}
                          </span>
                        ))}
                      </div>
                    ))}
                  </pre>
                )}
                {page.sheet ? (
                  <SheetView sheet={page.sheet} />
                ) : page.hexMap ? (
                  <>
                    <HexMap data={page.hexMap} style={mapLook} mode="map" height={Math.max(320, Math.round(window.innerHeight * 0.55))} label={t('journal.page.map', { name: page.name })} onLevel={(level) => void open(level === 'surface' ? 'map' : `map:${level}`)} />
                    <details className="map-text">
                      <summary className="muted small">{t('journal.page.asText')}</summary>
                      <pre className="map whole">{page.lines.join('\n')}</pre>
                    </details>
                  </>
                ) : page.land ? (
                  <>
                    <LandMap data={page.land} style={mapLook} label={page.name} {...(onCommand ? { onCommand } : {})} />
                    {page.lines.map((line, index) => (
                      <p key={index}>{line.trim()}</p>
                    ))}
                  </>
                ) : page.kind === 'map' || page.kind === 'sheet' ? (
                  <pre className={page.kind === 'map' ? 'map whole' : 'sheet'}>{page.lines.join('\n')}</pre>
                ) : page.kind === 'person' && page.history?.length ? (
                  <>
                    <nav className="tabs small" aria-label={t('journal.page.tabs')}>
                      {(['about', 'history'] as const).map((tab) => (
                        <button key={tab} type="button" className={personTab === tab ? 'active' : ''} onClick={() => setPersonTab(tab)}>
                          {t(`journal.page.${tab}`)}
                        </button>
                      ))}
                    </nav>
                    {personTab === 'about'
                      ? page.lines.map((line, index) => <p key={index}>{line}</p>)
                      : page.history.map((day) => (
                          <section key={day.day} className="talk-history">
                            <h4>{day.day}</h4>
                            {day.talks.map((talk, i) => (
                              <div key={i} className="talk-log history-talk">
                                {talk.map((line, j) => (
                                  <p key={j} className={`line ${line.you ? 'input me' : 'speech them'}`}>
                                    {line.text}
                                  </p>
                                ))}
                              </div>
                            ))}
                          </section>
                        ))}
                  </>
                ) : (
                  page.lines.map((line, index) => <p key={index}>{line}</p>)
                )}
                {page.id === 'wishes' && <WordToChronicler client={client} reopen={() => void open('wishes')} />}
                {page.sources.length > 0 && <p className="muted small">{t('journal.page.heardFrom', { sources: page.sources.join('; ') })}</p>}
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
                    [{t('journal.page.ask', { name: talkingTo })}]
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

/**
 * A word to the chronicler (M10.24): one line in plain words, no menu, no
 * sliders. It goes in as the command CHRONICLER, so the log keeps it, and the
 * page shows it with what the chronicler did with it.
 */
function WordToChronicler({ client, reopen }: { client: EngineClient; reopen: () => void }) {
  const [text, setText] = useState('')
  const [said, setSaid] = useState<{ text: string; error: boolean }>()
  const tell = async () => {
    const reply = await client.command(`chronicler ${text.trim()}`)
    const out = reply.outputs[0]
    setSaid(out ? { text: out.text, error: out.kind === 'error' } : undefined)
    if (out?.kind !== 'error') setText('')
    reopen()
  }
  return (
    <div className="row small">
      <input value={text} maxLength={200} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && text.trim() && void tell()} placeholder={t('journal.wishes.placeholder')} aria-label={t('journal.wishes.aria')} />
      <button type="button" className="link" disabled={!text.trim()} onClick={() => void tell()}>
        [{t('journal.wishes.tell')}]
      </button>
      {said && <span className={said.error ? 'warn' : 'muted'}>{said.text}</span>}
    </div>
  )
}
