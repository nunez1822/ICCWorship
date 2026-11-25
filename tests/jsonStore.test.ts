import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonStore, RETRY_MS } from '../src/main/jsonStore'

describe('JsonStore backups', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'iccw-store-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('never copies a damaged file over a good .bak after a restore', () => {
    const store = new JsonStore(dir)
    store.list('songs')
    store.upsert('songs', { id: 'a' }) // first save: songs.json = [a]
    store.flush()
    store.upsert('songs', { id: 'b' }) // second save: .bak = [a], songs.json = [a,b]
    store.flush()
    const good = readFileSync(join(dir, 'songs.json.bak'), 'utf8')

    // a restore drops in a truncated songs.json, then the store is reset
    writeFileSync(join(dir, 'songs.json'), '[{"id":"a"},{"i')
    store.reset()
    expect(store.list('songs').map((x) => x.id)).toEqual(['a']) // recovered from .bak
    store.upsert('songs', { id: 'c' })
    store.flush()

    expect(readFileSync(join(dir, 'songs.json.bak'), 'utf8')).toBe(good)
    expect(store.problems[0]).toMatchObject({ name: 'songs', kind: 'recovered' })
  })

  it('keeps a main file it could neither read nor copy aside before the first save overwrites it', () => {
    writeFileSync(join(dir, 'songs.json.bak'), '[{"id":"a"}]')
    // a directory can be neither read nor copied — like a file held by antivirus at startup
    mkdirSync(join(dir, 'songs.json'))
    const store = new JsonStore(dir)
    const errors: string[] = []
    store.onWriteError = (name) => errors.push(name)
    expect(store.list('songs').map((x) => x.id)).toEqual(['a']) // fell back to .bak
    expect(store.problems[0]).toMatchObject({ name: 'songs', kind: 'recovered', savedAs: undefined })

    store.upsert('songs', { id: 'b' })
    store.flush()
    expect(errors).toEqual(['songs']) // still held: the save waits rather than overwrite it

    // the lock is gone; the main file turns out to hold newer data than the .bak
    rmSync(join(dir, 'songs.json'), { recursive: true })
    writeFileSync(join(dir, 'songs.json'), '[{"id":"newer"}]')
    store.flush()
    const kept = readdirSync(dir).filter((n) => n.startsWith('songs.json.corrupt-'))
    expect(kept).toHaveLength(1)
    expect(readFileSync(join(dir, kept[0]), 'utf8')).toBe('[{"id":"newer"}]')
    expect(readFileSync(join(dir, 'songs.json.bak'), 'utf8')).toBe('[{"id":"a"}]')
    expect(JSON.parse(readFileSync(join(dir, 'songs.json'), 'utf8')).map((x: { id: string }) => x.id)).toEqual(['a', 'b'])
  })

  describe('a save that fails', () => {
    // a directory where the temp file goes makes the write fail, like an antivirus lock
    const block = () => mkdirSync(join(dir, 'songs.json.tmp'))
    const unblock = () => rmSync(join(dir, 'songs.json.tmp'), { recursive: true, force: true })
    const onDisk = () => JSON.parse(readFileSync(join(dir, 'songs.json'), 'utf8')).map((x: { id: string }) => x.id)
    afterEach(() => vi.useRealTimers())

    it('is written by flush() at quit even with no further edit', () => {
      const store = new JsonStore(dir)
      const errors: string[] = []
      store.onWriteError = (name) => errors.push(name)
      store.list('songs')
      block()
      store.upsert('songs', { id: 'a' })
      store.flush()
      expect(errors).toEqual(['songs'])
      unblock()
      store.flush() // app quits
      expect(onDisk()).toEqual(['a'])
    })

    it('is retried on its own once the file is free again', () => {
      vi.useFakeTimers()
      const store = new JsonStore(dir)
      store.onWriteError = () => {}
      store.list('songs')
      block()
      store.upsert('songs', { id: 'a' })
      vi.advanceTimersByTime(250) // the debounced save fails
      unblock()
      vi.advanceTimersByTime(RETRY_MS)
      expect(onDisk()).toEqual(['a'])
      // and it stops retrying once saved
      expect(vi.getTimerCount()).toBe(0)
    })

    it('is dropped by reset() (a restore replaces the data) without writing undefined later', () => {
      vi.useFakeTimers()
      const store = new JsonStore(dir)
      store.onWriteError = () => {}
      store.list('songs')
      block()
      store.upsert('songs', { id: 'a' })
      store.reset()
      expect(vi.getTimerCount()).toBe(0)
      unblock()
    })
  })
})
