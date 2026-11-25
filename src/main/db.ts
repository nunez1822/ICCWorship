import { JsonStore } from './jsonStore'
import { dataDir } from './paths'
import { newPin } from './pathGuard'
import { DEFAULT_SETTINGS, DEFAULT_TEAMS, DEFAULT_THEMES, SAMPLE_SONGS, sampleTemplate } from '@shared/defaults'
import type { Settings, Theme } from '@shared/types'
import { checkSchema, runMigrations, SCHEMA_VERSION } from '@shared/migrations'

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

export type DataStatus = { readOnly: boolean; newerSchema?: number; migrated?: string[] }
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
    const migrated = runMigrations(
      {
        read: (name) => s.read<unknown>(name, (COLLECTIONS as readonly string[]).includes(name) ? [] : {}),
        write: (name, value) => s.write(name, value, true)
      },
      check.from
    )
    s.flush()
    status = { readOnly: false, migrated }
  }
  return status
}

/** First launch: seed sample songs, themes, teams and a Sunday template so the app is useful immediately. */
export function seedIfEmpty(): void {
  const s = db()
  const meta = s.read<{ seeded?: number }>('meta', {})
  // An empty PIN would let anyone on the Wi-Fi use the remote. Settings from before PINs existed, a damaged
  // settings file or an old backup can lack one: always make sure there is one.
  if (!getSettings().remotePin) setSettings({ remotePin: newPin() })
  if (meta.seeded) {
    // make sure built-in themes are always present (they may be updated between versions)
    const themes = s.list<Theme>('themes')
    const custom = themes.filter((t) => !t.builtIn)
    const next = [...DEFAULT_THEMES, ...custom]
    // only when something changed: a write on every start would count as "new data" for the hourly backup
    if (JSON.stringify(next) !== JSON.stringify(themes)) s.write('themes', next)
    return
  }
  if (!s.list('songs').length) s.write('songs', SAMPLE_SONGS)
  s.write('themes', DEFAULT_THEMES)
  if (!s.list('teams').length) s.write('teams', DEFAULT_TEAMS)
  if (!s.list('plans').length) s.write('plans', [sampleTemplate()])
  s.write('meta', { ...meta, seeded: Date.now(), schemaVersion: SCHEMA_VERSION }, true)
  s.flush()
}

export function getTheme(id?: string): Theme {
  const themes = db().list<Theme>('themes')
  return themes.find((t) => t.id === id) || themes.find((t) => t.id === getSettings().defaultThemeId) || DEFAULT_THEMES[0]
}
