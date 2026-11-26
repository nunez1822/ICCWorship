import { describe, expect, it } from 'vite-plus/test'
import { csvCell, dedupeUsage, runSheetHtml, usageCsv } from '@renderer/lib/print'
import type { Person, ServicePlan, SongUsage, Team, Song } from '@shared/types'

describe('CCLI CSV', () => {
  it('neutralises spreadsheet formulas (CSV injection)', () => {
    expect(csvCell('=HYPERLINK("http://x","Click")')).toBe(`"'=HYPERLINK(""http://x"",""Click"")"`)
    expect(csvCell('+SUM(1,1)')).toBe(`"'+SUM(1,1)"`)
    expect(csvCell('@cmd')).toBe(`"'@cmd"`)
    expect(csvCell('-2')).toBe(`"'-2"`)
    expect(csvCell('Holy, Holy, Holy')).toBe('"Holy, Holy, Holy"')
  })
  it('keeps the CCLI header and quotes titles', () => {
    const csv = usageCsv([{ id: 'a', songId: 's', title: 'A "quoted" song', ccli: '123', date: '2026-11-29' }])
    expect(csv.split('\r\n')).toEqual(['Date,Title,CCLI Song #', '2026-11-29,"A ""quoted"" song","123"'])
  })
})

describe('plan clock', () => {
  it('pads hours and wraps past midnight', async () => {
    const { addMinutes } = await import('@renderer/lib/print')
    expect(addMinutes('23:57', 35)).toBe('00:32')
    expect(addMinutes('09:00', 5)).toBe('09:05')
    expect(addMinutes('10:30', 10)).toBe('10:40')
  })
})

describe('run sheet team', () => {
  const team: Team = { id: 't', name: 'Tech', nameEs: 'Técnica', positions: ['Sound', 'Projection', 'Lights'] }
  const ana: Person = { id: 'p1', firstName: 'Ana', lastName: 'Ruiz', lang: 'es', teamIds: ['t'], createdAt: 0 }
  const plan: ServicePlan = {
    id: 'pl',
    title: 'Sunday',
    date: '2026-11-29',
    time: '10:00',
    serviceType: 'Sunday',
    items: [],
    createdAt: 0,
    updatedAt: 0,
    team: [
      { id: 'a1', teamId: 't', position: 'Sound', personId: 'p1', status: 'confirmed' },
      { id: 'a2', teamId: 't', position: 'Projection', personId: '', status: 'pending' },
      { id: 'a3', teamId: 't', position: 'Lights', personId: 'deleted-person', status: 'pending' }
    ]
  }
  const html = runSheetHtml(plan, { people: [ana], teams: [team], lang: 'en', churchName: 'ICC' })
  it('lists filled and still-open positions', () => {
    expect(html).toContain('Ana Ruiz')
    expect(html).toContain('Projection')
  })
  it('drops slots whose person was deleted', () => {
    expect(html).not.toContain('Lights')
  })
  it('tells the sound person which songs play a backing track', () => {
    const songs = [
      { id: 's1', track: { url: 'u', sourceName: '', vocalsRemoved: false } },
      { id: 's2' } // no track: the plan's option alone isn't enough
    ] as Song[]
    const withSongs: ServicePlan = {
      ...plan,
      items: [
        { id: 'i1', type: 'song', title: 'With track', refId: 's1', durationMin: 4, track: { play: true, volume: 1, autoNext: false } },
        { id: 'i2', type: 'song', title: 'Band plays', refId: 's1', durationMin: 4, track: { play: false, volume: 1, autoNext: false } },
        { id: 'i3', type: 'song', title: 'No file', refId: 's2', durationMin: 4, track: { play: true, volume: 1, autoNext: false } },
        { id: 'i4', type: 'song', title: 'Older plan', refId: 's1', durationMin: 4 } // added before the track: stays silent
      ]
    }
    const out = runSheetHtml(withSongs, { people: [], teams: [], lang: 'es', churchName: 'ICC', songs })
    expect(out.match(/🎧 pista de acompañamiento/g)).toHaveLength(1)
    expect(out.indexOf('🎧')).toBeGreaterThan(out.indexOf('With track'))
    expect(out.indexOf('🎧')).toBeLessThan(out.indexOf('Band plays'))
  })
})

describe('song usage dedupe', () => {
  const u = (id: string, planId?: string): SongUsage => ({ id, songId: 'holy', title: 'Holy', date: '2026-11-29', planId })
  it('drops an old-format record when a new one covers the same song and day', () => {
    expect(dedupeUsage([u('holy@2026-11-29'), u('holy@2026-11-29@plan1', 'plan1')]).map((x) => x.id)).toEqual(['holy@2026-11-29@plan1'])
  })
  it('keeps an old-format record on its own', () => {
    expect(dedupeUsage([u('holy@2026-11-29')])).toHaveLength(1)
  })
  it('keeps two services on the same day', () => {
    expect(dedupeUsage([u('holy@2026-11-29@am', 'am'), u('holy@2026-11-29@pm', 'pm')])).toHaveLength(2)
  })
})
