import type { JournalPage } from '../../engine'

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
            {sheet.readyMade && ' · the ready-made traveller (CREATE makes your own)'}
          </div>
        </div>
        <div className="sheet-level">
          <span className="sheet-label">Level</span>
          <span className="sheet-big">{sheet.level}</span>
        </div>
      </header>

      <div className="sheet-bars">
        <div>
          <span className="sheet-label">Hit points</span>
          <span className="num">
            {sheet.hp} / {sheet.maxHp}
          </span>
          <Meter value={sheet.hp} max={sheet.maxHp} tone="hp" />
          {sheet.mark && <span className="small warn">The Rider's Mark: -10% until a rite for the dead</span>}
        </div>
        <div>
          <span className="sheet-label">Experience</span>
          <span className="num">{sheet.nextXp ? `${sheet.xp} / ${sheet.nextXp}` : `${sheet.xp} (highest level)`}</span>
          <Meter value={sheet.xp} max={sheet.nextXp ?? sheet.xp} tone="xp" />
          {sheet.canLevel && <span className="small ok">You can rise to level {sheet.level + 1}: LEVEL UP.</span>}
        </div>
      </div>

      <div className="sheet-tiles">
        <div className="tile">
          <span className="sheet-label">Defence</span>
          <span className="sheet-big">{sheet.defence}</span>
          {sheet.defenceShield !== undefined && <span className="small muted">{sheet.defenceShield} with shield</span>}
        </div>
        <div className="tile">
          <span className="sheet-label">Initiative</span>
          <span className="sheet-big">{signed(sheet.initiative)}</span>
        </div>
        <div className="tile">
          <span className="sheet-label">Class DC</span>
          <span className="sheet-big">{sheet.classDc}</span>
        </div>
      </div>

      <section>
        <h4>Attributes</h4>
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
        <h4>Saves</h4>
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
        <h4>Arms and armour</h4>
        <dl className="sheet-kv">
          <dt>Weapon</dt>
          <dd>
            {sheet.weapon.name}: attack {signed(sheet.weapon.attack)}, damage {sheet.weapon.damage}
            {sheet.weapon.crit && `, critical: ${sheet.weapon.crit}`}
          </dd>
          <dt>Armour</dt>
          <dd>{sheet.armour.length ? sheet.armour.join(', ') : 'none'}</dd>
        </dl>
      </section>

      <section>
        <h4>
          Skills
          {sheet.skillPoints > 0 && <span className="small ok"> · {sheet.skillPoints} skill points to spend (TRAIN &lt;skill&gt;)</span>}
        </h4>
        <table className="sheet-skills">
          <tbody>
            {[...trained, ...others].map((s) => (
              <tr key={s.name} className={s.rank ? 'trained' : ''}>
                <td>{s.name}</td>
                <td className="num">{signed(s.bonus)}</td>
                <td>{s.rank && <span className="rank">{s.rank}</span>}</td>
                <td className="practice" title={s.practice ? `${s.practice} practice` : undefined}>
                  {'●'.repeat(s.practice)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h4>Talents</h4>
        <div className="sheet-chips">
          {sheet.talents.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
          {sheet.general.map((t) => (
            <span key={t} className="chip general">
              {t}
            </span>
          ))}
        </div>
        <p className="small muted">{sheet.special}</p>
      </section>

      {(sheet.conditions.length > 0 || sheet.patron || sheet.deaths > 0) && (
        <section>
          <h4>Also</h4>
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
              <span>
                Patron: {sheet.patron.name}, favour {sheet.patron.favour}/100
              </span>
              <Meter value={sheet.patron.favour} max={100} tone="favour" />
              {sheet.patron.blessings.length > 0 && <span className="small muted">Blessings: {sheet.patron.blessings.join(', ')}</span>}
            </div>
          )}
          {sheet.deaths > 0 && <p className="small muted">You have walked the Way of the Grey Rider {sheet.deaths === 1 ? 'once' : `${sheet.deaths} times`}.</p>}
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
