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
