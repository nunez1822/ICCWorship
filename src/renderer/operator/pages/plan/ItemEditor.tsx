import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem, PlanItem, Presentation, Slide, Song, Theme, Background } from '@shared/types'
import { parseReference, formatReference } from '@shared/scriptureRef'
import { useApp } from '../../store'
import { Field, Modal, TYPE_ICON } from '../../../components/ui'
import { SlideView } from '../../../components/SlideView'
import { buildItem } from '../../../lib/buildSlides'
import { toMediaUrl } from '../../../lib/media'

export function ItemEditor({ item, onClose, onSave }: { item: PlanItem; onClose: () => void; onSave: (i: PlanItem) => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const [it, setIt] = useState<PlanItem>(item)
  const set = (patch: Partial<PlanItem>) => setIt((x) => ({ ...x, ...patch }))
  const images = s.media.filter((m) => m.kind === 'image')

  return (
    <Modal
      wide
      title={
        <>
          {TYPE_ICON[it.type]} {t(`types.${it.type}`)}
        </>
      }
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={() => onSave(it)}>
            {t('common.save')}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        <div className="col">
          <div className="grid2">
            <Field label={t('item.title')}>
              <input className="input" value={it.title} onChange={(e) => set({ title: e.target.value })} />
            </Field>
            <div className="row">
              <Field label={t('plans.minutes')} style={{ width: 90 }}>
                <input className="input" type="number" min={0} value={it.durationMin} onChange={(e) => set({ durationMin: +e.target.value })} />
              </Field>
              <Field label={t('plans.who')} style={{ flex: 1 }}>
                <input className="input" value={it.person || ''} onChange={(e) => set({ person: e.target.value })} />
              </Field>
            </div>
          </div>

          {it.type === 'song' && (
            <Field label={t('types.song')}>
              <select className="select" value={it.refId} onChange={(e) => set({ refId: e.target.value })}>
                {s.songs.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.title}
                    {x.titleEs ? ` / ${x.titleEs}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {it.type === 'scripture' && (
            <ScriptureFields
              value={it.scripture || { ref: '', primary: s.settings.bibleEs, secondary: s.settings.bibleEn }}
              onChange={(sc) => set({ scripture: sc, title: followRefTitle(it, sc.ref, s.settings.uiLang) })}
            />
          )}

          {(it.type === 'announcement' || it.type === 'notes' || it.type === 'prayer' || it.type === 'header') && (
            <>
              {it.type === 'notes' && <div className="small muted">💡 {t('item.blanksHelp')}</div>}
              {it.type === 'announcement' && (
                <Field label={t('item.loopSeconds')}>
                  <input className="input" type="number" min={0} style={{ width: 120 }} value={it.loopSeconds || 0} onChange={(e) => set({ loopSeconds: +e.target.value })} />
                </Field>
              )}
              {(it.slides || []).map((sl, i) => (
                <div className="section-card" key={i}>
                  <div className="sc-head">
                    <b className="small">
                      {t('item.slide')} {i + 1}
                    </b>
                    <span style={{ flex: 1 }} />
                    {images.length > 0 && (
                      <select
                        className="select"
                        style={{ height: 28 }}
                        value={sl.media || ''}
                        onChange={(e) => set({ slides: it.slides!.map((x, j) => (j === i ? { ...x, media: e.target.value || undefined } : x)) })}
                      >
                        <option value="">{t('item.noImage')}</option>
                        {images.map((m) => (
                          <option key={m.id} value={toMediaUrl(m.path)}>
                            🖼 {m.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <button className="btn sm ghost" disabled={i === 0} onClick={() => set({ slides: swap(it.slides!, i, i - 1) })}>
                      ↑
                    </button>
                    <button className="btn sm ghost" onClick={() => set({ slides: it.slides!.filter((_, j) => j !== i) })}>
                      ✕
                    </button>
                  </div>
                  <div className="sc-body">
                    {(['es', 'en'] as const).map((lang) => (
                      <div key={lang} className="col" style={{ gap: 6 }}>
                        <span className="lang-tag">{lang === 'es' ? 'ESPAÑOL' : 'ENGLISH'}</span>
                        <input
                          className="input"
                          placeholder={t('item.slideTitle')}
                          value={sl.title?.[lang] || ''}
                          onChange={(e) => set({ slides: it.slides!.map((x, j) => (j === i ? { ...x, title: { ...x.title, [lang]: e.target.value } } : x)) })}
                        />
                        <textarea
                          className="textarea"
                          rows={3}
                          placeholder={t('item.slideText')}
                          value={sl.text?.[lang] || ''}
                          onChange={(e) => set({ slides: it.slides!.map((x, j) => (j === i ? { ...x, text: { ...x.text, [lang]: e.target.value } } : x)) })}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <button className="btn sm" onClick={() => set({ slides: [...(it.slides || []), { title: { en: '', es: '' }, text: { en: '', es: '' } }] })}>
                  ＋ {t('item.addSlide')}
                </button>
              </div>
            </>
          )}

          {it.type === 'media' && (
            <>
              <Field label={t('types.media')}>
                <select className="select" value={it.refId} onChange={(e) => set({ refId: e.target.value, title: s.media.find((m) => m.id === e.target.value)?.name || it.title })}>
                  {s.media.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.kind === 'video' ? '🎬' : m.kind === 'audio' ? '🎧' : '🖼'} {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              {s.media.find((m) => m.id === it.refId)?.kind !== 'image' && (
                <div className="row wrap">
                  <label className="check">
                    <input type="checkbox" checked={!!it.video?.loop} onChange={(e) => set({ video: { ...defVideo(it), loop: e.target.checked } })} /> {t('item.loop')}
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={!!it.video?.autoNext} onChange={(e) => set({ video: { ...defVideo(it), autoNext: e.target.checked } })} /> {t('item.autoNext')}
                  </label>
                  <label className="check">
                    🔊
                    <input type="range" min={0} max={1} step={0.05} value={it.video?.volume ?? 1} onChange={(e) => set({ video: { ...defVideo(it), volume: +e.target.value } })} />
                  </label>
                </div>
              )}
            </>
          )}

          {it.type === 'presentation' && (
            <Field label={t('types.presentation')}>
              <select className="select" value={it.refId} onChange={(e) => set({ refId: e.target.value })}>
                {s.presentations.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.slides.length})
                  </option>
                ))}
              </select>
            </Field>
          )}

          {it.type === 'countdown' && (
            <div className="col">
              <div className="row">
                <label className="check">
                  <input type="radio" checked={it.countdown?.mode !== 'duration'} onChange={() => set({ countdown: { ...it.countdown, mode: 'time' } })} /> {t('item.untilTime')}
                </label>
                <input className="input" type="time" value={it.countdown?.time || '11:00'} onChange={(e) => set({ countdown: { ...it.countdown!, mode: 'time', time: e.target.value } })} />
                <label className="check" style={{ marginLeft: 20 }}>
                  <input type="radio" checked={it.countdown?.mode === 'duration'} onChange={() => set({ countdown: { ...it.countdown, mode: 'duration', minutes: it.countdown?.minutes || 5 } })} />{' '}
                  {t('item.forMinutes')}
                </label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  style={{ width: 80 }}
                  value={it.countdown?.minutes || 5}
                  onChange={(e) => set({ countdown: { ...it.countdown!, mode: 'duration', minutes: +e.target.value } })}
                />
              </div>
              <div className="grid2">
                <Field label={`${t('item.label')} (ES)`}>
                  <input className="input" value={it.countdown?.label?.es || ''} onChange={(e) => set({ countdown: { ...it.countdown!, label: { ...it.countdown?.label, es: e.target.value } } })} />
                </Field>
                <Field label={`${t('item.label')} (EN)`}>
                  <input className="input" value={it.countdown?.label?.en || ''} onChange={(e) => set({ countdown: { ...it.countdown!, label: { ...it.countdown?.label, en: e.target.value } } })} />
                </Field>
              </div>
            </div>
          )}

          <div className="grid2">
            <Field label={t('item.theme')}>
              <select className="select" value={it.themeId || ''} onChange={(e) => set({ themeId: e.target.value || undefined })}>
                <option value="">{t('item.defaultTheme')}</option>
                {s.themes.map((th) => (
                  <option key={th.id} value={th.id}>
                    {th.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('item.background')}>
              <select className="select" value={it.backgroundMediaId || ''} onChange={(e) => set({ backgroundMediaId: e.target.value || undefined })}>
                <option value="">{t('item.themeBackground')}</option>
                {s.media
                  .filter((m) => m.kind !== 'audio')
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.kind === 'video' ? '🎬' : '🖼'} {m.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <Field label={t('item.notes')}>
            <textarea className="textarea" rows={2} value={it.notes || ''} onChange={(e) => set({ notes: e.target.value })} placeholder={t('item.notesHelp')} />
          </Field>
        </div>
        <ItemPreview item={it} />
      </div>
    </Modal>
  )
}

const defVideo = (it: PlanItem) => it.video || { loop: false, autoNext: false, volume: 1 }

function swap<T>(arr: T[], a: number, b: number): T[] {
  const c = [...arr]
  ;[c[a], c[b]] = [c[b], c[a]]
  return c
}

export function ItemPreview({ item }: { item: PlanItem }) {
  const { t } = useTranslation()
  const s = useApp()
  const [built, setBuilt] = useState<{ slides: Slide[]; theme: Theme; background: Background | null } | null>(null)
  useEffect(() => {
    let cancel = false
    const h = setTimeout(() => {
      void buildItem(item, { songs: s.songs, media: s.media, presentations: s.presentations, themes: s.themes, settings: s.settings, bibles: s.bibles }).then((b) => !cancel && setBuilt(b))
    }, 250)
    return () => {
      cancel = true
      clearTimeout(h)
    }
  }, [item])
  return (
    <div className="col" style={{ position: 'sticky', top: 0, alignSelf: 'start' }}>
      <div className="section-title">
        {t('item.preview')} · {built?.slides.length || 0} {t('item.slides')}
      </div>
      {built?.slides.slice(0, 4).map((sl) => (
        <div key={sl.id} className="monitor-frame">
          <SlideView slide={sl} theme={built.theme} background={built.background} displayLang={s.live?.displayLang || 'both'} order={s.settings.bilingualOrder} thumb />
        </div>
      ))}
      {built && built.slides.length > 4 && <div className="small muted">+ {built.slides.length - 4}</div>}
    </div>
  )
}

/** Names a reference could have been shown as (any UI language, or as typed). */
function refTitles(ref: string | undefined): string[] {
  if (!ref) return ['']
  const p = parseReference(ref)
  return [ref, ...(p.ok ? [formatReference(p.ref, 'en'), formatReference(p.ref, 'es')] : [])]
}

/** When the reference changes, an auto-named item ("John 3:16-17") follows it — otherwise
 *  the stage and top bar kept the old reference while the projector showed the new one.
 *  A title the user typed themselves is left alone. */
function followRefTitle(item: PlanItem, newRef: string, lang: 'en' | 'es'): string {
  const auto = refTitles(item.scripture?.ref).includes(item.title.trim())
  if (!auto) return item.title
  const p = parseReference(newRef)
  return p.ok ? formatReference(p.ref, lang) : newRef
}

export function ScriptureFields({ value, onChange }: { value: { ref: string; primary: string; secondary?: string }; onChange: (v: { ref: string; primary: string; secondary?: string }) => void }) {
  const { t } = useTranslation()
  const bibles = useApp((s) => s.bibles)
  const parsed = value.ref ? parseReference(value.ref) : null
  return (
    <div className="col">
      <Field label={t('bible.reference')}>
        <input className="input big" placeholder="Juan 3:16-18 · John 3:16 · Sal 23" value={value.ref} onChange={(e) => onChange({ ...value, ref: e.target.value })} autoFocus />
      </Field>
      {parsed && !parsed.ok && <div className="small" style={{ color: 'var(--live)' }}>⚠ {t(`bible.err.${parsed.error}`)}</div>}
      {parsed?.ok && (
        <div className="small muted">
          ✓ {formatReference(parsed.ref, 'es')} · {formatReference(parsed.ref, 'en')}
        </div>
      )}
      <div className="grid2">
        <Field label={t('bible.primary')}>
          <select className="select" value={value.primary} onChange={(e) => onChange({ ...value, primary: e.target.value })}>
            {bibles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.abbrev} — {b.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('bible.secondary')}>
          <select className="select" value={value.secondary || ''} onChange={(e) => onChange({ ...value, secondary: e.target.value || undefined })}>
            <option value="">{t('bible.none')}</option>
            {bibles.map((b) => (
              <option key={b.id} value={b.id}>
                {b.abbrev} — {b.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  )
}

/* ------------------------------ pickers ------------------------------ */

export function SongPicker({ onClose, onPick }: { onClose: () => void; onPick: (s: Song) => void }) {
  const { t } = useTranslation()
  const songs = useApp((s) => s.songs)
  const [q, setQ] = useState('')
  const list = useMemo(() => filterSongs(songs, q), [songs, q])
  return (
    <Modal title={`🎵 ${t('types.song')}`} onClose={onClose}>
      <input className="input big" style={{ width: '100%', marginBottom: 10 }} autoFocus placeholder={t('songs.search')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && list[0] && onPick(list[0])} />
      <div className="list" style={{ maxHeight: 420, overflow: 'auto' }}>
        {list.map((s) => (
          <div key={s.id} className="list-item" onClick={() => onPick(s)}>
            <div style={{ minWidth: 0 }}>
              <div className="title">
                {s.title}
                {s.titleEs ? <span className="muted"> / {s.titleEs}</span> : null}
              </div>
              <div className="sub">{s.author}</div>
            </div>
          </div>
        ))}
        {!list.length && <div className="empty">{t('songs.noResults')}</div>}
      </div>
    </Modal>
  )
}

export function filterSongs(songs: Song[], q: string): Song[] {
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const n = norm(q.trim())
  const sorted = [...songs].sort((a, b) => a.title.localeCompare(b.title))
  if (!n) return sorted
  const score = (s: Song) => {
    const title = norm(`${s.title} ${s.titleEs || ''}`)
    if (title.startsWith(n)) return 3
    if (title.includes(n)) return 2
    const body = norm(s.sections.map((x) => `${x.en} ${x.es}`).join(' ') + ' ' + (s.author || '') + ' ' + s.tags.join(' ') + ' ' + (s.ccli || ''))
    return body.includes(n) ? 1 : 0
  }
  return sorted
    .map((s) => ({ s, sc: score(s) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .map((x) => x.s)
}

export function ScripturePicker({ onClose, onPick }: { onClose: () => void; onPick: (sc: { ref: string; primary: string; secondary?: string }, title: string) => void }) {
  const { t } = useTranslation()
  const settings = useApp((s) => s.settings)
  const [v, setV] = useState({ ref: '', primary: settings.bibleEs, secondary: settings.bibleEn as string | undefined })
  const parsed = v.ref ? parseReference(v.ref) : null
  const ok = parsed?.ok
  return (
    <Modal
      title={`📖 ${t('types.scripture')}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" disabled={!ok} onClick={() => ok && onPick(v, formatReference(parsed.ref, settings.uiLang))}>
            {t('common.add')}
          </button>
        </>
      }
    >
      <ScriptureFields value={v} onChange={(x) => setV({ ...x, secondary: x.secondary })} />
    </Modal>
  )
}

export function MediaPicker({ onClose, onPick, kinds }: { onClose: () => void; onPick: (m: MediaItem) => void; kinds?: MediaItem['kind'][] }) {
  const { t } = useTranslation()
  const allMedia = useApp((s) => s.media)
  const media = useMemo(() => allMedia.filter((m) => !kinds || kinds.includes(m.kind)), [allMedia, kinds])
  return (
    <Modal wide title={`🎬 ${t('types.media')}`} onClose={onClose}>
      {!media.length && <div className="empty">{t('media.empty')}</div>}
      <div className="media-grid">
        {media.map((m) => (
          <div key={m.id} className="media-card" onClick={() => onPick(m)}>
            <div className="mthumb" style={m.thumb ? { backgroundImage: `url(${m.thumb})` } : undefined}>
              {!m.thumb && (m.kind === 'audio' ? '🎧' : m.kind === 'video' ? '🎬' : '🖼')}
            </div>
            <div className="mcap">{m.name}</div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function PresentationPicker({ onClose, onPick }: { onClose: () => void; onPick: (p: Presentation) => void }) {
  const { t } = useTranslation()
  const list = useApp((s) => s.presentations)
  return (
    <Modal title={`🖼️ ${t('types.presentation')}`} onClose={onClose}>
      {!list.length && <div className="empty">{t('media.noPresentations')}</div>}
      <div className="list">
        {list.map((p) => (
          <div key={p.id} className="list-item" onClick={() => onPick(p)}>
            <div>
              <div className="title">{p.name}</div>
              <div className="sub">
                {p.slides.length} {t('item.slides')} · {t(`media.method.${p.method}`)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
