import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { BibleVersionInfo, Lang, PassageResult, Verse } from '@shared/types'
import { bookName } from '@shared/books'
import { bookSuggestions, formatReference, parseReference } from '@shared/scriptureRef'
import { uid } from '@shared/slides'
import { useApp } from '../store'
import { activePlan, showAdhoc, syncPlanSummary } from '../liveControl'
import { scriptureSlides } from '../../lib/buildSlides'
import { Field, confirmDel } from '../../components/ui'

type Tab = 'lookup' | 'search' | 'paste' | 'versions'

export const LBLA_PRESET = {
  id: 'lbla',
  name: 'La Biblia de las Américas',
  abbrev: 'LBLA',
  lang: 'es' as Lang,
  verseLimit: 500,
  copyright:
    'Scripture taken from La Biblia de las Américas® (LBLA®), Copyright © 1986, 1995, 1997 by The Lockman Foundation. Used by permission. www.LBLA.com'
}

export function BiblePage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('lookup')
  const [ref, setRef] = useState('')
  const [pasteRef, setPasteRef] = useState('')
  return (
    <div className="page">
      <div className="page-head">
        <h1>📖 {t('bible.title')}</h1>
      </div>
      <div className="tabs">
        {(['lookup', 'search', 'paste', 'versions'] as Tab[]).map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t(`bible.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'lookup' && (
        <Lookup
          refText={ref}
          setRefText={setRef}
          onPasteMissing={(r) => {
            setPasteRef(r)
            setTab('paste')
          }}
        />
      )}
      {tab === 'search' && (
        <Search
          onPick={(r) => {
            setRef(r)
            setTab('lookup')
          }}
        />
      )}
      {tab === 'paste' && <PasteVerses initialRef={pasteRef} />}
      {tab === 'versions' && <Versions />}
    </div>
  )
}

function VersionSelect({ value, onChange, allowNone, bibles }: { value?: string; onChange: (v?: string) => void; allowNone?: boolean; bibles: BibleVersionInfo[] }) {
  const { t } = useTranslation()
  return (
    <select className="select" value={value || ''} onChange={(e) => onChange(e.target.value || undefined)}>
      {allowNone && <option value="">{t('bible.none')}</option>}
      {bibles.map((b) => (
        <option key={b.id} value={b.id}>
          {b.abbrev} — {b.name}
          {b.source === 'pasted' ? ` (${b.verseCount || 0})` : ''}
        </option>
      ))}
    </select>
  )
}

function Lookup({ refText, setRefText, onPasteMissing }: { refText: string; setRefText: (s: string) => void; onPasteMissing: (r: string) => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const [primary, setPrimary] = useState<string | undefined>(s.settings.bibleEs)
  const [secondary, setSecondary] = useState<string | undefined>(s.settings.bibleEn)
  const [res, setRes] = useState<{ p: PassageResult; s?: PassageResult } | null>(null)
  const parsed = refText.trim() ? parseReference(refText) : null
  const bookPart = refText.replace(/\s*\d+[\d:.,\- ]*$/, '')
  const suggestions = refText && !/\d/.test(refText.replace(/^[1-3]\s*/, '')) ? [...new Set([...bookSuggestions(bookPart, s.settings.uiLang), ...bookSuggestions(bookPart, s.settings.uiLang === 'es' ? 'en' : 'es')])].slice(0, 8) : []

  const lookup = async () => {
    if (!parsed?.ok || !primary) return
    const p = await window.api.bible.passage(primary, refText)
    const sec = secondary ? await window.api.bible.passage(secondary, refText) : undefined
    setRes({ p, s: sec })
  }
  useEffect(() => {
    if (parsed?.ok) void lookup()
    else setRes(null)
  }, [refText, primary, secondary])

  const show = async () => {
    if (!primary) return
    const r = await scriptureSlides(refText, primary, secondary, { bibles: s.bibles })
    if (r.warning) s.toast(t(r.warning), 'err')
    if (r.slides.length) await showAdhoc({ title: r.reference || refText, type: 'scripture', slides: r.slides })
  }
  const add = async () => {
    const plan = activePlan()
    if (!plan || !parsed?.ok || !primary) return s.toast(t('songs.noActivePlan'), 'err')
    await s.save('plans', {
      ...plan,
      items: [...plan.items, { id: uid(), type: 'scripture', title: formatReference(parsed.ref, s.settings.uiLang), scripture: { ref: refText, primary, secondary }, durationMin: 3 }],
      updatedAt: Date.now()
    })
    void syncPlanSummary()
    s.toast(t('songs.addedToPlan', { plan: plan.date ? `${plan.date} · ${plan.title}` : plan.title }))
  }

  const pInfo = s.bibles.find((b) => b.id === primary)
  const sInfo = s.bibles.find((b) => b.id === secondary)
  const sMap = new Map((res?.s?.verses || []).map((v) => [`${v.chapter}:${v.verse}`, v.text]))
  const missing = res?.p.missing || []

  return (
    <div className="col" style={{ maxWidth: 1100 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <Field label={t('bible.reference')} style={{ flex: 1, position: 'relative' }}>
          <input className="input big" autoFocus placeholder="Juan 3:16-18 · John 3:16 · Salmos 23 · 1 Cor 13:4-7" value={refText} onChange={(e) => setRefText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void show()} />
          {suggestions.length > 0 && (
            <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
              {suggestions.map((b) => (
                <button type="button" key={b} className="chip" onClick={() => setRefText(b + ' ')}>
                  {b}
                </button>
              ))}
            </div>
          )}
        </Field>
        <Field label={t('bible.primary')}>
          <VersionSelect
            value={primary}
            onChange={(v) => {
              // picking the second language's version as main swaps them (never the same text twice)
              if (v && v === secondary) setSecondary(primary)
              setPrimary(v)
            }}
            bibles={s.bibles}
          />
        </Field>
        <Field label={t('bible.secondary')}>
          <VersionSelect
            value={secondary}
            onChange={(v) => {
              if (v && v === primary && secondary) setPrimary(secondary)
              setSecondary(v)
            }}
            allowNone
            bibles={s.bibles}
          />
        </Field>
      </div>
      {parsed && !parsed.ok && <div style={{ color: 'var(--live)' }}>⚠ {t(`bible.err.${parsed.error}`)}</div>}
      {res && (
        <>
          <div className="row">
            <h2 style={{ margin: 0, flex: 1 }}>
              {res.p.reference}
              {res.s?.ok && res.s.reference !== res.p.reference ? <span className="muted"> · {res.s.reference}</span> : null}
            </h2>
            <button className="btn live" onClick={() => void show()} disabled={!res.p.ok && !res.s?.ok}>
              ● {t('common.showNow')}
            </button>
            <button className="btn" onClick={() => void add()} disabled={!res.p.verses.length && !res.s?.verses.length && pInfo?.source !== 'pasted'}>
              ＋ {t('songs.addToPlan')}
            </button>
          </div>
          {/* e.g. "Juan 3:99": a valid-looking reference that matches no verse */}
          {!res.p.verses.length && !res.s?.verses.length && pInfo?.source !== 'pasted' && <div style={{ color: 'var(--live)' }}>⚠ {t('bible.err.notFound')}</div>}
          {missing.length > 0 && pInfo?.source === 'pasted' && (
            <div className="card row" style={{ borderColor: 'var(--warn)' }}>
              <span style={{ flex: 1 }}>
                ⚠ {t('bible.missingPasted', { count: missing.length, version: pInfo.abbrev })}
              </span>
              <button className="btn sm primary" onClick={() => onPasteMissing(refText)}>
                📋 {t('bible.pasteThem')}
              </button>
            </div>
          )}
          <div className="card" style={{ padding: 8 }}>
            <div className="verse-line" style={{ fontWeight: 700, background: 'transparent' }}>
              <div className="lang-tag">{pInfo?.abbrev}</div>
              {sInfo && <div className="lang-tag">{sInfo.abbrev}</div>}
            </div>
            {(res.p.verses.length ? res.p.verses : res.s?.verses || []).map((v) => (
              <div key={`${v.chapter}:${v.verse}`} className="verse-line" style={{ gridTemplateColumns: sInfo ? '1fr 1fr' : '1fr' }}>
                <div>
                  <sup>
                    {v.chapter}:{v.verse}
                  </sup>
                  {res.p.verses.length ? v.text : <span className="muted">—</span>}
                </div>
                {sInfo && <div>{sMap.get(`${v.chapter}:${v.verse}`) || (res.p.verses.length ? '' : v.text)}</div>}
              </div>
            ))}
          </div>
          {pInfo?.copyright && pInfo.source !== 'builtin' && <div className="small muted">{pInfo.copyright}</div>}
        </>
      )}
    </div>
  )
}

function Search({ onPick }: { onPick: (ref: string) => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const [version, setVersion] = useState<string | undefined>(s.settings.bibleEs)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Verse[]>([])
  const lang = s.bibles.find((b) => b.id === version)?.lang || 'es'
  const run = async () => version && setHits(await window.api.bible.search(version, q))
  return (
    <div className="col" style={{ maxWidth: 1000 }}>
      <div className="row">
        <input className="input big" style={{ flex: 1 }} placeholder={t('bible.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void run()} autoFocus />
        <VersionSelect value={version} onChange={setVersion} bibles={s.bibles} />
        <button className="btn primary lg" onClick={() => void run()}>
          🔍 {t('common.search')}
        </button>
      </div>
      <div className="small muted">{hits.length ? t('bible.results', { count: hits.length }) : t('bible.searchHelp')}</div>
      <div className="card" style={{ padding: 6 }}>
        {hits.map((h) => {
          const r = `${bookName(h.book, lang)} ${h.chapter}:${h.verse}`
          return (
            <div key={r} className="list-item" onClick={() => onPick(r)}>
              <div>
                <div className="title" style={{ color: 'var(--accent)' }}>
                  {r}
                </div>
                <div style={{ whiteSpace: 'normal' }}>{h.text}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PasteVerses({ initialRef }: { initialRef: string }) {
  const { t } = useTranslation()
  const s = useApp()
  const pasted = s.bibles.filter((b) => b.source === 'pasted')
  const [vid, setVid] = useState<string | undefined>(pasted[0]?.id)
  const [ref, setRef] = useState(initialRef)
  const [text, setText] = useState('')
  const [parsed, setParsed] = useState<{ verses: Verse[]; notFound: number[] } | null>(null)
  const [stored, setStored] = useState<Verse[]>([])
  const [showNew, setShowNew] = useState(false)
  const info = s.bibles.find((b) => b.id === vid)

  useEffect(() => {
    if (!vid && pasted[0]) setVid(pasted[0].id)
  }, [pasted.length])
  useEffect(() => {
    if (vid) void window.api.bible.listPasted(vid).then(setStored)
  }, [vid, s.bibles])

  const detect = async () => {
    const r = await window.api.bible.parsePaste(ref, text)
    if (r.error) return s.toast(t(`bible.err.${r.error}`), 'err')
    // include expected-but-missing verses as empty boxes so they can be typed in
    const p = parseReference(ref)
    let all = r.verses
    if (p.ok && r.notFound.length) {
      const have = new Set(r.verses.map((v) => v.verse))
      const chapter = r.verses[0]?.chapter ?? p.ref.segments[0].startChapter
      all = [...r.verses, ...r.notFound.filter((n) => !have.has(n)).map((n) => ({ book: p.ref.book.num, chapter, verse: n, text: '' }))].sort(
        (a, b) => a.chapter - b.chapter || a.verse - b.verse
      )
    }
    setParsed({ verses: all, notFound: r.notFound })
  }

  const save = async () => {
    if (!vid || !parsed) return
    const r = await window.api.bible.savePasted(vid, parsed.verses.filter((v) => v.text.trim()))
    await s.refreshBibles()
    if (r.overLimit) s.toast(t('bible.overLimit', { limit: info?.verseLimit }), 'err')
    else s.toast(t('bible.savedVerses', { count: parsed.verses.filter((v) => v.text.trim()).length }))
    setParsed(null)
    setText('')
  }

  const grouped = useMemo(() => {
    const m = new Map<string, Verse[]>()
    for (const v of stored) {
      const k = `${v.book}:${v.chapter}`
      m.set(k, [...(m.get(k) || []), v])
    }
    return [...m.entries()]
  }, [stored])

  if (!pasted.length || showNew) return <NewPastedVersion onDone={(id) => (setShowNew(false), id && setVid(id))} />

  const count = info?.verseCount || 0
  const limit = info?.verseLimit || 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 20, maxWidth: 1300 }}>
      <div className="col">
        <div className="card small muted">💡 {t('bible.pasteIntro')}</div>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <Field label={t('bible.version')}>
            <select className="select" value={vid} onChange={(e) => setVid(e.target.value)}>
              {pasted.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.abbrev} — {b.name}
                </option>
              ))}
            </select>
          </Field>
          <button className="btn sm ghost" onClick={() => setShowNew(true)}>
            ＋ {t('bible.newPasted')}
          </button>
        </div>
        <Field label={t('bible.reference')}>
          <input className="input big" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Juan 3:16-18" />
        </Field>
        <Field label={t('bible.pasteHere')}>
          <textarea className="textarea" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={'16 Porque de tal manera amó Dios al mundo… 17 Porque Dios no envió…'} />
        </Field>
        <div>
          <button className="btn primary" disabled={!ref.trim() || !text.trim()} onClick={() => void detect()}>
            ✨ {t('bible.detect')}
          </button>
        </div>
        {parsed && (
          <div className="card col">
            {parsed.notFound.length > 0 && <div style={{ color: 'var(--warn)' }}>⚠ {t('bible.notFound', { list: parsed.notFound.join(', ') })}</div>}
            {parsed.verses.map((v, i) => (
              <div key={`${v.chapter}:${v.verse}`} className="row" style={{ alignItems: 'flex-start' }}>
                <span className="pill gold" style={{ marginTop: 6 }}>
                  {v.chapter}:{v.verse}
                </span>
                <textarea
                  className="textarea"
                  style={{ flex: 1 }}
                  rows={2}
                  value={v.text}
                  onChange={(e) => setParsed({ ...parsed, verses: parsed.verses.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })}
                />
              </div>
            ))}
            <div className="row">
              <button className="btn primary" onClick={() => void save()}>
                💾 {t('bible.saveVerses')}
              </button>
              <button className="btn" onClick={() => setParsed(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="col">
        <div className="card">
          <h3>
            {info?.abbrev} · {t('bible.stored')}
          </h3>
          {limit > 0 ? (
            <>
              <div className={`meter ${count > limit ? 'over' : count > limit * 0.85 ? 'warn' : ''}`}>
                <div style={{ width: `${Math.min(100, (count / limit) * 100)}%` }} />
              </div>
              <div className="small" style={{ marginTop: 6 }}>
                {t('bible.usage', { count, limit })}
              </div>
              {count > limit ? (
                <div className="small" style={{ color: 'var(--live)', marginTop: 4 }}>{t('bible.overLimit', { limit })}</div>
              ) : (
                count > limit * 0.85 && <div className="small" style={{ color: 'var(--warn)', marginTop: 4 }}>{t('bible.nearLimit')}</div>
              )}
            </>
          ) : (
            <div className="small">{t('bible.storedCount', { count })}</div>
          )}
          {info?.copyright && <p className="small muted">{info.copyright}</p>}
        </div>
        <div className="card" style={{ padding: 8, maxHeight: 480, overflow: 'auto' }}>
          {!grouped.length && <div className="empty small">{t('bible.noneStored')}</div>}
          {grouped.map(([k, vs]) => {
            const [b, c] = k.split(':').map(Number)
            return (
              <details key={k} style={{ padding: '4px 6px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  {bookName(b, info?.lang || 'es')} {c} <span className="muted small">({vs.map((v) => v.verse).join(', ')})</span>
                </summary>
                {vs.map((v) => (
                  <div key={v.verse} className="row small" style={{ alignItems: 'flex-start', padding: '4px 0' }}>
                    <sup style={{ color: 'var(--accent)' }}>{v.verse}</sup>
                    <span style={{ flex: 1 }}>{v.text}</span>
                    <button
                      className="btn sm ghost"
                      onClick={async () => {
                        await window.api.bible.deletePastedVerse(vid!, v.book, v.chapter, v.verse)
                        await s.refreshBibles()
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </details>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function NewPastedVersion({ onDone }: { onDone: (id?: string) => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const [meta, setMeta] = useState({ name: '', abbrev: '', lang: 'es' as Lang, copyright: '', verseLimit: 500 })
  const create = async (m: typeof meta & { id?: string }) => {
    const info = await window.api.bible.createPasted({ ...m, verseLimit: m.verseLimit || undefined })
    await s.refreshBibles()
    s.toast(t('bible.versionCreated', { name: info.name }))
    onDone(info.id)
  }
  const hasLbla = s.bibles.some((b) => b.id === 'lbla')
  return (
    <div className="col" style={{ maxWidth: 760 }}>
      <div className="card">
        <h2>📋 {t('bible.pastedTitle')}</h2>
        <p className="muted">{t('bible.pastedExplain')}</p>
        {!hasLbla && (
          <button className="btn primary lg" onClick={() => void create(LBLA_PRESET)}>
            ⭐ {t('bible.createLbla')}
          </button>
        )}
      </div>
      <div className="card col">
        <h3>{t('bible.otherVersion')}</h3>
        <div className="grid2">
          <Field label={t('bible.versionName')}>
            <input className="input" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} placeholder="Nueva Versión Internacional" />
          </Field>
          <Field label={t('bible.abbrev')}>
            <input className="input" value={meta.abbrev} onChange={(e) => setMeta({ ...meta, abbrev: e.target.value })} placeholder="NVI" />
          </Field>
          <Field label={t('bible.language')}>
            <select className="select" value={meta.lang} onChange={(e) => setMeta({ ...meta, lang: e.target.value as Lang })}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label={t('bible.verseLimit')}>
            <input className="input" type="number" min={0} value={meta.verseLimit} onChange={(e) => setMeta({ ...meta, verseLimit: +e.target.value })} />
          </Field>
          <Field label={t('bible.copyrightLine')} style={{ gridColumn: '1 / -1' }}>
            <input className="input" value={meta.copyright} onChange={(e) => setMeta({ ...meta, copyright: e.target.value })} />
          </Field>
        </div>
        <div className="row">
          <button className="btn primary" disabled={!meta.name || !meta.abbrev} onClick={() => void create(meta)}>
            {t('common.create')}
          </button>
          {s.bibles.some((b) => b.source === 'pasted') && (
            <button className="btn" onClick={() => onDone()}>
              {t('common.cancel')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Versions() {
  const { t } = useTranslation()
  const s = useApp()
  const [meta, setMeta] = useState({ name: '', abbrev: '', lang: 'es' as Lang, copyright: '' })
  return (
    <div className="col" style={{ maxWidth: 900 }}>
      <div className="card">
        <h3>{t('bible.defaults')}</h3>
        <div className="grid2">
          <Field label={t('bible.defaultEs')}>
            <VersionSelect value={s.settings.bibleEs} onChange={(v) => v && void s.setSettings({ bibleEs: v })} bibles={s.bibles} />
          </Field>
          <Field label={t('bible.defaultEn')}>
            <VersionSelect value={s.settings.bibleEn} onChange={(v) => v && void s.setSettings({ bibleEn: v })} bibles={s.bibles} />
          </Field>
        </div>
      </div>
      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>{t('bible.abbrev')}</th>
              <th>{t('bible.versionName')}</th>
              <th>{t('bible.language')}</th>
              <th>{t('bible.source')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {s.bibles.map((b) => (
              <tr key={b.id}>
                <td>
                  <b>{b.abbrev}</b>
                </td>
                <td>
                  {b.name}
                  {b.copyright && <div className="small muted">{b.copyright}</div>}
                </td>
                <td>{b.lang.toUpperCase()}</td>
                <td>
                  <span className={`pill ${b.source === 'builtin' ? 'ok' : b.source === 'pasted' ? 'gold' : ''}`}>{t(`bible.src.${b.source}`)}</span>
                  {b.source === 'pasted' && <span className="small muted"> {b.verseCount}</span>}
                </td>
                <td>
                  {b.source !== 'builtin' && (
                    <button
                      className="btn sm ghost"
                      onClick={async () => {
                        if (!confirmDel(t('bible.confirmDelete', { name: b.name }))) return
                        await window.api.bible.deleteVersion(b.id)
                        await s.refreshBibles()
                      }}
                    >
                      🗑️
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card col">
        <h3>{t('bible.importTitle')}</h3>
        <p className="small muted">{t('bible.importHelp')}</p>
        <div className="grid2">
          <Field label={t('bible.versionName')}>
            <input className="input" value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
          </Field>
          <Field label={t('bible.abbrev')}>
            <input className="input" value={meta.abbrev} onChange={(e) => setMeta({ ...meta, abbrev: e.target.value })} />
          </Field>
          <Field label={t('bible.language')}>
            <select className="select" value={meta.lang} onChange={(e) => setMeta({ ...meta, lang: e.target.value as Lang })}>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </Field>
          <Field label={t('bible.copyrightLine')}>
            <input className="input" value={meta.copyright} onChange={(e) => setMeta({ ...meta, copyright: e.target.value })} />
          </Field>
        </div>
        <div>
          <button
            className="btn primary"
            disabled={!meta.name || !meta.abbrev}
            onClick={async () => {
              const r = await window.api.bible.importFile(meta)
              if (r.canceled) return
              if (!r.ok) {
                const known = ['empty', 'unsupported', 'id-taken'].includes(r.error || '')
                return s.toast(known ? t(`bible.importErr.${r.error}`) : t('bible.importFailed', { error: r.error }), 'err', 10_000)
              }
              await s.refreshBibles()
              s.toast(t('bible.imported', { name: r.info?.name }))
            }}
          >
            📂 {t('bible.chooseFile')}
          </button>
        </div>
      </div>
    </div>
  )
}
