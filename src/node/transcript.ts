import { appendFile, mkdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

// The transcript (M10.4): everything the player sees, as Markdown, in a
// folder of their choice. One file per game and per real day, only ever
// added to. Your input as `> ...`, speech as a quote, system lines in
// italics, a heading per game day and per place. It never holds up the game:
// lines wait in a buffer and go to disk in the background at the end of each
// turn; past a few megabytes the file goes on in a next one (-2.md); and when
// writing fails, the transcript turns itself off and says so once.

export interface TranscriptSettings {
  enabled: boolean
  folder: string
}

export interface TranscriptLine {
  kind: string
  text: string
}

/** Where the game stands: the game day and the place, for the headings. */
export interface TranscriptWhere {
  time: string
  location: string
}

/** Past this size a file goes on in the next one. */
export const TRANSCRIPT_MAX_BYTES = 3 * 1024 * 1024

export interface TranscriptFs {
  appendFile(path: string, data: string): Promise<void>
  stat(path: string): Promise<{ size: number }>
  mkdir(path: string): Promise<unknown>
}

const nodeFs: TranscriptFs = {
  appendFile: (path, data) => appendFile(path, data, 'utf8'),
  stat: (path) => stat(path),
  mkdir: (path) => mkdir(path, { recursive: true }),
}

export class Transcript {
  private buffer: string[] = []
  private day?: string
  private place?: string
  private world = 'world'
  private game = 'game'
  private part = 1
  private writing: Promise<void> = Promise.resolve()

  constructor(
    private settings: TranscriptSettings,
    private readonly onError: (message: string) => void = () => undefined,
    private readonly fs: TranscriptFs = nodeFs,
    private readonly today: () => string = () => new Date().toISOString().slice(0, 10),
  ) {}

  get enabled(): boolean {
    return this.settings.enabled && Boolean(this.settings.folder)
  }

  configure(settings: TranscriptSettings): void {
    this.settings = settings
    this.part = 1
  }

  /** A game begins or is loaded: its own file, with a fresh heading. */
  begin(world: string, game: string): void {
    this.world = slug(world) || 'world'
    this.game = slug(game).slice(0, 12) || 'game'
    this.day = undefined
    this.place = undefined
    this.part = 1
  }

  /** What was typed and what came back, with where the game stands. */
  record(input: string | undefined, lines: TranscriptLine[], where: TranscriptWhere): void {
    if (!this.enabled) return
    const day = where.time.split(',')[0]?.trim() ?? where.time
    if (day !== this.day) {
      this.day = day
      this.place = undefined
      this.buffer.push(`\n## ${day}\n`)
    }
    if (where.location !== this.place) {
      this.place = where.location
      this.buffer.push(`\n### ${where.location}\n`)
    }
    if (input) this.buffer.push(`\`> ${input.replace(/`/g, "'")}\`\n`)
    for (const line of lines) {
      const text = line.text.trim()
      if (!text) continue
      if (line.kind === 'speech') this.buffer.push(`${text.split('\n').map((l) => `> ${l}`).join('\n')}\n`)
      else if (line.kind === 'system' || line.kind === 'check' || line.kind === 'error') this.buffer.push(`${text.split('\n').map((l) => (l.trim() ? `*${l.trim()}*` : '')).join('\n')}\n`)
      else this.buffer.push(`${text}\n`)
    }
  }

  /** At the end of a turn: what waits goes to disk, in the background. Returns when it is written. */
  flush(): Promise<void> {
    if (!this.buffer.length || !this.enabled) {
      this.buffer = []
      return this.writing
    }
    const text = this.buffer.join('\n')
    this.buffer = []
    this.writing = this.writing.then(() => this.write(text)).catch(() => undefined)
    return this.writing
  }

  /** The file lines go to now: per game and per real day, and the next part past the size. */
  path(): string {
    return join(this.settings.folder, `${this.world}-${this.game}-${this.today()}${this.part > 1 ? `-${this.part}` : ''}.md`)
  }

  private async write(text: string): Promise<void> {
    if (!this.enabled) return
    try {
      await this.fs.mkdir(this.settings.folder)
      const size = await this.fs.stat(this.path()).then((s) => s.size).catch(() => 0)
      if (size + Buffer.byteLength(text) > TRANSCRIPT_MAX_BYTES && size > 0) this.part++
      await this.fs.appendFile(this.path(), text)
    } catch (error) {
      this.settings = { ...this.settings, enabled: false }
      this.onError(error instanceof Error ? error.message : String(error))
    }
  }
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
