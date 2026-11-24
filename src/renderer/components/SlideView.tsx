import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { Background, BilingualOrder, DisplayLang, LiveLayers, Slide, Theme } from '@shared/types'
import { formatClock, pickLangs } from '@shared/slides'
import { isAudioUrl, isVideoUrl } from '../lib/media'
import '../styles/slide.css'

/**
 * Renders one slide on a virtual 1920×1080 canvas scaled to fit its container.
 * The same component drives the projector, the operator's Live/Next monitors,
 * slide thumbnails and the stage display, so what you see is what they see.
 */
export interface SlideViewProps {
  slide?: Slide | null
  theme: Theme
  background?: Background | null
  displayLang: DisplayLang
  order: BilingualOrder
  layers?: LiveLayers
  message?: string
  logoUrl?: string
  churchName?: string
  /** projector window: real video playback with sound */
  isOutput?: boolean
  /** thumbnails: skip animations & video */
  thumb?: boolean
  videoRef?: (el: HTMLVideoElement | null) => void
  className?: string
}

const W = 1920
const H = 1080

export function SlideView(p: SlideViewProps) {
  const box = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.1)

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const update = () => setScale(Math.min(el.clientWidth / W, el.clientHeight / H) || 0.1)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const layers = p.layers || { black: false, clearText: false, clearBackground: false, logo: false }
  const slide = p.slide
  const bg = p.background === undefined ? p.theme.background : p.background
  const slideBg = slide?.media && slide.kind === 'text' ? { type: isVideoUrl(slide.media) ? 'video' : 'image', value: slide.media, dim: 0.35 } as Background : null

  return (
    <div ref={box} className={`slide-box ${p.className || ''}`}>
      <div className="slide-canvas" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {!layers.clearBackground && <BackgroundLayer bg={slideBg || bg} thumb={p.thumb} />}
        {slide && !layers.logo && <ContentLayer {...p} slide={slide} hideText={layers.clearText} />}
        {layers.logo && <LogoLayer url={p.logoUrl} name={p.churchName} />}
        {p.message && !p.thumb && (
          <div className="slide-message" key={p.message}>
            <span>{p.message}</span>
          </div>
        )}
        {layers.black && <div className="slide-black" />}
      </div>
    </div>
  )
}

function BackgroundLayer({ bg, thumb }: { bg?: Background | null; thumb?: boolean }) {
  if (!bg) return <div className="slide-bg" style={{ background: '#000' }} />
  const dim = bg.dim ? <div className="slide-dim" style={{ opacity: bg.dim }} /> : null
  if (bg.type === 'video') {
    return (
      <>
        {thumb ? (
          <div className="slide-bg" style={{ background: 'linear-gradient(135deg,#1b2540,#0a0f1c)' }} />
        ) : (
          <video className="slide-bg slide-media" src={bg.value} autoPlay loop muted playsInline />
        )}
        {dim}
      </>
    )
  }
  if (bg.type === 'image') {
    return (
      <>
        <img className="slide-bg slide-media cover" src={bg.value} alt="" />
        {dim}
      </>
    )
  }
  return <div className="slide-bg" style={{ background: bg.value }} />
}

function LogoLayer({ url, name }: { url?: string; name?: string }) {
  return (
    <div className="slide-logo">
      {url ? <img src={url} alt="" /> : <div className="slide-logo-name">{name || 'ICCWorship'}</div>}
    </div>
  )
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [active])
  return now
}

function ContentLayer(p: SlideViewProps & { slide: Slide; hideText: boolean }) {
  const { slide, theme } = p
  const now = useNow(slide.kind === 'countdown')

  if (slide.kind === 'image' && slide.media) {
    return <img key={slide.id} className={`slide-media contain ${p.thumb ? '' : 'fade-in'}`} src={slide.media} alt="" />
  }
  if (slide.kind === 'video' && slide.media) {
    if (p.thumb) return <div className="slide-video-thumb">▶</div>
    const audio = isAudioUrl(slide.media)
    return (
      <video
        key={slide.media}
        ref={p.videoRef}
        className={`slide-media contain ${audio ? 'audio-only' : ''}`}
        src={slide.media}
        muted={!p.isOutput}
        autoPlay={!p.isOutput}
        playsInline
      />
    )
  }
  if (slide.kind === 'countdown') {
    const left = (slide.countdownTo || now) - now
    const label = pickLangs(slide.countdownLabel, p.displayLang, p.order)
    return (
      <div className="slide-countdown" style={{ color: theme.color, fontFamily: theme.fontFamily }}>
        {label.primary && <div className="cd-label">{label.primary}</div>}
        {label.secondary && <div className="cd-label secondary" style={{ color: theme.secondaryColor }}>{label.secondary}</div>}
        <div className="cd-time">{formatClock(Math.max(0, left))}</div>
      </div>
    )
  }
  if (slide.kind === 'blank' || p.hideText) return null
  return <TextBlock {...p} />
}

function TextBlock(p: SlideViewProps & { slide: Slide }) {
  const { slide, theme } = p
  const ref = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)
  const [fit, setFit] = useState(1)
  const text = pickLangs(slide.text, p.displayLang, p.order)
  const title = pickLangs(slide.title, p.displayLang, p.order)
  const footer = pickLangs(slide.footer, p.displayLang, p.order)
  const content = `${title.primary}|${title.secondary}|${text.primary}|${text.secondary}|${theme.fontSize}|${theme.fontFamily}`

  // shrink-to-fit: reduce font size until the text fits the safe area
  useLayoutEffect(() => {
    const el = ref.current
    const content = inner.current
    if (!el || !content) return
    let f = 1
    el.style.setProperty('--fit', '1')
    for (let i = 0; i < 24 && (content.offsetHeight > el.clientHeight + 2 || content.scrollWidth > el.clientWidth + 2); i++) {
      f *= 0.92
      el.style.setProperty('--fit', String(f))
    }
    setFit(f)
  }, [content])

  const shadow = theme.shadow ? '0 4px 18px rgba(0,0,0,.65), 0 2px 4px rgba(0,0,0,.8)' : 'none'
  const outline = theme.outline ? '3px rgba(0,0,0,.85)' : undefined
  const style: CSSProperties = {
    ['--fit' as string]: fit,
    ['--fs' as string]: `${theme.fontSize}px`,
    fontFamily: `'${theme.fontFamily}', 'Segoe UI', sans-serif`,
    fontWeight: theme.bold ? 700 : 400,
    textAlign: theme.align,
    textTransform: theme.uppercase ? 'uppercase' : 'none',
    textShadow: shadow,
    WebkitTextStroke: outline,
    justifyContent: theme.position === 'top' ? 'flex-start' : theme.position === 'bottom' ? 'flex-end' : 'center',
    alignItems: theme.align === 'left' ? 'flex-start' : theme.align === 'right' ? 'flex-end' : 'center'
  }
  const twoLang = !!text.secondary
  return (
    <>
      <div ref={ref} className={`slide-text ${p.thumb ? '' : 'fade-in'} ${theme.position}`} style={style} key={slide.id}>
        <div ref={inner} className="slide-text-inner" style={{ alignItems: style.alignItems }}>
        {title.primary && (
          <div className="slide-title" style={{ color: theme.color }}>
            {title.primary}
            {title.secondary && <div className="slide-title-2" style={{ color: theme.secondaryColor }}>{title.secondary}</div>}
          </div>
        )}
        {text.primary && (
          <div className="slide-primary" style={{ color: theme.color }}>
            {text.primary}
          </div>
        )}
        {twoLang && <div className="slide-divider" style={{ background: theme.secondaryColor }} />}
        {text.secondary && (
          <div className="slide-secondary" style={{ color: theme.secondaryColor, fontSize: `calc(var(--fs) * var(--fit) * ${theme.secondaryScale})` }}>
            {text.secondary}
          </div>
        )}
        </div>
      </div>
      {(footer.primary || footer.secondary) && (
        <div className="slide-footer" style={{ color: theme.color, fontFamily: `'${theme.fontFamily}', 'Segoe UI', sans-serif`, textShadow: shadow }}>
          {[footer.primary, footer.secondary].filter(Boolean).join('   ·   ')}
        </div>
      )}
    </>
  )
}
