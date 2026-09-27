import type { NpcSnapshot } from '../../engine'

// One person as the inspector shows them: the editor's playtest and the dev
// menu of the running game (M10.1) use the same panel.

export function NpcInspector({ npc, children }: { npc: NpcSnapshot; children?: React.ReactNode }) {
  return (
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
      <p className="muted">{npc.life.join(' ')}</p>
      {children}
      {npc.plans.length > 0 && (
        <>
          <h3>Part of</h3>
          <ul className="check-list">{npc.plans.map((p) => <li key={p}>{p}</li>)}</ul>
        </>
      )}
      {npc.beliefs.length > 0 && (
        <>
          <h3>Believes</h3>
          <ul className="check-list">{npc.beliefs.map((b, i) => <li key={i}>{b}</li>)}</ul>
        </>
      )}
      <h3>Remembers</h3>
      <ul className="check-list">{npc.memory.length ? npc.memory.map((m) => <li key={m}>{m}</li>) : <li className="muted">nothing yet</li>}</ul>
      {npc.days.length > 0 && (
        <>
          <h3>Did</h3>
          <ul className="check-list">{npc.days.slice(-25).map((d, i) => <li key={i}>{d}</li>)}</ul>
        </>
      )}
    </div>
  )
}
