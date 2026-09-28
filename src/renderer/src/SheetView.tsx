import type { JournalPage } from '../../engine'
import { t, tn } from './i18n'

// The character sheet laid out (after the M8 playtest): who you are, the
// numbers that matter in a fight, attributes and saves, then every skill with
// its rank and practice. The text version stays for the terminal client.

type Sheet = NonNullable<JournalPage['sheet']>

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n))

function Meter({ value, max, tone }: { value: number; max: number; tone: 'hp' | 'xp' | 'favour' }) {
  const share = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0
  return (
    <span className={`meter ${tone}`} role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span style={{ width: `${Math.round(share * 100)}%` }} />
    </span>
  )
}

export function SheetView({ sheet }: { sheet: Sheet }) {
  const trained = sheet.skills.filter((s) => s.rank)
  const others = sheet.skills.filter((s) => !s.rank)
  return (
    <div className="sheet-view">
      <header className="sheet-who">
        <div>
          <div className="sheet-name">{sheet.name}</div>
          <div className="muted">
            {sheet.ancestry} {sheet.className} · {sheet.background}
            {sheet.readyMade && ` · ${t('sheet.who.readyMade', { command: 'CREATE' })}`}
          </div>
        </div>
        <div className="sheet-level">
          <span className="sheet-label">{t('sheet.who.level')}</span>
          <span className="sheet-big">{sheet.level}</span>
        </div>
      </header>

      <div className="sheet-bars">
        <div>
          <span className="sheet-label">{t('sheet.bars.hp')}</span>
          <span className="num">
            {sheet.hp} / {sheet.maxHp}
          </span>
          <Meter value={sheet.hp} max={sheet.maxHp} tone="hp" />
          {sheet.mark && <span className="small warn">{t('sheet.bars.mark')}</span>}
        </div>
        <div>
          <span className="sheet-label">{t('sheet.bars.xp')}</span>
          <span className="num">{sheet.nextXp ? `${sheet.xp} / ${sheet.nextXp}` : t('sheet.bars.xpMax', { xp: sheet.xp })}</span>
          <Meter value={sheet.xp} max={sheet.nextXp ?? sheet.xp} tone="xp" />
          {sheet.canLevel && <span className="small ok">{t('sheet.bars.canLevel', { level: sheet.level + 1, command: 'LEVEL UP' })}</span>}
        </div>
      </div>

      <div className="sheet-tiles">
        <div className="tile">
          <span className="sheet-label">{t('sheet.tiles.defence')}</span>
          <span className="sheet-big">{sheet.defence}</span>
          {sheet.defenceShield !== undefined && <span className="small muted">{t('sheet.tiles.withShield', { defence: sheet.defenceShield })}</span>}
        </div>
        <div className="tile">
          <span className="sheet-label">{t('sheet.tiles.initiative')}</span>
          <span className="sheet-big">{signed(sheet.initiative)}</span>
        </div>
        <div className="tile">
          <span className="sheet-label">{t('sheet.tiles.classDc')}</span>
          <span className="sheet-big">{sheet.classDc}</span>
        </div>
      </div>

      <section>
        <h4>{t('sheet.attributes.heading')}</h4>
        <div className="sheet-tiles">
          {sheet.attributes.map((a) => (
            <div key={a.name} className="tile">
              <span className="sheet-label">{a.name}</span>
              <span className="sheet-big">{signed(a.value)}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h4>{t('sheet.saves.heading')}</h4>
        <div className="sheet-tiles">
          {sheet.saves.map((s) => (
            <div key={s.name} className="tile">
              <span className="sheet-label">{s.name}</span>
              <span className="sheet-big">{signed(s.value)}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h4>{t('sheet.arms.heading')}</h4>
        <dl className="sheet-kv">
          <dt>{t('sheet.arms.weapon')}</dt>
          <dd>
            {t('sheet.arms.weaponLine', { name: sheet.weapon.name, attack: signed(sheet.weapon.attack), damage: sheet.weapon.damage })}
            {sheet.weapon.crit && `, ${t('sheet.arms.critical', { crit: sheet.weapon.crit })}`}
          </dd>
          <dt>{t('sheet.arms.armour')}</dt>
          <dd>{sheet.armour.length ? sheet.armour.join(', ') : t('sheet.arms.none')}</dd>
        </dl>
      </section>

      <section>
        <h4>
          {t('sheet.skills.heading')}
          {sheet.skillPoints > 0 && <span className="small ok"> · {t('sheet.skills.points', { points: sheet.skillPoints, command: 'TRAIN' })}</span>}
        </h4>
        <table className="sheet-skills">
          <tbody>
            {[...trained, ...others].map((s) => (
              <tr key={s.name} className={s.rank ? 'trained' : ''}>
                <td>{s.name}</td>
                <td className="num">{signed(s.bonus)}</td>
                <td>{s.rank && <span className="rank">{s.rank}</span>}</td>
                <td className="practice" title={s.practice ? t('sheet.skills.practice', { n: s.practice }) : undefined}>
                  {'●'.repeat(s.practice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h4>{t('sheet.talents.heading')}</h4>
        <div className="sheet-chips">
          {sheet.talents.map((talent) => (
            <span key={talent} className="chip">
              {talent}
            </span>
          ))}
          {sheet.general.map((talent) => (
            <span key={talent} className="chip general">
              {talent}
            </span>
          ))}
        </div>
        <p className="small muted">{sheet.special}</p>
      </section>

      {sheet.crafts && sheet.crafts.length > 0 && (
        <section>
          <h4>{t('sheet.crafts.heading')}</h4>
          {sheet.crafts.map((line) => (
            <p key={line} className="small">
              {line}
            </p>
          ))}
        </section>
      )}

      {(sheet.conditions.length > 0 || sheet.patron || sheet.deaths > 0) && (
        <section>
          <h4>{t('sheet.also.heading')}</h4>
          {sheet.conditions.length > 0 && (
            <div className="sheet-chips">
              {sheet.conditions.map((c) => (
                <span key={c.name} className="chip bad">
                  {c.name}
                  {c.level > 1 ? ` ${c.level}` : ''}
                </span>
              ))}
            </div>
          )}
          {sheet.patron && (
            <div className="sheet-patron">
              <span>{t('sheet.also.patron', { name: sheet.patron.name, favour: sheet.patron.favour })}</span>
              <Meter value={sheet.patron.favour} max={100} tone="favour" />
              {sheet.patron.blessings.length > 0 && <span className="small muted">{t('sheet.also.blessings', { list: sheet.patron.blessings.join(', ') })}</span>}
            </div>
          )}
          {sheet.deaths > 0 && <p className="small muted">{tn('sheet.also.deaths', sheet.deaths)}</p>}
        </section>
      )}

      {sheet.notes && sheet.notes.length > 0 && (
        <section>
          {sheet.notes.map((line, i) => (
            <p key={i} className="small muted">
              {line}
            </p>
          ))}
        </section>
      )}
    </div>
  )
}
