import { describe, expect, it } from 'vite-plus/test'
import { RESUME_MAX_AGE_MS, resumeOfferFrom, snapshotChanged, snapshotOf } from '@shared/session'
import { restoreWindowState } from '@shared/windowState'

const NOW = 1_800_000_000_000
const onScreen = { planId: 'p1', itemId: 'i3', itemIndex: 2, slideIndex: 4, itemTitle: 'Cuán grande es Él', planTitle: 'Domingo', clearedFrom: undefined }

describe('snapshotOf', () => {
  it('remembers a plan item with a slide on screen', () => {
    expect(snapshotOf(onScreen, NOW)).toEqual({
      planId: 'p1',
      itemId: 'i3',
      itemIndex: 2,
      slideIndex: 4,
      itemTitle: 'Cuán grande es Él',
      planTitle: 'Domingo',
      at: NOW
    })
  })
  it('after Esc, remembers the slide Space would bring back', () => {
    expect(snapshotOf({ ...onScreen, slideIndex: -1, clearedFrom: 1 }, NOW)?.slideIndex).toBe(1)
  })
  it('forgets Show-now items, nothing on screen, and no plan', () => {
    expect(snapshotOf({ ...onScreen, itemId: 'adhoc-123' }, NOW)).toBeUndefined()
    expect(snapshotOf({ ...onScreen, slideIndex: -1 }, NOW)).toBeUndefined()
    expect(snapshotOf({ ...onScreen, planId: undefined }, NOW)).toBeUndefined()
    expect(snapshotOf({ ...onScreen, itemIndex: -1 }, NOW)).toBeUndefined()
  })
})

describe('resumeOfferFrom', () => {
  const snap = snapshotOf(onScreen, NOW - 60_000)!
  it('offers what was live when the last run did not quit normally', () => {
    expect(resumeOfferFrom({ clean: false, live: snap }, NOW)).toEqual(snap)
  })
  it('no offer after a normal quit, with nothing live, or for an old service', () => {
    expect(resumeOfferFrom({ clean: true, live: snap }, NOW)).toBeNull()
    expect(resumeOfferFrom({ clean: false }, NOW)).toBeNull()
    expect(resumeOfferFrom({ clean: false, live: { ...snap, at: NOW - RESUME_MAX_AGE_MS - 1 } }, NOW)).toBeNull()
    expect(resumeOfferFrom({ clean: false, live: { ...snap, at: NOW + 3_600_000 } }, NOW)).toBeNull() // clock changed
  })
  it('ignores a damaged or hand-edited file', () => {
    for (const bad of [
      null,
      'x',
      42,
      { clean: 'no', live: snap },
      { clean: false, live: { ...snap, slideIndex: -2 } },
      { clean: false, live: { ...snap, planId: '' } },
      { clean: false, live: { ...snap, itemIndex: 1.5 } }
    ])
      expect(resumeOfferFrom(bad, NOW)).toBeNull()
    expect(resumeOfferFrom({ clean: false, live: { ...snap, itemTitle: 7 } }, NOW)?.itemTitle).toBeUndefined()
  })
})

describe('snapshotChanged', () => {
  const a = snapshotOf(onScreen, NOW)
  it('only a different place counts, not the time', () => {
    expect(snapshotChanged(a, snapshotOf(onScreen, NOW + 5000))).toBe(false)
    expect(snapshotChanged(a, snapshotOf({ ...onScreen, slideIndex: 5 }, NOW))).toBe(true)
    expect(snapshotChanged(a, undefined)).toBe(true)
    expect(snapshotChanged(undefined, undefined)).toBe(false)
  })
})

describe('restoreWindowState', () => {
  const laptop = { x: 0, y: 0, width: 1920, height: 1040 }
  const projector = { x: 1920, y: 0, width: 1280, height: 720 }
  const min = { width: 1100, height: 680 }
  it('first run or unreadable: maximized, as before', () => {
    expect(restoreWindowState(undefined, [laptop], min)).toEqual({ maximized: true })
    expect(restoreWindowState({ bounds: 'x' }, [laptop], min)).toEqual({ maximized: true })
  })
  it('restores a window that is still on a screen', () => {
    expect(restoreWindowState({ bounds: { x: 100, y: 50, width: 1300, height: 800 }, maximized: false }, [laptop], min)).toEqual({
      bounds: { x: 100, y: 50, width: 1300, height: 800 },
      maximized: false
    })
  })
  it('never restores onto a screen that is gone (the projector, unplugged)', () => {
    expect(restoreWindowState({ bounds: { x: 2000, y: 10, width: 1200, height: 700 }, maximized: false }, [laptop], min)).toEqual({ maximized: false })
  })
  it('fits a window that is larger than its screen or hangs off an edge', () => {
    const r = restoreWindowState({ bounds: { x: 1500, y: 600, width: 2400, height: 1400 }, maximized: true }, [laptop, projector], min)
    expect(r.maximized).toBe(true)
    expect(r.bounds).toEqual({ x: 0, y: 0, width: 1920, height: 1040 })
    const edge = restoreWindowState({ bounds: { x: 1500, y: 500, width: 1200, height: 700 }, maximized: false }, [laptop], min)
    expect(edge.bounds).toEqual({ x: 720, y: 340, width: 1200, height: 700 })
  })
  it('keeps the minimum size', () => {
    expect(restoreWindowState({ bounds: { x: 10, y: 10, width: 400, height: 300 }, maximized: false }, [laptop], min).bounds).toEqual({
      x: 10,
      y: 10,
      width: 1100,
      height: 680
    })
  })
})
