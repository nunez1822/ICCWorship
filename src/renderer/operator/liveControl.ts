import type { DisplayLang, LiveState, PlanItem, PlanItemType, RemoteCommand, ServicePlan, Slide, SongUsage, Theme, Background, VideoEndedCommand } from '@shared/types'
import { songName, songToSlides, uid } from '@shared/slides'
import { localDate } from '@shared/dates'
import { buildItem, themeBackground } from '../lib/buildSlides'
import { mediaUrlToPath } from '../lib/media'
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
  const s = await api().live.update(patch)
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
  return { songs: s.songs, media: s.media, presentations: s.presentations, themes: s.themes, settings: s.settings, bibles: s.bibles }
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

/** Warn right away if an image / background file that just went live is gone (USB stick
 *  removed, file moved). Videos report their own load errors from the projector. */
function checkMediaFiles(slides: Slide[], background?: Background | null): void {
  const urls = [...slides.filter((x) => x.kind === 'image').map((x) => x.media), background?.type === 'image' || background?.type === 'video' ? background.value : undefined]
  const paths = urls.map((u) => mediaUrlToPath(u)).filter((p): p is string => !!p)
  if (!paths.length) return
  void api().files.exists(paths).then((ex) => {
    const missing = paths.filter((_, i) => !ex[i])
    if (missing.length) st().toast(t('errors.mediaMissing', { file: missing.join(', ') }), 'err', 10_000)
  })
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
    slideIndex: built.slides.length ? si : -1,
    clearedFrom: undefined,
    songId: item.type === 'song' ? item.refId : undefined,
    theme: built.theme,
    background: built.background,
    itemStartedAt: l?.itemId === item.id ? l.itemStartedAt : Date.now(),
    serviceStartedAt: l?.serviceStartedAt || Date.now(),
    // the slide it starts on decides: a media item, or a video slide inside an
    // announcement / header (which otherwise sat on a frozen first frame)
    video: startVideo(built.slides[si], item),
    videoProgress: undefined,
    // Black and Logo are screen covers (as in EasyWorship / ProPresenter / MediaShout): they
    // stay up while the operator moves on underneath, until turned off. Clear text resets.
    layers: { black: !!l?.layers.black, clearText: false, clearBackground: false, logo: !!l?.layers.logo }
  }
  clearedVideo = undefined
  await push(patch)
  st().selectItem(item.id)
  checkMediaFiles(built.slides, built.background)
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

async function showAdhocNow(args: { title: string; type: PlanItemType; slides: Slide[]; theme?: Theme; background?: Background | null; video?: boolean; songId?: string }): Promise<void> {
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
  await push({
    itemIndex: -1,
    itemId: 'adhoc-' + uid(),
    itemTitle: args.title,
    itemType: args.type,
    itemNotes: undefined,
    slides: args.slides,
    slideIndex: args.slides.length ? 0 : -1,
    clearedFrom: undefined,
    songId: args.songId,
    theme,
    background,
    itemStartedAt: Date.now(),
    video: args.video || args.slides[0]?.kind === 'video' ? startVideo(args.slides[0]) : undefined,
    videoProgress: undefined,
    // screen covers stay up (see goItem)
    layers: { black: !!live()?.layers.black, clearText: false, clearBackground: false, logo: !!live()?.layers.logo }
  })
  // the Live page grid shows the selected item; clear it so the ad-hoc slides that are on
  // screen are what the operator sees (and a thumbnail click doesn't replace them)
  s.selectItem(undefined)
  checkMediaFiles(args.slides, background)
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
  const patch: Partial<LiveState> = { slideIndex: index, clearedFrom: undefined }
  // A video slide needs playback state (after Esc, or reached inside an announcement),
  // or the projector sits on a frozen first frame with no play controls. Leaving a video
  // slide for a text / image one drops it, so no stale video controls stay up.
  if (slide.kind === 'video' && slide.media && l.video?.src !== slide.media) {
    patch.video = resumeVideo(slide.media, l.itemId)
    patch.videoProgress = undefined
  } else if (slide.kind !== 'video' && l.video) {
    patch.video = undefined
    patch.videoProgress = undefined
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
  // Resume after an accidental Esc — but only while the operator is still on the plan that
  // item came from (an ad-hoc item has no plan). After switching plans, Space starts the
  // selected plan instead of bringing back something from another service.
  if (canResumeCleared(l)) return goSlide(l.clearedFrom!)
  if (l.slideIndex < 0 && !onActivePlan(l)) return nextItem()
  if (l.slideIndex + 1 < l.slides.length) return goSlide(l.slideIndex + 1)
  return nextItem()
}

/** ad-hoc items have no plan; a plan item counts only while its plan is the selected one */
function onActivePlan(l: LiveState): boolean {
  return l.itemIndex < 0 || l.planId === activePlan()?.id
}

/** Esc took a slide off screen and the operator is still on that item's plan */
function canResumeCleared(l: LiveState): boolean {
  return l.slideIndex < 0 && onActivePlan(l) && l.clearedFrom !== undefined && l.clearedFrom < l.slides.length
}

export async function prev(): Promise<void> {
  const l = live()
  if (!l) return
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
  if (!layers.black && !layers.logo && heldVideoSrc && l.video?.src === heldVideoSrc && !l.video.playing) patch.video = { ...l.video, playing: true }
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
    clearedVideo = { video: l.video, at: p && !p.error && !ended ? p.current : 0 }
  }
  // Take the slide off screen but keep the item's slides: the grid still shows them, one
  // click on a thumbnail (or Space) puts the exact slide back after an accidental Esc.
  await push({
    slideIndex: -1,
    clearedFrom: l && l.slideIndex >= 0 ? l.slideIndex : l?.clearedFrom,
    itemIndex: l?.itemIndex ?? -1,
    video: undefined,
    videoProgress: undefined,
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
      if (item?.video?.autoNext) await nextItem()
      else if (l?.video) await push({ video: { ...l.video, playing: false } })
      break
    }
  }
}

/** Phone remote / stage / projector commands — queued so simultaneous ones all apply. */
export function handleCommand(cmd: RemoteCommand | VideoEndedCommand): void {
  void enqueue(() => runCommand(cmd))
}
