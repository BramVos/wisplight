import type { WorldChoice } from './client'

// A new game begins with the world (M8): the content folder can hold more
// than one, and each has its own story. The first paragraph of a world's
// opening text is its description here.

const blurb = (intro?: string) => intro?.split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').trim()

export function WorldPicker({ worlds, onPick }: { worlds: WorldChoice[]; onPick: (folder: string) => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Choose a world">
      <div className="panel settings creation worlds">
        <header className="panel-head">
          <h2>Where does your story begin?</h2>
          <span className="muted small">Each world has its own people, places and story. A saved game opens in its own world.</span>
        </header>
        <div className="choices">
          {worlds.map((w) => (
            <button key={w.folder} type="button" data-world={w.folder} className={`choice ${w.current ? 'active' : ''}`} onClick={() => onPick(w.folder)} autoFocus={w.current}>
              <strong>{w.name}</strong>
              {blurb(w.intro) && <span className="muted small">{blurb(w.intro)}</span>}
              <span className="small">[Begin here]</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
