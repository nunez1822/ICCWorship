import JSZip from 'jszip'
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, statSync, unlinkSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { backupDir, dataRoot } from './paths'
import { db, getSettings } from './db'
import { localDate, localStamp } from '@shared/dates'
import { checkSchema, runMigrations, SCHEMA_VERSION } from '@shared/migrations'
import { reload as reloadBibles } from './bible'
import { RESTORE_DIRS, restoreTarget } from './restorePath'
import {
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
  safetyBackupsToDelete
} from '@shared/backupCore'
import { writeFileAtomic, writeFileAtomicAsync } from './atomicWrite'
import { log } from './log'

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

async function writeBackup(target: string): Promise<{ ok: boolean; path: string; files: number; bytes: number }> {
  db().flush()
  const root = dataRoot()
  const zip = new JSZip()
  let files = 0
  for (const inc of INCLUDE) {
    for (const f of walk(join(root, inc))) {
      zip.file(relative(root, f).split(sep).join('/'), readFileSync(f))
      files++
    }
  }
  zip.file(MANIFEST, JSON.stringify(makeManifest(app.getVersion())))
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  mkdirSync(dirname(target), { recursive: true })
  await writeFileAtomicAsync(target, buf)
  return { ok: true, path: target, files, bytes: buf.length }
}

export function createBackup(target: string): Promise<{ ok: boolean; path: string; files: number; bytes: number }> {
  return exclusive(() => writeBackup(target))
}

/** A copy of the current data before something replaces or upgrades it. Keeps the newest 5 of each kind. */
export function createSafetyBackup(kind: 'before-restore' | 'before-migrate'): Promise<string> {
  return exclusive(async () => {
    const path = freeName(backupDir(), `${kind}-${stamp()}`)
    await writeBackup(path)
    pruneSafetyBackups()
    return path
  })
}

function pruneSafetyBackups(): void {
  const dir = backupDir()
  const files = readdirSync(dir).map((name) => ({ name, mtime: statSync(join(dir, name)).mtimeMs }))
  for (const name of safetyBackupsToDelete(files)) {
    try {
      unlinkSync(join(dir, name))
    } catch {
      /* in use: next time */
    }
  }
}

/* ------------------------------ restore ------------------------------ */
export type RestoreError = 'not-a-backup' | 'newer-format' | 'newer-schema' | 'damaged-backup' | 'restore-failed' | 'read-only'

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
  // version to restore.
  if (db().readOnly) return { ok: false, error: 'read-only' }
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

  const root = resolve(dataRoot())
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

    // 6. safety copy of what is there now, then replace file by file
    const safety = freeName(backupDir(), `before-restore-${stamp()}`)
    await writeBackup(safety)
    pruneSafetyBackups()
    db().reset()
    try {
      replaceFrom(root, staged)
    } catch (e) {
      log.error('restore failed while replacing files; putting the safety backup back', e)
      try {
        await putBack(root, safety)
      } catch (e2) {
        log.error('could not put the safety backup back', e2)
      }
      db().reset()
      reloadBibles()
      return { ok: false, error: 'restore-failed', safetyBackup: safety }
    }
    db().reset()
    reloadBibles()
    return { ok: true, safetyBackup: safety }
  } finally {
    rmSync(staging, { recursive: true, force: true, maxRetries: 3 })
  }
}

/**
 * Write every staged file into place, then remove every file the backup doesn't have (except kept-aside
 * .corrupt copies). That includes every .bak: JsonStore falls back to <name>.json.bak when <name>.json is
 * missing or damaged, so a .bak left behind would bring back the data from before the restore.
 */
function replaceFrom(root: string, staged: Map<string, string>): void {
  for (const [rel, tmp] of staged) {
    const dest = join(root, rel)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileAtomic(dest, readFileSync(tmp))
  }
  const keep = new Set([...staged.keys()].map((r) => r.toLowerCase()))
  for (const inc of INCLUDE) {
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
  try {
    for (const name of Object.keys(zip.files)) {
      const entry = zip.files[name]
      const dest = entry.dir || name === MANIFEST ? null : restoreTarget(root, name)
      if (!dest) continue
      const rel = relative(root, dest)
      const tmp = join(tmpDir, rel)
      mkdirSync(dirname(tmp), { recursive: true })
      writeFileAtomic(tmp, await entry.async('nodebuffer'))
      staged.set(rel, tmp)
    }
    replaceFrom(root, staged)
  } finally {
    rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3 })
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
  const dir = backupDir()
  const now = new Date()
  const today = localDate(now)
  const hasToday = readdirSync(dir).some((f) => parseAutoName(f)?.day === today)
  if (hasToday) {
    // start-up with today's backup already made: nothing new to save yet
    if (writesAtLastAuto === -1) {
      writesAtLastAuto = store.writeCount
      return
    }
    if (store.writeCount === writesAtLastAuto) return // nothing saved since the last one
  }
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
  await createBackup(join(dir, autoBackupName(today, time)))
  writesAtLastAuto = store.writeCount
  for (const old of autoBackupsToDelete(readdirSync(dir))) {
    try {
      unlinkSync(join(dir, old))
    } catch {
      /* in use: next time */
    }
  }
}

export function listBackups(): { name: string; path: string; size: number; date: number }[] {
  const dir = backupDir()
  return readdirSync(dir)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => {
      const st = statSync(join(dir, f))
      return { name: f, path: join(dir, f), size: st.size, date: st.mtimeMs }
    })
    .sort((a, b) => b.date - a.date)
}

export const defaultBackupName = () => `ICCWorship-backup-${stamp()}.zip`
