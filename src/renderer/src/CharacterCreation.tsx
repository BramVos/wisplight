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
import { t } from './i18n'

// Making a character (FO, chapter 11, "Personage maken"): class, ancestry and
// background, boosts, extra skills and a first talent. Everything starts from
// a suggestion for the class, so one click is enough; the choice goes to the
// engine as one CREATE command, which the log keeps for replays.

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`)
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export type Tempo = 'calm' | 'normal' | 'dramatic'

export function CharacterCreation({ data, onCreate, onSkip }: { data: CreationData; onCreate: (command: string, tempo: Tempo) => void; onSkip: (tempo: Tempo) => void }) {
  // How much happens in the world by itself (FO, chapter 3; chosen at a new game since M7.2).
  const [tempo, setTempo] = useState<Tempo>('normal')
  const content = useMemo(() => contentFor(data), [data])
  const rules = data.rules
  const [choice, setChoice] = useState<CreationChoice>(() => suggestChoice(content, rules.classes[0]!.id, ''))

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onSkip(tempo)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSkip, tempo])

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
    const made = createCharacter(content, { ...choice, name: choice.name.trim() || t('creation.preview.defaultName') })
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
    <div className="overlay" role="dialog" aria-modal="true" aria-label={t('creation.dialog')}>
      <div className="panel settings creation">
        <header className="panel-head">
          <h2>{t('creation.head.title')}</h2>
          <span className="muted small">{t('creation.head.hint')}</span>
          <button type="button" className="link" onClick={() => onSkip(tempo)}>
            [{t('creation.head.readyMade')}]
          </button>
        </header>
        <div className="settings-body">
          <div className="row">
            <label className="field">
              <span>{t('creation.name.label')}</span>
              <input value={choice.name} maxLength={30} placeholder={t('creation.name.placeholder')} onChange={(e) => setChoice({ ...choice, name: e.target.value })} autoFocus />
            </label>
            <label className="field">
              <span>{t('creation.pronoun.label')}</span>
              <select value={choice.pronoun ?? 'they'} onChange={(e) => setChoice({ ...choice, pronoun: e.target.value as 'she' | 'he' | 'they' })} aria-label={t('creation.pronoun.aria')}>
                <option value="she">{t('creation.pronoun.she')}</option>
                <option value="he">{t('creation.pronoun.he')}</option>
                <option value="they">{t('creation.pronoun.they')}</option>
              </select>
            </label>
            <label className="field">
              <span>{t('creation.tempo.label')}</span>
              <select value={tempo} onChange={(e) => setTempo(e.target.value as Tempo)} aria-label={t('creation.tempo.aria')}>
                <option value="calm">{t('creation.tempo.calm')}</option>
                <option value="normal">{t('creation.tempo.normal')}</option>
                <option value="dramatic">{t('creation.tempo.dramatic')}</option>
              </select>
            </label>
          </div>

          <h3>{t('creation.class.heading')}</h3>
          <div className="choices">
            {rules.classes.map((c) => (
              <button key={c.id} type="button" className={`choice ${c.id === choice.class ? 'active' : ''}`} onClick={() => pick({ class: c.id })}>
                <strong>{c.name}</strong>
                <span className="muted small">{t('creation.class.summary', { hp: c.hp, key: cap(c.key), core: c.core.name, text: c.core.text })}</span>
              </button>
            ))}
          </div>
          <p className="small">{klass.text}</p>

          <div className="columns">
            <div>
              <h3>{t('creation.ancestry.heading')}</h3>
              {rules.ancestries.map((a) => (
                <label key={a.id} className="radio">
                  <input type="radio" name="ancestry" checked={a.id === choice.ancestry} onChange={() => pick({ ancestry: a.id })} />
                  <span>
                    <strong>{a.name}</strong> <span className="muted small">{t('creation.ancestry.summary', { hp: a.hp, special: a.special })}</span>
                  </span>
                </label>
              ))}
            </div>
            <div>
              <h3>{t('creation.background.heading')}</h3>
              <select value={choice.background} onChange={(e) => pick({ background: e.target.value })} aria-label={t('creation.background.aria')}>
                {rules.backgrounds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}: {b.skills.join(', ')}
                  </option>
                ))}
              </select>
              <p className="muted small">
                {t('creation.background.summary', { skills: background.skills.join(t('creation.background.and')), talent: rules.general_talents.find((g) => g.id === background.talent)?.name ?? '' })}
                {background.knows.length > 0 && ` ${t('creation.background.known')}`}
              </p>
              {background.reason && <p className="creation-reason">{background.reason}</p>}
            </div>
          </div>

          <div className="columns">
            <div>
              <h3>
                {t('creation.attributes.heading')} <span className="muted small">{t('creation.attributes.boosts', { used: choice.boosts.length, total: boosts })}</span>
              </h3>
              {ATTRIBUTES.map((a) => (
                <div key={a} className="attr">
                  <span>{cap(a)}</span>
                  <strong>{signed(preview?.attributes[a] ?? 0)}</strong>
                  <button type="button" className="link" onClick={() => boost(a, -1)} aria-label={t('creation.attributes.less', { attribute: a })}>
                    [-]
                  </button>
                  <button type="button" className="link" onClick={() => boost(a, 1)} aria-label={t('creation.attributes.more', { attribute: a })}>
                    [+]
                  </button>
                </div>
              ))}
            </div>
            <div>
              <h3>
                {t('creation.skills.heading')} <span className="muted small">{t('creation.skills.count', { chosen: choice.skills.length, total: extra })}</span>
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

          <h3>{t('creation.talent.heading')}</h3>
          <div className="choices">
            {klass.trees.map((tree) => {
              const first = tree.talents[0]!
              return (
                <button key={first.id} type="button" className={`choice ${first.id === choice.talent ? 'active' : ''}`} onClick={() => setChoice({ ...choice, talent: first.id })}>
                  <strong>{first.name}</strong>
                  <span className="muted small">
                    {tree.name}: {first.text}
                  </span>
                </button>
              )
            })}
          </div>

          {preview && (
            <p className="preview small">
              {t('creation.preview.summary', {
                name: preview.name || t('creation.preview.you'),
                hp: maxHp(content, preview),
                defence: defence(content, preview),
                weapon: weaponStats(content, preview).name,
                attack: signed(weaponStats(content, preview).attack),
                dc: classDc(content, preview),
                skills: rules.skills
                  .map((s) => ({ s, b: skillBonus(content, preview, s.id) }))
                  .sort((x, y) => y.b - x.b)
                  .slice(0, 4)
                  .map(({ s, b }) => `${s.name} ${signed(b)}`)
                  .join(', '),
              })}
            </p>
          )}
          {problems.length > 0 && <p className="error small">{problems.join(' ')}</p>}
          <div className="row">
            <button type="button" className="link" disabled={problems.length > 0} onClick={() => onCreate(creationCommand({ ...choice, name: choice.name.trim() }), tempo)}>
              [{t('creation.begin', { name: choice.name.trim() || '...' })}]
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
