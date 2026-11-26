import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SectionType, Song, SongSection } from '@shared/types'
import { songName, songToSlides, uid } from '@shared/slides'
import {
  detectAndParseSongFile,
  nameCopy,
  findDuplicateSong,
  sectionLabel,
  songFromPlainText,
  songToOpenLyrics,
  type SongImportError
} from '@shared/songImport'
import { useApp } from '../store'
import { showAdhoc, activePlan, syncPlanSummary, songEdited } from '../liveControl'
import { usedInPlansNote } from '../../lib/planRefs'
import { Field, Modal, confirmDel } from '../../components/ui'
import { SlideView } from '../../components/SlideView'
import { filterSongs } from '../../lib/songSearch'
import { DEFAULT_ITEM_TRACK } from '@shared/tracks'
import { BackingTrackCard } from './songs/BackingTrack'

const TYPES: SectionType[] = ['verse', 'chorus', 'pre', 'bridge', 'tag', 'intro', 'ending', 'other']

function blankSong(title: string): Song {
  const t = Date.now()
  return {
    id: uid(),
    title,
    tags: [],
    linesPerSlide: 4,
    arrangement: [],
    createdAt: t,
    updatedAt: t,
    sections: [{ id: uid().slice(0, 8), type: 'verse', label: 'Verse 1', en: '', es: '' }]
  }
}

export function SongsPage() {
  const { t } = useTranslation()
  const s = useApp()
  const [q, setQ] = useState('')
  const [selId, setSelId] = useState<string | undefined>(s.focus?.page === 'songs' ? s.focus.id : undefined)
  const [importing, setImporting] = useState(false)
  const list = useMemo(() => filterSongs(s.songs, q), [s.songs, q])
  const song = s.songs.find((x) => x.id === selId)

  useEffect(() => {
    if (!selId && list[0]) setSelId(list[0].id)
  }, [selId, list])

  return (
    <div className="split">
      <aside className="side">
        <div className="side-head">
          <input className="input" placeholder={`🔍 ${t('songs.search')}`} value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="row">
            <button
              className="btn primary"
              style={{ flex: 1 }}
              onClick={async () => {
                const n = blankSong(t('songs.newTitle'))
                // Switch the editor to the new song *before* awaiting the disk write.
                // (s.save updates the list synchronously.) Awaiting first left the old
                // song's editor on screen for a moment, so a fast typist renamed it.
                const saved = s.save('songs', n)
                setSelId(n.id)
                setQ('')
                await saved
              }}
            >
              ＋ {t('songs.new')}
            </button>
            <button className="btn" onClick={() => setImporting(true)}>
              ⬇ {t('songs.import')}
            </button>
          </div>
        </div>
        <div className="side-body">
          <div className="small muted" style={{ padding: '4px 10px' }}>
            {list.length} {t('songs.count', { count: list.length })}
          </div>
          {list.map((x) => (
            <div key={x.id} className={`list-item ${x.id === selId ? 'on' : ''}`} onClick={() => setSelId(x.id)}>
              <div style={{ minWidth: 0 }}>
                <div className="title">{x.title || x.titleEs || t('songs.untitled')}</div>
                <div className="sub">{[x.title && x.titleEs, x.author].filter(Boolean).join(' · ')}</div>
              </div>
              <span style={{ marginLeft: 'auto' }} className="row" title={t('songs.langs')}>
                {x.sections.some((z) => z.es.trim()) && <span className="pill">ES</span>}
                {x.sections.some((z) => z.en.trim()) && <span className="pill">EN</span>}
              </span>
            </div>
          ))}
        </div>
      </aside>
      <div className="content">
        {song ? <SongEditor key={song.id} song={song} onDeleted={() => setSelId(undefined)} /> : <div className="empty">{t('songs.none')}</div>}
      </div>
      {importing && (
        <ImportModal
          onClose={() => setImporting(false)}
          onDone={(id) => {
            setImporting(false)
            if (id) setSelId(id)
          }}
        />
      )}
    </div>
  )
}

function SongEditor({ song, onDeleted }: { song: Song; onDeleted: () => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const save = (patch: Partial<Song>) => {
    void s.save('songs', { ...song, ...patch, updatedAt: Date.now() })
    songEdited(song.id) // live on screen? refresh it in place
  }
  const setSection = (id: string, patch: Partial<SongSection>) => save({ sections: song.sections.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  const slides = useMemo(() => songToSlides(song, { ccliLicense: s.settings.ccliLicense }), [song, s.settings.ccliLicense])
  const theme = s.themes.find((x) => x.id === s.settings.defaultThemeId) || s.themes[0]
  const order = song.arrangement.length ? song.arrangement : song.sections.map((x) => x.id)

  const addToPlan = async () => {
    const plan = activePlan()
    if (!plan) return s.toast(t('songs.noActivePlan'), 'err')
    await s.save('plans', {
      ...plan,
      // a song with a backing track plays it in this service (switch it off in the item's options)
      items: [
        ...plan.items,
        { id: uid(), type: 'song', title: songName(song), refId: song.id, durationMin: 5, ...(song.track ? { track: DEFAULT_ITEM_TRACK } : {}) }
      ],
      updatedAt: Date.now()
    })
    void syncPlanSummary()
    s.toast(t('songs.addedToPlan', { plan: plan.date ? `${plan.date} · ${plan.title}` : plan.title }))
  }

  return (
    <div>
      <div className="page-head">
        <div className="grid2" style={{ flex: 1 }}>
          <Field label={t('songs.titleEn')}>
            <input className="input big" value={song.title} onChange={(e) => save({ title: e.target.value })} />
          </Field>
          <Field label={t('songs.titleEs')}>
            <input className="input big" value={song.titleEs || ''} onChange={(e) => save({ titleEs: e.target.value })} />
          </Field>
        </div>
      </div>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        <button className="btn live" onClick={() => void showAdhoc({ title: songName(song), type: 'song', slides, songId: song.id })}>
          ● {t('common.showNow')}
        </button>
        {song.track && (
          <button
            className="btn live"
            onClick={() => void showAdhoc({ title: songName(song), type: 'song', slides, songId: song.id, track: { src: song.track!.url, volume: 1 } })}
          >
            🎵 {t('track.showWithTrack')}
          </button>
        )}
        <button className="btn" onClick={() => void addToPlan()}>
          ＋ {t('songs.addToPlan')}
        </button>
        <button
          className="btn"
          onClick={() =>
            void window.api.files
              .saveText(`${songName(song) || 'song'}.xml`, songToOpenLyrics(song), [{ name: 'OpenLyrics', extensions: ['xml'] }])
              .then((f) => f && s.toast(t('common.savedTo', { file: f })))
          }
        >
          ⬆ {t('songs.export')}
        </button>
        <span style={{ flex: 1 }} />
        <button
          className="btn ghost"
          onClick={async () => {
            if (!confirmDel(t('songs.confirmDelete', { title: songName(song) }) + usedInPlansNote(s.plans, song.id, t))) return
            await s.remove('songs', song.id)
            onDeleted()
          }}
        >
          🗑️ {t('common.delete')}
        </button>
      </div>

      <div className="grid3" style={{ gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr', marginBottom: 18 }}>
        <Field label={t('songs.author')}>
          <input className="input" value={song.author || ''} onChange={(e) => save({ author: e.target.value })} />
        </Field>
        <Field label={t('songs.copyright')}>
          <input className="input" value={song.copyright || ''} onChange={(e) => save({ copyright: e.target.value })} />
        </Field>
        <Field label="CCLI #">
          <input className="input" value={song.ccli || ''} onChange={(e) => save({ ccli: e.target.value })} />
        </Field>
        <Field label={t('songs.key')}>
          <input className="input" value={song.key || ''} onChange={(e) => save({ key: e.target.value })} />
        </Field>
        <Field label={t('songs.linesPerSlide')}>
          <input
            className="input"
            type="number"
            min={1}
            max={12}
            value={song.linesPerSlide}
            onChange={(e) => save({ linesPerSlide: Math.max(1, +e.target.value) })}
          />
        </Field>
      </div>
      <Field label={t('songs.tags')}>
        <input
          className="input"
          value={song.tags.join(', ')}
          onChange={(e) =>
            save({
              tags: e.target.value
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
            })
          }
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 20, marginTop: 20 }}>
        <div>
          <div className="row" style={{ marginBottom: 8 }}>
            <div className="section-title" style={{ flex: 1, margin: 0 }}>
              {t('songs.sections')}
            </div>
            <span className="small muted">💡 {t('songs.chordsHelp')}</span>
          </div>
          {song.sections.map((sec, i) => (
            <div className="section-card" key={sec.id}>
              <div className="sc-head">
                <select
                  className="select"
                  style={{ height: 28 }}
                  value={sec.type}
                  onChange={(e) => setSection(sec.id, { type: e.target.value as SectionType })}
                >
                  {TYPES.map((ty) => (
                    <option key={ty} value={ty}>
                      {t(`sectionTypes.${ty}`)}
                    </option>
                  ))}
                </select>
                <input className="input" style={{ height: 28, width: 160 }} value={sec.label} onChange={(e) => setSection(sec.id, { label: e.target.value })} />
                <span style={{ flex: 1 }} />
                <button className="btn sm ghost" title={t('songs.addToArrangement')} onClick={() => save({ arrangement: [...order, sec.id] })}>
                  ↪ {t('songs.repeat')}
                </button>
                <button className="btn sm ghost" disabled={i === 0} onClick={() => save({ sections: move(song.sections, i, i - 1) })}>
                  ↑
                </button>
                <button className="btn sm ghost" disabled={i === song.sections.length - 1} onClick={() => save({ sections: move(song.sections, i, i + 1) })}>
                  ↓
                </button>
                <button
                  className="btn sm ghost"
                  onClick={() => save({ sections: song.sections.filter((x) => x.id !== sec.id), arrangement: song.arrangement.filter((x) => x !== sec.id) })}
                >
                  ✕
                </button>
              </div>
              <div className="sc-body">
                <div>
                  <span className="lang-tag">ENGLISH</span>
                  <textarea
                    className="textarea"
                    style={{ width: '100%' }}
                    rows={Math.max(4, sec.en.split('\n').length + 1)}
                    value={sec.en}
                    onChange={(e) => setSection(sec.id, { en: e.target.value })}
                  />
                </div>
                <div>
                  <span className="lang-tag">ESPAÑOL</span>
                  <textarea
                    className="textarea"
                    style={{ width: '100%' }}
                    rows={Math.max(4, sec.es.split('\n').length + 1)}
                    value={sec.es}
                    onChange={(e) => setSection(sec.id, { es: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="row wrap">
            {(['verse', 'chorus', 'bridge', 'pre', 'tag'] as SectionType[]).map((ty) => (
              <button
                key={ty}
                className="btn sm"
                onClick={() => {
                  const n = song.sections.filter((x) => x.type === ty).length + 1
                  const sec: SongSection = {
                    id: uid().slice(0, 8),
                    type: ty,
                    label: sectionLabel(ty, ty === 'verse' ? n : n > 1 ? n : undefined),
                    en: '',
                    es: ''
                  }
                  save({ sections: [...song.sections, sec], arrangement: song.arrangement.length ? [...song.arrangement, sec.id] : [] })
                }}
              >
                ＋ {t(`sectionTypes.${ty}`)}
              </button>
            ))}
          </div>

          <div className="section-title" style={{ margin: '22px 0 8px' }}>
            {t('songs.arrangement')}
          </div>
          <div className="card" style={{ padding: 12 }}>
            <div className="row wrap" style={{ gap: 6, minHeight: 28 }}>
              {order.map((id, i) => {
                const sec = song.sections.find((x) => x.id === id)
                return (
                  <button
                    type="button"
                    key={i}
                    className="chip x"
                    title={t('songs.removeFromArrangement')}
                    aria-label={`${sec?.label || '?'} — ${t('songs.removeFromArrangement')}`}
                    onClick={() => save({ arrangement: order.filter((_, j) => j !== i) })}
                  >
                    {sec?.label || '?'}
                  </button>
                )
              })}
            </div>
            <div className="row wrap small muted" style={{ marginTop: 10, gap: 6 }}>
              {t('songs.clickToAdd')}
              {song.sections.map((sec) => (
                <button type="button" key={sec.id} className="chip" onClick={() => save({ arrangement: [...order, sec.id] })}>
                  ＋ {sec.label}
                </button>
              ))}
              {song.arrangement.length > 0 && (
                <button className="btn sm ghost" onClick={() => save({ arrangement: [] })}>
                  ↺ {t('songs.resetArrangement')}
                </button>
              )}
            </div>
          </div>
          <BackingTrackCard song={song} />
        </div>
        <div className="col" style={{ position: 'sticky', top: 0, alignSelf: 'start' }}>
          <div className="section-title">
            {t('item.preview')} · {slides.length} {t('item.slides', { count: slides.length })}
          </div>
          <div className="col" style={{ maxHeight: 'calc(100vh - 220px)', overflow: 'auto', gap: 8 }}>
            {theme &&
              slides.map((sl) => (
                <div key={sl.id}>
                  <div className="small muted" style={{ marginBottom: 2 }}>
                    {sl.group}
                  </div>
                  <div className="monitor-frame">
                    <SlideView slide={sl} theme={theme} displayLang={s.live?.displayLang || 'both'} order={s.settings.bilingualOrder} thumb />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function move<T>(arr: T[], from: number, to: number): T[] {
  const c = [...arr]
  const [m] = c.splice(from, 1)
  c.splice(to, 0, m)
  return c
}

function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: (id?: string) => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const [tab, setTab] = useState<'paste' | 'files'>('paste')
  const [title, setTitle] = useState('')
  const [en, setEn] = useState('')
  const [es, setEs] = useState('')
  const [busy, setBusy] = useState(false)
  /** songs that are already in the library, waiting for Skip / Replace / Keep both */
  const [dups, setDups] = useState<{ song: Song; existing: Song }[] | null>(null)
  const [lastId, setLastId] = useState<string | undefined>()

  const importFiles = async () => {
    const paths = await window.api.files.open({
      multi: true,
      filters: [{ name: 'Songs (OpenLyrics, ChordPro, Text)', extensions: ['xml', 'cho', 'chopro', 'chordpro', 'crd', 'pro', 'txt'] }]
    })
    if (!paths.length) return
    setBusy(true)
    let last: string | undefined
    let ok = 0
    const found: { song: Song; existing: Song }[] = []
    const library = [...s.songs]
    for (const p of paths) {
      try {
        const content = await window.api.files.readText(p)
        const song = detectAndParseSongFile(p.split(/[\\/]/).pop() || p, content)
        const existing = findDuplicateSong(song, library)
        if (existing) {
          found.push({ song, existing })
          continue
        }
        await s.save('songs', song)
        library.push(song) // two copies of the same song in one batch count as a duplicate too
        last = song.id
        ok++
      } catch (e) {
        const file = p.split(/[\\/]/).pop() || p
        const code = (e as SongImportError).code
        s.toast(code ? t(`songs.importErr.${code}`, { file }) : `${file}: ${String((e as Error).message || e)}`, 'err', 8000)
      }
    }
    setBusy(false)
    if (ok) s.toast(t('songs.imported', { count: ok }))
    if (found.length) {
      setLastId(last)
      setDups(found)
      return
    }
    onDone(last)
  }

  /** what to do with every song that is already in the library */
  const resolveDups = async (choice: 'skip' | 'replace' | 'keep') => {
    if (!dups) return
    let last = lastId
    let n = 0
    // names already taken, including copies made earlier in this same import
    const taken = { titles: s.songs.map((x) => x.title), titlesEs: s.songs.map((x) => x.titleEs || '') }
    for (const { song, existing } of dups) {
      if (choice === 'skip') continue
      if (choice === 'replace') {
        // same library entry (plans keep pointing at it), new words
        // the new words replace the old ones; the song's backing track stays (recorded timing too: a later layout
        // change just stops following, with a message)
        await s.save('songs', { ...song, id: existing.id, createdAt: existing.createdAt, ...(existing.track ? { track: existing.track } : {}) })
        songEdited(existing.id) // on screen right now? show the new words
        last = existing.id
      } else {
        const copy = nameCopy(song, taken)
        await s.save('songs', copy)
        last = copy.id
      }
      n++
    }
    if (choice === 'skip') s.toast(t('songs.dupSkipped', { count: dups.length }))
    else if (choice === 'replace') s.toast(t('songs.dupReplaced', { count: n }))
    else s.toast(t('songs.imported', { count: n }))
    setDups(null)
    onDone(last)
  }

  return (
    <Modal
      wide
      title={`⬇ ${t('songs.import')}`}
      onClose={onClose}
      footer={
        tab === 'paste' ? (
          <>
            <button className="btn" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              className="btn primary"
              disabled={!en.trim() && !es.trim()}
              onClick={async () => {
                const song = songFromPlainText(title || t('songs.newTitle'), en, es)
                if (!en.trim() && es.trim()) {
                  // Spanish only: put the text in the Spanish column
                  const only = songFromPlainText(title || t('songs.newTitle'), es)
                  song.sections = only.sections.map((x) => ({ ...x, es: x.en, en: '' }))
                  song.arrangement = only.arrangement
                  // the title they typed is Spanish too (not shown twice as EN + ES)
                  song.titleEs = song.title
                  song.title = ''
                }
                await s.save('songs', song)
                onDone(song.id)
              }}
            >
              {t('common.create')}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="tabs">
        <button className={tab === 'paste' ? 'on' : ''} onClick={() => setTab('paste')}>
          {t('songs.pasteTab')}
        </button>
        <button className={tab === 'files' ? 'on' : ''} onClick={() => setTab('files')}>
          {t('songs.filesTab')}
        </button>
      </div>
      {tab === 'paste' ? (
        <div className="col">
          <Field label={t('item.title')}>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </Field>
          <div className="small muted">💡 {t('songs.pasteHelp')}</div>
          <div className="grid2">
            <div>
              <span className="lang-tag">ENGLISH</span>
              <textarea
                className="textarea"
                style={{ width: '100%' }}
                rows={16}
                value={en}
                onChange={(e) => setEn(e.target.value)}
                placeholder={'Verse 1\n...\n\nChorus\n...'}
              />
            </div>
            <div>
              <span className="lang-tag">ESPAÑOL</span>
              <textarea
                className="textarea"
                style={{ width: '100%' }}
                rows={16}
                value={es}
                onChange={(e) => setEs(e.target.value)}
                placeholder={'Verso 1\n...\n\nCoro\n...'}
              />
            </div>
          </div>
        </div>
      ) : dups ? (
        <div className="col" style={{ padding: 12 }}>
          <h3 style={{ margin: 0 }}>⚠ {t('songs.dupTitle', { count: dups.length })}</h3>
          <p className="muted" style={{ margin: 0 }}>
            {t('songs.dupHelp')}
          </p>
          <ul style={{ margin: '4px 0 8px 18px' }}>
            {dups.slice(0, 8).map(({ song, existing }) => (
              <li key={song.id}>
                <b>{songName(song)}</b>
                {existing.ccli ? ` · CCLI ${existing.ccli}` : ''}
              </li>
            ))}
            {dups.length > 8 && <li>…</li>}
          </ul>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <button className="btn primary" onClick={() => void resolveDups('skip')} title={t('songs.dupSkipHelp')}>
              {t('songs.dupSkip')}
            </button>
            <button className="btn" onClick={() => void resolveDups('replace')} title={t('songs.dupReplaceHelp')}>
              {t('songs.dupReplace')}
            </button>
            <button className="btn" onClick={() => void resolveDups('keep')} title={t('songs.dupKeepHelp')}>
              {t('songs.dupKeep')}
            </button>
          </div>
        </div>
      ) : (
        <div className="col" style={{ alignItems: 'center', padding: 20 }}>
          <p className="muted" style={{ textAlign: 'center', maxWidth: 520 }}>
            {t('songs.filesHelp')}
          </p>
          <button className="btn primary lg" disabled={busy} onClick={() => void importFiles()}>
            📂 {busy ? t('common.working') : t('songs.chooseFiles')}
          </button>
        </div>
      )}
    </Modal>
  )
}
