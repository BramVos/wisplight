// Sound, modest (M10.15): the ambient sound of where the player is and a bell
// on the hour, made here from noise and tone with the Web Audio API; no
// recordings, nothing downloaded. At most one ambient sound plays, and a bell
// over it now and then. Soft by default, off with one setting, silent in
// menus and pauses, and nothing while the game loads. The engine says what is
// to be heard (status.sound); this only makes it.

import type { SoundNow } from '../../engine'

type Kind = SoundNow['kind']

interface Playing {
  kind: Kind
  indoors: boolean
  gain: GainNode
  stop: () => void
}

/** A loop of noise: white, pink (softer highs) or brown (mostly low). */
function noiseBuffer(ctx: AudioContext, colour: 'white' | 'pink' | 'brown'): AudioBuffer {
  const length = ctx.sampleRate * 3
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  let b0 = 0
  let b1 = 0
  let b2 = 0
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1
    if (colour === 'white') data[i] = white * 0.5
    else if (colour === 'brown') {
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.5
    } else {
      b0 = 0.99765 * b0 + white * 0.099046
      b1 = 0.963 * b1 + white * 0.2965164
      b2 = 0.57 * b2 + white * 1.0526913
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.12
    }
  }
  return buffer
}

export class SoundPlayer {
  private ctx?: AudioContext
  private master?: GainNode
  private playing?: Playing
  private buffers = new Map<string, AudioBuffer>()
  private volume = 0.25
  private on = true
  private held = false
  private wanted?: { kind: Kind; level: number; indoors: boolean }

  /** Settings: on or off, and how loud (0 to 1). */
  configure(on: boolean, volume: number): void {
    this.on = on
    this.volume = Math.max(0, Math.min(1, volume))
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.on && !this.held ? this.volume : 0, this.ctx.currentTime, 0.3)
    if (!on) this.stopAmbient()
    else if (this.wanted) this.ambient(this.wanted.kind, this.wanted.level, this.wanted.indoors)
  }

  /** Menus, dialogs and a paused game: silent until let go. */
  hold(held: boolean): void {
    this.held = held
    if (!this.ctx || !this.master) return
    this.master.gain.setTargetAtTime(this.on && !held ? this.volume : 0, this.ctx.currentTime, 0.2)
  }

  /** The browser lets sound start only after the player did something: called on the first key or click. */
  wake(): void {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      this.ctx = new Ctx()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.on && !this.held ? this.volume : 0
      this.master.connect(this.ctx.destination)
      if (this.wanted) this.ambient(this.wanted.kind, this.wanted.level, this.wanted.indoors)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  private noise(colour: 'white' | 'pink' | 'brown'): AudioBufferSourceNode {
    const ctx = this.ctx!
    let buffer = this.buffers.get(colour)
    if (!buffer) {
      buffer = noiseBuffer(ctx, colour)
      this.buffers.set(colour, buffer)
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    return source
  }

  /** A slow wobble on a value: the wind rising and falling, the swell of the sea. */
  private lfo(target: AudioParam, rate: number, depth: number): OscillatorNode {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.frequency.value = rate
    const amount = ctx.createGain()
    amount.gain.value = depth
    osc.connect(amount).connect(target)
    osc.start()
    return osc
  }

  /** The ambient sound: crossfaded from what played before, one at a time. */
  ambient(kind: Kind, level: number, indoors: boolean): void {
    this.wanted = { kind, level, indoors }
    if (!this.ctx || !this.master || !this.on) return
    if (this.playing && this.playing.kind === kind && this.playing.indoors === indoors) {
      this.playing.gain.gain.setTargetAtTime(level, this.ctx.currentTime, 1)
      return
    }
    this.stopAmbient()
    if (kind === 'quiet' || level <= 0) return
    const ctx = this.ctx
    const gain = ctx.createGain()
    gain.gain.value = 0
    // Under a roof the world outside is muffled.
    const room = ctx.createBiquadFilter()
    room.type = 'lowpass'
    room.frequency.value = indoors ? 900 : 12000
    gain.connect(room).connect(this.master)
    const stops = this.build(kind, gain)
    gain.gain.setTargetAtTime(level, ctx.currentTime, 1.2)
    this.playing = {
      kind,
      indoors,
      gain,
      stop: () => {
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.8)
        window.setTimeout(() => {
          for (const s of stops) s()
          gain.disconnect()
        }, 3000)
      },
    }
  }

  private stopAmbient(): void {
    this.playing?.stop()
    this.playing = undefined
  }

  /** The nodes of one kind of sound, into gain; what stops them. */
  private build(kind: Kind, out: GainNode): (() => void)[] {
    const ctx = this.ctx!
    const stops: (() => void)[] = []
    const through = (source: AudioScheduledSourceNode, ...nodes: AudioNode[]) => {
      let last: AudioNode = source
      for (const n of nodes) last = last.connect(n)
      last.connect(out)
      source.start()
      stops.push(() => source.stop())
    }
    const filter = (type: BiquadFilterType, frequency: number, q = 0.7) => {
      const f = ctx.createBiquadFilter()
      f.type = type
      f.frequency.value = frequency
      f.Q.value = q
      return f
    }
    const swell = (rate: number, depth: number, base = 1) => {
      const g = ctx.createGain()
      g.gain.value = base
      const osc = this.lfo(g.gain, rate, depth)
      stops.push(() => osc.stop())
      return g
    }
    // Now and then: a crackle in the fire, a hammer on iron, a bird.
    const now_and_then = (every: [number, number], play: () => void) => {
      let timer = 0
      const next = () => {
        timer = window.setTimeout(() => {
          play()
          next()
        }, every[0] + Math.random() * (every[1] - every[0]))
      }
      next()
      stops.push(() => window.clearTimeout(timer))
    }
    const blip = (frequency: number, length: number, volume: number, sweep = 0) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.frequency.value = frequency
      if (sweep) osc.frequency.linearRampToValueAtTime(frequency + sweep, ctx.currentTime + length)
      g.gain.value = volume
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + length)
      osc.connect(g).connect(out)
      osc.start()
      osc.stop(ctx.currentTime + length + 0.05)
    }
    const crackle = () => {
      const source = this.noise('white')
      const g = ctx.createGain()
      g.gain.value = 0.5
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.05)
      source.connect(filter('highpass', 2000)).connect(g).connect(out)
      source.start()
      source.stop(ctx.currentTime + 0.08)
    }
    switch (kind) {
      case 'wind': {
        const f = filter('lowpass', 500)
        const osc = this.lfo(f.frequency, 0.07, 250)
        stops.push(() => osc.stop())
        through(this.noise('pink'), f, swell(0.05, 0.35, 0.7))
        break
      }
      case 'reeds':
        through(this.noise('pink'), filter('lowpass', 450), swell(0.06, 0.3, 0.6))
        through(this.noise('white'), filter('bandpass', 4200, 1.5), swell(0.3, 0.08, 0.1))
        break
      case 'rain':
        through(this.noise('white'), filter('highpass', 900), filter('lowpass', 6000), swell(0.2, 0.05, 0.5))
        break
      case 'sea':
        through(this.noise('brown'), filter('lowpass', 600), swell(0.08, 0.45, 0.6))
        break
      case 'surf':
        through(this.noise('brown'), filter('lowpass', 900), swell(0.11, 0.6, 0.7))
        through(this.noise('pink'), filter('highpass', 1500), swell(0.11, 0.2, 0.15))
        break
      case 'hearth':
        through(this.noise('brown'), filter('lowpass', 250), swell(0.2, 0.1, 0.35))
        now_and_then([120, 900], crackle)
        break
      case 'crowd':
        through(this.noise('pink'), filter('bandpass', 600, 0.9), swell(0.4, 0.25, 0.5))
        break
      case 'workshop':
        through(this.noise('brown'), filter('lowpass', 300), swell(0.1, 0.05, 0.2))
        now_and_then([1400, 3200], () => blip(820 + Math.random() * 80, 0.35, 0.25))
        break
      case 'water':
        through(this.noise('white'), filter('bandpass', 1400, 1.2), swell(1.3, 0.2, 0.35))
        break
      case 'birds':
        through(this.noise('pink'), filter('lowpass', 400), swell(0.05, 0.1, 0.25))
        now_and_then([1800, 6000], () => blip(2600 + Math.random() * 1400, 0.12, 0.06, 900))
        break
      case 'hum': {
        const osc = ctx.createOscillator()
        osc.frequency.value = 60
        const g = ctx.createGain()
        g.gain.value = 0.15
        osc.connect(g).connect(out)
        osc.start()
        stops.push(() => osc.stop())
        through(this.noise('brown'), filter('lowpass', 200), swell(0.03, 0.05, 0.3))
        break
      }
      default:
        break
    }
    return stops
  }

  /** A bell (M10.15): struck once, with its partials dying away; far off, lower and muffled. */
  bell(far: boolean): void {
    if (!this.ctx || !this.master || !this.on || this.held) return
    const ctx = this.ctx
    const out = ctx.createGain()
    out.gain.value = far ? 0.12 : 0.3
    const muffle = ctx.createBiquadFilter()
    muffle.type = 'lowpass'
    muffle.frequency.value = far ? 700 : 5000
    out.connect(muffle).connect(this.master)
    const base = 440
    for (const [ratio, level, decay] of [
      [0.5, 0.5, 5],
      [1, 1, 4],
      [1.2, 0.6, 3],
      [1.5, 0.4, 2.5],
      [2, 0.35, 2],
      [2.74, 0.2, 1.5],
    ] as const) {
      const osc = ctx.createOscillator()
      osc.frequency.value = base * ratio
      const g = ctx.createGain()
      g.gain.value = level * 0.2
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + decay)
      osc.connect(g).connect(out)
      osc.start()
      osc.stop(ctx.currentTime + decay + 0.1)
    }
    window.setTimeout(() => out.disconnect(), 6000)
  }
}

/** The one player of the window. */
export const sound = new SoundPlayer()
