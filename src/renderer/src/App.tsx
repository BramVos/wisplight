import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Output } from '../../engine'
import { createClient, type AiStatus, type EngineClient, type Reply } from './client'
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
  { key: 'people', title: 'People' },
  { key: 'places', title: 'Places' },
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
    client?.hold(Boolean(settings))
  }, [client, settings])

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
  // A topic from the text or the journal: ask about it in a conversation, otherwise put it in the prompt.
  const onTopic = (topic: string) => {
    if (talk) {
      void send(`ask about ${topic.toLowerCase()}`)
      return
    }
    setInput(`ask about ${topic.toLowerCase()}`)
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
        <section>
          <h2>Map</h2>
          <p className="muted">The map fills in as you explore (phase 1).</p>
        </section>
        <section>
          <h2>Party</h2>
          <p className="muted">No companions yet.</p>
        </section>
        <section>
          <h2>Journal</h2>
          {journalCount === 0 && <p className="muted">Topics you learn appear here.</p>}
          {status &&
            JOURNAL.filter(({ key }) => status.journal[key].length > 0).map(({ key, title }) => (
              <div key={key} className="journal-group">
                <h3>{title}</h3>
                <p>
                  {status.journal[key].map((entry, index, all) => (
                    <span key={entry.id} className="entry">
                      <button type="button" className="topic" onClick={() => onTopic(entry.name)} title={talk ? `Ask about ${entry.name}` : undefined}>
                        {entry.name}
                      </button>
                      {index < all.length - 1 && ','}{' '}
                    </span>
                  ))}
                </p>
              </div>
            ))}
        </section>
        <section>
          <button type="button" className="link" onClick={() => setSettings('ai')}>
            [Settings]
          </button>
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

      {settings && <Settings bridge={client?.ai} tab={settings} onTab={setSettings} onClose={() => setSettings(undefined)} />}
    </div>
  )
}
