import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { preflight, verdict, type Check, type CheckAction } from '@shared/preflight'
import { Modal } from '../components/ui'
import { gatherPreflight } from './preflight'
import { useApp } from './store'

const ICON = { ok: '✅', warn: '⚠️', error: '❌' } as const

/** "Ready for Sunday?" (Live page → ✅): the pre-service checklist, with a button to fix each problem. */
export function ReadyCheck({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [busy, setBusy] = useState(false)

  const run = useCallback(async () => {
    setBusy(true)
    try {
      setChecks(preflight(await gatherPreflight()))
    } catch (e) {
      window.api.app.log('warn', `ready check failed: ${e instanceof Error ? e.name : 'error'}`)
      useApp.getState().toast(t('ready.failed'), 'err')
      onClose()
    } finally {
      setBusy(false)
    }
  }, [onClose, t])

  useEffect(() => {
    void run()
  }, [run])

  const act = async (a: CheckAction) => {
    if (a === 'openOutput') {
      await window.api.output.open()
      return void setTimeout(() => void run(), 800)
    }
    if (a === 'backupNow') {
      const r = await window.api.backup.create()
      if (r && !r.ok) s.toast(t('ready.backupFailed'), 'err')
      return void run()
    }
    onClose()
    if (a === 'plans') s.setPage('plans', s.activePlanId)
    else s.setPage('settings')
  }

  const ACTION_LABEL: Record<CheckAction, string> = {
    openOutput: t('ready.actOpenOutput'),
    screens: t('ready.actSettings'),
    sound: t('ready.actSettings'),
    phone: t('ready.actSettings'),
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
              <span className="txt">{t(`ready.${c.key}`, c.params ?? {})}</span>
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
