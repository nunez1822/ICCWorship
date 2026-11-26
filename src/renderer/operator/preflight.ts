/**
 * Gathers the facts for the "Ready for Sunday?" checklist (@shared/preflight judges them). Every plan item is built
 * exactly as going live would build it, and every file it needs is looked up the way the projector resolves it.
 */
import { localDate } from '@shared/dates'
import type { ItemProblem, PreflightInput } from '@shared/preflight'
import type { PlanItem } from '@shared/types'
import { buildItem } from '../lib/buildSlides'
import { itemSourceMissing, playsTrack } from '../lib/planRefs'
import { useApp } from './store'

/** the media:// files an item needs on screen: pictures, videos, its background, its backing track */
function filesOf(built: Awaited<ReturnType<typeof buildItem>>): string[] {
  const urls = [
    ...built.slides.filter((x) => x.kind === 'image' || x.kind === 'video').map((x) => x.media),
    built.background?.type === 'image' || built.background?.type === 'video' ? built.background.value : undefined,
    built.track?.src
  ]
  return urls.filter((u): u is string => !!u?.startsWith('media://'))
}

async function soundOutputConnected(chosen: string, id: string | undefined): Promise<boolean> {
  if (!chosen) return true
  try {
    const outs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audiooutput')
    return outs.some((d) => (id && d.deviceId === id) || d.label === chosen)
  } catch {
    return true // can't tell: don't raise a false alarm
  }
}

export async function gatherPreflight(): Promise<PreflightInput> {
  const s = useApp.getState()
  const api = window.api
  const plan = s.plans.find((p) => p.id === s.activePlanId)
  const ctx = { songs: s.songs, media: s.media, presentations: s.presentations, themes: s.themes, settings: s.settings, bibles: s.bibles, planDate: plan?.date }

  const itemProblems: ItemProblem[] = []
  const needs: { item: PlanItem; url: string }[] = []
  let planHasSound = false
  for (const item of plan?.items || []) {
    if (item.type === 'header') continue
    if (itemSourceMissing(item, s)) {
      itemProblems.push({ title: item.title, kind: 'missing' })
      continue
    }
    if (playsTrack(item, s.songs)) planHasSound = true
    if (item.type === 'media' && s.media.find((m) => m.id === item.refId)?.kind !== 'image') planHasSound = true
    try {
      const built = await buildItem(item, ctx)
      if (built.warning) itemProblems.push({ title: item.title, kind: 'warning' })
      if (built.slides.some((x) => x.kind === 'video')) planHasSound = true
      for (const url of filesOf(built)) needs.push({ item, url })
    } catch {
      itemProblems.push({ title: item.title, kind: 'warning' })
    }
  }
  if (needs.length) {
    const status = await api.files.mediaStatus(needs.map((n) => n.url))
    const missing = new Set(needs.filter((_n, i) => !status[i]?.exists).map((n) => n.item))
    for (const item of missing) itemProblems.push({ title: item.title, kind: 'file' })
  }

  const [displays, server, backups, update, out] = await Promise.all([
    api.displays.list(),
    api.server.info(),
    api.backup.list(),
    api.app.updateStatus(),
    api.output.status()
  ])
  const st = s.settings
  const outputDisplay = displays.find((d) => d.id === st?.outputDisplayId) ?? displays.find((d) => !d.primary)
  const chosenSound = st?.audioOutputLabel || ''
  return {
    now: Date.now(),
    today: localDate(),
    plan: plan ? { title: plan.title, date: plan.date, items: plan.items.filter((i) => i.type !== 'header').length } : undefined,
    itemProblems,
    outputOpen: out.open,
    displays: displays.length,
    outputOnMainScreen: !outputDisplay || outputDisplay.primary,
    sound: { chosen: chosenSound, connected: await soundOutputConnected(chosenSound, st?.audioOutputId) },
    planHasSound,
    server: { enabled: !!st?.serverEnabled, running: server.running, clients: server.clients },
    lastBackupAt: backups.length ? Math.max(...backups.map((b) => b.date)) : undefined,
    readOnly: !!s.dataStatus?.readOnly,
    update: update.phase === 'ready' ? { version: update.version } : undefined
  }
}
