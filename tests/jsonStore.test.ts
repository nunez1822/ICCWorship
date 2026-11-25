import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JsonStore } from '../src/main/jsonStore'

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
})
