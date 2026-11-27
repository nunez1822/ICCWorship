import { describe, expect, it } from 'vite-plus/test'
import { LogRepeats } from '@shared/logRepeats'

describe('LogRepeats (a line repeated in a burst is written once, with a count)', () => {
  it('writes the first line, folds the repeats, and writes the count before the next line', () => {
    const r = new LogRepeats()
    expect(r.next('info', 'backup restore ok', 1000)).toEqual([{ at: 1000, level: 'info', text: 'backup restore ok' }])
    expect(r.next('info', 'backup restore ok', 2000)).toEqual([])
    expect(r.pending).toBe(true)
    expect(r.next('error', 'backup failed EPERM', 3000)).toEqual([
      // the count carries the repeated line's level, never the next line's
      { at: 2000, level: 'info', text: '(last message repeated 1 more times)' },
      { at: 3000, level: 'error', text: 'backup failed EPERM' }
    ])
  })
  it('the same text at another level is a new line', () => {
    const r = new LogRepeats()
    r.next('info', 'x', 0)
    expect(r.next('warn', 'x', 1)).toEqual([{ at: 1, level: 'warn', text: 'x' }])
  })
  it('flush writes a waiting count once (the burst went quiet, or the app exits)', () => {
    const r = new LogRepeats()
    r.next('warn', 'net down', 0)
    r.next('warn', 'net down', 5)
    r.next('warn', 'net down', 9)
    expect(r.flush()).toEqual({ at: 9, level: 'warn', text: '(last message repeated 2 more times)' })
    expect(r.flush()).toBeUndefined()
    // after a flush, the same line again is folded into a new count, not written again
    expect(r.next('warn', 'net down', 10)).toEqual([])
    expect(r.flush()?.text).toBe('(last message repeated 1 more times)')
  })
  it('a repeat after the window is a new line', () => {
    const r = new LogRepeats(60_000)
    r.next('info', 'tick', 0)
    expect(r.next('info', 'tick', 60_000)).toEqual([{ at: 60_000, level: 'info', text: 'tick' }])
  })
})
