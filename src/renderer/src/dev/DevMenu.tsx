import { useCallback, useEffect, useState } from 'react'
import type { DevSection, DevView, EngineClient } from '../client'
import { NpcInspector } from '../Inspector'
import { LogTab } from '../Settings'
import './dev.css'

// Under the bonnet (M10.1; roadmap "Onder de motorkap"): the running game as
// the systems see it. Only a development build bundles this file; the menu
// opens with @dev or Ctrl+Shift+D. It reads, and every change it makes is an
// @-command through the engine, so the game log records it and a replay
// comes out the same.

type Tab = DevSection | 'ai' | 'steer'

const TABS: [Tab, string][] = [
  ['people', 'People'],
  ['background', 'Background'],
  ['chronicler', 'Chronicler'],
  ['ai', 'AI'],
  ['steer', 'Steer'],
]

export default function DevMenu({ client, onCommand, onClose }: { client: EngineClient; onCommand: (text: string) => Promise<void>; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('people')
  const [focus, setFocus] = useState<string>()
  const [view, setView] = useState<DevView>()
  const refresh = useCallback(async () => {
    if (!client.dev || tab === 'ai') return
    setView(await client.dev.view(tab === 'steer' ? 'people' : tab, focus))
  }, [client, tab, focus])
  // Live: what the game does while the menu is open, every two seconds.
  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), 2000)
    return () => clearInterval(timer)
  }, [refresh])
  const act = async (text: string) => {
    await onCommand(text)
    await refresh()
  }
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Under the bonnet">
      <div className="panel dev-menu" data-dev-menu="">
        <header className="panel-head">
          <h2>Under the bonnet</h2>
          <nav className="tabs">
            {TABS.map(([id, label]) => (
              <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </nav>
          <span className="spacer" />
          <span className="muted small">{view?.now}</span>
          <button type="button" className="link" onClick={onClose}>
            [Close]
          </button>
        </header>
        <div className="dev-body">
          {tab === 'ai' ? client.ai ? <LogTab bridge={client.ai} /> : <p className="muted">No model gateway here: in the browser preview, open the page with ?mock=1.</p> : null}
          {tab === 'people' && view?.people && <People view={view} focus={focus} onFocus={setFocus} />}
          {tab === 'background' && view?.background && <Background view={view} />}
          {tab === 'chronicler' && view?.chronicler && <Chronicler view={view} />}
          {tab === 'steer' && view && <Steer view={view} client={client} act={act} />}
        </div>
      </div>
    </div>
  )
}

function People({ view, focus, onFocus }: { view: DevView; focus?: string; onFocus: (id: string) => void }) {
  const people = view.people!
  const p = people.person
  return (
    <div className="dev-columns">
      <ul className="dev-list small">
        {people.list.map((x) => (
          <li key={x.id}>
            <button type="button" className={`link${x.id === focus ? ' active' : ''}`} onClick={() => onFocus(x.id)}>
              {x.name}
            </button>{' '}
            <span className="muted">{x.where}</span>
          </li>
        ))}
      </ul>
      <div>
        {!p ? (
          <p className="muted">Pick someone on the left.</p>
        ) : (
          <NpcInspector npc={p}>
            <p className="muted">{p.faith ? `Holds to ${p.faith}.` : 'No faith named.'}</p>
            <h3>What steers them</h3>
            <table className="usage small">
              <tbody>
                {p.sliders.map((s) => (
                  <tr key={s.name}>
                    <th scope="row">{s.name}</th>
                    <td>{s.value}</td>
                    <td className="muted">{s.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {p.bonds.length > 0 && (
              <>
                <h3>Bonds</h3>
                <table className="usage small">
                  <thead>
                    <tr>
                      <th scope="col">with</th>
                      <th scope="col">affinity</th>
                      <th scope="col">trust</th>
                      <th scope="col">fear</th>
                      <th scope="col">familiarity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.bonds.map((b) => (
                      <tr key={b.who}>
                        <td>{b.who}</td>
                        <td>{b.affinity}</td>
                        <td>{b.trust}</td>
                        <td>{b.fear}</td>
                        <td>{b.familiarity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            <h3>Knows</h3>
            <ul className="check-list">{p.knows.length ? p.knows.map((k, i) => <li key={i}>{k}</li>) : <li className="muted">no news</li>}</ul>
            {p.thoughts.length > 0 && (
              <>
                <h3>On their mind</h3>
                <ul className="check-list">{p.thoughts.map((t, i) => <li key={i}>{t}</li>)}</ul>
              </>
            )}
          </NpcInspector>
        )}
      </div>
    </div>
  )
}

function Background({ view }: { view: DevView }) {
  const b = view.background!
  return (
    <div className="small">
      <h3>Signals waiting</h3>
      <ul className="check-list">{b.queue.length ? b.queue.map((s, i) => <li key={i}>{s}</li>) : <li className="muted">none</li>}</ul>
      <h3>Running plans</h3>
      {b.plans.length ? (
        b.plans.map((p) => (
          <details key={p.id} className="dev-plan">
            <summary>
              {p.name} <span className="muted">({p.source}{p.subjects.length ? `, for ${p.subjects.join(', ')}` : ''}, since {p.started}, {p.state})</span>
            </summary>
            <ul className="check-list">
              {p.steps.map((s) => (
                <li key={s.id}>
                  {s.id} <span className="muted">{s.verb}</span>: {s.state}
                  {s.held && <span className="warn"> held back by {s.held}</span>}
                </li>
              ))}
            </ul>
          </details>
        ))
      ) : (
        <p className="muted">none</p>
      )}
      <h3>Signals of late</h3>
      <ul className="check-list">{b.signals.length ? b.signals.map((s, i) => <li key={i}>{s}</li>) : <li className="muted">none</li>}</ul>
      <h3>Stock lines instead of the AI</h3>
      <ul className="check-list">{b.stock?.length ? b.stock.map((s, i) => <li key={i}>{s}</li>) : <li className="muted">none</li>}</ul>
      <h3>The guard this session</h3>
      <ul className="check-list">{b.guard?.length ? b.guard.map((s, i) => <li key={i}>{s}</li>) : <li className="muted">nothing yet</li>}</ul>
      <h3>Ledgers</h3>
      <table className="usage small">
        <thead>
          <tr>
            <th scope="col">settlement</th>
            <th scope="col">purse</th>
            <th scope="col">short</th>
            <th scope="col">surplus</th>
            <th scope="col">in store</th>
          </tr>
        </thead>
        <tbody>
          {b.ledgers.map((l) => (
            <tr key={l.id}>
              <td>{l.name}</td>
              <td>{l.purse}</td>
              <td className={l.short.length ? 'warn' : ''}>{l.short.join(', ')}</td>
              <td>{l.surplus.join(', ')}</td>
              <td className="muted">{l.stock.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Chronicler({ view }: { view: DevView }) {
  const c = view.chronicler!
  return (
    <div className="small">
      <h3>Waiting</h3>
      <ul className="check-list">{c.pending.length ? c.pending.map((p, i) => <li key={i}>{p}</li>) : <li className="muted">nothing</li>}</ul>
      <h3>Runs</h3>
      {c.runs.length ? (
        c.runs.map((r) => (
          <details key={r.run} className="dev-plan">
            <summary>
              {r.run} <span className="muted">({r.when}): {r.lines.join('; ')}</span>
              {r.problems.length > 0 && <span className="warn"> {r.problems.length} refused</span>}
            </summary>
            <p className="muted">Offered: {r.offered.join('; ') || 'no facts'}; {r.names} names it could use.</p>
            <p>Lore: {r.lore.join('; ') || 'none'}. Plans: {r.plans.join('; ') || 'none'}.</p>
            <ul className="check-list">{r.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            {r.problems.length > 0 && <ul className="check-list warn">{r.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          </details>
        ))
      ) : (
        <p className="muted">No runs with a model yet in this session. Without a model the templates write at once.</p>
      )}
      <h3>Open storylines</h3>
      <ul className="check-list">{c.lines.length ? c.lines.map((l, i) => <li key={i}>{l}</li>) : <li className="muted">none</li>}</ul>
    </div>
  )
}

function Steer({ view, client, act }: { view: DevView; client: EngineClient; act: (text: string) => Promise<void> }) {
  const c = view.choices
  const [plan, setPlan] = useState(c.plans[0] ?? '')
  const [realm, setRealm] = useState(c.realms[0] ?? '')
  const [delta, setDelta] = useState('10')
  const [item, setItem] = useState(c.items[0] ?? '')
  const [share, setShare] = useState('0.5')
  const [signal, setSignal] = useState(c.signals[0] ?? '')
  const [who, setWho] = useState('')
  const [budget, setBudget] = useState('0.25')
  return (
    <div className="dev-steer small">
      <p className="muted">Every button is an @-command: it shows in the game and goes into the game log, so a replay comes out the same.</p>
      <div>
        <button type="button" onClick={() => void act('@skip 1')}>
          Skip a day
        </button>
      </div>
      <div>
        <select value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan">
          {c.plans.map((p) => <option key={p}>{p}</option>)}
        </select>{' '}
        <button type="button" onClick={() => void act(`@plan ${plan}`)}>
          Start the plan
        </button>
      </div>
      <div>
        <select value={realm} onChange={(e) => setRealm(e.target.value)} aria-label="Realm">
          {c.realms.map((r) => <option key={r}>{r}</option>)}
        </select>{' '}
        <input value={delta} onChange={(e) => setDelta(e.target.value)} size={4} aria-label="Change in tension" />{' '}
        <button type="button" onClick={() => void act(`@tension ${realm} ${delta}`)}>
          Shift the tension
        </button>
      </div>
      <div>
        <select value={item} onChange={(e) => setItem(e.target.value)} aria-label="Good">
          {c.items.map((i) => <option key={i}>{i}</option>)}
        </select>{' '}
        <input value={share} onChange={(e) => setShare(e.target.value)} size={4} aria-label="Share that comes in" />{' '}
        <button type="button" onClick={() => void act(`@market ${item} ${share}`)}>
          Set the market
        </button>
      </div>
      <div>
        <select value={signal} onChange={(e) => setSignal(e.target.value)} aria-label="Signal">
          {c.signals.map((s) => <option key={s}>{s}</option>)}
        </select>{' '}
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="For whom">
          <option value="">nobody in particular</option>
          {c.people.map((p) => <option key={p}>{p}</option>)}
        </select>{' '}
        <button type="button" onClick={() => void act(`@signal ${signal}${who ? ` ${who}` : ''}`)}>
          Fire the signal
        </button>
      </div>
      <div>
        <input value={budget} onChange={(e) => setBudget(e.target.value)} size={5} aria-label="Budget in dollars an hour" />{' '}
        <button
          type="button"
          onClick={() => {
            const usd = Number(budget)
            if (!Number.isFinite(usd) || usd < 0) return
            void client.ai?.setBudget(usd)
            void act(`@budget ${usd}`)
          }}
        >
          Set the hourly budget
        </button>
      </div>
    </div>
  )
}
