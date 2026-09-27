import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Output } from '../../engine'
import { createClient, type AiStatus, type CreationData, type EngineClient, type JournalPage, type Reply } from './client'
import { BuilderView } from './BuilderView'
import { CharacterCreation } from './CharacterCreation'
import { FightPanel } from './FightPanel'
import { EndView } from './EndView'
import { Settings, usd, type SettingsTab } from './Settings'

type Line = (Output & { id: number }) | { id: number; kind: 'input'; text: string }
type Status = Reply['status']

let nextId = 0
const withId = (output: Output): Line => ({ ...output, id: nextId++ })

// Words in [brackets] are topics: coloured and clickable, as in the design (FO, chapter 9).
function renderText(text: string, onTopic: (topic: string) => void) {
  return text.split(/(\[[^\]]+\])/g).map((part, index) =>
    part.startsWith('[') && part.endsWith(']') ? (
      <button key={index} type="button" className="topic" onClick={() => onTopic(part.slice(1, -1))}>
        {part.slice(1, -1)}
      </button>
    ) : (
      <span key={index}>{part}</span>
    ),
  )
}

/** Groups a row of map characters into runs of the same colour. */
function runs(row: string, classes: string): [string, string][] {
  const out: [string, string][] = []
  for (let i = 0; i < row.length; i++) {
    const cls = classes[i] ?? 'u'
    const last = out.at(-1)
    if (last && last[1] === cls) last[0] += row[i]
    else out.push([row[i]!, cls])
  }
  return out
}

// The AI part of the status bar (FO, chapter 16, "Kosten en verbruik in beeld").
function aiLabel(ai: AiStatus): { text: string; tone: '' | 'warn' | 'over' } {
  if (!ai.connected) return { text: 'AI off', tone: '' }
  if (ai.budgetSpent) return { text: `AI ${usd(ai.sessionUsd)}  budget used, set lines`, tone: 'over' }
  if (ai.busy) return { text: `AI ${usd(ai.sessionUsd)}  busy`, tone: 'warn' }
  if (ai.coolingDown) return { text: `AI ${usd(ai.sessionUsd)}  no connection`, tone: 'warn' }
  const low = ai.hourPercent >= 80 || (ai.monthLeftPercent !== undefined && ai.monthLeftPercent <= 20)
  return { text: `AI ${usd(ai.sessionUsd)}${ai.monthLeftPercent !== undefined ? `  ${ai.monthLeftPercent}% of month left` : ''}`, tone: low ? 'warn' : '' }
}

const JOURNAL: { key: keyof Status['journal']; title: string }[] = [
  { key: 'quests', title: 'Quests' },
  { key: 'people', title: 'People' },
  { key: 'places', title: 'Places' },
  { key: 'events', title: 'Events' },
  { key: 'lore', title: 'Lore' },
  { key: 'things', title: 'Things' },
]

export function App() {
  const [client, setClient] = useState<EngineClient>()
  const [lines, setLines] = useState<Line[]>([])
  const [status, setStatus] = useState<Status>()
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [error, setError] = useState<string>()
  const [waiting, setWaiting] = useState(false)
  const [settings, setSettings] = useState<SettingsTab>()
  const [page, setPage] = useState<JournalPage>()
  const [ending, setEnding] = useState(false)
  const [building, setBuilding] = useState(false)
  const [creation, setCreation] = useState<CreationData>()
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    createClient()
      .then(async (created) => {
        const reply = await created.start()
        if (cancelled) return
        setClient(created)
        setLines(reply.outputs.map(withId))
        setStatus(reply.status)
        // A new game begins with making the character (FO, chapter 11).
        const c = reply.status.character
        if (c && !c.made && c.xp === 0) setCreation(await created.creation())
      })
      .catch((reason: unknown) => setError(String(reason)))
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!client) return
    return client.onTick((reply) => {
      setStatus(reply.status)
      if (reply.outputs.length > 0) setLines((previous) => [...previous, ...reply.outputs.map(withId)].slice(-400))
    })
  }, [client])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [lines, waiting])

  // Menus stop the clock (FO, chapter 3).
  useEffect(() => {
    client?.hold(Boolean(settings) || ending || building || Boolean(creation))
  }, [client, settings, ending, building, creation])

  // What the world builder saves is in the game at once: show the place again (FO, chapter 15).
  useEffect(() => {
    if (!client?.builder) return
    const offReload = client.builder.onReload(() => {
      void client.command('look').then((reply) => {
        setStatus(reply.status)
        setLines((previous) => [...previous, withId({ kind: 'system', text: 'The world was changed in the builder.' }), ...reply.outputs.map(withId)].slice(-400))
      })
    })
    const offProblem = client.builder.onProblem((text) => setLines((previous) => [...previous, withId({ kind: 'error', text })].slice(-400)))
    return () => {
      offReload()
      offProblem()
    }
  }, [client])

  const send = useCallback(
    async (text: string) => {
      if (!client || !text || waiting) return
      setHistory((previous) => [text, ...previous].slice(0, 100))
      setHistoryIndex(-1)
      setLines((previous) => [...previous, { id: nextId++, kind: 'input' as const, text }].slice(-400))
      setWaiting(true)
      try {
        const reply = await client.command(text)
        setLines((previous) => [...previous, ...reply.outputs.map(withId)].slice(-400))
        setStatus(reply.status)
      } catch (reason) {
        setLines((previous) => [...previous, withId({ kind: 'error', text: String(reason) })])
      } finally {
        setWaiting(false)
        inputRef.current?.focus()
      }
    },
    [client, waiting],
  )

  const submit = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    void send(text)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    client?.activity()
    if (event.key === 'Enter') {
      submit()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const index = Math.max(-1, Math.min(history.length - 1, historyIndex + (event.key === 'ArrowUp' ? 1 : -1)))
      setHistoryIndex(index)
      setInput(index === -1 ? '' : (history[index] ?? ''))
    }
  }

  const talk = status?.talk
  const openPage = async (id: string) => setPage((await client?.page(id)) ?? undefined)
  // A topic in the text: ask about it in a conversation; otherwise open its journal page, if known.
  const onTopic = (topic: string) => {
    if (talk) {
      void send(`ask about ${topic}`)
      return
    }
    const known = status ? JOURNAL.flatMap(({ key }) => status.journal[key]).find((e) => e.name.toLowerCase() === topic.toLowerCase()) : undefined
    if (known) {
      void openPage(known.id)
      return
    }
    setInput(`ask about ${topic}`)
    inputRef.current?.focus()
  }

  const ai = status?.ai ? aiLabel(status.ai) : undefined
  const journalCount = status ? JOURNAL.reduce((sum, { key }) => sum + status.journal[key].length, 0) : 0

  return (
    <div className="shell">
      <main className="log" ref={logRef} aria-live="polite">
        {error && <p className="line error">{error}</p>}
        {lines.map((line) => (
          <p key={line.id} className={`line ${line.kind}`}>
            {line.kind === 'input' ? `> ${line.text}` : renderText(line.text, onTopic)}
          </p>
        ))}
        {waiting && talk && <p className="line thinking">{talk.call} thinks it over.</p>}
      </main>

      <aside className="side">
        {status?.combat && <FightPanel fight={status.combat} send={(text) => void send(text)} busy={waiting} shield={Boolean(status.character?.shield)} />}
        {status?.character && (
          <section className="you">
            <h2>
              {status.character.name} <span className="muted small">{status.character.title}</span>
            </h2>
            <div className="hp" title={`${status.character.hp} of ${status.character.maxHp} hit points`}>
              <span style={{ width: `${Math.round((status.character.hp / Math.max(1, status.character.maxHp)) * 100)}%` }} />
            </div>
            <p className="small">
              {status.character.hp}/{status.character.maxHp} hp, {status.character.xp}/{status.character.next} xp
            </p>
            <button type="button" className="link" onClick={() => void openPage('sheet')}>
              [Sheet]
            </button>
            {status.character.canLevel && (
              <>
                {' '}
                <button type="button" className="link" disabled={waiting} onClick={() => void send('level up')}>
                  [Level up]
                </button>
              </>
            )}
            {!status.character.made && status.character.xp === 0 && (
              <>
                {' '}
                <button type="button" className="link" onClick={() => void client?.creation().then(setCreation)}>
                  [Make your character]
                </button>
              </>
            )}
          </section>
        )}
        <section>
          <h2>Map</h2>
          {status?.map ? (
            <>
              <pre className="map" aria-label="Map of the land around you">
                {status.map.rows.map((row, y) => (
                  <div key={y}>
                    {runs(row, status.map!.classes[y] ?? '').map(([text, cls], i) => (
                      <span key={i} className={`m-${cls === '@' ? 'you' : cls}`}>
                        {text}
                      </span>
                    ))}
                  </div>
                ))}
              </pre>
              <button type="button" className="link" onClick={() => void openPage('map')}>
                [Whole map]
              </button>
            </>
          ) : (
            <p className="muted">The map fills in as you explore.</p>
          )}
        </section>
        <section>
          <h2>Party</h2>
          <p className="muted">No companions yet.</p>
        </section>
        <section>
          <h2>Journal</h2>
          {page && (
            <div className="journal-page">
              <button type="button" className="link" onClick={() => setPage(undefined)}>
                [Back]
              </button>
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
                      <button type="button" className="topic" onClick={() => void openPage(l.id)}>
                        {l.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {talk && (
                <button type="button" className="link" onClick={() => void send(`ask about ${page.name}`)}>
                  [Ask {talk.call} about this]
                </button>
              )}
            </div>
          )}
          {!page && journalCount === 0 && <p className="muted">Topics you learn appear here.</p>}
          {!page &&
            status &&
            JOURNAL.filter(({ key }) => status.journal[key].length > 0).map(({ key, title }) => (
              <div key={key} className="journal-group">
                <h3>{title}</h3>
                <p>
                  {status.journal[key].map((entry, index, all) => (
                    <Fragment key={entry.id}>
                      <span className="entry">
                        <button type="button" className="topic" onClick={() => void openPage(entry.id)}>
                          {entry.name}
                        </button>
                        {index < all.length - 1 && ','}
                      </span>{' '}
                    </Fragment>
                  ))}
                </p>
              </div>
            ))}
        </section>
        <section>
          <button type="button" className="link" onClick={() => setSettings('ai')}>
            [Settings]
          </button>{' '}
          <button type="button" className="link" onClick={() => setEnding(true)}>
            [Look back]
          </button>
          {client?.builder && (
            <>
              {' '}
              <button type="button" className="link" onClick={() => setBuilding(true)}>
                [Builder]
              </button>
            </>
          )}
        </section>
      </aside>

      <footer className="bar">
        {talk && (
          <div className="talkbar">
            <span className="talking">
              Talking with {talk.name} ({talk.attitude})
            </span>
            {talk.options.map((option, index) => (
              <button key={option} type="button" className="link" disabled={waiting} onClick={() => (index === 3 || index === 4 ? (setInput(index === 3 ? 'ask about ' : 'where is '), inputRef.current?.focus()) : void send(String(index + 1)))}>
                {index + 1} {option}
              </button>
            ))}
            <button type="button" className="link" disabled={waiting} onClick={() => void send('bye')}>
              BYE
            </button>
          </div>
        )}
        <div className="statusline">
          <span className="status">
            {status ? `${status.location}  |  ${status.time}  |  ${status.money}${status.paused && !status.talk ? '  |  time paused' : ''}` : 'Loading the Nethermarch'}
          </span>
          {ai && (
            <button type="button" className={`link ai ${ai.tone}`} onClick={() => setSettings('usage')} title="AI cost and usage">
              {ai.text}
            </button>
          )}
        </div>
        <label className="prompt">
          <span aria-hidden="true">&gt;</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Command"
            placeholder={talk ? `say something to ${talk.call}, pick a number, or BYE` : 'type a command, or HELP'}
            autoFocus
            spellCheck={false}
          />
        </label>
      </footer>

      {creation && (
        <CharacterCreation
          data={creation}
          onSkip={() => setCreation(undefined)}
          onCreate={(command) => {
            setCreation(undefined)
            void send(command)
          }}
        />
      )}
      {ending && client && <EndView client={client} onClose={() => setEnding(false)} />}
      {building && <BuilderView bridge={client?.builder} onClose={() => setBuilding(false)} />}
      {settings && <Settings bridge={client?.ai} tab={settings} onTab={setSettings} onClose={() => setSettings(undefined)} />}
    </div>
  )
}
