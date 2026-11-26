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
import { assertWritable, db } from './db'
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

/** the track file on screen right now (never deleted under the projector) */
function liveTrackFile(): string | null {
  return trackFileOfUrl(live.state.video?.src)
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

// once the deferred file is off screen, finish the job
live.on('change', () => {
  if (!pending.size) return
  const onScreen = liveTrackFile()
  // oxlint-disable-next-line unicorn/no-useless-spread -- pruneTrack changes `pending` while we walk it: walk a copy
  for (const id of [...pending]) {
    const song = db().get<Song>('songs', id)
    const unused = unusedTrackFiles(listTrackFiles(), id, trackFileOfUrl(song?.track?.url))
    if (!unused.includes(onScreen ?? '')) pruneTrack(id)
  }
})

/**
 * At start-up: remove track files no song uses, older than a week. Only when the songs list was read healthy from
 * its own file (a damaged list, or one recovered from its .bak, could be missing songs — their tracks must stay).
 */
export function cleanupOrphanTracks(): void {
  try {
    const store = db()
    if (store.readOnly) return
    const songs = store.list<Song>('songs')
    if (!store.isHealthy('songs') || !songs.length) return
    const dir = tracksDir()
    const files = listTrackFiles().flatMap((name) => {
      try {
        return [{ name, mtime: statSync(join(dir, name)).mtimeMs }]
      } catch {
        return []
      }
    })
    const orphans = orphanTrackFiles(files, referencedTrackFiles(songs), Date.now())
    for (const name of orphans) {
      const f = join(dir, name)
      if (within(dir, f)) unlinkSync(f)
    }
    if (orphans.length) log.info('removed unused backing tracks:', orphans.length)
  } catch (e) {
    log.warn('could not tidy unused backing tracks', (e as NodeJS.ErrnoException).code || 'error')
  }
}
