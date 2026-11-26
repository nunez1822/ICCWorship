import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import './pin.css'

/** "Enter the PIN" screen for pages opened from a phone, tablet or TV browser (the stage display). */
export function PinScreen({ pin, lockedSec, onSubmit }: { pin: string; lockedSec: number; onSubmit: (pin: string) => void }) {
  const { t } = useTranslation()
  const [entry, setEntry] = useState('')
  const submit = () => entry && onSubmit(entry)
  return (
    <div className="pin-screen">
      <div className="pin-logo">✝</div>
      <h1>ICCWorship</h1>
      <p>{t('remote.enterPin')}</p>
      <input
        inputMode="numeric"
        maxLength={6}
        value={entry}
        aria-label="PIN"
        onChange={(e) => setEntry(e.target.value.replace(/\D/g, ''))}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        autoFocus
      />
      {pin && <div className="pin-err">{lockedSec ? t('remote.locked', { seconds: lockedSec }) : t('remote.wrongPin')}</div>}
      <button className="pin-btn" onClick={submit}>
        {t('remote.connect')}
      </button>
    </div>
  )
}
