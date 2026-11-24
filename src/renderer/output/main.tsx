import { createRoot } from 'react-dom/client'
import { useEffect, useRef, useState } from 'react'
import type { LiveState } from '@shared/types'
import { SlideView } from '../components/SlideView'
import { toMediaUrl } from '../lib/media'
import './output.css'

/** The projector window. Renders exactly what main says is live, and plays videos with sound. */
function Output() {
  const [state, setState] = useState<LiveState | null>(null)
  const video = useRef<HTMLVideoElement | null>(null)
  const lastSeek = useRef(0)
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
  }, [state?.video, state?.seq])

  const attachVideo = (el: HTMLVideoElement | null) => {
    if (video.current === el) return
    video.current = el
    if (!el) return
    lastSeek.current = 0
    el.ontimeupdate = () => window.api.live.videoProgress({ current: el.currentTime, duration: el.duration || 0 })
    el.onloadedmetadata = () => window.api.live.videoProgress({ current: 0, duration: el.duration || 0 })
    el.onended = () => {
      if (!el.loop) window.api.live.videoEnded()
    }
    const vs = state?.video
    if (vs) {
      el.loop = vs.loop
      el.volume = vs.volume
      if (vs.playing) void el.play().catch(() => {})
    }
  }

  if (!state?.theme) return <div className="output-root" />
  const slide = state.slideIndex >= 0 ? state.slides[state.slideIndex] : null
  const msg = state.message && (!state.message.until || state.message.until > now) ? state.message.text : undefined
  return (
    <div className="output-root">
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
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Output />)
