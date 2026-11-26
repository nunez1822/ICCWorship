/**
 * Reads a .zip without loading it into memory: the list of entries comes from the central directory at the end of
 * the file, and each entry is streamed from its place in the file (unpacked on the way if it is deflated). A backup
 * holding every backing track can be GBs; JSZip would need all of it in memory at once.
 *
 * What a backup needs, nothing more: stored and deflated entries, no encryption, no Zip64 (JSZip, which writes our
 * backups, never makes Zip64). Every entry's size and CRC are checked while it is read: a damaged file fails, it is
 * never taken as data. (No Electron imports: unit tested in tests/zipReader.test.ts.)
 */
import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import { Readable, Transform, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createInflateRaw, crc32 } from 'node:zlib'
import { writeStreamAtomic } from './atomicWrite'

export interface ZipEntry {
  name: string
  dir: boolean
  method: number
  flags: number
  crc: number
  compressedSize: number
  size: number
  localOffset: number
}

const EOCD = 0x06054b50
const CENTRAL = 0x02014b50
const LOCAL = 0x04034b50
/** a central directory bigger than this isn't one of our backups (each entry takes ~100 bytes) */
const MAX_DIRECTORY_BYTES = 64 * 1024 * 1024

export class ZipError extends Error {}

/** counts and checksums what passes; fails as soon as there is more than the entry says, or at the end if it differs */
function checker(e: ZipEntry): Transform {
  let n = 0
  let crc = 0
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      n += chunk.length
      if (n > e.size) return cb(new ZipError(`entry larger than it says: ${e.name}`))
      crc = crc32(chunk, crc)
      cb(null, chunk)
    },
    flush(cb) {
      if (n !== e.size || crc >>> 0 !== e.crc >>> 0) return cb(new ZipError(`damaged entry: ${e.name}`))
      cb()
    }
  })
}

export class ZipReader {
  private constructor(
    private readonly path: string,
    private readonly fileSize: number,
    readonly entries: ZipEntry[]
  ) {}

  /** Throws (ZipError, or the file error) when the file isn't a zip this reader can read. */
  static async open(path: string): Promise<ZipReader> {
    const fh = await open(path, 'r')
    try {
      const { size } = await fh.stat()
      if (size < 22) throw new ZipError('not a zip')
      // the end record is the last thing in the file, followed by a comment of up to 64 KB
      const tailLen = Math.min(size, 22 + 0xffff)
      const tail = Buffer.alloc(tailLen)
      await fh.read(tail, 0, tailLen, size - tailLen)
      let at = -1
      for (let i = tailLen - 22; i >= 0; i--) {
        if (tail.readUInt32LE(i) === EOCD) {
          at = i
          break
        }
      }
      if (at < 0) throw new ZipError('not a zip')
      const count = tail.readUInt16LE(at + 10)
      const dirSize = tail.readUInt32LE(at + 12)
      const dirOffset = tail.readUInt32LE(at + 16)
      if (count === 0xffff || dirSize === 0xffffffff || dirOffset === 0xffffffff) throw new ZipError('zip64 is not supported')
      if (dirSize > MAX_DIRECTORY_BYTES || dirOffset + dirSize > size) throw new ZipError('bad central directory')
      const dir = Buffer.alloc(dirSize)
      await fh.read(dir, 0, dirSize, dirOffset)
      const entries: ZipEntry[] = []
      let p = 0
      for (let i = 0; i < count; i++) {
        if (p + 46 > dir.length || dir.readUInt32LE(p) !== CENTRAL) throw new ZipError('bad central directory')
        const nameLen = dir.readUInt16LE(p + 28)
        const extraLen = dir.readUInt16LE(p + 30)
        const commentLen = dir.readUInt16LE(p + 32)
        if (p + 46 + nameLen > dir.length) throw new ZipError('bad central directory')
        const e: ZipEntry = {
          flags: dir.readUInt16LE(p + 8),
          method: dir.readUInt16LE(p + 10),
          crc: dir.readUInt32LE(p + 16),
          compressedSize: dir.readUInt32LE(p + 20),
          size: dir.readUInt32LE(p + 24),
          localOffset: dir.readUInt32LE(p + 42),
          // the same as JSZip: names are read as UTF-8
          name: dir.toString('utf8', p + 46, p + 46 + nameLen),
          dir: false
        }
        if (e.compressedSize === 0xffffffff || e.size === 0xffffffff || e.localOffset === 0xffffffff) throw new ZipError('zip64 is not supported')
        e.dir = e.name.endsWith('/') || e.name.endsWith('\\')
        entries.push(e)
        p += 46 + nameLen + extraLen + commentLen
      }
      return new ZipReader(path, size, entries)
    } finally {
      await fh.close()
    }
  }

  /** the last entry with this name (a zip can repeat a name; the last one wins, as in JSZip) */
  get(name: string): ZipEntry | undefined {
    return this.entries.findLast((e) => e.name === name)
  }

  /** The entry's content as a stream, unpacked and checked. */
  private async stream(e: ZipEntry): Promise<{ source: Readable; through: Transform[] }> {
    if (e.flags & 1) throw new ZipError(`encrypted entry: ${e.name}`)
    if (e.method !== 0 && e.method !== 8) throw new ZipError(`unsupported compression: ${e.name}`)
    const head = Buffer.alloc(30)
    const fh = await open(this.path, 'r')
    try {
      const { bytesRead } = await fh.read(head, 0, 30, e.localOffset)
      if (bytesRead < 30 || head.readUInt32LE(0) !== LOCAL) throw new ZipError(`bad entry: ${e.name}`)
    } finally {
      await fh.close()
    }
    // the sizes come from the central directory: the local header may have zeros (written while streaming)
    const start = e.localOffset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28)
    if (start + e.compressedSize > this.fileSize) throw new ZipError(`bad entry: ${e.name}`)
    const source = e.compressedSize === 0 ? Readable.from([]) : createReadStream(this.path, { start, end: start + e.compressedSize - 1 })
    return { source, through: [...(e.method === 8 ? [createInflateRaw()] : []), checker(e)] }
  }

  /** A small entry's content (the manifest), or undefined if the zip doesn't have it. */
  async readText(name: string, maxBytes = 1024 * 1024): Promise<string | undefined> {
    const e = this.get(name)
    if (!e || e.dir) return undefined
    if (e.size > maxBytes) throw new ZipError(`entry too large: ${e.name}`)
    const { source, through } = await this.stream(e)
    const chunks: Buffer[] = []
    await pipeline([
      source,
      ...through,
      new Writable({
        write(chunk: Buffer, _enc, cb) {
          chunks.push(chunk)
          cb()
        }
      })
    ])
    return Buffer.concat(chunks).toString('utf8')
  }

  /** Unpack an entry into `dest` (written atomically and flushed; a damaged entry leaves nothing behind). */
  async extractTo(e: ZipEntry, dest: string): Promise<void> {
    const { source, through } = await this.stream(e)
    await writeStreamAtomic(dest, source, ...through)
  }
}
