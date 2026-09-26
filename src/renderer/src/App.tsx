import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Output, Status } from '../../engine'
import { createClient, type EngineClient } from './client'

type Line = Output & { id: number } | { id: number; kind: 'input'; text: string }

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

export function App() {
  const [client, setClient] = useState<EngineClient>()
  const [lines, setLines] = useState<Line[]>([])
  const [status, setStatus] = useState<Status>()
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [error, setError] = useState<string>()
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
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [lines])

  const submit = async () => {
    const text = input.trim()
    if (!client || !text) return
    setInput('')
    setHistory((previous) => [text, ...previous].slice(0, 100))
    setHistoryIndex(-1)
    const reply = await client.command(text)
    setLines((previous) => [...previous, { id: nextId++, kind: 'input', text }, ...reply.outputs.map(withId)])
    setStatus(reply.status)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      void submit()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const index = Math.max(-1, Math.min(history.length - 1, historyIndex + (event.key === 'ArrowUp' ? 1 : -1)))
      setHistoryIndex(index)
      setInput(index === -1 ? '' : (history[index] ?? ''))
    }
  }

  const onTopic = (topic: string) => {
    setInput(`look ${topic.toLowerCase()}`)
    inputRef.current?.focus()
  }

  return (
    <div className="shell">
      <main className="log" ref={logRef} aria-live="polite">
        {error && <p className="line error">{error}</p>}
        {lines.map((line) => (
          <p key={line.id} className={`line ${line.kind}`}>
            {line.kind === 'input' ? `> ${line.text}` : renderText(line.text, onTopic)}
          </p>
        ))}
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
          <p className="muted">Topics you learn appear here.</p>
        </section>
      </aside>

      <footer className="bar">
        <span className="status">
          {status ? `${status.location}  |  ${status.time}` : 'Loading the Nethermarch'}
        </span>
        <label className="prompt">
          <span aria-hidden="true">&gt;</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Command"
            placeholder="type a command, or HELP"
            autoFocus
            spellCheck={false}
          />
        </label>
      </footer>
    </div>
  )
}
