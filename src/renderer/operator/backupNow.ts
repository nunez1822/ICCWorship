import i18n from '../i18n'
import { useApp } from './store'

/**
 * "Back up now" (Settings → Backup, and the "Ready for Sunday?" checklist): save a backup where the operator chooses
 * and say what happened — including when the media library or the tracks had to stay out (too much for the .zip or
 * for the stick), so the operator knows which folders to copy as well, and where. false: cancelled or failed.
 */
export async function backupNow(): Promise<boolean> {
  const s = useApp.getState()
  const r = await window.api.backup.create()
  if (!r) return false
  if (!r.ok) {
    s.toast(i18n.t(`settings.backupError.${r.error}`), 'err', 15_000)
    return false
  }
  // main noted when (lastManualBackup): the checklist's backup line counts it right away, from either page
  useApp.setState({ settings: await window.api.settings.get() })
  const what = r.mediaLeftOut && r.tracksLeftOut ? 'both' : r.mediaLeftOut ? 'media' : r.tracksLeftOut ? 'tracks' : undefined
  const partial = what && `settings.backupLeftOut.${r.leftOutBecause === 'no-space' ? 'noSpace' : 'tooLarge'}.${what}`
  s.toast(
    i18n.t(partial || 'settings.backupDone', { files: r.files, size: (r.bytes / 1024 / 1024).toFixed(1) }),
    partial ? 'info' : 'ok',
    partial ? 20_000 : undefined
  )
  return true
}
