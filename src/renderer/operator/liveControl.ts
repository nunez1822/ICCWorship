import type { DisplayLang, LiveState, PlanItem, PlanItemType, RemoteCommand, ServicePlan, Slide, SongUsage, Theme, Background } from '@shared/types'
import { songName, songToSlides, uid } from '@shared/slides'
import { localDate } from '@shared/dates'
import { buildItem, themeBackground } from '../lib/buildSlides'
import { mediaUrlToPath } from '../lib/media'
import { useApp, t } from './store'

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
  return s
}

/**
 * Run operator actions one at a time, in the order they were triggered. Without this, a
 * phone tap and a key press in the same instant (or a burst of taps) each computed
 * "slide + 1" from the same old state and moves were lost. Use at entry points only
 * (keyboard, buttons, remote commands) — the actions call each other directly.
 */
let chain: Promise<void> = Promise.resolve()
export function enqueue(fn: () => unknown): Promise<void> {
  const r = chain.then(() => fn()).then(
    () => undefined,
    (e) => console.error('live action failed', e)
  )
  chain = r
  return r
}

let advanceTimer: ReturnType<typeof setTimeout> | null = null
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
  if (slide?.advanceAfter && slide.advanceAfter > 0) {
    advanceTimer = setTimeout(() => {
      const l = live()
      if (!l) return
      // announcement loops wrap around inside the item
      const next = l.slideIndex + 1 < l.slides.length ? l.slideIndex + 1 : 0
      void enqueue(() => goSlide(next))
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
    video: built.isVideo
      ? { src: built.slides[0]?.media || '', playing: true, loop: item.video?.loop ?? false, volume: item.video?.volume ?? 1, seekSeq: 0, seekTo: 0 }
      : undefined,
    videoProgress: undefined,
    // going to new content lifts the logo/black/clear layers
    layers: { black: false, clearText: false, clearBackground: false, logo: false }
  }
  await push(patch)
  st().selectItem(item.id)
  checkMediaFiles(built.slides, built.background)
  scheduleAdvance(built.slides[si])
  void logSongUsage(item, plan)
}

/** Show something that is not part of the plan (from Bible / Media / Songs pages) */
export async function showAdhoc(args: { title: string; type: PlanItemType; slides: Slide[]; theme?: Theme; background?: Background | null; video?: boolean; songId?: string }): Promise<void> {
  const s = st()
  // nothing to show (e.g. a song with no lyrics yet): say so instead of blanking the screen
  if (!args.slides.length) {
    s.toast(t('live.noSlides'), 'err')
    return
  }
  const theme = args.theme || s.themes.find((x) => x.id === s.settings.defaultThemeId) || s.themes[0]
  const background = args.background === undefined ? themeBackground(theme, s.media) : args.background
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
    video: args.video ? { src: args.slides[0]?.media || '', playing: true, loop: false, volume: 1, seekSeq: 0, seekTo: 0 } : undefined,
    videoProgress: undefined,
    layers: { black: false, clearText: false, clearBackground: false, logo: false }
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
  const plan = activePlan()
  const item = plan?.items.find((i) => i.id === l.itemId)
  const slides = item ? (await buildItem(item, ctx())).slides : songToSlides(song, { ccliLicense: st().settings.ccliLicense })
  if (!slides.length) return
  const clamp = (i: number | undefined) => (i === undefined ? undefined : Math.min(i, slides.length - 1))
  await push({ slides, slideIndex: l.slideIndex < 0 ? -1 : clamp(l.slideIndex)!, clearedFrom: clamp(l.clearedFrom) })
}

export async function goSlide(index: number): Promise<void> {
  const l = live()
  if (!l || index < 0 || index >= l.slides.length) return
  await push({ slideIndex: index, clearedFrom: undefined, layers: { ...l.layers, black: false, logo: false } })
  scheduleAdvance(l.slides[index])
}

export async function next(): Promise<void> {
  const l = live()
  if (!l) return
  // Resume after an accidental Esc — but only while the operator is still on the plan that
  // item came from (an ad-hoc item has no plan). After switching plans, Space starts the
  // selected plan instead of bringing back something from another service.
  const samePlan = l.itemIndex < 0 || l.planId === activePlan()?.id
  if (l.slideIndex < 0 && samePlan && l.clearedFrom !== undefined && l.clearedFrom < l.slides.length) return goSlide(l.clearedFrom)
  if (l.slideIndex < 0 && !samePlan) return nextItem()
  if (l.slideIndex + 1 < l.slides.length) return goSlide(l.slideIndex + 1)
  return nextItem()
}

export async function prev(): Promise<void> {
  const l = live()
  if (!l) return
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
  await push({ layers: { ...l.layers, [layer]: !l.layers[layer] } })
}

export async function clearAll(): Promise<void> {
  if (advanceTimer) clearTimeout(advanceTimer)
  const l = live()
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

export async function videoSeek(seconds: number): Promise<void> {
  const l = live()
  if (!l?.video) return
  // seeking a finished video means "play it again from there"
  const playing = l.video.playing || videoEnded(l)
  await push({ video: { ...l.video, playing, seekSeq: l.video.seekSeq + 1, seekTo: Math.max(0, seconds) } })
}

export async function videoSet(patch: Partial<NonNullable<LiveState['video']>>): Promise<void> {
  const l = live()
  if (!l?.video) return
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
async function runCommand(cmd: RemoteCommand | { type: 'videoEnded' }): Promise<void> {
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
      const plan = activePlan()
      const l = live()
      const item = plan?.items.find((i) => i.id === l?.itemId)
      if (item?.video?.autoNext) await nextItem()
      else if (l?.video) await push({ video: { ...l.video, playing: false } })
      break
    }
  }
}

/** Phone remote / stage / projector commands — queued so simultaneous ones all apply. */
export function handleCommand(cmd: RemoteCommand | { type: 'videoEnded' }): void {
  void enqueue(() => runCommand(cmd))
}
