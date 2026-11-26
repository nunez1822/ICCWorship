import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Song, VoicePreset } from '@shared/types'
import type { StereoCheck } from '@shared/vocalRemoval'
import { songName } from '@shared/slides'
import { useApp, toastError } from '../../store'
import { songEdited } from '../../liveControl'
import { Modal, Seg, confirmDel } from '../../../components/ui'
import { AUDIO_EXT, fileName, toMediaUrl } from '../../../lib/media'
import { decodeAudio, MAX_MINUTES, readSource, TrackError, TrackJob } from '../../../lib/audioTrack'
import { slidesTimingKey, songToSlides } from '@shared/slides'
import { TimingModal } from './TimingModal'

/**
 * Song editor → Backing track: one compact row. A track is an instrumental the congregation sings with when there
 * are no musicians; it plays under the lyrics (through the projector window) when the song goes live.
 */
export function BackingTrackCard({ song }: { song: Song }) {
  const { t } = useTranslation()
  const s = useApp()
  const [adding, setAdding] = useState(false)
  const [timing, setTiming] = useState<null | 'record' | 'edit'>(null)
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
            <TimingBadge song={song} />
            <button className="btn sm" onClick={() => setTiming('record')} title={t('timing.recordHelp')}>
              ⏱ {t('timing.record')}
            </button>
            {track.timings && (
              <button className="btn sm" onClick={() => setTiming('edit')}>
                {t('timing.edit')}
              </button>
            )}
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
      {timing && track && <TimingModal song={song} edit={timing === 'edit'} onClose={() => setTiming(null)} />}
    </>
  )
}

/** "timing ✓" when recorded timing fits the song's slides, "timing out of date" after a layout change */
function TimingBadge({ song }: { song: Song }) {
  const { t } = useTranslation()
  const ccli = useApp((s) => s.settings.ccliLicense)
  const tr = song.track
  if (!tr?.timings) return null
  const slides = songToSlides(song, { ccliLicense: ccli })
  const ok = tr.timingsKey === slidesTimingKey(slides) && tr.timings.length === slides.length
  return (
    <span className="pill" style={ok ? undefined : { color: 'var(--warn)' }} title={ok ? t('timing.okHelp') : t('timing.oldHelp')}>
      {ok ? `⏱ ${t('timing.ok')}` : `⚠ ${t('timing.old')}`}
    </span>
  )
}

type Phase = { kind: 'pick' } | { kind: 'working'; label: string; fraction?: number }
type Source = { path: string; name: string } | { url: string; name: string }
/** the loaded song in the worker, for one source (kept while the operator tries presets and listens) */
type Loaded = { key: string; job: TrackJob; channels: number; stereo: StereoCheck }

const PRESETS: VoicePreset[] = ['less', 'normal', 'more']
const keyOf = (s: Source) => ('path' in s ? `p:${s.path}` : `u:${s.url}`)

function AddTrackModal({ song, onClose }: { song: Song; onClose: () => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const audioItems = s.media.filter((m) => m.kind === 'audio')
  const [source, setSource] = useState<Source | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'pick' })
  const [mode, setMode] = useState<'choose' | 'voice'>('choose')
  const [preset, setPreset] = useState<VoicePreset>('normal')
  const [info, setInfo] = useState<{ channels: number; stereo: StereoCheck } | null>(null)
  const loaded = useRef<Loaded | null>(null)
  const somethingLive = !!s.live && (s.live.slideIndex >= 0 || !!s.live.video?.playing)
  const ab = useAbPreview()

  useEffect(
    () => () => {
      loaded.current?.job.dispose()
      ab.stop()
    },
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- on close only
    []
  )

  const working = phase.kind === 'working'
  const close = () => {
    if (working) {
      if (!window.confirm(t('track.confirmCancel'))) return
      loaded.current?.job.cancel()
    }
    onClose()
  }

  const pick = (src: Source | null) => {
    ab.stop()
    loaded.current?.job.dispose()
    loaded.current = null
    setInfo(null)
    setMode('choose')
    setSource(src)
  }

  const choose = async () => {
    const [p] = await window.api.files.open({ filters: [{ name: t('track.source'), extensions: AUDIO_EXT }] })
    if (p) pick({ path: p, name: fileName(p) })
  }

  const fail = (e: unknown) => {
    if (e instanceof TrackError && e.code === 'canceled') return
    const code = e instanceof TrackError ? e.code : 'failed'
    window.api.app.log('warn', `backing track not made: ${code}`)
    s.toast(t(`track.err.${code}`, { max: MAX_MINUTES }), 'err', 10_000)
    setPhase({ kind: 'pick' })
    // the worker may hold half-processed audio now: read the file again next time
    loaded.current?.job.dispose()
    loaded.current = null
  }

  /** read and decode the chosen file into a worker (once per file) */
  const load = async (src: Source): Promise<Loaded> => {
    if (loaded.current?.key === keyOf(src)) return loaded.current
    setPhase({ kind: 'working', label: t('track.reading') })
    const job = new TrackJob()
    try {
      const bytes = await readSource('path' in src ? { path: src.path } : { url: src.url })
      const decoded = await decodeAudio(bytes)
      const stereo = await job.load(decoded)
      const l: Loaded = { key: keyOf(src), job, channels: decoded.channels, stereo }
      loaded.current = l
      setInfo({ channels: l.channels, stereo })
      return l
    } catch (e) {
      job.dispose()
      throw e
    }
  }

  /** encode (removing the voice first if asked) → store → attach to the song; the old file goes once unused */
  const save = async (voice?: VoicePreset) => {
    if (!source) return
    ab.stop()
    try {
      const l = await load(source)
      const label = (f: number, ph?: 'voice' | 'encode') =>
        ph === 'voice' ? t('track.voice.removing', { pct: Math.round(f * 100) }) : t('track.encoding', { pct: Math.round(f * 100) })
      setPhase({ kind: 'working', label: label(0, voice ? 'voice' : 'encode'), fraction: 0 })
      const { ogg, removedRatio } = await l.job.encode((f, ph) => setPhase({ kind: 'working', label: label(f, ph), fraction: f }), voice)
      // the audio in the worker is changed now: a second save reads the file again
      l.job.dispose()
      loaded.current = null
      const url = await window.api.tracks.save(song.id, ogg)
      // the song as it is NOW (it may have been edited while the track was being made)
      const cur = useApp.getState().songs.find((x) => x.id === song.id)
      if (!cur) {
        await window.api.tracks.prune(song.id) // deleted meanwhile: don't leave the new file behind
        s.toast(t('track.songGone'), 'err')
        return onClose()
      }
      // a new file has other timing: recorded timing doesn't carry over
      const track = voice ? { url, sourceName: source.name, vocalsRemoved: true, preset: voice } : { url, sourceName: source.name, vocalsRemoved: false }
      await s.save('songs', { ...cur, track, updatedAt: Date.now() })
      await window.api.tracks.prune(song.id)
      songEdited(song.id)
      s.toast(t('track.saved'))
      if (voice && removedRatio !== undefined && removedRatio < 0.02) s.toast(t('track.voice.little'), 'info', 12_000)
      if (voice && removedRatio !== undefined && removedRatio > 0.85) s.toast(t('track.voice.almostAll'), 'err', 12_000)
      onClose()
    } catch (e) {
      fail(e)
    }
  }

  /** "No — remove the voice": load the file and check it has real stereo before offering the settings */
  const startVoice = async () => {
    if (!source) return
    try {
      await load(source)
      setPhase({ kind: 'pick' })
      setMode('voice')
    } catch (e) {
      fail(e)
    }
  }

  const listen = async () => {
    if (ab.playing) return ab.stop()
    if (!source) return
    try {
      const l = await load(source)
      setPhase({ kind: 'working', label: t('track.voice.preparing') })
      const p = await l.job.preview(preset)
      setPhase({ kind: 'pick' })
      await ab.play(p.original, p.processed)
    } catch (e) {
      fail(e)
    }
  }

  const canRemove = !!info && info.channels > 1 && info.stereo !== 'not-stereo'
  return (
    <Modal title={`🎵 ${t('track.modalTitle')}`} onClose={close} dismissable={false}>
      <div className="col" style={{ gap: 14, minWidth: 480, maxWidth: 560 }}>
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
                  pick(m ? { url: toMediaUrl(m.path), name: m.name } : null)
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

        {source && !working && mode === 'choose' && (
          <div className="col" style={{ gap: 8 }}>
            <b>{t('track.question')}</b>
            <div className="row wrap">
              <button className="btn primary" onClick={() => void save()}>
                ✓ {t('track.useAsIs')}
              </button>
              <button className="btn" onClick={() => void startVoice()}>
                🎤✂ {t('track.removeVoice')}
              </button>
            </div>
            <div className="small muted">{t('track.useAsIsHelp')}</div>
            <div className="small muted">{t('track.removeVoiceHelp')}</div>
          </div>
        )}

        {source && !working && mode === 'voice' && info && (
          <div className="col" style={{ gap: 10 }}>
            <b>🎤✂ {t('track.removeVoice')}</b>
            {info.channels < 2 && (
              <div className="small" role="alert" style={{ color: 'var(--live)' }}>
                {t('track.voice.mono')}
              </div>
            )}
            {info.channels > 1 && info.stereo === 'not-stereo' && (
              <div className="small" role="alert" style={{ color: 'var(--live)' }}>
                {t('track.voice.notStereo')}
              </div>
            )}
            {canRemove && (
              <>
                {info.stereo === 'narrow' && (
                  <div className="small" style={{ color: 'var(--warn)' }}>
                    ⚠ {t('track.voice.narrow')}
                  </div>
                )}
                <div className="row wrap">
                  <span className="small">{t('track.voice.amount')}</span>
                  <Seg<VoicePreset>
                    value={preset}
                    onChange={(v) => {
                      ab.stop()
                      setPreset(v)
                    }}
                    options={PRESETS.map((p) => ({ value: p, label: t(`track.voice.${p}`) }))}
                  />
                </div>
                <div className="row wrap">
                  <button className="btn" onClick={() => void listen()} title={t('track.headphones')}>
                    {ab.playing ? `⏹ ${t('track.stop')}` : `▶ ${t('track.voice.preview')}`}
                  </button>
                  {ab.playing && (
                    <Seg<'original' | 'processed'>
                      value={ab.hearing}
                      onChange={ab.hear}
                      options={[
                        { value: 'original', label: t('track.voice.original') },
                        { value: 'processed', label: t('track.voice.without') }
                      ]}
                    />
                  )}
                </div>
                <div>
                  <button className="btn primary" onClick={() => void save(preset)}>
                    ✓ {t('track.voice.save')}
                  </button>
                </div>
              </>
            )}
            <div className="small muted">{t('track.voice.limits')}</div>
            <div>
              <button className="btn sm ghost" onClick={() => setMode('choose')}>
                ← {t('track.voice.back')}
              </button>
            </div>
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

/**
 * The A/B preview: the original and the "without voice" excerpt start together, and the switch crossfades between
 * them in 10 ms — the same moment of the song, so the difference is easy to hear. Plays on this computer's default
 * output (the modal says to use headphones during a service).
 */
function useAbPreview() {
  const ctx = useRef<AudioContext | null>(null)
  const nodes = useRef<{ srcs: AudioBufferSourceNode[]; gains: GainNode[] } | null>(null)
  const [playing, setPlaying] = useState(false)
  const [hearing, setHearing] = useState<'original' | 'processed'>('processed')
  const hearingRef = useRef(hearing)
  hearingRef.current = hearing

  const stop = () => {
    for (const n of nodes.current?.srcs ?? []) {
      n.onended = null
      try {
        n.stop()
      } catch {
        /* not started */
      }
    }
    nodes.current = null
    setPlaying(false)
  }

  const apply = (which: 'original' | 'processed') => {
    const c = ctx.current
    const g = nodes.current?.gains
    if (!c || !g) return
    g[0].gain.setTargetAtTime(which === 'original' ? 1 : 0, c.currentTime, 0.003)
    g[1].gain.setTargetAtTime(which === 'processed' ? 1 : 0, c.currentTime, 0.003)
  }

  const play = async (original: [Float32Array, Float32Array], processed: [Float32Array, Float32Array]) => {
    stop()
    const c = (ctx.current ??= new AudioContext({ sampleRate: 48000 }))
    if (c.state === 'suspended') await c.resume()
    const buffer = (pair: [Float32Array, Float32Array]) => {
      const b = c.createBuffer(2, pair[0].length, 48000)
      b.copyToChannel(pair[0] as Float32Array<ArrayBuffer>, 0)
      b.copyToChannel(pair[1] as Float32Array<ArrayBuffer>, 1)
      return b
    }
    const when = c.currentTime + 0.05
    const srcs: AudioBufferSourceNode[] = []
    const gains: GainNode[] = []
    for (const [i, pair] of [original, processed].entries()) {
      const src = c.createBufferSource()
      src.buffer = buffer(pair)
      const g = c.createGain()
      g.gain.value = (i === 0) === (hearingRef.current === 'original') ? 1 : 0
      src.connect(g).connect(c.destination)
      src.start(when)
      srcs.push(src)
      gains.push(g)
    }
    srcs[0].onended = () => stop()
    nodes.current = { srcs, gains }
    setPlaying(true)
  }

  const hear = (which: 'original' | 'processed') => {
    setHearing(which)
    apply(which)
  }

  return { playing, hearing, play, stop, hear }
}
