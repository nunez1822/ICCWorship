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
  toast: (text: string, kind?: Toast['kind']) => void
}

let toastId = 0
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
    const today = new Date().toISOString().slice(0, 10)
    const real = plans.filter((p) => !p.isTemplate).sort((a, b) => a.date.localeCompare(b.date))
    const active = real.find((p) => p.date >= today) || real[real.length - 1]
    set({
      ready: true,
      settings,
      songs,
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
      api.live.onProgress((p) => set({ progress: p }))
      api.output.onStatus((s) => set({ outputOpen: s.open }))
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
    set({ [c]: list } as Partial<AppState>)
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

  toast(text, kind = 'ok') {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'err' ? 6000 : 3200)
  }
}))

export const t = (key: string, opts?: Record<string, unknown>): string => i18n.t(key, opts ?? {}) as string
