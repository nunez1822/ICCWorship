import { createRoot } from 'react-dom/client'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import '../i18n'
import { formatClock, pickLangs, stripChords } from '@shared/slides'
import type { Slide } from '@shared/types'
import { useLiveFeed } from '../lib/liveFeed'
import './stage.css'

/** Stage display for musicians and the preacher: current + next slide, clock, timers, chords, messages */
function Stage() {
  const { t } = useTranslation()
  const { state, progress, status } = useLiveFeed('stage')
  const [now, setNow] = useState(Date.now())
  const [chords, setChords] = useState(() => localStorage.getItem('stage-chords') === '1')
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(i)
  }, [])
  useEffect(() => {
    if (!state?.stageMessage) return
    setFlash(true)
    const tm = setTimeout(() => setFlash(false), 4000)
    return () => clearTimeout(tm)
  }, [state?.stageMessage?.seq])

  if (!state) return <div className="stage-wait">{status === 'offline' ? t('stage.offline') : '…'}</div>

  const cur = state.slideIndex >= 0 ? state.slides[state.slideIndex] : undefined
  const next = state.slideIndex + 1 < state.slides.length ? state.slides[state.slideIndex + 1] : undefined
  const nextItem = !next && state.itemIndex >= 0 ? state.planItems[state.itemIndex + 1] : undefined
  const planned = state.planItems.find((i) => i.id === state.itemId)?.durationMin || 0
  const itemMs = state.itemStartedAt ? now - state.itemStartedAt : 0
  const over = planned > 0 && itemMs > planned * 60_000
  const remainingVideo = progress?.duration ? (progress.duration - progress.current) * 1000 : 0
  const hasChords = !!(cur?.chords?.en || cur?.chords?.es)

  return (
    <div className="stage">
      {status === 'offline' && <div className="stage-offline">⚠ {t('stage.offline')}</div>}
      <header className="stage-top">
        <div className="stage-clock">{new Date(now).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
        <div className="stage-item">
          <div className="lbl">{t('stage.now')}</div>
          <div className="val">{state.itemTitle || '—'}</div>
        </div>
        {state.video && progress?.duration ? (
          <div className="stage-timer warn">
            <div className="lbl">🎬 {t('stage.videoLeft')}</div>
            <div className="val">{formatClock(remainingVideo)}</div>
          </div>
        ) : null}
        <div className={`stage-timer ${over ? 'over' : ''}`}>
          <div className="lbl">
            {t('stage.item')} {planned ? `/ ${planned}:00` : ''}
          </div>
          <div className="val">{state.itemStartedAt ? formatClock(itemMs) : '—'}</div>
        </div>
        <div className="stage-timer">
          <div className="lbl">{t('stage.service')}</div>
          <div className="val">{state.serviceStartedAt ? formatClock(now - state.serviceStartedAt) : '—'}</div>
        </div>
        {hasChords && (
          <button
            className={`stage-btn ${chords ? 'on' : ''}`}
            onClick={() => {
              localStorage.setItem('stage-chords', chords ? '0' : '1')
              setChords(!chords)
            }}
          >
            🎸
          </button>
        )}
      </header>
      {state.stageMessage && <div className={`stage-msg ${flash ? 'flash' : ''}`}>{state.stageMessage.text}</div>}
      <main className="stage-main">
        <section className="stage-current">
          {state.layers.black && <div className="stage-flag">⬛ {t('stage.black')}</div>}
          {state.layers.logo && !state.layers.black && <div className="stage-flag">✝ {t('stage.logo')}</div>}
          <StageSlide slide={cur} state={state} chords={chords && hasChords} big />
        </section>
        <aside className="stage-next">
          <div className="lbl">{t('stage.next')}</div>
          {next ? <StageSlide slide={next} state={state} chords={false} /> : <div className="next-item">{nextItem ? `⏭ ${nextItem.title}` : t('stage.end')}</div>}
          {cur?.notes && (
            <div className="stage-notes">
              <div className="lbl">📝</div>
              {cur.notes}
            </div>
          )}
          {state.itemNotes && <div className="stage-notes">{state.itemNotes}</div>}
        </aside>
      </main>
    </div>
  )
}

function StageSlide({ slide, state, chords, big }: { slide?: Slide; state: NonNullable<ReturnType<typeof useLiveFeed>['state']>; chords: boolean; big?: boolean }) {
  if (!slide) return <div className="stage-empty">—</div>
  if ((slide.kind === 'image' || slide.kind === 'video') && slide.media) {
    return slide.kind === 'image' ? <img className="stage-img" src={slide.media} alt="" /> : <div className="stage-empty">🎬 {slide.group}</div>
  }
  if (slide.kind === 'countdown') return <div className="stage-empty">⏱ {formatClock(Math.max(0, (slide.countdownTo || 0) - Date.now()))}</div>
  const src = chords && slide.chords ? slide.chords : slide.text
  const txt = pickLangs(src, state.displayLang === 'both' ? 'both' : state.displayLang, state.bilingualOrder)
  const title = pickLangs(slide.title, state.displayLang, state.bilingualOrder)
  return (
    <div className={`stage-text ${big ? 'big' : ''} ${chords ? 'chords' : ''}`}>
      {slide.group && big && <div className="stage-group">{slide.group}</div>}
      {title.primary && <div className="stage-title">{title.primary}</div>}
      <div className="p">{chords ? renderChords(txt.primary) : txt.primary}</div>
      {txt.secondary && <div className="s">{chords ? renderChords(txt.secondary) : txt.secondary}</div>}
    </div>
  )
}

/** Show chords above the lyrics: "[G]Amazing" → chord line + lyric line */
function renderChords(text?: string) {
  if (!text) return null
  return text.split('\n').map((line, i) => {
    if (!/\[[^\]]+\]/.test(line)) return <div key={i}>{line}</div>
    let chordLine = ''
    let lyric = ''
    const re = /\[([^\]]+)\]/g
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) {
      lyric += line.slice(last, m.index)
      chordLine = chordLine.padEnd(lyric.length, ' ') + m[1] + ' '
      last = m.index + m[0].length
    }
    lyric += line.slice(last)
    return (
      <div key={i} className="chord-pair">
        <div className="chord-line">{chordLine}</div>
        <div>{stripChords(lyric) || ' '}</div>
      </div>
    )
  })
}

createRoot(document.getElementById('root')!).render(<Stage />)
