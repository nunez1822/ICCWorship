import { create } from 'zustand'
import type {
  BibleVersionInfo,
  LiveState,
  MediaItem,
  Person,
  PrayerRequest,
  Presentation,
  ServicePlan,
  Settings,
  Song,
  Team,
  Theme
} from '@shared/types'
import i18n from '../i18n'
import { mediaUrlToPath } from '../lib/media'
import { localDate } from '@shared/dates'

export type Page = 'live' | 'plans' | 'songs' | 'bible' | 'media' | 'themes' | 'people' | 'reports' | 'settings'

type Coll = 'songs' | 'plans' | 'media' | 'presentations' | 'themes' | 'people' | 'teams' | 'prayer'

interface Toast {
  id: number
  text: string
  kind: 'ok' | 'err' | 'info'
}

interface AppState {
  ready: boolean
  page: Page
  settings: Settings
  songs: Song[]
  plans: ServicePlan[]
  media: MediaItem[]
  presentations: Presentation[]
  themes: Theme[]
  people: Person[]
  teams: Team[]
  prayer: PrayerRequest[]
  bibles: BibleVersionInfo[]
  live: LiveState | null
  progress: LiveState['videoProgress']
  activePlanId?: string
  selectedItemId?: string
  outputOpen: boolean
  toasts: Toast[]
  /** request from another page to open an editor (e.g. edit song from Live) */
  focus?: { page: Page; id: string }

  load: () => Promise<void>
  setPage: (p: Page, focusId?: string) => void
  save: <T extends { id: string }>(c: Coll, item: T) => Promise<T>
  remove: (c: Coll, id: string) => Promise<void>
  reload: (c: Coll) => Promise<void>
  setSettings: (patch: Partial<Settings>) => Promise<void>
  refreshBibles: () => Promise<void>
  setActivePlan: (id?: string) => void
  selectItem: (id?: string) => void
  toast: (text: string, kind?: Toast['kind'], ms?: number) => void
}

let toastId = 0

/** Tell the operator why a live video/image isn't showing: missing file or unplayable. */
export async function reportMediaProblem(url: string | undefined, toast: AppState['toast']): Promise<void> {
  const path = mediaUrlToPath(url)
  if (!path) return
  const [exists] = await window.api.files.exists([path])
  toast(exists ? i18n.t('errors.mediaUnplayable') : i18n.t('errors.mediaMissing', { file: path }), 'err', 10_000)
}

/** Fill in missing fields so an incomplete record (older version, hand-edited backup,
 *  third-party import) can't crash the editor with e.g. `undefined.join`. */
function normalizeSong(x: Song): Song {
  return { ...x, title: x.title ?? '', tags: x.tags ?? [], sections: (x.sections ?? []).map((z) => ({ ...z, en: z.en ?? '', es: z.es ?? '' })), arrangement: x.arrangement ?? [], linesPerSlide: x.linesPerSlide || 4 }
}
let listening = false

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  page: 'live',
  settings: undefined as unknown as Settings,
  songs: [],
  plans: [],
  media: [],
  presentations: [],
  themes: [],
  people: [],
  teams: [],
  prayer: [],
  bibles: [],
  live: null,
  progress: undefined,
  outputOpen: false,
  toasts: [],

  async load() {
    const api = window.api
    const [settings, songs, plans, media, presentations, themes, people, teams, prayer, bibles, live, out] = await Promise.all([
      api.settings.get(),
      api.db.list<Song>('songs'),
      api.db.list<ServicePlan>('plans'),
      api.db.list<MediaItem>('media'),
      api.db.list<Presentation>('presentations'),
      api.db.list<Theme>('themes'),
      api.db.list<Person>('people'),
      api.db.list<Team>('teams'),
      api.db.list<PrayerRequest>('prayer'),
      api.bible.versions(),
      api.live.get(),
      api.output.status()
    ])
    void i18n.changeLanguage(settings.uiLang)
    document.documentElement.lang = settings.uiLang
    document.documentElement.dataset.theme = settings.operatorTheme
    // default active plan: next upcoming (or most recent) non-template plan
    const today = localDate()
    const real = plans.filter((p) => !p.isTemplate).sort((a, b) => a.date.localeCompare(b.date))
    const active = real.find((p) => p.date >= today) || real[real.length - 1]
    set({
      ready: true,
      settings,
      songs: songs.map(normalizeSong),
      plans,
      media,
      presentations,
      themes,
      people,
      teams,
      prayer,
      bibles,
      live,
      outputOpen: out.open,
      activePlanId: live.planId || active?.id
    })
    if (!listening) {
      listening = true
      api.live.onState((s) => set({ live: s }))
      api.live.onProgress((p) => {
        const wasError = get().progress?.error
        set({ progress: p })
        if (p?.error && !wasError) void reportMediaProblem(get().live?.video?.src || get().live?.slides[get().live?.slideIndex ?? -1]?.media, get().toast)
      })
      api.output.onStatus((s) => set({ outputOpen: s.open }))
      api.db.onWriteError((e) => get().toast(i18n.t('errors.saveFailed', { what: e.name, reason: e.message }), 'err'))
      // safety net: an action that fails without its own error handling (e.g. saving a
      // file to a folder that no longer exists) must not fail silently
      window.addEventListener('unhandledrejection', (ev) => {
        const msg = String((ev.reason as Error)?.message || ev.reason || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
        get().toast(`⚠ ${msg || i18n.t('errors.generic')}`, 'err', 8000)
      })
    }
    // damaged data files found at startup: say so (and where the damaged copy was kept)
    for (const p of await api.db.problems()) {
      get().toast(i18n.t(p.kind === 'recovered' ? 'errors.dataRecovered' : 'errors.dataUnreadable', { what: p.name, file: p.savedAs || '' }), 'err', 30_000)
    }
  },

  setPage(page, focusId) {
    set({ page, focus: focusId ? { page, id: focusId } : undefined })
  },

  async save(c, item) {
    // optimistic: update the UI synchronously so controlled inputs never lose keystrokes
    set((s) => {
      const list = s[c] as unknown as { id: string }[]
      const i = list.findIndex((x) => x.id === item.id)
      const next = [...list]
      if (i >= 0) next[i] = item
      else next.push(item)
      return { [c]: next } as Partial<AppState>
    })
    return window.api.db.upsert(c, item)
  },

  async remove(c, id) {
    await window.api.db.remove(c, id)
    set((s) => ({ [c]: (s[c] as unknown as { id: string }[]).filter((x) => x.id !== id) }) as Partial<AppState>)
  },

  async reload(c) {
    const list = await window.api.db.list(c)
    set({ [c]: c === 'songs' ? (list as Song[]).map(normalizeSong) : list } as Partial<AppState>)
  },

  async setSettings(patch) {
    const s = await window.api.settings.set(patch)
    if (patch.uiLang) {
      void i18n.changeLanguage(s.uiLang)
      document.documentElement.lang = s.uiLang
    }
    if (patch.operatorTheme) document.documentElement.dataset.theme = s.operatorTheme
    set({ settings: s })
  },

  async refreshBibles() {
    set({ bibles: await window.api.bible.versions() })
  },

  setActivePlan(id) {
    set({ activePlanId: id, selectedItemId: undefined })
  },

  selectItem(id) {
    set({ selectedItemId: id })
  },

  toast(text, kind = 'ok', ms) {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms ?? (kind === 'err' ? 6000 : 4500))
  }
}))

export const t = (key: string, opts?: Record<string, unknown>): string => i18n.t(key, opts ?? {}) as string
