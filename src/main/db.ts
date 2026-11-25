import { JsonStore } from './jsonStore'
import { dataDir } from './paths'
import { newPin } from './pathGuard'
import { DEFAULT_SETTINGS, DEFAULT_TEAMS, DEFAULT_THEMES, SAMPLE_SONGS, sampleTemplate } from '@shared/defaults'
import type { Settings, Theme } from '@shared/types'

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
    s.write('themes', [...DEFAULT_THEMES, ...custom])
    return
  }
  if (!s.list('songs').length) s.write('songs', SAMPLE_SONGS)
  s.write('themes', DEFAULT_THEMES)
  if (!s.list('teams').length) s.write('teams', DEFAULT_TEAMS)
  if (!s.list('plans').length) s.write('plans', [sampleTemplate()])
  s.write('meta', { seeded: Date.now() }, true)
  s.flush()
}

export function getTheme(id?: string): Theme {
  const themes = db().list<Theme>('themes')
  return themes.find((t) => t.id === id) || themes.find((t) => t.id === getSettings().defaultThemeId) || DEFAULT_THEMES[0]
}
