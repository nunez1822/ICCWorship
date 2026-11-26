/**
 * "Ready for Sunday?" — a pre-service checklist (Live page → ✅). One click before the service tells a volunteer
 * what would go wrong on screen, while there is still time to fix it: a song deleted from the library, a video
 * file that moved, the projector window closed, the second screen not plugged in, the phone remote off…
 *
 * This file only judges facts the operator page gathered (src/renderer/operator/preflight.ts): pure, unit tested.
 */

export type CheckLevel = 'ok' | 'warn' | 'error'
/** what the check's button does (the page maps it to an action) */
export type CheckAction = 'openOutput' | 'screens' | 'plans' | 'backupNow' | 'phone' | 'sound'

export interface Check {
  id: string
  level: CheckLevel
  /** i18n key under "ready." */
  key: string
  params?: Record<string, string | number>
  action?: CheckAction
}

export interface ItemProblem {
  title: string
  /** missing: its song/media/presentation was deleted; file: a picture, video or track file isn't there;
   *  warning: it can't be built as it is (no Bible version for a scripture item, an empty song…) */
  kind: 'missing' | 'file' | 'warning'
}

export interface PreflightInput {
  now: number
  /** YYYY-MM-DD, this PC's date */
  today: string
  plan?: { title: string; date: string; items: number }
  itemProblems: ItemProblem[]
  outputOpen: boolean
  displays: number
  /** the projector is set to show on this PC's main screen (or only one screen exists) */
  outputOnMainScreen: boolean
  /** the chosen sound output: '' = Windows default; connected = it is in the device list right now */
  sound: { chosen: string; connected: boolean }
  /** the plan plays something with sound (a video, a backing track, an audio file) */
  planHasSound: boolean
  server: { enabled: boolean; running: boolean; error?: string; clients: number }
  lastBackupAt?: number
  readOnly: boolean
  update?: { version: string }
}

const DAY = 24 * 60 * 60 * 1000
/** a backup older than this is worth renewing before a service */
export const BACKUP_STALE_DAYS = 7

export function preflight(i: PreflightInput): Check[] {
  const out: Check[] = []
  const add = (c: Check) => out.push(c)

  // the data can't be saved: everything else may still work, but the volunteer must know first
  if (i.readOnly) add({ id: 'data', level: 'error', key: 'readOnly' })

  // the plan
  if (!i.plan) add({ id: 'plan', level: 'warn', key: 'noPlan', action: 'plans' })
  else if (!i.plan.items) add({ id: 'plan', level: 'warn', key: 'emptyPlan', params: { title: i.plan.title }, action: 'plans' })
  else if (i.plan.date && i.plan.date < i.today)
    add({ id: 'plan', level: 'warn', key: 'oldPlan', params: { title: i.plan.title, date: i.plan.date }, action: 'plans' })
  else add({ id: 'plan', level: 'ok', key: 'plan', params: { title: i.plan.title, count: i.plan.items } })

  // what is in it
  if (i.plan?.items) {
    const names = (kind: ItemProblem['kind']) =>
      i.itemProblems
        .filter((p) => p.kind === kind)
        .map((p) => p.title)
        .slice(0, 4)
        .join(', ')
    const count = (kind: ItemProblem['kind']) => i.itemProblems.filter((p) => p.kind === kind).length
    if (count('missing'))
      add({ id: 'missing', level: 'error', key: 'itemsMissing', params: { count: count('missing'), names: names('missing') }, action: 'plans' })
    if (count('file')) add({ id: 'files', level: 'error', key: 'filesMissing', params: { count: count('file'), names: names('file') }, action: 'plans' })
    if (count('warning'))
      add({ id: 'warnings', level: 'warn', key: 'itemsWarn', params: { count: count('warning'), names: names('warning') }, action: 'plans' })
    if (!i.itemProblems.length) add({ id: 'items', level: 'ok', key: 'itemsOk' })
  }

  // the screens
  if (!i.outputOpen) add({ id: 'output', level: 'error', key: 'outputClosed', action: 'openOutput' })
  else if (i.displays < 2) add({ id: 'output', level: 'warn', key: 'oneScreen', action: 'screens' })
  else if (i.outputOnMainScreen) add({ id: 'output', level: 'warn', key: 'outputOnMain', action: 'screens' })
  else add({ id: 'output', level: 'ok', key: 'outputOk', params: { count: i.displays } })

  // sound (only worth a line when the plan plays something, or a chosen output is gone)
  if (i.sound.chosen && !i.sound.connected)
    add({ id: 'sound', level: i.planHasSound ? 'error' : 'warn', key: 'soundMissing', params: { label: i.sound.chosen }, action: 'sound' })
  else if (i.planHasSound) add({ id: 'sound', level: 'ok', key: i.sound.chosen ? 'soundChosen' : 'soundDefault', params: { label: i.sound.chosen } })

  // phone remote / stage display
  if (i.server.enabled && !i.server.running) add({ id: 'phone', level: 'warn', key: 'phoneDown', params: { error: i.server.error || '?' }, action: 'phone' })
  else if (i.server.enabled) add({ id: 'phone', level: 'ok', key: 'phoneOk', params: { count: i.server.clients } })

  // a recent backup
  const age = i.lastBackupAt ? Math.floor((i.now - i.lastBackupAt) / DAY) : undefined
  if (age === undefined) add({ id: 'backup', level: 'warn', key: 'noBackup', action: 'backupNow' })
  else if (age >= BACKUP_STALE_DAYS) add({ id: 'backup', level: 'warn', key: 'oldBackup', params: { days: age }, action: 'backupNow' })
  else add({ id: 'backup', level: 'ok', key: 'backupOk' })

  // a downloaded update installs when the app closes: good to know it won't restart mid-service
  if (i.update) add({ id: 'update', level: 'ok', key: 'updateReady', params: { version: i.update.version } })

  return out
}

/** the overall verdict: the worst level */
export const verdict = (checks: Check[]): CheckLevel =>
  checks.some((c) => c.level === 'error') ? 'error' : checks.some((c) => c.level === 'warn') ? 'warn' : 'ok'
