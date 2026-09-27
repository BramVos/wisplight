import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BuilderBridge, BuilderData } from './client'

// The first world builder (FO, chapter 15): places and people as forms, and
// the checks on the content. Saving writes into the YAML file the thing came
// from and the game carries on with it at once.

type Tab = 'places' | 'people' | 'region' | 'check'
type Place = BuilderData['locations'][number]
type Person = BuilderData['npcs'][number]

const DIRECTIONS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'up', 'down', 'in', 'out']
const AXES = ['warmth', 'courage', 'honesty', 'temper', 'curiosity', 'diligence'] as const

export function BuilderView({ bridge, onClose }: { bridge?: BuilderBridge; onClose: () => void }) {
  const [data, setData] = useState<BuilderData>()
  const [tab, setTab] = useState<Tab>('places')
  const [selected, setSelected] = useState<string>()
  const [error, setError] = useState<string>()

  const refresh = useCallback(async () => {
    if (!bridge) return
    try {
      setData(await bridge.data())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }, [bridge])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const open = (next: Tab, id?: string) => {
    setTab(next)
    setSelected(id)
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="World builder">
      <div className="panel settings builder">
        <header className="panel-head">
          <h2>World builder</h2>
          <nav className="tabs">
            {(['places', 'people', 'region', 'check'] as const).map((id) => (
              <button key={id} type="button" className={tab === id ? 'active' : ''} onClick={() => open(id)}>
                {id === 'places' ? 'Places' : id === 'people' ? 'People' : id === 'region' ? 'Region' : `Check${data && data.problems.length + data.warnings.length ? ` (${data.problems.length + data.warnings.length})` : ''}`}
              </button>
            ))}
          </nav>
          <button type="button" className="link" onClick={onClose}>
            [Close]
          </button>
        </header>
        {!bridge ? (
          <p className="muted">The world builder works in the desktop app, in a development build (npm run dev).</p>
        ) : !data ? (
          <p className="muted">{error ?? 'Loading...'}</p>
        ) : tab === 'check' ? (
          <CheckTab data={data} open={open} />
        ) : tab === 'region' ? (
          <RegionTab data={data} bridge={bridge} saved={refresh} />
        ) : (
          <div className="builder-body">
            <List data={data} tab={tab} selected={selected} onSelect={setSelected} />
            <div className="builder-form">
              {tab === 'places' && selected && data.locations.find((l) => l.id === selected) && (
                <PlaceForm key={selected} place={data.locations.find((l) => l.id === selected)!} data={data} bridge={bridge} saved={refresh} />
              )}
              {tab === 'people' && selected && data.npcs.find((n) => n.id === selected) && (
                <PersonForm key={selected} person={data.npcs.find((n) => n.id === selected)!} data={data} bridge={bridge} saved={refresh} />
              )}
              {!selected && <p className="muted">Pick a {tab === 'places' ? 'place' : 'person'} on the left.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function List({ data, tab, selected, onSelect }: { data: BuilderData; tab: Tab; selected?: string; onSelect: (id: string) => void }) {
  const groups = useMemo(() => {
    if (tab === 'places') return data.areas.map((a) => ({ title: a.name, items: data.locations.filter((l) => l.area === a.id).map((l) => ({ id: l.id, name: l.name })) })).filter((g) => g.items.length)
    return [{ title: 'Everyone', items: data.npcs.map((n) => ({ id: n.id, name: n.name })) }]
  }, [data, tab])
  return (
    <div className="builder-list">
      {groups.map((group) => (
        <div key={group.title}>
          <h3>{group.title}</h3>
          {group.items.map((item) => (
            <button key={item.id} type="button" className={`link item ${item.id === selected ? 'active' : ''}`} onClick={() => onSelect(item.id)}>
              {item.name}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function useSave(bridge: BuilderBridge, saved: () => Promise<void>) {
  const [state, setState] = useState<{ busy?: boolean; ok?: string; problems?: string[] }>({})
  const save = async (kind: 'location' | 'npc' | 'region', id: string, patch: Record<string, unknown>) => {
    setState({ busy: true })
    try {
      const result = await bridge.save(kind, id, patch)
      if (result.ok) {
        setState({ ok: `Saved in ${result.file}. It is in the game now.` })
        await saved()
      } else setState({ problems: result.problems })
    } catch (reason) {
      setState({ problems: [reason instanceof Error ? reason.message : String(reason)] })
    }
  }
  return { state, save }
}

function Result({ state }: { state: ReturnType<typeof useSave>['state'] }) {
  return (
    <>
      {state.busy && <p className="muted">Checking and saving...</p>}
      {state.ok && <p className="ok">{state.ok}</p>}
      {state.problems && (
        <div className="warn">
          <p>Not saved; the content would not load:</p>
          <ul>
            {state.problems.slice(0, 8).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

function PlaceForm({ place, data, bridge, saved }: { place: Place; data: BuilderData; bridge: BuilderBridge; saved: () => Promise<void> }) {
  const [name, setName] = useState(place.name)
  const [tags, setTags] = useState(place.tags.join(', '))
  const [day, setDay] = useState(place.description.day.trim())
  const [night, setNight] = useState(place.description.night?.trim() ?? '')
  const [exits, setExits] = useState(Object.entries(place.exits).map(([direction, e]) => ({ direction, to: e.to, minutes: e.minutes })))
  const { state, save } = useSave(bridge, saved)

  const submit = () =>
    save('location', place.id, {
      name,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      'description.day': day.trim() + '\n',
      'description.night': night.trim() ? night.trim() + '\n' : undefined,
      exits: Object.fromEntries(exits.filter((e) => e.to).map((e) => [e.direction, e.minutes > 1 ? { to: e.to, minutes: e.minutes } : { to: e.to }])),
    })

  return (
    <form
      className="builder-fields"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <p className="muted small">
        {place.id} in {place.file}
      </p>
      <label>
        Name <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Tags <input value={tags} onChange={(e) => setTags(e.target.value)} />
      </label>
      <label>
        By day <textarea rows={5} value={day} onChange={(e) => setDay(e.target.value)} />
      </label>
      <p className="muted small">Three to five sentences, second person, present tense, one sense that is not sight, a hint at an exit. Topics in [brackets].</p>
      <label>
        By night <textarea rows={4} value={night} onChange={(e) => setNight(e.target.value)} placeholder="(optional)" />
      </label>
      <fieldset>
        <legend>Exits</legend>
        {exits.map((exit, index) => (
          <div key={index} className="exit-row">
            <select value={exit.direction} onChange={(e) => setExits(exits.map((x, i) => (i === index ? { ...x, direction: e.target.value } : x)))}>
              {DIRECTIONS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <select value={exit.to} onChange={(e) => setExits(exits.map((x, i) => (i === index ? { ...x, to: e.target.value } : x)))}>
              {data.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <input className="amount" type="number" min={1} value={exit.minutes} onChange={(e) => setExits(exits.map((x, i) => (i === index ? { ...x, minutes: Number(e.target.value) || 1 } : x)))} aria-label="Minutes" />
            <button type="button" className="link" onClick={() => setExits(exits.filter((_, i) => i !== index))}>
              [x]
            </button>
          </div>
        ))}
        <button type="button" className="link" onClick={() => setExits([...exits, { direction: DIRECTIONS.find((d) => !exits.some((x) => x.direction === d)) ?? 'north', to: data.locations[0]?.id ?? '', minutes: 1 }])}>
          [Add exit]
        </button>
        <p className="muted small">Every exit needs a way back from the other side, unless the place is tagged one_way.</p>
      </fieldset>
      <button type="submit" className="link">
        [Save]
      </button>
      <Result state={state} />
    </form>
  )
}

function PersonForm({ person, data, bridge, saved }: { person: Person; data: BuilderData; bridge: BuilderBridge; saved: () => Promise<void> }) {
  const [fields, setFields] = useState({
    name: person.name,
    short: person.short,
    age: String(person.age),
    profession: person.profession,
    home: person.home,
    work: person.work ?? '',
    appearance: person.appearance,
    speech: person.speech ?? '',
    facts: person.public_facts.join('\n'),
  })
  const [personality, setPersonality] = useState<Record<string, number>>(person.personality)
  const { state, save } = useSave(bridge, saved)
  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) => setFields({ ...fields, [key]: event.target.value })

  const submit = () =>
    save('npc', person.id, {
      name: fields.name,
      short: fields.short,
      age: Number(fields.age) || person.age,
      profession: fields.profession,
      home: fields.home,
      work: fields.work || undefined,
      appearance: fields.appearance,
      speech: fields.speech || undefined,
      personality,
      public_facts: fields.facts
        .split('\n')
        .map((f) => f.trim())
        .filter(Boolean),
    })

  return (
    <form
      className="builder-fields"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <p className="muted small">
        {person.id} in {person.file}
      </p>
      <label>
        Name <input value={fields.name} onChange={set('name')} />
      </label>
      <label>
        Known as <input value={fields.short} onChange={set('short')} />
      </label>
      <label>
        Age <input className="amount" type="number" value={fields.age} onChange={set('age')} />
      </label>
      <label>
        Trade
        <select value={fields.profession} onChange={set('profession')}>
          {data.professions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Home
        <select value={fields.home} onChange={set('home')}>
          {data.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Work
        <select value={fields.work} onChange={set('work')}>
          <option value="">(none)</option>
          {data.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Character</legend>
        {AXES.map((axis) => (
          <label key={axis} className="slider">
            {axis}
            <input type="range" min={-3} max={3} value={personality[axis] ?? 0} onChange={(e) => setPersonality({ ...personality, [axis]: Number(e.target.value) })} />
            <span className="mono">{personality[axis] ?? 0}</span>
          </label>
        ))}
      </fieldset>
      <label>
        Looks <textarea rows={3} value={fields.appearance} onChange={set('appearance')} />
      </label>
      <label>
        Voice <input value={fields.speech} onChange={set('speech')} />
      </label>
      <label>
        Public facts, one per line <textarea rows={4} value={fields.facts} onChange={set('facts')} />
      </label>
      <button type="submit" className="link">
        [Save]
      </button>
      <Result state={state} />
    </form>
  )
}

function RegionTab({ data, bridge, saved }: { data: BuilderData; bridge: BuilderBridge; saved: () => Promise<void> }) {
  const region = data.region
  const [zones, setZones] = useState(region?.zones ?? '')
  const { state, save } = useSave(bridge, saved)
  if (!region) return <p className="muted">There is no region in the content.</p>
  return (
    <div className="settings-body">
      <p className="muted small">
        {region.name}: the zone drawing in {region.file}. One character is 0.5 km east-west and 1 km north-south; the legend and rules are in the file. The generator makes the
        map below from it, with the same seed every time.
      </p>
      <textarea className="zones" rows={22} spellCheck={false} value={zones} onChange={(e) => setZones(e.target.value)} aria-label="Zone drawing" />
      <button type="button" className="link" onClick={() => void save('region', region.id, { zones: zones.endsWith('\n') ? zones : `${zones}\n` })}>
        [Save and generate]
      </button>
      <Result state={state} />
      <pre className="map whole generated">{region.map}</pre>
    </div>
  )
}

function CheckTab({ data, open }: { data: BuilderData; open: (tab: Tab, id?: string) => void }) {
  const target = (line: string): { tab: Tab; id: string } | undefined => {
    const id = /^(loc_[a-z0-9_]+|npc_[a-z0-9_]+)/.exec(line)?.[1]
    if (!id) return undefined
    return { tab: id.startsWith('loc_') ? 'places' : 'people', id }
  }
  const row = (line: string) => {
    const t = target(line)
    return (
      <li key={line}>
        {t ? (
          <button type="button" className="link" onClick={() => open(t.tab, t.id)}>
            {line}
          </button>
        ) : (
          line
        )}
      </li>
    )
  }
  return (
    <div className="settings-body">
      <h3>Errors {data.problems.length === 0 && <span className="ok">none: the content loads</span>}</h3>
      <ul className="check-list">{data.problems.map(row)}</ul>
      <h3>Worth a look ({data.warnings.length})</h3>
      <ul className="check-list">{data.warnings.map(row)}</ul>
    </div>
  )
}
