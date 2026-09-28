import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { stringify } from 'yaml'
import { adoptPlaceEdits, DEFAULT_SIGNS, ENTITY_KINDS, exitTowards, KIND_NAMES, KNOBS, languageReference, markColours, MAX_SIGNS, parseEntityYaml, SIGN_SHAPES, signsOf, WORLD_STEPS, type KnobDef, type MapPlace, type ReferenceEntry, type Sign } from '../../engine'
import { StaleBanner } from './StaleBanner'
import { inline, Prose } from './Prose'
import type { DesignLog } from '../../engine/designlog'
import { NpcInspector } from './Inspector'
import { HexMap } from './HexMap'
import type { MapPalette, MapStyle, MapStyleName, PaletteView } from '../../engine'
import { createEditor, type DiffLine, type Edit, type EditorBridge, type EditorDraft, type EditorSave, type EditorView, type EntityKind, type Raw, type ShownChange, type SimReport, type WorldInfo } from './client'

// The editor (M8, FO chapter 15), in a window of its own: npm run editor, or
// [Editor] in a development build of the game. Every world in content/ can
// be opened; places and people have forms, everything else is edited as
// YAML. Saving checks the whole world first and writes only what changed;
// a running game picks it up at once. Beside the editing: the checks, a
// playtest without the player with an NPC inspector, and the chronicler,
// whose proposals are shown as a change and saved only when accepted.

type Panel = 'edit' | 'map' | 'palette' | 'voice' | 'knobs' | 'check' | 'contract' | 'playtest' | 'reference' | 'chronicler' | 'world'

const DIRECTIONS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'up', 'down', 'in', 'out']
const AXES = ['warmth', 'courage', 'honesty', 'temper', 'curiosity', 'diligence'] as const

export function EditorApp() {
  const [bridge, setBridge] = useState<EditorBridge>()
  const [worlds, setWorlds] = useState<WorldInfo[]>([])
  const [world, setWorld] = useState(() => new URLSearchParams(window.location.search).get('world') ?? 'base')
  const [view, setView] = useState<EditorView>()
  const [panel, setPanel] = useState<Panel>('edit')
  const [kind, setKind] = useState<EntityKind>('location')
  const [selected, setSelected] = useState<string>()
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string>()
  // What the contract tab asks the chronicler for (M10.17), put ready in its box.
  const [asking, setAsking] = useState<string>()
  // Worlds made in this window: the step-by-step building opens on them at once (after Bram's first try, M10.17).
  const [fresh, setFresh] = useState<string[]>([])

  useEffect(() => {
    document.title = 'Wisplight editor'
    createEditor()
      .then(async (b) => {
        setBridge(b)
        setWorlds(await b.worlds())
      })
      .catch((reason: unknown) => setError(String(reason)))
  }, [])

  const refresh = useCallback(async () => {
    if (!bridge) return
    try {
      setView(await bridge.view(world))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [bridge, world])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const open = (k: EntityKind, id?: string) => {
    setPanel('edit')
    setKind(k)
    setSelected(id)
    setCreating(false)
  }

  if (!bridge || !view)
    return (
      <div className="editor-app loading muted">
        <StaleBanner />
        {error ?? 'Opening the editor...'}
      </div>
    )

  return (
    <div className="editor-app">
      <StaleBanner />
      <header className="editor-head">
        <h1>Wisplight editor</h1>
        <label className="world-pick">
          <span className="muted small">World</span>
          <select
            value={world}
            onChange={(event) => {
              setWorld(event.target.value)
              setSelected(undefined)
              setCreating(false)
            }}
            aria-label="World"
          >
            {worlds.map((w) => (
              <option key={w.folder} value={w.folder}>
                {w.name} ({w.folder})
              </option>
            ))}
          </select>
        </label>
        <nav className="tabs">
          {(
            [
              ['edit', 'Edit'],
              ['map', 'Map'],
              ['palette', 'Palette'],
              ['voice', 'Voice'],
              ['knobs', 'Knobs'],
              ['check', `Check${view.problems.length ? ` (${view.problems.length} errors)` : view.warnings.length ? ` (${view.warnings.length})` : ''}`],
              ['contract', 'Contract'],
              ['playtest', 'Playtest'],
              ['reference', 'Reference'],
              ['chronicler', 'Chronicler'],
              ['world', 'New world'],
            ] as [Panel, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" className={panel === id ? 'active' : ''} onClick={() => setPanel(id)}>
              {label}
            </button>
          ))}
        </nav>
        <span className={view.problems.length ? 'error small' : 'ok small'}>{view.problems.length ? 'Does not load' : 'Loads'}</span>
      </header>

      {panel === 'edit' && (
        <div className="editor-body">
          <EntityList
            view={view}
            kind={kind}
            selected={creating ? undefined : selected}
            onKind={(k) => open(k)}
            onSelect={(id) => open(kind, id)}
            onNew={() => {
              setSelected(undefined)
              setCreating(true)
            }}
          />
          <main className="editor-main">
            {creating || selected ? (
              <EntityEditor
                key={`${world}:${kind}:${creating ? 'new' : selected}`}
                bridge={bridge}
                world={world}
                view={view}
                kind={kind}
                id={creating ? undefined : selected}
                saved={async (id) => {
                  await refresh()
                  // A new thing stays open as itself; a deleted one closes.
                  if (creating && id) {
                    setCreating(false)
                    setSelected(id)
                  } else if (!id) setSelected(undefined)
                }}
              />
            ) : (
              <Overview view={view} kind={kind} />
            )}
          </main>
        </div>
      )}
      {panel === 'map' && <MapPanel bridge={bridge} world={world} view={view} saved={refresh} open={open} />}
      {panel === 'palette' && <PalettePanel bridge={bridge} world={world} saved={refresh} />}
      {panel === 'voice' && <VoicePanel bridge={bridge} world={world} saved={refresh} />}
      {panel === 'knobs' && <KnobsPanel bridge={bridge} world={world} view={view} saved={refresh} />}
      {panel === 'check' && <CheckPanel view={view} open={open} />}
      {panel === 'playtest' && <PlaytestPanel bridge={bridge} world={world} />}
      {panel === 'reference' && <ReferencePanel />}
      {panel === 'contract' && (
        <ContractPanel
          view={view}
          book={() => bridge.worldBook(world)}
          propose={(ask) => {
            setAsking(ask)
            setPanel('chronicler')
          }}
        />
      )}
      {panel === 'chronicler' && <ChroniclerPanel key={asking ?? ''} bridge={bridge} world={world} focus={selected && !creating ? { kind, id: selected } : undefined} initial={asking} saved={refresh} open={open} />}
      {panel === 'world' && (
        <NewWorldPanel
          key={world}
          bridge={bridge}
          world={world}
          view={view}
          fresh={fresh.includes(world)}
          saved={refresh}
          made={async (folder) => {
            setWorlds(await bridge.worlds())
            setFresh((f) => [...f, folder])
            setWorld(folder)
            setSelected(undefined)
            setCreating(false)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------- the lists

function EntityList({ view, kind, selected, onKind, onSelect, onNew }: { view: EditorView; kind: EntityKind; selected?: string; onKind: (k: EntityKind) => void; onSelect: (id: string) => void; onNew: () => void }) {
  const [query, setQuery] = useState('')
  const groups = useMemo(() => {
    const words = query.trim().toLowerCase()
    const items = view.lists[kind].filter((e) => !words || e.name.toLowerCase().includes(words) || e.id.includes(words))
    const map = new Map<string, typeof items>()
    for (const item of items) map.set(item.group, [...(map.get(item.group) ?? []), item])
    return [...map]
  }, [view, kind, query])
  return (
    <aside className="editor-list">
      <select value={kind} onChange={(event) => onKind(event.target.value as EntityKind)} aria-label="Kind">
        {ENTITY_KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_NAMES[k]} ({view.lists[k].length})
          </option>
        ))}
      </select>
      <input className="editor-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="search..." aria-label="Search" spellCheck={false} />
      <button type="button" className="link" onClick={onNew}>
        [New]
      </button>
      {groups.map(([group, items]) => (
        <div key={group}>
          {group && <h3>{group}</h3>}
          {items.map((item) => (
            <button key={item.id} type="button" className={`link item ${item.id === selected ? 'active' : ''}`} onClick={() => onSelect(item.id)} title={item.id}>
              {item.name}
            </button>
          ))}
        </div>
      ))}
    </aside>
  )
}

function Overview({ view, kind }: { view: EditorView; kind: EntityKind }) {
  return (
    <div className="settings-body">
      <h2 className="editor-title">
        {view.world.name}: {KIND_NAMES[kind].toLowerCase()}
      </h2>
      <p className="muted small">
        Pick one on the left, or [New] for another. Saving checks the whole world first and writes only the lines that change, in content/{view.world.prefix}. A game that plays this world
        picks it up at once.
      </p>
      {kind === 'quest' && <QuestTable view={view} />}
      <p className="muted small">{view.files.length} files. Places: {view.lists.location.length}. People: {view.lists.npc.length}. Quests: {view.lists.quest.length}.</p>
    </div>
  )
}

function QuestTable({ view }: { view: EditorView }) {
  return (
    <table className="editor-table small">
      <thead>
        <tr>
          <th>Quest</th>
          <th>Stages</th>
          <th>Actions</th>
          <th>Endings</th>
          <th>Solutions</th>
        </tr>
      </thead>
      <tbody>
        {view.quests.map((q) => (
          <tr key={q.id}>
            <td>{q.name}</td>
            <td>{q.stages}</td>
            <td>{q.actions}</td>
            <td>{q.outcomes}</td>
            <td className={q.solutions >= 3 ? 'ok' : 'warn'}>{q.solutions}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------- one entity

function EntityEditor({ bridge, world, view, kind, id, saved }: { bridge: EditorBridge; world: string; view: EditorView; kind: EntityKind; id?: string; saved: (id?: string) => Promise<void> }) {
  const [loaded, setLoaded] = useState<{ raw: Raw; yaml: string; file: string }>()
  const [mode, setMode] = useState<'form' | 'yaml'>(kind === 'location' || kind === 'npc' ? 'form' : 'yaml')
  const [raw, setRaw] = useState<Raw>()
  const [yaml, setYaml] = useState('')
  const [result, setResult] = useState<EditorSave & { written?: boolean }>()
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [into, setInto] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!id) {
      const template = templateFor(kind, view)
      setRaw(template)
      setYaml(toYaml(template))
      return
    }
    void bridge.entity(world, kind, id).then((found) => {
      if (cancelled || !found) return
      setLoaded(found)
      setRaw(found.raw)
      setYaml(found.yaml)
    })
    return () => {
      cancelled = true
    }
  }, [bridge, world, kind, id, view])

  // The entity as it stands in the form or the YAML box.
  const current = (): { raw?: Raw; problem?: string } => (mode === 'yaml' ? parseEntityYaml(yaml) : { raw })

  const run = async (write: boolean) => {
    const read = current()
    if (!read.raw) return setResult({ ok: false, problems: [read.problem ?? 'Nothing to save.'], warnings: [], changes: [] })
    const target = String(read.raw['id'] ?? '')
    if (id && target !== id) return setResult({ ok: false, problems: ['The id cannot change. Make a new one and delete the old.'], warnings: [], changes: [] })
    setBusy(true)
    try {
      const outcome = await bridge.save(world, [{ kind, id: target, data: read.raw }], write)
      setResult({ ...outcome, written: write && outcome.ok })
      if (write && outcome.ok) await saved(target)
    } catch (reason) {
      setResult({ ok: false, problems: [reason instanceof Error ? reason.message : String(reason)], warnings: [], changes: [] })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!id) return
    setBusy(true)
    // It leaves a tombstone (M9.1): gone, or gone up in another of its kind.
    const outcome = await bridge.save(world, [{ kind, id, ...(into.trim() ? { into: into.trim() } : {}) }], true)
    setBusy(false)
    setResult({ ...outcome, written: outcome.ok })
    if (outcome.ok) await saved(undefined)
  }

  const switchMode = (next: 'form' | 'yaml') => {
    if (next === mode) return
    if (next === 'yaml' && raw) setYaml(toYaml(raw))
    if (next === 'form') {
      const read = parseEntityYaml(yaml)
      if (!read.raw) return setResult({ ok: false, problems: [read.problem ?? 'The YAML does not read.'], warnings: [], changes: [] })
      setRaw(read.raw)
    }
    setMode(next)
  }

  if (!raw) return <p className="muted">Loading...</p>
  const hasForm = kind === 'location' || kind === 'npc'
  return (
    <div className="settings-body">
      <header className="row">
        <h2 className="editor-title">{id ? String(raw['name'] ?? raw['title'] ?? id) : `A new ${KIND_NAMES[kind].toLowerCase().replace(/s$/, '')}`}</h2>
        <span className="muted small">{id ? `${id} in ${loaded?.file ?? ''}` : 'goes next to others of its kind'}</span>
        <span className="spacer" />
        {hasForm && (
          <nav className="tabs small">
            <button type="button" className={mode === 'form' ? 'active' : ''} onClick={() => switchMode('form')}>
              Form
            </button>
            <button type="button" className={mode === 'yaml' ? 'active' : ''} onClick={() => switchMode('yaml')}>
              YAML
            </button>
          </nav>
        )}
      </header>
      {mode === 'form' && kind === 'location' && <PlaceFields raw={raw} view={view} isNew={!id} onChange={setRaw} />}
      {mode === 'form' && kind === 'npc' && <PersonFields raw={raw} view={view} isNew={!id} onChange={setRaw} />}
      {mode === 'yaml' && (
        <>
          <textarea className="yaml-box" rows={Math.min(40, Math.max(12, yaml.split('\n').length + 2))} value={yaml} onChange={(event) => setYaml(event.target.value)} spellCheck={false} aria-label="YAML" />
          <p className="muted small">One {kind.replace('_', ' ')} as it stands in its list, with its id. The schemas in src/engine/content.ts say which fields there are.</p>
        </>
      )}
      {kind === 'region' && id && view.maps[id] && (
        <>
          <p className="muted small">The map the generator makes of the zones, every second row, with the places on it. Save to see a change drawn.</p>
          <pre className="map whole generated">{view.maps[id]}</pre>
        </>
      )}
      <div className="row">
        <button type="button" className="link" disabled={busy} onClick={() => void run(true)}>
          [Save]
        </button>
        <button type="button" className="link" disabled={busy} onClick={() => void run(false)}>
          [Check and show the change]
        </button>
        {id && (
          <button type="button" className="link" disabled={busy} onClick={() => (confirmDelete ? void remove() : setConfirmDelete(true))}>
            {confirmDelete ? '[Really delete it?]' : '[Delete]'}
          </button>
        )}
        {id && confirmDelete && (
          <label className="small">
            gone up in (an id, or empty for gone)
            <select value={into} onChange={(e) => setInto(e.target.value)} aria-label="Gone up in">
              <option value="">nothing: gone</option>
              {view.lists[kind]
                .filter((e) => e.id !== id)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.id}
                  </option>
                ))}
            </select>
          </label>
        )}
        {busy && <span className="muted small">Checking the whole world...</span>}
      </div>
      {result && <SaveResult result={result} />}
    </div>
  )
}

function SaveResult({ result }: { result: EditorSave & { written?: boolean } }) {
  if (!result.ok)
    return (
      <div className="warn small">
        <p>Not saved: the world would not load with this.</p>
        <ul className="check-list">
          {result.problems.slice(0, 12).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    )
  return (
    <div className="small">
      <p className="ok">{result.changes.length === 0 ? 'Nothing changed.' : result.written ? `Saved. ${result.changes.length} file${result.changes.length === 1 ? '' : 's'} changed.` : 'This loads. Not saved yet; this is what would change:'}</p>
      {result.warnings.length > 0 && <p className="muted">{result.warnings.length} things in the world deserve a look (see Check).</p>}
      <Diffs changes={result.changes} />
    </div>
  )
}

function Diffs({ changes }: { changes: ShownChange[] }) {
  return (
    <>
      {changes.map((change) => (
        <div key={change.path} className="diff">
          <p className="diff-file">
            {change.path}
            {change.fresh ? ' (new file)' : ''}
          </p>
          <pre>{change.lines.map((line, i) => <DiffRow key={i} line={line} />)}</pre>
        </div>
      ))}
    </>
  )
}

function DiffRow({ line }: { line: DiffLine }): ReactNode {
  const cls = line.kind === '+' ? 'add' : line.kind === '-' ? 'del' : line.kind === '@' ? 'hunk' : ''
  return <span className={cls}>{`${line.kind === '@' ? '' : `${line.kind} `}${line.text}\n`}</span>
}

// ---------------------------------------------------------------- forms

function PlaceFields({ raw, view, isNew, onChange }: { raw: Raw; view: EditorView; isNew: boolean; onChange: (raw: Raw) => void }) {
  const set = (field: string, value: unknown) => onChange(clean({ ...raw, [field]: value }))
  const description = (raw['description'] ?? {}) as { day?: string; night?: string }
  const exits = Object.entries((raw['exits'] ?? {}) as Record<string, { to: string; minutes?: number }>)
  const setExits = (list: [string, { to: string; minutes?: number }][]) => set('exits', Object.fromEntries(list.filter(([, e]) => e.to).map(([d, e]) => [d, e.minutes && e.minutes > 1 ? { to: e.to, minutes: e.minutes } : { to: e.to }])))
  const sentences = (description.day ?? '').split(/(?<=[.!?])\s+/).filter((s) => s.trim()).length
  return (
    <div className="builder-fields">
      {isNew && <Field label="Id (loc_...)" value={String(raw['id'] ?? '')} onChange={(v) => set('id', v)} />}
      <Field label="Name" value={String(raw['name'] ?? '')} onChange={(v) => set('name', v)} />
      <label>
        Area
        <select value={String(raw['area'] ?? '')} onChange={(e) => set('area', e.target.value)}>
          {view.lists.area.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </label>
      <Field label="Tags" value={list(raw['tags'])} onChange={(v) => set('tags', split(v))} hint="public, private, social, holy, landmark, one_way ..." />
      <Field label="Other names" value={list(raw['aliases'])} onChange={(v) => set('aliases', split(v))} />
      <Field label="In one line" value={String(raw['summary'] ?? '')} onChange={(v) => set('summary', v || undefined)} />
      <label>
        By day <textarea rows={5} value={(description.day ?? '').trim()} onChange={(e) => set('description', clean({ ...description, day: `${e.target.value.trim()}\n` }))} />
      </label>
      <p className={`small ${sentences < 3 || sentences > 5 ? 'warn' : 'muted'}`}>
        {sentences} sentences. Three to five, second person, present tense, one sense that is not sight, a hint at an exit. Topics in [brackets].
      </p>
      <label>
        By night <textarea rows={3} value={(description.night ?? '').trim()} onChange={(e) => set('description', clean({ ...description, night: e.target.value.trim() ? `${e.target.value.trim()}\n` : undefined }))} placeholder="(optional)" />
      </label>
      {/* A moment (M10.11): only for a place worth it, a card the first time; the YAML holds the mist, night and storm variants. */}
      <label>
        Arriving <textarea rows={3} value={String((raw['arrival'] as Raw | undefined)?.['text'] ?? '')} onChange={(e) => set('arrival', e.target.value.trim() ? { ...((raw['arrival'] as Raw | undefined) ?? {}), text: e.target.value.trim() } : undefined)} placeholder="(only for a place worth a moment: two or three sentences for the first time you reach it)" />
      </label>
      <label>
        Seen from afar <textarea rows={2} value={String((raw['arrival'] as Raw | undefined)?.['far'] ?? '')} disabled={!raw['arrival']} onChange={(e) => set('arrival', { ...((raw['arrival'] as Raw | undefined) ?? {}), far: e.target.value.trim() || undefined })} placeholder="(optional: when it rises into view as a landmark)" />
      </label>
      <fieldset>
        <legend>Exits</legend>
        {exits.map(([direction, exit], index) => (
          <div key={index} className="exit-row">
            <select value={direction} onChange={(e) => setExits(exits.map((x, i) => (i === index ? [e.target.value, x[1]] : x)))}>
              {DIRECTIONS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <select value={exit.to} onChange={(e) => setExits(exits.map((x, i) => (i === index ? [x[0], { ...x[1], to: e.target.value }] : x)))}>
              {view.lists.location.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.group})
                </option>
              ))}
            </select>
            <input className="amount" type="number" min={1} value={exit.minutes ?? 1} onChange={(e) => setExits(exits.map((x, i) => (i === index ? [x[0], { ...x[1], minutes: Number(e.target.value) || 1 }] : x)))} aria-label="Minutes" />
            <button type="button" className="link" onClick={() => setExits(exits.filter((_, i) => i !== index))}>
              [x]
            </button>
          </div>
        ))}
        <button type="button" className="link" onClick={() => setExits([...exits, [DIRECTIONS.find((d) => !exits.some(([x]) => x === d)) ?? 'north', { to: view.lists.location[0]?.id ?? '' }]])}>
          [Add exit]
        </button>
        <p className="muted small">The place on the other side gets the way back when it has none, and loses it when the exit goes (not for places tagged one_way).</p>
      </fieldset>
      <p className="muted small">Objects, shops and things lying about: in YAML.</p>
    </div>
  )
}

function PersonFields({ raw, view, isNew, onChange }: { raw: Raw; view: EditorView; isNew: boolean; onChange: (raw: Raw) => void }) {
  const set = (field: string, value: unknown) => onChange(clean({ ...raw, [field]: value }))
  const personality = (raw['personality'] ?? {}) as Record<string, number>
  const places = view.lists.location
  return (
    <div className="builder-fields">
      {isNew && <Field label="Id (npc_...)" value={String(raw['id'] ?? '')} onChange={(v) => set('id', v)} />}
      <Field label="Name" value={String(raw['name'] ?? '')} onChange={(v) => set('name', v)} />
      <Field label="Known as" value={String(raw['short'] ?? '')} onChange={(v) => set('short', v)} />
      <div className="row">
        <label>
          Pronoun
          <select value={String(raw['pronoun'] ?? 'they')} onChange={(e) => set('pronoun', e.target.value)}>
            {['she', 'he', 'they'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          Age <input className="amount" type="number" value={Number(raw['age'] ?? 30)} onChange={(e) => set('age', Number(e.target.value) || 0)} />
        </label>
        <label>
          Picture
          <select value={String(raw['portrait'] ?? 'unique')} onChange={(e) => set('portrait', e.target.value === 'unique' ? undefined : e.target.value)}>
            <option value="unique">a portrait of their own</option>
            <option value="generic">a plain figure</option>
          </select>
        </label>
      </div>
      <label>
        Trade
        <select value={String(raw['profession'] ?? '')} onChange={(e) => set('profession', e.target.value)}>
          {view.lists.profession.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Home
        <select value={String(raw['home'] ?? '')} onChange={(e) => set('home', e.target.value)}>
          {places.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.group})
            </option>
          ))}
        </select>
      </label>
      <label>
        Work
        <select value={String(raw['work'] ?? '')} onChange={(e) => set('work', e.target.value || undefined)}>
          <option value="">(none)</option>
          {places.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} ({l.group})
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Character</legend>
        {AXES.map((axis) => (
          <label key={axis} className="slider">
            {axis}
            <input type="range" min={-3} max={3} value={personality[axis] ?? 0} onChange={(e) => set('personality', { ...Object.fromEntries(AXES.map((a) => [a, personality[a] ?? 0])), [axis]: Number(e.target.value) })} />
            <span className="mono">{personality[axis] ?? 0}</span>
          </label>
        ))}
      </fieldset>
      <label>
        Looks <textarea rows={2} value={String(raw['appearance'] ?? '')} onChange={(e) => set('appearance', e.target.value)} />
      </label>
      <Field label="Voice" value={String(raw['speech'] ?? '')} onChange={(v) => set('speech', v || undefined)} />
      <label>
        Public facts, one per line
        <textarea rows={3} value={((raw['public_facts'] as string[] | undefined) ?? []).join('\n')} onChange={(e) => set('public_facts', e.target.value.split('\n').map((f) => f.trim()).filter(Boolean))} />
      </label>
      <p className="muted small">Relations, secrets, money, what they carry, and a companion's terms: in YAML.</p>
    </div>
  )
}

function Field({ label, value, onChange, hint }: { label: string; value: string; onChange: (value: string) => void; hint?: string }) {
  return (
    <label>
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={hint} spellCheck={false} />
    </label>
  )
}

const list = (value: unknown) => ((value as string[] | undefined) ?? []).join(', ')
const split = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

function clean(raw: Raw): Raw {
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined))
}

// ---------------------------------------------------------------- new things

function templateFor(kind: EntityKind, view: EditorView): Raw {
  const area = view.lists.area[0]?.id ?? 'first_area'
  const place = view.lists.location[0]?.id ?? 'loc_first_place'
  const trade = view.lists.profession[0]?.id ?? 'villager'
  switch (kind) {
    case 'location':
      return { id: 'loc_new_place', name: 'A New Place', area, tags: ['public'], description: { day: 'Three to five sentences, in the second person. Something you hear or smell. A hint at an exit.\n' }, exits: { north: { to: place } } }
    case 'area':
      return { id: 'new_area', name: 'A new area', kind: 'hamlet', summary: 'What it is, in one sentence.' }
    case 'watcher':
      return { id: 'new_watcher', signal: 'new_signal', when: [{ flag: 'something_happened' }], who: [], place, belang: 1 }
    case 'intention':
      return {
        id: 'new_intention',
        signal: 'new_signal',
        topic: 'new_topic',
        choice: { name: 'What they do', line: 'One line for the model: what this intention is.', open: {} },
        steps: [{ id: 'mind', do: { thought: '$a', text: 'What stays on their mind.', days: 7 } }],
      }
    case 'aftermath':
      return {
        id: 'new_aftermath',
        signal: 'new_signal',
        topic: 'new_topic',
        steps: [{ id: 'news', do: { tell: { kind: 'news', about: [], belang: 1, title: 'what happened', precise: 'What happened, exactly.', village: 'What the village says.', far: 'What they say far away.' } } }],
      }
    case 'npc':
      return { id: 'npc_new_person', name: 'New Person', short: 'the newcomer', pronoun: 'they', age: 30, profession: trade, home: place, appearance: 'What people see first.', personality: { warmth: 0, courage: 0, honesty: 0, temper: 0, curiosity: 0, diligence: 0 }, public_facts: ['What anyone may know about them.'] }
    case 'topic':
      return { id: 'new_topic', name: 'the new topic', kind: 'lore', summary: 'What most people know, in one sentence.', details: 'What those who know it well can add.', origin: area }
    case 'quest':
      return {
        id: 'new_quest',
        name: 'A New Quest',
        kind: 'request',
        summary: 'What it is about, for the designer.',
        givers: [],
        starts: { talk: [] },
        ask: 'What the giver says when it begins.',
        stages: [{ id: 'begun', text: 'The journal line while it runs.' }],
        actions: [{ id: 'first_way', say: ['do the first thing'], text: 'What happens.', effects: [{ set: 'first_way_done' }] }],
        outcomes: [
          { id: 'first', name: 'The first way', text: 'How it ends this way.', when: [{ flag: 'first_way_done' }] },
          { id: 'second', name: 'The second way', text: 'How it ends that way.', when: [{ flag: 'second_way_done' }] },
          { id: 'third', name: 'The third way', text: 'And the third.', when: [{ flag: 'third_way_done' }] },
        ],
      }
    case 'item':
      return { id: 'new_thing', name: 'new thing', description: 'What it looks like.', value: 1 }
    case 'object_type':
      return { id: 'new_object', name: 'new object', description: 'What it looks like.', affordances: [] }
    case 'profession':
      return { id: 'new_trade', name: 'new trade', schedule: [{ from: '07:00', to: '18:00', activity: 'work' }, { from: '18:00', to: '22:00', activity: 'home' }, { from: '22:00', to: '07:00', activity: 'sleep' }] }
    case 'news':
      return { id: 'new_rumour', title: 'the new rumour', place, belang: 1, text: { precise: 'What a witness says.', village: 'How it sounds a day later.', far: 'How it arrives far away.' } }
    case 'pattern':
      return { id: 'new_pattern', kind: 'lost_thing', belang: 1, items: [], text: { title: "{owner}'s lost {thing}", precise: '{owner} lost {their} {thing} near {place}.', village: '{owner} lost {their} {thing}.', far: 'Someone lost a {thing}.' } }
    case 'faction':
      return { id: 'new_faction', name: 'The New Faction', seat: area, wants: 'What they want.', stance: 'How they go about it.' }
    case 'realm':
      return { id: 'new_realm', name: 'The New Realm', ruler: 'Who rules it', capital: 'Its capital' }
    case 'settlement':
      return { id: area, tags: [], people: 20, use: {}, keep: {}, workshops: [] }
    case 'route':
      return { id: 'new_route', name: 'the new route', from: area, to: area, carries: {}, by: 'a cart', every: 1 }
    case 'outland':
      return { id: 'new_outland', name: 'A Place Beyond the Map', sends: [], asks: [], prices: 1, by: 'a pedlar', every: 7 }
    case 'resource':
      return { id: 'new_ground', name: 'new ground', gives: [] }
    case 'newcomer':
      return { id: 'new_household', trade: 'a_workshop_id', from: area, people: [{ role: 'head', age: [25, 45], profession: trade, looks: ['What people see first, with {their} and {man}.'] }], facts: ['{name} came from {from} to work in {area}.'] }
    case 'project':
      return { id: 'new_project', name: 'the new project', settlement: area, needs: {}, days: 10, cost: 0 }
    case 'prop':
      return { id: 'new_prop', type: 'strongbox', name: "{owner}'s chest", where: ['private'], lock: { quality: ['common'], material: ['iron'] }, items: [], hints: [{ precise: '{owner} keeps {things} in a chest at {place}.', village: '{owner} has a chest at home, they say.', far: 'Someone keeps a locked chest.' }] }
    case 'craft':
      return { id: 'new_craft', name: 'the new craft', maker: 'maker', skill: 'crafting', professions: trade ? [trade] : [], techniques: [{ id: 'first_technique', name: 'the first technique' }] }
    case 'passage':
      // M10.12: a line of transport, with its stops (places, or the topics of far places) and its days.
      return { id: 'new_passage', name: 'the new coach', kind: 'coach', stops: [place, place], days: [], departs: ['08:00'], fare: 10, text: 'You pay {fare} and climb aboard. After {duration} you get down at {place}.' }
    case 'background': {
      // M10.9: why you came, whom to ask for first, and what you heard.
      const contact = view.lists.npc[0]?.id
      return { id: 'new_background', name: 'New background', skills: ['athletics', 'perception'], talent: 'haggler', knows: contact ? [contact] : [], topics: [], reason: 'Why you came here, in two sentences in the second person, with the names of this world.', ...(contact ? { contact } : {}) }
    }
    default:
      return { id: `new_${kind}` }
  }
}

/** The same writer as the files, for a thing that is not saved yet. */
function toYaml(raw: Raw): string {
  return stringify(raw, { lineWidth: 0 })
}

/** People who came in the playtest, to look over and write into the world (M8.5), and what was built. */
function Grown({ bridge, world, grown }: { bridge: EditorBridge; world: string; grown: SimReport['grown'] }) {
  const [done, setDone] = useState<Record<string, string>>({})
  const adopt = async (household: SimReport['grown']['households'][number]) => {
    // With the ids they had in the game (M9.1); refused if the world has these ids already.
    const result = await bridge.save(world, household.people.map((p) => ({ kind: 'npc' as const, id: String(p['id']), data: p, create: true })))
    setDone((d) => ({ ...d, [household.id]: result.ok ? 'written into the world' : result.problems.join('; ') }))
  }
  const adoptPlace = async (place: SimReport['grown']['places'][number]) => {
    // The same id as in the game (M9.1): the place, the way in, and the project without them.
    const project = await bridge.entity(world, 'project', place.project)
    const link = project?.raw['link'] as { from: string } | undefined
    const from = link ? await bridge.entity(world, 'location', link.from) : undefined
    const edits = project ? adoptPlaceEdits(project.raw, from?.raw) : []
    const result = edits.length ? await bridge.save(world, edits) : { ok: false, problems: ['the project has no place to adopt'] }
    setDone((d) => ({ ...d, [place.id]: result.ok ? 'written into the world' : result.problems.join('; ') }))
  }
  if (!grown.households.length && !grown.built.length) return <p className="muted small">Nobody came and nothing was built.</p>
  return (
    <>
    <p className="muted small">Adopt writes a household into the world as people like any. Name the head among those who work the workshop (named), or the trade stays missing.</p>
    <ul className="check-list small">
      {grown.households.map((h) => (
        <li key={h.id}>
          {h.names.join(', ')}{' '}
          {done[h.id] ? (
            <span className="muted">{done[h.id]}</span>
          ) : (
            <button type="button" className="link" onClick={() => void adopt(h)}>
              [Adopt]
            </button>
          )}
          <details>
            <summary className="small">As content</summary>
            <pre className="small">{h.people.map((p) => stringify(p)).join('---\n')}</pre>
          </details>
        </li>
      ))}
      {grown.built.map((b) => (
        <li key={b}>{b}</li>
      ))}
      {(grown.places ?? []).map((p) => (
        <li key={p.id}>
          {p.name} ({p.id}), made by the project{' '}
          {done[p.id] ? (
            <span className="muted">{done[p.id]}</span>
          ) : (
            <button type="button" className="link" onClick={() => void adoptPlace(p)}>
              [Adopt]
            </button>
          )}
        </li>
      ))}
    </ul>
    </>
  )
}

// ---------------------------------------------------------------- the reference

/** The plan language (M8.3): the same text as in CHRONICLER.md, from the schemas and the permission table. */
function ReferencePanel() {
  const reference = useMemo(() => languageReference(), [])
  const [filter, setFilter] = useState('')
  const shown = (entries: ReferenceEntry[]) => entries.filter((e) => !filter || `${e.name} ${e.text}`.toLowerCase().includes(filter.toLowerCase()))
  const who = (e: ReferenceEntry) => (e.who ? ['rules', 'brain', 'chronicler'].filter((k) => e.who![k as keyof typeof e.who]).join(', ') || 'content only' : '')
  const section = (title: string, entries: ReferenceEntry[]) =>
    shown(entries).length > 0 && (
    <>
      <h2 className="editor-title">{title}</h2>
      <ul className="check-list small">
        {shown(entries).map((e) => (
          <li key={`${title}:${e.name}`}>
            <strong>
              <code>{e.name}</code>
            </strong>
            : {e.text}
            {e.who && <span className="muted"> ({who(e)})</span>}
            {e.form && <div className="muted">{e.form}</div>}
          </li>
        ))}
      </ul>
    </>
  )
  return (
    <div className="settings-body editor-page">
      <p className="muted small">Watchers, the standard aftermath, intentions, plans and quests speak one language. This is it, read from the schemas; content/CHRONICLER.md holds the same text for the chronicler.</p>
      <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Look up a condition or verb" aria-label="Look up" />
      {section('A step', reference.step)}
      {section('Conditions', reference.conditions)}
      {section('Verbs', reference.verbs)}
      {section('Selectors', reference.selectors)}
      {section('Bindings', reference.bindings)}
    </div>
  )
}

// ---------------------------------------------------------------- the checks

function CheckPanel({ view, open }: { view: EditorView; open: (kind: EntityKind, id?: string) => void }) {
  const target = (line: string): { kind: EntityKind; id: string } | undefined => {
    const id = /(?:^|quest |topic )((?:loc|npc)_[a-z0-9_]+|[a-z0-9_]+)(?=[:. ])/.exec(line)?.[1]
    if (!id) return undefined
    for (const kind of ENTITY_KINDS) if (view.lists[kind].some((e) => e.id === id)) return { kind, id }
    return undefined
  }
  const row = (line: string) => {
    const t = target(line)
    return (
      <li key={line}>
        {t ? (
          <button type="button" className="link" onClick={() => open(t.kind, t.id)}>
            {line}
          </button>
        ) : (
          line
        )}
      </li>
    )
  }
  return (
    <div className="settings-body editor-page">
      <h2 className="editor-title">Errors {view.problems.length === 0 && <span className="ok small">none: {view.world.name} loads</span>}</h2>
      <ul className="check-list">{view.problems.map(row)}</ul>
      <h2 className="editor-title">Worth a look ({view.warnings.length})</h2>
      <ul className="check-list small">{view.warnings.map(row)}</ul>
      {view.suspect.length > 0 && (
        <>
          <h2 className="editor-title">Reads like an instruction to the model ({view.suspect.length})</h2>
          <p className="muted small">
            This text looks like an instruction to the model, not a description of the world. The game marks all world text as description, and every effect still goes through the rules, but a world from someone else could try this. Rewrite it as something the world says.
          </p>
          <ul className="check-list small">{view.suspect.map((s) => row(`${s.where}: ${s.field ? `${s.field}: ` : ''}"${s.text}"`))}</ul>
        </>
      )}
      <h2 className="editor-title">Descriptions ({view.descriptions.places.length})</h2>
      <p className="muted small">
        {view.descriptions.summary} The rules: three to five sentences, second person, present tense, a sense that is not sight, a hint at one way out rather than a list, topics in [brackets], and no two places that open alike.
      </p>
      <ul className="check-list small">{view.descriptions.places.map(row)}</ul>
      <h2 className="editor-title">Named, but no detail ({view.scenery.length})</h2>
      <p className="muted small">Things a description brings in that nothing here answers to. LOOK still finds the sentence they are in; a detail (details: in the place) gives each its own look, and lines for TAKE and other verbs such as DRINK or CLIMB.</p>
      <ul className="check-list small">{view.scenery.map(row)}</ul>
      <h2 className="editor-title">Quests</h2>
      <QuestTable view={view} />
      <h2 className="editor-title">Settlements ({view.economy.length})</h2>
      <p className="muted small">What each lives on, from its ledger, its character and its routes. Goods used but made nowhere are under Worth a look.</p>
      <ul className="check-list small">
        {view.economy.map((s) => (
          <li key={s.id}>
            <button type="button" className="link" onClick={() => open('settlement', s.id)}>
              {s.name}
            </button>
            : lives on {s.livesOn ?? 'nothing it makes'}
            {s.tags.length > 0 && `, ${s.tags.join(', ')}`}, openness {s.openness >= 0 ? '+' : ''}
            {s.openness}, {s.people} nameless
            {s.makes.map((m) => (
              <div key={m} className="muted">
                makes {m}
              </div>
            ))}
            {s.routes.map((r) => (
              <div key={r} className="muted">
                {r}
              </div>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------- playtest

// ---------------------------------------------------------------- the map

/**
 * The places of an area on a map in km (M9.1). Drag a place to move it (its
 * pos); shift-drag from one place to another for a way between them (the way
 * back comes with it). Places without a position of their own stand in a ring
 * round their area, hollow, until they are moved.
 */
function MapPanel({ bridge, world, view, saved, open }: { bridge: EditorBridge; world: string; view: EditorView; saved: () => Promise<void>; open: (kind: EntityKind, id?: string) => void }) {
  const areas = useMemo(() => [...new Set(view.places.map((p) => p.area))].sort(), [view.places])
  const [area, setArea] = useState(() => areas.find((a) => view.places.filter((p) => p.area === a && p.pos).length > 2) ?? areas[0] ?? '')
  const [drag, setDrag] = useState<{ id: string; link: boolean; at: [number, number] } | undefined>()
  const [note, setNote] = useState('')
  const shown = view.places.filter((p) => p.area === area)
  const byId = new Map(view.places.map((p) => [p.id, p]))
  // Ways out of the area show as far as the next place.
  const xs = shown.map((p) => p.at[0])
  const ys = shown.map((p) => p.at[1])
  const pad = 0.15
  // Room on the right for the names.
  const box = shown.length ? [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(0.6, Math.max(...xs) - Math.min(...xs)) * 1.35 + 2 * pad, Math.max(0.4, Math.max(...ys) - Math.min(...ys)) + 2 * pad] : [0, 0, 1, 1]
  const unit = Math.max(box[2]!, box[3]!) / 110
  const toMap = (event: React.MouseEvent<SVGSVGElement>): [number, number] => {
    const svg = event.currentTarget
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const p = point.matrixTransform(svg.getScreenCTM()!.inverse())
    return [p.x, p.y]
  }
  const nearest = (at: [number, number], except: string): MapPlace | undefined =>
    shown.filter((p) => p.id !== except).sort((a, b) => Math.hypot(a.at[0] - at[0], a.at[1] - at[1]) - Math.hypot(b.at[0] - at[0], b.at[1] - at[1]))[0]
  const save = async (edits: Edit[], done: string) => {
    const result = await bridge.save(world, edits)
    setNote(result.ok ? done : result.problems.join('; '))
    if (result.ok) await saved()
  }
  const drop = async (event: React.MouseEvent<SVGSVGElement>) => {
    const d = drag
    setDrag(undefined)
    if (!d) return
    const place = byId.get(d.id)!
    const at = toMap(event)
    const entity = await bridge.entity(world, 'location', d.id)
    if (!entity) return
    if (d.link) {
      const to = nearest(at, d.id)
      if (!to || Math.hypot(to.at[0] - at[0], to.at[1] - at[1]) > unit * 4) return setNote('Drop on a place to make a way to it.')
      const direction = exitTowards(place.at, to.at)
      const exits = (entity.raw['exits'] as Raw | undefined) ?? {}
      if (exits[direction]) return setNote(`${place.name} has a way ${direction} already.`)
      return save([{ kind: 'location', id: d.id, data: { ...entity.raw, exits: { ...exits, [direction]: { to: to.id } } } }], `A way ${direction} from ${place.name} to ${to.name}, and back.`)
    }
    if (Math.hypot(at[0] - place.at[0], at[1] - place.at[1]) < unit / 2) return open('location', d.id)
    // To ten metres: a village is a kilometre across.
    const pos = [Math.round(at[0] * 100) / 100, Math.round(at[1] * 100) / 100]
    return save([{ kind: 'location', id: d.id, data: { ...entity.raw, pos } }], `${place.name} now lies at ${pos[0]}, ${pos[1]} km.`)
  }
  return (
    <div className="editor-page">
      <p className="muted small">
        Drag a place to move it; shift-drag from one place to another for a way between them (the way back comes too). Click a place to open it. Hollow places have no position of their own yet.{' '}
        <label>
          Area{' '}
          <select value={area} onChange={(e) => setArea(e.target.value)}>
            {areas.map((a) => (
              <option key={a} value={a}>
                {view.lists.area.find((x) => x.id === a)?.name ?? a}
              </option>
            ))}
          </select>
        </label>
      </p>
      {note && <p className="small">{note}</p>}
      <svg
        className="place-map"
        viewBox={box.join(' ')}
        onMouseMove={(e) => drag && setDrag({ ...drag, at: toMap(e) })}
        onMouseUp={(e) => void drop(e)}
        onMouseLeave={() => setDrag(undefined)}
        role="img"
        aria-label={`Map of ${area}`}
      >
        {shown.flatMap((p) =>
          p.exits
            .filter((e) => byId.has(e.to))
            .map((e) => {
              const to = byId.get(e.to)!
              return <line key={`${p.id}-${e.direction}`} x1={p.at[0]} y1={p.at[1]} x2={to.at[0]} y2={to.at[1]} className={to.area === area ? 'way' : 'way out'} strokeWidth={unit / 5} />
            }),
        )}
        {drag?.link && <line x1={byId.get(drag.id)!.at[0]} y1={byId.get(drag.id)!.at[1]} x2={drag.at[0]} y2={drag.at[1]} className="way new" strokeWidth={unit / 4} />}
        {shown.map((p) => {
          const at = drag && !drag.link && drag.id === p.id ? drag.at : p.at
          return (
            <g key={p.id} onMouseDown={(e) => setDrag({ id: p.id, link: e.shiftKey, at: p.at })}>
              <circle cx={at[0]} cy={at[1]} r={unit} className={p.pos ? 'place' : 'place loose'} strokeWidth={unit / 3} />
              <text x={at[0] + unit * 1.6} y={at[1] + unit * 0.6} fontSize={unit * 1.9}>
                {p.name}
              </text>
              <title>{`${p.name} (${p.id})${p.pos ? `, ${p.pos[0]}, ${p.pos[1]} km` : ', no position of its own'}`}</title>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function PlaytestPanel({ bridge, world }: { bridge: EditorBridge; world: string }) {
  const [days, setDays] = useState(7)
  const [seed, setSeed] = useState(1)
  const [report, setReport] = useState<SimReport>()
  const [busy, setBusy] = useState(false)
  const [person, setPerson] = useState<string>()
  const [error, setError] = useState<string>()
  const run = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const next = await bridge.simulate(world, days, seed)
      setReport(next)
      setPerson((p) => p ?? next.people[0]?.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setBusy(false)
    }
  }
  const npc = report?.people.find((p) => p.id === person)
  return (
    <div className="settings-body editor-page">
      <div className="row">
        <span>Run the world without the player for</span>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Days">
          {[1, 3, 7, 14, 30].map((d) => (
            <option key={d} value={d}>
              {d} day{d === 1 ? '' : 's'}
            </option>
          ))}
        </select>
        <label>
          seed <input className="amount" type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 1)} />
        </label>
        <button type="button" className="link" disabled={busy} onClick={() => void run()}>
          [Run]
        </button>
        {busy && <span className="muted small">The world is living...</span>}
      </div>
      {error && <p className="error small">{error}</p>}
      {report && (
        <>
          <p className="small">
            {report.world}, {report.from} to {report.to}.{' '}
            {report.problems.length ? <span className="warn">{report.problems.length} problems.</span> : <span className="ok">Nobody starved or got stuck.</span>}
          </p>
          {report.problems.length > 0 && (
            <ul className="check-list small warn">
              {report.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="columns">
            <div>
              <h3>Quests</h3>
              <ul className="check-list small">
                {report.quests.map((q) => (
                  <li key={q.id}>
                    {q.name}: <span className="muted">{q.state}</span>
                  </li>
                ))}
              </ul>
              <h3>News of weight</h3>
              <ul className="check-list small">{report.news.length ? report.news.map((n) => <li key={n}>{n}</li>) : <li className="muted">none</li>}</ul>
              <h3>Newcomers and building</h3>
              <Grown bridge={bridge} world={world} grown={report.grown} />
              <h3>Storylines</h3>
              <ul className="check-list small">{report.lines.length ? report.lines.map((l, i) => <li key={`l${i}`}>{l}</li>) : <li className="muted">none</li>}</ul>
              <h3>Signals and plans</h3>
              <ul className="check-list small">
                {report.plans.length ? report.plans.map((p, i) => <li key={`p${i}`}>{p}</li>) : <li className="muted">no plans</li>}
              </ul>
              <details>
                <summary className="small">The signals ({report.signals.length})</summary>
                <ul className="check-list small">
                  {report.signals.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </details>
              <details>
                <summary className="small">The days</summary>
                <ul className="check-list small">
                  {report.diary.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </details>
            </div>
            <div>
              <h3>NPC inspector</h3>
              <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person">
                {report.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {npc && <NpcInspector npc={npc} />}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- the chronicler

function ChroniclerPanel({ bridge, world, focus, initial, saved, open }: { bridge: EditorBridge; world: string; focus?: { kind: EntityKind; id: string }; initial?: string; saved: () => Promise<void>; open: (kind: EntityKind, id?: string) => void }) {
  const [ask, setAsk] = useState(initial ?? '')
  const [withFocus, setWithFocus] = useState(Boolean(focus))
  const [draft, setDraft] = useState<EditorDraft>()
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<EditorSave>()
  const send = async () => {
    if (!ask.trim()) return
    setBusy(true)
    setOutcome(undefined)
    try {
      setDraft(await bridge.draft(world, ask.trim(), withFocus ? focus : undefined))
    } catch (reason) {
      setDraft({ say: '', questions: [], changes: [], problems: [reason instanceof Error ? reason.message : String(reason)], diffs: [] })
    } finally {
      setBusy(false)
    }
  }
  const accept = async () => {
    if (!draft) return
    setBusy(true)
    // Entities, keys of world.yaml and whole files alike (M10.17).
    const result = await bridge.saveDraft(world, draft)
    setBusy(false)
    setOutcome(result)
    if (result.ok) {
      setDraft(undefined)
      await saved()
    }
  }
  return (
    <div className="settings-body editor-page">
      <p className="muted small">
        Ask the chronicler for something new or for a change. The proposal is shown as a change and checked against the world; nothing is saved until you accept it. The chronicler follows
        content/CHRONICLER.md and this world&apos;s own part of it.
      </p>
      <textarea rows={4} value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="For example: a small hamlet north of here, with three people and a story." aria-label="Ask the chronicler" />
      <div className="row">
        {focus && (
          <label className="check">
            <input type="checkbox" checked={withFocus} onChange={(e) => setWithFocus(e.target.checked)} /> with {focus.id} in view
          </label>
        )}
        <button type="button" className="link" disabled={busy || !ask.trim()} onClick={() => void send()}>
          [Ask]
        </button>
        {busy && <span className="muted small">The chronicler is writing...</span>}
      </div>
      {draft && <DraftView draft={draft} busy={busy} accept={() => void accept()} drop={() => setDraft(undefined)} />}
      {outcome && (
        <div className="small">
          {outcome.ok ? <p className="ok">Saved. {outcome.changes.length} files changed.</p> : <SaveResult result={outcome} />}
          {outcome.ok && (
            <button type="button" className="link" onClick={() => open('location')}>
              [Back to editing]
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** A proposal of the chronicler: what it says and asks, what it changes as diffs, and accept or throw away. */
/**
 * The polish round of the place descriptions (M10.20): a safety net after the
 * steps, offered for the places the Check names under Descriptions, or those
 * the designer ticks. The chronicler rewrites only their descriptions; each
 * place can be taken or left, and the choice goes in the design log.
 */
function PolishPlaces({ bridge, world, view, saved, counted }: { bridge: EditorBridge; world: string; view: EditorView; saved: () => Promise<void>; counted: () => void }) {
  const flagged = useMemo(() => view.descriptions.places.map((line) => line.slice(0, line.indexOf(':'))), [view.descriptions.places])
  const [picked, setPicked] = useState<Set<string>>(() => new Set(flagged))
  const [draft, setDraft] = useState<EditorDraft>()
  const [taken, setTaken] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<EditorSave>()
  useEffect(() => setPicked(new Set(flagged)), [flagged])
  const places = view.lists.location ?? []
  if (!places.length) return null
  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }
  const polish = async (light: boolean) => {
    setBusy(true)
    setOutcome(undefined)
    try {
      const d = await bridge.polish(world, { ids: [...picked], light })
      setDraft(d)
      setTaken(new Set(d.changes.map((c) => c.id)))
    } catch (reason) {
      setDraft({ say: '', questions: [], changes: [], problems: [reason instanceof Error ? reason.message : String(reason)], diffs: [] })
    } finally {
      setBusy(false)
      counted()
    }
  }
  const accept = async () => {
    if (!draft) return
    setBusy(true)
    const changes = draft.changes.filter((c) => taken.has(c.id))
    const result = await bridge.saveDraft(world, { changes })
    setBusy(false)
    setOutcome(result)
    if (!result.ok) return
    const left = draft.changes.filter((c) => !taken.has(c.id)).map((c) => c.id)
    await bridge.design(world, { decision: { step: 'Polish the places', decision: 'accepted', asked: [...picked].join(', '), say: draft.say, questions: [], changed: changes.map((c) => `location ${c.id}: description`), reason: left.length ? `Left as they were: ${left.join(', ')}` : '' } })
    setDraft(undefined)
    await saved()
  }
  return (
    <section className="polish">
      <h3>Polish the places</h3>
      <p className="muted small">
        {view.descriptions.summary} A safety net after the steps: the chronicler rewrites only the descriptions of the places you tick, by the place rules and in the voice of this world, and you take each place or leave it. The Check&apos;s places are ticked.
      </p>
      <ul className="check-list small">
        {places.map((p) => (
          <li key={p.id}>
            <label className="check">
              <input type="checkbox" checked={picked.has(p.id)} onChange={() => setPicked((s) => toggle(s, p.id))} /> {p.name}
              {flagged.includes(p.id) ? <span className="muted"> ({view.descriptions.places.find((l) => l.startsWith(`${p.id}:`))?.slice(p.id.length + 2)})</span> : ''}
            </label>
          </li>
        ))}
      </ul>
      <div className="row">
        <button type="button" className="link" disabled={busy || picked.size === 0} onClick={() => void polish(true)} title="With the lighter model you chose for the brain">
          [Polish {picked.size} place{picked.size === 1 ? '' : 's'}]
        </button>
        <button type="button" className="link" disabled={busy || picked.size === 0} onClick={() => void polish(false)}>
          [with the chronicler&apos;s model]
        </button>
        {busy && <span className="muted small">The chronicler is polishing...</span>}
      </div>
      {draft && (
        <div className="draft">
          {draft.say && <Prose text={draft.say} />}
          {draft.problems.length > 0 && (
            <ul className="check-list small warn">
              {draft.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {draft.descriptions && <p className="small muted">After: {draft.descriptions.summary}</p>}
          <ul className="check-list small">
            {draft.changes.map((c) => (
              <li key={c.id}>
                <label className="check">
                  <input type="checkbox" checked={taken.has(c.id)} onChange={() => setTaken((s) => toggle(s, c.id))} /> take {places.find((p) => p.id === c.id)?.name ?? c.id}
                </label>
              </li>
            ))}
          </ul>
          <Diffs changes={draft.diffs} />
          <div className="row">
            {draft.problems.length === 0 && taken.size > 0 && (
              <button type="button" className="link" disabled={busy} onClick={() => void accept()}>
                [Accept the {taken.size} ticked]
              </button>
            )}
            <button type="button" className="link" onClick={() => setDraft(undefined)}>
              [Throw it away]
            </button>
          </div>
        </div>
      )}
      {outcome && (outcome.ok ? <p className="ok small">Saved. {outcome.changes.length} files changed.</p> : <SaveResult result={outcome} />)}
    </section>
  )
}

function DraftView({ draft, busy, accept, drop, fix }: { draft: EditorDraft; busy: boolean; accept: () => void; drop: () => void; fix?: () => void }) {
  const parts = [
    ...draft.changes.map((c) => `${c.yaml.trim() ? (c.merge ? 'add to ' : '') : 'delete '}${c.kind.replace('_', ' ')} ${c.id}`),
    ...(draft.world ? [`world.yaml: ${Object.keys(parseEntityYaml(draft.world).raw ?? {}).join(', ')}`] : []),
    ...(draft.rules ? [`rules: ${Object.keys(parseEntityYaml(draft.rules).raw ?? {}).join(', ')}`] : []),
    ...(draft.files ?? []).map((f) => f.path),
  ]
  return (
    <div className="draft">
      {draft.say && <Prose text={draft.say} />}
      {draft.questions.length > 0 && (
        <ul className="check-list">
          {draft.questions.map((q) => (
            <li key={q}>{inline(q)}</li>
          ))}
        </ul>
      )}
      {draft.problems.length > 0 && (
        <div className="warn small">
          <p>The proposal does not load as it is:</p>
          <ul className="check-list">
            {draft.problems.slice(0, 10).map((p) => (
              <li key={p}>{p}</li>
            ))}
            {draft.problems.length > 10 && <li>and {draft.problems.length - 10} more</li>}
          </ul>
        </div>
      )}
      {parts.length > 0 && (
        <p className="small muted">
          {parts.length} change{parts.length === 1 ? '' : 's'}: {parts.join(', ')}
        </p>
      )}
      {draft.descriptions && (
        <div className="small">
          <p className="muted">How its places read, before you accept (M10.20): {draft.descriptions.summary}</p>
          {draft.descriptions.places.length > 0 && (
            <ul className="check-list small">
              {draft.descriptions.places.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <Diffs changes={draft.diffs} />
      <div className="row">
        {draft.diffs.length > 0 && draft.problems.length === 0 && (
          <button type="button" className="link" disabled={busy} onClick={accept}>
            [Accept and save]
          </button>
        )}
        {fix && draft.problems.length > 0 && (draft.changes.length > 0 || draft.world || (draft.files?.length ?? 0) > 0) && (
          <button type="button" className="link" disabled={busy} onClick={fix} title="The chronicler gets the problems and corrects only what they name">
            [Let the chronicler put it right]
          </button>
        )}
        <button type="button" className="link" onClick={drop}>
          [Throw it away]
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the contract (M10.17)

/**
 * What a world can have (the content contract, docs/CONTENT.md): per kind
 * what the game does with it and whether this world has it; for an empty one
 * what happens without it, and the chronicler to propose it. Below, the keys
 * of world.yaml this world sets, and those that take the neutral default.
 */
function ContractPanel({ view, propose, book }: { view: EditorView; propose: (ask: string) => void; book: () => Promise<{ markdown: string; saved?: string }> }) {
  const unset = view.worldKeys.filter((k) => !k.set).map((k) => k.key)
  const [saved, setSaved] = useState<string>()
  return (
    <div className="settings-body editor-page">
      <p className="muted small">
        Everything a world can have, from the schemas (docs/CONTENT.md). What a world leaves out works with a neutral default, never with another world&apos;s. The chronicler can propose
        what is empty; nothing is saved until you accept it.
      </p>
      <p className="small">
        The world book (WORLDBOOK.md next to the content) is written again on every save. As a page it is the atlas of the whole world, with the map, the places and the portraits there are, secrets and all: for the designer, not for players, who save what they found out from the game.{' '}
        <button type="button" className="link" onClick={() => void book().then((r) => setSaved(r.saved ?? 'not saved'))}>
          [Save the world book as an atlas page]
        </button>
        {saved && <span className="muted"> {saved}</span>}
      </p>
      <table className="quest-table contract-table">
        <thead>
          <tr>
            <th>Kind</th>
            <th>This world</th>
            <th>What it is for</th>
          </tr>
        </thead>
        <tbody>
          {view.contract.map((k) => (
            <tr key={k.key} className={k.count ? '' : 'muted'}>
              <td>
                {k.key}
                <div className="small muted">{k.file}</div>
              </td>
              <td className={k.count ? 'ok' : ''}>{k.count ? (k.list ? k.count : 'yes') : 'empty'}</td>
              <td>
                {k.does}
                {!k.count && (
                  <div className="small">
                    <span className="muted">Without it: {k.missing}</span>{' '}
                    <button type="button" className="link" onClick={() => propose(`Propose ${k.key} for this world (${k.file}): ${k.does}`)}>
                      [Let the chronicler propose]
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small">
        <strong>world.yaml sets:</strong> {view.worldKeys.filter((k) => k.set).map((k) => k.key).join(', ') || 'nothing yet'}.
      </p>
      {unset.length > 0 && (
        <p className="small muted">
          Neutral default: {unset.join(', ')}.{' '}
          <button type="button" className="link" onClick={() => propose(`Propose world.yaml keys for this world, in world: ${unset.join(', ')}. Ask me first what is mine to choose.`)}>
            [Let the chronicler propose]
          </button>
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- a new world

function NewWorldPanel({ bridge, world, view, fresh, saved, made }: { bridge: EditorBridge; world: string; view: EditorView; fresh: boolean; saved: () => Promise<void>; made: (folder: string) => Promise<void> }) {
  const [folder, setFolder] = useState('')
  const [name, setName] = useState('')
  const [problems, setProblems] = useState<string[]>([])
  // An existing world is built further only when asked, with a warning: the proposals change its own files.
  const [further, setFurther] = useState(false)
  const named = view.world.name || world
  return (
    <div className="settings-body editor-page builder-fields">
      {fresh ? (
        <WorldSteps bridge={bridge} world={world} view={view} saved={saved} />
      ) : (
        <>
          <h2>Start a new world</h2>
          <p className="muted small">
            A new world gets its own folder in content/, with the smallest content that loads: one area, one place, and its own part of the chronicler&apos;s instruction. Then you build
            it step by step with the chronicler, here. It shows up at once when a new game asks which world.
          </p>
          <Field label="Folder (lower case, for example moorland)" value={folder} onChange={(v) => setFolder(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
          <Field label="Name" value={name} onChange={setName} />
          <button
            type="button"
            className="link"
            disabled={!folder}
            onClick={() =>
              void bridge.newWorld(folder, name).then(async (result) => {
                setProblems(result.problems)
                if (result.ok) await made(folder)
              })
            }
          >
            [Make the world]
          </button>
          {problems.length > 0 && <p className="warn small">{problems.join(' ')}</p>}
          <h2>Or build further on {named}</h2>
          {further ? (
            <WorldSteps bridge={bridge} world={world} view={view} saved={saved} existing />
          ) : (
            <p className="small">
              <span className="muted">
                The same steps work on the world that is open now. They change {named} itself, in its own files (content/{view.world.prefix || `${world}/`}); nothing is saved until you
                accept a proposal.{' '}
              </span>
              <button type="button" className="link" onClick={() => setFurther(true)}>
                [Build further on {named}]
              </button>
            </p>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Building a world with the chronicler, step by step (M10.17; the steps and
 * what to ask are in worldguide.ts): the designer answers in a few sentences,
 * the chronicler proposes, the editor shows it as a diff and saves only what
 * is accepted. A step skipped stays empty and works with its neutral default.
 */
function WorldSteps({ bridge, world, view, saved, existing = false }: { bridge: EditorBridge; world: string; view: EditorView; saved: () => Promise<void>; existing?: boolean }) {
  const [at, setAt] = useState(0)
  const [said, setSaid] = useState('')
  const [draft, setDraft] = useState<EditorDraft>()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<Record<string, 'saved' | 'skipped'>>({})
  const [outcome, setOutcome] = useState<EditorSave>()
  // Enhance with AI (after M10.17): the answer written out by the chronicler, what is still open, and the words before it.
  const [open, setOpen] = useState<string[]>([])
  const [before, setBefore] = useState<string>()
  const [enhanceProblems, setEnhanceProblems] = useState<string[]>([])
  // The design log (M10.18): answers kept as they are typed, decisions recorded, the designer's notes.
  const [log, setLog] = useState<DesignLog>({ notes: [], answers: {}, decisions: [] })
  const [askedFor, setAskedFor] = useState('')
  const [why, setWhy] = useState('')
  // What this build may spend and has spent, per step (M10.20): the steps do not wait on the game's hourly budget.
  const [build, setBuild] = useState<Awaited<ReturnType<EditorBridge['build']>>>()
  const [limit, setLimit] = useState('')
  const [buildNote, setBuildNote] = useState<string>()
  const counted = useCallback(
    (change?: { limit?: number; reset?: boolean }) =>
      bridge
        .build(world, change)
        .then((b) => {
          setBuild(b)
          setLimit(b.limitUsd.toFixed(2))
          setBuildNote(b.adjusted ? `Saved as $${b.limitUsd.toFixed(2)}: a build may spend from $0.01 to $1000.` : undefined)
        })
        .catch(() => setBuild(undefined)),
    [bridge, world],
  )
  useEffect(() => {
    void counted()
  }, [counted])
  const [note, setNote] = useState('')
  const step = WORLD_STEPS[at]!
  useEffect(() => {
    let live = true
    void bridge.design(world).then((l) => {
      if (!live) return
      setLog(l)
      setSaid((s) => s || l.answers[WORLD_STEPS[0]!.title] || '')
    })
    return () => {
      live = false
    }
  }, [bridge, world])
  // A decision clears the step's answer from the log, since the decision holds it now: the same words are not written back.
  const settled = useRef<Record<string, string>>({})
  // What is typed is kept (M10.20: nothing the designer writes is lost), a moment after the typing stops.
  useEffect(() => {
    if ((log.answers[step.title] ?? '') === said || settled.current[step.title] === said) return
    const timer = setTimeout(() => void bridge.design(world, { answer: { step: step.title, text: said } }).then(setLog), 800)
    return () => clearTimeout(timer)
  }, [said, step.title, world, bridge, log.answers])
  const record = (decision: 'accepted' | 'changed' | 'rejected' | 'skipped', from?: EditorDraft, reason = '') => {
    if (decision !== 'changed') settled.current[step.title] = said
    return bridge.design(world, { decision: { step: step.title, decision, asked: from ? askedFor : said, say: from?.say ?? '', questions: from?.questions ?? [], changed: from ? changedBy(from) : [], reason } }).then(setLog)
  }
  // An open proposal is kept per step (M10.20): it comes back after a restart, until it is accepted or thrown away.
  const keep = (d: EditorDraft | undefined, asked = askedFor) => {
    setDraft(d)
    const worth = d && (d.changes.length > 0 || Boolean(d.world) || (d.files?.length ?? 0) > 0)
    void bridge.openDraft(world, step.id, worth ? { draft: d!, asked } : null).catch(() => undefined)
  }
  useEffect(() => {
    let live = true
    void bridge
      .openDraft(world, WORLD_STEPS[at]!.id)
      .then((kept) => {
        if (!live || !kept) return
        setDraft(kept.draft)
        setAskedFor(kept.asked)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [bridge, world, at])
  const go = (index: number) => {
    const next = Math.max(0, Math.min(WORLD_STEPS.length - 1, index))
    setAt(next)
    setSaid(log.answers[WORLD_STEPS[next]!.title] ?? '')
    setDraft(undefined)
    setOutcome(undefined)
    setOpen([])
    setBefore(undefined)
    setEnhanceProblems([])
    setWhy('')
  }
  const enhance = async () => {
    setBusy(true)
    setEnhanceProblems([])
    try {
      const result = await bridge.enhance(world, step.id, said.trim())
      void counted()
      if (result.brief) {
        setBefore(said)
        setSaid(result.brief)
      }
      setOpen(result.open)
      setEnhanceProblems(result.problems)
    } catch (reason) {
      setEnhanceProblems([reason instanceof Error ? reason.message : String(reason)])
    } finally {
      setBusy(false)
    }
  }
  const propose = async () => {
    setBusy(true)
    setOutcome(undefined)
    // Asking again with a proposal still open: the designer changed their answer.
    if (draft && !draft.problems.length) await record('changed', draft, why)
    setAskedFor(said.trim())
    setWhy('')
    try {
      keep(await bridge.worldStep(world, step.id, said.trim()), said.trim())
      void counted()
    } catch (reason) {
      setDraft({ say: '', questions: [], changes: [], problems: [reason instanceof Error ? reason.message : String(reason)], diffs: [] })
    } finally {
      setBusy(false)
    }
  }
  // A proposal that did not load, put right (M10.20): only what the chronicler corrects is replaced.
  const putRight = async () => {
    if (!draft) return
    setBusy(true)
    try {
      keep(await bridge.worldFix(world, step.id, askedFor || said.trim(), draft, draft.problems))
      void counted()
    } catch (reason) {
      setDraft({ ...draft, problems: [reason instanceof Error ? reason.message : String(reason), ...draft.problems] })
    } finally {
      setBusy(false)
    }
  }
  const accept = async () => {
    if (!draft) return
    setBusy(true)
    const result = await bridge.saveDraft(world, draft)
    setBusy(false)
    setOutcome(result)
    if (result.ok) {
      setDone((d) => ({ ...d, [step.id]: 'saved' }))
      await record('accepted', draft)
      keep(undefined)
      await saved()
    }
  }
  const drop = async () => {
    if (draft && !draft.problems.length) await record('rejected', draft, why)
    keep(undefined)
    setWhy('')
  }
  const decided = (id: string) => {
    const title = WORLD_STEPS.find((s) => s.id === id)?.title
    const last = [...log.decisions].reverse().find((d) => d.step === title && d.decision !== 'changed')
    return done[id] ?? (last?.decision === 'accepted' ? 'saved' : last?.decision === 'skipped' ? 'skipped' : undefined)
  }
  return (
    <section className="world-steps">
      <h2>Build {view.world.name || world} with the chronicler</h2>
      {existing && (
        <p className="warn small">
          This changes {view.world.name || world} itself (content/{view.world.prefix || `${world}/`}). Only what you accept is saved, and git keeps what was there before.
        </p>
      )}
      <p className="muted small">
        Step by step: say in a few sentences what you want (or let [Enhance with AI] write it out further first), the chronicler proposes, and you accept, change your answer or skip. What you skip stays empty and works with its neutral
        default. Frame, places and people are needed; the rest may wait.
      </p>
      {build && (
        <div className="row small build-budget">
          <span>This build may spend up to $</span>
          <input className="amount" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} aria-label="What this build may spend, in dollars" />
          <button type="button" className="link" disabled={busy || !(Number(limit) > 0) || Number(limit) === build.limitUsd} onClick={() => void counted({ limit: Number(limit) })}>
            [Save]
          </button>
          <span className="muted">
            {build.own ? '' : '(the hourly budget, until you set one) '}spent so far ${build.spentUsd.toFixed(2)} in {build.calls} call{build.calls === 1 ? '' : 's'}; the game's hourly budget is not touched.
          </span>
          {build.calls > 0 && (
            <button type="button" className="link" disabled={busy} onClick={() => void counted({ reset: true })} title="Keeps the limit, and counts this build's spending from zero">
              [Count from zero]
            </button>
          )}
          {buildNote && <span className="warn">{buildNote}</span>}
        </div>
      )}
      <nav className="tabs step-tabs" aria-label="Steps">
        {WORLD_STEPS.map((s, i) => (
          <button key={s.id} type="button" className={i === at ? 'active' : ''} onClick={() => go(i)}>
            {i + 1}. {s.title}
            {decided(s.id) === 'saved' ? ' (saved)' : decided(s.id) === 'skipped' ? ' (skipped)' : s.optional ? '' : ' *'}
          </button>
        ))}
      </nav>
      <h3>
        {at + 1}. {step.title}
        {step.optional ? '' : ' (needed)'}
      </h3>
      <ul className="check-list small">
        {step.ask.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>
      <p className="small muted">
        If you skip it: {step.skipped}
        {build?.steps[step.id] ? ` This step has cost $${build.steps[step.id]!.toFixed(2)} so far.` : ''}
      </p>
      <textarea rows={before === undefined ? 8 : 12} value={said} onChange={(e) => setSaid(e.target.value)} placeholder="Your answer, in a few sentences. Or: you choose." aria-label="Your answer to the chronicler" />
      {open.length > 0 && (
        <div className="small">
          <p className="muted">Only you can decide:</p>
          <ul className="check-list small">
            {open.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {enhanceProblems.map((p) => (
        <p key={p} className="warn small">
          {p}
        </p>
      ))}
      <div className="row">
        <button
          type="button"
          className="link"
          disabled={busy || !said.trim()}
          onClick={() => void enhance()}
          title="The chronicler writes your answer out: what you said stays, each open question gets a marked suggestion. Nothing is saved; change it as you like, then Propose."
        >
          [Enhance with AI]
        </button>
        {before !== undefined && (
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() => {
              setSaid(before)
              setBefore(undefined)
              setOpen([])
            }}
          >
            [Back to my words]
          </button>
        )}
        <button type="button" className="link" disabled={busy || !said.trim()} onClick={() => void propose()}>
          [Propose]
        </button>
        {step.optional && (
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() => {
              setDone((d) => ({ ...d, [step.id]: 'skipped' }))
              void record('skipped')
              go(at + 1)
            }}
          >
            [Skip this step]
          </button>
        )}
        {at < WORLD_STEPS.length - 1 && (
          <button type="button" className="link" disabled={busy} onClick={() => go(at + 1)}>
            [Next step]
          </button>
        )}
        {busy && <span className="muted small">The chronicler is writing...</span>}
      </div>
      {draft && (
        <>
          <DraftView draft={draft} busy={busy} accept={() => void accept()} drop={() => void drop()} fix={() => void putRight()} />
          {!draft.problems.length && (
            <input className="small" value={why} onChange={(e) => setWhy(e.target.value)} placeholder="If you drop it or ask again: why? (optional, for the design log)" aria-label="Why you drop this proposal" />
          )}
        </>
      )}
      {outcome && (outcome.ok ? <p className="ok small">Saved. {outcome.changes.length} files changed.</p> : <SaveResult result={outcome} />)}
      <PolishPlaces bridge={bridge} world={world} view={view} saved={saved} counted={() => void counted()} />
      <h3>Notes for this world</h3>
      <p className="muted small">
        Why the world is as it is, in your own words. They go in the design log (DESIGN.md), with every proposal and what you decided, and the chronicler reads them before it proposes.
      </p>
      {log.notes.length > 0 && (
        <ul className="check-list small">
          {log.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      <div className="row">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="There is no faith here, because..." aria-label="A note for this world" />
        <button
          type="button"
          className="link"
          disabled={!note.trim()}
          onClick={() => {
            void bridge.design(world, { note }).then(setLog)
            setNote('')
          }}
        >
          [Add note]
        </button>
      </div>
      {log.decisions.length > 0 && (
        <p className="muted small">
          {log.decisions.length} {log.decisions.length === 1 ? 'decision' : 'decisions'} in the design log.
        </p>
      )}
    </section>
  )
}

/** What a proposal touched, for the design log: entities by kind and id, the world keys and whole files. */
function changedBy(draft: EditorDraft): string[] {
  const out = draft.changes.map((c) => `${c.kind} ${c.id}${c.yaml.trim() ? '' : ' (removed)'}`)
  if (draft.world?.trim()) out.push(`world.yaml: ${draft.world.split('\n').filter((l) => /^[a-z_]+:/.test(l)).map((l) => l.split(':')[0]).join(', ') || 'keys'}`)
  for (const f of draft.files ?? []) out.push(f.path)
  return out
}

/**
 * The palette of the map (M10): content per world, in world.yaml. Every
 * token as a colour box, for dark and for paper (black and white is paper in
 * greys), and a map to try it on. The writing aid proposes a palette from the
 * world's frame on request; nothing is saved until you save.
 */
/**
 * The voice kit (M10.10): how people in this world swear, what they say, how
 * they call a stranger, how they tell time, and what is not here. Edited as
 * YAML, checked with the whole world, written field by field; the writing aid
 * can propose one from the world's frame and CHRONICLER.md.
 */
function VoicePanel({ bridge, world, saved }: { bridge: EditorBridge; world: string; saved: () => Promise<void> }) {
  const [kit, setKit] = useState<{ file: string; yaml: string; own: boolean }>()
  const [yaml, setYaml] = useState('')
  const [ask, setAsk] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()

  useEffect(() => {
    void bridge.voice(world).then((k) => {
      setKit(k)
      setYaml(k.yaml)
      setMessage(undefined)
    })
  }, [bridge, world])

  if (!kit) return <div className="editor-page"><p className="muted">Loading the voice kit...</p></div>
  const save = async () => {
    setBusy(true)
    const result = await bridge.saveVoice(world, yaml)
    setBusy(false)
    setMessage(result.ok ? (result.changes.length ? `Saved in ${kit.file}.` : 'Nothing changed.') : result.problems.join('; '))
    if (result.ok) {
      setKit({ ...kit, yaml, own: true })
      await saved()
    }
  }
  const propose = async () => {
    setBusy(true)
    const result = await bridge.proposeVoice(world, ask)
    setBusy(false)
    if (result.yaml) setYaml(result.yaml)
    setMessage(result.yaml ? `${result.say} (Not saved yet: look at it, change what you like, then save.)` : result.problems.join('; '))
  }
  return (
    <div className="editor-page voice-panel">
      <h2>The voice kit</h2>
      <p className="muted small">
        {kit.own ? `This world's kit, in ${kit.file}.` : `This world has no kit yet: the guard keeps its fixed list. Saving writes ${kit.file}.`} Oaths per faith, sayings of the region and of groups, how people call the stranger, time, distance and measures, and what is not here (with what people say instead). Sayings are rare in play: at most once in a talk, in one talk of three. Character shows in what people care about, steer away from, remember and dare to say.
      </p>
      <textarea className="yaml-box" value={yaml} onChange={(e) => setYaml(e.target.value)} spellCheck={false} rows={Math.min(40, Math.max(16, yaml.split('\n').length + 2))} aria-label="The voice kit as YAML" />
      <div className="row">
        <button type="button" className="link" disabled={busy || yaml === kit.yaml} onClick={() => void save()}>
          [Save]
        </button>
        <button type="button" className="link" disabled={busy || yaml === kit.yaml} onClick={() => setYaml(kit.yaml)}>
          [Undo changes]
        </button>
      </div>
      <label className="field">
        Ask the writing aid
        <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="a kit that fits this world" />
      </label>
      <button type="button" className="link" disabled={busy} onClick={() => void propose()}>
        [Propose a kit]
      </button>
      {message && <p className={message.startsWith('Saved') || message.startsWith('Nothing') || message.includes('Not saved yet') ? 'muted' : 'warn'}>{message}</p>}
    </div>
  )
}

function PalettePanel({ bridge, world, saved }: { bridge: EditorBridge; world: string; saved: () => Promise<void> }) {
  const [view, setView] = useState<PaletteView>()
  const [palette, setPalette] = useState<MapPalette>()
  const [style, setStyle] = useState<MapStyleName>('dark')
  const [ask, setAsk] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string>()
  const [changed, setChanged] = useState(false)

  const [signPreview, setSignPreview] = useState<PaletteView['preview']>()
  const [adding, setAdding] = useState('')
  const [mapDraft, setMapDraft] = useState<EditorDraft>()

  const load = useCallback(
    () =>
      bridge.palette(world).then((v) => {
        setView(v)
        setPalette(v.palette)
        setChanged(false)
        setSignPreview(undefined)
      }),
    [bridge, world],
  )
  useEffect(() => {
    setMapDraft(undefined)
    void load()
  }, [load])
  // Other signs than the saved ones are laid anew on the land (M10.20): the map shows them before saving.
  const signsKey = JSON.stringify(palette?.signs ?? null)
  useEffect(() => {
    if (!view || !palette || signsKey === JSON.stringify(view.palette.signs ?? null)) return setSignPreview(undefined)
    let live = true
    const timer = setTimeout(() => {
      void bridge
        .palette(world, palette)
        .then((v) => live && setSignPreview(v.preview))
        .catch(() => undefined)
    }, 300)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [signsKey, view])

  if (!view || !palette) return <div className="editor-page"><p className="muted">Loading the palette...</p></div>
  const edited = (next: MapPalette) => {
    setPalette(next)
    setChanged(true)
  }
  const setStyleToken = (which: 'dark' | 'paper', change: (s: MapStyle) => MapStyle) => edited({ ...palette, [which]: change(palette[which]) })
  const shownMap = signPreview ?? view.preview
  const preview = shownMap ? { ...shownMap, palette, legend: shownMap.legend.map((l) => ({ ...l, name: palette.names[l.key] ?? l.name })) } : undefined
  const signs = signsOf(palette)
  const own = Boolean(palette.signs)
  // A change to the signs makes them this world's own, starting from the Nethermarch's.
  const setSigns = (change: (current: Record<string, Sign>) => Record<string, Sign>, colours?: (glyph: Record<string, string>, which: 'dark' | 'paper') => Record<string, string>) =>
    edited({
      ...palette,
      signs: change({ ...(palette.signs ?? DEFAULT_SIGNS) }),
      ...(colours ? { dark: { ...palette.dark, glyph: colours({ ...palette.dark.glyph }, 'dark') }, paper: { ...palette.paper, glyph: colours({ ...palette.paper.glyph }, 'paper') } } : {}),
    })
  const setSign = (id: string, change: Partial<Sign>) =>
    setSigns((all) => {
      const next = { ...all[id]!, ...change }
      for (const k of Object.keys(change) as (keyof Sign)[]) if (next[k] === undefined || next[k] === '' || next[k] === false) delete next[k]
      return { ...all, [id]: next }
    })
  const lands = (on: Record<string, number>) => Object.entries(on).map(([land, part]) => `${land} ${part}`).join(', ')
  const readLands = (text: string): Record<string, number> =>
    Object.fromEntries(
      text
        .split(',')
        .map((part) => part.trim().split(/\s+/))
        .filter(([land, part]) => land && part && Number.isFinite(Number(part)))
        .map(([land, part]) => [land!, Math.min(1, Math.max(0, Number(part)))]),
    )
  const addSign = () => {
    const id = adding.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_')
    if (!id || id === 'stairs' || signs.some(([s]) => s === id) || signs.length >= MAX_SIGNS) return
    setSigns(
      (all) => ({ ...all, [id]: { name: id.replace(/_/g, ' '), shape: 'rock', on: {} } }),
      (glyph, which) => ({ ...glyph, [id]: palette[which].label }),
    )
    setAdding('')
  }
  const removeSign = (id: string) =>
    setSigns(
      (all) => Object.fromEntries(Object.entries(all).filter(([s]) => s !== id)),
      (glyph) => Object.fromEntries(Object.entries(glyph).filter(([g]) => g !== id)),
    )
  const terrains = [...new Set([...Object.keys(palette.dark.terrain), ...Object.keys(palette.paper.terrain)])]
  const which: 'dark' | 'paper' = style === 'dark' ? 'dark' : 'paper'
  const s = palette[which]
  const colour = (value: string, set: (v: string) => void, label: string) => (
    <input type="color" value={value} aria-label={label} title={`${label}: ${value}`} onChange={(e) => set(e.target.value)} />
  )

  const save = async () => {
    setBusy(true)
    const result = await bridge.savePalette(world, palette)
    setBusy(false)
    setMessage(result.ok ? 'Saved in world.yaml.' : result.problems.join('; '))
    if (result.ok) {
      setChanged(false)
      await saved()
    }
  }
  // A first map from the places (M10.20), for a world without one: a proposal, saved only when accepted.
  const makeMap = async () => {
    setBusy(true)
    try {
      setMapDraft(await bridge.mapDraft(world))
    } finally {
      setBusy(false)
    }
  }
  const acceptMap = async () => {
    if (!mapDraft) return
    setBusy(true)
    try {
      const result = await bridge.saveDraft(world, { changes: mapDraft.changes, world: '', files: [] })
      if (!result.ok) return setMapDraft({ ...mapDraft, problems: result.problems })
      setMapDraft(undefined)
      setMessage('The map is saved. Paint the land in its drawing, or let the chronicler do it in the Palette step.')
      await saved()
      await load()
    } finally {
      setBusy(false)
    }
  }
  const propose = async () => {
    setBusy(true)
    const result = await bridge.proposePalette(world, ask)
    setBusy(false)
    if (result.palette) edited(result.palette)
    setMessage(result.palette ? `${result.say} (Not saved yet: look at it, change what you like, then save.)` : result.problems.join('; '))
  }

  return (
    <div className="editor-page palette-panel">
      <h2>The map palette</h2>
      <p className="muted small">
        {view.own ? 'This world has its own palette in world.yaml.' : 'This world has no palette of its own yet: it draws with the default. Saving writes one into world.yaml.'} Levels: {view.levels.map((l) => l.name).join(', ')}.
      </p>
      <div className="seg" role="group" aria-label="Style">
        {(['dark', 'paper', 'bw'] as const).map((st) => (
          <button key={st} type="button" aria-pressed={style === st} onClick={() => setStyle(st)}>
            {st === 'dark' ? 'dark' : st === 'paper' ? 'paper' : 'black and white'}
          </button>
        ))}
      </div>
      {preview ? <HexMap data={preview} style={style} mode="map" height={420} label="The palette on a map of this world" /> : <p className="muted">The world does not load, so there is no map to try it on.</p>}
      {view.region === false && (
        <div className="map-draft">
          <p className="muted small">This world has no region map yet, so the map above is a sample of the palette, and the game plays without one. The editor can lay one out from the places, their exits and minutes; you paint the land afterwards.</p>
          {mapDraft ? (
            <DraftView draft={mapDraft} busy={busy} accept={() => void acceptMap()} drop={() => setMapDraft(undefined)} />
          ) : (
            <button type="button" className="link" disabled={busy} onClick={() => void makeMap()}>
              [Make a map from the places]
            </button>
          )}
        </div>
      )}
      {style === 'bw' ? (
        <p className="muted small">Black and white is the paper set in greys; change paper to change it.</p>
      ) : (
        <table className="palette-table">
          <thead>
            <tr>
              <th>Terrain</th>
              <th>Name in the legend</th>
              <th>Tints ({which})</th>
            </tr>
          </thead>
          <tbody>
            {terrains.map((key) => (
              <tr key={key}>
                <td>{key}</td>
                <td>
                  <input value={palette.names[key] ?? ''} placeholder={key} onChange={(e) => edited({ ...palette, names: { ...palette.names, [key]: e.target.value } })} />
                </td>
                <td>
                  {(s.terrain[key] ?? []).map((tint, i) =>
                    <span key={i}>{colour(tint, (v) => setStyleToken(which, (st) => ({ ...st, terrain: { ...st.terrain, [key]: st.terrain[key]!.map((x, j) => (j === i ? v : x)) } })), `${key} tint ${i + 1}`)}</span>,
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td>ways</td>
              <td>
                {(['road', 'path', 'canal'] as const).map((w) => (
                  <input key={w} className="way-name" value={palette.names[w] ?? ''} placeholder={w === 'canal' ? 'tow path' : w} aria-label={`The name of the ${w} in the legend`} onChange={(e) => edited({ ...palette, names: { ...palette.names, [w]: e.target.value } })} />
                ))}
              </td>
              <td>{(['road', 'path', 'canal'] as const).map((w) => <span key={w}>{colour(s.ways[w], (v) => setStyleToken(which, (st) => ({ ...st, ways: { ...st.ways, [w]: v } })), w)}</span>)}</td>
            </tr>
            <tr>
              <td>signs</td>
              <td className="muted small">{[...signs.map(([id, sign]) => sign.name || id), ...(s.glyph['peat_edge'] ? ['the rim of a pit'] : []), 'stairs'].join(', ')}</td>
              <td>{[...signs.map(([id]) => id), ...(s.glyph['peat_edge'] ? ['peat_edge'] : []), 'stairs'].map((g) => <span key={g}>{colour(s.glyph[g] ?? s.label, (v) => setStyleToken(which, (st) => ({ ...st, glyph: { ...st.glyph, [g]: v } })), g)}</span>)}</td>
            </tr>
            <tr>
              <td>ground</td>
              <td className="muted small">ground, unknown, label, its shadow</td>
              <td>{(['ground', 'unknown', 'label', 'label_shadow'] as const).map((k) => <span key={k}>{colour(s[k], (v) => setStyleToken(which, (st) => ({ ...st, [k]: v })), k)}</span>)}</td>
            </tr>
            <tr>
              <td>you</td>
              <td className="muted small">a place you have been, the way you walked</td>
              <td>{(['visited', 'trail'] as const).map((k) => <span key={k}>{colour(markColours(s, which)[k], (v) => setStyleToken(which, (st) => ({ ...st, [k]: v })), k)}</span>)}</td>
            </tr>
          </tbody>
        </table>
      )}
      <h3>Signs on the land</h3>
      <p className="muted small">
        {own ? 'This world names its own signs.' : "This world uses the Nethermarch's signs: pools, peat pits, willows, old walls and hummocks. Change one and they become this world's own."} Each sign has a shape, the land it lies on with the share of those hexes (fen 0.1 is one hex in ten), and what the stranger reads walking past. Danger and uncertain show as a mark and a word, not only a colour. At most {MAX_SIGNS}.
      </p>
      <table className="palette-table sign-table">
        <thead>
          <tr>
            <th>Sign</th>
            <th>Name in the legend</th>
            <th>Shape</th>
            <th>Means</th>
            <th>Lies on</th>
            <th>What the stranger reads, and where a walk stops</th>
            <th>Ground</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {signs.map(([id, sign]) => (
            <tr key={id}>
              <td>
                <code>{id}</code>
              </td>
              <td>
                <input value={sign.name} aria-label={`${id}: name`} onChange={(e) => setSign(id, { name: e.target.value })} />
              </td>
              <td>
                <select value={sign.shape} aria-label={`${id}: shape`} onChange={(e) => setSign(id, { shape: e.target.value as Sign['shape'] })}>
                  {SIGN_SHAPES.map((shape) => (
                    <option key={shape} value={shape}>
                      {shape}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select value={sign.means ?? ''} aria-label={`${id}: means`} onChange={(e) => setSign(id, { means: (e.target.value || undefined) as Sign['means'] })}>
                  <option value="">nothing more</option>
                  <option value="danger">danger</option>
                  <option value="uncertain">uncertain</option>
                </select>
              </td>
              <td>
                <input key={`${id}:${lands(sign.on)}`} defaultValue={lands(sign.on)} placeholder="fen 0.1, fields 0.04" aria-label={`${id}: lies on`} onBlur={(e) => setSign(id, { on: readLands(e.target.value) })} />
              </td>
              <td>
                <input value={sign.text ?? ''} placeholder="The line walking past" aria-label={`${id}: text`} onChange={(e) => setSign(id, { text: e.target.value })} />
                <input value={sign.stops ?? ''} placeholder="Where a walk stops to look (empty: it walks on)" aria-label={`${id}: stops`} onChange={(e) => setSign(id, { stops: e.target.value })} />
              </td>
              <td className="small">
                <label title="Firm ground: quicker to cross, never soft">
                  <input type="checkbox" checked={Boolean(sign.firm)} onChange={(e) => setSign(id, { firm: e.target.checked })} /> firm
                </label>{' '}
                <label title="Water in the ground: a way laid across it fills it in">
                  <input type="checkbox" checked={Boolean(sign.wet)} onChange={(e) => setSign(id, { wet: e.target.checked })} /> wet
                </label>
              </td>
              <td>
                <button type="button" className="link" onClick={() => removeSign(id)}>
                  [Remove]
                </button>
              </td>
            </tr>
          ))}
          {signs.length < MAX_SIGNS && (
            <tr>
              <td colSpan={8}>
                <input value={adding} placeholder="a new sign, for example mine_shaft" aria-label="The id of a new sign" onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSign()} />{' '}
                <button type="button" className="link" disabled={!adding.trim()} onClick={addSign}>
                  [Add a sign]
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="palette-ask">
        <input value={ask} placeholder="Ask the writing aid for a palette: colder, more like the sea, ..." onChange={(e) => setAsk(e.target.value)} aria-label="What to ask the writing aid" />
        <button type="button" disabled={busy} onClick={() => void propose()}>
          [Propose a palette]
        </button>
        <button type="button" disabled={busy || !changed} onClick={() => void save()}>
          [Save]
        </button>
      </div>
      {message && <p className="small">{message}</p>}
    </div>
  )
}

type KnobValue = number | Record<string, number>

/**
 * The knobs of a world (M10.20): every rule of play that may differ per
 * world, from the engine's own list, with what it does, its default, this
 * world's value and a way back to the default. Saved in world.yaml under
 * `knobs:`, only what differs from the default; checked when the world loads.
 */
function KnobsPanel({ bridge, world, view, saved }: { bridge: EditorBridge; world: string; view: EditorView; saved: () => Promise<void> }) {
  const own = view.knobs as Record<string, KnobValue>
  const [draft, setDraft] = useState<Record<string, KnobValue>>(own)
  const [message, setMessage] = useState<string>()
  const [busy, setBusy] = useState(false)
  useEffect(() => setDraft(own), [world, JSON.stringify(own)])
  const defs = KNOBS as Record<string, KnobDef>
  const groups = new Map<string, string[]>()
  for (const id of Object.keys(defs)) groups.set(id.split('.')[0]!, [...(groups.get(id.split('.')[0]!) ?? []), id])
  const shown = (v: KnobValue) => (typeof v === 'number' ? String(v) : Object.entries(v).map(([k, x]) => `${k} ${x}`).join(', '))
  const set = (id: string, value: KnobValue | undefined) =>
    setDraft((previous) => {
      const next = { ...previous }
      if (value === undefined) delete next[id]
      else next[id] = value
      return next
    })
  const changed = JSON.stringify(draft) !== JSON.stringify(own)
  const save = async () => {
    setBusy(true)
    setMessage(undefined)
    try {
      const result = await bridge.saveDraft(world, { changes: [], world: stringify({ knobs: draft }), files: [] })
      setMessage(result.ok ? 'Saved in world.yaml.' : result.problems.join(' '))
      if (result.ok) await saved()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="settings-body editor-page">
      <h2 className="editor-title">Knobs</h2>
      <p className="muted small">
        Rules of play this world may set otherwise than the default: how long a talk lasts, how long a thing is lent, what a lesson costs. Leave a knob empty to keep the default. They are saved in world.yaml under knobs:, and only what differs.
      </p>
      <p>
        <button type="button" className="link" disabled={busy || !changed} onClick={() => void save()}>
          [Save the knobs]
        </button>{' '}
        {changed && (
          <button type="button" className="link" disabled={busy} onClick={() => setDraft(own)}>
            [Undo]
          </button>
        )}
        {message && <span className="small"> {message}</span>}
      </p>
      {[...groups].map(([group, ids]) => (
        <section key={group}>
          <h3>{group}</h3>
          <table className="quest-table knob-table">
            <tbody>
              {ids.map((id) => {
                const def = defs[id]!
                const value = draft[id]
                return (
                  <tr key={id}>
                    <td>
                      <code>{id}</code>
                      <div className="muted small">{def.about}</div>
                    </td>
                    <td className="small">
                      {def.unit}
                      <div className="muted">
                        {def.min} to {def.max}
                      </div>
                    </td>
                    <td className="small">
                      default {shown(def.default)}
                    </td>
                    <td>
                      {typeof def.default === 'number' ? (
                        <input
                          className="knob-input"
                          inputMode="decimal"
                          value={typeof value === 'number' ? String(value) : ''}
                          placeholder={String(def.default)}
                          aria-label={id}
                          onChange={(e) => set(id, e.target.value.trim() === '' || Number.isNaN(Number(e.target.value)) ? undefined : Number(e.target.value))}
                        />
                      ) : (
                        Object.entries(def.default).map(([row, fallback]) => {
                          const table = value && typeof value === 'object' ? value : {}
                          return (
                            <label key={row} className="knob-row small">
                              {row}{' '}
                              <input
                                className="knob-input"
                                inputMode="decimal"
                                value={row in table ? String(table[row]) : ''}
                                placeholder={String(fallback)}
                                aria-label={`${id} ${row}`}
                                onChange={(e) => {
                                  const next = { ...table }
                                  if (e.target.value.trim() === '' || Number.isNaN(Number(e.target.value))) delete next[row]
                                  else next[row] = Number(e.target.value)
                                  set(id, Object.keys(next).length ? next : undefined)
                                }}
                              />
                            </label>
                          )
                        })
                      )}
                    </td>
                    <td>
                      {value !== undefined && (
                        <button type="button" className="link small" onClick={() => set(id, undefined)}>
                          [Default]
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  )
}
