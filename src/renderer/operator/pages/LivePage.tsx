import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PlanItem, Slide, Theme, Background } from '@shared/types'
import { formatClock } from '@shared/slides'
import { useApp } from '../store'
import * as live from '../liveControl'
import { buildItem } from '../../lib/buildSlides'
import { SlideView } from '../../components/SlideView'
import { TYPE_ICON, fmtMin } from '../../components/ui'
import { toMediaUrl } from '../../lib/media'
import { itemSourceMissing } from '../../lib/planRefs'

/** Replace every `{n}` placeholder in a message template. */
function fillTemplate(text: string, n: string): string {
  return text.replace(/\{n\}/g, n)
}

function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function LivePage() {
  const { t } = useTranslation()
  const s = useApp()
  const plan = s.plans.find((p) => p.id === s.activePlanId)
  const liveSt = s.live
  const plans = useMemo(() => s.plans.filter((p) => !p.isTemplate).sort((a, b) => b.date.localeCompare(a.date)), [s.plans])
  const selected = plan?.items.find((i) => i.id === s.selectedItemId)
  const liveItemInPlan = liveSt && plan && liveSt.planId === plan.id ? liveSt.itemId : undefined

  return (
    <div className="live-page">
      {/* ----------------------- plan column ----------------------- */}
      <section className="live-col">
        <div className="col-head">
          <select className="select" style={{ flex: 1 }} value={s.activePlanId || ''} onChange={(e) => s.setActivePlan(e.target.value || undefined)}>
            {!plans.length && <option value="">{t('live.noPlans')}</option>}
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.date ? `${p.date} · ` : ''}
                {p.time && plans.filter((x) => x.date === p.date).length > 1 ? `${p.time} · ` : ''}
                {p.title}
              </option>
            ))}
          </select>
          <button className="btn sm" title={t('live.editPlan')} onClick={() => s.setPage('plans', s.activePlanId)}>
            ✏️
          </button>
        </div>
        <div className="col-body">
          {!plan && (
            <div className="empty">
              <div className="big">🗓️</div>
              <p>{t('live.noPlanHelp')}</p>
              <button className="btn primary" onClick={() => s.setPage('plans')}>
                {t('live.createPlan')}
              </button>
            </div>
          )}
          {plan?.items.map((item, idx) => (
            <PlanRow
              key={item.id}
              item={item}
              index={idx}
              selected={item.id === s.selectedItemId}
              isLive={item.id === liveItemInPlan}
              onSelect={() => s.selectItem(item.id)}
              onGo={() => void live.enqueue(() => live.goItem(idx))}
            />
          ))}
        </div>
        {plan && <PlanFooter />}
      </section>

      {/* ----------------------- slides column ----------------------- */}
      <section className="live-col" style={{ background: 'var(--bg)' }}>
        <SlidesColumn item={selected} />
      </section>

      {/* ----------------------- monitors & controls ----------------------- */}
      <section className="live-col">
        <Monitors />
        <Controls />
      </section>
    </div>
  )
}

function PlanRow(p: { item: PlanItem; index: number; selected: boolean; isLive: boolean; onSelect: () => void; onGo: () => void }) {
  const { item } = p
  const { t } = useTranslation()
  const missing = useApp((s) => itemSourceMissing(item, s))
  const isHeader = item.type === 'header' && !item.slides?.length
  return (
    <div
      className={`plan-item ${p.selected ? 'sel' : ''} ${p.isLive ? 'live' : ''} ${isHeader ? 'header-row' : ''}`}
      onClick={p.onSelect}
      onDoubleClick={p.onGo}
      title={item.notes}
    >
      <span className="type-ico">{TYPE_ICON[item.type]}</span>
      <div style={{ minWidth: 0 }}>
        <div className="ti">
          {missing && <span title={t('plans.sourceMissing')} style={{ color: 'var(--warn)' }}>⚠ </span>}
          {item.title}
        </div>
        {missing && <div className="meta" style={{ color: 'var(--warn)' }}>{t('plans.sourceMissing')}</div>}
        {(item.person || item.notes) && <div className="meta">{[item.person, item.notes].filter(Boolean).join(' · ')}</div>}
      </div>
      <div className="meta" style={{ textAlign: 'right' }}>
        {p.isLive ? <span className="pill live">LIVE</span> : fmtMin(item.durationMin)}
      </div>
    </div>
  )
}

function PlanFooter() {
  const { t } = useTranslation()
  const plan = live.activePlan()
  const total = (plan?.items || []).reduce((a, i) => a + (i.durationMin || 0), 0)
  return (
    <div className="col-head" style={{ borderTop: '1px solid var(--border)', borderBottom: 0 }}>
      <span className="small muted" style={{ flex: 1 }}>
        {plan?.items.length} {t('live.items')} · {fmtMin(total)}
      </span>
      <button className="btn sm" onClick={() => void live.enqueue(() => live.nextItem())} title="Ctrl + →">
        {t('live.nextItem')} ⏭
      </button>
    </div>
  )
}

function SlidesColumn({ item }: { item?: PlanItem }) {
  const { t } = useTranslation()
  const s = useApp()
  const liveSt = s.live
  const [built, setBuilt] = useState<{ slides: Slide[]; theme: Theme; background: Background | null; itemId?: string } | null>(null)
  const [size, setSize] = useState(220)
  const isLiveItem = !!item && liveSt?.itemId === item.id
  const plan = live.activePlan()
  const index = plan && item ? plan.items.findIndex((i) => i.id === item.id) : -1

  // build preview slides for a selected item that is not live yet
  useEffect(() => {
    let cancel = false
    if (!item || isLiveItem) {
      setBuilt(null)
      return
    }
    void buildItem(item, { songs: s.songs, media: s.media, presentations: s.presentations, themes: s.themes, settings: s.settings, bibles: s.bibles }).then((b) => {
      if (!cancel) setBuilt({ ...b, itemId: item.id })
    })
    return () => {
      cancel = true
    }
  }, [item, isLiveItem, s.songs, s.media, s.presentations, s.themes, s.bibles])

  // what to show: live slides if the selected item (or nothing selected) is live
  const showLive = isLiveItem || (!item && !!liveSt && liveSt.slides.length > 0)
  const slides = showLive ? liveSt!.slides : built?.slides || []
  const theme = showLive ? liveSt!.theme : built?.theme
  const bg = showLive ? liveSt!.background : built?.background
  const title = showLive ? liveSt?.itemTitle : item?.title

  return (
    <>
      <div className="col-head">
        <h3 style={{ textTransform: 'none', fontSize: 15, color: 'var(--text)', letterSpacing: 0 }}>
          {item ? `${TYPE_ICON[item.type]} ` : ''}
          {title || t('live.selectItem')}
        </h3>
        <input type="range" min={150} max={360} value={size} onChange={(e) => setSize(+e.target.value)} title={t('live.thumbSize')} style={{ width: 90 }} />
        {item && item.type === 'song' && (
          <button className="btn sm" onClick={() => s.setPage('songs', item.refId)}>
            ✏️ {t('common.edit')}
          </button>
        )}
        {item && !isLiveItem && index >= 0 && (
          <button className="btn sm live" onClick={() => void live.enqueue(() => live.goItem(index))}>
            ● {t('live.goLive')}
          </button>
        )}
      </div>
      <div className="col-body" style={{ padding: 0 }}>
        {!slides.length && (
          <div className="empty">
            <div className="big">👈</div>
            {item ? t('live.noSlides') : t('live.pickHelp')}
          </div>
        )}
        {theme && (
          <div className="slides-grid" style={{ ['--thumb' as string]: `${size}px` }}>
            {slides.map((sl, i) => {
              const on = showLive && liveSt!.slideIndex === i
              return (
                <div
                  key={sl.id}
                  className={`thumb ${on ? 'live' : ''}`}
                  onClick={() => (showLive ? void live.enqueue(() => live.goSlide(i)) : index >= 0 ? void live.enqueue(() => live.goItem(index, i)) : undefined)}
                >
                  <div className="ratio">
                    <SlideView slide={sl} theme={theme} background={bg} displayLang={liveSt?.displayLang || 'both'} order={liveSt?.bilingualOrder || 'es-first'} thumb />
                  </div>
                  <div className="cap">
                    {sl.group || (sl.kind === 'blank' ? '—' : '')}
                    <span className="num">{i + 1}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}

function Monitors() {
  const { t } = useTranslation()
  const l = useApp((s) => s.live)
  const settings = useApp((s) => s.settings)
  if (!l?.theme) return null
  const cur = l.slideIndex >= 0 ? l.slides[l.slideIndex] : null
  const nextSlide = l.slideIndex + 1 < l.slides.length ? l.slides[l.slideIndex + 1] : null
  const nextItem = !nextSlide && l.itemIndex >= 0 ? l.planItems[l.itemIndex + 1] : undefined
  const msg = l.message && (!l.message.until || l.message.until > Date.now()) ? l.message.text : undefined
  return (
    <>
      <div className="monitor">
        <div className="monitor-label">
          <span className="dot live" /> {t('live.live')}
          <span style={{ flex: 1 }} />
          {l.layers.black && <span className="pill live">{t('live.black')}</span>}
          {l.layers.logo && <span className="pill gold">{t('live.logo')}</span>}
          {l.layers.clearText && <span className="pill warn">{t('live.textHidden')}</span>}
        </div>
        <div className="monitor-frame live">
          <SlideView
            slide={cur}
            theme={l.theme}
            background={l.background}
            displayLang={l.displayLang}
            order={l.bilingualOrder}
            layers={l.layers}
            message={msg}
            logoUrl={l.logoPath ? toMediaUrl(l.logoPath) : undefined}
            churchName={settings.churchName}
          />
        </div>
      </div>
      <div className="monitor" style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, alignItems: 'center' }}>
        <div className="monitor-frame" style={{ borderWidth: 1 }}>
          {nextSlide ? (
            <SlideView slide={nextSlide} theme={l.theme} background={l.background} displayLang={l.displayLang} order={l.bilingualOrder} thumb />
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#888', fontSize: 22 }}>⏭</div>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="monitor-label" style={{ marginBottom: 2 }}>
            {t('live.next')}
          </div>
          <div className="small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nextSlide ? nextSlide.group || `#${l.slideIndex + 2}` : nextItem ? `${TYPE_ICON[nextItem.type]} ${nextItem.title}` : t('live.endOfPlan')}
          </div>
          {cur?.notes && <div className="small muted" style={{ marginTop: 4, maxHeight: 54, overflow: 'auto' }}>📝 {cur.notes}</div>}
        </div>
      </div>
    </>
  )
}

function Controls() {
  const { t } = useTranslation()
  const l = useApp((s) => s.live)
  const progress = useApp((s) => s.progress)
  const settings = useApp((s) => s.settings)
  const now = useNow(1000)
  const [msgText, setMsgText] = useState('')
  const [num, setNum] = useState('')
  const [stageText, setStageText] = useState('')
  if (!l) return null
  const plan = live.activePlan()
  const planned = plan?.items.find((i) => i.id === l.itemId)?.durationMin || 0
  const itemElapsed = l.itemStartedAt ? now - l.itemStartedAt : 0
  const serviceElapsed = l.serviceStartedAt ? now - l.serviceStartedAt : 0
  const over = planned > 0 && itemElapsed > planned * 60_000
  const lang = settings.uiLang

  const sendTemplate = (tpl: { en: string; es: string }) => {
    const fill = (s: string) => fillTemplate(s, num || '?')
    // both languages: follow the bilingual order setting (English on top for EN-first services)
    const both = l.bilingualOrder === 'en-first' ? [fill(tpl.en), fill(tpl.es)] : [fill(tpl.es), fill(tpl.en)]
    const text = l.displayLang === 'en' ? fill(tpl.en) : l.displayLang === 'es' ? fill(tpl.es) : both.join('\n')
    void live.showMessage(text)
  }

  return (
    <div className="controls">
      <div className="nav-big">
        <button className="btn lg" onClick={() => void live.enqueue(() => live.prev())} title="←">
          ◀ {t('live.prev')}
        </button>
        <button className="btn lg primary" onClick={() => void live.enqueue(() => live.next())} title={t('live.nextTip')}>
          {t('live.nextBtn')} ▶
        </button>
      </div>
      <div className="ctl-grid">
        <button className={`btn ${l.layers.black ? 'on live-on' : ''}`} onClick={() => void live.enqueue(() => live.toggleLayer('black'))}>
          ⬛ {t('live.black')} <span className="kbd">B</span>
        </button>
        <button className={`btn ${l.layers.clearText ? 'on' : ''}`} onClick={() => void live.enqueue(() => live.toggleLayer('clearText'))}>
          🔤 {t('live.clearText')} <span className="kbd">C</span>
        </button>
        <button className={`btn ${l.layers.logo ? 'on' : ''}`} onClick={() => void live.enqueue(() => live.toggleLayer('logo'))}>
          ✝ {t('live.logo')} <span className="kbd">L</span>
        </button>
        <button className="btn" onClick={() => void live.enqueue(() => live.clearAll())}>
          🧹 {t('live.clearAll')} <span className="kbd">Esc</span>
        </button>
      </div>

      {l.video && (
        <div className="card" style={{ padding: 12 }}>
          <div className="row" style={{ marginBottom: 8 }}>
            <button className="btn sm primary" onClick={() => void live.enqueue(() => live.videoToggle())}>
              {l.video.playing ? '⏸ ' + t('live.pause') : '▶ ' + t('live.play')}
            </button>
            <button className="btn sm" onClick={() => void live.enqueue(() => live.videoSeek(0))}>
              ⏮
            </button>
            <label className="check small">
              <input type="checkbox" checked={l.video.loop} onChange={(e) => void live.videoSet({ loop: e.target.checked })} /> {t('live.loop')}
            </label>
            <span style={{ flex: 1 }} />
            <span className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>
              −{formatClock(((progress?.duration || 0) - (progress?.current || 0)) * 1000)}
            </span>
          </div>
          <div
            className="progress"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
              if (progress?.duration) void live.videoSeek(((e.clientX - r.left) / r.width) * progress.duration)
            }}
          >
            <div style={{ width: `${progress?.duration ? (progress.current / progress.duration) * 100 : 0}%` }} />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="small muted">🔊</span>
            <input type="range" min={0} max={1} step={0.05} value={l.video.volume} onChange={(e) => void live.videoSet({ volume: +e.target.value })} style={{ flex: 1 }} />
          </div>
        </div>
      )}

      <div className="timer-row">
        <div className="timer">
          <div className="lbl">{t('live.clock')}</div>
          <div className="val">{new Date(now).toLocaleTimeString(lang === 'es' ? 'es' : 'en', { hour: 'numeric', minute: '2-digit' })}</div>
        </div>
        <div className="timer" title={t('live.itemTimerTip')}>
          <div className="lbl">
            {t('live.item')} {planned ? `/ ${planned}m` : ''}
          </div>
          <div className={`val ${over ? 'over' : ''}`}>{l.itemStartedAt ? formatClock(itemElapsed) : '—'}</div>
        </div>
        <div className="timer" onDoubleClick={() => void live.resetServiceTimer()} title={t('live.serviceTimerTip')}>
          <div className="lbl">{t('live.service')}</div>
          <div className="val">{l.serviceStartedAt ? formatClock(serviceElapsed) : '—'}</div>
        </div>
      </div>

      <div className="section-title">{t('live.messages')}</div>
      <div className="row">
        <input className="input" style={{ width: 70 }} placeholder="#" value={num} onChange={(e) => setNum(e.target.value)} />
        <div className="row wrap" style={{ gap: 6 }}>
          {settings.messageTemplates.map((tpl) => (
            <button key={tpl.id} className="btn sm" onClick={() => sendTemplate(tpl)} title={fillTemplate(lang === 'es' ? tpl.es : tpl.en, num || '…')}>
              {(lang === 'es' ? tpl.es : tpl.en).replace(/[,:].*$/, '').replace(/#?\{n\}/g, '').trim().slice(0, 24)}
            </button>
          ))}
        </div>
      </div>
      <div className="row">
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder={t('live.customMessage')}
          value={msgText}
          onChange={(e) => setMsgText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && msgText.trim()) {
              void live.showMessage(msgText.trim())
              setMsgText('')
            }
          }}
        />
        <button className="btn sm" disabled={!msgText.trim()} onClick={() => (void live.showMessage(msgText.trim()), setMsgText(''))}>
          {t('live.show')}
        </button>
        {l.message && (
          <button className="btn sm danger" onClick={() => void live.clearMessage()}>
            ✕
          </button>
        )}
      </div>

      <div className="section-title">{t('live.stageMsg')}</div>
      <div className="row">
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder={t('live.stagePlaceholder')}
          value={stageText}
          onChange={(e) => setStageText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void live.stageMessage(stageText.trim())}
        />
        <button className="btn sm" onClick={() => void live.stageMessage(stageText.trim())}>
          {t('live.send')}
        </button>
        {l.stageMessage && (
          <button className="btn sm danger" onClick={() => (void live.stageMessage(''), setStageText(''))}>
            ✕
          </button>
        )}
      </div>
      <div className="row wrap" style={{ gap: 6 }}>
        {['wrap', 'slow', 'repeat', 'louder'].map((k) => (
          <button key={k} className="btn sm ghost" onClick={() => void live.stageMessage(t(`stageQuick.${k}`))}>
            {t(`stageQuick.${k}`)}
          </button>
        ))}
      </div>
      {l.itemNotes && (
        <div className="card small" style={{ padding: 10 }}>
          📝 {l.itemNotes}
        </div>
      )}
    </div>
  )
}
