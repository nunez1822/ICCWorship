import { describe, expect, it } from 'vitest'
import { csvCell, usageCsv } from '@renderer/lib/print'

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
