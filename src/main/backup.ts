import JSZip from 'jszip'
import { app } from 'electron'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { stat, statfs } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { basename, dirname, join, parse, relative, resolve, sep } from 'node:path'
import { backupDir, dataRoot, trackMirrorDir } from './paths'
import { dataStatus, db, getSettings } from './db'
import { localDate, localStamp } from '@shared/dates'
import { checkSchema, runMigrations, SCHEMA_VERSION } from '@shared/migrations'
import type { Song } from '@shared/types'
import { reload as reloadBibles } from './bible'
import { isMediaEntry, isTracksEntry, RESTORE_DIRS, restoreTarget, TRACKS_DIR } from './restorePath'
import { isLibraryFileName, MEDIA_DIR } from '@shared/mediaLibrary'
import { isTrackFileName, referencedTrackFiles } from '@shared/tracks'
import {
  autoBackupDecision,
  autoBackupName,
  autoBackupsToDelete,
  backupRoom,
  checkManifest,
  isTransientCopy,
  keptOnRestore,
  makeManifest,
  mergeRestoredSettings,
  mustParseOnRestore,
  parseAutoName,
  restoredMeta,
  SAFETY_WITH_TRACKS_PREFIX,
  safetyBackupsToDelete,
  staleBackupTemps,
  staleTrackTemps,
  trackMirrorPlan
} from '@shared/backupCore'
import { copyFileAtomic, renameSyncWithRetry, writeFileAtomic, writeStreamAtomic } from './atomicWrite'
import { ZipError, ZipReader, type ZipEntry } from './zipReader'
import { songsListIsComplete, tracksInUse } from './tracks'
import { log } from './log'
import { within } from './pathGuard'

/** Folders inside Documents\ICCWorship that belong in a backup (and the only ones a restore writes) */
const INCLUDE = RESTORE_DIRS
const MANIFEST = 'iccworship-backup.json'
/** don't let an automatic backup fill the last of the disk (saving the church's data needs it more) */
const MIN_FREE_BYTES = 300 * 1024 * 1024

/** Every file under `dir`. Without `all`, .tmp / .bak copies are left out (what a backup holds). */
function walk(dir: string, out: string[] = [], all = false): string[] {
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    let st
    try {
      st = statSync(p)
    } catch {
      continue // removed since the folder was listed
    }
    if (st.isDirectory()) walk(p, out, all)
    else if (all || !isTransientCopy(f)) out.push(p)
  }
  return out
}

/* ------------------------------ one at a time ------------------------------ */
// A backup reading the data while a restore replaces it would save a half-old, half-new mix (and call it
// today's backup). Every backup and restore runs through this lock.
let busy: Promise<unknown> = Promise.resolve()
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = busy.then(fn, fn)
  busy = run.catch(() => undefined)
  return run
}

/** run `fn` once no backup or restore is running (deleting a media copy must not pull a file from under a backup) */
export function afterBackups(fn: () => void): void {
  void exclusive(async () => fn())
}

type BackupResult = {
  ok: true
  path: string
  files: number
  bytes: number
  /** the tracks were too many for one .zip: this backup holds the data only (they stay in tracks/ and backups/tracks/) */
  tracksLeftOut?: boolean
  /** the media library (media/) was too big for one .zip: this backup holds everything but it */
  mediaLeftOut?: boolean
}
export type BackupError = 'no-space' | 'too-large' | 'failed'

/** No room for the backup on that disk ('no-space'), or more than a .zip can hold ('too-large'). Nothing was written. */
class BackupRoomError extends Error {
  constructor(readonly reason: 'no-space' | 'too-large') {
    super(reason)
  }
}

/** bytes free on the disk holding `dir` (Infinity when it can't be told: go ahead) */
async function freeBytes(dir: string): Promise<number> {
  try {
    const { bavail, bsize } = await statfs(dir)
    return bavail * bsize
  } catch {
    return Infinity
  }
}

/**
 * A file's content for JSZip, opened only when JSZip reaches it and closed when it is done (JSZip reads one entry at
 * a time). Opening every file up front could run out of file handles with thousands of slide images. A file removed
 * before it is reached (a track pruned meanwhile) fails the backup, which says so; the next one is complete.
 */
function fileWhenRead(f: string): Readable {
  return Readable.from(
    (async function* () {
      yield* createReadStream(f)
    })(),
    { objectMode: false }
  )
}

/**
 * `writes`: the store's write count when the files were read (saves after that are not in this backup).
 * `tracks`: include the backing tracks (manual backups, and the safety copy before a restore that replaces them).
 * `media`: include the media library's own copies, media/ (manual backups only: a restore never deletes from it).
 * `reserve`: bytes that must stay free on the target's disk afterwards (else BackupRoomError, and nothing is written).
 *
 * The files in data/ are read in one go, synchronously: no save can land between two of them, so the backup is one
 * consistent snapshot (a plan saved after its new song was read would point to a song the backup lacks). Track and
 * slide-image files are streamed into the .zip one at a time (a track never changes after it is written; slide images
 * neither), and the .zip is streamed to the disk: a backup with every track (GBs) is never all in memory.
 */
async function writeBackup(target: string, tracks: boolean, reserve: number, media = false): Promise<BackupResult & { writes: number }> {
  const store = db()
  store.flush()
  const writes = store.writeCount
  // a collection running from its .bak has a damaged (or no) main file on disk: back up what the app uses
  const recovered = store.recoveredForBackup()
  const root = dataRoot()
  const zip = new JSZip()
  const opened: Readable[] = []
  let files = 0
  let bytes = 0
  try {
    for (const inc of INCLUDE) {
      const isTracks = inc === TRACKS_DIR
      if (isTracks && !tracks) continue
      const isMedia = inc === MEDIA_DIR
      if (isMedia && !media) continue
      const isData = inc === 'data'
      for (const f of walk(join(root, inc))) {
        const rel = relative(root, f).split(sep).join('/')
        const name = /^data\/([^/]+)\.json$/.exec(rel)?.[1]
        if (name && recovered.has(name)) continue // added below
        if (isTracks && !isTrackFileName(basename(f))) continue
        try {
          if (isData) {
            const data = readFileSync(f)
            zip.file(rel, data)
            bytes += data.length
          } else {
            const size = statSync(f).size
            const s = fileWhenRead(f)
            opened.push(s)
            bytes += size
            // tracks (Opus) and pictures / videos / sound are already compressed: stored as they are
            zip.file(rel, s, isTracks || isMedia ? { compression: 'STORE', binary: true } : { binary: true })
          }
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue // removed since the folder was listed
          throw e
        }
        files++
      }
    }
    for (const [name, json] of recovered) {
      zip.file(`data/${name}.json`, json)
      bytes += Buffer.byteLength(json)
      files++
    }
    zip.file(MANIFEST, JSON.stringify(makeManifest(app.getVersion(), tracks, new Date(), media)))
    mkdirSync(dirname(target), { recursive: true })
    // the .zip is never bigger than its files, except a few headers each
    const room = backupRoom(bytes + (files + 1) * 512, await freeBytes(dirname(target)), reserve)
    if (room !== 'ok') throw new BackupRoomError(room)
    const out = zip.generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 6 } }) as Readable
    // JSZip keeps a read error of a file it hasn't reached yet to itself (the backup would never finish): stop it
    for (const s of opened) s.on('error', (e) => out.destroy(e))
    await writeStreamAtomic(target, out)
    return { ok: true, path: target, files, bytes: statSync(target).size, writes }
  } finally {
    for (const s of opened) s.destroy() // a failed backup didn't read them all: close any still open
  }
}

/** On the data folder's disk, a manual backup leaves room for saving the church's data; elsewhere (a USB stick) it may fill it. */
const reserveFor = (target: string) =>
  parse(resolve(target)).root.toLowerCase() === parse(resolve(dataRoot())).root.toLowerCase() ? MIN_FREE_BYTES : 1024 * 1024

/**
 * "Back up now": everything, the media library and backing tracks included (the copy to take to another PC or a USB
 * stick). When that is too much for one .zip (over 4 GB) or for the room on the target's disk (a small USB stick), the
 * media library is left out first (`mediaLeftOut`), then the tracks too (`tracksLeftOut`): the operator is told to
 * copy those folders as well — a church with a big library must never be left with no backup at all.
 */
export function createBackup(target: string): Promise<BackupResult | { ok: false; error: BackupError }> {
  return exclusive(async () => {
    const noRoom = (e: unknown) => e instanceof BackupRoomError
    try {
      try {
        const { writes: _writes, ...r } = await writeBackup(target, true, reserveFor(target), true)
        return r
      } catch (e) {
        if (!noRoom(e)) throw e
        log.warn(`backup with the media library: ${(e as BackupRoomError).reason}, saving without it`)
      }
      try {
        const { writes: _writes, ...r } = await writeBackup(target, true, reserveFor(target))
        return { ...r, mediaLeftOut: true }
      } catch (e) {
        if (!noRoom(e)) throw e
        log.warn(`backup with the backing tracks: ${(e as BackupRoomError).reason}, saving without them`)
        const { writes: _writes, ...r } = await writeBackup(target, false, reserveFor(target))
        return { ...r, tracksLeftOut: true, mediaLeftOut: true }
      }
    } catch (e) {
      if (e instanceof BackupRoomError) {
        log.warn('backup not made:', e.reason)
        return { ok: false as const, error: e.reason }
      }
      log.error('backup failed', e)
      return { ok: false as const, error: 'failed' as const }
    }
  })
}

/** A copy of the current data before an upgrade changes it. Keeps the newest 5. Throws if it can't be made. */
export function createSafetyBackup(kind: 'before-migrate'): Promise<string> {
  return exclusive(async () => {
    const path = freeName(backupDir(), `${kind}-${stamp()}`)
    // an upgrade never touches tracks/. No reserve: without this copy the data opens read-only
    await writeBackup(path, false, 0)
    pruneSafetyBackups()
    return path
  })
}

/** Tidying old safety backups must never fail the backup or restore that called it. */
function pruneSafetyBackups(): void {
  try {
    const dir = backupDir()
    const files: { name: string; mtime: number }[] = []
    for (const name of readdirSync(dir)) {
      try {
        files.push({ name, mtime: statSync(join(dir, name)).mtimeMs })
      } catch {
        /* removed or renamed meanwhile (another prune, a backup's .tmp): skip it */
      }
    }
    for (const name of safetyBackupsToDelete(files)) {
      try {
        unlinkSync(join(dir, name))
      } catch {
        /* in use: next time */
      }
    }
  } catch (e) {
    log.warn('could not tidy old safety backups', e)
  }
}

/** Removing a temporary folder must never turn a finished restore into an error (antivirus may still hold it). */
function removeTempDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 })
  } catch (e) {
    log.warn('could not remove a temporary restore folder', e)
  }
}

/* ------------------------------ restore ------------------------------ */
export type RestoreError =
  | 'not-a-backup'
  | 'newer-format'
  | 'newer-schema'
  | 'damaged-backup'
  | 'restore-failed'
  /** not enough free disk space to unpack the backup and keep a safety copy: nothing was changed */
  | 'no-space'
  /** the backup could not be unpacked, or the safety copy made, for another reason: nothing was changed */
  | 'not-started'
  /** replacing failed AND the previous data could not be put back: restore the named safety backup by hand */
  | 'restore-failed-mixed'
  /** data written by a newer version is open read-only */
  | 'read-only'
  /** data is open read-only because it could not be prepared (no safety copy, failed upgrade) */
  | 'read-only-unprepared'

/**
 * Restore = replace. The backup is unpacked into a staging folder first and fully checked (it must be ours,
 * not from a newer version, and every data file must parse); old data is upgraded there. Only then are the
 * files replaced one by one (a folder rename fails when OneDrive or antivirus holds a file in it), files the
 * backup doesn't have are removed (kept-aside .corrupt copies stay), and settings that belong to THIS
 * computer — screens, server port, PIN — are kept. If replacing fails half-way, the safety backup is put back.
 */
export function restoreBackup(zipPath: string): Promise<{ ok: boolean; error?: RestoreError; safetyBackup?: string }> {
  return exclusive(() => doRestore(zipPath))
}

const stripBom = (t: string) => (t.charCodeAt(0) === 0xfeff ? t.slice(1) : t)

async function doRestore(zipPath: string): Promise<{ ok: boolean; error?: RestoreError; safetyBackup?: string }> {
  // Data written by a newer ICCWorship is open read-only: replacing it with an older backup would destroy the
  // newer data, and the store would stay read-only afterwards (every later edit lost at quit). Use the newer
  // version to restore. Data that is read-only because it couldn't be prepared gets its own answer.
  if (db().readOnly) return { ok: false, error: dataStatus().newerSchema ? 'read-only' : 'read-only-unprepared' }
  const root = resolve(dataRoot())
  removeLeftoverTempDirs(root)
  let zip: ZipReader
  try {
    // read from the file as needed, never all in memory (a backup with every backing track can be GBs)
    zip = await ZipReader.open(zipPath)
  } catch {
    // not a zip at all (renamed text file, truncated download…) — same answer as a foreign zip
    return { ok: false, error: 'not-a-backup' }
  }
  let manifest: unknown
  try {
    manifest = JSON.parse((await zip.readText(MANIFEST)) ?? 'null')
  } catch {
    manifest = null
  }
  const m = checkManifest(manifest)
  if (!m.ok) return { ok: false, error: m.error }
  // a manifest with no data files would "restore" nothing and still reload the app
  if (!zip.entries.some((e) => /^data\/[^/]+\.json$/.test(e.name) && !e.dir)) return { ok: false, error: 'not-a-backup' }

  // what will be unpacked — only data/, cache/presentations/ and tracks/ entries (zip-slip safe)
  const wanted: { entry: ZipEntry; rel: string }[] = []
  for (const entry of zip.entries) {
    // a backup never holds .tmp / .bak copies; one that does (hand-made) must not bring back old data
    if (entry.dir || entry.name === MANIFEST || isTransientCopy(entry.name)) continue
    const dest = restoreTarget(root, entry.name)
    if (!dest) continue
    const rel = relative(root, dest)
    // tracks/ is replaced only by a backup that says it holds the tracks; media/ is only added to, from one that holds it
    if (isTracksEntry(rel) && !m.hasTracks) continue
    if (isMediaEntry(rel) && !m.hasMedia) continue
    // a library copy is named by a unique id and never changes: one already here (same size) is the same file — not
    // counted, unpacked or replaced (a playing video's file may be locked, and restoring on the same PC needs no room)
    if (isMediaEntry(rel) && statSync(join(root, rel), { throwIfNoEntry: false })?.size === entry.size) continue
    wanted.push({ entry, rel })
  }
  // a full disk must stop the restore before anything is unpacked (the safety copy checks its own room next)
  const unpacked = wanted.reduce((n, w) => n + w.entry.size, 0)
  if ((await freeBytes(root)) - unpacked < MIN_FREE_BYTES) {
    log.warn('restore not started: not enough free disk space')
    return { ok: false, error: 'no-space' }
  }

  const staging = join(root, `restore-staging-${Date.now()}`)
  try {
    // 1. unpack into the staging folder, each entry checked (size, CRC) on the way
    const staged = new Map<string, string>() // path relative to root → staged file
    try {
      for (const { entry, rel } of wanted) {
        const tmp = join(staging, rel)
        mkdirSync(dirname(tmp), { recursive: true })
        await zip.extractTo(entry, tmp)
        staged.set(rel, tmp)
      }
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code ?? ''
      const damaged = e instanceof ZipError || code.startsWith('Z_')
      log.warn('restore not started: could not unpack the backup', damaged ? 'damaged' : code || 'error')
      return { ok: false, error: damaged ? 'damaged-backup' : code === 'ENOSPC' ? 'no-space' : 'not-started' }
    }
    // 2. every data file must be readable JSON, Bibles in data/bibles/ included (kept-aside .corrupt copies
    //    aren't checked): a damaged backup changes nothing
    const json = (rel: string) => JSON.parse(stripBom(readFileSync(staged.get(rel)!, 'utf8')))
    const stage = (rel: string, value: unknown) => {
      const f = staged.get(rel) ?? join(staging, rel)
      mkdirSync(dirname(f), { recursive: true })
      writeFileAtomic(f, JSON.stringify(value, null, 1))
      staged.set(rel, f)
    }
    for (const rel of staged.keys()) {
      if (mustParseOnRestore(rel)) {
        try {
          json(rel)
        } catch {
          return { ok: false, error: 'damaged-backup' }
        }
      }
    }
    // 3. which version wrote it? newer → refuse; older → upgrade the staged copy
    const metaRel = join('data', 'meta.json')
    const meta = staged.has(metaRel) ? json(metaRel) : {}
    // the higher of the two wins: the zip's meta.json, or what its manifest says
    const versions = [meta?.schemaVersion, m.schemaVersion].filter((v): v is number => typeof v === 'number')
    const check = checkSchema(versions.length ? Math.max(...versions) : undefined)
    if (check.kind === 'newer') return { ok: false, error: 'newer-schema' }
    if (check.kind === 'migrate') {
      runMigrations(
        {
          read: (name) => {
            const rel = join('data', `${name}.json`)
            return staged.has(rel) ? json(rel) : undefined
          },
          write: (name, value) => stage(join('data', `${name}.json`), value)
        },
        check.from
      )
    }
    // 4. a backup comes from a church that was already set up: the restored data must never look like a first
    //    run (that would replace its custom themes with the built-in ones and add sample songs and plans)
    const restored = restoredMeta(staged.has(metaRel) ? json(metaRel) : undefined, SCHEMA_VERSION)
    if (restored) stage(metaRel, restored)
    // 5. this computer's own settings win (screens, server port, PIN — the backup may be from another PC). A
    //    backup without settings still keeps them: otherwise the restore would delete this PC's PIN and port.
    const settingsRel = join('data', 'settings.json')
    const restoredSettings = staged.has(settingsRel) ? json(settingsRel) : {}
    stage(
      settingsRel,
      mergeRestoredSettings(
        restoredSettings && typeof restoredSettings === 'object' && !Array.isArray(restoredSettings) ? restoredSettings : {},
        getSettings() as unknown as Record<string, unknown>
      )
    )

    // 6. safety copy of what is there now (with the tracks if they are about to be replaced), then replace file by file.
    //    Current tracks too many for one .zip (over 4 GB): the safety copy holds the data only, and the restore then
    //    adds the backup's tracks but removes none of the current ones (they are what the safety copy would have held)
    let replaceTracks = m.hasTracks
    let safety = freeName(backupDir(), `${replaceTracks ? SAFETY_WITH_TRACKS_PREFIX : 'before-restore-'}${stamp()}`)
    try {
      try {
        await writeBackup(safety, replaceTracks, MIN_FREE_BYTES)
      } catch (e) {
        if (!(replaceTracks && e instanceof BackupRoomError && e.reason === 'too-large')) throw e
        log.warn('current backing tracks too large for the safety copy: the restore keeps them')
        replaceTracks = false
        safety = freeName(backupDir(), `before-restore-${stamp()}`)
        await writeBackup(safety, false, MIN_FREE_BYTES)
      }
    } catch (e) {
      // no safety copy, no restore: nothing was changed
      log.warn('restore not started: no safety backup', e instanceof BackupRoomError ? e.reason : e)
      return { ok: false, error: e instanceof BackupRoomError && e.reason === 'no-space' ? 'no-space' : 'not-started' }
    }
    pruneSafetyBackups()
    db().reset()
    // tracks this restore adds to tracks/: with a data-only safety copy, putting it back leaves tracks/ alone, so
    // these must be taken out again by hand for "your previous data was put back" to be true
    const addedTracks: string[] = []
    // media files this restore adds: never in the safety copy (media/ is only ever added to), so a failed restore
    // takes them out again by hand
    const addedMedia: string[] = []
    try {
      replaceFrom(root, staged, replaceTracks, addedTracks, addedMedia)
    } catch (e) {
      log.error('restore failed while replacing files; putting the safety backup back', e)
      let putBackOk = true
      try {
        await putBack(root, safety)
      } catch (e2) {
        putBackOk = false
        log.error('could not put the safety backup back', e2)
      }
      if (putBackOk && !replaceTracks) removeAddedTracks(root, addedTracks)
      if (putBackOk) removeAdded(root, MEDIA_DIR, addedMedia)
      db().reset()
      reloadBibles()
      if (putBackOk) await fillMissingTracks(db().list<Song>('songs'))
      // never say "your previous data was put back" when it wasn't: name the safety backup to restore by hand
      return { ok: false, error: putBackOk ? 'restore-failed' : 'restore-failed-mixed', safetyBackup: safety }
    }
    db().reset()
    reloadBibles()
    await fillMissingTracks(db().list<Song>('songs'))
    return { ok: true, safetyBackup: safety }
  } finally {
    // the restore's answer is already decided: a folder antivirus still holds must not turn it into an error
    removeTempDir(staging)
  }
}

/** restore-staging-* / restore-undo-* folders a previous restore could not remove (best effort) */
function removeLeftoverTempDirs(root: string): void {
  try {
    for (const f of readdirSync(root)) if (/^restore-(staging|undo)-\d+$/.test(f)) removeTempDir(join(root, f))
  } catch {
    /* can't list the data folder: the restore itself will report a real problem */
  }
}

/**
 * Move every staged file into place, then remove every file the backup doesn't have (except kept-aside
 * .corrupt copies). That includes every .bak: JsonStore falls back to <name>.json.bak when <name>.json is
 * missing or damaged, so a .bak left behind would bring back the data from before the restore.
 * Staged tracks are always moved in. The other files in tracks/ are removed only when `replaceTracks` (the backup
 * holds the tracks, and so does the safety copy); otherwise they are left as they are. Track files that weren't in
 * tracks/ before are listed in `addedTracks` as they go in (even if a later file fails), so a failed restore can
 * take them out again. media/ is only ever added to (its files are named by unique ids, and the church's library
 * can be far bigger than any safety copy): new ones are listed in `addedMedia` the same way.
 */
function replaceFrom(root: string, staged: Map<string, string>, replaceTracks: boolean, addedTracks: string[] = [], addedMedia: string[] = []): void {
  for (const [rel, tmp] of staged) {
    const dest = join(root, rel)
    mkdirSync(dirname(dest), { recursive: true })
    const added = (isTracksEntry(rel) || isMediaEntry(rel)) && !existsSync(dest)
    // the staged file is complete and already on the disk (written atomically, flushed), on the same disk: one
    // rename puts it in place — no second copy of a 60 MB track in memory or on the disk, and never half a file
    renameSyncWithRetry(tmp, dest)
    if (added) (isMediaEntry(rel) ? addedMedia : addedTracks).push(dest)
  }
  const keep = new Set([...staged.keys()].map((r) => r.toLowerCase()))
  for (const inc of INCLUDE) {
    if (inc === TRACKS_DIR && !replaceTracks) continue
    if (inc === MEDIA_DIR) continue // never removed by a restore (see above)
    for (const f of walk(join(root, inc), [], true)) {
      const rel = relative(root, f)
      if (!keep.has(rel.toLowerCase()) && !keptOnRestore(rel)) unlinkSync(f)
    }
  }
}

/** Take out the track files a failed restore added (best effort: one that can't go now is only an unused track). */
function removeAddedTracks(root: string, files: readonly string[]): void {
  removeAdded(root, TRACKS_DIR, files)
}

/** Take out the files a failed restore added to tracks/ or media/ (best effort: one left over is only unused). */
function removeAdded(root: string, folder: string, files: readonly string[]): void {
  const dir = join(root, folder)
  let n = 0
  for (const f of files) {
    if (!within(dir, f)) continue
    try {
      unlinkSync(f)
      n++
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT')
        log.warn(`could not take out a ${folder} file the failed restore added`, (e as NodeJS.ErrnoException).code || 'error')
    }
  }
  if (n) log.info(`${folder} files the failed restore added were taken out again:`, n)
}

async function putBack(root: string, safetyZip: string): Promise<void> {
  const zip = await ZipReader.open(safetyZip)
  const staged = new Map<string, string>()
  const tmpDir = join(root, `restore-undo-${Date.now()}`)
  let hasTracks = false
  try {
    hasTracks = JSON.parse((await zip.readText(MANIFEST)) ?? '{}')?.hasTracks === true
  } catch {
    /* no readable manifest: leave tracks/ alone */
  }
  try {
    for (const entry of zip.entries) {
      const dest = entry.dir || entry.name === MANIFEST ? null : restoreTarget(root, entry.name)
      if (!dest) continue
      const rel = relative(root, dest)
      if (isTracksEntry(rel) && !hasTracks) continue
      const tmp = join(tmpDir, rel)
      mkdirSync(dirname(tmp), { recursive: true })
      await zip.extractTo(entry, tmp)
      staged.set(rel, tmp)
    }
    replaceFrom(root, staged, hasTracks)
  } finally {
    removeTempDir(tmpDir)
  }
}

/* ------------------------------ backing tracks beside the backups ------------------------------ */
// Automatic backups leave the backing tracks out (they would make every hourly zip as big as all the tracks).
// Instead each track is copied ONCE into backups/tracks/ (tracks never change after they are written); a track the
// church deletes moves to backups/tracks/gone-<day>/ and is kept 15 days, as long as the automatic backups go back.

const mirrorDir = trackMirrorDir

/** Remove `<track>.ogg.tmp` (or media/'s `<id>.<ext>.tmp`) files a cut-off save or copy left in `dir`. Best effort. */
function removeStaleTrackTemps(dir: string, isName?: (name: string) => boolean): void {
  try {
    if (!existsSync(dir)) return
    const files = readdirSync(dir).flatMap((name) => {
      try {
        return [{ name, mtime: statSync(join(dir, name)).mtimeMs }]
      } catch {
        return []
      }
    })
    for (const name of staleTrackTemps(files, Date.now(), undefined, isName)) {
      const f = join(dir, name)
      if (!within(dir, f)) continue
      try {
        unlinkSync(f)
      } catch {
        /* in use: next time */
      }
    }
  } catch {
    /* can't list it: next time */
  }
}

/**
 * Bring backups/tracks/ up to date (a track can be 60 MB: copied without blocking main). Never fails the backup that
 * calls it, and never fills the last of the disk (saving the church's data needs it more): copies stop when free
 * space would drop under MIN_FREE_BYTES, and are made on a later run.
 *
 * First, a track a song uses but tracks/ lost (antivirus, a sync problem, a user tidying folders) is brought back from
 * here. A copy is retired into gone-<today>/ only when no song uses it and the songs list is complete.
 */
export async function mirrorTracks(): Promise<void> {
  try {
    const store = db()
    if (store.readOnly) return
    const songs = store.list<Song>('songs')
    await fillMissingTracks(songs)
    const src = join(dataRoot(), TRACKS_DIR)
    const dst = mirrorDir()
    removeStaleTrackTemps(src)
    removeStaleTrackTemps(dst)
    removeStaleTrackTemps(join(dataRoot(), MEDIA_DIR), isLibraryFileName) // a media copy cut off by a crash
    const tracks = existsSync(src) ? readdirSync(src) : []
    if (!tracks.length && !existsSync(dst)) return
    mkdirSync(dst, { recursive: true })
    const entries = readdirSync(dst, { withFileTypes: true })
    const today = localDate()
    const plan = trackMirrorPlan(
      tracks,
      entries.filter((e) => e.isFile()).map((e) => e.name),
      entries.filter((e) => e.isDirectory()).map((e) => e.name),
      today,
      songsListIsComplete() ? tracksInUse(songs) : null
    )
    let copied = 0
    for (const n of plan.copy) {
      const from = join(src, n)
      const to = join(dst, n)
      if (!within(src, from) || !within(dst, to)) continue
      if ((await freeBytes(dst)) - (await stat(from)).size < MIN_FREE_BYTES) {
        log.warn('backing tracks not copied beside the backups: the disk is nearly full')
        break
      }
      await copyFileAtomic(from, to)
      copied++
    }
    const goneDir = join(dst, `gone-${today}`)
    if (plan.retire.length) mkdirSync(goneDir, { recursive: true })
    for (const n of plan.retire) {
      const from = join(dst, n)
      const to = join(goneDir, n)
      if (within(dst, from) && within(goneDir, to)) renameSync(from, to)
    }
    for (const d of plan.dropDirs) {
      const p = join(dst, d)
      if (within(dst, p)) rmSync(p, { recursive: true, force: true })
    }
    if (copied || plan.retire.length) log.info(`backing tracks kept beside the backups: +${copied} -${plan.retire.length}`)
  } catch (e) {
    log.warn('could not keep a copy of the backing tracks', (e as NodeJS.ErrnoException).code || 'error')
  }
}

/** A track a song uses but tracks/ lacks comes back from backups/tracks/ (or a gone-<day> folder) if it is there. */
async function fillMissingTracks(songs: readonly Pick<Song, 'track'>[]): Promise<void> {
  try {
    if (db().readOnly) return
    const dir = join(dataRoot(), TRACKS_DIR)
    const m = mirrorDir()
    if (!existsSync(m)) return
    const gone = readdirSync(m, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith('gone-'))
    let n = 0
    for (const name of referencedTrackFiles(songs)) {
      const dest = join(dir, name)
      if (!within(dir, dest) || existsSync(dest)) continue
      const from = [join(m, name), ...gone.map((g) => join(m, g.name, name))].find((f) => within(m, f) && existsSync(f))
      if (!from) continue
      mkdirSync(dir, { recursive: true })
      // never fill the last of the disk: the church's data must still be saved (the next run tries again)
      if ((await freeBytes(dir)) - (await stat(from)).size < MIN_FREE_BYTES) {
        log.warn('backing tracks not brought back from backups/tracks: the disk is nearly full')
        break
      }
      await copyFileAtomic(from, dest)
      n++
    }
    if (n) log.info('backing tracks brought back from backups/tracks:', n)
  } catch (e) {
    log.warn('could not bring back missing backing tracks', (e as NodeJS.ErrnoException).code || 'error')
  }
}

const stamp = () => localStamp()

/** `<base>.zip`, or `<base>-2.zip`, `-3`… if taken: a second restore in the same minute must
 *  never overwrite the first safety backup (it may be the only copy of the original data). */
function freeName(dir: string, base: string): string {
  let p = join(dir, `${base}.zip`)
  for (let n = 2; existsSync(p); n++) p = join(dir, `${base}-${n}.zip`)
  return p
}

/* ------------------------------ automatic backups ------------------------------ */
let writesAtLastAuto = -1

/**
 * Automatic backup in Documents\ICCWorship\backups: at start-up and then every hour the app stays open — but
 * only if something was saved since the last one, never while something is on screen (the caller checks), and
 * never when the disk is nearly full. Keeps the newest backup of each of the last 14 days plus the last 6.
 */
export async function autoBackup(): Promise<void> {
  const store = db()
  if (store.readOnly) return // data from a newer version: leave its backups alone
  // inside the lock: a restore must not replace tracks/ while they are being copied
  await exclusive(mirrorTracks)
  const dir = backupDir()
  const now = new Date()
  const today = localDate(now)
  const names = readdirSync(dir)
  removeStaleTemps(dir, names)
  const decision = autoBackupDecision(
    names.some((f) => parseAutoName(f)?.day === today),
    store.writeCount,
    writesAtLastAuto
  )
  if (decision === 'baseline') writesAtLastAuto = store.writeCount // start-up, today's backup already made
  if (decision !== 'backup') return
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  // the count when the files were READ: a save made while the zip was being written is not in this backup
  // and must make the next hourly run happen. Never when the disk is nearly full.
  let writes: number
  try {
    ;({ writes } = await exclusive(() => writeBackup(join(dir, autoBackupName(today, time)), false, MIN_FREE_BYTES)))
  } catch (e) {
    if (!(e instanceof BackupRoomError)) throw e
    log.warn('automatic backup skipped:', e.reason === 'no-space' ? 'the disk is nearly full' : e.reason)
    return
  }
  writesAtLastAuto = writes
  for (const old of autoBackupsToDelete(readdirSync(dir))) {
    try {
      unlinkSync(join(dir, old))
    } catch {
      /* in use: next time */
    }
  }
}

/** Remove .zip.tmp files an interrupted backup left behind (they are hidden from the list and never pruned). */
function removeStaleTemps(dir: string, names: string[]): void {
  const files: { name: string; mtime: number }[] = []
  for (const name of names) {
    if (!name.endsWith('.zip.tmp')) continue
    try {
      files.push({ name, mtime: statSync(join(dir, name)).mtimeMs })
    } catch {
      /* gone meanwhile */
    }
  }
  for (const name of staleBackupTemps(files, Date.now())) {
    try {
      unlinkSync(join(dir, name))
    } catch {
      /* in use: next time */
    }
  }
}

export function listBackups(): { name: string; path: string; size: number; date: number }[] {
  const dir = backupDir()
  return readdirSync(dir)
    .filter((f) => f.endsWith('.zip'))
    .flatMap((f) => {
      try {
        const st = statSync(join(dir, f))
        return [{ name: f, path: join(dir, f), size: st.size, date: st.mtimeMs }]
      } catch {
        return [] // removed meanwhile (an automatic backup's pruning)
      }
    })
    .sort((a, b) => b.date - a.date)
}

export const defaultBackupName = () => `ICCWorship-backup-${stamp()}.zip`
