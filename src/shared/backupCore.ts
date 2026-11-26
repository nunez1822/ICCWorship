/**
 * The rules behind backups, without any file access (unit tested in tests/backupCore.test.ts).
 */
import { SCHEMA_VERSION } from '@shared/migrations'
import { isTrackFileName } from '@shared/tracks'

/** Version of the backup .zip layout itself (not of the data inside it). */
export const BACKUP_FORMAT = 1

export interface BackupManifest {
  app: 'ICCWorship'
  format: number
  /** data schema inside (see @shared/migrations) */
  schemaVersion: number
  appVersion: string
  createdAt: string
  /**
   * The backup holds the backing tracks (tracks/). Manual backups do; automatic and before-migrate backups don't
   * (the tracks are kept once in backups/tracks/ instead of in every hourly zip). Restoring a backup WITHOUT tracks
   * leaves tracks/ as it is (and fills in missing ones from backups/tracks/) — it never deletes them.
   */
  hasTracks?: boolean
  /** the media library's own copies (media/) are inside (manual backups) */
  hasMedia?: boolean
}

export function makeManifest(appVersion: string, hasTracks = false, now = new Date(), hasMedia = false): BackupManifest {
  return { app: 'ICCWorship', format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, appVersion, createdAt: now.toISOString(), hasTracks, hasMedia }
}

export type ManifestCheck =
  | { ok: true; format: number; schemaVersion?: number; hasTracks: boolean; hasMedia: boolean }
  | { ok: false; error: 'not-a-backup' | 'newer-format' | 'newer-schema' }

/** 1.0.x wrote { app, version: 1 }; later versions { app, format, schemaVersion, … }. */
export function checkManifest(raw: unknown): ManifestCheck {
  if (!raw || typeof raw !== 'object' || (raw as { app?: unknown }).app !== 'ICCWorship') return { ok: false, error: 'not-a-backup' }
  const m = raw as { format?: unknown; version?: unknown; schemaVersion?: unknown }
  const format = typeof m.format === 'number' ? m.format : typeof m.version === 'number' ? m.version : 1
  if (format > BACKUP_FORMAT) return { ok: false, error: 'newer-format' }
  // the manifest says which data schema is inside (1.0's manifests don't): a newer one is refused even if the
  // zip's own meta.json is missing or says otherwise
  const schemaVersion = typeof m.schemaVersion === 'number' ? m.schemaVersion : undefined
  if (schemaVersion !== undefined && schemaVersion > SCHEMA_VERSION) return { ok: false, error: 'newer-schema' }
  // only a backup that says so replaces tracks/ (1.0/1.1 backups, and an older version's backup of newer data, don't)
  const r = raw as { hasTracks?: unknown; hasMedia?: unknown }
  return { ok: true, format, schemaVersion, hasTracks: r.hasTracks === true, hasMedia: r.hasMedia === true }
}

/* ------------------------------ restore ------------------------------ */

/** .tmp: a save in progress; .bak: the previous version of a file. A backup holds neither. */
export const isTransientCopy = (name: string): boolean => /\.(tmp|bak)$/i.test(name)

/** Restored files that must parse before anything is replaced: every .json under data/, Bibles included. */
export const mustParseOnRestore = (rel: string): boolean => /^data[\\/](?:.+[\\/])?[^\\/]+\.json$/i.test(rel)

/**
 * Files a restore leaves in place although the backup doesn't have them: kept-aside copies of damaged files
 * (they may be the only copy of something) and saves in progress (never read as data). Everything else that
 * the backup lacks — .bak copies included — is removed.
 */
export const keptOnRestore = (rel: string): boolean => /\.corrupt-/i.test(rel) || /\.tmp$/i.test(rel)

/**
 * The meta.json to stage for a restore, or null if the backup's is fine. A backup always comes from a church
 * that was set up, so the result is always marked `seeded` (else the next start would treat it as a first run).
 */
export function restoredMeta(raw: unknown, schemaVersion: number, now = Date.now()): Record<string, unknown> | null {
  const meta = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null
  if (meta && meta.seeded && meta.schemaVersion === schemaVersion) return null
  return { ...meta, seeded: meta?.seeded || now, schemaVersion }
}

/* ------------------------------ automatic backups ------------------------------ */

/** auto-2026-11-24.zip (1.0.x, daily) or auto-2026-11-24-0930.zip (hourly) → its date and time */
export function parseAutoName(name: string): { day: string; time: string } | null {
  const m = /^auto-(\d{4}-\d{2}-\d{2})(?:-(\d{4}))?\.zip$/.exec(name)
  return m ? { day: m[1], time: m[2] || '0000' } : null
}

/**
 * Should the automatic backup run now? `writesAtLast` is the store's write count the last automatic backup
 * captured this session (-1: none yet). At start-up a backup is made unless today already has one (then the
 * current count becomes the baseline). After that, only when something was saved since — a new day alone (the
 * app left open overnight) is no reason for another copy of the same data.
 */
export function autoBackupDecision(hasToday: boolean, writeCount: number, writesAtLast: number): 'backup' | 'baseline' | 'skip' {
  if (writesAtLast === -1) return hasToday ? 'baseline' : 'backup'
  return writeCount === writesAtLast ? 'skip' : 'backup'
}

/** `<backup>.zip.tmp` files left by a backup that was interrupted (crash, power cut) — older than `maxAgeMs`,
 *  so a backup still being written right now is never touched. */
export function staleBackupTemps(files: { name: string; mtime: number }[], now: number, maxAgeMs = 60 * 60_000): string[] {
  return files.filter((f) => f.name.endsWith('.zip.tmp') && now - f.mtime > maxAgeMs).map((f) => f.name)
}

export function autoBackupName(day: string, time: string): string {
  return `auto-${day}-${time}.zip`
}

/**
 * Which automatic backups to delete: keep the newest backup of each of the last `days` days, plus the newest
 * `recent` ones (so a bad hour can be undone), and nothing else. Files that aren't automatic backups are
 * never touched.
 */
export function autoBackupsToDelete(names: string[], days = 14, recent = 6): string[] {
  const autos = names
    .map((n) => ({ n, p: parseAutoName(n) }))
    .filter((x): x is { n: string; p: { day: string; time: string } } => !!x.p)
    .sort((a, b) => (a.p.day + a.p.time < b.p.day + b.p.time ? 1 : -1)) // newest first
  const keep = new Set(autos.slice(0, recent).map((x) => x.n))
  const daysSeen: string[] = []
  for (const x of autos) {
    if (daysSeen.includes(x.p.day)) continue
    daysSeen.push(x.p.day)
    if (daysSeen.length <= days) keep.add(x.n) // the first one seen for a day is its newest
  }
  return autos.filter((x) => !keep.has(x.n)).map((x) => x.n)
}

/** a safety backup that holds the backing tracks (made before restoring a backup that replaces them) */
export const SAFETY_WITH_TRACKS_PREFIX = 'before-restore-tracks-'

/**
 * Safety backups made before a restore / a data upgrade: keep the newest `keep` of each kind. A newer kind
 * never pushes out the other (an upgrade's safety copy must survive several restores). The ones that hold every
 * backing track (they can be GBs) are a kind of their own, and fewer: only the newest `keepWithTracks` stay.
 */
export function safetyBackupsToDelete(files: { name: string; mtime: number }[], keep = 5, keepWithTracks = 2): string[] {
  const kinds: [(name: string) => boolean, number][] = [
    [(n) => n.startsWith('before-restore-') && !n.startsWith(SAFETY_WITH_TRACKS_PREFIX), keep],
    [(n) => n.startsWith(SAFETY_WITH_TRACKS_PREFIX), keepWithTracks],
    [(n) => n.startsWith('before-migrate-'), keep]
  ]
  return kinds.flatMap(([mine, n]) =>
    files
      .filter((f) => mine(f.name) && f.name.endsWith('.zip'))
      .sort((a, b) => b.mtime - a.mtime)
      .slice(n)
      .map((f) => f.name)
  )
}

/* ------------------------------ room for a backup ------------------------------ */

/** A .zip without Zip64 can't hold more than 4 GiB (offsets are 32-bit): stay well under it. */
export const MAX_BACKUP_BYTES = 4 * 1024 ** 3 - 256 * 1024 ** 2

/**
 * Can a backup of about `bytes` (the files' size: the .zip is never bigger, except a few headers) be written where
 * `free` bytes are left, keeping `reserve` bytes free? 'too-large': no .zip can hold it.
 */
export function backupRoom(bytes: number, free: number, reserve: number): 'ok' | 'no-space' | 'too-large' {
  if (bytes > MAX_BACKUP_BYTES) return 'too-large'
  return free - bytes < reserve ? 'no-space' : 'ok'
}

/* ------------------------------ backing tracks kept beside the backups ------------------------------ */

/** how long a track the church deleted stays in backups/tracks/gone-<day>/ (automatic backups go back 14 days) */
export const TRACK_MIRROR_KEEP_DAYS = 15

const dayNumber = (day: string) => Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10)) / 86_400_000

/**
 * Automatic backups leave the tracks out; each track file is copied once into backups/tracks/ instead (a track
 * never changes after it is written). Returns which tracks to copy there, which copies to retire into
 * gone-<today>/ (the church deleted that track), and which gone-<day> folders are old enough to delete.
 *
 * `inUse`: the track files the songs still use. Such a copy is never retired, even if tracks/ lost the file (moved by
 * antivirus, a sync problem, a user tidying folders) — it may be the only copy left, and it is how the track comes
 * back. `null`: the songs list can't be trusted to be complete (damaged, recovered, just seeded): retire nothing.
 */
export function trackMirrorPlan(
  tracks: readonly string[],
  mirror: readonly string[],
  goneDirs: readonly string[],
  today: string,
  inUse: ReadonlySet<string> | null
): { copy: string[]; retire: string[]; dropDirs: string[] } {
  const t = new Set(tracks.filter(isTrackFileName))
  const m = new Set(mirror.filter(isTrackFileName))
  return {
    copy: [...t].filter((n) => !m.has(n)),
    retire: inUse ? [...m].filter((n) => !t.has(n) && !inUse.has(n)) : [],
    dropDirs: goneDirs.filter((d) => {
      const day = /^gone-(\d{4}-\d{2}-\d{2})$/.exec(d)?.[1]
      return !!day && dayNumber(today) - dayNumber(day) > TRACK_MIRROR_KEEP_DAYS
    })
  }
}

/**
 * `<track>.ogg.tmp` files in tracks/ or backups/tracks/ (or `<id>.<ext>.tmp` in media/, with `isName` =
 * isLibraryFileName) left by a save or copy that was cut off (crash, power cut). Nothing else ever removes them (they
 * aren't track or library files). Only those older than `maxAgeMs`: never one being written.
 */
export function staleTrackTemps(
  files: { name: string; mtime: number }[],
  now: number,
  maxAgeMs = 24 * 60 * 60_000,
  isName: (name: string) => boolean = isTrackFileName
): string[] {
  return files.filter((f) => /\.tmp$/i.test(f.name) && isName(f.name.slice(0, -4)) && now - f.mtime > maxAgeMs).map((f) => f.name)
}

/** Settings that describe this computer, not the church: a restore (maybe from another PC) keeps them. */
export const MACHINE_SETTINGS = [
  'outputDisplayId',
  'outputEnabled',
  'serverPort',
  'serverEnabled',
  'remotePin',
  'checkForUpdates',
  'autoUpdate',
  'lastUpdateCheck',
  'lastManualBackup',
  'disableHwAccel',
  'audioOutputId',
  'audioOutputLabel'
] as const

export function mergeRestoredSettings(restored: Record<string, unknown>, current: Record<string, unknown>): Record<string, unknown> {
  const out = { ...restored }
  for (const k of MACHINE_SETTINGS) {
    if (current[k] !== undefined) out[k] = current[k]
    else delete out[k]
  }
  return out
}
