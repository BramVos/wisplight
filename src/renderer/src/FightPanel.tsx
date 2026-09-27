import type { Reply } from './client'
import { t, tn } from './i18n'

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
    <section className="fight" aria-label={t('fight.panel')}>
      <h2>{fight.parley ? t('fight.heading.trouble') : fight.over ? t('fight.heading.after') : t('fight.heading.round', { n: fight.round })}</h2>
      {!fight.parley && !fight.over && (
        <p className="small">
          {tn('fight.status.actionsLeft', fight.actions)}
          {fight.momentum ? `, ${t('fight.status.momentum', { n: fight.momentum })}` : ''}
          {fight.subdue ? `, ${t('fight.status.subdue')}` : ''}
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
            <div className="hp" title={t('fight.fighter.hp', { hp: f.hp, max: f.maxHp })}>
              <span style={{ width: pct(f.hp, f.maxHp) }} />
            </div>
          </li>
        ))}
      </ul>
      {fight.parley && (
        <div className="actions">
          {button(t('fight.parley.pay'), 'pay')}
          {button(t('fight.parley.refuse'), 'refuse')}
          {button(t('fight.parley.talk'), 'talk leave us be or you will regret it')}
          {button(t('fight.parley.flee'), 'flee')}
        </div>
      )}
      {fight.over && fight.prisoners && (
        <div className="actions">
          {button(t('fight.prisoners.letGo'), 'let them go')}
          {button(t('fight.prisoners.bind'), 'bind them')}
          {button(t('fight.prisoners.kill'), 'kill them')}
        </div>
      )}
      {!fight.parley && !fight.over && up && (
        <>
          <div className="actions">
            {foes.map((f, i) => button(t('fight.actions.strike', { name: f.name.replace(/^The /, '') }), `strike ${i === 0 && foes.length === 1 ? '' : f.name.toLowerCase().replace(/^the /, '')}`.trim(), fight.actions < 1 || !f.reachable, f.reachable ? undefined : t('fight.actions.outOfReach')))}
            {button(t('fight.actions.advance'), 'advance', fight.actions < 1)}
            {button(t('fight.actions.stepBack'), 'step back', fight.actions < 1)}
            {shield && button(t('fight.actions.raiseShield'), 'raise shield', fight.actions < 1)}
            {button(t('fight.actions.takeCover'), 'take cover', fight.actions < 1)}
            {button(t('fight.actions.useHerbs'), 'use herbs', fight.actions < 1)}
            {button(t('fight.actions.recall'), 'recall', fight.actions < 1, t('fight.actions.recallHint'))}
            {button(t('fight.actions.demand'), 'talk', fight.actions < 1, t('fight.actions.demandHint'))}
          </div>
          {fight.abilities.length > 0 && (
            <div className="actions">
              {fight.abilities.map((a) => button(`${a.name} (${a.actions})`, a.name.toLowerCase(), !a.ready || fight.actions < a.actions, tn('fight.ability.cost', a.actions, { range: a.range })))}
            </div>
          )}
          <div className="actions">
            {button(fight.subdue ? t('fight.turn.kill') : t('fight.turn.subdue'), fight.subdue ? 'lethal' : 'subdue')}
            {button(t('fight.turn.flee'), 'flee', fight.actions < 2)}
            {button(t('fight.turn.surrender'), 'surrender', fight.actions < 1)}
            {button(t('fight.turn.end'), 'end')}
          </div>
        </>
      )}
    </section>
  )
}
