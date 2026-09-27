import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Output } from '../../engine'
import { createClient, type AiStatus, type CreationData, type EngineClient, type Reply, type WorldChoice } from './client'
import { CharacterCreation } from './CharacterCreation'
import { WorldPicker } from './WorldPicker'
import { FightPanel } from './FightPanel'
import { EndView } from './EndView'
import { ConversationView, type TalkLine } from './ConversationView'
import { JournalView } from './JournalView'
import { runs } from './mapRuns'
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

const JOURNAL_KEYS: (keyof Status['journal'])[] = ['quests', 'people', 'places', 'lands', 'factions', 'events', 'lore', 'things']

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
  // The journal window, open at a page or at its index (FO, chapter 2); near things first in a conversation.
  const [journal, setJournal] = useState<{ start?: string; nearby?: boolean }>()
  // Where the conversation in progress began in the log: its window shows the lines from there.
  const [talkFrom, setTalkFrom] = useState<number>()
  const [portrait, setPortrait] = useState<string>()
  const [ending, setEnding] = useState(false)
  const [creation, setCreation] = useState<CreationData>()
  // More than one world in the content folder (M8): a new game asks which.
  const [worlds, setWorlds] = useState<WorldChoice[]>()
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelled = false
    createClient()
      .then(async (created) => {
        const choices = await created.worlds()
        if (cancelled) return
        if (choices.length > 1) {
          setClient(created)
          setWorlds(choices)
          return
        }
        await begin(created)
      })
      .catch((reason: unknown) => setError(String(reason)))
    return () => {
      cancelled = true
    }
  }, [])

  /** Starts a new game in a world, and opens the character screen when the world has rules (FO, chapter 11). */
  async function begin(target: EngineClient, world?: string) {
    const reply = await target.start(world)
    setClient(target)
    setWorlds(undefined)
    setLines(reply.outputs.map(withId))
    setStatus(reply.status)
    const c = reply.status.character
    if (c && !c.made && c.xp === 0) setCreation(await target.creation())
  }

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
    client?.hold(Boolean(settings) || ending || Boolean(creation) || Boolean(journal) || Boolean(worlds))
  }, [client, settings, ending, creation, journal, worlds])

  // What the editor saves is in the game at once: show the place again (FO, chapter 15).
  useEffect(() => {
    if (!client?.builder) return
    const offReload = client.builder.onReload(() => {
      void client.command('look').then((reply) => {
        setStatus(reply.status)
        setLines((previous) => [...previous, withId({ kind: 'system', text: 'The world was changed in the editor.' }), ...reply.outputs.map(withId)].slice(-400))
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
        // A new stranger in the same world makes their character first (M7.2).
        if (/^(new stranger|carry on|nieuwe vreemdeling)$/i.test(text) && reply.status.character && !reply.status.character.made) setCreation(await client.creation())
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
    // The journal opens as its own window.
    if (/^(j|journal|dagboek)$/i.test(text)) {
      setJournal({})
      return
    }
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
  useEffect(() => {
    if (!talk) {
      setTalkFrom(undefined)
      return
    }
    setTalkFrom((from) => from ?? [...lines].reverse().find((l) => l.kind === 'input')?.id ?? lines.at(-1)?.id ?? 0)
    setPortrait(undefined)
    if (client?.picture) void client.picture(talk.npc).then(setPortrait)
    // Only when a conversation starts or ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talk?.npc])
  const openPage = (id?: string) => setJournal(id ? { start: id } : {})
  // A topic in the text: ask about it in a conversation; otherwise open its journal page, if known.
  const onTopic = (topic: string) => {
    if (talk) {
      void send(`ask about ${topic}`)
      return
    }
    const known = status ? JOURNAL_KEYS.flatMap((key) => status.journal[key]).find((e) => e.name.toLowerCase() === topic.toLowerCase()) : undefined
    if (known) {
      openPage(known.id)
      return
    }
    setInput(`ask about ${topic}`)
    inputRef.current?.focus()
  }

  const ai = status?.ai ? aiLabel(status.ai) : undefined
  const journalCount = status ? JOURNAL_KEYS.reduce((sum, key) => sum + status.journal[key].length, 0) : 0
  const openQuests = status?.journal.quests.filter((q) => q.group === 'Open') ?? []

  return (
    <div className="shell">
      <main className="log" ref={logRef} aria-live="polite">
        {error && <p className="line error">{error}</p>}
        {lines.map((line) => (
          <p key={line.id} className={`line ${line.kind}`}>
            {line.kind === 'input' ? `> ${line.text.replace(/^"/, '')}` : renderText(line.text, onTopic)}
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
            <button type="button" className="link" onClick={() => openPage('sheet')}>
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
              <button type="button" className="link" onClick={() => openPage('map')}>
                [Whole map]
              </button>
            </>
          ) : (
            <p className="muted">The map fills in as you explore.</p>
          )}
        </section>
        <section className="party">
          <h2>Party</h2>
          {status?.party?.length ? (
            <>
              {status.party.map((m) => (
                <div key={m.npc} className="member">
                  <div className="who">
                    <span>
                      {m.name} <span className="muted small">{m.title}</span>
                    </span>
                    <span className="muted small">{m.away ?? m.stance}</span>
                  </div>
                  <div className="hp" title={`${m.hp} of ${m.maxHp} hit points`}>
                    <span style={{ width: `${Math.round((m.hp / Math.max(1, m.maxHp)) * 100)}%` }} />
                  </div>
                  <p className="small muted">
                    loyalty {m.loyalty}, bond {m.bond}{' '}
                    {m.away ? (
                      <button type="button" className="link" disabled={waiting} onClick={() => void send(`order ${m.name.toLowerCase()} to follow me`)}>
                        [Follow]
                      </button>
                    ) : (
                      <button type="button" className="link" disabled={waiting} onClick={() => void send(`order ${m.name.toLowerCase()} to wait here`)}>
                        [Wait here]
                      </button>
                    )}
                  </p>
                </div>
              ))}
              <button type="button" className="link" disabled={waiting} onClick={() => void send('talk party')}>
                [Talk to the party]
              </button>{' '}
              <button type="button" className="link" disabled={waiting} onClick={() => void send('camp')}>
                [Camp]
              </button>{' '}
              <button type="button" className="link" onClick={() => openPage('party')}>
                [Opinions]
              </button>
            </>
          ) : (
            <p className="muted">No companions yet. Ask someone who trusts you: RECRUIT &lt;name&gt;.</p>
          )}
        </section>
        <section>
          <h2>Journal</h2>
          <button type="button" className="link" onClick={() => openPage()}>
            [Open the journal]
          </button>{' '}
          <span className="muted small">{journalCount} entries</span>
          {openQuests.length > 0 && (
            <div className="journal-group">
              <h3>Open quests</h3>
              <ul className="side-quests">
                {openQuests.map((q) => (
                  <li key={q.id}>
                    <button type="button" className="topic" onClick={() => openPage(q.id)}>
                      {q.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {journalCount === 0 && <p className="muted">Topics you learn appear here.</p>}
        </section>
        <section>
          <button type="button" className="link" onClick={() => setSettings('ai')}>
            [Settings]
          </button>{' '}
          <button type="button" className="link" onClick={() => setEnding(true)}>
            [Look back]
          </button>
          {client?.editor?.open && status?.builder && (
            <>
              {' '}
              <button type="button" className="link" onClick={() => void client.editor!.open!().catch((reason: unknown) => setError(String(reason)))}>
                [Editor]
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
            {status ? `${status.location}  |  ${status.time}  |  ${status.money}${status.paused && !status.talk ? '  |  time paused' : ''}` : 'Loading the world'}
          </span>
          {status?.wanted && <span className="wanted">Wanted: {status.wanted.join('; ')}</span>}
          <button type="button" className="link journal-button" onClick={() => openPage()} title="Journal (J)">
            [Journal]
          </button>
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

      {worlds && client && <WorldPicker worlds={worlds} onPick={(folder) => void begin(client, folder).catch((reason: unknown) => setError(String(reason)))} />}
      {creation && (
        <CharacterCreation
          data={creation}
          onSkip={(tempo) => {
            setCreation(undefined)
            if (tempo !== 'normal') void send(`tempo ${tempo}`)
          }}
          onCreate={(command, tempo) => {
            setCreation(undefined)
            void send(command).then(() => (tempo !== 'normal' ? send(`tempo ${tempo}`) : undefined))
          }}
        />
      )}
      {talk && status && talkFrom !== undefined && (
        <ConversationView
          talk={talk}
          lines={lines.filter((l) => l.id >= talkFrom) as TalkLine[]}
          journal={status.journal}
          busy={waiting}
          portrait={portrait}
          render={(text) => renderText(text, onTopic)}
          onSend={(text) => void send(text)}
          onJournal={() => setJournal({ nearby: true })}
        />
      )}
      {journal && client && status && (
        <JournalView
          client={client}
          journal={status.journal}
          start={journal.start}
          nearby={journal.nearby}
          talkingTo={talk?.call}
          onAsk={(topic) => {
            setJournal(undefined)
            void send(`ask about ${topic}`)
          }}
          onClose={() => {
            setJournal(undefined)
            inputRef.current?.focus()
          }}
        />
      )}
      {ending && client && <EndView client={client} onClose={() => setEnding(false)} />}
      {settings && <Settings bridge={client?.ai} tab={settings} onTab={setSettings} onClose={() => setSettings(undefined)} />}
    </div>
  )
}
