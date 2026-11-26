import { describe, expect, it } from 'vite-plus/test'
import { LiveRecorder, RESUME_MAX_AGE_MS, resumeOfferFrom, snapshotChanged, snapshotOf, type LiveSnapshot } from '@shared/session'
import { centredIn, operatorWorkAreas, restoreWindowState } from '@shared/windowState'

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
  it("never opens on the projector's screen (the office monitor in the week is Sunday's projector)", () => {
    const displays = [
      { id: 1, workArea: laptop },
      { id: 2, workArea: projector }
    ]
    const areas = operatorWorkAreas(displays, 2)
    expect(areas).toEqual([laptop])
    expect(restoreWindowState({ bounds: { x: 2000, y: 10, width: 1200, height: 700 }, maximized: false }, areas, min)).toEqual({ maximized: false })
    expect(operatorWorkAreas(displays, undefined)).toEqual([laptop, projector]) // projector off: both screens
    // the projector set as Windows' main screen: the operator window goes on the other one
    expect(operatorWorkAreas(displays, 1)).toEqual([projector])
    // one screen shared by both (a rehearsal on the laptop alone): that screen
    expect(operatorWorkAreas([displays[0]], 1)).toEqual([laptop])
  })
  it('opens centred on an allowed screen when nothing was saved, fitted to it', () => {
    expect(centredIn({ x: 1920, y: 0, width: 1920, height: 1040 }, { width: 1480, height: 920 })).toEqual({ x: 2140, y: 60, width: 1480, height: 920 })
    expect(centredIn({ x: 0, y: 0, width: 1280, height: 680 }, { width: 1480, height: 920 })).toEqual({ x: 0, y: 0, width: 1280, height: 680 })
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

describe('LiveRecorder', () => {
  function setup() {
    const writes: (LiveSnapshot | undefined)[] = []
    const io = { fail: false }
    let timer: (() => void) | null = null
    const r = new LiveRecorder({
      write: (l) => {
        if (io.fail) return false
        writes.push(l)
        return true
      },
      now: () => NOW,
      setTimer: (fn) => (timer = fn),
      clearTimer: () => (timer = null)
    })
    const tick = () => {
      const fn = timer
      timer = null
      fn?.()
    }
    return { r, writes, tick, io }
  }
  const off = { ...onScreen, slideIndex: -1 }

  it('writes a new place once, after the delay, and only when it moved', () => {
    const { r, writes, tick } = setup()
    r.remember(onScreen)
    r.remember({ ...onScreen, slideIndex: 5 })
    expect(writes).toEqual([])
    tick()
    expect(writes.map((w) => w?.slideIndex)).toEqual([5])
    r.remember({ ...onScreen, slideIndex: 5 }) // same place
    tick()
    expect(writes).toHaveLength(1)
  })
  it('a clear followed by a put-back within the delay leaves the place, not "nothing live"', () => {
    const { r, writes, tick } = setup()
    r.remember(onScreen)
    tick()
    r.remember(off)
    r.remember(onScreen)
    tick()
    expect(writes.at(-1)?.slideIndex).toBe(4)
  })
  it('a clear that stays is written as nothing live', () => {
    const { r, writes, tick } = setup()
    r.remember(onScreen)
    tick()
    r.remember(off)
    tick()
    expect(writes.at(-1)).toBeUndefined()
    expect(writes).toHaveLength(2)
  })
  it('flush writes the waiting place now; after end nothing is written', () => {
    const { r, writes, tick } = setup()
    r.remember(onScreen)
    r.flush()
    expect(writes).toHaveLength(1)
    r.remember({ ...onScreen, slideIndex: 7 })
    r.end()
    tick()
    r.remember({ ...onScreen, slideIndex: 8 })
    r.flush()
    expect(writes).toHaveLength(1)
  })

  describe("the last run's offer (seeded)", () => {
    const lastRun = snapshotOf({ ...onScreen, itemId: 'old', slideIndex: 2 }, NOW - 60_000)!
    const showNow = { ...onScreen, itemId: 'adhoc-1', itemIndex: -1, slideIndex: 0 }
    it('stays through changes that show nothing (theme, language), for a second crash', () => {
      const { r, writes, tick } = setup()
      r.seed(lastRun)
      r.remember({ ...onScreen, slideIndex: -1 })
      tick()
      expect(writes).toEqual([])
    })
    it('is replaced by a Show-now item on screen, which has no place to offer', () => {
      const { r, writes, tick } = setup()
      r.seed(lastRun)
      r.remember(showNow)
      tick()
      expect(writes).toEqual([undefined])
    })
    it('is replaced by a plan item put on screen', () => {
      const { r, writes, tick } = setup()
      r.seed(lastRun)
      r.remember(onScreen)
      tick()
      expect(writes.map((w) => w?.itemId)).toEqual(['i3'])
    })
    it('is still held until something replaces it (a Quit after a crash then keeps it)', () => {
      const { r, tick } = setup()
      expect(r.holdsLastRunOffer).toBe(false)
      r.seed(lastRun)
      r.remember({ ...onScreen, slideIndex: -1 }) // a theme change: still held
      tick()
      expect(r.holdsLastRunOffer).toBe(true)
      r.remember(onScreen) // waiting to replace it: no longer the last run's
      expect(r.holdsLastRunOffer).toBe(false)
      tick()
      expect(r.holdsLastRunOffer).toBe(false)
    })
    it('is not held after a normal end', () => {
      const { r } = setup()
      r.seed(lastRun)
      r.end()
      expect(r.holdsLastRunOffer).toBe(false)
    })
    it('once replaced, a Show-now item on screen is still "nothing to offer"', () => {
      const { r, writes, tick } = setup()
      r.seed(lastRun)
      r.remember(onScreen)
      tick()
      r.remember(showNow)
      tick()
      expect(writes.at(-1)).toBeUndefined()
    })
  })

  it('a failed write stays waiting and is tried again at the next change', () => {
    const { r, writes, tick, io } = setup()
    io.fail = true
    r.remember(onScreen)
    tick()
    expect(writes).toEqual([])
    io.fail = false
    r.remember(onScreen) // same place: still written, the file has the old one
    tick()
    expect(writes.map((w) => w?.slideIndex)).toEqual([4])
  })
})
