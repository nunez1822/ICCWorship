import { describe, expect, it } from 'vitest'
import { localDate, localStamp, nextSunday } from '@shared/dates'

describe('local dates', () => {
  it('uses the local calendar day, not the UTC one', () => {
    // 23:30 local time on Tue 24 Nov — UTC is already the 25th in the Americas
    const lateEvening = new Date(2026, 10, 24, 23, 30)
    expect(localDate(lateEvening)).toBe('2026-11-24')
    expect(localStamp(lateEvening)).toBe('2026-11-24-23-30')
  })

  it('finds the next Sunday', () => {
    expect(nextSunday(new Date(2026, 10, 24, 23, 30))).toBe('2026-11-29') // Tuesday → Sunday
    expect(nextSunday(new Date(2026, 10, 29, 10, 0))).toBe('2026-12-06') // Sunday → following Sunday
    expect(nextSunday(new Date(2026, 10, 28, 23, 59))).toBe('2026-11-29') // Saturday night
  })
})
