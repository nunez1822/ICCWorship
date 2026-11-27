import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { SongUsage } from '@shared/types'
import { useApp } from '../store'
import { Field } from '../../components/ui'
import { dedupeUsage, usageCsv } from '../../lib/print'
import { localDate } from '@shared/dates'

export function ReportsPage() {
  const { t } = useTranslation()
  const s = useApp()
  const year = new Date().getFullYear()
  const [from, setFrom] = useState(`${year}-01-01`)
  // the whole year: numbers entered on the coming Sunday's plan show today (future plans without numbers still
  // don't count as services, see below)
  const [to, setTo] = useState(`${year}-12-31`)
  const [usage, setUsage] = useState<SongUsage[]>([])

  useEffect(() => {
    void window.api.db.list<SongUsage>('usage').then(setUsage)
  }, [])

  // a service counts once it has happened (date not in the future) or has numbers entered
  const plans = useMemo(() => {
    const today = localDate()
    return s.plans
      .filter((p) => !p.isTemplate && p.date >= from && p.date <= to && (p.date <= today || !!p.attendance || !!p.offering))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [s.plans, from, to])
  const months = useMemo(() => {
    const m = new Map<string, { attendance: number; offering: number; services: number }>()
    for (const p of plans) {
      const k = p.date.slice(0, 7)
      const cur = m.get(k) || { attendance: 0, offering: 0, services: 0 }
      cur.attendance += p.attendance || 0
      cur.offering += p.offering || 0
      cur.services += 1
      m.set(k, cur)
    }
    return [...m.entries()]
  }, [plans])
  const maxAtt = Math.max(1, ...plans.map((p) => p.attendance || 0))
  const inRange = dedupeUsage(usage)
    .filter((u) => u.date >= from && u.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date))
  const songCounts = useMemo(() => {
    const m = new Map<string, { title: string; ccli?: string; count: number }>()
    for (const u of inRange) {
      const c = m.get(u.songId) || { title: u.title, ccli: u.ccli, count: 0 }
      c.count++
      m.set(u.songId, c)
    }
    return [...m.values()].sort((a, b) => b.count - a.count)
  }, [inRange])
  const money = (n: number) => n.toLocaleString(s.settings.uiLang, { style: 'currency', currency: 'USD' })
  const totalAtt = plans.reduce((a, p) => a + (p.attendance || 0), 0)
  const counted = plans.filter((p) => p.attendance).length

  return (
    <div className="page">
      <div className="page-head">
        <h1>📊 {t('reports.title')}</h1>
        <span className="spacer" />
        <Field label={t('reports.from')}>
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={t('reports.to')}>
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>

      <div className="grid3" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="small muted">{t('reports.services')}</div>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{plans.length}</div>
        </div>
        <div className="card">
          <div className="small muted">{t('reports.avgAttendance')}</div>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{counted ? Math.round(totalAtt / counted) : '—'}</div>
        </div>
        <div className="card">
          <div className="small muted">{t('reports.totalOffering')}</div>
          <div style={{ fontSize: 30, fontWeight: 800 }}>{money(plans.reduce((a, p) => a + (p.offering || 0), 0))}</div>
        </div>
      </div>

      <div className="grid2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3>{t('reports.attendanceChart')}</h3>
          {plans.length ? (
            <div className="bar-chart">
              {plans.slice(-16).map((p) => (
                <div className="bar" key={p.id} title={`${p.date}: ${p.attendance || 0}`}>
                  <span>{p.attendance || ''}</span>
                  <div style={{ height: `${((p.attendance || 0) / maxAtt) * 100}%` }} />
                  <span>{p.date.slice(5)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty small">{t('reports.noData')}</div>
          )}
          <table className="table" style={{ marginTop: 14 }}>
            <thead>
              <tr>
                <th>{t('reports.month')}</th>
                <th>{t('reports.services')}</th>
                <th>{t('reports.attendance')}</th>
                <th>{t('reports.offering')}</th>
              </tr>
            </thead>
            <tbody>
              {months.map(([k, v]) => (
                <tr key={k}>
                  <td>{new Date(k + '-15').toLocaleDateString(s.settings.uiLang, { month: 'long', year: 'numeric' })}</td>
                  <td>{v.services}</td>
                  <td>{v.attendance}</td>
                  <td>{money(v.offering)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="small muted">💡 {t('reports.enterHelp')}</div>
        </div>
        <div className="card">
          <div className="row" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0, flex: 1 }}>{t('reports.ccli')}</h3>
            <button
              className="btn sm"
              disabled={!inRange.length}
              onClick={() =>
                void window.api.files
                  .saveText(`CCLI-song-usage-${from}-${to}.csv`, usageCsv(inRange), [{ name: 'CSV', extensions: ['csv'] }])
                  .then((f) => f && s.toast(t('common.savedTo', { file: f })))
              }
            >
              ⬇ CSV
            </button>
          </div>
          <div className="small muted" style={{ marginBottom: 8 }}>
            {t('reports.ccliHelp')}
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>{t('reports.song')}</th>
                <th>CCLI #</th>
                <th>{t('reports.times')}</th>
              </tr>
            </thead>
            <tbody>
              {songCounts.map((c) => (
                <tr key={c.title}>
                  <td>{c.title}</td>
                  <td>{c.ccli || <span className="faint">—</span>}</td>
                  <td>{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!songCounts.length && <div className="empty small">{t('reports.noUsage')}</div>}
        </div>
      </div>
    </div>
  )
}
