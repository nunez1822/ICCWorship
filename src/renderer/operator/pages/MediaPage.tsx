import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem, MediaKind, Presentation, Slide } from '@shared/types'
import { uid } from '@shared/slides'
import { useApp } from '../store'
import { activePlan, showAdhoc, syncPlanSummary, updateLive } from '../liveControl'
import { Modal, Seg, confirmDel } from '../../components/ui'
import { SlideView } from '../../components/SlideView'
import { usedInPlansNote } from '../../lib/planRefs'
import { themeBackground } from '../../lib/buildSlides'
import { AUDIO_EXT, IMAGE_EXT, VIDEO_EXT, backgroundFromMedia, fileName, kindOf, makeThumb, toMediaUrl } from '../../lib/media'
import { renderPdfPages } from '../../lib/pdf'

const PRES_EXT = ['pptx', 'ppt', 'ppsx', 'pps', 'odp', 'pdf']

export function MediaPage() {
  const { t } = useTranslation()
  const s = useApp()
  const [tab, setTab] = useState<'library' | 'presentations'>('library')
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  /** the same file imported again: Update / Keep both / Cancel (ProPresenter-style) */
  const [ask, setAsk] = useState<{ name: string; resolve: (c: 'update' | 'keep' | 'cancel') => void } | null>(null)
  // The import loop awaits the dialog: leaving the page must not strand it (the rest of the
  // batch would never import). On unmount the open question — and any later duplicate,
  // which has no page to ask on — is answered "cancel" (that file is skipped, with a toast).
  const pendingAsk = useRef<((c: 'update' | 'keep' | 'cancel') => void) | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      pendingAsk.current?.('cancel')
      pendingAsk.current = null
    }
  }, [])
  const askDuplicate = (name: string) =>
    new Promise<'update' | 'keep' | 'cancel'>((resolve) => {
      if (!mounted.current) {
        useApp.getState().toast(t('media.dupSkippedAway', { name }), 'info', 8000)
        return resolve('cancel')
      }
      const done = (c: 'update' | 'keep' | 'cancel') => {
        pendingAsk.current = null
        resolve(c)
      }
      pendingAsk.current = (c) => {
        useApp.getState().toast(t('media.dupSkippedAway', { name }), 'info', 8000)
        done(c)
      }
      setAsk({ name, resolve: done })
    })

  const addMediaPaths = async (paths: string[]) => {
    // the same file added again: by where it was copied from, or the file it links to
    const known = new Set(s.media.flatMap((m) => [m.path, m.source].filter((x): x is string => !!x).map((x) => x.toLowerCase())))
    const copy = s.settings.copyMediaToLibrary !== false
    let n = 0
    let already = 0
    for (const p of paths) {
      const kind = kindOf(p)
      if (kind && known.has(p.toLowerCase())) already++
      if (!kind || known.has(p.toLowerCase())) continue
      // the library keeps its own copy (backups and a new computer then have it, see @shared/mediaLibrary);
      // if it can't (no room), the item links to the file where it is, as before — and says so
      let stored = p
      if (copy) {
        setBusy(`${t('media.copying')} ${fileName(p)}`)
        // (read-only data refuses the copy: the item links to the file, like a copy that didn't fit)
        const r = await window.api.media.copyIn(p).catch(() => ({ ok: false as const, error: 'failed' as const }))
        if (r.ok) stored = r.path
        else s.toast(t(r.error === 'no-space' ? 'media.copyNoSpace' : 'media.copyFailed', { name: fileName(p) }), 'err', 10_000)
      }
      setBusy(`${t('common.working')} ${fileName(p)}`)
      const thumb = await makeThumb(stored, kind)
      await s.save('media', {
        id: uid(),
        name: fileName(p).replace(/\.[^.]+$/, ''),
        path: stored,
        source: stored !== p ? p : undefined,
        kind,
        thumb,
        addedAt: Date.now()
      } satisfies MediaItem)
      known.add(p.toLowerCase())
      n++
    }
    setBusy(null)
    if (n) s.toast(t('media.added', { count: n }))
    if (already) s.toast(t('media.alreadyIn', { count: already }), 'info')
  }

  /** import, but ask first when that file is already in the presentations list */
  const importOrAsk = async (path: string) => {
    // fresh list, not this render's copy: a file picked twice in one batch is already in it
    const existing = useApp.getState().presentations.find((x) => x.sourcePath.toLowerCase() === path.toLowerCase())
    if (!existing) return importPresentation(path)
    const choice = await askDuplicate(existing.name)
    setAsk(null)
    if (choice === 'update') return importPresentation(path, undefined, existing.id)
    if (choice === 'keep') return importPresentation(path)
  }

  const importPresentation = async (path: string, prefer?: 'powerpoint' | 'libreoffice' | 'text', reuseId?: string) => {
    setBusy(t('media.converting', { name: fileName(path) }))
    try {
      const r = await window.api.pres.import(path, prefer, reuseId)
      if (r.error) {
        // known codes get their own message; anything else (JSZip / pdf.js internals) gets a
        // plain-language one instead of developer text
        s.toast(t(`media.err.${r.error}`, { defaultValue: t('media.err.damaged', { name: fileName(path) }) }), 'err', 8000)
        return
      }
      if (r.pdfToRender) {
        const pages = await renderPdfPages(r.pdfToRender.pdfPath, (d, total) => setBusy(t('media.renderingPages', { done: d, total })))
        const p = await window.api.pres.savePdfPages({ ...r.pdfToRender, pages })
        await s.reload('presentations')
        s.toast(t('media.presImported', { name: p.name, count: p.slides.length }))
      } else if (r.presentation) {
        await s.reload('presentations')
        s.toast(t('media.presImported', { name: r.presentation.name, count: r.presentation.slides.length }))
        if (r.presentation.method === 'text') s.toast(t('media.textOnlyNote'), 'info')
      }
      setTab('presentations')
    } catch (e) {
      console.error('presentation import failed', e)
      s.toast(t('media.err.damaged', { name: fileName(path) }), 'err', 8000)
    } finally {
      setBusy(null)
    }
  }

  const handlePaths = async (paths: string[]) => {
    const pres = paths.filter((p) => PRES_EXT.includes(p.split('.').pop()!.toLowerCase()))
    const media = paths.filter((p) => !pres.includes(p))
    if (media.length) await addMediaPaths(media)
    for (const p of pres) await importOrAsk(p)
  }

  return (
    <div
      className={`page ${over ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const paths = [...e.dataTransfer.files].map((f) => window.api.files.pathOf(f)).filter(Boolean)
        void handlePaths(paths)
      }}
    >
      <div className="page-head">
        <h1>🎬 {t('media.title')}</h1>
        <span className="spacer" />
        {busy && <span className="pill gold">⏳ {busy}</span>}
        <button
          className="btn"
          onClick={async () =>
            void addMediaPaths(
              await window.api.files.open({ multi: true, filters: [{ name: t('media.mediaFiles'), extensions: [...VIDEO_EXT, ...IMAGE_EXT, ...AUDIO_EXT] }] })
            )
          }
        >
          ＋ {t('media.addFiles')}
        </button>
        <button
          className="btn primary"
          onClick={async () => {
            const paths = await window.api.files.open({ multi: true, filters: [{ name: 'PowerPoint / PDF', extensions: PRES_EXT }] })
            for (const p of paths) await importOrAsk(p)
          }}
        >
          📊 {t('media.importPres')}
        </button>
        <button
          className="btn"
          onClick={async () => {
            const paths = await window.api.files.open({ multi: true, filters: [{ name: t('media.images'), extensions: IMAGE_EXT }] })
            if (!paths.length) return
            const name = fileName(paths[0]).replace(/\.[^.]+$/, '')
            await window.api.pres.importImages(paths, name)
            s.toast(t('media.presImported', { name, count: paths.length }))
            await s.reload('presentations')
            setTab('presentations')
          }}
        >
          🖼️ {t('media.imagesAsSlides')}
        </button>
      </div>
      <div className="tabs">
        <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>
          {t('media.library')} ({s.media.length})
        </button>
        <button className={tab === 'presentations' ? 'on' : ''} onClick={() => setTab('presentations')}>
          {t('media.presentations')} ({s.presentations.length})
        </button>
      </div>
      {tab === 'library' ? <Library /> : <Presentations onReimport={(p) => void importPresentation(p.sourcePath, undefined, p.id)} />}
      {ask && (
        <Modal
          title={`⚠ ${t('media.dupTitle')}`}
          onClose={() => ask.resolve('cancel')}
          footer={
            <>
              <button className="btn" onClick={() => ask.resolve('cancel')}>
                {t('common.cancel')}
              </button>
              <button className="btn" onClick={() => ask.resolve('keep')} title={t('media.dupKeepHelp')}>
                {t('songs.dupKeep')}
              </button>
              <button className="btn primary" onClick={() => ask.resolve('update')} title={t('media.dupUpdateHelp')}>
                ↻ {t('media.dupUpdate')}
              </button>
            </>
          }
        >
          <p>{t('media.dupText', { name: ask.name })}</p>
        </Modal>
      )}
    </div>
  )
}

function Library() {
  const { t } = useTranslation()
  const s = useApp()
  const [filter, setFilter] = useState<'all' | MediaKind>('all')
  const [sel, setSel] = useState<string | undefined>()
  const [missing, setMissing] = useState<Set<string>>(new Set())
  const list = s.media.filter((m) => filter === 'all' || m.kind === filter).sort((a, b) => b.addedAt - a.addedAt)
  const item = s.media.find((m) => m.id === sel)

  useEffect(() => {
    // resolved like the projector does (library copies are data-relative)
    void window.api.files
      .mediaStatus(s.media.map((m) => toMediaUrl(m.path)))
      .then((st) => setMissing(new Set(s.media.filter((_, i) => !st[i]?.exists).map((m) => m.id))))
  }, [s.media])

  if (!s.media.length)
    return (
      <div className="dropzone" style={{ padding: 60 }}>
        <div style={{ fontSize: 44 }}>📥</div>
        <h3>{t('media.dropTitle')}</h3>
        <p>{t(s.settings.copyMediaToLibrary !== false ? 'media.dropHelp' : 'media.dropHelpLinked')}</p>
      </div>
    )

  const showNow = async (m: MediaItem) => {
    const url = toMediaUrl(m.path)
    const slide: Slide = { id: uid(), kind: m.kind === 'image' ? 'image' : 'video', media: url, group: m.name }
    await showAdhoc({ title: m.name, type: 'media', slides: [slide], video: m.kind !== 'image' })
  }
  const addToPlan = async (m: MediaItem) => {
    const plan = activePlan()
    if (!plan) return s.toast(t('songs.noActivePlan'), 'err')
    await s.save('plans', {
      ...plan,
      items: [...plan.items, { id: uid(), type: 'media', title: m.name, refId: m.id, durationMin: 3, video: { loop: false, autoNext: false, volume: 1 } }],
      updatedAt: Date.now()
    })
    void syncPlanSummary()
    s.toast(t('songs.addedToPlan', { plan: plan.date ? `${plan.date} · ${plan.title}` : plan.title }))
  }
  const setAsBackground = async (m: MediaItem) => {
    const bg = backgroundFromMedia(m.path)
    if (bg) await updateLive({ background: bg })
    s.toast(t('media.bgApplied'))
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: item ? 'minmax(0,1fr) 320px' : '1fr', gap: 20 }}>
      <div className="col">
        <div>
          <Seg
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('media.all') },
              { value: 'image', label: `🖼 ${t('media.images')}` },
              { value: 'video', label: `🎬 ${t('media.videos')}` },
              { value: 'audio', label: `🎧 ${t('media.audio')}` }
            ]}
          />
        </div>
        <div className="media-grid">
          {list.map((m) => (
            <div key={m.id} className={`media-card ${m.id === sel ? 'on' : ''}`} onClick={() => setSel(m.id)} onDoubleClick={() => void showNow(m)}>
              <div className="mthumb" style={m.thumb ? { backgroundImage: `url(${m.thumb})` } : undefined}>
                {!m.thumb && (m.kind === 'audio' ? '🎧' : m.kind === 'video' ? '🎬' : '🖼')}
              </div>
              {missing.has(m.id) && <span className="pill warn badge">⚠ {t('media.missing')}</span>}
              {m.kind === 'video' && !missing.has(m.id) && <span className="pill badge">▶</span>}
              <div className="mcap">{m.name}</div>
            </div>
          ))}
        </div>
      </div>
      {item && (
        <div className="card col" style={{ position: 'sticky', top: 0, alignSelf: 'start' }}>
          <div className="monitor-frame">
            {item.kind === 'video' ? (
              <video src={toMediaUrl(item.path)} controls muted style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
            ) : item.kind === 'image' ? (
              <img src={toMediaUrl(item.path)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <audio src={toMediaUrl(item.path)} controls style={{ width: '100%', marginTop: '20%' }} />
            )}
          </div>
          <input className="input" value={item.name} onChange={(e) => void s.save('media', { ...item, name: e.target.value })} />
          <div className="small muted" style={{ wordBreak: 'break-all' }}>
            {item.path}
          </div>
          {missing.has(item.id) && <div style={{ color: 'var(--warn)' }}>⚠ {t('media.missingHelp')}</div>}
          <button className="btn live" onClick={() => void showNow(item)}>
            ● {t('common.showNow')}
          </button>
          <button className="btn" onClick={() => void addToPlan(item)}>
            ＋ {t('songs.addToPlan')}
          </button>
          {item.kind !== 'audio' && (
            <button className="btn" onClick={() => void setAsBackground(item)}>
              🌄 {t('media.useAsBg')}
            </button>
          )}
          <button
            className="btn ghost"
            onClick={async () => {
              if (!confirmDel(t('media.confirmRemove') + usedInPlansNote(s.plans, item.id, t))) return
              await s.remove('media', item.id)
              setSel(undefined)
              // it was the background on screen right now: fall back immediately
              const l = useApp.getState().live
              if (l?.background?.value === toMediaUrl(item.path)) {
                void updateLive({ background: themeBackground(l.theme, useApp.getState().media) })
              }
            }}
          >
            🗑️ {t('media.remove')}
          </button>
        </div>
      )}
    </div>
  )
}

function Presentations({ onReimport }: { onReimport: (p: Presentation) => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const [tools, setTools] = useState<{ powerpoint: boolean; libreoffice: string | null } | null>(null)
  const [open, setOpen] = useState<Presentation | null>(null)
  useEffect(() => {
    void window.api.pres.detect().then(setTools)
  }, [])
  return (
    <div className="col">
      <div className="card row wrap">
        <b>{t('media.converters')}:</b>
        {tools ? (
          <>
            <span className={`pill ${tools.powerpoint ? 'ok' : ''}`}>{tools.powerpoint ? '✓' : '✗'} Microsoft PowerPoint</span>
            <span className={`pill ${tools.libreoffice ? 'ok' : ''}`}>{tools.libreoffice ? '✓' : '✗'} LibreOffice</span>
            <span className="pill ok">✓ PDF</span>
            <span className="pill ok">✓ {t('media.builtInReader')}</span>
          </>
        ) : (
          '…'
        )}
        <span className="small muted" style={{ flexBasis: '100%' }}>
          {tools?.powerpoint ? t('media.ppHelpOk') : tools?.libreoffice ? t('media.ppHelpLo') : t('media.ppHelpNone')} {t('media.animNote')}
        </span>
      </div>
      {!s.presentations.length && (
        <div className="dropzone" style={{ padding: 50 }}>
          <div style={{ fontSize: 44 }}>📊</div>
          <h3>{t('media.dropPresTitle')}</h3>
          <p>{t('media.dropPresHelp')}</p>
        </div>
      )}
      <div className="media-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {s.presentations.map((p) => (
          <div key={p.id} className="media-card" onClick={() => setOpen(p)}>
            <div
              className="mthumb"
              style={p.slides[0]?.image ? { backgroundImage: `url("${p.slides[0].image}")`, backgroundSize: 'contain', backgroundColor: '#000' } : undefined}
            >
              {!p.slides[0]?.image && '📝'}
            </div>
            <span className="pill badge">{t(`media.method.${p.method}`)}</span>
            <div className="mcap">
              {p.name} <span className="muted">· {p.slides.length}</span>
            </div>
          </div>
        ))}
      </div>
      {open && <PresentationModal pres={s.presentations.find((x) => x.id === open.id) || open} onClose={() => setOpen(null)} onReimport={onReimport} />}
    </div>
  )
}

function PresentationModal({ pres, onClose, onReimport }: { pres: Presentation; onClose: () => void; onReimport: (p: Presentation) => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const theme = s.themes.find((x) => x.id === s.settings.defaultThemeId) || s.themes[0]
  const slides: Slide[] = useMemo(
    () =>
      pres.slides.map((x, i) => ({
        id: `${pres.id}-${i}`,
        kind: x.image ? 'image' : 'text',
        media: x.image,
        text: x.text,
        notes: x.notes,
        group: String(i + 1)
      })),
    [pres]
  )
  const addToPlan = async () => {
    const plan = activePlan()
    if (!plan) return s.toast(t('songs.noActivePlan'), 'err')
    await s.save('plans', {
      ...plan,
      items: [...plan.items, { id: uid(), type: 'presentation', title: pres.name, refId: pres.id, durationMin: 10 }],
      updatedAt: Date.now()
    })
    void syncPlanSummary()
    s.toast(t('songs.addedToPlan', { plan: plan.date ? `${plan.date} · ${plan.title}` : plan.title }))
  }
  return (
    <Modal
      wide
      title={`📊 ${pres.name}`}
      onClose={onClose}
      footer={
        <>
          <button
            className="btn ghost"
            onClick={async () => {
              if (!confirmDel(t('media.confirmRemovePres') + usedInPlansNote(s.plans, pres.id, t))) return
              await s.remove('presentations', pres.id)
              onClose()
            }}
          >
            🗑️ {t('common.delete')}
          </button>
          <span style={{ flex: 1 }} />
          <button
            className="btn"
            onClick={() => {
              onReimport(pres)
              onClose()
            }}
            title={pres.sourcePath}
          >
            ↻ {t('media.reimport')}
          </button>
          <button className="btn" onClick={() => void addToPlan()}>
            ＋ {t('songs.addToPlan')}
          </button>
          <button
            className="btn live"
            onClick={() => {
              void showAdhoc({ title: pres.name, type: 'presentation', slides })
              onClose()
            }}
          >
            ● {t('common.showNow')}
          </button>
        </>
      }
    >
      <div className="small muted" style={{ marginBottom: 10 }}>
        {t(`media.method.${pres.method}`)} · {pres.sourcePath}
      </div>
      {pres.method === 'text' && (
        <div className="card small" style={{ marginBottom: 12 }}>
          💡 {t('media.translateHelp')}
        </div>
      )}
      <div className="col">
        {pres.slides.map((sl, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 12, alignItems: 'start' }}>
            <div className="monitor-frame">
              {theme && <SlideView slide={slides[i]} theme={theme} displayLang="both" order={s.settings.bilingualOrder} thumb />}
            </div>
            <div className="col" style={{ gap: 6 }}>
              {pres.method === 'text' ? (
                <div className="grid2">
                  <textarea
                    className="textarea"
                    rows={4}
                    value={sl.text?.en || ''}
                    placeholder="English"
                    onChange={(e) =>
                      void s.save('presentations', {
                        ...pres,
                        slides: pres.slides.map((x, j) => (j === i ? { ...x, text: { ...x.text, en: e.target.value } } : x))
                      })
                    }
                  />
                  <textarea
                    className="textarea"
                    rows={4}
                    value={sl.text?.es || ''}
                    placeholder="Español"
                    onChange={(e) =>
                      void s.save('presentations', {
                        ...pres,
                        slides: pres.slides.map((x, j) => (j === i ? { ...x, text: { ...x.text, es: e.target.value } } : x))
                      })
                    }
                  />
                </div>
              ) : (
                <b>
                  {t('item.slide')} {i + 1}
                </b>
              )}
              {sl.notes && <div className="small muted">📝 {sl.notes}</div>}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
