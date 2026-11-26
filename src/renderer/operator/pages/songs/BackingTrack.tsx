import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Song } from '@shared/types'
import { songName } from '@shared/slides'
import { useApp, toastError } from '../../store'
import { songEdited } from '../../liveControl'
import { Modal, confirmDel } from '../../../components/ui'
import { AUDIO_EXT, fileName, toMediaUrl } from '../../../lib/media'
import { decodeAudio, MAX_MINUTES, readSource, TrackError, TrackJob } from '../../../lib/audioTrack'

/**
 * Song editor → Backing track: one compact row. A track is an instrumental the congregation sings with when there
 * are no musicians; it plays under the lyrics (through the projector window) when the song goes live.
 */
export function BackingTrackCard({ song }: { song: Song }) {
  const { t } = useTranslation()
  const s = useApp()
  const [adding, setAdding] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audio = useRef<HTMLAudioElement | null>(null)
  const track = song.track

  // stop the preview when the song changes or the editor closes
  useEffect(
    () => () => {
      audio.current?.pause()
      audio.current = null
    },
    [track?.url]
  )

  const preview = () => {
    if (!track) return
    if (playing && audio.current) {
      audio.current.pause()
      setPlaying(false)
      return
    }
    const a = audio.current ?? new Audio(track.url)
    audio.current = a
    a.onended = () => setPlaying(false)
    a.onerror = () => {
      setPlaying(false)
      s.toast(t('errors.mediaUnplayable'), 'err')
    }
    void a
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false))
  }

  const remove = async () => {
    if (!track || !confirmDel(t('track.confirmRemove', { title: songName(song) }))) return
    audio.current?.pause()
    const cur = useApp.getState().songs.find((x) => x.id === song.id)
    if (!cur) return
    const { track: _old, ...rest } = cur
    try {
      await s.save('songs', { ...rest, updatedAt: Date.now() } as Song)
      await window.api.tracks.prune(song.id)
      songEdited(song.id)
      s.toast(t('track.removed'))
    } catch (e) {
      toastError(e)
    }
  }

  return (
    <>
      <div className="section-title" style={{ margin: '22px 0 8px' }}>
        🎵 {t('track.title')}
      </div>
      <div className="card row wrap" style={{ padding: 12, gap: 8 }}>
        {track ? (
          <>
            <button className="btn sm" onClick={preview} title={t('track.headphones')} aria-pressed={playing}>
              {playing ? `⏹ ${t('track.stop')}` : `▶ ${t('track.preview')}`}
            </button>
            <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={track.sourceName}>
              {track.sourceName || t('track.title')}
            </span>
            {track.vocalsRemoved && <span className="pill">{t('track.vocalsRemoved')}</span>}
            <button className="btn sm" onClick={() => setAdding(true)}>
              {t('track.replace')}
            </button>
            <button className="btn sm ghost" onClick={() => void remove()}>
              {t('track.remove')}
            </button>
          </>
        ) : (
          <>
            <span className="small muted" style={{ flex: 1 }}>
              {t('track.none')}
            </span>
            <button className="btn sm" onClick={() => setAdding(true)}>
              ＋ {t('track.add')}
            </button>
          </>
        )}
      </div>
      {adding && <AddTrackModal song={song} onClose={() => setAdding(false)} />}
    </>
  )
}

type Phase = { kind: 'pick' } | { kind: 'working'; label: string; fraction?: number }

function AddTrackModal({ song, onClose }: { song: Song; onClose: () => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const audioItems = s.media.filter((m) => m.kind === 'audio')
  const [source, setSource] = useState<{ path: string; name: string } | { url: string; name: string } | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' })
  const job = useRef<TrackJob | null>(null)
  const somethingLive = !!s.live && (s.live.slideIndex >= 0 || !!s.live.video?.playing)

  useEffect(() => () => job.current?.dispose(), [])

  const close = () => {
    if (phase.kind === 'working') {
      if (!window.confirm(t('track.confirmCancel'))) return
      job.current?.cancel()
    }
    onClose()
  }

  const choose = async () => {
    const [p] = await window.api.files.open({ filters: [{ name: t('track.source'), extensions: AUDIO_EXT }] })
    if (p) setSource({ path: p, name: fileName(p) })
  }

  const errorText = (e: unknown) => {
    const code = e instanceof TrackError ? e.code : 'failed'
    return t(`track.err.${code}`, { max: MAX_MINUTES })
  }

  /** read → decode → encode → store → attach to the song (the old track file goes once nothing uses it) */
  const make = async () => {
    if (!source) return
    const j = new TrackJob()
    job.current = j
    try {
      setPhase({ kind: 'working', label: t('track.reading') })
      const bytes = await readSource('path' in source ? { path: source.path } : { url: source.url })
      const decoded = await decodeAudio(bytes)
      await j.load(decoded)
      setPhase({ kind: 'working', label: t('track.encoding', { pct: 0 }), fraction: 0 })
      const ogg = await j.encode((f) => setPhase({ kind: 'working', label: t('track.encoding', { pct: Math.round(f * 100) }), fraction: f }))
      const url = await window.api.tracks.save(song.id, ogg)
      // the song as it is NOW (it may have been edited while the track was being made)
      const cur = useApp.getState().songs.find((x) => x.id === song.id)
      if (!cur) {
        await window.api.tracks.prune(song.id) // deleted meanwhile: don't leave the new file behind
        s.toast(t('track.songGone'), 'err')
        return onClose()
      }
      // a new file has other timing: recorded timing doesn't carry over
      await s.save('songs', { ...cur, track: { url, sourceName: source.name, vocalsRemoved: false }, updatedAt: Date.now() })
      await window.api.tracks.prune(song.id)
      songEdited(song.id)
      s.toast(t('track.saved'))
      onClose()
    } catch (e) {
      if (e instanceof TrackError && e.code === 'canceled') return
      window.api.app.log('warn', `backing track not made: ${e instanceof TrackError ? e.code : 'error'}`)
      s.toast(errorText(e), 'err', 10_000)
      setPhase({ kind: 'pick' })
    } finally {
      j.dispose()
      if (job.current === j) job.current = null
    }
  }

  const working = phase.kind === 'working'
  return (
    <Modal title={`🎵 ${t('track.modalTitle')}`} onClose={close} dismissable={false}>
      <div className="col" style={{ gap: 14, minWidth: 460 }}>
        <div className="col" style={{ gap: 6 }}>
          <b>{t('track.source')}</b>
          <div className="row wrap">
            <button className="btn" disabled={working} onClick={() => void choose()}>
              📂 {t('track.chooseFile')}
            </button>
            {audioItems.length > 0 && (
              <select
                className="select"
                disabled={working}
                value={source && 'url' in source ? source.url : ''}
                onChange={(e) => {
                  const m = audioItems.find((x) => toMediaUrl(x.path) === e.target.value)
                  setSource(m ? { url: toMediaUrl(m.path), name: m.name } : null)
                }}
                aria-label={t('track.fromLibrary')}
              >
                <option value="">{t('track.fromLibrary')}</option>
                {audioItems.map((m) => (
                  <option key={m.id} value={toMediaUrl(m.path)}>
                    🎧 {m.name}
                  </option>
                ))}
              </select>
            )}
          </div>
          {source && <div className="small">🎧 {source.name}</div>}
        </div>

        {source && !working && (
          <div className="col" style={{ gap: 8 }}>
            <b>{t('track.question')}</b>
            <div className="row wrap">
              <button className="btn primary" onClick={() => void make()}>
                ✓ {t('track.useAsIs')}
              </button>
            </div>
            <div className="small muted">{t('track.useAsIsHelp')}</div>
          </div>
        )}

        {working && (
          <div className="col" style={{ gap: 6 }} role="status">
            <div className="small">{phase.label}</div>
            <div className="progress">
              <div style={{ width: `${Math.round((phase.fraction ?? 0) * 100)}%` }} />
            </div>
            <div>
              <button className="btn sm" onClick={close}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}

        <div className="small muted">ℹ {t('track.notes')}</div>
        {somethingLive && (
          <div className="small" style={{ color: 'var(--warn)' }}>
            {t('track.liveWarning')}
          </div>
        )}
      </div>
    </Modal>
  )
}
