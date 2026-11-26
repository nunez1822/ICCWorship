import { normalizeItemTrack } from '@shared/tracks'
import type { TFunction } from 'i18next'
import type { MediaItem, PlanItem, Presentation, ServicePlan, Song } from '@shared/types'

/** Plans (and templates) that contain an item pointing at this song / media / presentation. */
export function plansUsing(plans: ServicePlan[], refId: string): ServicePlan[] {
  return plans.filter((p) => p.items.some((i) => i.refId === refId))
}

/** Text appended to a delete confirmation when the thing is still used in plans. */
export function usedInPlansNote(plans: ServicePlan[], refId: string, t: TFunction): string {
  const used = plansUsing(plans, refId)
  if (!used.length) return ''
  const list = used
    .slice(0, 5)
    .map((p) => `• ${p.isTemplate ? '⭐ ' : ''}${p.date ? `${p.date} · ` : ''}${p.title}`)
    .join('\n')
  return '\n\n' + t('common.usedInPlans', { count: used.length, list })
}

/** True when a plan item points at a song / media / presentation that no longer exists. */
/** a song item that plays its song's backing track in this service (the plan says so and the song has one) */
export function playsTrack(item: Pick<PlanItem, 'type' | 'refId' | 'track'>, songs: Pick<Song, 'id' | 'track'>[]): boolean {
  return item.type === 'song' && normalizeItemTrack(item.track)?.play === true && !!songs.find((x) => x.id === item.refId)?.track
}

export function itemSourceMissing(item: PlanItem, lib: { songs: Song[]; media: MediaItem[]; presentations: Presentation[] }): boolean {
  if (!item.refId) return false
  if (item.type === 'song') return !lib.songs.some((x) => x.id === item.refId)
  if (item.type === 'media') return !lib.media.some((x) => x.id === item.refId)
  if (item.type === 'presentation') return !lib.presentations.some((x) => x.id === item.refId)
  return false
}
