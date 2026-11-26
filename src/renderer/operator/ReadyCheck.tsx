import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { preflight, verdict, type Check, type CheckAction } from '@shared/preflight'
import { Modal } from '../components/ui'
import { backupNow } from './backupNow'
import { gatherPreflight } from './preflight'
import { useApp } from './store'

const ICON = { ok: '✅', warn: '⚠️', error: '❌' } as const

/** a plan's `YYYY-MM-DD` date reads as a date in the app's language ("domingo, 22 de noviembre de 2026") */
function readable(params: Check['params'], lang: string | undefined) {
  const date = params?.date
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return params ?? {}
  const [y, m, d] = date.split('-').map(Number)
  try {
    return { ...params, date: new Date(y, m - 1, d).toLocaleDateString(lang || undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }
  } catch {
    return params ?? {}
  }
}

/** "Ready for Sunday?" (Live page → ✅): the pre-service checklist, with a button to fix each problem. */
export function ReadyCheck({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [busy, setBusy] = useState(false)
  // the Live page re-renders several times a second while a video plays (and passes a new onClose each time): the
  // check runs when opened and on "Check again" only, and an older run never overwrites a newer one's result
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const runId = useRef(0)

  const run = async () => {
    const id = ++runId.current
    setBusy(true)
    try {
      const result = preflight(await gatherPreflight())
      if (id === runId.current) setChecks(result)
    } catch (e) {
      if (id !== runId.current) return
      window.api.app.log('warn', `ready check failed: ${e instanceof Error ? e.name : 'error'}`)
      useApp.getState().toast(t('ready.failed'), 'err')
      closeRef.current()
    } finally {
      if (id === runId.current) setBusy(false)
    }
  }

  useEffect(() => {
    void run()
    const ids = runId // (a counter, not a DOM node: the same object at cleanup)
    return () => {
      ids.current++ // closed: drop a run still going
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- once, when the checklist opens
  }, [])

  const act = async (a: CheckAction) => {
    if (a === 'openOutput' || a === 'restartOutput') {
      const at = runId.current
      setBusy(true)
      try {
        await (a === 'openOutput' ? window.api.output.open() : window.api.output.restart())
      } catch (e) {
        window.api.app.log('warn', `ready check ${a} failed: ${e instanceof Error ? e.name : 'error'}`)
        useApp.getState().toast(t('ready.actFailed'), 'err')
      }
      // give the projector a moment to load, then look again (unless the list was closed or re-run meanwhile)
      return void setTimeout(() => {
        if (runId.current === at) void run()
      }, 800)
    }
    if (a === 'backupNow') {
      // the same messages as Settings → Backup (also when the media library or the tracks had to stay out)
      await backupNow()
      return void run()
    }
    onClose()
    if (a === 'plans') s.setPage('plans', s.activePlanId)
    // Settings opens at the section that fixes it (the sound output and the logo are under Screens)
    else s.setPage('settings', a === 'phone' ? 'remote' : 'screens')
  }

  const ACTION_LABEL: Record<CheckAction, string> = {
    openOutput: t('ready.actOpenOutput'),
    restartOutput: t('ready.actRestartOutput'),
    screens: t('ready.actSettings'),
    sound: t('ready.actSettings'),
    phone: t('ready.actSettings'),
    logo: t('ready.actSettings'),
    plans: t('ready.actPlan'),
    backupNow: t('ready.actBackup')
  }
  const overall = checks ? verdict(checks) : undefined

  return (
    <Modal
      title={<>✅ {t('ready.title')}</>}
      onClose={onClose}
      footer={
        <>
          <button className="btn" disabled={busy} onClick={() => void run()}>
            🔄 {t('ready.again')}
          </button>
          <button className="btn primary" onClick={onClose}>
            {t('ready.close')}
          </button>
        </>
      }
    >
      {!checks && <div className="muted">{t('ready.checking')}</div>}
      {overall && (
        <div className={`ready-verdict ${overall}`} role="status">
          {ICON[overall]} {t(`ready.verdict_${overall}`)}
        </div>
      )}
      {checks && (
        <ul className="ready-list">
          {checks.map((c) => (
            <li key={c.id} className={c.level}>
              <span className="ico" aria-hidden>
                {ICON[c.level]}
              </span>
              <span className="txt">{t(`ready.${c.key}`, readable(c.params, s.settings?.uiLang))}</span>
              {c.action && c.level !== 'ok' && (
                <button className="btn sm" disabled={busy} onClick={() => void act(c.action!)}>
                  {ACTION_LABEL[c.action]}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
