import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { JsonStore } from './jsonStore'
import { dataDir, dataLocked, dataRoot, trackMirrorDir } from './paths'
import { TRACKS_DIR } from './restorePath'
import { isTrackFileName } from '@shared/tracks'
import { newPin } from './pathGuard'
import { DEFAULT_SETTINGS, DEFAULT_TEAMS, DEFAULT_THEMES, SAMPLE_SONGS, sampleTemplate } from '@shared/defaults'
import type { Settings, Theme } from '@shared/types'
import { checkSchema, runMigrations, SCHEMA_VERSION } from '@shared/migrations'
import { log } from './log'

export const COLLECTIONS = ['songs', 'plans', 'media', 'presentations', 'themes', 'people', 'teams', 'prayer', 'usage'] as const
export type Collection = (typeof COLLECTIONS)[number]

let store: JsonStore | null = null

export function db(): JsonStore {
  if (!store) store = new JsonStore(dataDir())
  return store
}

export function isCollection(name: string): name is Collection {
  return (COLLECTIONS as readonly string[]).includes(name)
}

export function getSettings(): Settings {
  const saved = db().read<Partial<Settings>>('settings', {})
  return { ...DEFAULT_SETTINGS, ...saved }
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch }
  db().write('settings', next)
  return next
}

/* ------------------------------ data versions ------------------------------ */

/** readOnly without newerSchema: the data could not be prepared — `upgradeFailed` says whether the upgrade
 *  itself failed (otherwise no safety backup could be made, e.g. a full disk). */
export type DataStatus = { readOnly: boolean; newerSchema?: number; upgradeFailed?: boolean; locked?: boolean; migrated?: string[] }
let status: DataStatus = { readOnly: false }
export const dataStatus = (): DataStatus => status

/** Data written by a newer ICCWorship is opened read-only: refuse every file change outside the JSON store too. */
export function assertWritable(): void {
  if (db().readOnly) throw new Error('read-only')
}

/**
 * At start-up, before anything else reads the data: which version wrote it? Older data is upgraded (after a
 * safety backup); data from a NEWER version is opened read-only, so an old copy of ICCWorship (say, a portable
 * one on a USB stick) can still run a service without damaging it. A fresh install is stamped by seedIfEmpty.
 */
export async function prepareData(safetyBackup: () => Promise<unknown>): Promise<DataStatus> {
  const s = db()
  if (dataLocked()) {
    // the portable exe's data is on a write-protected stick: show it, save nothing (the red bar says why)
    s.readOnly = true
    status = { readOnly: true, locked: true }
    return status
  }
  const meta = s.read<{ seeded?: number; schemaVersion?: number }>('meta', {})
  if (!meta.seeded) return status
  const check = checkSchema(meta.schemaVersion)
  if (check.kind === 'newer') {
    s.readOnly = true
    status = { readOnly: true, newerSchema: check.version }
  } else if (check.kind === 'migrate') {
    try {
      await safetyBackup()
    } catch {
      // no safety copy (disk full?): don't touch the data at all
      s.readOnly = true
      status = { readOnly: true }
      return status
    }
    let migrated: string[]
    try {
      migrated = runMigrations(
        {
          read: (name) => s.read<unknown>(name, (COLLECTIONS as readonly string[]).includes(name) ? [] : {}),
          write: (name, value) => s.write(name, value, true)
        },
        check.from
      )
      s.flush()
    } catch (e) {
      // A failed upgrade must never keep the app from opening on Sunday. meta.schemaVersion is stamped last, so
      // nothing counts as upgraded: open read-only (the red bar says so), the safety backup holds the original.
      log.error('data upgrade failed; opening the data read-only', e)
      s.readOnly = true
      status = { readOnly: true, upgradeFailed: true }
      return status
    }
    status = { readOnly: false, migrated }
  }
  return status
}

/**
 * An empty PIN would let anyone on the Wi-Fi use the remote (and the server now refuses every device instead).
 * Settings from before PINs existed, a damaged settings file or a restored old backup can lack one: call this
 * at startup and after every restore. Returns true if it had to make a new one.
 */
export function ensurePin(): boolean {
  if (getSettings().remotePin) return false
  setSettings({ remotePin: newPin() })
  return true
}

/**
 * Backing tracks kept for good, in meta.json (so it lasts beyond this run): never deleted or retired as "unused" —
 * until a restore replaces meta.json with the backup's. They belong to songs the songs list may no longer have:
 * - tracks already in tracks/ when the sample songs were written into an empty songs list (data/ was lost or only
 *   partly synced while tracks/ is still there);
 * - every track there was when the songs list was found damaged, recovered from an older .bak, or missing (see
 *   songsListIsComplete in tracks.ts).
 * Anything that deletes tracks no song uses must add these to the ones in use.
 */
export function keptTracks(): Set<string> {
  const keep = db().read<{ keepTracks?: unknown }>('meta', {}).keepTracks
  return new Set(Array.isArray(keep) ? keep.filter((n): n is string => typeof n === 'string' && isTrackFileName(n)) : [])
}

/** Add track files to the ones kept for good (see keptTracks). Writes meta.json only when one is new; how many were. */
export function keepTracksForGood(names: readonly string[]): number {
  const s = db()
  const kept = keptTracks()
  const added = [...new Set(names)].filter((n) => isTrackFileName(n) && !kept.has(n))
  if (!added.length) return 0
  s.write('meta', { ...s.read<Record<string, unknown>>('meta', {}), keepTracks: [...kept, ...added] }, true)
  return added.length
}

function trackFilesIn(dir: string): string[] {
  try {
    return existsSync(dir) ? readdirSync(dir).filter(isTrackFileName) : []
  } catch {
    return []
  }
}

/** the track files in tracks/ */
export const trackFilesOnDisk = (): string[] => trackFilesIn(join(dataRoot(), TRACKS_DIR))
/** the copies kept beside the backups (backups/tracks/, not its gone-<day> folders) */
export const trackFilesInMirror = (): string[] => trackFilesIn(trackMirrorDir())

/** First launch: seed sample songs, themes, teams and a Sunday template so the app is useful immediately. */
export function seedIfEmpty(): void {
  const s = db()
  const meta = s.read<{ seeded?: number }>('meta', {})
  ensurePin()
  if (meta.seeded) {
    // a data folder set up before whose songs or plans file is gone (deleted, a half-finished sync), with no .bak:
    // the operator must be told (an empty song library with no word would look like every song was deleted)
    for (const name of ['songs', 'plans'] as const) {
      if (s.loadedAs(name) === 'missing') {
        log.warn(`${name} file missing from a data folder that had it`)
        s.problems.push({ name, kind: 'missing' })
      }
    }
    // make sure built-in themes are always present (they may be updated between versions)
    const themes = s.list<Theme>('themes')
    const custom = themes.filter((t) => !t.builtIn)
    const next = [...DEFAULT_THEMES, ...custom]
    // only when something changed: a write on every start would count as "new data" for the hourly backup
    if (JSON.stringify(next) !== JSON.stringify(themes)) s.write('themes', next)
    return
  }
  const sampleSongs = !s.list('songs').length
  if (sampleSongs) s.write('songs', SAMPLE_SONGS)
  s.write('themes', DEFAULT_THEMES)
  if (!s.list('teams').length) s.write('teams', DEFAULT_TEAMS)
  if (!s.list('plans').length) s.write('plans', [sampleTemplate()])
  s.write('meta', { ...meta, seeded: Date.now(), schemaVersion: SCHEMA_VERSION }, true)
  if (sampleSongs) {
    // tracks already here belong to songs this list doesn't have (see keptTracks)
    const kept = keepTracksForGood(trackFilesOnDisk())
    if (kept) log.warn('sample songs added while tracks/ already holds backing tracks: they are kept', kept)
  }
  s.flush()
}

export function getTheme(id?: string): Theme {
  const themes = db().list<Theme>('themes')
  return themes.find((t) => t.id === id) || themes.find((t) => t.id === getSettings().defaultThemeId) || DEFAULT_THEMES[0]
}
