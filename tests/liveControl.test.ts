import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import type { LiveState, PlanItem, ServicePlan, Slide, Song } from '@shared/types'
import { slidesTimingKey } from '@shared/slides'

/*
 * liveControl runs in the operator window: the store and window.api are replaced by small
 * fakes (main's live:update just merges the patch, as the real one does).
 */
type FakeState = {
  live?: LiveState
  progress?: LiveState['videoProgress']
  plans: ServicePlan[]
  activePlanId?: string
  songs: Song[]
  media: never[]
  presentations: never[]
  themes: { id: string }[]
  settings: Record<string, unknown>
  bibles: never[]
  toast: (...a: unknown[]) => void
  selectItem: (id?: string) => void
  outputOpen?: boolean
}
const state = vi.hoisted(() => ({ current: {} as FakeState }))

vi.mock('../src/renderer/operator/store', () => ({
  useApp: {
    getState: () => state.current,
    setState: (p: Partial<FakeState>) => Object.assign(state.current, p)
  },
  t: (k: string) => k,
  toastError: () => {}
}))
vi.mock('../src/renderer/lib/buildSlides', () => ({
  // a test item may carry `testTrack`: the backing track buildItem would return for it
  buildItem: async (item: PlanItem & { testTrack?: { src: string; volume: number } }) => ({
    slides: item.slides || [],
    theme: { id: 'th' },
    background: null,
    track: item.testTrack
  }),
  themeBackground: () => null
}))

const live = await import('../src/renderer/operator/liveControl')

const text = (id: string): Slide => ({ id, kind: 'text', text: { es: id } })
const video = (id: string, media: string): Slide => ({ id, kind: 'video', media })
const L = () => state.current.live!

function setup(items: PlanItem[]) {
  const plan = { id: 'p1', title: 'Domingo', date: '2026-11-29', items } as unknown as ServicePlan
  state.current = {
    plans: [plan],
    activePlanId: 'p1',
    songs: [],
    media: [],
    presentations: [],
    themes: [{ id: 'th' }],
    settings: {},
    bibles: [],
    toast: () => {},
    selectItem: () => {},
    outputOpen: true
  }
  ;(globalThis as unknown as { window: unknown }).window = {
    api: {
      live: {
        update: async (patch: Partial<LiveState>) => ({ ...(state.current.live || { layers: {} }), ...patch }) as LiveState
      },
      files: {
        exists: async (p: string[]) => p.map(() => true),
        mediaStatus: async (u: string[]) => u.map(() => ({ path: 'x', exists: true }))
      },
      db: { upsert: async () => {} }
    }
  }
}

describe('live control', () => {
  beforeEach(() => vi.useRealTimers())

  it('resumes a video at the Esc position once, then starts it fresh on later visits', async () => {
    setup([{ id: 'i1', type: 'announcement', title: 'Anuncios', slides: [video('v', 'media://a.mp4'), text('t')] } as unknown as PlanItem])
    await live.goItem(0)
    state.current.progress = { current: 30, duration: 120 }
    await live.clearAll() // Esc at 0:30
    await live.next() // Space resumes at 0:30
    expect(L().video).toMatchObject({ src: 'media://a.mp4', seekTo: 30, playing: true })
    await live.goSlide(1) // on to the text slide
    await live.goSlide(0) // ← back to the video
    expect(L().video).toMatchObject({ src: 'media://a.mp4', seekTo: 0, seekSeq: 0 })
  })

  it('forgets the Esc position when the operator moves to another slide instead', async () => {
    setup([{ id: 'i1', type: 'announcement', title: 'Anuncios', slides: [video('v', 'media://a.mp4'), text('t')] } as unknown as PlanItem])
    await live.goItem(0)
    state.current.progress = { current: 30, duration: 120 }
    await live.clearAll()
    await live.goSlide(1)
    await live.goSlide(0)
    expect(L().video).toMatchObject({ seekTo: 0 })
  })

  it('← after Esc brings the cleared slide back instead of the previous item', async () => {
    setup([
      { id: 'i0', type: 'scripture', title: 'Juan 3:16', slides: [text('s')] } as unknown as PlanItem,
      { id: 'i1', type: 'song', title: 'Canción', slides: [text('a'), text('b'), text('c'), text('d'), text('e')] } as unknown as PlanItem
    ])
    await live.goItem(1, 4)
    await live.clearAll()
    await live.prev()
    expect(L()).toMatchObject({ itemId: 'i1', slideIndex: 4 })
    await live.prev() // a normal ← again
    expect(L()).toMatchObject({ itemId: 'i1', slideIndex: 3 })
  })

  it('drops a queued video control meant for a video that is no longer live', async () => {
    setup([
      { id: 'a', type: 'video', title: 'A', slides: [video('va', 'media://a.mp4')] } as unknown as PlanItem,
      { id: 'b', type: 'video', title: 'B', slides: [video('vb', 'media://b.mp4')] } as unknown as PlanItem
    ])
    await live.goItem(0)
    await Promise.all([
      live.enqueue(() => live.goItem(1)),
      live.enqueue(() => live.videoSet({ volume: 0.2 }, 'media://a.mp4')),
      live.enqueue(() => live.videoSeek(50, 'media://a.mp4'))
    ])
    expect(L().video).toMatchObject({ src: 'media://b.mp4', volume: 1, seekTo: 0 })
    await live.enqueue(() => live.videoSet({ volume: 0.4 }, 'media://b.mp4'))
    expect(L().video).toMatchObject({ src: 'media://b.mp4', volume: 0.4 })
  })

  describe("the projector's 'video ended'", () => {
    const items = () =>
      [
        { id: 'a', type: 'video', title: 'A', slides: [video('va', 'media://a.mp4')], video: { loop: false, autoNext: true, volume: 1 } },
        { id: 'b', type: 'video', title: 'B', slides: [video('vb', 'media://b.mp4')], video: { loop: false, autoNext: true, volume: 1 } },
        { id: 'c', type: 'announcement', title: 'C', slides: [text('c')] }
      ] as unknown as PlanItem[]
    const settle = () => live.enqueue(async () => {})

    it('moves on when the live video ends and its item has Auto-next', async () => {
      setup(items())
      await live.goItem(0)
      live.handleCommand({ type: 'videoEnded', itemId: 'a', src: 'media://a.mp4' })
      await settle()
      expect(L().itemId).toBe('b')
    })

    it('is dropped when Next item ran first (the new video is not skipped)', async () => {
      setup(items())
      await live.goItem(0)
      void live.enqueue(() => live.goItem(1)) // Ctrl+→ just before A ends
      live.handleCommand({ type: 'videoEnded', itemId: 'a', src: 'media://a.mp4' })
      await settle()
      expect(L().itemId).toBe('b')
      expect(L().video).toMatchObject({ src: 'media://b.mp4', playing: true })
    })

    it('is dropped after Esc (nothing comes back on screen)', async () => {
      setup(items())
      await live.goItem(0)
      live.handleCommand({ type: 'clearAll' })
      live.handleCommand({ type: 'videoEnded', itemId: 'a', src: 'media://a.mp4' })
      await settle()
      expect(L()).toMatchObject({ itemId: 'a', slideIndex: -1 })
      expect(L().video).toBeUndefined()
    })
  })

  it('a renamed live song shows its new title on the stage and top bar', async () => {
    vi.useFakeTimers()
    setup([])
    const song: Song = {
      id: 's1',
      title: 'Sublime Graica',
      tags: [],
      sections: [{ id: 'x', type: 'verse', label: 'V1', en: '', es: 'Sublime gracia' }],
      arrangement: [],
      linesPerSlide: 2,
      createdAt: 0,
      updatedAt: 0
    }
    state.current.songs = [song]
    await live.showAdhoc({ title: 'Sublime Graica', type: 'song', slides: [text('a')], songId: 's1' })
    state.current.songs = [{ ...song, title: 'Sublime Gracia' } as Song]
    live.songEdited('s1')
    await vi.advanceTimersByTimeAsync(500)
    expect(L().itemTitle).toBe('Sublime Gracia')
  })

  describe('a song with a backing track', () => {
    const TRACK = 'media://local/tracks%2Fs1-1.ogg'
    const song = (extra: Partial<PlanItem> = {}) =>
      ({
        id: 'song',
        type: 'song',
        title: 'Canción',
        slides: [text('a'), text('b'), text('c')],
        testTrack: { src: TRACK, volume: 0.8 },
        track: { play: true, volume: 0.8, autoNext: false },
        ...extra
      }) as unknown as PlanItem
    const after = { id: 'next', type: 'announcement', title: 'Anuncios', slides: [text('n')] } as unknown as PlanItem
    const settle = () => live.enqueue(async () => {})

    it('plays the track under every lyric slide', async () => {
      setup([song(), after])
      await live.goItem(0)
      expect(L().video).toMatchObject({ src: TRACK, track: true, playing: true, volume: 0.8, loop: false })
      await live.next()
      await live.goSlide(2)
      expect(L()).toMatchObject({ slideIndex: 2, video: { src: TRACK, playing: true } })
    })

    it('Next on the last slide lets the music finish (outro); the next Next moves on', async () => {
      setup([song(), after])
      await live.goItem(0, 2)
      await live.videoToggle() // entered at the last slide: the music waits for P
      await live.next()
      expect(L()).toMatchObject({ itemId: 'song', slideIndex: -1, outro: true, video: { src: TRACK, playing: true } })
      await live.prev() // Back brings the last slide back
      expect(L()).toMatchObject({ slideIndex: 2, outro: undefined })
      await live.next()
      await live.next()
      expect(L()).toMatchObject({ itemId: 'next', slideIndex: 0, outro: undefined })
      expect(L().video).toBeUndefined()
    })

    it('a paused or finished track does not hold the last slide: Next moves on', async () => {
      setup([song(), after])
      await live.goItem(0, 2) // paused
      await live.next()
      expect(L().itemId).toBe('next')
    })

    it('Esc stops the music; Space brings the lyrics and the music back where they were', async () => {
      setup([song(), after])
      await live.goItem(0)
      await live.goSlide(1)
      state.current.progress = { current: 42, duration: 200 }
      await live.clearAll()
      expect(L().video).toBeUndefined()
      await live.next()
      expect(L()).toMatchObject({ slideIndex: 1, video: { src: TRACK, track: true, playing: true, seekTo: 42, seekSeq: 1 } })
    })

    it('a track that already finished does not start over after Esc', async () => {
      setup([song(), after])
      await live.goItem(0)
      state.current.progress = { current: 200, duration: 200 }
      await live.clearAll()
      await live.goSlide(2)
      expect(L().video).toBeUndefined()
    })

    it('entering the song part-way waits for P instead of starting the music from the top', async () => {
      setup([song(), after])
      await live.goItem(0, 1)
      expect(L().video).toMatchObject({ src: TRACK, playing: false, seekTo: 0 })
    })

    it('Esc then Space keeps a waiting or paused track paused (never starts the intro under a verse)', async () => {
      setup([song(), after])
      await live.goItem(0, 1) // part-way: held at 0:00
      state.current.progress = { current: 0, duration: 200 }
      await live.clearAll()
      await live.next()
      expect(L()).toMatchObject({ slideIndex: 1, video: { src: TRACK, track: true, playing: false, seekTo: 0 } })
    })

    it('going to the same song again (a thumbnail click) keeps the music and its position', async () => {
      setup([song(), after])
      await live.goItem(0)
      state.current.progress = { current: 30, duration: 200 }
      const before = L().video
      await live.goItem(0, 2)
      expect(L().video).toBe(before)
      expect(state.current.progress).toMatchObject({ current: 30 })
    })

    it('a song lined up under the Logo starts silent and plays when the cover lifts', async () => {
      setup([song(), after])
      await live.goItem(0)
      await live.clearAll()
      await live.toggleLayer('logo')
      await live.goItem(0)
      expect(L().video).toMatchObject({ src: TRACK, playing: false })
      await live.toggleLayer('logo')
      expect(L().video).toMatchObject({ playing: true })
    })

    it("follows the song item's own 'next item when finished'", async () => {
      setup([song({ track: { play: true, volume: 1, autoNext: true } } as Partial<PlanItem>), after])
      await live.goItem(0)
      live.handleCommand({ type: 'videoEnded', itemId: 'song', src: TRACK })
      await settle()
      expect(L().itemId).toBe('next')
    })

    it('without it, the music just stops at the end and the lyrics stay', async () => {
      setup([song(), after])
      await live.goItem(0)
      live.handleCommand({ type: 'videoEnded', itemId: 'song', src: TRACK })
      await settle()
      expect(L()).toMatchObject({ itemId: 'song', slideIndex: 0, video: { playing: false } })
    })

    it('Songs page → Show with track plays it too', async () => {
      setup([])
      await live.showAdhoc({ title: 'Canción', type: 'song', slides: [text('a'), text('b')], songId: 's1', track: { src: TRACK, volume: 1 } })
      expect(L().video).toMatchObject({ src: TRACK, track: true, playing: true })
      await live.goSlide(1)
      expect(L().video).toMatchObject({ src: TRACK, playing: true })
    })
  })

  describe('recorded timing: the lyrics follow the backing track', () => {
    const TRACK = 'media://local/tracks%2Fs1-1.ogg'
    const slides = [text('a'), text('b'), text('c'), text('d')]
    const TIMES = [5, 9, 14, 20]
    const songWith = (timings: number[], key = slidesTimingKey(slides)): Song =>
      ({
        id: 's1',
        title: 'Canción',
        tags: [],
        sections: [],
        arrangement: [],
        linesPerSlide: 2,
        createdAt: 0,
        updatedAt: 0,
        track: { url: TRACK, sourceName: 'x', vocalsRemoved: false, timings, timingsKey: key }
      }) as Song
    const item = {
      id: 'song',
      type: 'song',
      title: 'Canción',
      refId: 's1',
      slides,
      testTrack: { src: TRACK, volume: 1 },
      track: { play: true, volume: 1, autoNext: false }
    } as unknown as PlanItem
    const after = { id: 'next', type: 'announcement', title: 'Anuncios', slides: [text('n')] } as unknown as PlanItem
    const settle = () => live.enqueue(async () => {})
    /** a position report from the projector for what is live now */
    const tick = async (current: number, over: Partial<NonNullable<LiveState['videoProgress']>> = {}) => {
      live.followTick({ current, duration: 30, src: L().video?.src, itemId: L().itemId, seekSeq: L().video?.seekSeq, ...over })
      await settle()
    }
    const start = async (timings = TIMES, key?: string) => {
      setup([item, after])
      state.current.songs = [songWith(timings, key)]
      state.current.toast = vi.fn()
      await live.goItem(0)
    }

    it('starts with the intro: no text until the first line, then each slide when the music reaches it', async () => {
      await start()
      expect(L()).toMatchObject({ slideIndex: -1, clearedFrom: 0, intro: { firstAt: 5 }, video: { playing: true, track: true } })
      await tick(0.3)
      expect(L().slideIndex).toBe(-1)
      await tick(4.9) // a little early (reports come ~4× a second)
      expect(L()).toMatchObject({ slideIndex: 0, intro: undefined })
      await tick(9.1)
      expect(L().slideIndex).toBe(1)
      await tick(14)
      expect(L().slideIndex).toBe(2)
    })

    it('← in the intro goes back to the previous plan item (one Next too many)', async () => {
      setup([after, item])
      state.current.songs = [songWith(TIMES)]
      await live.goItem(1)
      expect(L().intro).toMatchObject({ firstAt: 5 })
      await live.prev()
      expect(L()).toMatchObject({ itemId: 'next', intro: undefined })
    })

    it('Space in the intro shows the first line early; ← stays in the intro of the first item', async () => {
      await start()
      await live.prev()
      expect(L()).toMatchObject({ slideIndex: -1, intro: { firstAt: 5 } })
      await live.next()
      expect(L()).toMatchObject({ slideIndex: 0, intro: undefined })
      await tick(1)
      await tick(5) // the first line's time arrives: it's already up, nothing moves
      expect(L().slideIndex).toBe(0)
    })

    it('never pulls the operator back; the next start in the music takes over again', async () => {
      await start()
      await tick(0.5)
      await tick(9.2) // slide 1
      await live.next() // the operator goes ahead to slide 2
      await live.next() // and to 3
      await tick(14.2) // the music reaches slide 2's start: not back to 2
      expect(L().slideIndex).toBe(3)
      await live.prev() // the operator goes back to repeat slide 2
      await tick(15)
      expect(L().slideIndex).toBe(2) // not pushed forward again by an old start
    })

    it('ignores late reports: from before a seek, from another item, or from opening the file', async () => {
      await start()
      await tick(0.5)
      await tick(9.2, { itemId: 'other' })
      await tick(9.2, { seekSeq: 7 })
      await tick(9.2, { load: true })
      await tick(9.2, { src: 'media://local/tracks%2Fother.ogg' })
      expect(L().slideIndex).toBe(-1)
    })

    it('a seek moves the lyrics to the slide of the new position, backwards too', async () => {
      await start()
      await tick(0.5)
      await tick(14.1)
      expect(L().slideIndex).toBe(2)
      await live.videoSeek(6, TRACK)
      await tick(6.05)
      expect(L().slideIndex).toBe(0)
      await live.videoSeek(1, TRACK)
      await tick(1.05)
      expect(L()).toMatchObject({ slideIndex: -1, intro: { firstAt: 5 } }) // back into the intro
    })

    it('entering part-way starts the music where that slide begins', async () => {
      setup([item, after])
      state.current.songs = [songWith(TIMES)]
      await live.goItem(0, 2)
      expect(L()).toMatchObject({ slideIndex: 2, video: { playing: true, seekSeq: 1, seekTo: 14 } })
      await tick(14.1)
      expect(L().slideIndex).toBe(2)
    })

    it('a song whose slides changed since the timing was recorded: no following, one message', async () => {
      await start(TIMES, 'other-layout')
      expect(L()).toMatchObject({ slideIndex: 0, intro: undefined })
      await tick(0.5)
      await tick(9.2)
      await tick(14.2)
      expect(L().slideIndex).toBe(0)
      const calls = (state.current.toast as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'track.timingOld')
      expect(calls).toHaveLength(1)
    })

    it('Follow off: the operator advances by hand', async () => {
      await start()
      await tick(0.5)
      await live.setFollow(false)
      await tick(9.2)
      expect(L().slideIndex).toBe(-1)
      await live.setFollow(true) // on again: follows from the next start, no jump to "now"
      await tick(9.5)
      expect(L().slideIndex).toBe(-1)
      await tick(14.2)
      expect(L().slideIndex).toBe(2)
    })

    it('a track held under the Logo starts at the slide shown when the cover lifts', async () => {
      setup([item, after])
      state.current.songs = [songWith([0, 9, 14, 20])]
      await live.goItem(1)
      await live.toggleLayer('logo')
      await live.goItem(0)
      expect(L().video).toMatchObject({ playing: false })
      await live.goSlide(2) // the operator lines up slide 3 under the logo
      await live.toggleLayer('logo')
      expect(L().video).toMatchObject({ playing: true, seekTo: 14 })
    })

    it('Esc stops following; nothing moves while the lyrics are cleared', async () => {
      await start()
      await tick(0.5)
      await live.clearAll()
      live.followTick({ current: 9.2, duration: 30, src: TRACK, itemId: 'song', seekSeq: 0 })
      await settle()
      expect(L().slideIndex).toBe(-1)
      expect(L().intro).toBeUndefined()
    })
  })
})
