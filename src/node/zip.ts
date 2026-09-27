import { closeSync, openSync, writeSync } from 'node:fs'
import { crc32, deflateRawSync } from 'node:zlib'

// A small zip writer for exports: one file at a time, each deflated and written
// straight to disk, so only the file being added is ever in memory. Mac and
// Windows open the result without extra software. No zip64: an archive stops
// at 4 GB, far beyond any game log.

interface Entry {
  name: Buffer
  crc: number
  compressed: number
  size: number
  offset: number
}

const LIMIT = 0xffffffff

export class ZipWriter {
  private readonly fd: number
  private readonly entries: Entry[] = []
  private offset = 0
  private readonly time: number
  private readonly date: number

  constructor(path: string, now = new Date()) {
    this.fd = openSync(path, 'w')
    this.time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2)
    this.date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  }

  add(name: string, data: Buffer): void {
    const file = Buffer.from(name, 'utf8')
    const packed = deflateRawSync(data)
    const entry: Entry = { name: file, crc: crc32(data), compressed: packed.length, size: data.length, offset: this.offset }
    if (entry.offset + 30 + file.length + packed.length > LIMIT) throw new Error('The export is larger than a zip file can hold.')
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4) // version needed
    head.writeUInt16LE(0x0800, 6) // names are UTF-8
    head.writeUInt16LE(8, 8) // deflate
    head.writeUInt16LE(this.time, 10)
    head.writeUInt16LE(this.date, 12)
    head.writeUInt32LE(entry.crc, 14)
    head.writeUInt32LE(entry.compressed, 18)
    head.writeUInt32LE(entry.size, 22)
    head.writeUInt16LE(file.length, 26)
    head.writeUInt16LE(0, 28)
    this.write(head)
    this.write(file)
    this.write(packed)
    this.entries.push(entry)
  }

  finish(): void {
    try {
      const start = this.offset
      for (const e of this.entries) {
        const head = Buffer.alloc(46)
        head.writeUInt32LE(0x02014b50, 0)
        head.writeUInt16LE(20, 4) // made by
        head.writeUInt16LE(20, 6) // version needed
        head.writeUInt16LE(0x0800, 8)
        head.writeUInt16LE(8, 10)
        head.writeUInt16LE(this.time, 12)
        head.writeUInt16LE(this.date, 14)
        head.writeUInt32LE(e.crc, 16)
        head.writeUInt32LE(e.compressed, 20)
        head.writeUInt32LE(e.size, 24)
        head.writeUInt16LE(e.name.length, 28)
        head.writeUInt32LE(e.offset, 42)
        this.write(head)
        this.write(e.name)
      }
      const end = Buffer.alloc(22)
      end.writeUInt32LE(0x06054b50, 0)
      end.writeUInt16LE(this.entries.length, 8)
      end.writeUInt16LE(this.entries.length, 10)
      end.writeUInt32LE(this.offset - start, 12)
      end.writeUInt32LE(start, 16)
      this.write(end)
    } finally {
      closeSync(this.fd)
    }
  }

  /** Closes the file without finishing it, after an error. */
  abort(): void {
    closeSync(this.fd)
  }

  private write(data: Buffer): void {
    writeSync(this.fd, data)
    this.offset += data.length
  }
}
