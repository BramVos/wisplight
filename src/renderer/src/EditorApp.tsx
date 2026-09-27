import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { stringify } from 'yaml'
import { draftEdits, ENTITY_KINDS, KIND_NAMES, parseEntityYaml } from '../../engine'
import { createEditor, type DiffLine, type Edit, type EditorBridge, type EditorDraft, type EditorSave, type EditorView, type EntityKind, type Raw, type ShownChange, type SimReport, type WorldInfo } from './client'

// The editor (M8, FO chapter 15), in a window of its own: npm run editor, or
// [Editor] in a development build of the game. Every world in content/ can
// be opened; places and people have forms, everything else is edited as
// YAML. Saving checks the whole world first and writes only what changed;
// a running game picks it up at once. Beside the editing: the checks, a
// playtest without the player with an NPC inspector, and the chronicler,
// whose proposals are shown as a change and saved only when accepted.

type Panel = 'edit' | 'check' | 'playtest' | 'chronicler' | 'world'

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

  if (!bridge || !view) return <div className="editor-app loading muted">{error ?? 'Opening the editor...'}</div>

  return (
    <div className="editor-app">
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
              ['check', `Check${view.problems.length ? ` (${view.problems.length} errors)` : view.warnings.length ? ` (${view.warnings.length})` : ''}`],
              ['playtest', 'Playtest'],
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
      {panel === 'check' && <CheckPanel view={view} open={open} />}
      {panel === 'playtest' && <PlaytestPanel bridge={bridge} world={world} />}
      {panel === 'chronicler' && <ChroniclerPanel bridge={bridge} world={world} focus={selected && !creating ? { kind, id: selected } : undefined} saved={refresh} open={open} />}
      {panel === 'world' && (
        <NewWorldPanel
          bridge={bridge}
          made={async (folder) => {
            setWorlds(await bridge.worlds())
            setWorld(folder)
            setPanel('edit')
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
    const outcome = await bridge.save(world, [{ kind, id }], true)
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
    default:
      return { id: `new_${kind}` }
  }
}

/** The same writer as the files, for a thing that is not saved yet. */
function toYaml(raw: Raw): string {
  return stringify(raw, { lineWidth: 0 })
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
      <h2 className="editor-title">Quests</h2>
      <QuestTable view={view} />
    </div>
  )
}

// ---------------------------------------------------------------- playtest

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
              {npc && (
                <div className="inspector small">
                  <p>
                    <strong>{npc.name}</strong> at {npc.location}, {npc.activity}.{npc.mood ? ` ${npc.mood}.` : ''}
                  </p>
                  <p className="needs">
                    {Object.entries(npc.needs).map(([need, value]) => (
                      <span key={need} className={value < 20 ? 'warn' : ''}>
                        {need} {value}{' '}
                      </span>
                    ))}
                  </p>
                  <p className="muted">Wants: {npc.goals.join('; ') || 'nothing in particular'}</p>
                  <p className="muted">Plan: {npc.plan.join(', ') || 'none'}</p>
                  <h3>Remembers</h3>
                  <ul className="check-list">{npc.memory.length ? npc.memory.map((m) => <li key={m}>{m}</li>) : <li className="muted">nothing yet</li>}</ul>
                  <h3>Did</h3>
                  <ul className="check-list">{npc.days.length ? npc.days.slice(-25).map((d, i) => <li key={i}>{d}</li>) : <li className="muted">nothing worth telling</li>}</ul>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- the chronicler

function ChroniclerPanel({ bridge, world, focus, saved, open }: { bridge: EditorBridge; world: string; focus?: { kind: EntityKind; id: string }; saved: () => Promise<void>; open: (kind: EntityKind, id?: string) => void }) {
  const [ask, setAsk] = useState('')
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
    const result = await bridge.save(world, draftEdits(draft) as Edit[], true)
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
      {draft && (
        <div className="draft">
          {draft.say && <p>{draft.say}</p>}
          {draft.questions.length > 0 && (
            <ul className="check-list">
              {draft.questions.map((q) => (
                <li key={q}>{q}</li>
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
              </ul>
            </div>
          )}
          {draft.changes.length > 0 && (
            <p className="small muted">
              {draft.changes.length} change{draft.changes.length === 1 ? '' : 's'}:{' '}
              {draft.changes.map((c) => `${c.yaml.trim() ? '' : 'delete '}${c.kind.replace('_', ' ')} ${c.id}`).join(', ')}
            </p>
          )}
          <Diffs changes={draft.diffs} />
          <div className="row">
            {draft.diffs.length > 0 && draft.problems.length === 0 && (
              <button type="button" className="link" disabled={busy} onClick={() => void accept()}>
                [Accept and save]
              </button>
            )}
            <button type="button" className="link" onClick={() => setDraft(undefined)}>
              [Throw it away]
            </button>
          </div>
        </div>
      )}
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

// ---------------------------------------------------------------- a new world

function NewWorldPanel({ bridge, made }: { bridge: EditorBridge; made: (folder: string) => Promise<void> }) {
  const [folder, setFolder] = useState('')
  const [name, setName] = useState('')
  const [problems, setProblems] = useState<string[]>([])
  return (
    <div className="settings-body editor-page builder-fields">
      <p className="muted small">
        A new world gets its own folder in content/, with the smallest content that loads: one area, one place, and its own part of the chronicler&apos;s instruction. It shows up at once
        when a new game asks which world.
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
    </div>
  )
}
