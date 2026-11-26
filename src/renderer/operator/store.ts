import { create } from 'zustand'
import type { BibleVersionInfo, LiveState, MediaItem, Person, PrayerRequest, Presentation, ServicePlan, Settings, Song, Team, Theme } from '@shared/types'
import i18n from '../i18n'
import { localDate } from '@shared/dates'
import { loggableError } from '@shared/loggableError'
import { normalizeTrack } from '@shared/tracks'

export type Page = 'live' | 'plans' | 'songs' | 'bible' | 'media' | 'themes' | 'people' | 'reports' | 'settings'

type Coll = 'songs' | 'plans' | 'media' | 'presentations' | 'themes' | 'people' | 'teams' | 'prayer'

interface Toast {
  id: number
  text: string
  kind: 'ok' | 'err' | 'info'
  /** a button on the toast, e.g. "Download" for an update */
  action?: { label: string; run: () => void }
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
  toast: (text: string, kind?: Toast['kind'], ms?: number, action?: Toast['action']) => void
  /** closes a toast now (its button was used) */
  dismissToast: (id: number) => void
  /** readOnly: the data was written by a newer ICCWorship; nothing is saved this session */
  dataStatus?: { readOnly: boolean; newerSchema?: number; upgradeFailed?: boolean; locked?: boolean }
}

let toastId = 0
/** when each visible toast goes away, and its timer */
const toastTimers = new Map<number, { until: number; timer: ReturnType<typeof setTimeout> }>()

/** Tell the operator why a live video/image isn't showing: missing file or unplayable. */
export async function reportMediaProblem(url: string | undefined, toast: AppState['toast']): Promise<void> {
  if (!url?.startsWith('media://')) return
  const [st] = await window.api.files.mediaStatus([url])
  if (!st?.path) return
  toast(st.exists ? i18n.t('errors.mediaUnplayable') : i18n.t('errors.mediaMissing', { file: st.path }), 'err', 10_000)
}

/** Fill in missing fields so an incomplete record (older version, hand-edited backup,
 *  third-party import) can't crash the editor with e.g. `undefined.join`. */
function normalizeSong(x: Song): Song {
  return {
    ...x,
    title: x.title ?? '',
    tags: x.tags ?? [],
    sections: (x.sections ?? []).map((z) => ({ ...z, en: z.en ?? '', es: z.es ?? '' })),
    arrangement: x.arrangement ?? [],
    linesPerSlide: x.linesPerSlide || 4,
    // keeps fields it doesn't know (a newer version's), drops broken timing
    track: normalizeTrack(x.track)
  }
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
      api.output.onStatus((s) => {
        // the projector window plays all sound: closing it mid-video / mid-song stops the sound — say so
        if (!s.open && get().outputOpen && get().live?.video?.playing) get().toast(i18n.t('live.outputClosedSound'), 'err', 10_000)
        set({ outputOpen: s.open })
      })
      api.db.onWriteError((e) => get().toast(i18n.t('errors.saveFailed', { what: e.name, reason: e.message }), 'err'))
      // safety net: an action that fails without its own error handling (e.g. saving a
      // file to a folder that no longer exists) must not fail silently
      window.addEventListener('unhandledrejection', (ev) => {
        toastError(ev.reason)
        api.app.log('warn', `unhandled rejection: ${loggableError(ev.reason)}`)
      })
      // what main reports: windows restarted after a crash, updates, diagnostics…
      api.app.onEvent((e) => {
        const toast = get().toast
        if (e.type === 'mainError') toast(i18n.t('recovery.mainError'), 'err', 15_000)
        else if (e.type === 'windowRecovered') {
          if (e.window === 'stage') toast(i18n.t('recovery.stageRestarted'), 'info', 10_000)
          else if (e.safe) toast(i18n.t('recovery.projectorSafe'), 'err', 120_000)
          else toast(i18n.t('recovery.projectorRestarted'), 'info', 10_000)
        } else if (e.type === 'windowFailed') toast(i18n.t(e.window === 'output' ? 'recovery.projectorFailed' : 'recovery.stageFailed'), 'err', 120_000)
        else if (e.type === 'renderError') toast(i18n.t(e.window === 'stage' ? 'recovery.stageRenderError' : 'recovery.renderError'), 'err', 10_000)
        else if (e.type === 'gpuCrashed') toast(i18n.t('recovery.gpuCrashed'), 'err', 30_000)
        else if (e.type === 'update')
          toast(i18n.t('updates.available', { version: e.latest }), 'info', 30_000, {
            label: i18n.t('updates.download'),
            run: () => void api.app.openRelease(e.url)
          })
        else if (e.type === 'updateReady')
          toast(i18n.t('updates.ready', { version: e.version }), 'info', 60_000, {
            label: i18n.t('updates.restartNow'),
            run: () => void installUpdate(toast)
          })
        else if (e.type === 'updateInstallFailed') toast(i18n.t(e.reason === 'live' ? 'updates.notWhileLive' : 'updates.installFailed'), 'err', 15_000)
        else if (e.type === 'diagnostics') toast(i18n.t(e.ok ? 'about.diagSaved' : 'about.diagFailed'), e.ok ? 'ok' : 'err')
        else if (e.type === 'openFailed') toast(i18n.t(e.what === 'logs' ? 'about.openLogsFailed' : 'about.noticesMissing'), 'err')
        else if (e.type === 'soundOutputMissing') toast(i18n.t('errors.soundOutputMissing', { label: e.label || '?' }), 'err', 15_000)
      })
    }
    // damaged data files found at startup: say so (and where the damaged copy was kept)
    for (const p of await api.db.problems()) {
      get().toast(i18n.t(p.kind === 'recovered' ? 'errors.dataRecovered' : 'errors.dataUnreadable', { what: p.name, file: p.savedAs || '' }), 'err', 30_000)
    }
    // data written by a newer ICCWorship: shown as a banner (App)
    set({ dataStatus: await api.app.dataStatus() })
    // this window was restarted after a crash or a freeze: what the operator has to know
    for (const n of await api.app.notices()) {
      if (n === 'portableFallback') get().toast(i18n.t('data.portableFallback'), 'err', 30_000)
      if (n === 'portableDocuments') get().toast(i18n.t('data.portableDocuments'), 'info', 60_000)
      if (n === 'portableDocumentsAlso') get().toast(i18n.t('data.portableDocumentsAlso'), 'info', 60_000)
      if (n !== 'operatorRecovered') continue
      get().toast(i18n.t('recovery.operatorRecovered'), 'err', 30_000)
      // the music played on while this window was down: the lyrics catch up with it (see followTick)
      afterRecovery.followCatchUp = true
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
    let s: Settings
    try {
      s = await window.api.settings.set(patch)
    } catch (e) {
      toastError(e) // e.g. the server couldn't restart on a new port: never fail silently
      return
    }
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

  toast(text, kind = 'ok', ms, action) {
    const duration = ms ?? (kind === 'err' ? 6000 : 4500)
    const hide = (id: number, after: number) => {
      const prev = toastTimers.get(id)
      if (prev) clearTimeout(prev.timer)
      const timer = setTimeout(() => {
        toastTimers.delete(id)
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
      }, after)
      toastTimers.set(id, { until: Date.now() + after, timer })
    }
    // the same message twice in a row (one action reported by two checks, a double click) is shown once — but a
    // repeat keeps it up for the full time again (a failure that happens again must not vanish a second later)
    const same = get().toasts.find((x) => x.text === text)
    if (same) {
      const left = (toastTimers.get(same.id)?.until ?? 0) - Date.now()
      hide(same.id, Math.max(left, duration))
      // an error repeating an info message with the same text is shown as an error
      if (kind === 'err' && same.kind !== 'err') set((s) => ({ toasts: s.toasts.map((t) => (t.id === same.id ? { ...t, kind } : t)) }))
      return
    }
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, text, kind, action }] }))
    hide(id, duration)
  },

  dismissToast(id) {
    const prev = toastTimers.get(id)
    if (prev) clearTimeout(prev.timer)
    toastTimers.delete(id)
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  }
}))

/** The message of an Error (or error-like object from IPC) or string, without Electron's "Error invoking remote
 *  method…" prefix; '' for anything else. */
function errorMessage(e: unknown): string {
  const raw = typeof e === 'string' ? e : typeof (e as Error | null)?.message === 'string' ? (e as Error).message : ''
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/** Did main refuse because the data is open read-only (written by a newer ICCWorship)? */
export const isReadOnlyError = (e: unknown): boolean => errorMessage(e) === 'read-only'

const toastReadOnly = () => useApp.getState().toast(i18n.t('data.readOnlyAction'), 'err', 10_000)

/**
 * Before starting work that ends in a save (making a backing track takes a while): if the data is open read-only,
 * say so now and return true — don't let the operator wait for something that can't be kept.
 */
export function refuseWhileReadOnly(): boolean {
  if (!useApp.getState().dataStatus?.readOnly) return false
  toastReadOnly()
  return true
}

/** set when this window was restarted after a problem (read and cleared by liveControl's followTick) */
export const afterRecovery = { followCatchUp: false }

/** Tell the operator an action failed (instead of failing silently). */
export function toastError(e: unknown): void {
  // anything that isn't an error or a string gets the generic message, never "[object Object]"
  const msg = errorMessage(e)
  // data from a newer version is open read-only: say what that means instead of a technical message
  if (msg === 'read-only') return toastReadOnly()
  useApp.getState().toast(`⚠ ${msg || i18n.t('errors.generic')}`, 'err', 8000)
}

export const t = (key: string, opts?: Record<string, unknown>): string => i18n.t(key, opts ?? {}) as string

/** "Restart now" on a downloaded update: main refuses while something is on screen (it installs at close anyway) */
export async function installUpdate(toast: AppState['toast']): Promise<void> {
  const r = await window.api.app.installUpdate()
  if (!r.ok) toast(i18n.t(r.error === 'live' ? 'updates.notWhileLive' : r.error === 'off' ? 'updates.turnedOff' : 'updates.notReady'), 'err', 10_000)
}
