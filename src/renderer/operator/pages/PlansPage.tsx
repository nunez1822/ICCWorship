import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Assignment, PlanItem, PlanItemType, ServicePlan } from '@shared/types'
import { songName, uid } from '@shared/slides'
import { localDate, nextSunday } from '@shared/dates'
import { toastError, useApp } from '../store'
import { syncPlanSummary } from '../liveControl'
import { Field, Modal, TYPE_ICON, fmtMin, confirmDel, itemIcon } from '../../components/ui'
import { addMinutes, runSheetHtml } from '../../lib/print'
import { itemSourceMissing, playsTrack } from '../../lib/planRefs'
import { DEFAULT_ITEM_TRACK } from '@shared/tracks'
import { ItemEditor, SongPicker, ScripturePicker, MediaPicker, PresentationPicker } from './plan/ItemEditor'

const today = () => localDate()

/** the Team tab's count: positions filled by someone who still exists; open positions as "filled/total" */
function teamCount(plan: ServicePlan, people: { id: string }[]): string {
  const filled = plan.team.filter((a) => a.personId && people.some((p) => p.id === a.personId)).length
  return filled === plan.team.length ? String(filled) : `${filled}/${plan.team.length}`
}

export function newPlanFrom(template: ServicePlan | undefined, title: string): ServicePlan {
  const t = Date.now()
  return {
    id: uid(),
    title: template?.title || title,
    date: nextSunday(),
    time: template?.time || '11:00',
    serviceType: template?.serviceType || 'sunday',
    items: (template?.items || []).map((i) => ({ ...i, id: uid() })),
    team: [],
    createdAt: t,
    updatedAt: t
  }
}

export function PlansPage() {
  const { t } = useTranslation()
  const s = useApp()
  const [selId, setSelId] = useState<string | undefined>(s.focus?.page === 'plans' ? s.focus.id : s.activePlanId)
  const [showNew, setShowNew] = useState(false)
  const plans = s.plans
  const upcoming = useMemo(() => plans.filter((p) => !p.isTemplate && p.date >= today()).sort((a, b) => a.date.localeCompare(b.date)), [plans])
  const past = useMemo(() => plans.filter((p) => !p.isTemplate && p.date < today()).sort((a, b) => b.date.localeCompare(a.date)), [plans])
  const templates = useMemo(() => plans.filter((p) => p.isTemplate), [plans])
  const plan = plans.find((p) => p.id === selId)

  useEffect(() => {
    if (!plan && (upcoming[0] || past[0])) setSelId((upcoming[0] || past[0]).id)
  }, [plan, upcoming, past])

  const Group = ({ title, list }: { title: string; list: ServicePlan[] }) =>
    list.length ? (
      <>
        <div className="section-title" style={{ padding: '10px 10px 6px' }}>
          {title}
        </div>
        {list.map((p) => (
          <div key={p.id} className={`list-item ${p.id === selId ? 'on' : ''}`} onClick={() => setSelId(p.id)}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="title">{p.title}</div>
              <div className="sub">
                {p.isTemplate ? t('plans.template') : `${p.date} · ${p.time}`} · {p.items.length} {t('live.items', { count: p.items.length })}
              </div>
            </div>
            {p.id === s.activePlanId && <span className="pill gold">{t('plans.active')}</span>}
          </div>
        ))}
      </>
    ) : null

  return (
    <div className="split">
      <aside className="side">
        <div className="side-head">
          <button className="btn primary" onClick={() => setShowNew(true)}>
            ＋ {t('plans.new')}
          </button>
        </div>
        <div className="side-body">
          <Group title={t('plans.upcoming')} list={upcoming} />
          <Group title={t('plans.past')} list={past} />
          <Group title={t('plans.templates')} list={templates} />
        </div>
      </aside>
      <div className="content">
        {plan ? (
          <PlanEditor key={plan.id} plan={plan} onDeleted={() => setSelId(undefined)} onDuplicated={setSelId} />
        ) : (
          <div className="empty">{t('plans.none')}</div>
        )}
      </div>
      {showNew && (
        <NewPlanModal
          onClose={() => setShowNew(false)}
          onCreate={async (p) => {
            await s.save('plans', p)
            setSelId(p.id)
            setShowNew(false)
          }}
        />
      )}
    </div>
  )
}

function NewPlanModal({ onClose, onCreate }: { onClose: () => void; onCreate: (p: ServicePlan) => void }) {
  const { t } = useTranslation()
  // Select the stable array and derive in useMemo: a selector returning a fresh
  // array every call makes useSyncExternalStore loop forever (React error #185).
  const plans = useApp((s) => s.plans)
  const templates = useMemo(() => plans.filter((p) => p.isTemplate), [plans])
  const [tpl, setTpl] = useState(templates[0]?.id || '')
  const [date, setDate] = useState(nextSunday())
  const lang = useApp((s) => s.settings.uiLang)
  const create = () => {
    const from = templates.find((x) => x.id === tpl)
    // a blank plan is named by its date, so it is never confused with the sample plan or another blank one
    const p = newPlanFrom(from, t('plans.blankTitle', { date: readableDate(date, lang) }))
    p.date = date
    onCreate(p)
  }
  return (
    <Modal
      title={t('plans.new')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn primary" onClick={create}>
            {t('common.create')}
          </button>
        </>
      }
    >
      <div className="col">
        <Field label={t('plans.startFrom')}>
          <select className="select" value={tpl} onChange={(e) => setTpl(e.target.value)}>
            <option value="">{t('plans.blank')}</option>
            {templates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('plans.date')}>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

/** "domingo, 29 de noviembre" / "Sunday, November 29" (a plan's YYYY-MM-DD date, in the app's language) */
function readableDate(date: string, lang: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  try {
    return new Date(y, m - 1, d).toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' })
  } catch {
    return date
  }
}

const ADD_TYPES: PlanItemType[] = ['song', 'scripture', 'announcement', 'media', 'presentation', 'countdown', 'notes', 'prayer', 'header', 'blank']

function PlanEditor({ plan, onDeleted, onDuplicated }: { plan: ServicePlan; onDeleted: () => void; onDuplicated: (id: string) => void }) {
  const { t } = useTranslation()
  const s = useApp()
  const [tab, setTab] = useState<'order' | 'team' | 'details'>('order')
  const [editing, setEditing] = useState<PlanItem | null>(null)
  const [picker, setPicker] = useState<PlanItemType | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const update = async (patch: Partial<ServicePlan>) => {
    await s.save('plans', { ...plan, ...patch, updatedAt: Date.now() })
    void syncPlanSummary()
  }
  const setItems = (items: PlanItem[]) => update({ items })
  const total = plan.items.reduce((a, i) => a + (i.durationMin || 0), 0)

  const addItem = (item: PlanItem, open = false) => {
    void setItems([...plan.items, item])
    if (open) setEditing(item)
  }

  const quickAdd = (type: PlanItemType) => {
    if (type === 'song' || type === 'scripture' || type === 'media' || type === 'presentation') return setPicker(type)
    const base: PlanItem = { id: uid(), type, title: t(`types.${type}`), durationMin: type === 'header' ? 0 : type === 'notes' ? 30 : 3 }
    if (type === 'countdown') base.countdown = { mode: 'time', time: plan.time || '11:00', label: { en: 'Service begins in', es: 'El servicio comienza en' } }
    if (type === 'announcement' || type === 'notes' || type === 'prayer') base.slides = [{ title: { en: '', es: '' }, text: { en: '', es: '' } }]
    addItem(base, type !== 'blank' && type !== 'header')
  }

  const printSheet = async (mode: 'pdf' | 'print') => {
    const html = runSheetHtml(plan, {
      people: s.people,
      teams: s.teams,
      lang: s.settings.uiLang,
      churchName: s.settings.churchName,
      songs: s.songs,
      media: s.media,
      presentations: s.presentations
    })
    if (mode === 'pdf') {
      const f = await window.api.print.pdf(html, `${plan.date || 'plan'} ${plan.title}.pdf`.replace(/[\\/:*?"<>|]/g, '-'))
      if (f) s.toast(t('common.savedTo', { file: f }))
    } else await window.api.print.print(html)
  }

  let clock = plan.time || '00:00'

  return (
    <div>
      <div className="page-head">
        <input className="input big" style={{ flex: 1, fontWeight: 700 }} value={plan.title} onChange={(e) => void update({ title: e.target.value })} />
        <button
          className="btn primary lg"
          onClick={() => {
            s.setActivePlan(plan.id)
            s.setPage('live')
          }}
        >
          📺 {t('plans.present')}
        </button>
      </div>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        {!plan.isTemplate && (
          <Field label={t('plans.date')}>
            <input className="input" type="date" value={plan.date} onChange={(e) => void update({ date: e.target.value })} />
          </Field>
        )}
        <Field label={t('plans.time')}>
          <input className="input" type="time" value={plan.time} onChange={(e) => void update({ time: e.target.value })} />
        </Field>
        <Field label={t('plans.serviceType')}>
          <select className="select" value={plan.serviceType} onChange={(e) => void update({ serviceType: e.target.value })}>
            {['sunday', 'midweek', 'youth', 'special', 'other'].map((k) => (
              <option key={k} value={k}>
                {t(`serviceTypes.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <span style={{ flex: 1 }} />
        <span className="pill">⏱ {fmtMin(total)}</span>
        <button className="btn sm" onClick={() => void printSheet('pdf')}>
          📄 PDF
        </button>
        <button className="btn sm" onClick={() => void printSheet('print')}>
          🖨️ {t('plans.print')}
        </button>
        <button
          className="btn sm"
          onClick={async () => {
            // " (copy)": the two plans are told apart until the copy is renamed (also on the same date)
            const copy = { ...newPlanFrom(plan, plan.title), title: `${plan.title} (${t('plans.copy')})`, isTemplate: false }
            await s.save('plans', copy)
            onDuplicated(copy.id)
            s.toast(t('plans.duplicated'))
          }}
        >
          ⧉ {t('plans.duplicate')}
        </button>
        {!plan.isTemplate && (
          <button
            className="btn sm"
            onClick={async () => {
              const tpl = { ...newPlanFrom(plan, plan.title), isTemplate: true, date: '' }
              await s.save('plans', tpl)
              s.toast(t('plans.savedTemplate'))
            }}
          >
            ⭐ {t('plans.saveTemplate')}
          </button>
        )}
        <button
          className="btn sm ghost"
          onClick={async () => {
            // the plan the Live page is running: say so before it goes
            const onLive = s.activePlanId === plan.id
            if (!confirmDel(t(onLive ? 'plans.confirmDeleteLive' : 'plans.confirmDelete'))) return
            try {
              await s.remove('plans', plan.id)
            } catch (e) {
              return toastError(e)
            }
            if (useApp.getState().activePlanId === plan.id) {
              // pick the next upcoming plan instead of leaving the Live page pointing at nothing
              const today = localDate()
              const rest = useApp
                .getState()
                .plans.filter((p) => !p.isTemplate)
                .sort((a, b) => a.date.localeCompare(b.date))
              s.setActivePlan((rest.find((p) => p.date >= today) || rest[rest.length - 1])?.id)
            }
            onDeleted()
          }}
        >
          🗑️
        </button>
      </div>

      <div className="tabs">
        <button className={tab === 'order' ? 'on' : ''} onClick={() => setTab('order')}>
          {t('plans.order')} ({plan.items.length})
        </button>
        <button className={tab === 'team' ? 'on' : ''} onClick={() => setTab('team')}>
          {t('plans.team')} ({teamCount(plan, s.people)})
        </button>
        <button className={tab === 'details' ? 'on' : ''} onClick={() => setTab('details')}>
          {t('plans.details')}
        </button>
      </div>

      {tab === 'order' && (
        <>
          <div className="card" style={{ padding: 6 }}>
            {!plan.items.length && <div className="empty">{t('plans.emptyOrder')}</div>}
            {plan.items.map((it, idx) => {
              const start = clock
              clock = addMinutes(clock, it.durationMin || 0)
              return (
                <div
                  key={it.id}
                  className={`plan-item ${dragIdx === idx ? 'sel' : ''}`}
                  style={{ gridTemplateColumns: '20px 56px 26px 1fr 150px 70px 34px 34px', cursor: 'default' }}
                  draggable
                  onDragStart={() => setDragIdx(idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx === null || dragIdx === idx) return
                    const items = [...plan.items]
                    const [m] = items.splice(dragIdx, 1)
                    items.splice(idx, 0, m)
                    setDragIdx(null)
                    void setItems(items)
                  }}
                  onDragEnd={() => setDragIdx(null)}
                >
                  <span className="faint" style={{ cursor: 'grab' }} title={t('plans.drag')}>
                    ⋮⋮
                  </span>
                  <span className="small muted">{start}</span>
                  <span
                    className="type-ico"
                    title={itemSourceMissing(it, s) ? t('plans.sourceMissing') : playsTrack(it, s.songs) ? t('track.pill') : undefined}
                  >
                    {itemSourceMissing(it, s) ? '⚠' : itemIcon(it, s.media)}
                    {!itemSourceMissing(it, s) && playsTrack(it, s.songs) && <span aria-label={t('track.pill')}>🎧</span>}
                  </span>
                  <input
                    className="input"
                    value={it.title}
                    onChange={(e) => void setItems(plan.items.map((x) => (x.id === it.id ? { ...x, title: e.target.value } : x)))}
                  />
                  <input
                    className="input"
                    placeholder={t('plans.who')}
                    value={it.person || ''}
                    list="people-names"
                    onChange={(e) => void setItems(plan.items.map((x) => (x.id === it.id ? { ...x, person: e.target.value } : x)))}
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    title={t('plans.minutes')}
                    value={it.durationMin}
                    onChange={(e) => void setItems(plan.items.map((x) => (x.id === it.id ? { ...x, durationMin: Math.max(0, +e.target.value) } : x)))}
                  />
                  <button className="btn sm ghost icon-btn" title={t('common.edit')} onClick={() => setEditing(it)}>
                    ⚙️
                  </button>
                  <button className="btn sm ghost icon-btn" title={t('common.delete')} onClick={() => void setItems(plan.items.filter((x) => x.id !== it.id))}>
                    ✕
                  </button>
                </div>
              )
            })}
          </div>
          <datalist id="people-names">
            {s.people.map((p) => (
              <option key={p.id} value={`${p.firstName} ${p.lastName}`.trim()} />
            ))}
          </datalist>
          <div className="section-title" style={{ margin: '18px 0 8px' }}>
            {t('plans.add')}
          </div>
          <div className="row wrap">
            {ADD_TYPES.map((ty) => (
              <button key={ty} className="btn" onClick={() => quickAdd(ty)}>
                {TYPE_ICON[ty]} {t(`types.${ty}`)}
              </button>
            ))}
          </div>
        </>
      )}

      {tab === 'team' && <TeamTab plan={plan} update={update} />}

      {tab === 'details' && (
        <div className="grid2" style={{ maxWidth: 760 }}>
          <Field label={t('plans.attendance')}>
            <input
              className="input"
              type="number"
              min={0}
              value={plan.attendance ?? ''}
              onChange={(e) => void update({ attendance: e.target.value === '' ? undefined : +e.target.value })}
            />
          </Field>
          <Field label={t('plans.offering')}>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              value={plan.offering ?? ''}
              onChange={(e) => void update({ offering: e.target.value === '' ? undefined : +e.target.value })}
            />
          </Field>
          <Field label={t('plans.notes')} style={{ gridColumn: '1 / -1' }}>
            <textarea className="textarea" rows={6} value={plan.notes || ''} onChange={(e) => void update({ notes: e.target.value })} />
          </Field>
        </div>
      )}

      {editing && (
        <ItemEditor
          item={plan.items.find((x) => x.id === editing.id) || editing}
          planDate={plan.date}
          onClose={() => setEditing(null)}
          onSave={(item) => {
            void setItems(plan.items.map((x) => (x.id === item.id ? item : x)))
            setEditing(null)
          }}
        />
      )}
      {picker === 'song' && (
        <SongPicker
          onClose={() => setPicker(null)}
          onPick={(song) => {
            addItem({
              id: uid(),
              type: 'song',
              title: (s.settings.uiLang === 'es' && song.titleEs) || songName(song),
              refId: song.id,
              durationMin: 5,
              ...(song.track ? { track: DEFAULT_ITEM_TRACK } : {})
            })
            setPicker(null)
          }}
        />
      )}
      {picker === 'scripture' && (
        <ScripturePicker
          onClose={() => setPicker(null)}
          onPick={(sc, title) => {
            addItem({ id: uid(), type: 'scripture', title, scripture: sc, durationMin: 3 })
            setPicker(null)
          }}
        />
      )}
      {picker === 'media' && (
        <MediaPicker
          onClose={() => setPicker(null)}
          onPick={(m) => {
            addItem({ id: uid(), type: 'media', title: m.name, refId: m.id, durationMin: 3, video: { loop: false, autoNext: false, volume: 1 } })
            setPicker(null)
          }}
        />
      )}
      {picker === 'presentation' && (
        <PresentationPicker
          onClose={() => setPicker(null)}
          onPick={(p) => {
            addItem({ id: uid(), type: 'presentation', title: p.name, refId: p.id, durationMin: 10 })
            setPicker(null)
          }}
        />
      )}
    </div>
  )
}

function TeamTab({ plan, update }: { plan: ServicePlan; update: (p: Partial<ServicePlan>) => Promise<void> }) {
  const { t } = useTranslation()
  const s = useApp()
  const lang = s.settings.uiLang
  const setTeam = (team: Assignment[]) => update({ team })
  // people already booked in another plan on the same date
  const busy = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of s.plans) {
      if (p.id === plan.id || p.isTemplate || p.date !== plan.date) continue
      for (const a of p.team) {
        // skip empty slots and people who were deleted (no "Busy" for nobody)
        if (!a.personId || !s.people.some((x) => x.id === a.personId)) continue
        m.set(a.personId, `${p.time ? p.time + ' · ' : ''}${p.title}`)
      }
    }
    return m
  }, [s.plans, s.people, plan.id, plan.date])

  if (!s.teams.length) return <div className="empty">{t('people.noTeams')}</div>
  return (
    <div className="col" style={{ maxWidth: 900 }}>
      {s.teams.map((team) => (
        <div className="card" key={team.id}>
          <h3>{lang === 'es' ? team.nameEs : team.name}</h3>
          <table className="table">
            <tbody>
              {team.positions.map((pos) => {
                const rows = plan.team.filter((a) => a.teamId === team.id && a.position === pos)
                return (
                  <tr key={pos}>
                    <td style={{ width: 200 }} className="muted">
                      {pos}
                    </td>
                    <td>
                      <div className="col" style={{ gap: 6 }}>
                        {rows.map((a) => (
                          <div className="row" key={a.id}>
                            <select
                              className="select"
                              style={{ flex: 1 }}
                              value={a.personId}
                              onChange={(e) => void setTeam(plan.team.map((x) => (x.id === a.id ? { ...x, personId: e.target.value } : x)))}
                            >
                              <option value="">—</option>
                              {s.people.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.firstName} {p.lastName}
                                </option>
                              ))}
                            </select>
                            <select
                              className="select"
                              value={a.status}
                              onChange={(e) =>
                                void setTeam(plan.team.map((x) => (x.id === a.id ? { ...x, status: e.target.value as Assignment['status'] } : x)))
                              }
                            >
                              <option value="pending">{t('team.pending')}</option>
                              <option value="confirmed">{t('team.confirmed')}</option>
                              <option value="declined">{t('team.declined')}</option>
                            </select>
                            {busy.has(a.personId) && (
                              <span className="pill warn" title={busy.get(a.personId)}>
                                ⚠ {t('team.conflict')}
                              </span>
                            )}
                            <button className="btn sm ghost" onClick={() => void setTeam(plan.team.filter((x) => x.id !== a.id))}>
                              ✕
                            </button>
                          </div>
                        ))}
                        <div>
                          <button
                            className="btn sm ghost"
                            onClick={() => void setTeam([...plan.team, { id: uid(), teamId: team.id, position: pos, personId: '', status: 'pending' }])}
                          >
                            ＋ {t('team.assign')}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
