import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
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

describe('JsonStore read-only mode and atomic writes', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'iccw-store-ro-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('keeps changes in memory but never writes (data from a newer version)', () => {
    writeFileSync(join(dir, 'songs.json'), '[{"id":"newer"}]')
    const store = new JsonStore(dir)
    store.readOnly = true
    store.upsert('songs', { id: 'x' })
    store.write('settings', { a: 1 }, true)
    store.flush()
    expect(store.list('songs').map((s) => s.id)).toEqual(['newer', 'x']) // visible for this session
    expect(readFileSync(join(dir, 'songs.json'), 'utf8')).toBe('[{"id":"newer"}]') // untouched on disk
    expect(readdirSync(dir)).toEqual(['songs.json'])
    expect(store.writeCount).toBe(0)
  })

  it('counts saves and leaves no temporary file behind', () => {
    const store = new JsonStore(dir)
    store.upsert('songs', { id: 'a' })
    store.flush()
    store.upsert('songs', { id: 'b' })
    store.flush()
    expect(store.writeCount).toBe(2)
    expect(readdirSync(dir).sort()).toEqual(['songs.json', 'songs.json.bak'])
  })
})

describe('JsonStore and backups of recovered files', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'iccw-store-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('gives a backup the recovered value while the main file on disk is damaged', () => {
    writeFileSync(join(dir, 'songs.json'), '[{"id":"a"},{"i')
    writeFileSync(join(dir, 'songs.json.bak'), '[{"id":"a"}]')
    writeFileSync(join(dir, 'plans.json'), '[{"id":"p"}]')
    const store = new JsonStore(dir)
    store.list('songs')
    store.list('plans')
    const r = store.recoveredForBackup()
    expect([...r.keys()]).toEqual(['songs']) // a healthy file is zipped from disk as usual
    expect(JSON.parse(r.get('songs')!)).toEqual([{ id: 'a' }])
  })

  it('also when the main file is missing, and not any more once it is saved again', () => {
    writeFileSync(join(dir, 'songs.json.bak'), '[{"id":"a"}]')
    const store = new JsonStore(dir)
    store.list('songs')
    expect(store.recoveredForBackup().has('songs')).toBe(true)
    store.upsert('songs', { id: 'b' })
    store.flush()
    expect(store.recoveredForBackup().size).toBe(0)
  })

  it('counts changes made outside the store, except while read-only', () => {
    const store = new JsonStore(dir)
    store.noteExternalWrite()
    expect(store.writeCount).toBe(1)
    store.readOnly = true
    store.noteExternalWrite()
    expect(store.writeCount).toBe(1)
  })
})

describe('JsonStore.loadedAs (may files be deleted based on this list?)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'iccw-store-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('is ok only for a list read undamaged from its own file', () => {
    writeFileSync(join(dir, 'songs.json'), '[{"id":"a"}]')
    expect(new JsonStore(dir).loadedAs('songs')).toBe('ok')
  })
  it('tells a list recovered from .bak or unreadable (degraded) from one with no file (missing)', () => {
    writeFileSync(join(dir, 'songs.json'), '[{"id":"a"},{"i')
    writeFileSync(join(dir, 'songs.json.bak'), '[{"id":"a"}]')
    expect(new JsonStore(dir).loadedAs('songs')).toBe('degraded')
    expect(new JsonStore(dir).loadedAs('plans')).toBe('missing') // no plans.json at all
    writeFileSync(join(dir, 'media.json'), '{{{')
    expect(new JsonStore(dir).loadedAs('media')).toBe('degraded')
    writeFileSync(join(dir, 'people.json.bak'), '[]') // the main file is gone, its .bak is used
    expect(new JsonStore(dir).loadedAs('people')).toBe('degraded')
  })
  it('stays degraded / missing after saves and after the problems are handed to the operator', () => {
    writeFileSync(join(dir, 'songs.json'), '[{"id":"a"},{"i')
    writeFileSync(join(dir, 'songs.json.bak'), '[{"id":"a"}]')
    const s = new JsonStore(dir)
    s.upsert('songs', { id: 'b' })
    s.flush()
    s.problems.splice(0)
    expect(s.loadedAs('songs')).toBe('degraded')
    s.upsert('plans', { id: 'p' })
    s.flush()
    expect(s.loadedAs('plans')).toBe('missing')
    // a restore forgets it all: the files are read again (both are healthy on disk now)
    const gen = s.generation
    s.reset()
    expect(s.generation).toBe(gen + 1)
    expect(s.loadedAs('songs')).toBe('ok')
    expect(s.loadedAs('plans')).toBe('ok')
  })
})
