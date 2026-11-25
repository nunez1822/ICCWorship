import { createRoot } from 'react-dom/client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LiveState } from '@shared/types'
import { SlideView } from '../components/SlideView'
import { ErrorBoundary, errorSummary } from '../components/ErrorBoundary'
import { toMediaUrl } from '../lib/media'
import './output.css'
import '../lib/noDropNavigation'

/**
 * "#safe": main reloaded this page several times in a minute because it kept crashing — most likely the slide
 * itself breaks it. Show plain black until the operator presses "Restart projector".
 */
const SAFE_MODE = location.hash.includes('safe')

/** The projector window. Renders exactly what main says is live, and plays videos with sound. */
function Output() {
  const [state, setState] = useState<LiveState | null>(null)
  const video = useRef<HTMLVideoElement | null>(null)
  const lastSeek = useRef(0)
  const stateRef = useRef<LiveState | null>(null)
  stateRef.current = state
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    void window.api.live.get().then(setState)
    return window.api.live.onState(setState)
  }, [])

  // hide expired messages
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // drive the <video> element from live state
  useEffect(() => {
    const v = video.current
    const vs = state?.video
    if (!v || !vs) return
    v.loop = vs.loop
    v.volume = Math.max(0, Math.min(1, vs.volume))
    if (vs.seekSeq !== lastSeek.current) {
      lastSeek.current = vs.seekSeq
      if (vs.seekSeq > 0) v.currentTime = vs.seekTo
    }
    if (vs.playing && v.paused) void v.play().catch(() => {})
    if (!vs.playing && !v.paused) v.pause()
    // The same broken video put live again keeps this <video> (same src: no new load, no new
    // error event) while the operator reset its progress — report the error again, so the
    // operator is told every time instead of only the first.
    if (v.error && !state?.videoProgress?.error) window.api.live.videoProgress({ current: 0, duration: 0, error: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the error flag is read as a snapshot; re-running on it would replay play/pause
  }, [state?.video, state?.seq])

  // Stable on purpose: a new callback each render made React detach and re-attach the
  // <video> on every state change, which reset lastSeek and jumped the video back to
  // the last seek point (and paused it there when it ended).
  const attachVideo = useCallback((el: HTMLVideoElement | null) => {
    if (video.current === el) return
    video.current = el
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
    el.ontimeupdate = () => !el.error && !resuming && window.api.live.videoProgress({ current: el.currentTime, duration: el.duration || 0, src: src() })
    el.onloadedmetadata = () => !el.error && !resuming && window.api.live.videoProgress({ current: 0, duration: el.duration || 0, src: src() })
    // tell the operator instead of sitting on a black frame that claims to be "playing"
    el.onerror = () => window.api.live.videoProgress({ current: 0, duration: 0, error: true, src: src() })
    el.onended = () => {
      const s = stateRef.current
      if (!el.loop && s?.video) window.api.live.videoEnded({ itemId: s.itemId, src: s.video.src })
    }
    const vs = stateRef.current?.video
    if (vs) {
      el.loop = vs.loop
      el.volume = vs.volume
      if (vs.playing) void el.play().catch(() => {})
    }
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
        onError={(e) => window.api.output.renderError(`${errorSummary(e)} (slide ${slide?.kind || 'none'})`)}
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
    </div>
  )
}

// "I'm alive" for main's freeze detection (a frozen page stops sending it and gets restarted)
setInterval(() => window.api.win.alive(), 1000)

createRoot(document.getElementById('root')!, {
  // an error outside the slide's boundary would leave a blank page that never recovers: ask main to reload it
  onUncaughtError: (e) => window.api.win.fatal(errorSummary(e))
}).render(<Output />)
