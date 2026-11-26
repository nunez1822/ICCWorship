import { createRoot } from 'react-dom/client'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import '../i18n'
import { pickLangs } from '@shared/slides'
import { MAX_MESSAGE_LENGTH } from '@shared/security'
import type { DisplayLang } from '@shared/types'
import { safeMediaSrc, useLiveFeed } from '../lib/liveFeed'
import { rememberPin, usePin } from '../lib/pin'
import { ErrorBoundary } from '../components/ErrorBoundary'
import './remote.css'

const ICON: Record<string, string> = {
  song: '🎵',
  scripture: '📖',
  announcement: '📣',
  media: '🎬',
  presentation: '🖼️',
  countdown: '⏱️',
  notes: '📝',
  header: '🔖',
  blank: '⬛',
  prayer: '🙏'
}

/** Phone remote — big thumb-friendly buttons, works on any phone browser on the church Wi-Fi */
function Remote() {
  const { t } = useTranslation()
  const [pin, setPin] = usePin()
  const [entry, setEntry] = useState('')
  const { state, status, send, lockedSec } = useLiveFeed('remote', pin)
  const [tab, setTab] = useState<'slides' | 'plan' | 'msg'>('slides')
  const [msg, setMsg] = useState('')
  const [stageMsg, setStageMsg] = useState('')

  if (status === 'badpin' || !pin) {
    return (
      <div className="r-pin">
        <div className="r-logo">✝</div>
        <h1>ICCWorship</h1>
        <p>{t('remote.enterPin')}</p>
        <input
          inputMode="numeric"
          maxLength={6}
          value={entry}
          onChange={(e) => setEntry(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          autoFocus
        />
        {pin && status === 'badpin' && <div className="r-err">{lockedSec ? t('remote.locked', { seconds: lockedSec }) : t('remote.wrongPin')}</div>}
        <button className="r-btn primary" onClick={submit}>
          {t('remote.connect')}
        </button>
      </div>
    )
  }

  function submit() {
    rememberPin(entry)
    // Re-submitting the same PIN (e.g. after a lockout) must still reconnect.
    if (entry === pin) {
      setPin('')
      setTimeout(() => setPin(entry), 0)
    } else setPin(entry)
  }

  if (!state) return <div className="r-pin">{status === 'offline' ? t('remote.offline') : status === 'full' ? t('remote.full') : '…'}</div>

  const cur = state.slideIndex >= 0 ? state.slides[state.slideIndex] : undefined
  const txt = pickLangs(cur?.text, state.displayLang, state.bilingualOrder)
  const title = pickLangs(cur?.title, state.displayLang, state.bilingualOrder)

  const online = status === 'online'
  return (
    <div className={`r ${online ? '' : 'is-offline'}`}>
      {!online && <div className="r-offline">⚠ {t(status === 'full' ? 'remote.full' : 'remote.offline')}</div>}
      <header className="r-head">
        <span className={`r-dot ${status === 'online' ? 'on' : ''}`} />
        <div className="r-title">
          <div className="small">{state.planTitle || 'ICCWorship'}</div>
          <b>{state.itemTitle || '—'}</b>
        </div>
        <div className="r-seg">
          {(['es', 'en', 'both'] as DisplayLang[]).map((l) => (
            <button key={l} className={state.displayLang === l ? 'on' : ''} onClick={() => send({ type: 'displayLang', value: l })}>
              {l === 'both' ? 'ES+EN' : l.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <div className={`r-preview ${state.layers.black ? 'black' : ''}`}>
        {state.layers.black ? (
          <span>⬛ {t('remote.black')}</span>
        ) : cur?.kind === 'image' && cur.media ? (
          <img src={safeMediaSrc(cur.media)} alt="" />
        ) : (
          <>
            {title.primary && <b>{title.primary}</b>}
            <div>{txt.primary || (cur ? cur.group || '' : '—')}</div>
            {txt.secondary && <div className="sec">{txt.secondary}</div>}
          </>
        )}
        <span className="r-count">{state.slides.length && state.slideIndex >= 0 ? `${state.slideIndex + 1}/${state.slides.length}` : ''}</span>
      </div>

      <div className="r-nav">
        <button className="r-btn big" onClick={() => send({ type: 'prev' })}>
          ◀
        </button>
        <button className="r-btn big primary" onClick={() => send({ type: 'next' })}>
          ▶
        </button>
      </div>
      <div className="r-grid">
        <button className={`r-btn ${state.layers.black ? 'on' : ''}`} onClick={() => send({ type: 'black' })}>
          ⬛ {t('live.black')}
        </button>
        <button className={`r-btn ${state.layers.clearText ? 'on' : ''}`} onClick={() => send({ type: 'clearText' })}>
          🔤 {t('live.clearText')}
        </button>
        <button className={`r-btn ${state.layers.logo ? 'on' : ''}`} onClick={() => send({ type: 'logo' })}>
          ✝ {t('live.logo')}
        </button>
        {state.video ? (
          <button className="r-btn" onClick={() => send({ type: 'videoToggle' })}>
            {state.video.playing ? '⏸' : '▶'} {t('remote.video')}
          </button>
        ) : (
          <button className="r-btn" onClick={() => send({ type: 'clearAll' })}>
            🧹 {t('live.clearAll')}
          </button>
        )}
      </div>

      <div className="r-tabs">
        <button className={tab === 'slides' ? 'on' : ''} onClick={() => setTab('slides')}>
          {t('remote.slides')}
        </button>
        <button className={tab === 'plan' ? 'on' : ''} onClick={() => setTab('plan')}>
          {t('remote.plan')}
        </button>
        <button className={tab === 'msg' ? 'on' : ''} onClick={() => setTab('msg')}>
          {t('remote.messages')}
        </button>
      </div>

      <div className="r-list">
        {tab === 'slides' &&
          state.slides.map((s, i) => {
            const p =
              pickLangs(s.text, state.displayLang, state.bilingualOrder).primary ||
              pickLangs(s.title, state.displayLang, state.bilingualOrder).primary ||
              s.group ||
              `#${i + 1}`
            return (
              <button key={s.id} className={`r-row ${i === state.slideIndex ? 'on' : ''}`} onClick={() => send({ type: 'gotoSlide', index: i })}>
                <span className="n">{i + 1}</span>
                <span className="t">
                  {s.group && <small>{s.group}</small>}
                  {p.split('\n')[0]}
                </span>
              </button>
            )
          })}
        {tab === 'plan' &&
          state.planItems.map((it, i) => (
            <button key={it.id} className={`r-row ${i === state.itemIndex ? 'on' : ''}`} onClick={() => send({ type: 'gotoItem', index: i })}>
              <span className="n">{ICON[it.type] || '•'}</span>
              <span className="t">
                {it.title}
                {it.person && <small>{it.person}</small>}
              </span>
            </button>
          ))}
        {tab === 'msg' && (
          <div className="r-msg">
            <label>{t('remote.screenMessage')}</label>
            <div className="r-inline">
              <input value={msg} maxLength={MAX_MESSAGE_LENGTH} onChange={(e) => setMsg(e.target.value)} placeholder={t('live.customMessage')} />
              <button className="r-btn primary" disabled={!msg.trim()} onClick={() => (send({ type: 'message', text: msg.trim() }), setMsg(''))}>
                {t('live.show')}
              </button>
            </div>
            <button className="r-btn" onClick={() => send({ type: 'clearMessage' })}>
              ✕ {t('remote.clearMessage')}
            </button>
            <label>{t('live.stageMsg')}</label>
            <div className="r-inline">
              <input value={stageMsg} maxLength={MAX_MESSAGE_LENGTH} onChange={(e) => setStageMsg(e.target.value)} placeholder={t('live.stagePlaceholder')} />
              <button className="r-btn primary" onClick={() => send({ type: 'stageMessage', text: stageMsg.trim() })}>
                {t('live.send')}
              </button>
            </div>
            <div className="r-quick">
              {['wrap', 'slow', 'repeat', 'louder'].map((k) => (
                <button key={k} className="r-btn" onClick={() => send({ type: 'stageMessage', text: t(`stageQuick.${k}`) })}>
                  {t(`stageQuick.${k}`)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary
    onError={(e) => console.error('remote page error', e)}
    fallback={() => (
      <div className="r-pin">
        <div className="r-logo">✝</div>
        <button className="r-btn primary" onClick={() => location.reload()}>
          ↻
        </button>
      </div>
    )}
  >
    <Remote />
  </ErrorBoundary>
)
