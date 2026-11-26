/**
 * Backing tracks: the rules, without file access (unit tested in tests/tracks.test.ts).
 *
 * A song's backing track is an Ogg/Opus file in <data root>/tracks/, named `<songId>-<ms>.ogg`, and the song stores
 * its data-relative media:// URL (`media://local/tracks%2F<name>`). Files are never changed after they are written:
 * replacing a track writes a new file and the old one is removed once nothing uses it.
 */
import type { PlanItem, Song, SongTrack } from './types'
import { isSafeId } from './security'

/** `<songId>-<ms>.ogg` — group 1 is the song id (greedy: ids may contain "-"), group 2 the time it was written */
const TRACK_FILE = /^([A-Za-z0-9_-]{1,64})-(\d{1,16})\.ogg$/

export const isTrackFileName = (name: string): boolean => TRACK_FILE.test(name)

/** the song a track file belongs to, or null if the name isn't a track file */
export function trackSongId(name: string): string | null {
  return TRACK_FILE.exec(name)?.[1] ?? null
}

export function trackFileName(songId: string, now = Date.now()): string {
  if (!isSafeId(songId)) throw new Error('bad-id')
  return `${songId}-${Math.max(0, Math.floor(now))}.ogg`
}

const URL_PREFIX = 'media://local/'

/** the track file a song's URL points to (`tracks/<name>`), or null if it isn't one of ours */
export function trackFileOfUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.startsWith(URL_PREFIX)) return null
  let p: string
  try {
    p = decodeURIComponent(url.slice(URL_PREFIX.length))
  } catch {
    return null
  }
  const m = /^tracks[\\/]([^\\/]+)$/.exec(p)
  return m && isTrackFileName(m[1]) ? m[1] : null
}

/** every track file the songs use */
export function referencedTrackFiles(songs: readonly Pick<Song, 'track'>[]): Set<string> {
  const out = new Set<string>()
  for (const s of songs) {
    const f = trackFileOfUrl(s?.track?.url)
    if (f) out.add(f)
  }
  return out
}

/** Track files of one song that the song no longer uses (after Replace / Remove / deleting the song). */
export function unusedTrackFiles(names: readonly string[], songId: string, inUse: string | null | undefined): string[] {
  return names.filter((n) => trackSongId(n) === songId && n !== inUse)
}

/**
 * Track files nothing references any more, older than `minAgeMs` (a week by default: a song saved a moment ago,
 * or a damaged songs list, must never cost the church a track).
 */
export function orphanTrackFiles(
  files: readonly { name: string; mtime: number }[],
  referenced: ReadonlySet<string>,
  now: number,
  minAgeMs = 7 * 86_400_000
): string[] {
  return files.filter((f) => isTrackFileName(f.name) && !referenced.has(f.name) && now - f.mtime > minAgeMs).map((f) => f.name)
}

/** An Ogg file starts with "OggS". */
export function isOggBytes(b: Uint8Array): boolean {
  return b.length > 4 && b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53
}

/** the largest track main accepts (≈ 50 minutes of Opus at 160 kb/s) */
export const MAX_TRACK_BYTES = 60 * 1024 * 1024
/** the largest audio file the operator may pick to make a track from */
export const MAX_SOURCE_BYTES = 200 * 1024 * 1024

/** Cue times: finite, ≥ 0 and increasing, or undefined when nothing valid is left. */
export function cleanTimings(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: number[] = []
  for (const v of raw) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return undefined
    if (out.length && v <= out[out.length - 1]) return undefined
    out.push(Math.round(v * 1000) / 1000)
  }
  return out.length ? out : undefined
}

/**
 * A song's track as the app can use it, or undefined. Unknown fields are KEPT: a newer ICCWorship may have added
 * some, and saving the song here must not drop them.
 */
export function normalizeTrack(raw: unknown): SongTrack | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const t = raw as Record<string, unknown>
  if (typeof t.url !== 'string' || !t.url) return undefined
  const timings = cleanTimings(t.timings)
  const out: Record<string, unknown> = {
    ...t,
    url: t.url,
    sourceName: typeof t.sourceName === 'string' ? t.sourceName : '',
    vocalsRemoved: t.vocalsRemoved === true
  }
  if (timings) out.timings = timings
  else {
    delete out.timings
    delete out.timingsKey
  }
  return out as unknown as SongTrack
}

/** A plan item's backing-track options: absent means the track does NOT play (attaching a track to a song never
 *  changes existing plans). Unknown fields are kept, like normalizeTrack. */
export function normalizeItemTrack(raw: unknown): PlanItem['track'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const t = raw as Record<string, unknown>
  const volume = typeof t.volume === 'number' && Number.isFinite(t.volume) ? Math.min(1, Math.max(0, t.volume)) : 1
  return { ...t, play: t.play === true, volume, autoNext: t.autoNext === true } as PlanItem['track']
}

/** what a plan item gets when a song with a track is added to a plan */
export const DEFAULT_ITEM_TRACK: NonNullable<PlanItem['track']> = { play: true, volume: 1, autoNext: false }
