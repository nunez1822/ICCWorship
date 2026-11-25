import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BilingualOrder, Lang } from '@shared/types'
import { uid } from '@shared/slides'
import { useApp } from '../store'
import { Field, Seg } from '../../components/ui'
import { IMAGE_EXT } from '../../lib/media'
import { updateLive } from '../liveControl'

export function SettingsPage() {
  const { t } = useTranslation()
  const s = useApp()
  const st = s.settings
  const [displays, setDisplays] = useState<{ id: number; label: string; width: number; height: number; primary: boolean }[]>([])
  const [server, setServer] = useState<Awaited<ReturnType<typeof window.api.server.info>> | null>(null)
  const [backups, setBackups] = useState<{ name: string; path: string; size: number; date: number }[]>([])
  const [info, setInfo] = useState<{ version: string; dataPath: string; electron: string } | null>(null)

  const refresh = () => {
    void window.api.displays.list().then(setDisplays)
    void window.api.server.info().then(setServer)
    void window.api.backup.list().then(setBackups)
  }
  useEffect(() => {
    refresh()
    void window.api.app.info().then(setInfo)
    const off = window.api.displays.onChange(refresh)
    const off2 = window.api.server.onStatus(() => void window.api.server.info().then(setServer))
    return () => {
      off()
      off2()
    }
  }, [])

  return (
    <div className="page">
      <div className="page-head">
        <h1>⚙️ {t('settings.title')}</h1>
      </div>
      <div className="grid2" style={{ alignItems: 'start', maxWidth: 1250 }}>
        <div className="col">
          <div className="card col">
            <h2>⛪ {t('settings.general')}</h2>
            <Field label={t('settings.churchName')}>
              <input className="input" value={st.churchName} onChange={(e) => void s.setSettings({ churchName: e.target.value })} />
            </Field>
            <div className="row wrap">
              <Field label={t('settings.appLanguage')}>
                <Seg<Lang> value={st.uiLang} onChange={(v) => void s.setSettings({ uiLang: v })} options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]} />
              </Field>
              <Field label={t('settings.appearance')}>
                <Seg value={st.operatorTheme} onChange={(v) => void s.setSettings({ operatorTheme: v })} options={[{ value: 'dark', label: `🌙 ${t('settings.dark')}` }, { value: 'light', label: `☀️ ${t('settings.light')}` }]} />
              </Field>
            </div>
            <Field label={t('settings.ccliLicense')}>
              <input className="input" value={st.ccliLicense || ''} onChange={(e) => void s.setSettings({ ccliLicense: e.target.value })} placeholder="1234567" />
            </Field>
          </div>

          <div className="card col">
            <h2>🖥️ {t('settings.screens')}</h2>
            <div className="small muted">{t('settings.screensHelp')}</div>
            {displays.map((d) => (
              <label key={d.id} className="check card" style={{ padding: 10 }}>
                <input
                  type="radio"
                  name="out"
                  checked={(st.outputDisplayId ?? displays.find((x) => !x.primary)?.id) === d.id}
                  onChange={() => void s.setSettings({ outputDisplayId: d.id })}
                />
                <span>
                  <b>{d.label}</b> · {d.width}×{d.height} {d.primary && <span className="pill">{t('settings.mainScreen')}</span>}
                </span>
              </label>
            ))}
            {displays.length < 2 && <div className="small" style={{ color: 'var(--warn)' }}>ℹ {t('settings.oneScreen')}</div>}
            <div className="row wrap">
              <button className="btn" onClick={() => (s.outputOpen ? window.api.output.close() : window.api.output.open())}>
                {s.outputOpen ? t('settings.closeOutput') : t('settings.openOutput')}
              </button>
              <button className="btn" onClick={() => window.api.output.replace()}>
                ↻ {t('settings.replaceOutput')}
              </button>
              <button className="btn" onClick={() => window.api.stage.open()}>
                🎤 {t('settings.openStage')}
              </button>
            </div>
            <label className="check">
              <input type="checkbox" checked={st.outputEnabled} onChange={(e) => void s.setSettings({ outputEnabled: e.target.checked })} /> {t('settings.openOnStart')}
            </label>
            <div className="row wrap">
              <Field label={t('settings.bilingualOrder')}>
                <Seg<BilingualOrder>
                  value={st.bilingualOrder}
                  onChange={(v) => {
                    void s.setSettings({ bilingualOrder: v })
                    void updateLive({ bilingualOrder: v })
                  }}
                  options={[
                    { value: 'es-first', label: t('settings.esFirst') },
                    { value: 'en-first', label: t('settings.enFirst') }
                  ]}
                />
              </Field>
            </div>
            <Field label={t('settings.logo')}>
              <div className="row">
                {st.logoPath ? <span className="small" style={{ flex: 1, wordBreak: 'break-all' }}>{st.logoPath}</span> : <span className="small muted" style={{ flex: 1 }}>{t('settings.noLogo')}</span>}
                <button
                  className="btn sm"
                  onClick={async () => {
                    const [p] = await window.api.files.open({ filters: [{ name: 'Image', extensions: IMAGE_EXT }] })
                    if (p) void s.setSettings({ logoPath: p })
                  }}
                >
                  📂 {t('settings.chooseLogo')}
                </button>
                {st.logoPath && (
                  <button className="btn sm ghost" onClick={() => void s.setSettings({ logoPath: '' })}>
                    ✕
                  </button>
                )}
              </div>
            </Field>
          </div>

          <div className="card col">
            <h2>💬 {t('settings.messages')}</h2>
            <div className="small muted">{t('settings.messagesHelp')}</div>
            {st.messageTemplates.map((m, i) => (
              <div key={m.id} className="row">
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={m.es}
                  placeholder="Español"
                  onChange={(e) => void s.setSettings({ messageTemplates: st.messageTemplates.map((x, j) => (j === i ? { ...x, es: e.target.value } : x)) })}
                />
                <input
                  className="input"
                  style={{ flex: 1 }}
                  value={m.en}
                  placeholder="English"
                  onChange={(e) => void s.setSettings({ messageTemplates: st.messageTemplates.map((x, j) => (j === i ? { ...x, en: e.target.value } : x)) })}
                />
                <button className="btn sm ghost" onClick={() => void s.setSettings({ messageTemplates: st.messageTemplates.filter((_, j) => j !== i) })}>
                  ✕
                </button>
              </div>
            ))}
            <div className="row">
              <button className="btn sm" onClick={() => void s.setSettings({ messageTemplates: [...st.messageTemplates, { id: uid(), en: '', es: '' }] })}>
                ＋ {t('settings.addTemplate')}
              </button>
              <span style={{ flex: 1 }} />
              <Field label={t('settings.messageSeconds')}>
                <input className="input" type="number" min={5} style={{ width: 90 }} value={st.messageSeconds} onChange={(e) => void s.setSettings({ messageSeconds: Math.max(5, +e.target.value) })} />
              </Field>
            </div>
          </div>
        </div>

        <div className="col">
          <div className="card col">
            <h2>📱 {t('settings.remote')}</h2>
            <div className="small muted">{t('settings.remoteHelp')}</div>
            <label className="check">
              <input type="checkbox" checked={st.serverEnabled} onChange={(e) => void s.setSettings({ serverEnabled: e.target.checked }).then(refresh)} /> {t('settings.enableRemote')}
            </label>
            {server && st.serverEnabled && (
              <div className="row" style={{ alignItems: 'flex-start', gap: 18 }}>
                {server.qr && (
                  <div className="qr">
                    <img src={server.qr} alt="QR" />
                  </div>
                )}
                <div className="col" style={{ gap: 6, minWidth: 0 }}>
                  <span className={`pill ${server.running ? 'ok' : 'warn'}`}>
                    <span className={`dot ${server.running ? 'on' : ''}`} /> {server.running ? t('settings.running') : t('settings.notRunning')}
                  </span>
                  <div className="small muted">{t('settings.scanQr')}</div>
                  {server.urls.map((u) => (
                    <div key={u} className="small">
                      📱 <b>{u}/remote</b>
                      <br />
                      🎤 <b>{u}/stage</b>
                    </div>
                  ))}
                  {!server.urls.length && <div className="small" style={{ color: 'var(--warn)' }}>{t('settings.noNetwork')}</div>}
                  <div className="row">
                    <span className="small">PIN:</span>
                    <b style={{ fontSize: 22, letterSpacing: 4 }}>{st.remotePin}</b>
                    <button className="btn sm" onClick={() => void s.setSettings({ remotePin: String(Math.floor(1000 + Math.random() * 9000)) }).then(refresh)}>
                      ↻
                    </button>
                  </div>
                  <div className="small muted">
                    {server.clients} {t('settings.connected')}
                  </div>
                </div>
              </div>
            )}
            <Field label={t('settings.port')}>
              <input className="input" type="number" style={{ width: 120 }} value={st.serverPort} onChange={(e) => void s.setSettings({ serverPort: +e.target.value || 7272 }).then(refresh)} />
            </Field>
            <div className="small muted">🛡️ {t('settings.firewall')}</div>
          </div>

          <div className="card col">
            <h2>💾 {t('settings.backup')}</h2>
            <div className="small muted">{t('settings.backupHelp')}</div>
            <div className="row wrap">
              <button
                className="btn primary"
                onClick={async () => {
                  const r = await window.api.backup.create()
                  if (r) s.toast(t('settings.backupDone', { files: r.files, size: (r.bytes / 1024 / 1024).toFixed(1) }))
                  refresh()
                }}
              >
                💾 {t('settings.backupNow')}
              </button>
              <button
                className="btn"
                onClick={async () => {
                  if (!window.confirm(t('settings.restoreConfirm'))) return
                  const r = await window.api.backup.restore()
                  if (r && !r.ok) s.toast(t('settings.restoreFailed'), 'err')
                }}
              >
                ♻️ {t('settings.restore')}
              </button>
              <button className="btn" onClick={() => window.api.app.openDataFolder()}>
                📂 {t('settings.openData')}
              </button>
            </div>
            {backups.length > 0 && (
              <details>
                <summary className="small" style={{ cursor: 'pointer' }}>
                  {t('settings.autoBackups', { count: backups.length })}
                </summary>
                {backups.map((b) => (
                  <div key={b.path} className="row small" style={{ padding: '4px 0' }}>
                    <span style={{ flex: 1 }}>{b.name}</span>
                    <span className="muted">{(b.size / 1024).toFixed(0)} KB</span>
                    <button
                      className="btn sm ghost"
                      onClick={async () => {
                        if (window.confirm(t('settings.restoreConfirm'))) {
                          const r = await window.api.backup.restore(b.path)
                          if (r && !r.ok) s.toast(t('settings.restoreFailed'), 'err')
                        }
                      }}
                    >
                      ♻️
                    </button>
                  </div>
                ))}
              </details>
            )}
          </div>

          <div className="card col">
            <h2>✝ {t('settings.about')}</h2>
            <div>
              <b>ICCWorship</b> {info?.version} · Electron {info?.electron}
            </div>
            <div className="small muted">{t('settings.aboutText')}</div>
            <div className="small muted">{t('settings.credits')}</div>
            <div className="small muted" style={{ wordBreak: 'break-all' }}>
              {t('settings.dataAt')} {info?.dataPath}
            </div>
            <div className="row">
              <button className="btn sm" onClick={() => void s.setSettings({ firstRunDone: false })}>
                👋 {t('settings.showWelcome')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
