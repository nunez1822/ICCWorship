import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { copyFileAtomic, renameSyncWithRetry, writeFileAtomic, writeFileAtomicAsync, writeStreamAtomic } from '../src/main/atomicWrite'

const track = Buffer.from(Array.from({ length: 200_000 }, (_, i) => (i * 7919) % 251))

describe('atomic copies and streams', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'iccw-atomic-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('copies a file, leaving no .tmp', async () => {
    writeFileSync(join(dir, 'a.ogg'), track)
    await copyFileAtomic(join(dir, 'a.ogg'), join(dir, 'b.ogg'))
    expect(readFileSync(join(dir, 'b.ogg')).equals(track)).toBe(true)
    expect(existsSync(join(dir, 'b.ogg.tmp'))).toBe(false)
  })

  it('a failed copy leaves nothing behind', async () => {
    await expect(copyFileAtomic(join(dir, 'missing.ogg'), join(dir, 'b.ogg'))).rejects.toThrow()
    expect(readdirSync(dir)).toEqual([])
  })

  it('writes a file whole, sync and async, leaving no .tmp', async () => {
    writeFileAtomic(join(dir, 'a.json'), '[1]')
    await writeFileAtomicAsync(join(dir, 'b.json'), '[2]')
    expect(readFileSync(join(dir, 'a.json'), 'utf8')).toBe('[1]')
    expect(readFileSync(join(dir, 'b.json'), 'utf8')).toBe('[2]')
    expect(readdirSync(dir).sort()).toEqual(['a.json', 'b.json'])
  })

  it('renames over an existing file', () => {
    writeFileSync(join(dir, 'a'), 'new')
    writeFileSync(join(dir, 'b'), 'old')
    renameSyncWithRetry(join(dir, 'a'), join(dir, 'b'))
    expect(readFileSync(join(dir, 'b'), 'utf8')).toBe('new')
    expect(() => renameSyncWithRetry(join(dir, 'missing'), join(dir, 'c'))).toThrow()
  })

  it('streams a file in chunks', async () => {
    await writeStreamAtomic(join(dir, 'f.bin'), Readable.from([track.subarray(0, 1000), track.subarray(1000)]))
    expect(readFileSync(join(dir, 'f.bin')).equals(track)).toBe(true)
    expect(readdirSync(dir)).toEqual(['f.bin'])
  })

  it('a stream that fails half-way never replaces the file', async () => {
    writeFileSync(join(dir, 'f.zip'), 'old')
    const failing = new Readable({
      read() {
        this.push(Buffer.alloc(1000))
        this.destroy(new Error('read failed'))
      }
    })
    await expect(writeStreamAtomic(join(dir, 'f.zip'), failing)).rejects.toThrow('read failed')
    expect(readFileSync(join(dir, 'f.zip'), 'utf8')).toBe('old')
    expect(readdirSync(dir)).toEqual(['f.zip'])
  })
})
