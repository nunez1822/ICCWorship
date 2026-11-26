/**
 * Backing track files (<data root>/tracks/<songId>-<ms>.ogg). The rules are in @shared/tracks.
 *
 * The renderer never names a file to write or delete: it sends a song id (checked with isSafeId) and the bytes of
 * an Ogg file it encoded; removing files is "prune this song": main deletes that song's track files the song no
 * longer references — never the one on screen, never anything outside tracks/.
 */
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { Song } from '@shared/types'
import { isSafeId } from '@shared/security'
import { isOggBytes, MAX_TRACK_BYTES, orphanTrackFiles, referencedTrackFiles, trackFileName, trackFileOfUrl, unusedTrackFiles } from '@shared/tracks'
import { assertWritable, db, keepTracksForGood, keptTracks, trackFilesInMirror, trackFilesOnDisk } from './db'
import { dataRoot } from './paths'
import { within } from './pathGuard'
import { dataMediaUrl } from './mediaPath'
import { writeFileAtomicAsync } from './atomicWrite'
import { TRACKS_DIR } from './restorePath'
import { live } from './live'
import { log } from './log'

export const tracksDir = (): string => join(dataRoot(), TRACKS_DIR)

function listTrackFiles(): string[] {
  const dir = tracksDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
}

/** Store an encoded track for a song; returns its data-relative media:// URL (what the song saves). */
export async function saveTrack(songId: unknown, bytes: unknown): Promise<string> {
  assertWritable()
  if (!isSafeId(songId)) throw new Error('bad-id')
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_TRACK_BYTES || !isOggBytes(bytes)) throw new Error('bad-track')
  const dir = tracksDir()
  mkdirSync(dir, { recursive: true })
  let name = trackFileName(songId)
  for (let n = 1; existsSync(join(dir, name)); n++) name = trackFileName(songId, Date.now() + n) // never overwrite a track
  const file = join(dir, name)
  if (!within(dir, file)) throw new Error('bad-id')
  await writeFileAtomicAsync(file, bytes)
  db().noteExternalWrite()
  log.info('backing track saved', songId, `${Math.round(bytes.length / 1024)} KB`)
  return dataMediaUrl(file)
}

/**
 * The last track file the live item played. After Esc the live state has no video, but the item is still selected
 * and Space (or a thumbnail) brings that same file back where it was — so it stays "in use" until another item goes
 * live.
 */
let lastOfItem: { itemId?: string; file: string } | null = null

/** the track file on screen right now, or the one the live item can bring back (never deleted under the projector) */
function liveTrackFile(): string | null {
  const s = live.state
  const now = trackFileOfUrl(s.video?.src)
  if (now) return now
  return lastOfItem && lastOfItem.itemId === s.itemId ? lastOfItem.file : null
}

/** songs whose unused files couldn't go yet because one of them was on screen */
const pending = new Set<string>()

/**
 * Delete the track files of a song that the song no longer uses (after Replace / Remove / deleting the song).
 * A file that is playing right now is left until it is no longer on screen.
 */
export function pruneTrack(songId: unknown): void {
  if (!isSafeId(songId) || db().readOnly) return
  const song = db().get<Song>('songs', songId)
  const inUse = trackFileOfUrl(song?.track?.url)
  const dir = tracksDir()
  const onScreen = liveTrackFile()
  let deferred = false
  for (const name of unusedTrackFiles(listTrackFiles(), songId, inUse)) {
    if (name === onScreen) {
      deferred = true
      continue
    }
    const f = join(dir, name)
    if (!within(dir, f)) continue
    try {
      unlinkSync(f)
      db().noteExternalWrite()
    } catch (e) {
      log.warn('could not remove an unused backing track', (e as NodeJS.ErrnoException).code || 'error')
    }
  }
  if (deferred) pending.add(songId)
  else pending.delete(songId)
}

// once the deferred file is off screen (and the live item can't bring it back), finish the job
live.on('change', () => {
  const s = live.state
  const now = trackFileOfUrl(s.video?.src)
  if (now) lastOfItem = { itemId: s.itemId, file: now }
  else if (lastOfItem && lastOfItem.itemId !== s.itemId) lastOfItem = null
  if (!pending.size) return
  const onScreen = liveTrackFile()
  // oxlint-disable-next-line unicorn/no-useless-spread -- pruneTrack changes `pending` while we walk it: walk a copy
  for (const id of [...pending]) {
    const song = db().get<Song>('songs', id)
    const unused = unusedTrackFiles(listTrackFiles(), id, trackFileOfUrl(song?.track?.url))
    if (!unused.includes(onScreen ?? '')) pruneTrack(id)
  }
})

/** the store generation whose incomplete songs list already had its tracks kept */
let keptAtGeneration = -1

/**
 * Can the songs list be trusted to hold every song the church has? Only when it was read undamaged from its own file
 * (a damaged list, one recovered from an older .bak, or one rebuilt after songs.json went missing could be missing
 * songs) and isn't empty. Anything that deletes or retires a backing track because no song uses it must check this
 * first, and treat tracksInUse() as used.
 *
 * Saving the list later doesn't make it complete: it is judged by how it was read (JsonStore.loadedAs). And so that
 * the next start — when the saved file reads fine — can't delete them either, every track in tracks/ and beside the
 * backups when the list is found incomplete is kept for good (keptTracks).
 */
export function songsListIsComplete(): boolean {
  const store = db()
  const state = store.loadedAs('songs')
  if (state !== 'ok') {
    // once per read of the list: the tracks there were when it was found (not ones made since, for songs it has)
    if (!store.readOnly && keptAtGeneration !== store.generation) {
      keptAtGeneration = store.generation
      const kept = keepTracksForGood([...trackFilesOnDisk(), ...trackFilesInMirror()])
      if (kept) log.warn(`songs list ${state}: every backing track there is now is kept`, kept)
    }
    return false
  }
  return store.list<Song>('songs').length > 0
}

/** The track files that must never count as unused: the ones the songs use, and those kept for good. */
export function tracksInUse(songs: readonly Pick<Song, 'track'>[]): Set<string> {
  return new Set([...referencedTrackFiles(songs), ...keptTracks()])
}

/** At start-up: remove track files no song uses, older than a week — only when the songs list is complete. */
export function cleanupOrphanTracks(): void {
  try {
    const store = db()
    if (store.readOnly || !songsListIsComplete()) return
    const songs = store.list<Song>('songs')
    const dir = tracksDir()
    const files = listTrackFiles().flatMap((name) => {
      try {
        return [{ name, mtime: statSync(join(dir, name)).mtimeMs }]
      } catch {
        return []
      }
    })
    const orphans = orphanTrackFiles(files, tracksInUse(songs), Date.now())
    for (const name of orphans) {
      const f = join(dir, name)
      if (within(dir, f)) unlinkSync(f)
    }
    if (orphans.length) log.info('removed unused backing tracks:', orphans.length)
  } catch (e) {
    log.warn('could not tidy unused backing tracks', (e as NodeJS.ErrnoException).code || 'error')
  }
}
