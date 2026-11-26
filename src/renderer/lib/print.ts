import type { Person, ServicePlan, Team, Lang, Song, SongUsage } from '@shared/types'
import { playsTrack } from './planRefs'

const esc = (s: string | number | null | undefined) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

const L = {
  en: {
    order: 'Order of Service',
    time: 'Time',
    item: 'Item',
    who: 'Who',
    min: 'Min',
    notes: 'Notes',
    team: 'Team',
    total: 'Total',
    printed: 'Printed with ICCWorship — free & open-source church software',
    position: 'Position',
    person: 'Person',
    status: 'Status',
    track: 'backing track'
  },
  es: {
    order: 'Orden del Servicio',
    time: 'Hora',
    item: 'Elemento',
    who: 'Quién',
    min: 'Min',
    notes: 'Notas',
    team: 'Equipo',
    total: 'Total',
    printed: 'Impreso con ICCWorship — software libre y gratuito para iglesias',
    position: 'Puesto',
    person: 'Persona',
    status: 'Estado',
    track: 'pista de acompañamiento'
  }
}

export function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = (hhmm || '00:00').split(':').map((x) => parseInt(x, 10) || 0)
  const total = h * 60 + m + Math.round(minutes)
  const hh = Math.floor((((total % 1440) + 1440) % 1440) / 60)
  const mm = ((total % 60) + 60) % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

const STYLE = `
*{box-sizing:border-box} body{font-family:'Segoe UI',Arial,sans-serif;color:#111;margin:0;padding:0;font-size:12.5px}
h1{font-size:22px;margin:0} .sub{color:#555;margin:4px 0 16px} table{width:100%;border-collapse:collapse;margin-bottom:18px}
th{font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:#666;text-align:left;border-bottom:2px solid #222;padding:6px}
td{padding:7px 6px;border-bottom:1px solid #ddd;vertical-align:top} tr.header td{background:#f3efe4;font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.5px}
.t{white-space:nowrap;color:#444;width:60px}.m{width:44px;text-align:right}.n{color:#555;font-size:11.5px}
h2{font-size:14px;margin:18px 0 6px;border-bottom:1px solid #222;padding-bottom:4px}.foot{margin-top:20px;font-size:10px;color:#888;text-align:center}
.bi{color:#777;font-style:italic}
`

export function runSheetHtml(plan: ServicePlan, opts: { people: Person[]; teams: Team[]; lang: Lang; churchName: string; songs?: Song[] }): string {
  const l = L[opts.lang]
  const other = L[opts.lang === 'es' ? 'en' : 'es']
  let clock = plan.time || '00:00'
  const rows = plan.items
    .map((it) => {
      const start = clock
      clock = addMinutes(clock, it.durationMin || 0)
      const isHeader = it.type === 'header' && !it.slides?.length
      const detail = it.type === 'scripture' && it.scripture ? it.scripture.ref : ''
      // the sound person needs to know which songs play a backing track
      const music = playsTrack(it, opts.songs || []) ? ` <span class="n">🎧 ${l.track}</span>` : ''
      return `<tr class="${isHeader ? 'header' : ''}"><td class="t">${esc(start)}</td><td><b>${esc(it.title)}</b>${detail && detail !== it.title ? ` <span class="n">(${esc(detail)})</span>` : ''}${music}</td><td>${esc(it.person || '')}</td><td class="m">${it.durationMin || ''}</td><td class="n">${esc(it.notes || '')}</td></tr>`
    })
    .join('')
  const total = plan.items.reduce((a, i) => a + (i.durationMin || 0), 0)
  const team = plan.team
    // open slots stay (blank name: someone still has to fill them); drop deleted people
    .filter((a) => !a.personId || opts.people.some((x) => x.id === a.personId))
    .map((a) => {
      const p = opts.people.find((x) => x.id === a.personId)
      const tm = opts.teams.find((x) => x.id === a.teamId)
      return `<tr><td>${esc(opts.lang === 'es' ? tm?.nameEs : tm?.name)}</td><td>${esc(a.position)}</td><td>${esc(p ? `${p.firstName} ${p.lastName}` : '')}</td><td>${esc(a.status)}</td></tr>`
    })
    .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><style>${STYLE}</style></head><body>
<h1>${esc(plan.title)}</h1>
<div class="sub">${esc(opts.churchName)} · ${esc(plan.date)} · ${esc(plan.time)} · ${l.total}: ${total} min</div>
<table><thead><tr><th>${l.time}</th><th>${l.item} <span class="bi">/ ${other.item}</span></th><th>${l.who}</th><th class="m">${l.min}</th><th>${l.notes}</th></tr></thead><tbody>${rows}</tbody></table>
${team ? `<h2>${l.team} <span class="bi">/ ${other.team}</span></h2><table><thead><tr><th>${l.team}</th><th>${l.position}</th><th>${l.person}</th><th>${l.status}</th></tr></thead><tbody>${team}</tbody></table>` : ''}
${plan.notes ? `<h2>${l.notes}</h2><p>${esc(plan.notes).replace(/\n/g, '<br>')}</p>` : ''}
<div class="foot">${l.printed}</div>
</body></html>`
}

/** One CSV cell. Text starting with = + - @ (or tab/CR) would run as a formula in
 *  Excel / Google Sheets ("CSV injection"), so it is prefixed with ' to stay plain text. */
export function csvCell(v: string | undefined): string {
  let t = v || ''
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`
  return `"${t.replace(/"/g, '""')}"`
}

/**
 * Older versions logged one record per song per day (id "<song>@<date>"); now it's one per
 * song per service ("<song>@<date>@<plan|adhoc>"). On the day of an upgrade the same use can
 * exist in both forms — drop the old-form record when a new-form one covers that song+date.
 */
export function dedupeUsage(rows: SongUsage[]): SongUsage[] {
  const isLegacy = (u: SongUsage) => u.id === `${u.songId}@${u.date}`
  const covered = new Set(rows.filter((u) => !isLegacy(u)).map((u) => `${u.songId}@${u.date}`))
  return rows.filter((u) => !isLegacy(u) || !covered.has(u.id))
}

export function usageCsv(rows: SongUsage[]): string {
  const head = 'Date,Title,CCLI Song #'
  const body = rows.map((r) => [r.date, csvCell(r.title), r.ccli ? csvCell(r.ccli) : ''].join(',')).join('\r\n')
  return head + '\r\n' + body
}
