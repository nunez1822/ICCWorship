import { describe, expect, it } from 'vite-plus/test'
import { join, resolve } from 'node:path'
import { isTracksEntry, restoreTarget } from '../src/main/restorePath'

describe('restoreTarget (backup restore paths)', () => {
  const root = resolve('/church-data')

  it('writes backup entries into data/ and cache/presentations/', () => {
    expect(restoreTarget(root, 'data/songs.json')).toBe(join(root, 'data', 'songs.json'))
    expect(restoreTarget(root, 'cache/presentations/abc/1.png')).toBe(join(root, 'cache', 'presentations', 'abc', '1.png'))
  })

  it('skips anything that escapes the data folder (zip-slip)', () => {
    expect(restoreTarget(root, '../../ZIPSLIP-EVIL.txt')).toBeNull()
    expect(restoreTarget(root, 'data/../../ZIPSLIP-EVIL2.txt')).toBeNull()
    expect(restoreTarget(root, 'data\\..\\..\\evil.txt')).toBeNull()
  })

  it('skips entries that resolve next to the restore folders, not inside them', () => {
    expect(restoreTarget(root, 'data/../settings-evil.json')).toBeNull()
    expect(restoreTarget(root, 'cache/other/x.png')).toBeNull()
    expect(restoreTarget(root, 'datax/songs.json')).toBeNull()
    expect(restoreTarget(root, 'data')).toBeNull()
  })

  it('restores backing tracks, and only track files directly in tracks/', () => {
    expect(restoreTarget(root, 'tracks/abc-123.ogg')).toBe(join(root, 'tracks', 'abc-123.ogg'))
    expect(restoreTarget(root, 'tracks/evil.exe')).toBeNull()
    expect(restoreTarget(root, 'tracks/sub/abc-123.ogg')).toBeNull()
    expect(restoreTarget(root, 'tracks/abc.ogg')).toBeNull()
    expect(restoreTarget(root, 'tracks/../data/songs.json')).toBe(join(root, 'data', 'songs.json')) // resolves into data/: allowed like data/songs.json
    expect(restoreTarget(root, 'tracks/../../evil.ogg')).toBeNull()
  })

  it('knows which entries are tracks', () => {
    expect(isTracksEntry('tracks/abc-1.ogg')).toBe(true)
    expect(isTracksEntry(join('tracks', 'abc-1.ogg'))).toBe(true)
    expect(isTracksEntry('data/songs.json')).toBe(false)
  })
})
