import type { Background, MediaItem, PlanItem, Presentation, Settings, Slide, Song, Theme, BibleVersionInfo } from '@shared/types'
import { countdownTarget, notesToSlides, scriptureToSlides, songToSlides, uid } from '@shared/slides'
import { backgroundFromMedia, isVideoUrl, toMediaUrl } from './media'

export type BuildSettings = Pick<Settings, 'defaultThemeId' | 'ccliLicense'>

export interface BuildContext {
  songs: Song[]
  media: MediaItem[]
  presentations: Presentation[]
  themes: Theme[]
  /** only the settings that change what slides look like: previews rebuild when these change */
  settings: BuildSettings
  bibles: BibleVersionInfo[]
  /** the plan's date (YYYY-MM-DD): a "count down to HH:MM" aims at that day */
  planDate?: string
}

export interface BuiltItem {
  slides: Slide[]
  theme: Theme
  background: Background | null
  /** message to show the operator, e.g. "song not found" */
  warning?: string
  isVideo?: boolean
}

export function themeFor(item: Pick<PlanItem, 'themeId'> | undefined, ctx: BuildContext): Theme {
  return ctx.themes.find((t) => t.id === item?.themeId) || ctx.themes.find((t) => t.id === ctx.settings.defaultThemeId) || ctx.themes[0]
}

const FALLBACK_BACKGROUND: Background = {
  type: 'gradient',
  value: 'radial-gradient(ellipse at 50% 30%, #1d3557 0%, #0b1324 70%, #05080f 100%)'
}

/**
 * The theme's background, unless it is an image/video that was removed from the media
 * library — then the built-in gradient, so the screen matches what the Themes page shows
 * ("—") instead of quietly playing a file the church took out of the app.
 */
export function themeBackground(theme: Theme, media: MediaItem[]): Background {
  const bg = theme.background
  if (bg.type !== 'image' && bg.type !== 'video') return bg
  return media.some((m) => toMediaUrl(m.path) === bg.value) ? bg : { ...FALLBACK_BACKGROUND, dim: bg.dim }
}

export async function buildItem(item: PlanItem, ctx: BuildContext): Promise<BuiltItem> {
  const theme = themeFor(item, ctx)
  let background: Background | null = themeBackground(theme, ctx.media)
  if (item.backgroundMediaId) {
    const m = ctx.media.find((x) => x.id === item.backgroundMediaId)
    if (m) background = backgroundFromMedia(m.path, theme.background.dim ?? 0.35) || background
  }
  const base = { theme, background }
  switch (item.type) {
    case 'song': {
      const song = ctx.songs.find((s) => s.id === item.refId)
      if (!song) return { ...base, slides: [], warning: 'warn.songMissing' }
      return { ...base, slides: songToSlides(song, { ccliLicense: ctx.settings.ccliLicense }) }
    }
    case 'scripture': {
      const sc = item.scripture
      if (!sc) return { ...base, slides: [] }
      return { ...base, ...(await scriptureSlides(sc.ref, sc.primary, sc.secondary, ctx)) }
    }
    case 'notes':
      return { ...base, slides: notesToSlides(item.slides || []) }
    case 'announcement':
    case 'header':
    case 'prayer': {
      const slides: Slide[] = (item.slides || []).map((s) => ({
        id: uid(),
        kind: s.media && !s.text?.en && !s.text?.es && !s.title?.en && !s.title?.es ? (isVideoUrl(s.media) ? 'video' : 'image') : 'text',
        title: s.title,
        text: s.text,
        media: s.media,
        advanceAfter: item.loopSeconds || undefined
      }))
      if (!slides.length) slides.push({ id: uid(), kind: 'text', title: { en: item.title, es: item.title } })
      return { ...base, slides }
    }
    case 'media': {
      const m = ctx.media.find((x) => x.id === item.refId)
      if (!m) return { ...base, slides: [], warning: 'warn.mediaMissing' }
      const url = toMediaUrl(m.path)
      if (m.kind === 'image') return { ...base, slides: [{ id: uid(), kind: 'image', media: url, group: m.name }] }
      return { ...base, isVideo: true, slides: [{ id: uid(), kind: 'video', media: url, group: m.name }] }
    }
    case 'presentation': {
      const p = ctx.presentations.find((x) => x.id === item.refId)
      if (!p) return { ...base, slides: [], warning: 'warn.presMissing' }
      return {
        ...base,
        slides: p.slides.map((s, i) => ({
          id: uid(),
          kind: s.image ? 'image' : 'text',
          media: s.image,
          text: s.text,
          notes: s.notes,
          group: String(i + 1)
        }))
      }
    }
    case 'countdown': {
      const c = item.countdown || { mode: 'duration', minutes: 5 }
      const to = c.mode === 'time' && c.time ? countdownTarget(c.time, ctx.planDate) : Date.now() + (c.minutes || 5) * 60_000
      return { ...base, slides: [{ id: uid(), kind: 'countdown', countdownTo: to, countdownLabel: c.label }] }
    }
    case 'blank':
    default:
      return { ...base, slides: [{ id: uid(), kind: 'blank', group: item.title }] }
  }
}

export async function scriptureSlides(
  ref: string,
  primaryId: string,
  secondaryId: string | undefined,
  ctx: Pick<BuildContext, 'bibles'>
): Promise<{ slides: Slide[]; warning?: string; reference?: string }> {
  const pInfo = ctx.bibles.find((b) => b.id === primaryId)
  const sInfo = secondaryId ? ctx.bibles.find((b) => b.id === secondaryId) : undefined
  if (!pInfo) return { slides: [], warning: 'warn.bibleMissing' }
  const primary = await window.api.bible.passage(primaryId, ref)
  // if the preferred version doesn't have it (pasted versions), say so instead of failing silently
  if (!primary.ok) {
    if (!sInfo) return { slides: [], warning: primary.error === 'missing' ? 'warn.pastedMissing' : 'warn.refInvalid' }
  }
  let secondary = sInfo && sInfo.lang !== pInfo.lang ? await window.api.bible.passage(sInfo.id, ref) : undefined
  if (secondary && !secondary.ok) secondary = undefined
  if (!primary.ok && secondary) {
    return {
      slides: scriptureToSlides({ lang: sInfo!.lang, passage: secondary }),
      warning: primary.error === 'missing' ? 'warn.pastedMissing' : undefined,
      reference: secondary.reference
    }
  }
  const slides = scriptureToSlides({ lang: pInfo.lang, passage: primary }, secondary ? { lang: sInfo!.lang, passage: secondary } : undefined)
  return { slides, warning: primary.missing.length ? 'warn.someMissing' : undefined, reference: primary.reference }
}
