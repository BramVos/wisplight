import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { Output } from '../../engine'
import type { JournalPage, Reply } from './client'

// A conversation in its own window (after the M7 playtest): it starts in the
// ordinary interface with TALK, then goes on here. You type what you say in
// plain words; the topics you know are beside it, nearest first, to ask about
// or ask the way to. Checks and trading still use their own words.

type Status = Reply['status']
type Talk = NonNullable<Status['talk']>
type Journal = Status['journal']
export type TalkLine = (Output & { id: number }) | { id: number; kind: 'input'; text: string }

/** What the window sends as it is; everything else is speech. */
const COMMAND = /^(ask|tell|where|persuade|deceive|intimidate|bribe|insight|buy|sell|list|give|trade|recruit|order|bye|goodbye|[1-8])(\s|$)/i
const NEAR_KM = 15
/** The numbered options line: the window has them as buttons. */
const OPTIONS = /^1 Who are you\?/

export function ConversationView({
  talk,
  lines,
  journal,
  busy,
  portrait,
  about,
  render,
  onSend,
  onJournal,
}: {
  talk: Talk
  lines: TalkLine[]
  journal: Journal
  busy: boolean
  portrait?: string
  /** What the player knows of this person: their journal page. */
  about?: JournalPage
  render: (text: string) => ReactNode
  onSend: (text: string) => void
  onJournal: () => void
}) {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  const [everything, setEverything] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [talk.npc])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [lines, busy])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => event.key === 'Escape' && onSend('bye')
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSend])

  const say = () => {
    const words = text.trim()
    if (!words || busy) return
    setText('')
    onSend(COMMAND.test(words) ? words : `"${words}`)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      say()
    }
  }

  const prefill = (words: string) => {
    setText(words)
    inputRef.current?.focus()
  }

  // What you could ask about: people, places, events, stories and things, the nearest first.
  const topics = useMemo(() => {
    const words = query.trim().toLowerCase()
    const all = [
      ...journal.people.map((e) => ({ ...e, kind: 'person' as const })),
      ...journal.places.map((e) => ({ ...e, kind: 'place' as const })),
      ...journal.events.map((e) => ({ ...e, kind: 'event' as const })),
      ...journal.lore.map((e) => ({ ...e, kind: 'lore' as const })),
      ...journal.things.map((e) => ({ ...e, kind: 'thing' as const })),
    ].filter((e) => e.id !== talk.npc)
    const found = words ? all.filter((e) => e.name.toLowerCase().includes(words) || Boolean(e.group?.toLowerCase().includes(words))) : all
    const near = (e: (typeof all)[number]) => e.km === undefined || e.km <= NEAR_KM
    const shown = words || everything ? found : found.filter(near)
    return { shown: shown.sort((a, b) => (a.km ?? 99) - (b.km ?? 99) || a.name.localeCompare(b.name)), hidden: found.length - shown.length }
  }, [journal, query, everything, talk.npc])

  const quick: [number, string][] = [
    [1, 'Who are you?'],
    [2, "What's new?"],
    [3, 'Your work?'],
    [6, 'Can you help me?'],
    [8, 'Come with me?'],
  ]

  return (
    <div className="overlay talk-overlay" role="dialog" aria-modal="true" aria-label={`Talking with ${talk.name}`}>
      <div className="panel talk">
        <header className="panel-head">
          <h2>{talk.name}</h2>
          <span className="muted small">{talk.attitude}</span>
          <span className="spacer" />
          <button type="button" className="link" onClick={onJournal}>
            [Journal]
          </button>
          <button type="button" className="link" disabled={busy} onClick={() => onSend('bye')}>
            [Goodbye]
          </button>
        </header>
        <div className="talk-body">
          <div className="talk-main">
            <div className="talk-log" ref={logRef} aria-live="polite">
              {lines.filter((line) => !OPTIONS.test(line.text)).map((line) => (
                <p key={line.id} className={`line ${line.kind}`}>
                  {line.kind === 'input' ? `> ${line.text.replace(/^"/, '')}` : render(line.text)}
                </p>
              ))}
              {busy && <p className="line thinking">{talk.call} thinks it over.</p>}
            </div>
            <div className="talk-quick">
              {quick.map(([n, label]) => (
                <button key={n} type="button" className="link" disabled={busy} onClick={() => onSend(String(n))}>
                  {label}
                </button>
              ))}
              <button type="button" className="link" disabled={busy} onClick={() => onSend('list')}>
                Trade
              </button>
              <span className="muted small">or try:</span>
              {['persuade', 'deceive', 'intimidate', 'bribe', 'insight'].map((act) => (
                <button key={act} type="button" className="link" disabled={busy} onClick={() => prefill(`${act} `)}>
                  {act}
                </button>
              ))}
            </div>
            <textarea
              ref={inputRef}
              className="talk-input"
              value={text}
              rows={2}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Say something to ${talk.call}. Enter sends, Shift+Enter for a new line.`}
              aria-label={`What you say to ${talk.call}`}
              spellCheck
            />
          </div>
          <aside className="talk-topics" aria-label="Topics you can ask about">
            <section className="talk-about" aria-label={`What you know of ${talk.call}`}>
              {portrait ? <img className="talk-portrait" src={portrait} alt={`${talk.name}, as you see them`} /> : <div className="talk-portrait none">No picture{'\n'}(Settings › AI › Pictures)</div>}
              <dl>
                {about?.person?.work && (
                  <>
                    <dt>Work</dt>
                    <dd>{about.person.work}</dd>
                  </>
                )}
                {about?.person?.age && (
                  <>
                    <dt>Age</dt>
                    <dd>
                      {about.person.age.text}
                      {!about.person.age.known && (
                        <>
                          {' '}
                          <button type="button" className="link small" disabled={busy} onClick={() => onSend('"How old are you, if I may ask?')} title="Ask their age">
                            ask
                          </button>
                        </>
                      )}
                    </dd>
                  </>
                )}
                <dt>Mood to you</dt>
                <dd>{talk.attitude}</dd>
                {about?.person?.lastSeen && (
                  <>
                    <dt>Last seen</dt>
                    <dd>
                      {about.person.lastSeen.where}, {about.person.lastSeen.ago}
                    </dd>
                  </>
                )}
                {about?.person?.often && about.person.often.length > 0 && (
                  <>
                    <dt>Often at</dt>
                    <dd>{about.person.often.join(', ')}</dd>
                  </>
                )}
              </dl>
              {about?.person?.appearance && <p className="small">{about.person.appearance}</p>}
              {about?.links.some((l) => l.label !== 'news') && (
                <p className="small muted">
                  {about.links
                    .filter((l) => l.label !== 'news')
                    .slice(0, 4)
                    .map((l) => `${l.label} ${l.name}`)
                    .join(' · ')}
                </p>
              )}
            </section>
            <input className="journal-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ask about..." aria-label="Search topics" spellCheck={false} />
            <ul>
              {topics.shown.map((e) => (
                <li key={e.id}>
                  <button type="button" className="topic" disabled={busy} onClick={() => onSend(`ask about ${e.name.replace(/ \(heard of\)$/, '')}`)}>
                    {e.name}
                  </button>
                  {(e.kind === 'person' || e.kind === 'place') && (
                    <>
                      {' '}
                      <button type="button" className="link small" disabled={busy} onClick={() => onSend(`where is ${e.name.replace(/ \(heard of\)$/, '')}`)} title="Ask the way">
                        where?
                      </button>
                    </>
                  )}
                  {e.km !== undefined && <span className="muted small"> {e.km < 1 ? '< 1 km' : `${Math.round(e.km)} km`}</span>}
                </li>
              ))}
            </ul>
            {topics.hidden > 0 && (
              <button type="button" className="link small" onClick={() => setEverything(true)}>
                [{topics.hidden} further away]
              </button>
            )}
            {everything && !query && (
              <button type="button" className="link small" onClick={() => setEverything(false)}>
                [Only what is near]
              </button>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
