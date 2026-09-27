import { useEffect, useMemo, useState } from 'react'
import {
  ATTRIBUTES,
  boostsFor,
  checkChoice,
  classDc,
  contentFor,
  createCharacter,
  creationCommand,
  defence,
  extraSkills,
  maxHp,
  skillBonus,
  suggestChoice,
  weaponStats,
  type Attribute,
  type CreationChoice,
  type CreationData,
} from '../../engine'

// Making a character (FO, chapter 11, "Personage maken"): class, ancestry and
// background, boosts, extra skills and a first talent. Everything starts from
// a suggestion for the class, so one click is enough; the choice goes to the
// engine as one CREATE command, which the log keeps for replays.

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function CharacterCreation({ data, onCreate, onSkip }: { data: CreationData; onCreate: (command: string) => void; onSkip: () => void }) {
  const content = useMemo(() => contentFor(data), [data])
  const rules = data.rules
  const [choice, setChoice] = useState<CreationChoice>(() => suggestChoice(content, rules.classes[0]!.id, ''))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onSkip()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSkip])

  // A new class starts again from its suggestion; a new ancestry or background from the class's, keeping the other.
  const pick = (patch: Partial<Pick<CreationChoice, 'class' | 'ancestry' | 'background'>>) => {
    const keep = { name: choice.name, ...(choice.pronoun ? { pronoun: choice.pronoun } : {}) }
    if (patch.class) return setChoice({ ...suggestChoice(content, patch.class, choice.name), ...keep })
    const next = { ...choice, ...patch }
    setChoice({ ...suggestChoice(content, next.class, choice.name, next.ancestry, next.background), ...keep })
  }

  const klass = rules.classes.find((c) => c.id === choice.class)!
  const background = rules.backgrounds.find((b) => b.id === choice.background)!
  const problems = checkChoice(content, choice)
  const preview = useMemo(() => {
    const made = createCharacter(content, { ...choice, name: choice.name.trim() || 'Traveller' })
    return 'character' in made ? made.character : undefined
  }, [content, choice])
  const boosts = boostsFor(content, choice.ancestry)
  const extra = extraSkills(content, choice.class, choice.background)
  const trained = new Set([...klass.trained, ...background.skills])

  const boost = (a: Attribute, delta: 1 | -1) => {
    const list = [...choice.boosts]
    if (delta > 0) {
      if (list.length >= boosts) list.shift()
      list.push(a)
    } else {
      const i = list.lastIndexOf(a)
      if (i >= 0) list.splice(i, 1)
    }
    setChoice({ ...choice, boosts: list })
  }
  const toggleSkill = (s: string) => {
    const list = choice.skills.includes(s) ? choice.skills.filter((x) => x !== s) : [...choice.skills, s].slice(-extra)
    setChoice({ ...choice, skills: list })
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Make your character">
      <div className="panel settings creation">
        <header className="panel-head">
          <h2>Who are you?</h2>
          <span className="muted small">Everything starts from a suggestion; change what you like.</span>
          <button type="button" className="link" onClick={onSkip}>
            [Play the ready-made traveller]
          </button>
        </header>
        <div className="settings-body">
          <div className="row">
            <label className="field">
              <span>Name</span>
              <input value={choice.name} maxLength={30} placeholder="Your name" onChange={(e) => setChoice({ ...choice, name: e.target.value })} autoFocus />
            </label>
            <label className="field">
              <span>People call you</span>
              <select value={choice.pronoun ?? 'they'} onChange={(e) => setChoice({ ...choice, pronoun: e.target.value as 'she' | 'he' | 'they' })} aria-label="Pronoun">
                <option value="she">she</option>
                <option value="he">he</option>
                <option value="they">they</option>
              </select>
            </label>
          </div>

          <h3>Class</h3>
          <div className="choices">
            {rules.classes.map((c) => (
              <button key={c.id} type="button" className={`choice ${c.id === choice.class ? 'active' : ''}`} onClick={() => pick({ class: c.id })}>
                <strong>{c.name}</strong>
                <span className="muted small">
                  {c.hp} hp a level, {cap(c.key)}. {c.core.name}: {c.core.text}
                </span>
              </button>
            ))}
          </div>
          <p className="small">{klass.text}</p>

          <div className="columns">
            <div>
              <h3>Ancestry</h3>
              {rules.ancestries.map((a) => (
                <label key={a.id} className="radio">
                  <input type="radio" name="ancestry" checked={a.id === choice.ancestry} onChange={() => pick({ ancestry: a.id })} />
                  <span>
                    <strong>{a.name}</strong> <span className="muted small">{a.hp} hp. {a.special}</span>
                  </span>
                </label>
              ))}
            </div>
            <div>
              <h3>Background</h3>
              <select value={choice.background} onChange={(e) => pick({ background: e.target.value })} aria-label="Background">
                {rules.backgrounds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}: {b.skills.join(', ')}
                  </option>
                ))}
              </select>
              <p className="muted small">
                Trained in {background.skills.join(' and ')}. Talent: {rules.general_talents.find((t) => t.id === background.talent)?.name}.
                {background.knows.length > 0 && ' Some people already know you.'}
              </p>
            </div>
          </div>

          <div className="columns">
            <div>
              <h3>
                Attributes <span className="muted small">({choice.boosts.length} of {boosts} boosts)</span>
              </h3>
              {ATTRIBUTES.map((a) => (
                <div key={a} className="attr">
                  <span>{cap(a)}</span>
                  <strong>{signed(preview?.attributes[a] ?? 0)}</strong>
                  <button type="button" className="link" onClick={() => boost(a, -1)} aria-label={`One boost less on ${a}`}>
                    [-]
                  </button>
                  <button type="button" className="link" onClick={() => boost(a, 1)} aria-label={`One boost more on ${a}`}>
                    [+]
                  </button>
                </div>
              ))}
            </div>
            <div>
              <h3>
                Extra skills <span className="muted small">({choice.skills.length} of {extra})</span>
              </h3>
              <div className="skills">
                {rules.skills
                  .filter((s) => !trained.has(s.id))
                  .map((s) => (
                    <label key={s.id} className="check">
                      <input type="checkbox" checked={choice.skills.includes(s.id)} onChange={() => toggleSkill(s.id)} />
                      {s.name}
                    </label>
                  ))}
              </div>
            </div>
          </div>

          <h3>First talent</h3>
          <div className="choices">
            {klass.trees.map((tree) => {
              const t = tree.talents[0]!
              return (
                <button key={t.id} type="button" className={`choice ${t.id === choice.talent ? 'active' : ''}`} onClick={() => setChoice({ ...choice, talent: t.id })}>
                  <strong>{t.name}</strong>
                  <span className="muted small">
                    {tree.name}: {t.text}
                  </span>
                </button>
              )
            })}
          </div>

          {preview && (
            <p className="preview small">
              {preview.name || 'You'}: {maxHp(content, preview)} hit points, defence {defence(content, preview)}, {weaponStats(content, preview).name} {signed(weaponStats(content, preview).attack)}, class DC {classDc(content, preview)}. Best skills:{' '}
              {rules.skills
                .map((s) => ({ s, b: skillBonus(content, preview, s.id) }))
                .sort((x, y) => y.b - x.b)
                .slice(0, 4)
                .map(({ s, b }) => `${s.name} ${signed(b)}`)
                .join(', ')}
              .
            </p>
          )}
          {problems.length > 0 && <p className="error small">{problems.join(' ')}</p>}
          <div className="row">
            <button type="button" className="link" disabled={problems.length > 0} onClick={() => onCreate(creationCommand({ ...choice, name: choice.name.trim() }))}>
              [Begin as {choice.name.trim() || '...'}]
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
