/**
 * The rules behind backups, without any file access (unit tested in tests/backupCore.test.ts).
 */
import { SCHEMA_VERSION } from '@shared/migrations'

/** Version of the backup .zip layout itself (not of the data inside it). */
export const BACKUP_FORMAT = 1

export interface BackupManifest {
  app: 'ICCWorship'
  format: number
  /** data schema inside (see @shared/migrations) */
  schemaVersion: number
  appVersion: string
  createdAt: string
}

export function makeManifest(appVersion: string, now = new Date()): BackupManifest {
  return { app: 'ICCWorship', format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, appVersion, createdAt: now.toISOString() }
}

export type ManifestCheck = { ok: true; format: number } | { ok: false; error: 'not-a-backup' | 'newer-format' }

/** 1.0.x wrote { app, version: 1 }; later versions { app, format, schemaVersion, … }. */
export function checkManifest(raw: unknown): ManifestCheck {
  if (!raw || typeof raw !== 'object' || (raw as { app?: unknown }).app !== 'ICCWorship') return { ok: false, error: 'not-a-backup' }
  const m = raw as { format?: unknown; version?: unknown }
  const format = typeof m.format === 'number' ? m.format : typeof m.version === 'number' ? m.version : 1
  if (format > BACKUP_FORMAT) return { ok: false, error: 'newer-format' }
  return { ok: true, format }
}

/* ------------------------------ automatic backups ------------------------------ */

/** auto-2026-11-24.zip (1.0.x, daily) or auto-2026-11-24-0930.zip (hourly) → its date and time */
export function parseAutoName(name: string): { day: string; time: string } | null {
  const m = /^auto-(\d{4}-\d{2}-\d{2})(?:-(\d{4}))?\.zip$/.exec(name)
  return m ? { day: m[1], time: m[2] || '0000' } : null
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

/**
 * Safety backups made before a restore / a data upgrade: keep the newest `keep` of each kind. A newer kind
 * never pushes out the other (an upgrade's safety copy must survive several restores).
 */
export function safetyBackupsToDelete(files: { name: string; mtime: number }[], keep = 5): string[] {
  const out: string[] = []
  for (const prefix of ['before-restore-', 'before-migrate-']) {
    const mine = files.filter((f) => f.name.startsWith(prefix) && f.name.endsWith('.zip')).sort((a, b) => b.mtime - a.mtime)
    out.push(...mine.slice(keep).map((f) => f.name))
  }
  return out
}

/** Settings that describe this computer, not the church: a restore (maybe from another PC) keeps them. */
export const MACHINE_SETTINGS = [
  'outputDisplayId',
  'outputEnabled',
  'serverPort',
  'serverEnabled',
  'remotePin',
  'checkForUpdates',
  'lastUpdateCheck',
  'disableHwAccel'
] as const

export function mergeRestoredSettings(restored: Record<string, unknown>, current: Record<string, unknown>): Record<string, unknown> {
  const out = { ...restored }
  for (const k of MACHINE_SETTINGS) {
    if (current[k] !== undefined) out[k] = current[k]
    else delete out[k]
  }
  return out
}
