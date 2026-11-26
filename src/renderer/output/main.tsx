import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { LiveState } from '@shared/types'
import { SlideView } from '../components/SlideView'
import { ErrorBoundary, errorSummary } from '../components/ErrorBoundary'
import { toMediaUrl } from '../lib/media'
import { applySink, playTestSound } from './sink'
import './output.css'
import '../lib/noDropNavigation'

/**
 * "#safe": main reloaded this page several times in a minute because it kept crashing — most likely the slide
 * itself breaks it. Show plain black until the operator presses "Restart projector".
 */
const SAFE_MODE = location.hash.includes('safe')

/** how long a backing track fades out when it leaves the screen (Esc, another item) instead of cutting off */
const FADE_MS = 1000

type TrackEntry = { key: string; src: string; fading: boolean }

/** The projector window. Renders exactly what main says is live, and plays videos and backing tracks with sound. */
function Output() {
  const [state, setState] = useState<LiveState | null>(null)
  const video = useRef<HTMLMediaElement | null>(null)
  /** the backing track's hidden <audio> (a song's slides are text: never at the same time as a slide video) */
  const audio = useRef<HTMLMediaElement | null>(null)
  const lastSeek = useRef(0)
  const stateRef = useRef<LiveState | null>(null)
  stateRef.current = state
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    void window.api.live.get().then(setState)
    return window.api.live.onState(setState)
  }, [])

  // Settings → Screens → Test sound
  useEffect(() => window.api.output.onTestSound(() => void playTestSound(stateRef.current?.audioOutput)), [])

  // the sound output was changed in Settings: move what is playing there now
  const outputKey = `${state?.audioOutput?.id || ''}|${state?.audioOutput?.label || ''}`
  useEffect(() => {
    for (const el of [video.current, audio.current]) if (el) void applySink(el, stateRef.current?.audioOutput)
  }, [outputKey])

  // Backing tracks: the live one, plus ones fading out. A track that leaves (Esc, another item) keeps its element
  // — same key, so React keeps the very same <audio> — and fades out over a second instead of cutting off.
  const [tracks, setTracks] = useState<TrackEntry[]>([])
  const trackSrc = state?.video?.track ? state.video.src : undefined
  const trackKey = trackSrc ? `${state?.itemId ?? ''}|${trackSrc}` : null
  useEffect(() => {
    setTracks((prev) => {
      const others = prev.filter((t) => t.key !== trackKey).map((t) => (t.fading ? t : { ...t, fading: true }))
      if (!trackKey || !trackSrc) return others
      // the same track back during its fade (Esc, then Space at once): it continues instead of a second copy
      const again = prev.find((t) => t.key === trackKey)
      return [...others, again ? { ...again, fading: false } : { key: trackKey, src: trackSrc, fading: false }]
    })
  }, [trackKey, trackSrc])
  useEffect(() => {
    if (!tracks.some((t) => t.fading)) return
    const timer = setTimeout(() => setTracks((p) => p.filter((t) => !t.fading)), FADE_MS + 200)
    return () => clearTimeout(timer)
  }, [tracks])

  // hide expired messages
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // drive the <video> (or the backing track's <audio>) from live state
  useEffect(() => {
    const vs = state?.video
    // A new track arrives in the same render as its state, before its <audio> mounts: audio.current is still the
    // previous song's element (about to fade). Only drive the element of the live track; the new one applies the
    // state itself when it attaches.
    const v = vs?.track ? (audio.current?.dataset.track === trackKey ? audio.current : null) : video.current
    if (!v || !vs) return
    v.loop = vs.loop
    v.volume = Math.max(0, Math.min(1, vs.volume))
    if (vs.seekSeq !== lastSeek.current) {
      lastSeek.current = vs.seekSeq
      if (vs.seekSeq > 0) v.currentTime = vs.seekTo
    }
    if (vs.playing && v.paused) void play(v)
    if (!vs.playing && !v.paused) v.pause()
    // The same broken video put live again keeps this <video> (same src: no new load, no new
    // error event) while the operator reset its progress — report the error again, so the
    // operator is told every time instead of only the first.
    if (v.error && !state?.videoProgress?.error) window.api.live.videoProgress({ current: 0, duration: 0, error: true })
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- the error flag is read as a snapshot; re-running on it would replay play/pause
  }, [state?.video, state?.seq])

  /** play through the chosen sound output: switch the device first (not a split second on the wrong speakers),
   *  then play — unless the operator paused or moved on meanwhile */
  const play = useCallback(async (el: HTMLMediaElement) => {
    await applySink(el, stateRef.current?.audioOutput)
    if (stateRef.current?.video?.playing && el.paused && el.isConnected) await el.play().catch(() => {})
  }, [])

  // Stable on purpose: a new callback each render made React detach and re-attach the
  // <video> on every state change, which reset lastSeek and jumped the video back to
  // the last seek point (and paused it there when it ended).
  const attach = useCallback(
    (el: HTMLMediaElement | null, ref: RefObject<HTMLMediaElement | null>) => {
      if (ref.current === el) return
      ref.current = el
      if (!el) return
      const src = () => el.getAttribute('src') || undefined
      // A pending operator seek (e.g. Space after Esc resumes the video where it was) still applies: the effect
      // above sees seekSeq ≠ 0.
      lastSeek.current = 0
      // After the projector restarted (crash, freeze) the video must continue where it was, not start over with
      // sound in the middle of the service. Main still knows the last position the old page reported — so don't
      // report this element's position until we've checked (it would overwrite that), then jump there if needed.
      // Going live with a video clears that position, so a video started on purpose always starts from 0.
      let resuming = true
      void window.api.live.get().then((s) => {
        const p = s.videoProgress
        if (!p || p.error || p.src !== src() || !(p.current > 0) || (p.duration > 0 && p.current >= p.duration - 0.5)) {
          resuming = false
          return
        }
        const go = () => {
          el.currentTime = p.current
          resuming = false
        }
        if (el.readyState >= 1) go()
        else el.addEventListener('loadedmetadata', go, { once: true })
      })
      // a failed load still fires timeupdate (position reset to 0): don't let it wipe the error
      // stamped with what this page was playing (item, seek), so a late report can't move the lyrics backwards
      const stamp = () => ({ src: src(), itemId: stateRef.current?.itemId, seekSeq: lastSeek.current })
      el.ontimeupdate = () => !el.error && !resuming && window.api.live.videoProgress({ current: el.currentTime, duration: el.duration || 0, ...stamp() })
      el.onloadedmetadata = () => !el.error && !resuming && window.api.live.videoProgress({ current: 0, duration: el.duration || 0, load: true, ...stamp() })
      // tell the operator instead of sitting on a black frame that claims to be "playing"
      el.onerror = () => window.api.live.videoProgress({ current: 0, duration: 0, error: true, src: src() })
      el.onended = () => {
        const s = stateRef.current
        if (!el.loop && s?.video) window.api.live.videoEnded({ itemId: s.itemId, src: s.video.src })
      }
      const vs = stateRef.current?.video
      if (vs) {
        // an element mounted after the state arrived (a backing track's <audio>) applies a pending seek itself
        if (vs.seekSeq !== lastSeek.current) {
          lastSeek.current = vs.seekSeq
          if (vs.seekSeq > 0) el.currentTime = vs.seekTo
        }
        el.loop = vs.loop
        el.volume = vs.volume
        if (vs.playing) void play(el)
      }
    },
    [play]
  )
  const attachVideo = useCallback((el: HTMLVideoElement | null) => attach(el, video), [attach])
  const attachTrack = useCallback((el: HTMLMediaElement) => attach(el, audio), [attach])
  /** a fading track stops reporting: its progress and "ended" belong to what is live now */
  const detachTrack = useCallback((el: HTMLMediaElement) => {
    if (audio.current === el) audio.current = null
    el.ontimeupdate = el.onloadedmetadata = el.onerror = el.onended = null
  }, [])

  if (SAFE_MODE || !state?.theme) return <div className="output-root" />
  const slide = state.slideIndex >= 0 ? state.slides[state.slideIndex] : null
  const msg = state.message && (!state.message.until || state.message.until > now) ? state.message.text : undefined
  return (
    <div className="output-root">
      {/* a slide that can't be drawn shows black and tells the operator; the next slide renders normally */}
      <ErrorBoundary
        resetKeys={[state.seq]}
        fallback={() => <div className="output-root" />}
        onError={(e) => window.api.win.renderError(`${errorSummary(e)} (slide ${slide?.kind || 'none'})`)}
      >
        <SlideView
          slide={slide}
          theme={state.theme}
          background={state.background}
          displayLang={state.displayLang}
          order={state.bilingualOrder}
          layers={state.layers}
          message={msg}
          logoUrl={state.logoPath ? toMediaUrl(state.logoPath) : undefined}
          churchName={state.churchName}
          isOutput
          videoRef={attachVideo}
        />
      </ErrorBoundary>
      {/* outside the error boundary: a slide that can't be drawn must not stop the music */}
      {tracks.map((t) => (
        <TrackAudio key={t.key} trackKey={t.key} src={t.src} fading={t.fading} attach={attachTrack} detach={detachTrack} />
      ))}
    </div>
  )
}

/** One backing track's hidden <audio>: live (driven like the video), or fading out and then pausing. */
function TrackAudio(p: { trackKey: string; src: string; fading: boolean; attach: (el: HTMLMediaElement) => void; detach: (el: HTMLMediaElement) => void }) {
  const el = useRef<HTMLAudioElement>(null)
  const { attach, detach, fading } = p
  useEffect(() => {
    const a = el.current
    if (!a) return
    if (!fading) {
      attach(a)
      return () => detach(a)
    }
    detach(a)
    const v0 = a.volume
    const t0 = performance.now()
    const timer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / FADE_MS)
      a.volume = v0 * (1 - k)
      if (k >= 1) {
        clearInterval(timer)
        a.pause()
      }
    }, 30)
    return () => clearInterval(timer)
  }, [fading, attach, detach])
  return <audio ref={el} src={p.src} preload="auto" data-track={p.trackKey} />
}

// "I'm alive" for main's freeze detection (a frozen page stops sending it and gets restarted)
setInterval(() => window.api.win.alive(), 1000)

createRoot(document.getElementById('root')!, {
  // an error outside the slide's boundary would leave a blank page that never recovers: ask main to reload it
  onUncaughtError: (e) => window.api.win.fatal(errorSummary(e))
}).render(<Output />)
