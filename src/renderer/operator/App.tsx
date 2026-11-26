import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import { useApp, type Page } from './store'
import * as live from './liveControl'
import { LivePage } from './pages/LivePage'
import { PlansPage } from './pages/PlansPage'
import { SongsPage } from './pages/SongsPage'
import { BiblePage } from './pages/BiblePage'
import { MediaPage } from './pages/MediaPage'
import { ThemesPage } from './pages/ThemesPage'
import { PeoplePage } from './pages/PeoplePage'
import { ReportsPage } from './pages/ReportsPage'
import { SettingsPage } from './pages/SettingsPage'
import { Welcome } from './Welcome'
import { ShortcutsHelp } from './ShortcutsHelp'
import { Seg } from '../components/ui'
import { ErrorBoundary, errorSummary } from '../components/ErrorBoundary'
import type { DisplayLang } from '@shared/types'

const NAV: { id: Page; ico: string }[] = [
  { id: 'live', ico: '📺' },
  { id: 'plans', ico: '🗓️' },
  { id: 'songs', ico: '🎵' },
  { id: 'bible', ico: '📖' },
  { id: 'media', ico: '🎬' },
  { id: 'themes', ico: '🎨' },
  { id: 'people', ico: '👥' },
  { id: 'reports', ico: '📊' }
]

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function App() {
  const { t } = useTranslation()
  const ready = useApp((s) => s.ready)
  const page = useApp((s) => s.page)
  const setPage = useApp((s) => s.setPage)
  const settings = useApp((s) => s.settings)
  const setSettings = useApp((s) => s.setSettings)
  const liveState = useApp((s) => s.live)
  const outputOpen = useApp((s) => s.outputOpen)
  const toasts = useApp((s) => s.toasts)
  const dataStatus = useApp((s) => s.dataStatus)
  const [help, setHelp] = useState(false)
  const [clients, setClients] = useState(0)

  useEffect(() => {
    void useApp.getState().load()
    const off = window.api.live.onCommand(live.handleCommand)
    const offSettings = window.api.settings.onChange((s) => {
      useApp.setState({ settings: s })
      void i18n.changeLanguage(s.uiLang)
    })
    // Help menu items handled here (the rest of the app events become toasts in the store)
    const offMenu = window.api.app.onEvent((e) => {
      if (e.type !== 'menu') return
      if (e.action === 'shortcuts') setHelp(true)
      else setPage('settings')
    })
    return () => {
      off()
      offSettings()
      offMenu()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribe once; setPage is a stable store action
  }, [])

  useEffect(() => {
    const tick = setInterval(async () => {
      const info = await window.api.server.info()
      setClients(info.clients)
    }, 5000)
    return () => clearInterval(tick)
  }, [])

  // global keyboard shortcuts — work on every page unless typing in a field
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.altKey) return
      const k = e.key
      if (e.ctrlKey && (k === 'ArrowRight' || k === 'ArrowDown')) return void (e.preventDefault(), live.enqueue(() => live.nextItem()))
      if (e.ctrlKey && (k === 'ArrowLeft' || k === 'ArrowUp')) return void (e.preventDefault(), live.enqueue(() => live.prevItem()))
      if (e.ctrlKey || e.metaKey) return
      switch (k) {
        case ' ':
        case 'ArrowRight':
        case 'ArrowDown':
        case 'PageDown':
          e.preventDefault()
          void live.enqueue(() => live.next())
          break
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault()
          void live.enqueue(() => live.prev())
          break
        case 'b':
        case 'B':
        case '.':
          void live.enqueue(() => live.toggleLayer('black'))
          break
        case 'c':
        case 'C':
          void live.enqueue(() => live.toggleLayer('clearText'))
          break
        case 'l':
        case 'L':
          void live.enqueue(() => live.toggleLayer('logo'))
          break
        case 'p':
        case 'P':
          void live.enqueue(() => live.videoToggle())
          break
        case 'Escape':
          void live.enqueue(() => live.clearAll())
          break
        case '1':
          void live.enqueue(() => live.setDisplayLang('en'))
          break
        case '2':
          void live.enqueue(() => live.setDisplayLang('es'))
          break
        case '3':
          void live.enqueue(() => live.setDisplayLang('both'))
          break
        case '?':
        case 'F1':
          e.preventDefault()
          setHelp((h) => !h)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!ready) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <div className="brand-mark" style={{ width: 54, height: 54, fontSize: 28 }}>
          ✝
        </div>
      </div>
    )
  }

  // a cover (black / logo) is what the audience sees: its pill replaces ON AIR / Off air,
  // so the bar never says "Off air" over a black screen or "ON AIR" under the logo
  const cover = liveState?.layers.black ? 'black' : liveState?.layers.logo ? 'logo' : null
  const isLive = !!liveState && liveState.slideIndex >= 0 && !cover

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">✝</div>
          <div>
            ICCWorship
            <br />
            <small>{settings.churchName}</small>
          </div>
        </div>
        <div className="status-strip">
          {!cover && (
            <span className={`pill ${isLive ? 'live' : ''}`}>
              <span className={`dot ${isLive ? 'live' : ''}`} style={isLive ? { background: '#fff' } : undefined} /> {isLive ? t('top.onAir') : t('top.offAir')}
            </span>
          )}
          {liveState?.itemTitle && liveState.slideIndex >= 0 && <span className="pill">{liveState.itemTitle}</span>}
          {/* a cover is up: the audience does not see the slide the operator is moving through */}
          {cover === 'black' && (
            <span className="pill live" title={t('top.coverHelp')}>
              ⬛ {t('top.blackUp')}
            </span>
          )}
          {cover === 'logo' && (
            <span className="pill gold" title={t('top.coverHelp')}>
              ✝ {t('top.logoUp')}
            </span>
          )}
        </div>
        <div className="spacer" />
        <span className="small muted">{t('top.screen')}</span>
        <Seg<DisplayLang>
          value={liveState?.displayLang || settings.displayLang}
          onChange={(v) => void live.enqueue(() => live.setDisplayLang(v))}
          options={[
            { value: 'es', label: 'ES', title: '2' },
            { value: 'en', label: 'EN', title: '1' },
            { value: 'both', label: 'ES + EN', title: '3' }
          ]}
        />
        <button
          className={`btn sm ${outputOpen ? 'on' : ''}`}
          onClick={() => (outputOpen ? window.api.output.close() : window.api.output.open())}
          title={t('top.outputTip')}
        >
          🖥️ {outputOpen ? t('top.outputOn') : t('top.outputOff')}
        </button>
        <span className="pill" title={t('top.remotesTip')}>
          📱 {clients}
        </span>
        <span className="small muted">{t('top.app')}</span>
        <Seg
          value={settings.uiLang}
          onChange={(v) => void setSettings({ uiLang: v })}
          options={[
            { value: 'es', label: 'Español' },
            { value: 'en', label: 'English' }
          ]}
        />
        <button className="btn ghost icon-btn" onClick={() => setHelp(true)} title={t('help.title')}>
          ⌨️
        </button>
      </header>
      <nav className="nav">
        {NAV.map((n) => (
          <button key={n.id} className={page === n.id ? 'on' : ''} onClick={() => setPage(n.id)}>
            <span className="ico">{n.ico}</span>
            {t(`nav.${n.id}`)}
          </button>
        ))}
        <div className="grow" />
        <button className={page === 'settings' ? 'on' : ''} onClick={() => setPage('settings')}>
          <span className="ico">⚙️</span>
          {t('nav.settings')}
        </button>
      </nav>
      {dataStatus?.readOnly && (
        <div className="readonly-banner" role="alert">
          <span>⚠ {t(dataStatus.newerSchema ? 'data.readOnlyNewer' : 'data.readOnly')}</span>
          <button
            className="btn sm"
            onClick={() => void window.api.app.openBackups().then((ok) => ok || useApp.getState().toast(t('data.openBackupsFailed'), 'err'))}
          >
            📂 {t('data.openBackups')}
          </button>
        </div>
      )}
      <main className="main">
        {/* a bug on one page must not take the top bar, the shortcuts or the phone remote with it */}
        <ErrorBoundary
          resetKeys={[page]}
          onError={(e) => window.api.app.log('error', `${page} page: ${errorSummary(e)}`)}
          fallback={(reset) => (
            <div className="page">
              <div className="card col" style={{ maxWidth: 640 }}>
                <h2>⚠ {t('boundary.title')}</h2>
                <div>{t('boundary.body')}</div>
                <div className="row">
                  <button className="btn primary" onClick={reset}>
                    {t('boundary.retry')}
                  </button>
                  <button className="btn" onClick={() => location.reload()}>
                    ↻ {t('boundary.reload')}
                  </button>
                </div>
              </div>
            </div>
          )}
        >
          {page === 'live' && <LivePage />}
          {page === 'plans' && <PlansPage />}
          {page === 'songs' && <SongsPage />}
          {page === 'bible' && <BiblePage />}
          {page === 'media' && <MediaPage />}
          {page === 'themes' && <ThemesPage />}
          {page === 'people' && <PeoplePage />}
          {page === 'reports' && <ReportsPage />}
          {page === 'settings' && <SettingsPage />}
        </ErrorBoundary>
      </main>
      {!settings.firstRunDone && <Welcome />}
      {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
      <div className="toasts">
        {toasts.map((x) => (
          <div key={x.id} className={`toast ${x.kind}`}>
            {x.text}
            {x.action && (
              <button className="btn sm toast-action" onClick={x.action.run}>
                {x.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
