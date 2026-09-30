import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { JournalPage, Reply } from './client'
import { complete } from './complete'
import { useShowRolls, useShowRules } from './display'
import { t, tn } from './i18n'
import figure from './assets/portraits/figure.svg'
import man from './assets/portraits/man.svg'
import woman from './assets/portraits/woman.svg'
import { useWindow } from './windows'

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
const COMMAND = /^(ask|tell|where|persuade|deceive|intimidate|bribe|insight|buy|sell|list|give|trade|recruit|order|bye|goodbye|[1-9])(\s|$)/i
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
  completions = [],
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
  /** The names Tab completes from (M10.29 K), as in the main input. */
  completions?: string[]
}) {
  const [text, setText] = useState('')
  // The names Tab could complete to (M10.29 K), until the next key.
  const [completing, setCompleting] = useState<string[]>([])
  // What was said in this talk, for the arrow keys (M10.8): the main input keeps only commands.
  const [said, setSaid] = useState<string[]>([])
  const [back, setBack] = useState(-1)
  const showRules = useShowRules()
  const showRolls = useShowRolls()
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

  // A window of the stack (M10.33 A): Escape says goodbye when it is on top (a journal over it closes first).
  useWindow(() => (ended ? onClose?.() : onSend('bye')))

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
    // Tab completes the last word (M10.29 K); Shift-Tab still moves the focus.
    if (event.key === 'Tab' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault()
      const done = complete(text, completions)
      setText(done.text)
      setCompleting(done.options)
      return
    }
    setCompleting([])
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

  // Two rows (M10.33 F): questions, and moves with a roll. Trade only with someone who keeps a trade here, Come with me only with someone who can come.
  const questions: { send: string; key: string }[] = [
    // Someone with a matter with the stranger (M10.33 E): a quest of theirs that runs, or a request.
    ...(talk.matter ? [{ send: '9', key: 'matter' }] : []),
    { send: '1', key: 'who' },
    { send: '2', key: 'news' },
    { send: '3', key: 'work' },
    { send: '6', key: 'help' },
    ...(talk.trades ? [{ send: 'list', key: 'trade' }] : []),
    ...(talk.joins ? [{ send: '8', key: 'follow' }] : []),
  ]

  const acts = ['persuade', 'deceive', 'intimidate', 'bribe', 'insight']

  return (
    <div className="overlay talk-overlay" role="dialog" aria-modal="true" aria-label={t('conversation.dialog', { name: talk.name })}>
      <div className="panel talk">
        <header className="panel-head">
          <h2>
            {/* Their colour (M10.29 I), as on the plan of here and their journal page. */}
            {talk.colour && <span className="person-dot" style={{ background: talk.colour }} aria-hidden="true" />}
            {talk.name}
          </h2>
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
              {/* The talk before this one, faded (M10.29 J): what was said then, kept by the game. */}
              {talk.earlier && (
                <div className="talk-earlier">
                  <p className="line aside">{t('conversation.log.earlier', { when: talk.earlier.when })}</p>
                  {talk.earlier.lines.map((line, i) => (
                    <p key={`earlier-${i}`} className={`line ${line.you ? 'input me' : 'speech them'}`}>
                      {line.you ? line.text : render(line.text)}
                    </p>
                  ))}
                </div>
              )}
              {lines
                .filter((line) => !OPTIONS.test(line.text))
                // The dice of a check only when the setting asks for them (M10.33 R).
                .filter((line) => showRolls || line.kind !== 'check')
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
                {/* What they offer waits for a yes or a no (M10.33 F): YES here, or typed, closes it. */}
                {talk.proposal && (
                  <div className="talk-offer" role="group" aria-label={t('conversation.offer.label', { name: talk.call })}>
                    <span>{talk.proposal.replace(/ YES to agree, NO to decline\.$/, '')}</span>
                    <button type="button" className="link" disabled={busy} onClick={() => onSend('yes')}>
                      [{t('conversation.offer.yes')}]
                    </button>
                    <button type="button" className="link" disabled={busy} onClick={() => onSend('no')}>
                      [{t('conversation.offer.no')}]
                    </button>
                  </div>
                )}
                {/* What this person's quest asks now (M10.33 V): what the journal says, so no line of theirs reads as a task. */}
                {talk.now && (
                  <p className="talk-now muted small" title={t('conversation.nowTitle')}>
                    {t('conversation.now', { now: talk.now })}
                  </p>
                )}
                <div className="talk-quick">
                  <span className="muted small" title={t('conversation.quick.askHelp')}>
                    {t('conversation.quick.ask')}
                  </span>
                  {questions.map((q) => (
                    <button key={q.key} type="button" className="link" disabled={busy} onClick={() => onSend(q.send)} title={t(`conversation.quick.titles.${q.key}`)}>
                      {t(`conversation.quick.${q.key}`)}
                    </button>
                  ))}
                </div>
                <div className="talk-quick">
                  <span className="muted small" title={t('conversation.quick.tryHelp')}>
                    {t('conversation.quick.orTry')}
                  </span>
                  {acts.map((act) => (
                    <button key={act} type="button" className="link" disabled={busy} onClick={() => prefill(`${act} `)} title={t(`conversation.quick.actTitles.${act}`)}>
                      {t(`conversation.quick.acts.${act}`)}
                    </button>
                  ))}
                </div>
                {completing.length > 1 && (
                  <div className="completions" aria-live="polite">
                    {completing.join(', ')}
                  </div>
                )}
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
                      {/* A guess is the button itself (M10.29, Bram's playtest: the word "ask" was noise); a known age is text. */}
                      {about.person.age.known ? (
                        about.person.age.text
                      ) : (
                        <button type="button" className="link" disabled={busy} onClick={() => onSend(`"${t('conversation.about.askAge')}`)} title={t('conversation.about.askTitle')}>
                          {about.person.age.text}
                        </button>
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
