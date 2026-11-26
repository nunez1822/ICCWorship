import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import JSZip from 'jszip'
import { ZipError, ZipReader } from '../src/main/zipReader'
import { writeStreamAtomic } from '../src/main/atomicWrite'

// placeholder content only (never real lyrics or Bible text)
const json = JSON.stringify([{ id: 's1', title: 'Placeholder song', lyrics: 'la la la\n'.repeat(500) }])
const track = Buffer.from(Array.from({ length: 200_000 }, (_, i) => (i * 7919) % 251))

async function makeZip(file: string, streamFiles: boolean): Promise<void> {
  const zip = new JSZip()
  zip.file('iccworship-backup.json', JSON.stringify({ app: 'ICCWorship', format: 1 }))
  zip.file('data/songs.json', json)
  zip.file('tracks/s1-1.ogg', Readable.from([track.subarray(0, 70_000), track.subarray(70_000)]), { compression: 'STORE', binary: true })
  zip.file('data/empty.json', '')
  await writeStreamAtomic(file, zip.generateNodeStream({ type: 'nodebuffer', streamFiles, compression: 'DEFLATE' }) as Readable)
}

describe('ZipReader', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'iccw-zip-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  for (const streamFiles of [true, false]) {
    it(`reads what JSZip wrote (streamFiles: ${streamFiles}), stored and deflated entries`, async () => {
      const f = join(dir, 'b.zip')
      await makeZip(f, streamFiles)
      const z = await ZipReader.open(f)
      expect(z.entries.filter((e) => !e.dir).map((e) => e.name)).toEqual(['iccworship-backup.json', 'data/songs.json', 'tracks/s1-1.ogg', 'data/empty.json'])
      expect(z.entries.some((e) => e.dir && e.name === 'data/')).toBe(true)
      expect(JSON.parse((await z.readText('iccworship-backup.json'))!)).toEqual({ app: 'ICCWorship', format: 1 })
      expect(await z.readText('nope.json')).toBeUndefined()
      await z.extractTo(z.get('data/songs.json')!, join(dir, 'songs.json'))
      expect(readFileSync(join(dir, 'songs.json'), 'utf8')).toBe(json)
      await z.extractTo(z.get('tracks/s1-1.ogg')!, join(dir, 't.ogg'))
      expect(readFileSync(join(dir, 't.ogg')).equals(track)).toBe(true)
      await z.extractTo(z.get('data/empty.json')!, join(dir, 'empty.json'))
      expect(readFileSync(join(dir, 'empty.json'), 'utf8')).toBe('')
      // JSZip reads it back the same (what older versions of the app restored with)
      const back = await JSZip.loadAsync(readFileSync(f))
      expect(await back.file('data/songs.json')!.async('string')).toBe(json)
    })
  }

  it('refuses a file that is not a zip', async () => {
    const f = join(dir, 'x.zip')
    writeFileSync(f, 'just some text, renamed to .zip')
    await expect(ZipReader.open(f)).rejects.toBeInstanceOf(ZipError)
    writeFileSync(f, '')
    await expect(ZipReader.open(f)).rejects.toBeInstanceOf(ZipError)
  })

  it('refuses a damaged entry and leaves no file behind', async () => {
    const f = join(dir, 'b.zip')
    await makeZip(f, true)
    const buf = readFileSync(f)
    // flip a byte inside the stored track (its bytes are in the file as they are)
    const at = buf.indexOf(track.subarray(1000, 1032))
    expect(at).toBeGreaterThan(0)
    buf[at + 5] ^= 0xff
    writeFileSync(f, buf)
    const z = await ZipReader.open(f)
    await expect(z.extractTo(z.get('tracks/s1-1.ogg')!, join(dir, 't.ogg'))).rejects.toBeInstanceOf(ZipError)
    expect(readdirSync(dir).sort()).toEqual(['b.zip'])
  })

  it('reads every entry of a backup with more than 65,535 of them (JSZip keeps only 16 bits of the count)', async () => {
    const f = join(dir, 'big.zip')
    const zip = new JSZip()
    const n = 65_537 + 3
    for (let i = 0; i < n; i++) zip.file(`cache/presentations/p/${i}.png`, '', { compression: 'STORE' })
    writeFileSync(f, await zip.generateAsync({ type: 'nodebuffer' }))
    const buf = readFileSync(f)
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    const z = await ZipReader.open(f)
    expect(z.entries.length).toBeGreaterThan(0xffff)
    expect(buf.readUInt16LE(eocd + 10)).toBe(z.entries.length & 0xffff) // what JSZip wrote: a handful, not 65,540+
    const files = z.entries.filter((e) => !e.dir)
    expect(files).toHaveLength(n)
    expect(files.at(-1)!.name).toBe(`cache/presentations/p/${n - 1}.png`)
  }, 60_000)

  it('refuses a directory that disagrees with the count in the end record', async () => {
    const f = join(dir, 'b.zip')
    await makeZip(f, false)
    const buf = readFileSync(f)
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
    buf.writeUInt16LE(buf.readUInt16LE(eocd + 10) + 1, eocd + 10)
    buf.writeUInt16LE(buf.readUInt16LE(eocd + 8) + 1, eocd + 8)
    writeFileSync(f, buf)
    await expect(ZipReader.open(f)).rejects.toBeInstanceOf(ZipError)
  })

  it('refuses a truncated zip', async () => {
    const f = join(dir, 'b.zip')
    await makeZip(f, true)
    writeFileSync(f, readFileSync(f).subarray(0, 5000))
    await expect(ZipReader.open(f)).rejects.toThrow()
  })
})
