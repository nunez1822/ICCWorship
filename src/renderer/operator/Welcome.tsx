import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Lang } from '@shared/types'
import { useApp } from './store'
import { newPlanFrom } from './pages/PlansPage'
import { Seg, Field } from '../components/ui'

/** First-run welcome — bilingual, sets the church name and creates this Sunday's plan */
export function Welcome() {
  const { t } = useTranslation()
  const s = useApp()
  const [name, setName] = useState(s.settings.churchName === 'ICC' ? '' : s.settings.churchName)

  const finish = async () => {
    await s.setSettings({ firstRunDone: true, churchName: name.trim() || s.settings.churchName })
    // create this Sunday's plan from the template if there is no real plan yet
    if (!s.plans.some((p) => !p.isTemplate)) {
      const tpl = s.plans.find((p) => p.isTemplate)
      const plan = newPlanFrom(tpl, t('plans.defaultTitle'))
      await s.save('plans', plan)
      s.setActivePlan(plan.id)
    }
  }

  return (
    <div className="modal-back">
      <div className="modal" style={{ width: 'min(760px, calc(100vw - 40px))' }}>
        <div className="modal-body">
          <div className="welcome-hero">
            <div className="brand-mark" style={{ width: 64, height: 64, fontSize: 34, margin: '0 auto 12px', borderRadius: 16 }}>
              ✝
            </div>
            <h1 style={{ margin: '0 0 4px' }}>{t('welcome.title')}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {t('welcome.subtitle')}
            </p>
            <div style={{ margin: '16px 0 4px' }}>
              <Seg<Lang> value={s.settings.uiLang} onChange={(v) => void s.setSettings({ uiLang: v })} options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]} />
            </div>
          </div>
          <div className="feature-list">
            {['f1', 'f2', 'f3', 'f4', 'f5', 'f6'].map((k) => (
              <div key={k}>{t(`welcome.${k}`)}</div>
            ))}
          </div>
          <div style={{ marginTop: 18 }}>
            <Field label={t('settings.churchName')}>
              <input className="input big" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('welcome.churchPlaceholder')} onKeyDown={(e) => e.key === 'Enter' && void finish()} />
            </Field>
          </div>
          <p className="small muted" style={{ marginTop: 14 }}>
            {t('welcome.tip')}
          </p>
        </div>
        <div className="modal-foot">
          <button className="btn primary lg" onClick={() => void finish()}>
            {t('welcome.start')} →
          </button>
        </div>
      </div>
    </div>
  )
}
