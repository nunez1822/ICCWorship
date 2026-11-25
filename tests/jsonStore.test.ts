import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
