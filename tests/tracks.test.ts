import { describe, expect, it } from 'vite-plus/test'
import {
  cleanTimings,
  isOggBytes,
  isTrackFileName,
  normalizeItemTrack,
  normalizeTrack,
  orphanTrackFiles,
  referencedTrackFiles,
  trackFileName,
  trackFileOfUrl,
  trackSongId,
  unusedTrackFiles
} from '@shared/tracks'

const ID = '3f2a1c9e-1b2c-4d5e-8f90-123456789abc'
const url = (name: string) => 'media://local/' + encodeURIComponent(`tracks/${name}`)

describe('track file names', () => {
  it('names a track after its song and the time it was written', () => {
    expect(trackFileName(ID, 1_700_000_000_123)).toBe(`${ID}-1700000000123.ogg`)
    expect(trackSongId(`${ID}-1700000000123.ogg`)).toBe(ID)
  })
  it('refuses an id that is not safe as a file name', () => {
    expect(() => trackFileName('../evil', 1)).toThrow('bad-id')
    expect(() => trackFileName('', 1)).toThrow('bad-id')
  })
  it('only accepts <id>-<digits>.ogg', () => {
    expect(isTrackFileName('abc-123.ogg')).toBe(true)
    for (const bad of ['abc.ogg', 'abc-123.mp3', 'abc-12x.ogg', '../abc-1.ogg', 'a b-1.ogg', 'abc-123.ogg.tmp', `${'a'.repeat(65)}-1.ogg`])
      expect(isTrackFileName(bad)).toBe(false)
  })
  it('never confuses a song with another whose id starts the same', () => {
    // song "abc" must not claim the files of song "abc-def"
    expect(unusedTrackFiles(['abc-def-5.ogg', 'abc-6.ogg', 'abc-7.ogg'], 'abc', 'abc-7.ogg')).toEqual(['abc-6.ogg'])
    expect(unusedTrackFiles(['abc-def-5.ogg', 'abc-6.ogg'], 'abc-def', null)).toEqual(['abc-def-5.ogg'])
  })
})

describe('track URLs', () => {
  it('finds the file a song points to', () => {
    expect(trackFileOfUrl(url('abc-1.ogg'))).toBe('abc-1.ogg')
    expect(trackFileOfUrl('media://local/tracks%5Cabc-1.ogg')).toBe('abc-1.ogg') // a backslash path from Windows
  })
  it('ignores anything that is not one of our track files', () => {
    for (const bad of [
      undefined,
      42,
      'C:/music/song.ogg',
      'media://local/' + encodeURIComponent('C:/Users/x/song.ogg'),
      'media://local/' + encodeURIComponent('data/songs.json'),
      'media://local/' + encodeURIComponent('tracks/../data/songs.json'),
      'media://local/' + encodeURIComponent('tracks/sub/abc-1.ogg'),
      'media://local/%E0%A4%A' // broken escape
    ])
      expect(trackFileOfUrl(bad)).toBeNull()
  })
  it('collects every track the songs use', () => {
    const songs = [
      { track: { url: url('a-1.ogg'), sourceName: '', vocalsRemoved: false } },
      {},
      { track: { url: 'junk', sourceName: '', vocalsRemoved: false } }
    ]
    expect([...referencedTrackFiles(songs as never)]).toEqual(['a-1.ogg'])
  })
})

describe('orphanTrackFiles', () => {
  const now = 100 * 86_400_000
  it('removes only unreferenced track files older than a week', () => {
    const files = [
      { name: 'a-1.ogg', mtime: 0 }, // used
      { name: 'b-1.ogg', mtime: 0 }, // orphan, old
      { name: 'c-1.ogg', mtime: now - 3600_000 }, // orphan, new (a song being saved right now)
      { name: 'notes.txt', mtime: 0 } // not ours
    ]
    expect(orphanTrackFiles(files, new Set(['a-1.ogg']), now)).toEqual(['b-1.ogg'])
  })
})

describe('isOggBytes', () => {
  it('checks the OggS signature', () => {
    expect(isOggBytes(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0]))).toBe(true)
    expect(isOggBytes(new Uint8Array([0x49, 0x44, 0x33, 0x03, 0]))).toBe(false) // ID3 (an mp3)
    expect(isOggBytes(new Uint8Array([0x4f, 0x67]))).toBe(false)
  })
})

describe('cleanTimings', () => {
  it('keeps increasing, finite, non-negative times (rounded to ms)', () => {
    expect(cleanTimings([0, 4.25, 8.0004])).toEqual([0, 4.25, 8])
    expect(cleanTimings([2.5, 6])).toEqual([2.5, 6]) // an intro before the first slide
  })
  it('drops timing that is out of order or broken (rather than guessing)', () => {
    for (const bad of [[3, 2], [0, 0], [-1, 2], [0, Number.NaN], [0, Infinity], ['1'], [], 'x', null]) expect(cleanTimings(bad)).toBeUndefined()
  })
})

describe('normalizeTrack', () => {
  it('fills in missing fields and keeps fields it does not know (a newer version may have added them)', () => {
    expect(normalizeTrack({ url: url('a-1.ogg'), future: { x: 1 } })).toEqual({ url: url('a-1.ogg'), sourceName: '', vocalsRemoved: false, future: { x: 1 } })
  })
  it('drops broken timing together with its layout key', () => {
    const t = normalizeTrack({ url: 'u', sourceName: 's', vocalsRemoved: true, timings: [5, 1], timingsKey: 'k' })
    expect(t).toEqual({ url: 'u', sourceName: 's', vocalsRemoved: true })
    expect(normalizeTrack({ url: 'u', timings: [0, 1], timingsKey: 'k' })?.timings).toEqual([0, 1])
  })
  it('has no track without a URL', () => {
    for (const bad of [undefined, null, 'x', [], {}, { url: '' }, { url: 5 }]) expect(normalizeTrack(bad)).toBeUndefined()
  })
})

describe('normalizeItemTrack', () => {
  it('plays only when the plan says so, at a volume between 0 and 1', () => {
    expect(normalizeItemTrack({ play: true, volume: 3, autoNext: 'yes' })).toEqual({ play: true, volume: 1, autoNext: false })
    expect(normalizeItemTrack({ volume: -1 })).toEqual({ play: false, volume: 0, autoNext: false })
    expect(normalizeItemTrack({ play: true, volume: 0.5, autoNext: true, extra: 1 })).toEqual({ play: true, volume: 0.5, autoNext: true, extra: 1 })
    expect(normalizeItemTrack(undefined)).toBeUndefined()
  })
})
