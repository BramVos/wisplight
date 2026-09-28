import { lazy, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Output } from '../../engine'
import { createClient, type AiStatus, type CreationData, type EngineClient, type JournalPage, type Reply, type RoleLight, type WorldChoice } from './client'
import { CharacterCreation } from './CharacterCreation'
import { WorldPicker } from './WorldPicker'
import { FightPanel } from './FightPanel'
import { EndView } from './EndView'
import { LogExport } from './LogExport'
import { ConversationView, type TalkLine } from './ConversationView'
import { JournalView } from './JournalView'
import { runs } from './mapRuns'
import { HexMap } from './HexMap'
import { useMapLook } from './display'
import { Settings, usd, type SettingsTab } from './Settings'
import { t, tn } from './i18n'

// Under the bonnet (M10.1): only a development build bundles the dev menu; a production build has no trace of it.
const DevMenu = import.meta.env.DEV ? lazy(() => import('./dev/DevMenu')) : undefined

type Line = (Output & { id: number }) | { id: number; kind: 'input'; text: string }
type Status = Reply['status']

let nextId = 0
const withId = (output: Output): Line => ({ ...output, id: nextId++ })

// Words in [brackets] are topics: coloured and clickable, as in the design (FO, chapter 9).
// A right click opens a small menu of what to do with it (M10.4).
function renderText(text: string, onTopic: (topic: string) => void, onMenu?: (topic: string, x: number, y: number) => void) {
  return text.split(/(\[[^\]]+\])/g).map((part, index) =>
    part.startsWith('[') && part.endsWith(']') ? (
      <button
        key={index}
        type="button"
        className="topic"
        onClick={() => onTopic(part.slice(1, -1))}
        onContextMenu={(event) => {
          if (!onMenu) return
          event.preventDefault()
          onMenu(part.slice(1, -1), event.clientX, event.clientY)
        }}
      >
        {part.slice(1, -1)}
      </button>
    ) : (
      <span key={index}>{part}</span>
    ),
  )
}


// The AI part of the status bar (FO, chapter 16, "Kosten en verbruik in beeld").
function aiLabel(ai: AiStatus): { text: string; tone: '' | 'warn' | 'over' } {
  if (!ai.connected) return { text: t('app.ai.off'), tone: '' }
  const cost = usd(ai.sessionUsd)
  if (ai.budgetSpent) return { text: t('app.ai.budgetSpent', { cost }), tone: 'over' }
  if (ai.busy) return { text: t('app.ai.busy', { cost }), tone: 'warn' }
  if (ai.coolingDown) return { text: t('app.ai.noConnection', { cost }), tone: 'warn' }
  const hourNearlyUsed = ai.hourPercent >= 80
  const monthNearlyUsed = ai.monthLeftPercent !== undefined && ai.monthLeftPercent <= 20
  const low = hourNearlyUsed || monthNearlyUsed
  return { text: ai.monthLeftPercent !== undefined ? t('app.ai.monthLeft', { cost, percent: ai.monthLeftPercent }) : t('app.ai.cost', { cost }), tone: low ? 'warn' : '' }
}

/** What a role's light says when you point at it (M10.4): the role, and the last call. */
function lightTitle(light: RoleLight): string {
  const role = t(`app.ai.role.${light.role}`)
  if (light.busy) return t('app.ai.lightBusy', { role })
  if (!light.last) return t('app.ai.lightNone', { role })
  const ago = Math.max(0, Math.round((Date.now() - light.last.at) / 60000))
  return t('app.ai.lightLast', { role, cost: light.last.costUsd !== undefined ? usd(light.last.costUsd) : '?', seconds: (light.last.ms / 1000).toFixed(1), ago, ok: light.last.ok ? '' : t('app.ai.lightFailed') })
}

const JOURNAL_KEYS: (keyof Status['journal'])[] = ['quests', 'people', 'places', 'lands', 'factions', 'events', 'lore', 'things']

export function App() {
  const mapLook = useMapLook()
  const [client, setClient] = useState<EngineClient>()
  const [lines, setLines] = useState<Line[]>([])
  const [status, setStatus] = useState<Status>()
  const [input, setInput] = useState('')
  // The world waits while you type (after the M8 playtest).
  const typing = input.trim().length > 0
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [error, setError] = useState<string>()
  const [waiting, setWaiting] = useState(false)
  const [settings, setSettings] = useState<SettingsTab>()
  const [dev, setDev] = useState(false)
  // The journal window, open at a page or at its index (FO, chapter 2); near things first in a conversation.
  const [journal, setJournal] = useState<{ start?: string; nearby?: boolean }>()
  // Where the conversation in progress began in the log: its window shows the lines from there.
  const [talkFrom, setTalkFrom] = useState<number>()
  // The talk that just ended (M10.4): its window stays until closed, with the last answer in view.
  const [ended, setEnded] = useState<{ talk: NonNullable<Status['talk']>; from: number }>()
  const lastTalk = useRef<NonNullable<Status['talk']> | undefined>(undefined)
  // The lights per role (M10.4), as calls start and end.
  const [lights, setLights] = useState<RoleLight[]>()
  // A topic's menu, at the pointer (M10.4).
  const [menu, setMenu] = useState<{ topic: string; x: number; y: number }>()
  const [portrait, setPortrait] = useState<string>()
  // The journal page of the person you talk to, refreshed after every answer (age, where seen).
  const [about, setAbout] = useState<JournalPage>()
  const [ending, setEnding] = useState(false)
  const [exporting, setExporting] = useState(false)
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

  // Menus stop the clock (FO, chapter 3); the dev menu too, so looking changes nothing.
  useEffect(() => {
    client?.hold(Boolean(settings) || ending || exporting || typing || Boolean(creation) || Boolean(journal) || Boolean(worlds) || dev)
  }, [client, settings, ending, exporting, typing, creation, journal, worlds, dev])

  // Ctrl+Shift+D opens the dev menu in a development build.
  useEffect(() => {
    if (!DevMenu || !client?.dev) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') setDev((open) => !open)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [client])

  // The lights come on and go off as calls start and end (M10.4).
  useEffect(() => client?.ai?.onActivity?.((roles) => setLights(roles)), [client])

  // What the editor saves is in the game at once: show the place again (FO, chapter 15).
  useEffect(() => {
    if (!client?.builder) return
    const offReload = client.builder.onReload((change) => {
      void client.command('look').then((reply) => {
        setStatus(reply.status)
        // Only a change on disk the file watcher saw is announced, with its file (M10.4); the editor's own saves just show the place again.
        const notice = change.file ? [withId({ kind: 'system', text: t('app.editor.changedOnDisk', { file: change.file }) })] : []
        setLines((previous) => [...previous, ...notice, ...reply.outputs.map(withId)].slice(-400))
      })
    })
    const offProblem = client.builder.onProblem((text) => setLines((previous) => [...previous, withId({ kind: 'error', text })].slice(-400)))
    return () => {
      offReload()
      offProblem()
    }
  }, [client])

  const talkOpen = useRef(false)
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
        talkOpen.current = Boolean(reply.status.talk)
        // A new stranger in the same world makes their character first (M7.2).
        if (/^(new stranger|carry on|nieuwe vreemdeling|years later|new legend|jaren later)$/i.test(text) && reply.status.character && !reply.status.character.made) setCreation(await client.creation())
      } catch (reason) {
        setLines((previous) => [...previous, withId({ kind: 'error', text: String(reason) })])
      } finally {
        setWaiting(false)
        // The conversation window keeps the focus while it is open (M10.4).
        if (!talkOpen.current) inputRef.current?.focus()
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
    // @dev opens the dev menu in a development build (M10.1); elsewhere it is an unknown build command.
    if (DevMenu && client?.dev && /^@dev$/i.test(text)) {
      setDev(true)
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
      // Over: the window stays with the last answer, until it is closed (M10.4).
      if (talkFrom !== undefined && lastTalk.current) setEnded({ talk: lastTalk.current, from: talkFrom })
      talkOpen.current = Boolean(talkFrom !== undefined && lastTalk.current)
      setTalkFrom(undefined)
      return
    }
    lastTalk.current = talk
    setEnded(undefined)
    setTalkFrom((from) => from ?? [...lines].reverse().find((l) => l.kind === 'input')?.id ?? lines.at(-1)?.id ?? 0)
    setPortrait(undefined)
    if (client?.picture) void client.picture(talk.npc).then(setPortrait)
    // Only when a conversation starts or ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talk?.npc])
  useEffect(() => {
    if (!talk || !client) {
      setAbout(undefined)
      return
    }
    if (waiting) return
    let live = true
    void client.page(talk.npc).then((page) => live && setAbout(page))
    return () => {
      live = false
    }
  }, [client, talk?.npc, waiting])
  const openPage = (id?: string) => setJournal(id ? { start: id } : {})
  // A topic in the text (M10.4): its journal page if you know it, else a look at it if it is here.
  const onTopic = (topic: string) => {
    setMenu(undefined)
    const known = status ? JOURNAL_KEYS.flatMap((key) => status.journal[key]).find((e) => e.name.toLowerCase() === topic.toLowerCase()) : undefined
    if (known) {
      openPage(known.id)
      return
    }
    void send(`look ${topic}`)
  }
  const onMenu = (topic: string, x: number, y: number) => setMenu({ topic, x, y })
  const fromMenu = (command: string) => {
    setMenu(undefined)
    void send(command)
  }
  const closeEnded = () => {
    setEnded(undefined)
    talkOpen.current = false
    inputRef.current?.focus()
  }

  const ai = status?.ai ? aiLabel(status.ai) : undefined
  const roles = lights ?? status?.ai?.roles
  const journalCount = status ? JOURNAL_KEYS.reduce((sum, key) => sum + status.journal[key].length, 0) : 0
  const openQuests = status?.journal.quests.filter((q) => q.group === 'Open') ?? []

  return (
    <div className="shell">
      <main className="log" ref={logRef} aria-live="polite">
        {error && <p className="line error">{error}</p>}
        {lines.map((line) => (
          <p key={line.id} className={`line ${line.kind}`}>
            {line.kind === 'input' ? `> ${line.text.replace(/^"/, '')}` : renderText(line.text, onTopic, onMenu)}
          </p>
        ))}
        {waiting && talk && <p className="line thinking">{t('app.talk.thinking', { name: talk.call })}</p>}
      </main>

      <aside className="side">
        {status?.combat && <FightPanel fight={status.combat} send={(text) => void send(text)} busy={waiting} shield={Boolean(status.character?.shield)} />}
        {status?.character && (
          <section className="you">
            <h2>
              {status.character.name} <span className="muted small">{status.character.title}</span>
            </h2>
            <div className="hp" title={t('app.hitPoints', { hp: status.character.hp, max: status.character.maxHp })}>
              <span style={{ width: `${Math.round((status.character.hp / Math.max(1, status.character.maxHp)) * 100)}%` }} />
            </div>
            <p className="small">
              {t('app.character.stats', { hp: status.character.hp, maxHp: status.character.maxHp, xp: status.character.xp, next: status.character.next })}
            </p>
            <button type="button" className="link" onClick={() => openPage('sheet')}>
              [{t('app.character.sheet')}]
            </button>
            {status.character.canLevel && (
              <>
                {' '}
                <button type="button" className="link" disabled={waiting} onClick={() => void send('level up')}>
                  [{t('app.character.levelUp')}]
                </button>
              </>
            )}
            {!status.character.made && status.character.xp === 0 && (
              <>
                {' '}
                <button type="button" className="link" onClick={() => void client?.creation().then(setCreation)}>
                  [{t('app.character.make')}]
                </button>
              </>
            )}
          </section>
        )}
        <section>
          <h2>{t('app.map.title')}</h2>
          {status?.hexMap ? (
            <>
              <HexMap data={status.hexMap} style={mapLook} mode="local" legend={false} height={220} label={t('app.map.label')} />
              <button type="button" className="link" onClick={() => openPage('map')}>
                [{t('app.map.whole')}]
              </button>
            </>
          ) : status?.map ? (
            <>
              <pre className="map" aria-label={t('app.map.label')}>
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
                [{t('app.map.whole')}]
              </button>
            </>
          ) : (
            <p className="muted">{t('app.map.empty')}</p>
          )}
        </section>
        <section className="party">
          <h2>{t('app.party.title')}</h2>
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
                  <div className="hp" title={t('app.hitPoints', { hp: m.hp, max: m.maxHp })}>
                    <span style={{ width: `${Math.round((m.hp / Math.max(1, m.maxHp)) * 100)}%` }} />
                  </div>
                  <p className="small muted">
                    {t('app.party.stats', { loyalty: m.loyalty, bond: m.bond })}{' '}
                    {m.away ? (
                      <button type="button" className="link" disabled={waiting} onClick={() => void send(`order ${m.name.toLowerCase()} to follow me`)}>
                        [{t('app.party.follow')}]
                      </button>
                    ) : (
                      <button type="button" className="link" disabled={waiting} onClick={() => void send(`order ${m.name.toLowerCase()} to wait here`)}>
                        [{t('app.party.wait')}]
                      </button>
                    )}
                  </p>
                </div>
              ))}
              <button type="button" className="link" disabled={waiting} onClick={() => void send('talk party')}>
                [{t('app.party.talk')}]
              </button>{' '}
              <button type="button" className="link" disabled={waiting} onClick={() => void send('camp')}>
                [{t('app.party.camp')}]
              </button>{' '}
              <button type="button" className="link" onClick={() => openPage('party')}>
                [{t('app.party.opinions')}]
              </button>
            </>
          ) : (
            <p className="muted">{t('app.party.none')}</p>
          )}
        </section>
        <section>
          <h2>{t('app.journal.title')}</h2>
          <button type="button" className="link" onClick={() => openPage()}>
            [{t('app.journal.open')}]
          </button>{' '}
          <span className="muted small">{tn('app.journal.entries', journalCount)}</span>
          {openQuests.length > 0 && (
            <div className="journal-group">
              <h3>{t('app.journal.openQuests')}</h3>
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
          {journalCount === 0 && <p className="muted">{t('app.journal.empty')}</p>}
        </section>
        <section>
          <button type="button" className="link" onClick={() => setSettings('ai')}>
            [{t('app.menu.settings')}]
          </button>{' '}
          <button type="button" className="link" onClick={() => setEnding(true)}>
            [{t('app.menu.lookBack')}]
          </button>
          {client?.exportLog && (
            <>
              {' '}
              <button type="button" className="link" onClick={() => setExporting(true)}>
                [{t('app.menu.exportLog')}]
              </button>
            </>
          )}
          {client?.editor?.open && status?.builder && (
            <>
              {' '}
              <button type="button" className="link" onClick={() => void client.editor!.open!().catch((reason: unknown) => setError(String(reason)))}>
                [{t('app.menu.editor')}]
              </button>
            </>
          )}
        </section>
      </aside>

      <footer className="bar">
        {talk && (
          <div className="talkbar">
            <span className="talking">
              {t('app.talk.with', { name: talk.name, attitude: talk.attitude })}
            </span>
            {talk.proposal && (
              <span className="proposal">
                {talk.proposal.replace(/ YES to agree, NO to decline\.$/, '')}{' '}
                <button type="button" className="link" disabled={waiting} onClick={() => void send('yes')}>
                  [{t('app.talk.yes')}]
                </button>{' '}
                <button type="button" className="link" disabled={waiting} onClick={() => void send('no')}>
                  [{t('app.talk.no')}]
                </button>
              </span>
            )}
            {talk.options.map((option, index) => (
              <button key={option} type="button" className="link" disabled={waiting} onClick={() => (index === 3 || index === 4 ? (setInput(index === 3 ? 'ask about ' : 'where is '), inputRef.current?.focus()) : void send(String(index + 1)))}>
                {index + 1} {option}
              </button>
            ))}
            <button type="button" className="link" disabled={waiting} onClick={() => void send('bye')}>
              {t('app.talk.bye')}
            </button>
          </div>
        )}
        <div className="statusline">
          <span className="status">
            {status ? `${status.location}  |  ${status.time}  |  ${status.money}${status.paused && !status.talk ? `  |  ${t('app.status.paused')}` : ''}` : t('app.status.loading')}
          </span>
          {status?.wanted && <span className="wanted">{t('app.status.wanted', { crimes: status.wanted.join('; ') })}</span>}
          <button type="button" className="link journal-button" onClick={() => openPage()} title={t('app.status.journalTitle')}>
            [{t('app.status.journal')}]
          </button>
          {ai && roles && (
            <span className="ai-lights" aria-label={t('app.ai.lights')}>
              {roles.map((r) => (
                <span key={r.role} className={`ai-light${r.busy ? ' on' : ''}${r.last && !r.last.ok ? ' failed' : ''}`} title={lightTitle(r)} aria-label={lightTitle(r)} />
              ))}
            </span>
          )}
          {ai && (
            <button type="button" className={`link ai ${ai.tone}`} onClick={() => setSettings('usage')} title={t('app.ai.title')}>
              {ai.text}
            </button>
          )}
        </div>
        <label className="prompt">
          <span aria-hidden="true">{'>'}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={onKeyDown}
            aria-label={t('app.prompt.label')}
            placeholder={talk ? t('app.prompt.talking', { name: talk.call }) : t('app.prompt.idle')}
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
          about={about}
          render={(text) => renderText(text, onTopic, onMenu)}
          onSend={(text) => void send(text)}
          onJournal={() => setJournal({ nearby: true })}
        />
      )}
      {!talk && ended && status && (
        <ConversationView
          talk={ended.talk}
          lines={lines.filter((l) => l.id >= ended.from) as TalkLine[]}
          journal={status.journal}
          busy={false}
          about={about}
          render={(text) => renderText(text, onTopic, onMenu)}
          onSend={(text) => void send(text)}
          onJournal={() => setJournal({ nearby: true })}
          ended
          onClose={closeEnded}
        />
      )}
      {menu && (
        <div className="overlay topic-menu-backdrop" onClick={() => setMenu(undefined)} onContextMenu={(event) => (event.preventDefault(), setMenu(undefined))}>
          <div className="topic-menu" role="menu" aria-label={t('app.topicMenu.label', { topic: menu.topic })} style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
            <button type="button" role="menuitem" className="link" autoFocus onClick={() => fromMenu(`look ${menu.topic}`)}>
              {t('app.topicMenu.look')}
            </button>
            <button type="button" role="menuitem" className="link" onClick={() => fromMenu(`ask about ${menu.topic}`)}>
              {t('app.topicMenu.ask')}
            </button>
            <button type="button" role="menuitem" className="link" onClick={() => fromMenu(`where is ${menu.topic}`)}>
              {t('app.topicMenu.where')}
            </button>
            {!talk && (
              <button type="button" role="menuitem" className="link" onClick={() => fromMenu(`walk to ${menu.topic}`)}>
                {t('app.topicMenu.go')}
              </button>
            )}
          </div>
        </div>
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
      {exporting && client && <LogExport client={client} onClose={() => setExporting(false)} />}
      {settings && <Settings bridge={client?.ai} transcript={client?.transcript} tab={settings} onTab={setSettings} onClose={() => setSettings(undefined)} />}
      {DevMenu && dev && client && (
        <Suspense fallback={null}>
          <DevMenu
            client={client}
            onCommand={send}
            onClose={() => {
              setDev(false)
              inputRef.current?.focus()
            }}
          />
        </Suspense>
      )}
    </div>
  )
}
