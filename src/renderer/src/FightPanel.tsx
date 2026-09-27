import type { Reply } from './client'

// The fight panel (FO, chapter 12): the round, Momentum and the actions left,
// everyone's hit points, distance and conditions, and a button for each thing
// the player can do. The buttons type the same commands the player could type.

type Fight = NonNullable<Reply['status']['combat']>

const pct = (hp: number, max: number) => `${Math.max(0, Math.min(100, Math.round((hp / Math.max(1, max)) * 100)))}%`

export function FightPanel({ fight, send, busy, shield }: { fight: Fight; send: (text: string) => void; busy: boolean; shield: boolean }) {
  const player = fight.fighters.find((f) => f.id === 'player')
  const up = player?.state === 'up'
  const foes = fight.fighters.filter((f) => f.side === 'foes' && f.state === 'up')
  const button = (label: string, command: string, disabled = false, title?: string) => (
    <button key={label} type="button" className="link" disabled={busy || disabled} onClick={() => send(command)} title={title}>
      [{label}]
    </button>
  )

  return (
    <section className="fight" aria-label="Fight">
      <h2>{fight.parley ? 'Trouble' : fight.over ? 'After the fight' : `Round ${fight.round}`}</h2>
      {!fight.parley && !fight.over && (
        <p className="small">
          {fight.actions} action{fight.actions === 1 ? '' : 's'} left{fight.momentum ? `, Momentum +${fight.momentum}` : ''}
          {fight.subdue ? ', to subdue' : ''}
        </p>
      )}
      <ul className="fighters">
        {fight.fighters.map((f) => (
          <li key={f.id} className={`${f.side} ${f.state === 'up' ? '' : 'out'}`}>
            <div className="who">
              <span>{f.name}</span>
              <span className="muted small">
                {f.state === 'up' ? f.distance : f.state}
                {f.conditions.length ? ` (${f.conditions.join(', ')})` : ''}
              </span>
            </div>
            <div className="hp" title={`${f.hp} of ${f.maxHp} hit points`}>
              <span style={{ width: pct(f.hp, f.maxHp) }} />
            </div>
          </li>
        ))}
      </ul>
      {fight.parley && (
        <div className="actions">
          {button('Pay', 'pay')}
          {button('Refuse', 'refuse')}
          {button('Talk your way past', 'talk leave us be or you will regret it')}
          {button('Flee', 'flee')}
        </div>
      )}
      {fight.over && fight.prisoners && (
        <div className="actions">
          {button('Let go', 'let them go')}
          {button('Bind for the schout', 'bind them')}
          {button('Kill', 'kill them')}
        </div>
      )}
      {!fight.parley && !fight.over && up && (
        <>
          <div className="actions">
            {foes.map((f, i) => button(`Strike ${f.name.replace(/^The /, '')}`, `strike ${i === 0 && foes.length === 1 ? '' : f.name.toLowerCase().replace(/^the /, '')}`.trim(), fight.actions < 1 || !f.reachable, f.reachable ? undefined : 'Out of reach'))}
            {button('Advance', 'advance', fight.actions < 1)}
            {button('Step back', 'step back', fight.actions < 1)}
            {shield && button('Raise shield', 'raise shield', fight.actions < 1)}
            {button('Take cover', 'take cover', fight.actions < 1)}
            {button('Use herbs', 'use herbs', fight.actions < 1)}
            {button('Recall', 'recall', fight.actions < 1, 'What do the stories say about it? (Lore)')}
            {button('Demand surrender', 'talk', fight.actions < 1, 'Intimidation against their Will')}
          </div>
          {fight.abilities.length > 0 && (
            <div className="actions">
              {fight.abilities.map((a) => button(`${a.name} (${a.actions})`, a.name.toLowerCase(), !a.ready || fight.actions < a.actions, `${a.actions} action${a.actions === 1 ? '' : 's'}, ${a.range}`))}
            </div>
          )}
          <div className="actions">
            {button(fight.subdue ? 'Fight to kill' : 'Subdue', fight.subdue ? 'lethal' : 'subdue')}
            {button('Flee (2)', 'flee', fight.actions < 2)}
            {button('Surrender', 'surrender', fight.actions < 1)}
            {button('End turn', 'end')}
          </div>
        </>
      )}
    </section>
  )
}
