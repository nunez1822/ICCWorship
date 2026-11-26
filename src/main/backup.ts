import JSZip from 'jszip'
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statfsSync, statSync, unlinkSync } from 'node:fs'
import { copyFile, readFile, rename, rm, stat, statfs } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { backupDir, dataRoot } from './paths'
import { dataStatus, db, getSettings } from './db'
import { localDate, localStamp } from '@shared/dates'
import { checkSchema, runMigrations, SCHEMA_VERSION } from '@shared/migrations'
import { reload as reloadBibles } from './bible'
import { isTracksEntry, RESTORE_DIRS, restoreTarget, TRACKS_DIR } from './restorePath'
import { isTrackFileName, referencedTrackFiles } from '@shared/tracks'
import {
  autoBackupDecision,
  autoBackupName,
  autoBackupsToDelete,
  checkManifest,
  isTransientCopy,
  keptOnRestore,
  makeManifest,
  mergeRestoredSettings,
  mustParseOnRestore,
  parseAutoName,
  restoredMeta,
  safetyBackupsToDelete,
  staleBackupTemps,
  trackMirrorPlan
} from '@shared/backupCore'
import { writeFileAtomic, writeFileAtomicAsync } from './atomicWrite'
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
    const st = statSync(p)
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

type BackupResult = { ok: boolean; path: string; files: number; bytes: number }

/**
 * `writes`: the store's write count when the files were read (saves after that are not in this backup).
 * `tracks`: include the backing tracks (manual backups, and the safety copy before a restore that replaces them).
 * Track files are already compressed (Opus): stored as they are. Files are read without blocking the main process.
 */
async function writeBackup(target: string, tracks: boolean): Promise<BackupResult & { writes: number }> {
  const store = db()
  store.flush()
  const writes = store.writeCount
  // a collection running from its .bak has a damaged (or no) main file on disk: back up what the app uses
  const recovered = store.recoveredForBackup()
  const root = dataRoot()
  const zip = new JSZip()
  let files = 0
  for (const inc of INCLUDE) {
    const isTracks = inc === TRACKS_DIR
    if (isTracks && !tracks) continue
    for (const f of walk(join(root, inc))) {
      const rel = relative(root, f).split(sep).join('/')
      const name = /^data\/([^/]+)\.json$/.exec(rel)?.[1]
      if (name && recovered.has(name)) continue // added below
      if (isTracks && !isTrackFileName(basename(f))) continue
      zip.file(rel, await readFile(f), isTracks ? { compression: 'STORE' } : undefined)
      files++
    }
  }
  for (const [name, json] of recovered) {
    zip.file(`data/${name}.json`, json)
    files++
  }
  zip.file(MANIFEST, JSON.stringify(makeManifest(app.getVersion(), tracks)))
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  mkdirSync(dirname(target), { recursive: true })
  await writeFileAtomicAsync(target, buf)
  return { ok: true, path: target, files, bytes: buf.length, writes }
}

/** "Back up now": everything, backing tracks included (the copy to take to another PC or a USB stick) */
export function createBackup(target: string): Promise<BackupResult> {
  return exclusive(async () => {
    const { writes: _writes, ...r } = await writeBackup(target, true)
    return r
  })
}

/** A copy of the current data before something replaces or upgrades it. Keeps the newest 5 of each kind. */
export function createSafetyBackup(kind: 'before-restore' | 'before-migrate'): Promise<string> {
  return exclusive(async () => {
    const path = freeName(backupDir(), `${kind}-${stamp()}`)
    await writeBackup(path, false) // an upgrade never touches tracks/
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
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(readFileSync(zipPath))
  } catch {
    // not a zip at all (renamed text file, truncated download…) — same answer as a foreign zip
    return { ok: false, error: 'not-a-backup' }
  }
  let manifest: unknown
  try {
    manifest = JSON.parse((await zip.file(MANIFEST)?.async('string')) ?? 'null')
  } catch {
    manifest = null
  }
  const m = checkManifest(manifest)
  if (!m.ok) return { ok: false, error: m.error }
  // a manifest with no data files would "restore" nothing and still reload the app
  if (!Object.keys(zip.files).some((n) => /^data\/[^/]+\.json$/.test(n) && !zip.files[n].dir)) return { ok: false, error: 'not-a-backup' }

  const staging = join(root, `restore-staging-${Date.now()}`)
  try {
    // 1. unpack into the staging folder — only data/ and cache/presentations/ entries (zip-slip safe)
    const staged = new Map<string, string>() // path relative to root → staged file
    for (const name of Object.keys(zip.files)) {
      const entry = zip.files[name]
      // a backup never holds .tmp / .bak copies; one that does (hand-made) must not bring back old data
      if (entry.dir || name === MANIFEST || isTransientCopy(name)) continue
      const dest = restoreTarget(root, name)
      if (!dest) continue
      const rel = relative(root, dest)
      // tracks/ is replaced only by a backup that says it holds the tracks
      if (isTracksEntry(rel) && !m.hasTracks) continue
      const tmp = join(staging, rel)
      mkdirSync(dirname(tmp), { recursive: true })
      writeFileAtomic(tmp, await entry.async('nodebuffer'))
      staged.set(rel, tmp)
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

    // 6. safety copy of what is there now (with the tracks if they are about to be replaced), then replace file by file
    const safety = freeName(backupDir(), `before-restore-${stamp()}`)
    await writeBackup(safety, m.hasTracks)
    pruneSafetyBackups()
    db().reset()
    try {
      replaceFrom(root, staged, m.hasTracks)
    } catch (e) {
      log.error('restore failed while replacing files; putting the safety backup back', e)
      let putBackOk = true
      try {
        await putBack(root, safety)
      } catch (e2) {
        putBackOk = false
        log.error('could not put the safety backup back', e2)
      }
      db().reset()
      reloadBibles()
      // never say "your previous data was put back" when it wasn't: name the safety backup to restore by hand
      return { ok: false, error: putBackOk ? 'restore-failed' : 'restore-failed-mixed', safetyBackup: safety }
    }
    db().reset()
    reloadBibles()
    await fillMissingTracks(root)
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
 * Write every staged file into place, then remove every file the backup doesn't have (except kept-aside
 * .corrupt copies). That includes every .bak: JsonStore falls back to <name>.json.bak when <name>.json is
 * missing or damaged, so a .bak left behind would bring back the data from before the restore.
 * tracks/ is replaced only when `replaceTracks` (the backup holds the tracks); otherwise it is left as it is.
 */
function replaceFrom(root: string, staged: Map<string, string>, replaceTracks: boolean): void {
  for (const [rel, tmp] of staged) {
    const dest = join(root, rel)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileAtomic(dest, readFileSync(tmp))
  }
  const keep = new Set([...staged.keys()].map((r) => r.toLowerCase()))
  for (const inc of INCLUDE) {
    if (inc === TRACKS_DIR && !replaceTracks) continue
    for (const f of walk(join(root, inc), [], true)) {
      const rel = relative(root, f)
      if (!keep.has(rel.toLowerCase()) && !keptOnRestore(rel)) unlinkSync(f)
    }
  }
}

async function putBack(root: string, safetyZip: string): Promise<void> {
  const zip = await JSZip.loadAsync(readFileSync(safetyZip))
  const staged = new Map<string, string>()
  const tmpDir = join(root, `restore-undo-${Date.now()}`)
  let hasTracks = false
  try {
    hasTracks = JSON.parse((await zip.file(MANIFEST)?.async('string')) ?? '{}')?.hasTracks === true
  } catch {
    /* no readable manifest: leave tracks/ alone */
  }
  try {
    for (const name of Object.keys(zip.files)) {
      const entry = zip.files[name]
      const dest = entry.dir || name === MANIFEST ? null : restoreTarget(root, name)
      if (!dest) continue
      const rel = relative(root, dest)
      if (isTracksEntry(rel) && !hasTracks) continue
      const tmp = join(tmpDir, rel)
      mkdirSync(dirname(tmp), { recursive: true })
      writeFileAtomic(tmp, await entry.async('nodebuffer'))
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

const mirrorDir = () => join(backupDir(), 'tracks')

/** copy to .tmp, then rename: a half-copied file must never look like a finished copy. Doesn't block main. */
async function copyFileSafely(from: string, to: string): Promise<void> {
  const tmp = to + '.tmp'
  try {
    await copyFile(from, tmp)
    await rename(tmp, to)
  } catch (e) {
    await rm(tmp, { force: true }).catch(() => {})
    throw e
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
 * Bring backups/tracks/ up to date (a track can be 60 MB: copied without blocking main). Never fails the backup that
 * calls it, and never fills the last of the disk (saving the church's data needs it more): copies stop when free
 * space would drop under MIN_FREE_BYTES, and are made on a later run.
 */
export async function mirrorTracks(): Promise<void> {
  try {
    const src = join(dataRoot(), TRACKS_DIR)
    const dst = mirrorDir()
    const tracks = existsSync(src) ? readdirSync(src) : []
    if (!tracks.length && !existsSync(dst)) return
    mkdirSync(dst, { recursive: true })
    const entries = readdirSync(dst, { withFileTypes: true })
    const today = localDate()
    const plan = trackMirrorPlan(
      tracks,
      entries.filter((e) => e.isFile()).map((e) => e.name),
      entries.filter((e) => e.isDirectory()).map((e) => e.name),
      today
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
      await copyFileSafely(from, to)
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

/** After a restore: a track a restored song uses but tracks/ lacks comes back from backups/tracks/ if it is there. */
async function fillMissingTracks(root: string): Promise<void> {
  try {
    const songs = JSON.parse(stripBom(readFileSync(join(root, 'data', 'songs.json'), 'utf8')))
    if (!Array.isArray(songs)) return
    const dir = join(root, TRACKS_DIR)
    const m = mirrorDir()
    const gone = existsSync(m) ? readdirSync(m, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith('gone-')) : []
    let n = 0
    for (const name of referencedTrackFiles(songs)) {
      const dest = join(dir, name)
      if (!within(dir, dest) || existsSync(dest)) continue
      const from = [join(m, name), ...gone.map((g) => join(m, g.name, name))].find((f) => within(m, f) && existsSync(f))
      if (!from) continue
      mkdirSync(dir, { recursive: true })
      await copyFileSafely(from, dest)
      n++
    }
    if (n) log.info('backing tracks brought back from backups/tracks:', n)
  } catch (e) {
    log.warn('could not check the restored backing tracks', (e as NodeJS.ErrnoException).code || 'error')
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
  try {
    const { bavail, bsize } = statfsSync(dir)
    if (bavail * bsize < MIN_FREE_BYTES) {
      log.warn('automatic backup skipped: the disk is nearly full')
      return
    }
  } catch {
    /* can't tell: go ahead */
  }
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`
  // the count when the files were READ: a save made while the zip was being written is not in this backup
  // and must make the next hourly run happen
  const { writes } = await exclusive(() => writeBackup(join(dir, autoBackupName(today, time)), false))
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
