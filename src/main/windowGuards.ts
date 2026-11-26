/* ------------------------------ crash & freeze recovery ------------------------------ */
// The projector and stage windows reload themselves when their page crashes or freezes, resuming what is live
// (main holds the live state). If one keeps crashing, the projector falls back to plain black ("safe" mode) and
// finally stops retrying; the operator is told every time.
import { app, type BrowserWindow } from 'electron'
import { Heartbeat, ReloadBudget } from '@shared/recovery'
import { onScreen } from '@shared/updatePolicy'
import { lifecycle, notify, open, pendingNotices, wins } from './appState'
import { db } from './db'
import { messageBox } from './dialogs'
import { t } from './i18n'
import { live } from './live'
import { log } from './log'
import { loadPage } from './pages'
import { endSession, flushSession } from './session'

export type Guarded = 'output' | 'stage'
const winOf = (kind: Guarded) => (kind === 'output' ? wins.output : wins.stage)
export const guards: Record<Guarded, { budget: ReloadBudget; beat: Heartbeat; unresponsive?: ReturnType<typeof setTimeout>; failed?: boolean }> = {
  output: { budget: new ReloadBudget(), beat: new Heartbeat(() => killFrozen('output')) },
  stage: { budget: new ReloadBudget(), beat: new Heartbeat(() => killFrozen('stage')) }
}

function killFrozen(kind: Guarded): void {
  const win = winOf(kind)
  clearUnresponsive(kind)
  if (lifecycle.quitting || !open(win)) return
  log.warn(`${kind} window stopped responding: restarting it`)
  win.webContents.forcefullyCrashRenderer() // → render-process-gone → recover()
}

export function recover(kind: Guarded, reason: string): void {
  const win = winOf(kind)
  if (lifecycle.quitting || !open(win)) return
  const g = guards[kind]
  g.beat.stop()
  clearUnresponsive(kind) // the page is being replaced: an old "unresponsive" timer must not kill the new one
  const step = g.budget.next()
  log.warn(`${kind} window ${reason}: ${step}`)
  if (step === 'give-up' || (kind === 'stage' && step === 'safe')) {
    g.failed = true // "Restart projector" / "Open stage display" start it again
    return notify({ type: 'windowFailed', window: kind })
  }
  if (kind === 'output') loadPage(win, 'output', step === 'safe' ? '#safe' : '')
  else loadPage(win, 'stage', '#local')
  notify({ type: 'windowRecovered', window: kind, safe: step === 'safe' })
}

function clearUnresponsive(kind: Guarded): void {
  clearTimeout(guards[kind].unresponsive)
  guards[kind].unresponsive = undefined
}

export function guardWindow(win: BrowserWindow, kind: Guarded): void {
  const g = guards[kind]
  g.budget.reset()
  g.failed = false
  g.beat.stop()
  clearUnresponsive(kind)
  win.webContents.on('render-process-gone', (_e, d) => {
    if (d.reason !== 'clean-exit') recover(kind, `crashed (${d.reason})`)
  })
  win.on('unresponsive', () => {
    log.warn(`${kind} window unresponsive`)
    clearUnresponsive(kind)
    // 'responsive', a crash or a heartbeat restart clears this timer first, so it only fires on a page still frozen
    g.unresponsive = setTimeout(() => {
      g.unresponsive = undefined
      killFrozen(kind)
    }, 5000)
  })
  win.on('responsive', () => clearUnresponsive(kind))
  win.on('closed', () => {
    clearUnresponsive(kind)
    g.beat.stop()
  })
}

/** which guarded window sent this IPC message */
export function kindOf(sender: Electron.WebContents): Guarded | null {
  if (open(wins.output) && sender === wins.output.webContents) return 'output'
  if (open(wins.stage) && sender === wins.stage.webContents) return 'stage'
  return null
}

// The operator window reloads once after a crash; a second crash within a minute asks the user. Once the
// window has run fine for a minute, it goes back to reloading by itself.
const operatorBudget = new ReloadBudget(1, 60_000)
let operatorStable: ReturnType<typeof setTimeout> | undefined

// The operator page beats too (see operator/main.tsx). A FROZEN page (an endless loop, a stuck task) doesn't crash,
// and Chromium's "unresponsive" only fires after input, so without this nothing would ever notice. Like VS Code's
// "The window is not responding" and Chrome's "Page Unresponsive", the volunteer is asked instead of the page being
// killed: something long may still finish. The question closes by itself if the page starts beating again.
const OPERATOR_STALL_MS = 10_000
const operatorBeat = new Heartbeat(() => void askAboutFrozenOperator(), OPERATOR_STALL_MS)
/** the open "not responding" question (aborted when the page answers again) */
let frozenAsk: AbortController | null = null
/** the volunteer chose "Restart the window": the crash that follows is ours, reload without asking again */
let restartingFrozen = false
/** a confirm() is open in the operator page: it blocks the page (and its beats) while the volunteer reads it */
let operatorBusy = false

async function askAboutFrozenOperator(): Promise<void> {
  const win = wins.operator
  if (lifecycle.quitting || !open(win) || frozenAsk) return
  log.warn('operator window stopped responding: asking')
  const ask = new AbortController()
  frozenAsk = ask
  const r = await messageBox({
    type: 'warning',
    title: 'ICCWorship',
    message: t('recovery.operatorFrozen'),
    detail: t('recovery.operatorFrozenDetail'),
    buttons: [t('recovery.restartWindow'), t('recovery.keepWaiting')],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    signal: ask.signal
  })
  frozenAsk = null
  if (ask.signal.aborted || lifecycle.quitting || win.isDestroyed()) return // it answered again by itself
  if (r.response === 0) {
    log.warn('operator window stopped responding: restarting it')
    restartingFrozen = true
    win.webContents.forcefullyCrashRenderer() // → render-process-gone → reload (guardOperator)
  } else {
    log.info('operator window stopped responding: waiting')
    operatorBeat.beat() // watch again: still no sign of life in 10 s → ask again
  }
}

/** a heartbeat from the operator page: it is alive (and a "not responding" question is no longer needed) */
export function operatorAlive(): void {
  operatorBeat.beat()
  if (frozenAsk) {
    log.info('operator window responding again')
    frozenAsk.abort()
  }
}

/** the operator page opened / closed a confirm() (it blocks the page): waiting for the volunteer isn't a freeze */
export function setOperatorBusy(busy: boolean): void {
  operatorBusy = busy
  if (busy) operatorBeat.pause()
  else operatorBeat.resume()
}

export function guardOperator(win: BrowserWindow): void {
  win.webContents.on('did-finish-load', () => {
    clearTimeout(operatorStable)
    operatorStable = setTimeout(() => operatorBudget.reset(), 60_000)
  })
  win.on('closed', () => {
    clearTimeout(operatorStable)
    operatorBeat.stop()
    frozenAsk?.abort()
  })
  win.webContents.on('render-process-gone', async (_e, d) => {
    clearTimeout(operatorStable)
    operatorBeat.stop() // the new page starts watching again with its first beat
    frozenAsk?.abort()
    if (d.reason === 'clean-exit' || lifecycle.quitting || win.isDestroyed()) return
    db().flush()
    if (restartingFrozen) {
      // the volunteer asked for it (the window had stopped responding): reload, no second question
      restartingFrozen = false
      pendingNotices.push('operatorRecovered')
      loadPage(win, 'index')
      return
    }
    log.error(`operator window crashed (${d.reason})`)
    if (operatorBudget.next() === 'reload') {
      pendingNotices.push('operatorRecovered')
      loadPage(win, 'index')
      return
    }
    // async: a synchronous dialog would block main, freezing the projector and phone remote too
    const r = await messageBox({
      type: 'error',
      title: 'ICCWorship',
      message: t('recovery.operatorCrashed'),
      buttons: [t('recovery.reload'), t('menu.quit')],
      defaultId: 0
    })
    if (r.response === 0 && !win.isDestroyed()) {
      pendingNotices.push('operatorRecovered')
      loadPage(win, 'index')
    } else app.quit()
  })
  // the volunteer is clicking a window that doesn't answer: ask now rather than after the heartbeat's 10 s
  win.on('unresponsive', () => {
    log.warn('operator window unresponsive')
    if (!operatorBusy) void askAboutFrozenOperator()
  })
  // Windows shutdown / log off skips before-quit: save now. With nothing on screen it is a normal end of the day (no
  // "closed unexpectedly" offer next time); mid-service (a forced restart for an update) the place is offered back.
  win.on('session-end', () => {
    log.info('Windows session ending: saving')
    db().flush()
    if (onScreen(live.state)) flushSession()
    else endSession()
  })
}

/** sleep: don't mistake the pause for a frozen window when the PC wakes up */
export function pauseHeartbeats(): void {
  guards.output.beat.pause()
  guards.stage.beat.pause()
  operatorBeat.pause()
}
export function resumeHeartbeats(): void {
  guards.output.beat.resume()
  guards.stage.beat.resume()
  if (!operatorBusy) operatorBeat.resume() // a confirm() still open keeps it paused
}
