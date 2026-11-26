import type {
  DisplayLang,
  LiveState,
  PlanItem,
  PlanItemType,
  RemoteCommand,
  ServicePlan,
  Slide,
  SongUsage,
  Theme,
  Background,
  VideoEndedCommand
} from '@shared/types'
import { slidesTimingKey, songName, songToSlides, timedSlideAt, uid } from '@shared/slides'
import { localDate } from '@shared/dates'
import { buildItem, themeBackground } from '../lib/buildSlides'
import { createActionQueue } from '../lib/actionQueue'
import { useApp, t, toastError } from './store'

/**
 * Everything the operator (keyboard, mouse, phone remote) can do to the screens.
 * The operator window is the only place that turns plan items into slides; the
 * result is pushed to main which keeps projector, stage and phones in sync.
 */

const api = () => window.api
const st = () => useApp.getState()
const live = () => st().live

/**
 * Send a change to main and immediately store the merged result, so the next command
 * computes from fresh state (not the copy that arrives later by broadcast).
 */
async function push(patch: Partial<LiveState>): Promise<LiveState> {
  const before = live()?.video
  const s = await api().live.update(patch)
  // Sound and video play in the projector window: with it closed nothing is heard. Say so whenever
  // something starts playing (a new video / audio / backing track, or play pressed) instead of silence.
  const v = patch.video
  if (v?.playing && (!before || before.src !== v.src || !before.playing)) warnIfNoOutput()
  if (s) useApp.setState({ live: s })
  // a new video (or none) starts with fresh progress, so its own load error is reported
  // even when the previous video failed too (progress only arrives from the projector)
  if ('videoProgress' in patch) useApp.setState({ progress: patch.videoProgress })
  return s
}

/**
 * Run operator actions one at a time, in the order they were triggered. Without this, a
 * phone tap and a key press in the same instant (or a burst of taps) each computed
 * "slide + 1" from the same old state and moves were lost. Use at entry points only
 * (keyboard, buttons, remote commands) — the actions call each other directly.
 * A failed action shows a toast (a key press or phone tap must not fail silently) and the
 * queue keeps going.
 */
function warnIfNoOutput(): void {
  if (st().outputOpen) return
  st().toast(t('live.noOutput'), 'err', 10_000, { label: t('live.openOutput'), run: () => void api().output.open() })
}

export const enqueue = createActionQueue((e) => {
  console.error('live action failed', e)
  toastError(e)
})

let advanceTimer: ReturnType<typeof setTimeout> | null = null
/** a video that started while Black / Logo was up: held paused, plays when the cover lifts */
let heldVideoSrc: string | undefined
/** the video Esc took off screen, and where it was, so Space / a thumbnail click resumes it */
let clearedVideo: { video: NonNullable<LiveState['video']>; at: number } | undefined
let messageTimer: ReturnType<typeof setTimeout> | null = null

function ctx() {
  const s = st()
  return {
    songs: s.songs,
    media: s.media,
    presentations: s.presentations,
    themes: s.themes,
    settings: s.settings,
    bibles: s.bibles,
    planDate: activePlan()?.date
  }
}

export function activePlan(): ServicePlan | undefined {
  const s = st()
  return s.plans.find((p) => p.id === s.activePlanId)
}

function planSummary(plan?: ServicePlan) {
  return (plan?.items || []).map((i) => ({ id: i.id, type: i.type, title: i.title, durationMin: i.durationMin, person: i.person }))
}

function scheduleAdvance(slide?: Slide) {
  if (advanceTimer) clearTimeout(advanceTimer)
  advanceTimer = null
  const from = live()
  if (slide?.advanceAfter && slide.advanceAfter > 0 && from) {
    const { itemId, slideIndex } = from
    advanceTimer = setTimeout(() => {
      void enqueue(() => {
        // decide when it's our turn in the queue: an Esc or another item queued before
        // us wins, and this stale advance does nothing
        const l = live()
        if (!l || l.itemId !== itemId || l.slideIndex < 0 || l.slideIndex !== slideIndex) return
        // announcement loops wrap around inside the item
        return goSlide(l.slideIndex + 1 < l.slides.length ? l.slideIndex + 1 : 0)
      })
    }, slide.advanceAfter * 1000)
  }
}

/**
 * Log CCLI usage: one entry per song per service.
 * - From a plan: keyed by plan, dated with the plan's (service) date — a Saturday
 *   rehearsal and the Sunday service count once; two services the same day count twice.
 * - Ad hoc (Songs page → Show now): attributed to today's selected plan if there is one
 *   (so showing a plan song from the Songs page during the service isn't counted twice),
 *   otherwise logged as an ad-hoc use for today.
 */
async function recordSongUsage(songId: string, plan?: ServicePlan) {
  const song = st().songs.find((s) => s.id === songId)
  if (!song) return
  const today = localDate()
  const p = plan || (activePlan()?.date === today ? activePlan() : undefined)
  const date = p?.date || today
  const id = `${song.id}@${date}@${p?.id || 'adhoc'}`
  await api().db.upsert<SongUsage>('usage', { id, songId: song.id, title: songName(song), ccli: song.ccli, date, planId: p?.id })
}

async function logSongUsage(item: PlanItem, plan?: ServicePlan) {
  if (item.type !== 'song' || !item.refId) return
  await recordSongUsage(item.refId, plan)
}

/** Warn right away if an image / background / backing track file that just went live is gone (USB stick
 *  removed, file moved). Videos report their own load errors from the projector. */
function checkMediaFiles(slides: Slide[], background?: Background | null, track?: string): void {
  const urls = [
    ...slides.filter((x) => x.kind === 'image').map((x) => x.media),
    background?.type === 'image' || background?.type === 'video' ? background.value : undefined,
    track
  ]
  const media = urls.filter((u): u is string => !!u?.startsWith('media://'))
  if (!media.length) return
  // main resolves the URLs exactly like the projector does (slides stored relative to the data folder too)
  void api()
    .files.mediaStatus(media)
    .then((st0) => {
      // index into `media` before filtering: the fallback must name the item that is missing
      const missing = st0.flatMap((x, i) => (x.exists ? [] : [x.path || media[i]]))
      if (missing.length) st().toast(t('errors.mediaMissing', { file: missing.join(', ') }), 'err', 10_000)
    })
}

/* ------------------------------ recorded timing: the lyrics follow the backing track ------------------------------ */

/** the item that was already told its timing no longer fits (one message per item) */
let timingWarnedFor: string | undefined

/**
 * The recorded timing of a song's backing track, if it fits these slides (same layout as when it was recorded).
 * A song edited since (another order, other lines per slide) says so once, and the operator advances by hand.
 */
function timingsFor(songId: string | undefined, src: string, slides: Slide[], itemId: string | undefined): number[] | undefined {
  const tr = st().songs.find((x) => x.id === songId)?.track
  if (!tr?.timings?.length || tr.url !== src) return undefined
  if (tr.timingsKey !== slidesTimingKey(slides) || tr.timings.length !== slides.length) {
    if (itemId && timingWarnedFor !== itemId) {
      timingWarnedFor = itemId
      st().toast(t('track.timingOld'), 'err', 10_000)
    }
    return undefined
  }
  return tr.timings
}

/** the live song's recorded timing, when its backing track plays and the timing fits (Live page: the Follow box) */
export function liveTimings(l: LiveState | null | undefined = live()): number[] | undefined {
  return l?.video?.track ? timingsFor(l.songId, l.video.src, l.slides, undefined) : undefined
}

/** where "follow the timing" stands for the live item */
const follow = { itemId: undefined as string | undefined, lastTarget: -2, lastAuto: -1, seekSeq: -1 }

/**
 * Each position report from the projector: when the music crosses the start of a slide, show that slide. Moves only
 * forward (an operator who went ahead or back by hand is never pulled backwards — the next start the music reaches
 * takes over again), except right after a seek, which jumps to the slide of the new position. Reports from before a
 * seek, from another item or from the moment the file opened are ignored.
 */
export function followTick(p: LiveState['videoProgress']): void {
  const l = live()
  if (!p || p.error || p.load || !l?.video?.track || l.followOff) return
  if (p.itemId !== l.itemId || p.seekSeq !== l.video.seekSeq || p.src !== l.video.src) return
  // Esc'd, or the outro: the operator decides
  if (l.outro || (l.slideIndex < 0 && !l.intro)) return
  const timings = timingsFor(l.songId, l.video.src, l.slides, l.itemId)
  if (!timings) return
  const target = timedSlideAt(timings, p.current)
  const cur = l.intro ? -1 : l.slideIndex
  if (follow.itemId !== l.itemId) {
    // a new item (or the operator window was reloaded): start from where things are, never jump
    Object.assign(follow, { itemId: l.itemId, lastTarget: target, lastAuto: cur, seekSeq: l.video.seekSeq })
    return
  }
  if (follow.seekSeq !== l.video.seekSeq) {
    // the first report after a seek: show the slide of the new position, backwards too
    follow.seekSeq = l.video.seekSeq
    follow.lastTarget = target
    if (Math.abs(p.current - l.video.seekTo) < 1 && target !== cur) {
      follow.lastAuto = target
      moveTo(target, timings, l.itemId)
    }
    return
  }
  if (target === follow.lastTarget) return
  follow.lastTarget = target
  if (target > Math.max(cur, follow.lastAuto)) {
    follow.lastAuto = target
    moveTo(target, timings, l.itemId)
  }
}

function moveTo(target: number, timings: number[], itemId: string | undefined): void {
  void enqueue(async () => {
    // decided when it's our turn in the queue: Esc, another item or "follow" off since then win
    const l = live()
    if (!l || l.itemId !== itemId || !l.video?.track || l.followOff || l.outro || (l.slideIndex < 0 && !l.intro)) return
    if (target < 0) {
      if (!l.intro) await push({ slideIndex: -1, clearedFrom: 0, intro: { firstAt: timings[0] } })
      return
    }
    if (target < l.slides.length && target !== l.slideIndex) await goSlide(target)
  })
}

// the store gets every position report; follow them (the store mock in tests has no subscribe)
useApp.subscribe?.((s, prev) => {
  if (s.progress !== prev.progress) followTick(s.progress)
})

/** Live page → "Follow the timing": off = the operator advances by hand; on again follows from the next start */
export async function setFollow(on: boolean): Promise<void> {
  follow.itemId = undefined
  await push({ followOff: on ? undefined : true })
}

/** Put a plan item on screen */
export async function goItem(index: number, slideIndex = 0): Promise<void> {
  const plan = activePlan()
  const item = plan?.items[index]
  if (!plan || !item) return
  const built = await buildItem(item, ctx())
  if (built.warning) st().toast(t(built.warning), 'err')
  heldVideoSrc = undefined
  const si = Math.max(0, Math.min(slideIndex < 0 ? built.slides.length - 1 : slideIndex, built.slides.length - 1))
  const l = live()
  // the same song is already live with its music (a thumbnail click, a double-click): the music goes on
  const sameTrack = !!built.track && l?.itemId === item.id && !!l.video?.track && l.video.src === built.track.src
  // recorded timing: the music starts at the slide's time; from the top, an intro without text until the first line
  const timings = built.track && !sameTrack ? timingsFor(item.refId, built.track.src, built.slides, item.id) : undefined
  const intro = timings && si === 0 && timings[0] >= 0.5 ? { firstAt: timings[0] } : undefined
  const patch: Partial<LiveState> = {
    planId: plan.id,
    planTitle: plan.title,
    planItems: planSummary(plan),
    itemIndex: index,
    itemId: item.id,
    itemTitle: item.title,
    itemType: item.type,
    itemNotes: item.notes,
    slides: built.slides,
    slideIndex: built.slides.length && !intro ? si : -1,
    clearedFrom: intro ? 0 : undefined,
    intro,
    followOff: sameTrack ? l?.followOff : undefined,
    songId: item.type === 'song' ? item.refId : undefined,
    theme: built.theme,
    background: built.background,
    itemStartedAt: l?.itemId === item.id ? l.itemStartedAt : Date.now(),
    serviceStartedAt: l?.serviceStartedAt || Date.now(),
    // the slide it starts on decides: a media item, or a video slide inside an
    // announcement / header (which otherwise sat on a frozen first frame) — or the song's backing track
    video: startVideo(built.slides[si], item) ?? (built.track && (sameTrack ? l!.video : startTrack(built.track, si, timings))),
    outro: undefined,
    // Black and Logo are screen covers (as in EasyWorship / ProPresenter / MediaShout): they
    // stay up while the operator moves on underneath, until turned off. Clear text resets.
    layers: { black: !!l?.layers.black, clearText: false, clearBackground: false, logo: !!l?.layers.logo }
  }
  // a new video or track starts with fresh progress (and following starts over); the music that goes on keeps both
  if (!sameTrack) {
    patch.videoProgress = undefined
    follow.itemId = undefined
  }
  clearedVideo = undefined
  await push(patch)
  st().selectItem(item.id)
  checkMediaFiles(built.slides, built.background, sameTrack ? undefined : built.track?.src)
  scheduleAdvance(built.slides[si])
  void logSongUsage(item, plan)
}

/**
 * Show something that is not part of the plan (from Bible / Media / Songs pages). Queued
 * like key presses, so a Space pressed at the same moment can't apply an old slide index
 * to the new slides.
 */
export function showAdhoc(args: Parameters<typeof showAdhocNow>[0]): Promise<void> {
  return enqueue(() => showAdhocNow(args))
}

/** Change live state from a page (theme edits, background, bilingual order) — queued too. */
export function updateLive(patch: Partial<LiveState>): Promise<void> {
  return enqueue(() => push(patch))
}

async function showAdhocNow(args: {
  title: string
  type: PlanItemType
  slides: Slide[]
  theme?: Theme
  background?: Background | null
  video?: boolean
  songId?: string
  /** Songs page → Show with track: the song's backing track plays under the lyrics */
  track?: { src: string; volume: number }
}): Promise<void> {
  const s = st()
  // nothing to show (e.g. a song with no lyrics yet): say so instead of blanking the screen
  if (!args.slides.length) {
    s.toast(t('live.noSlides'), 'err')
    return
  }
  const theme = args.theme || s.themes.find((x) => x.id === s.settings.defaultThemeId) || s.themes[0]
  const background = args.background === undefined ? themeBackground(theme, s.media) : args.background
  clearedVideo = undefined
  heldVideoSrc = undefined
  const itemId = 'adhoc-' + uid()
  follow.itemId = undefined
  const timings = args.track ? timingsFor(args.songId, args.track.src, args.slides, itemId) : undefined
  const intro = timings && timings[0] >= 0.5 ? { firstAt: timings[0] } : undefined
  await push({
    itemIndex: -1,
    itemId,
    itemTitle: args.title,
    itemType: args.type,
    itemNotes: undefined,
    slides: args.slides,
    slideIndex: args.slides.length && !intro ? 0 : -1,
    clearedFrom: intro ? 0 : undefined,
    intro,
    followOff: undefined,
    songId: args.songId,
    theme,
    background,
    itemStartedAt: Date.now(),
    video: args.video || args.slides[0]?.kind === 'video' ? startVideo(args.slides[0]) : args.track ? startTrack(args.track, 0, timings) : undefined,
    videoProgress: undefined,
    outro: undefined,
    // screen covers stay up (see goItem)
    layers: { black: !!live()?.layers.black, clearText: false, clearBackground: false, logo: !!live()?.layers.logo }
  })
  // the Live page grid shows the selected item; clear it so the ad-hoc slides that are on
  // screen are what the operator sees (and a thumbnail click doesn't replace them)
  s.selectItem(undefined)
  checkMediaFiles(args.slides, background, args.track?.src)
  if (args.songId) void recordSongUsage(args.songId)
}

/**
 * The song on screen was edited (typo fix during worship): rebuild its slides and keep
 * the current position, so the correction appears without restarting the song.
 */
let refreshTimer: ReturnType<typeof setTimeout> | null = null
export function songEdited(songId: string): void {
  if (live()?.songId !== songId) return
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => void enqueue(() => refreshLiveSong(songId)), 400)
}

async function refreshLiveSong(songId: string): Promise<void> {
  const l = live()
  const song = st().songs.find((x) => x.id === songId)
  if (!l || l.songId !== songId || !song) return
  // the plan the song went live from (the operator may have selected another plan since)
  const plan = st().plans.find((p) => p.id === l.planId)
  const item = plan?.items.find((i) => i.id === l.itemId)
  const slides = item ? (await buildItem(item, ctx())).slides : songToSlides(song, { ccliLicense: st().settings.ccliLicense })
  if (!slides.length) return
  const clamp = (i: number | undefined) => (i === undefined ? undefined : Math.min(i, slides.length - 1))
  // a renamed song: the stage and the top bar show the new title too (a plan item keeps the
  // title the plan gives it, as goItem does)
  const itemTitle = item ? item.title : songName(song)
  await push({ slides, slideIndex: l.slideIndex < 0 ? -1 : clamp(l.slideIndex)!, clearedFrom: clamp(l.clearedFrom), itemTitle })
}

export async function goSlide(index: number): Promise<void> {
  const l = live()
  if (!l || index < 0 || index >= l.slides.length) return
  const slide = l.slides[index]
  // covers (black / logo) stay up: the operator can line up the next slide, then reveal it
  const patch: Partial<LiveState> = { slideIndex: index, clearedFrom: undefined, outro: undefined, intro: undefined }
  // A video slide needs playback state (after Esc, or reached inside an announcement),
  // or the projector sits on a frozen first frame with no play controls. Leaving a video
  // slide for a text / image one drops it, so no stale video controls stay up — but a song's
  // backing track plays on under all its slides.
  if (slide.kind === 'video' && slide.media && l.video?.src !== slide.media) {
    patch.video = resumeVideo(slide.media, l.itemId)
    patch.videoProgress = undefined
  } else if (slide.kind !== 'video' && l.video && !l.video.track) {
    patch.video = undefined
    patch.videoProgress = undefined
  } else if (slide.kind !== 'video' && !l.video && clearedVideo?.video.track) {
    // back from an accidental Esc: the music continues where it was (its position stays in videoProgress) — and
    // only if it was playing: a track held at 0:00 (song entered part-way) or paused with P (the band took over)
    // stays paused, never starts over the verse on screen
    const c = clearedVideo
    patch.video = holdUnderCover({ ...c.video, playing: c.video.playing, seekSeq: c.video.seekSeq + 1, seekTo: c.at })
  }
  // the position Esc saved is good for one resume only: once the operator resumed or moved
  // to another slide, coming back to the video starts it fresh
  clearedVideo = undefined
  await push(patch)
  scheduleAdvance(slide)
}

/** playback state for a slide that starts a video (none for other slides) */
function startVideo(slide: Slide | undefined, item?: PlanItem): LiveState['video'] {
  if (slide?.kind !== 'video' || !slide.media) return undefined
  return holdUnderCover({ src: slide.media, playing: true, loop: item?.video?.loop ?? false, volume: item?.video?.volume ?? 1, seekSeq: 0, seekTo: 0 })
}

/**
 * Playback state for a song's backing track. Entering a song part-way (a thumbnail, Back from the next item): with
 * recorded timing the music starts where that slide begins; without it, it waits paused at the start for P —
 * rather than starting the song from the top under a later verse.
 */
function startTrack(t: { src: string; volume: number }, slideIndex: number, timings?: number[]): NonNullable<LiveState['video']> {
  const v = { src: t.src, playing: true, loop: false, volume: t.volume, seekSeq: 0, seekTo: 0, track: true }
  if (slideIndex <= 0) return holdUnderCover(v)
  if (timings?.[slideIndex] !== undefined) return holdUnderCover({ ...v, seekSeq: 1, seekTo: timings[slideIndex] })
  return { ...v, playing: false }
}

/** Black / Logo is up: the audience can't see the video, so don't play its sound yet. */
function holdUnderCover(v: NonNullable<LiveState['video']>): NonNullable<LiveState['video']> {
  const layers = live()?.layers
  if (!layers?.black && !layers?.logo) return v
  heldVideoSrc = v.src
  return { ...v, playing: false }
}

function resumeVideo(src: string, itemId?: string): NonNullable<LiveState['video']> {
  const c = clearedVideo
  clearedVideo = undefined // used once (see goSlide)
  if (c && c.video.src === src) return holdUnderCover({ ...c.video, playing: true, seekSeq: c.video.seekSeq + 1, seekTo: c.at })
  const item = activePlan()?.items.find((i) => i.id === itemId)
  return holdUnderCover({ src, playing: true, loop: item?.video?.loop ?? false, volume: item?.video?.volume ?? 1, seekSeq: 0, seekTo: 0 })
}

export async function next(): Promise<void> {
  const l = live()
  if (!l) return
  // the outro is playing (text off, music finishing): the next Next moves on
  if (l.outro) return nextItem()
  // Resume after an accidental Esc — but only while the operator is still on the plan that
  // item came from (an ad-hoc item has no plan). After switching plans, Space starts the
  // selected plan instead of bringing back something from another service.
  if (canResumeCleared(l)) return goSlide(l.clearedFrom!)
  if (l.slideIndex < 0 && !onActivePlan(l)) return nextItem()
  if (l.slideIndex + 1 < l.slides.length) return goSlide(l.slideIndex + 1)
  // last lyric slide of a song whose backing track still plays: take the text off and let the music finish
  if (l.slideIndex >= 0 && l.video?.track && l.video.playing) {
    await push({ slideIndex: -1, clearedFrom: l.slideIndex, outro: true })
    return
  }
  return nextItem()
}

/** ad-hoc items have no plan; a plan item counts only while its plan is the selected one */
function onActivePlan(l: LiveState): boolean {
  return l.itemIndex < 0 || l.planId === activePlan()?.id
}

/** Esc took a slide off screen and the operator is still on that item's plan */
function canResumeCleared(l: LiveState): boolean {
  return l.slideIndex < 0 && !l.outro && onActivePlan(l) && l.clearedFrom !== undefined && l.clearedFrom < l.slides.length
}

export async function prev(): Promise<void> {
  const l = live()
  if (!l) return
  // during the outro, Back brings the last lyric slide back; during the intro there is no slide before it, so Back
  // goes to the previous plan item (one Next too many started this song) — or stays, for an item without one
  if (l.outro) return goSlide(Math.min(l.clearedFrom ?? l.slides.length - 1, l.slides.length - 1))
  if (l.intro) {
    const plan = activePlan()
    if (plan && l.itemIndex > 0 && l.planId === plan.id) return goItem(l.itemIndex - 1, -1)
    return
  }
  // after an accidental Esc, ← brings the cleared slide back (like Space), instead of
  // jumping to the previous plan item
  if (canResumeCleared(l)) return goSlide(l.clearedFrom!)
  if (l.slideIndex > 0) return goSlide(l.slideIndex - 1)
  const plan = activePlan()
  if (plan && l.itemIndex > 0 && l.planId === plan.id) return goItem(l.itemIndex - 1, -1)
}

export async function nextItem(): Promise<void> {
  const l = live()
  const plan = activePlan()
  if (!plan) return
  const idx = l && l.planId === plan.id ? l.itemIndex + 1 : 0
  if (idx < plan.items.length) return goItem(idx, 0)
}

export async function prevItem(): Promise<void> {
  const l = live()
  const plan = activePlan()
  if (!plan || !l) return
  if (l.itemIndex > 0) return goItem(l.itemIndex - 1, 0)
}

export async function toggleLayer(layer: keyof LiveState['layers']): Promise<void> {
  const l = live()
  if (!l) return
  const layers = { ...l.layers, [layer]: !l.layers[layer] }
  const patch: Partial<LiveState> = { layers }
  // the last cover came off: a video held under it starts now
  if (!layers.black && !layers.logo && heldVideoSrc && l.video?.src === heldVideoSrc && !l.video.playing) {
    // a backing track held from the start while the operator moved on underneath: start at the slide shown now
    const tm = l.video.track && l.slideIndex > 0 ? liveTimings(l) : undefined
    patch.video = { ...l.video, playing: true, ...(tm ? { seekSeq: l.video.seekSeq + 1, seekTo: tm[l.slideIndex] } : {}) }
  }
  if (!layers.black && !layers.logo) heldVideoSrc = undefined
  await push(patch)
}

export async function clearAll(): Promise<void> {
  if (advanceTimer) clearTimeout(advanceTimer)
  const l = live()
  heldVideoSrc = undefined // Esc lifts the covers; a resumed video plays
  // remember a playing video and its position (a finished one starts over)
  const p = st().progress
  if (l?.video) {
    const ended = !!p && p.duration > 0 && p.current >= p.duration - 0.3
    // a backing track that already finished doesn't start over when the operator brings the lyrics back
    clearedVideo = ended && l.video.track ? undefined : { video: l.video, at: p && !p.error && !ended ? p.current : 0 }
  }
  // Take the slide off screen but keep the item's slides: the grid still shows them, one
  // click on a thumbnail (or Space) puts the exact slide back after an accidental Esc.
  await push({
    slideIndex: -1,
    clearedFrom: l && l.slideIndex >= 0 ? l.slideIndex : l?.clearedFrom,
    itemIndex: l?.itemIndex ?? -1,
    video: undefined,
    videoProgress: undefined,
    outro: undefined,
    intro: undefined,
    message: undefined,
    layers: { black: false, clearText: false, clearBackground: false, logo: false }
  })
}

export async function setDisplayLang(value: DisplayLang): Promise<void> {
  await push({ displayLang: value })
  void st().setSettings({ displayLang: value })
}

export async function showMessage(text: string): Promise<void> {
  const secs = st().settings.messageSeconds || 30
  if (messageTimer) clearTimeout(messageTimer)
  await push({ message: { text, until: Date.now() + secs * 1000, seq: Date.now() } })
  messageTimer = setTimeout(() => void enqueue(() => push({ message: undefined })), secs * 1000 + 200)
}

export async function clearMessage(): Promise<void> {
  if (messageTimer) clearTimeout(messageTimer)
  await push({ message: undefined })
}

export async function stageMessage(text: string): Promise<void> {
  await push({ stageMessage: text ? { text, seq: Date.now() } : undefined })
}

export async function videoToggle(): Promise<void> {
  const l = live()
  if (!l?.video) return
  await push({ video: { ...l.video, playing: !l.video.playing } })
}

/** the video played to the end and stopped by itself (not paused by the operator) */
function videoEnded(l: LiveState): boolean {
  const p = l.videoProgress
  return !!l.video && !l.video.playing && !!p && !p.error && p.duration > 0 && p.current >= p.duration - 0.3
}

/**
 * Video controls. Call them through `enqueue` (they compute from the live video, like the
 * other actions). `src` is the video the control belonged to when it was used: if another
 * item went live while the action waited in the queue, it is dropped instead of seeking
 * or changing the volume of a video the operator wasn't looking at.
 */
export async function videoSeek(seconds: number, src?: string): Promise<void> {
  const l = live()
  if (!l?.video || (src !== undefined && l.video.src !== src)) return
  // seeking a finished video means "play it again from there"
  const playing = l.video.playing || videoEnded(l)
  await push({ video: { ...l.video, playing, seekSeq: l.video.seekSeq + 1, seekTo: Math.max(0, seconds) } })
}

export async function videoSet(patch: Partial<NonNullable<LiveState['video']>>, src?: string): Promise<void> {
  const l = live()
  if (!l?.video || (src !== undefined && l.video.src !== src)) return
  // turning Loop on after the video already ended restarts it
  if (patch.loop && videoEnded(l)) {
    await push({ video: { ...l.video, ...patch, playing: true, seekSeq: l.video.seekSeq + 1, seekTo: 0 } })
    return
  }
  await push({ video: { ...l.video, ...patch } })
}

export async function resetServiceTimer(): Promise<void> {
  await push({ serviceStartedAt: Date.now() })
}

/** Keep plan summary on stage/remote in sync when the plan is edited */
export async function syncPlanSummary(): Promise<void> {
  const plan = activePlan()
  const l = live()
  if (!plan || !l || l.planId !== plan.id) return
  const idx = plan.items.findIndex((i) => i.id === l.itemId)
  await push({ planItems: planSummary(plan), planTitle: plan.title, itemIndex: idx >= 0 ? idx : l.itemIndex })
}

/** Commands arriving from the phone remote / stage window / projector */
async function runCommand(cmd: RemoteCommand | VideoEndedCommand): Promise<void> {
  switch (cmd.type) {
    case 'next':
      await next()
      break
    case 'prev':
      await prev()
      break
    case 'nextItem':
      await nextItem()
      break
    case 'prevItem':
      await prevItem()
      break
    case 'gotoItem':
      await goItem(cmd.index)
      break
    case 'gotoSlide':
      await goSlide(cmd.index)
      break
    case 'black':
      await toggleLayer('black')
      break
    case 'clearText':
      await toggleLayer('clearText')
      break
    case 'logo':
      await toggleLayer('logo')
      break
    case 'clearAll':
      await clearAll()
      break
    case 'displayLang':
      await setDisplayLang(cmd.value)
      break
    case 'message':
      await showMessage(cmd.text)
      break
    case 'clearMessage':
      await clearMessage()
      break
    case 'stageMessage':
      await stageMessage(cmd.text)
      break
    case 'videoToggle':
      await videoToggle()
      break
    case 'videoEnded': {
      const l = live()
      // Queued behind other actions: only act if the video that ended is still the live one
      // (Next item or Esc may have run first — skipping/pausing the new item would be wrong).
      if (!l?.video || l.video.src !== cmd.src || l.itemId !== cmd.itemId) break
      const plan = activePlan()
      const item = plan?.items.find((i) => i.id === l?.itemId)
      // a backing track follows the song item's own "next item when finished"; a video its video options
      const auto = l.video.track ? item?.track?.autoNext : item?.video?.autoNext
      if (auto) await nextItem()
      else if (l?.video) await push({ video: { ...l.video, playing: false } })
      break
    }
  }
}

/** Phone remote / stage / projector commands — queued so simultaneous ones all apply. */
export function handleCommand(cmd: RemoteCommand | VideoEndedCommand): void {
  void enqueue(() => runCommand(cmd))
}
