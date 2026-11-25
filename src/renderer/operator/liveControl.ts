import type { DisplayLang, LiveState, PlanItem, PlanItemType, RemoteCommand, ServicePlan, Slide, SongUsage, Theme, Background } from '@shared/types'
import { uid } from '@shared/slides'
import { localDate } from '@shared/dates'
import { buildItem } from '../lib/buildSlides'
import { useApp, t } from './store'

/**
 * Everything the operator (keyboard, mouse, phone remote) can do to the screens.
 * The operator window is the only place that turns plan items into slides; the
 * result is pushed to main which keeps projector, stage and phones in sync.
 */

const api = () => window.api
const st = () => useApp.getState()
const live = () => st().live

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
      void goSlide(next)
    }, slide.advanceAfter * 1000)
  }
}

/**
 * Log CCLI usage: one entry per song per service. Songs shown from a plan are logged
 * under the plan's (service) date, so a Saturday rehearsal and the Sunday service count
 * once. Songs shown ad hoc (Songs page → Show now) are logged under today's local date.
 */
async function recordSongUsage(songId: string, plan?: ServicePlan) {
  const song = st().songs.find((s) => s.id === songId)
  if (!song) return
  const date = plan?.date || localDate()
  await api().db.upsert<SongUsage>('usage', { id: `${song.id}@${date}`, songId: song.id, title: song.title, ccli: song.ccli, date, planId: plan?.id })
}

async function logSongUsage(item: PlanItem, plan?: ServicePlan) {
  if (item.type !== 'song' || !item.refId) return
  await recordSongUsage(item.refId, plan)
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
  await api().live.update(patch)
  st().selectItem(item.id)
  scheduleAdvance(built.slides[si])
  void logSongUsage(item, plan)
}

/** Show something that is not part of the plan (from Bible / Media / Songs pages) */
export async function showAdhoc(args: { title: string; type: PlanItemType; slides: Slide[]; theme?: Theme; background?: Background | null; video?: boolean; songId?: string }): Promise<void> {
  const s = st()
  const theme = args.theme || s.themes.find((x) => x.id === s.settings.defaultThemeId) || s.themes[0]
  await api().live.update({
    itemIndex: -1,
    itemId: 'adhoc-' + uid(),
    itemTitle: args.title,
    itemType: args.type,
    itemNotes: undefined,
    slides: args.slides,
    slideIndex: args.slides.length ? 0 : -1,
    theme,
    background: args.background === undefined ? theme.background : args.background,
    itemStartedAt: Date.now(),
    video: args.video ? { src: args.slides[0]?.media || '', playing: true, loop: false, volume: 1, seekSeq: 0, seekTo: 0 } : undefined,
    videoProgress: undefined,
    layers: { black: false, clearText: false, clearBackground: false, logo: false }
  })
  if (args.songId) void recordSongUsage(args.songId)
}

export async function goSlide(index: number): Promise<void> {
  const l = live()
  if (!l || index < 0 || index >= l.slides.length) return
  await api().live.update({ slideIndex: index, layers: { ...l.layers, black: false, logo: false } })
  scheduleAdvance(l.slides[index])
}

export async function next(): Promise<void> {
  const l = live()
  if (!l) return
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
  await api().live.update({ layers: { ...l.layers, [layer]: !l.layers[layer] } })
}

export async function clearAll(): Promise<void> {
  if (advanceTimer) clearTimeout(advanceTimer)
  const l = live()
  await api().live.update({
    slides: [],
    slideIndex: -1,
    itemIndex: l?.itemIndex ?? -1,
    video: undefined,
    videoProgress: undefined,
    message: undefined,
    layers: { black: false, clearText: false, clearBackground: false, logo: false }
  })
}

export async function setDisplayLang(value: DisplayLang): Promise<void> {
  await api().live.update({ displayLang: value })
  void st().setSettings({ displayLang: value })
}

export async function showMessage(text: string): Promise<void> {
  const secs = st().settings.messageSeconds || 30
  if (messageTimer) clearTimeout(messageTimer)
  await api().live.update({ message: { text, until: Date.now() + secs * 1000, seq: Date.now() } })
  messageTimer = setTimeout(() => void api().live.update({ message: undefined }), secs * 1000 + 200)
}

export async function clearMessage(): Promise<void> {
  if (messageTimer) clearTimeout(messageTimer)
  await api().live.update({ message: undefined })
}

export async function stageMessage(text: string): Promise<void> {
  await api().live.update({ stageMessage: text ? { text, seq: Date.now() } : undefined })
}

export async function videoToggle(): Promise<void> {
  const l = live()
  if (!l?.video) return
  await api().live.update({ video: { ...l.video, playing: !l.video.playing } })
}

export async function videoSeek(seconds: number): Promise<void> {
  const l = live()
  if (!l?.video) return
  await api().live.update({ video: { ...l.video, seekSeq: l.video.seekSeq + 1, seekTo: Math.max(0, seconds) } })
}

export async function videoSet(patch: Partial<NonNullable<LiveState['video']>>): Promise<void> {
  const l = live()
  if (!l?.video) return
  await api().live.update({ video: { ...l.video, ...patch } })
}

export async function resetServiceTimer(): Promise<void> {
  await api().live.update({ serviceStartedAt: Date.now() })
}

/** Keep plan summary on stage/remote in sync when the plan is edited */
export async function syncPlanSummary(): Promise<void> {
  const plan = activePlan()
  const l = live()
  if (!plan || !l || l.planId !== plan.id) return
  const idx = plan.items.findIndex((i) => i.id === l.itemId)
  await api().live.update({ planItems: planSummary(plan), planTitle: plan.title, itemIndex: idx >= 0 ? idx : l.itemIndex })
}

/** Commands arriving from the phone remote / stage window / projector */
export function handleCommand(cmd: RemoteCommand | { type: 'videoEnded' }): void {
  switch (cmd.type) {
    case 'next':
      void next()
      break
    case 'prev':
      void prev()
      break
    case 'nextItem':
      void nextItem()
      break
    case 'prevItem':
      void prevItem()
      break
    case 'gotoItem':
      void goItem(cmd.index)
      break
    case 'gotoSlide':
      void goSlide(cmd.index)
      break
    case 'black':
      void toggleLayer('black')
      break
    case 'clearText':
      void toggleLayer('clearText')
      break
    case 'logo':
      void toggleLayer('logo')
      break
    case 'clearAll':
      void clearAll()
      break
    case 'displayLang':
      void setDisplayLang(cmd.value)
      break
    case 'message':
      void showMessage(cmd.text)
      break
    case 'clearMessage':
      void clearMessage()
      break
    case 'stageMessage':
      void stageMessage(cmd.text)
      break
    case 'videoToggle':
      void videoToggle()
      break
    case 'videoEnded': {
      const plan = activePlan()
      const l = live()
      const item = plan?.items.find((i) => i.id === l?.itemId)
      if (item?.video?.autoNext) void nextItem()
      else if (l?.video) void api().live.update({ video: { ...l.video, playing: false } })
      break
    }
  }
}
