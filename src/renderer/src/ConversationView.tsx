import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { JournalPage, Reply } from './client'
import { useShowRules } from './display'
import { t, tn } from './i18n'
import figure from './assets/portraits/figure.svg'
import man from './assets/portraits/man.svg'
import woman from './assets/portraits/woman.svg'

// A conversation in its own window (after the M7 playtest): it starts in the
// ordinary interface with TALK, then goes on here. You type what you say in
// plain words; the topics you know are beside it, nearest first, to ask about
// or ask the way to. Checks and trading still use their own words.

type Status = Reply['status']
type Talk = NonNullable<Status['talk']>
type Journal = Status['journal']
/** A line of the talk as the engine keeps it (M10.8). */
export type TalkLine = Talk['lines'][number]

/** Whoever has no portrait of their own: a figure in shadow (M10.8). */
const GENERIC: Record<Talk['pronoun'], string> = { he: man, she: woman, they: figure }

/** Who said a line (M10.8): the stranger on the left, the other on the right, the rest across. */
function sideOf(line: TalkLine): 'me' | 'them' | 'aside' {
  if (line.kind === 'input' || (line.kind === 'text' && /^You: /.test(line.text))) return 'me'
  return line.kind === 'speech' ? 'them' : 'aside'
}

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
  ended = false,
  onClose,
  covered = false,
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
  /** The talk is over (M10.4): the last answer stays in view until the window is closed. */
  ended?: boolean
  onClose?: () => void
  /** A window lies over this one (the journal): Escape is for that one (M10.8). */
  covered?: boolean
}) {
  const [text, setText] = useState('')
  // What was said in this talk, for the arrow keys (M10.8): the main input keeps only commands.
  const [said, setSaid] = useState<string[]>([])
  const [back, setBack] = useState(-1)
  const showRules = useShowRules()
  const [query, setQuery] = useState('')
  const [everything, setEverything] = useState(false)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  const closeRef = useRef<HTMLButtonElement>(null)
  // The window keeps the focus (M10.4): back in the input after every answer, on Close once it is over.
  useEffect(() => {
    if (ended) closeRef.current?.focus()
    else if (!busy) inputRef.current?.focus()
  }, [talk.npc, busy, ended])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [lines, busy])

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || covered) return
      if (ended) onClose?.()
      else onSend('bye')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSend, onClose, ended, covered])

  // A new talk has its own history.
  useEffect(() => {
    setSaid([])
    setBack(-1)
  }, [talk.npc])

  const say = () => {
    const words = text.trim()
    if (!words || busy) return
    setText('')
    setSaid((previous) => [words, ...previous.filter((w) => w !== words)].slice(0, 50))
    setBack(-1)
    onSend(COMMAND.test(words) ? words : `"${words}`)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      say()
    } else if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !text.includes('\n') && said.length) {
      // Up and down bring back what you said in this talk (M10.8).
      event.preventDefault()
      const index = Math.max(-1, Math.min(said.length - 1, back + (event.key === 'ArrowUp' ? 1 : -1)))
      setBack(index)
      setText(index === -1 ? '' : (said[index] ?? ''))
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
    const near = (e: (typeof all)[number]) => e.km === undefined || NEAR_KM >= e.km
    const shown = words || everything ? found : found.filter(near)
    return { shown: shown.sort((a, b) => (a.km ?? 99) - (b.km ?? 99) || a.name.localeCompare(b.name)), hidden: found.length - shown.length }
  }, [journal, query, everything, talk.npc])

  const quick: [number, string][] = [
    [1, t('conversation.quick.who')],
    [2, t('conversation.quick.news')],
    [3, t('conversation.quick.work')],
    [6, t('conversation.quick.help')],
    [8, t('conversation.quick.follow')],
  ]

  const acts: [string, string][] = [
    ['persuade', t('conversation.quick.acts.persuade')],
    ['deceive', t('conversation.quick.acts.deceive')],
    ['intimidate', t('conversation.quick.acts.intimidate')],
    ['bribe', t('conversation.quick.acts.bribe')],
    ['insight', t('conversation.quick.acts.insight')],
  ]

  return (
    <div className="overlay talk-overlay" role="dialog" aria-modal="true" aria-label={t('conversation.dialog', { name: talk.name })}>
      <div className="panel talk">
        <header className="panel-head">
          <h2>{talk.name}</h2>
          <span className="muted small">{talk.attitude}</span>
          <span className="spacer" />
          <button type="button" className="link" onClick={onJournal}>
            [{t('conversation.head.journal')}]
          </button>
          {ended ? (
            <button type="button" className="link" ref={closeRef} onClick={() => onClose?.()}>
              [{t('conversation.head.close')}]
            </button>
          ) : (
            <button type="button" className="link" disabled={busy} onClick={() => onSend('bye')}>
              [{t('conversation.head.goodbye')}]
            </button>
          )}
        </header>
        <div className="talk-body">
          <div className="talk-main">
            <div className="talk-log" ref={logRef} aria-live="polite">
              {lines
                .filter((line) => !OPTIONS.test(line.text))
                // What you typed, when the game says it back ("You: ..."), shows once; TALK itself is the window.
                .filter((line, i, all) => !(line.kind === 'input' && (/^talk\b/i.test(line.text) || (all[i + 1]?.kind === 'text' && /^You: /.test(all[i + 1]!.text)))))
                .map((line) => (
                  <p key={line.id} className={`line ${line.kind} ${sideOf(line)}${showRules && line.kind === 'speech' && line.source === 'rules' ? ' rules' : ''}`} title={showRules && line.kind === 'speech' && line.source === 'rules' ? t('conversation.log.rules') : undefined}>
                    {line.kind === 'input' ? line.text.replace(/^"/, '') : render(line.text)}
                  </p>
                ))}
              {busy && <p className="line thinking">{t('conversation.log.thinking', { name: talk.call })}</p>}
              {ended && <p className="line system">{t('conversation.log.over')}</p>}
            </div>
            {!ended && (
              <>
                <div className="talk-quick">
                  {quick.map(([n, label]) => (
                    <button key={n} type="button" className="link" disabled={busy} onClick={() => onSend(String(n))}>
                      {label}
                    </button>
                  ))}
                  <button type="button" className="link" disabled={busy} onClick={() => onSend('list')}>
                    {t('conversation.quick.trade')}
                  </button>
                  <span className="muted small">{t('conversation.quick.orTry')}</span>
                  {acts.map(([act, label]) => (
                    <button key={act} type="button" className="link" disabled={busy} onClick={() => prefill(`${act} `)}>
                      {label}
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
                  placeholder={t('conversation.input.placeholder', { name: talk.call })}
                  aria-label={t('conversation.input.label', { name: talk.call })}
                  spellCheck
                />
              </>
            )}
          </div>
          <aside className="talk-topics" aria-label={t('conversation.topics.label')}>
            <section className="talk-about" aria-label={t('conversation.about.label', { name: talk.call })}>
              <img className="talk-portrait" src={portrait ?? GENERIC[talk.pronoun]} alt={t('conversation.about.portrait', { name: talk.name })} />
              <dl>
                {about?.person?.work && (
                  <>
                    <dt>{t('conversation.about.work')}</dt>
                    <dd>{about.person.work}</dd>
                  </>
                )}
                {about?.person?.age && (
                  <>
                    <dt>{t('conversation.about.age')}</dt>
                    <dd>
                      {about.person.age.text}
                      {!about.person.age.known && (
                        <>
                          {' '}
                          <button type="button" className="link small" disabled={busy} onClick={() => onSend(`"${t('conversation.about.askAge')}`)} title={t('conversation.about.askTitle')}>
                            {t('conversation.about.ask')}
                          </button>
                        </>
                      )}
                    </dd>
                  </>
                )}
                <dt>{t('conversation.about.mood')}</dt>
                <dd>{talk.attitude}</dd>
                {about?.person?.lastSeen && (
                  <>
                    <dt>{t('conversation.about.lastSeen')}</dt>
                    <dd>
                      {about.person.lastSeen.where}, {about.person.lastSeen.ago}
                    </dd>
                  </>
                )}
                {about?.person?.often && about.person.often.length > 0 && (
                  <>
                    <dt>{t('conversation.about.often')}</dt>
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
            <input className="journal-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('conversation.topics.search')} aria-label={t('conversation.topics.searchLabel')} spellCheck={false} />
            <ul>
              {topics.shown.map((e) => (
                <li key={e.id}>
                  <button type="button" className="topic" disabled={busy} onClick={() => onSend(`ask about ${e.name.replace(/ \(heard of\)$/, '')}`)}>
                    {e.name}
                  </button>
                  {(e.kind === 'person' || e.kind === 'place') && (
                    <>
                      {' '}
                      <button type="button" className="link small" disabled={busy} onClick={() => onSend(`where is ${e.name.replace(/ \(heard of\)$/, '')}`)} title={t('conversation.topics.whereTitle')}>
                        {t('conversation.topics.where')}
                      </button>
                    </>
                  )}
                  {e.km !== undefined && <span className="muted small"> {e.km < 1 ? t('conversation.topics.underKm') : t('conversation.topics.km', { km: Math.round(e.km) })}</span>}
                </li>
              ))}
            </ul>
            {topics.hidden > 0 && (
              <button type="button" className="link small" onClick={() => setEverything(true)}>
                [{tn('conversation.topics.further', topics.hidden)}]
              </button>
            )}
            {everything && !query && (
              <button type="button" className="link small" onClick={() => setEverything(false)}>
                [{t('conversation.topics.onlyNear')}]
              </button>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
