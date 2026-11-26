import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Song } from '@shared/types'
import { formatClock, slidesTimingKey, songToSlides } from '@shared/slides'
import { cleanTimings } from '@shared/tracks'
import { useApp, toastError } from '../../store'
import { songEdited } from '../../liveControl'
import { Modal } from '../../../components/ui'

/**
 * Record when each slide starts in the backing track (like ProPresenter's Timeline): play the track, press Space at
 * the first word of each slide. Then fine-tune any time. Live, the lyrics follow the music from then on.
 *
 * While this window is open it takes EVERY key the operator's shortcuts use (capture phase, before App sees them):
 * Space marking a slide must never also move the projector — even if a song is live right now.
 */
export function TimingModal({ song, edit, onClose }: { song: Song; edit: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const track = song.track!
  const slides = useMemo(() => songToSlides(song, { ccliLicense: s.settings.ccliLicense }), [song, s.settings.ccliLicense])
  const fits = track.timingsKey === slidesTimingKey(slides) && track.timings?.length === slides.length
  const [marks, setMarks] = useState<number[]>(edit && fits ? [...track.timings!] : [])
  const [phase, setPhase] = useState<'ready' | 'recording' | 'review'>(edit && fits ? 'review' : 'ready')
  const [now, setNow] = useState(0)
  const [rate, setRate] = useState(1)
  const audio = useRef<HTMLAudioElement | null>(null)
  const marksRef = useRef(marks)
  marksRef.current = marks
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  useEffect(() => {
    const a = new Audio(track.url)
    audio.current = a
    a.ontimeupdate = () => setNow(a.currentTime)
    a.onended = () => {
      if (phaseRef.current === 'recording') setPhase('review')
    }
    a.onerror = () => s.toast(t('errors.mediaUnplayable'), 'err')
    return () => {
      a.pause()
      a.src = ''
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- one player per open window
  }, [track.url])

  const mark = () => {
    const a = audio.current
    if (!a || phaseRef.current !== 'recording') return
    setMarks((m) => (m.length < slides.length ? [...m, Math.max(m.at(-1) ?? 0, a.currentTime)] : m))
  }
  const undo = () => setMarks((m) => m.slice(0, -1))

  // every shortcut key belongs to this window while it records (see the comment above)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest?.('input, textarea, select')
      if (e.key === 'Escape' || e.key === 'Tab' || (typing && phaseRef.current !== 'recording')) return // Modal / the field handle these
      e.stopPropagation() // never to the live shortcuts
      if (phaseRef.current !== 'recording') {
        // a focused button still works with Space / Enter; anything else does nothing here
        if (!(e.target as HTMLElement | null)?.closest?.('button')) e.preventDefault()
        return
      }
      e.preventDefault()
      if (e.repeat) return
      if ([' ', 'ArrowRight', 'ArrowDown', 'PageDown', 'Enter'].includes(e.key)) mark()
      else if (['Backspace', 'ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) undo()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- reads refs
  }, [])

  const start = () => {
    const a = audio.current
    if (!a) return
    setMarks([])
    a.currentTime = 0
    a.playbackRate = rate
    void a.play().catch(() => s.toast(t('errors.mediaUnplayable'), 'err'))
    setPhase('recording')
  }
  const finish = () => {
    audio.current?.pause()
    setPhase('review')
  }
  /** listen from 2 s before a slide's start (to check a cue) */
  const playFrom = (sec: number) => {
    const a = audio.current
    if (!a) return
    a.playbackRate = 1
    a.currentTime = Math.max(0, sec - 2)
    void a.play().catch(() => {})
  }
  const setTime = (i: number, sec: number) => setMarks((m) => m.map((x, j) => (j === i ? Math.max(0, Math.round(sec * 10) / 10) : x)))

  const valid = marks.length === slides.length && !!cleanTimings(marks)
  /** a time that isn't after the one before it (after −½ / +½ or typing): marked in red, and the reason Save is off */
  const outOfOrder = (i: number) => i > 0 && marks[i] !== undefined && marks[i] <= marks[i - 1]
  const save = async () => {
    const timings = cleanTimings(marks)
    if (!timings || timings.length !== slides.length) return
    const cur = useApp.getState().songs.find((x) => x.id === song.id)
    if (!cur?.track) return onClose()
    try {
      await s.save('songs', { ...cur, track: { ...cur.track, timings, timingsKey: slidesTimingKey(slides) }, updatedAt: Date.now() })
      songEdited(song.id)
      s.toast(t('timing.saved'))
      onClose()
    } catch (e) {
      toastError(e)
    }
  }
  const clear = async () => {
    const cur = useApp.getState().songs.find((x) => x.id === song.id)
    if (!cur?.track) return onClose()
    const { timings: _t, timingsKey: _k, ...rest } = cur.track
    await s.save('songs', { ...cur, track: rest, updatedAt: Date.now() })
    songEdited(song.id)
    onClose()
  }
  const close = () => {
    const changed = phase === 'recording' || (marks.length > 0 && JSON.stringify(marks) !== JSON.stringify(track.timings ?? []))
    if (changed && !window.confirm(t('timing.confirmClose'))) return
    onClose()
  }

  const at = marks.length - 1 // the slide on screen while recording (−1 = intro)
  const preview = (i: number) => {
    const sl = slides[i]
    const txt = sl?.text?.es || sl?.text?.en || ''
    return `${sl?.group ?? ''} — ${txt.split('\n')[0]}`
  }
  return (
    <Modal title={`⏱ ${t('timing.title')}`} onClose={close} dismissable={false} wide>
      <div className="col" style={{ gap: 12 }}>
        <div className="small muted">{t('timing.help')}</div>
        <div className="small muted">ℹ {t('track.headphones')}</div>
        {phase === 'ready' && (
          <div className="row wrap">
            <button className="btn primary" onClick={start}>
              ⏺ {t('timing.start')}
            </button>
            <label className="check small">
              {t('timing.speed')}
              <select className="select" value={rate} onChange={(e) => setRate(+e.target.value)}>
                <option value={1}>100%</option>
                <option value={0.75}>75%</option>
              </select>
            </label>
          </div>
        )}
        {phase === 'recording' && (
          <div className="col" style={{ gap: 8 }} role="status">
            <div className="row">
              <b style={{ fontVariantNumeric: 'tabular-nums' }}>{formatClock(now * 1000)}</b>
              <span className="pill live">⏺ {t('timing.recording')}</span>
              <span style={{ flex: 1 }} />
              <button className="btn sm" onClick={finish}>
                ⏹ {t('timing.stop')}
              </button>
            </div>
            <div className="card" style={{ padding: 10 }}>
              <div className="small muted">{t('timing.onScreen')}</div>
              <div>{at < 0 ? `🎵 ${t('timing.intro')}` : preview(at)}</div>
              {at + 1 < slides.length && (
                <div className="small muted" style={{ marginTop: 6 }}>
                  {t('timing.nextPress', { n: at + 2, total: slides.length })} {preview(at + 1)}
                </div>
              )}
              {at + 1 >= slides.length && <div className="small muted">{t('timing.allMarked')}</div>}
            </div>
            <div className="small muted">{t('timing.keys')}</div>
          </div>
        )}
        {phase === 'review' && (
          <div className="col" style={{ gap: 6 }}>
            {!valid && (
              <div className="small" style={{ color: 'var(--warn)' }} role="alert">
                ⚠ {marks.length === slides.length ? t('timing.outOfOrder') : t('timing.incomplete', { n: marks.length, total: slides.length })}
              </div>
            )}
            <div className="col" style={{ gap: 4, maxHeight: '50vh', overflow: 'auto' }}>
              {slides.map((sl, i) => (
                <div key={sl.id} className="row" style={{ gap: 6 }}>
                  <span className="small" style={{ width: 28, textAlign: 'right' }}>
                    {i + 1}
                  </span>
                  <span className="small" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {preview(i)}
                  </span>
                  {marks[i] !== undefined ? (
                    <>
                      <input
                        className="input"
                        style={{ width: 80, height: 28, ...(outOfOrder(i) ? { borderColor: 'var(--live)', color: 'var(--live)' } : {}) }}
                        aria-invalid={outOfOrder(i) || undefined}
                        type="number"
                        step={0.1}
                        min={0}
                        value={Math.round(marks[i] * 100) / 100}
                        aria-label={t('timing.startsAt', { n: i + 1 })}
                        onChange={(e) => setTime(i, +e.target.value)}
                      />
                      <button className="btn sm ghost" onClick={() => setTime(i, marks[i] - 0.5)} aria-label={t('timing.earlier')} title={t('timing.earlier')}>
                        −½
                      </button>
                      <button className="btn sm ghost" onClick={() => setTime(i, marks[i] + 0.5)} aria-label={t('timing.later')} title={t('timing.later')}>
                        +½
                      </button>
                      <button className="btn sm ghost" onClick={() => playFrom(marks[i])} title={t('timing.listenHere')}>
                        ▶
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn sm ghost"
                      onClick={() => setMarks((m) => (m.length === i ? [...m, Math.round(((m.at(-1) ?? 0) + 4) * 10) / 10] : m))}
                      disabled={marks.length !== i}
                    >
                      ＋ {t('timing.addTime')}
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="row wrap">
              <button className="btn primary" disabled={!valid} onClick={() => void save()}>
                ✓ {t('common.save')}
              </button>
              <button className="btn" onClick={() => setPhase('ready')}>
                ⏺ {t('timing.recordAgain')}
              </button>
              <button className="btn ghost" onClick={() => audio.current?.pause()}>
                ⏸
              </button>
              <span style={{ flex: 1 }} />
              {track.timings && (
                <button className="btn ghost" onClick={() => void clear()}>
                  {t('timing.clear')}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
