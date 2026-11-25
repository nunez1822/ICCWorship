import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Lang, Person, PrayerRequest, Team } from '@shared/types'
import { uid } from '@shared/slides'
import { localDate } from '@shared/dates'
import { useApp } from '../store'
import { activePlan, showAdhoc, syncPlanSummary } from '../liveControl'
import { Field, Seg, confirmDel } from '../../components/ui'

type Tab = 'people' | 'teams' | 'prayer'

export function PeoplePage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<Tab>('people')
  return (
    <div className="page">
      <div className="page-head">
        <h1>👥 {t('people.title')}</h1>
      </div>
      <div className="tabs">
        {(['people', 'teams', 'prayer'] as Tab[]).map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t(`people.tab.${k}`)}
          </button>
        ))}
      </div>
      {tab === 'people' && <People />}
      {tab === 'teams' && <Teams />}
      {tab === 'prayer' && <Prayer />}
    </div>
  )
}

function People() {
  const { t } = useTranslation()
  const s = useApp()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<string | undefined>()
  const list = useMemo(() => {
    const n = q.toLowerCase()
    return [...s.people]
      .filter((p) => !n || `${p.firstName} ${p.lastName} ${p.phone} ${p.email}`.toLowerCase().includes(n))
      .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
  }, [s.people, q])
  const person = s.people.find((p) => p.id === sel)
  const save = (p: Person) => void s.save('people', p)
  const lang = s.settings.uiLang

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 20 }}>
      <div className="col">
        <div className="row">
          <input className="input" style={{ flex: 1 }} placeholder={`🔍 ${t('common.search')}`} value={q} onChange={(e) => setQ(e.target.value)} />
          <button
            className="btn primary"
            onClick={async () => {
              const p: Person = { id: uid(), firstName: t('people.newPerson'), lastName: '', lang: s.settings.uiLang, teamIds: [], createdAt: Date.now() }
              await s.save('people', p)
              setSel(p.id)
            }}
          >
            ＋ {t('people.add')}
          </button>
        </div>
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>{t('people.name')}</th>
                <th>{t('people.phone')}</th>
                <th>{t('people.email')}</th>
                <th>{t('people.teams')}</th>
                <th>{t('people.language')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} onClick={() => setSel(p.id)} style={{ cursor: 'pointer', background: p.id === sel ? 'var(--panel-2)' : undefined }}>
                  <td>
                    <b>
                      {p.firstName} {p.lastName}
                    </b>
                  </td>
                  <td>{p.phone}</td>
                  <td>{p.email}</td>
                  <td className="small">
                    {p.teamIds
                      .map((id) => s.teams.find((x) => x.id === id))
                      .filter(Boolean)
                      .map((tm) => (lang === 'es' ? tm!.nameEs : tm!.name))
                      .join(', ')}
                  </td>
                  <td>{p.lang.toUpperCase()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.length && <div className="empty">{t('people.empty')}</div>}
        </div>
      </div>
      {person && (
        <div className="card col" style={{ position: 'sticky', top: 0, alignSelf: 'start' }}>
          <div className="grid2">
            <Field label={t('people.firstName')}>
              <input className="input" value={person.firstName} onChange={(e) => save({ ...person, firstName: e.target.value })} autoFocus />
            </Field>
            <Field label={t('people.lastName')}>
              <input className="input" value={person.lastName} onChange={(e) => save({ ...person, lastName: e.target.value })} />
            </Field>
          </div>
          <Field label={t('people.phone')}>
            <input className="input" value={person.phone || ''} onChange={(e) => save({ ...person, phone: e.target.value })} />
          </Field>
          <Field label={t('people.email')}>
            <input className="input" value={person.email || ''} onChange={(e) => save({ ...person, email: e.target.value })} />
          </Field>
          <Field label={t('people.language')}>
            <Seg<Lang> value={person.lang} onChange={(v) => save({ ...person, lang: v })} options={[{ value: 'es', label: 'Español' }, { value: 'en', label: 'English' }]} />
          </Field>
          <Field label={t('people.teams')}>
            <div className="row wrap" style={{ gap: 6 }}>
              {s.teams.map((tm) => (
                <label key={tm.id} className="check small">
                  <input
                    type="checkbox"
                    checked={person.teamIds.includes(tm.id)}
                    onChange={(e) => save({ ...person, teamIds: e.target.checked ? [...person.teamIds, tm.id] : person.teamIds.filter((x) => x !== tm.id) })}
                  />
                  {lang === 'es' ? tm.nameEs : tm.name}
                </label>
              ))}
            </div>
          </Field>
          <Field label={t('item.notes')}>
            <textarea className="textarea" rows={3} value={person.notes || ''} onChange={(e) => save({ ...person, notes: e.target.value })} />
          </Field>
          <button
            className="btn ghost"
            onClick={async () => {
              if (!confirmDel(t('people.confirmDelete'))) return
              await s.remove('people', person.id)
              setSel(undefined)
            }}
          >
            🗑️ {t('common.delete')}
          </button>
        </div>
      )}
    </div>
  )
}

function Teams() {
  const { t } = useTranslation()
  const s = useApp()
  const save = (tm: Team) => void s.save('teams', tm)
  return (
    <div className="col" style={{ maxWidth: 900 }}>
      {s.teams.map((tm) => (
        <div key={tm.id} className="card col">
          <div className="grid2">
            <Field label="English">
              <input className="input" value={tm.name} onChange={(e) => save({ ...tm, name: e.target.value })} />
            </Field>
            <Field label="Español">
              <input className="input" value={tm.nameEs} onChange={(e) => save({ ...tm, nameEs: e.target.value })} />
            </Field>
          </div>
          <Field label={t('people.positions')}>
            <div className="row wrap" style={{ gap: 6 }}>
              {tm.positions.map((p, i) => (
                <span key={i} className="chip x" onClick={() => save({ ...tm, positions: tm.positions.filter((_, j) => j !== i) })}>
                  {p}
                </span>
              ))}
              <input
                className="input"
                style={{ height: 28, width: 200 }}
                placeholder={`＋ ${t('people.addPosition')}`}
                onKeyDown={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim()
                  if (e.key === 'Enter' && v) {
                    save({ ...tm, positions: [...tm.positions, v] })
                    ;(e.target as HTMLInputElement).value = ''
                  }
                }}
              />
            </div>
          </Field>
          <div className="row">
            <span className="small muted" style={{ flex: 1 }}>
              {s.people.filter((p) => p.teamIds.includes(tm.id)).length} {t('people.members')}
            </span>
            <button
              className="btn sm ghost"
              onClick={async () => {
                if (confirmDel(t('people.confirmDeleteTeam'))) await s.remove('teams', tm.id)
              }}
            >
              🗑️
            </button>
          </div>
        </div>
      ))}
      <div>
        <button className="btn primary" onClick={() => void s.save('teams', { id: uid(), name: 'New team', nameEs: 'Nuevo equipo', positions: [] })}>
          ＋ {t('people.addTeam')}
        </button>
      </div>
    </div>
  )
}

function Prayer() {
  const { t } = useTranslation()
  const s = useApp()
  const [filter, setFilter] = useState<'open' | 'answered'>('open')
  const [name, setName] = useState('')
  const [req, setReq] = useState('')
  const [priv, setPriv] = useState(false)
  const list = s.prayer.filter((p) => p.status === filter).sort((a, b) => b.date.localeCompare(a.date))
  const publicOpen = s.prayer.filter((p) => p.status === 'open' && !p.private)

  const addPrayerItem = async () => {
    const plan = activePlan()
    if (!plan) return s.toast(t('songs.noActivePlan'), 'err')
    const slides = publicOpen.map((p) => ({ title: { en: 'Prayer', es: 'Oración' }, text: { en: `${p.name}: ${p.request}`, es: `${p.name}: ${p.request}` } }))
    await s.save('plans', { ...plan, items: [...plan.items, { id: uid(), type: 'prayer', title: t('people.prayerSlides'), slides, durationMin: 5 }], updatedAt: Date.now() })
    void syncPlanSummary()
    s.toast(t('songs.addedToPlan', { plan: plan.title }))
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '380px minmax(0,1fr)', gap: 20 }}>
      <div className="card col" style={{ alignSelf: 'start' }}>
        <h3>🙏 {t('people.newRequest')}</h3>
        <Field label={t('people.name')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('people.request')}>
          <textarea className="textarea" rows={4} value={req} onChange={(e) => setReq(e.target.value)} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> 🔒 {t('people.private')}
        </label>
        <button
          className="btn primary"
          disabled={!req.trim()}
          onClick={async () => {
            await s.save('prayer', { id: uid(), name: name.trim() || t('people.anonymous'), request: req.trim(), date: localDate(), status: 'open', private: priv } satisfies PrayerRequest)
            setName('')
            setReq('')
            setPriv(false)
          }}
        >
          {t('common.add')}
        </button>
        <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
        <div className="small muted">{t('people.prayerSlidesHelp', { count: publicOpen.length })}</div>
        <div className="row">
          <button className="btn" disabled={!publicOpen.length} onClick={() => void addPrayerItem()}>
            ＋ {t('songs.addToPlan')}
          </button>
          <button
            className="btn live"
            disabled={!publicOpen.length}
            onClick={() =>
              void showAdhoc({
                title: t('people.prayerSlides'),
                type: 'prayer',
                slides: publicOpen.map((p) => ({ id: uid(), kind: 'text', title: { en: 'Prayer', es: 'Oración' }, text: { en: `${p.name}: ${p.request}`, es: `${p.name}: ${p.request}` } }))
              })
            }
          >
            ● {t('common.showNow')}
          </button>
        </div>
      </div>
      <div className="col">
        <Seg value={filter} onChange={setFilter} options={[{ value: 'open', label: t('people.open') }, { value: 'answered', label: `🙌 ${t('people.answered')}` }]} />
        {!list.length && <div className="empty">{t('people.noRequests')}</div>}
        {list.map((p) => (
          <div key={p.id} className="card row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div className="row">
                <b>{p.name}</b>
                <span className="small muted">{p.date}</span>
                {p.private && <span className="pill">🔒 {t('people.private')}</span>}
              </div>
              <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{p.request}</div>
            </div>
            <button className="btn sm" onClick={() => void s.save('prayer', { ...p, status: p.status === 'open' ? 'answered' : 'open' })}>
              {p.status === 'open' ? `🙌 ${t('people.markAnswered')}` : `↺ ${t('people.reopen')}`}
            </button>
            <button className="btn sm ghost" onClick={async () => confirmDel(t('people.confirmDeleteRequest')) && (await s.remove('prayer', p.id))}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
