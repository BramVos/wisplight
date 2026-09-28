import { useEffect, useState } from 'react'

// The version check (M10.20; Bram's first world build, 28 September 2026):
// hot reload renewed the interface and the preload, but the main process
// from before the change kept running, and "Propose" failed after twelve
// steps with "No handler registered". Now the interface compares, at start,
// the channels the preload calls with those the main process handles, and
// says at once when they differ.

/** The channels the interface calls that the main process does not handle; all of them when it cannot say (older than this check). */
export function missingChannels(expected: string[], handled: string[] | undefined): string[] {
  if (!handled) return ['app:handled', ...expected].slice(0, 4)
  const known = new Set(handled)
  return expected.filter((c) => !known.has(c))
}

/** What the running app is missing: empty when the interface and the main process agree, and outside the app. */
export async function staleMain(): Promise<string[]> {
  const api = window.wisplight
  if (!api?.channels || !api.handled) return []
  let handled: string[] | undefined
  try {
    handled = await api.handled()
  } catch {
    handled = undefined
  }
  return missingChannels(api.channels(), handled)
}

/** One clear line at the top when the main process is older than the interface. */
export function StaleBanner() {
  const [missing, setMissing] = useState<string[]>([])
  useEffect(() => {
    void staleMain().then(setMissing)
  }, [])
  if (!missing.length) return null
  return (
    <p className="warn stale-banner" role="alert">
      Restart the app: it is running an older version of itself ({missing.slice(0, 3).join(', ')} {missing.length === 1 ? 'is' : 'are'} not known to it yet). Quit it
      completely and start it again; what you typed in the world steps is kept.
    </p>
  )
}
