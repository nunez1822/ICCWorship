import './bootstrap' // must stay the first import: it adjusts app paths before other modules use them
/**
 * The main process: startup, last-resort error handling and app lifecycle. Everything else lives in its own module:
 *   windows.ts (windows) · windowGuards.ts (crash & freeze recovery) · ipc/ (every IPC channel, typed)
 *   pages.ts (loading our pages, trusted senders) · hardening.ts · mediaProtocol.ts · dialogs.ts · menu.ts · help.ts
 */
import { app, dialog, powerMonitor, protocol, screen } from 'electron'
import { db, getSettings, prepareData, seedIfEmpty } from './db'
import { live } from './live'
import { setCommandHandler, stopServer } from './server'
import { autoBackup, createSafetyBackup } from './backup'
import { dataRoot } from './paths'
import { log, setLogDataRoot } from './log'
import { setMainLang, t } from './i18n'
import { beforeQuit as updatesBeforeQuit, checkForUpdates } from './updates'
import { cleanupOrphanTracks } from './tracks'
import { lifecycle, notify, open, pendingNotices, send, wins } from './appState'
import { isAbortedLoad } from './pages'
import { hardenWebContents } from './hardening'
import { registerMediaProtocol } from './mediaProtocol'
import { appSchemePrivileges, registerAppProtocol } from './appProtocol'
import { buildMenu } from './menu'
import { registerIpc } from './ipc'
import { restartServer } from './serverControl'
import { broadcastLive, createOperator, createOutput, forwardCommand, placeOutput } from './windows'
import { pauseHeartbeats, resumeHeartbeats } from './windowGuards'
import { endSession, startSession } from './session'
import { isTestProfile, location } from './bootstrap'
import { machineLock } from './machineLock'

// app:// serves the app's own pages (appUrl.ts). media:// serves local media files to them: corsEnabled +
// "Access-Control-Allow-Origin: *" are needed because PDF import fetch()es media:// from an app:// page (another
// origin), and thumbnails load with crossOrigin="anonymous".
protocol.registerSchemesAsPrivileged([
  appSchemePrivileges,
  { scheme: 'media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
])

/* ------------------------------ last-resort error handling ------------------------------ */
// An error nothing else caught must never take the projector down silently mid-service: log it, save what can
// be saved, and tell the operator. Only if the app hasn't even opened its window yet is it fatal.
process.on('uncaughtException', (e) => {
  log.error('uncaught exception in main:', e)
  try {
    db().flush()
  } catch {
    /* nothing more we can do */
  }
  if (open(wins.operator)) notify({ type: 'mainError' })
  else if (!lifecycle.started && !lifecycle.quitting) startupFailed(e)
  // else: the window is already closed and the app is quitting. It is logged; there is nothing to show.
})
/** The app couldn't open its window: say so (a silent exit looks like "nothing happens" on double-click). */
function startupFailed(e: unknown): void {
  dialog.showErrorBox('ICCWorship', `${t('errors.startFailed')}\n\n${e instanceof Error ? e.message : String(e)}`)
  app.exit(1)
}
process.on('unhandledRejection', (r) => {
  // a page load replaced by a newer one (a reload during a reload) rejects with ERR_ABORTED: nothing failed
  if (isAbortedLoad(r)) return log.info('page load superseded')
  // a non-Error rejection is logged only by its kind: its text could be anything (a payload, a file's content)
  log.error('unhandled rejection in main:', r instanceof Error ? r : `(${typeof r})`)
  notify({ type: 'mainError' })
})

/* ------------------------------ app lifecycle ------------------------------ */
app.setAppUserModelId('org.iccworship.app')

const single = app.requestSingleInstanceLock()
// Second launch (double-clicked icon while running): hand over to the first instance
// and exit immediately. app.quit() before 'ready' left helper processes running.
if (!single) app.exit(0)
app.on('second-instance', () => {
  const operator = wins.operator
  if (operator) {
    if (operator.isMinimized()) operator.restore()
    operator.focus()
  }
})

broadcastLive()

app
  .whenReady()
  .then(async () => {
    if (!single) return
    setLogDataRoot(dataRoot())
    // until the settings are read (reading them could be what fails), use the PC's language
    setMainLang(app.getLocale().toLowerCase().startsWith('es') ? 'es' : 'en')
    // the portable and the installed copy have separate profiles (and so separate single-instance locks): only one
    // may run, or the second would open a projector window over the live one (test runs use their own profile)
    if (!isTestProfile && (await machineLock()) === 'taken') {
      log.warn('another copy of ICCWorship is already running: not starting')
      dialog.showErrorBox(t('recovery.otherCopy'), t('recovery.otherCopyDetail'))
      app.exit(0)
      return
    }
    log.info(`ICCWorship ${app.getVersion()} starting (Electron ${process.versions.electron}, ${process.platform} ${process.getSystemVersion()})`)
    if (location.mode === 'portable') log.info('portable: data beside the exe')
    if (location.mode === 'portable-readonly') log.warn('portable: the data beside the exe is write-protected, opened read-only')
    if (location.mode === 'portable-documents') {
      // no "ICCWorship Data" folder yet, and this PC has data in Documents (portable 1.0 kept it there): keep it
      log.info('portable: no data folder beside the exe yet, using the data in Documents')
      pendingNotices.push('portableDocuments')
    }
    if (location.mode === 'portable-fallback') {
      // the portable exe's folder can't be written (a locked USB stick, a CD): the data goes to Documents — say so
      log.warn('portable: the folder beside the exe is not writable, using Documents')
      pendingNotices.push('portableFallback')
    }
    hardenWebContents()
    registerAppProtocol()
    registerMediaProtocol()
    // which version wrote the data? upgrade it (after a safety backup), or open it read-only if it is newer
    const data = await prepareData(() => createSafetyBackup('before-migrate'))
    if (data.migrated?.length) log.info('data upgraded:', data.migrated.join('; '))
    if (data.readOnly)
      log.warn(
        `data opened read-only${
          data.newerSchema
            ? ` (written by a newer version, schema ${data.newerSchema})`
            : data.upgradeFailed
              ? ' (the upgrade failed)'
              : ' (no safety backup possible)'
        }`
      )
    seedIfEmpty()
    cleanupOrphanTracks() // backing tracks no song uses any more (only when the songs list is complete: not just seeded)
    setMainLang(getSettings().uiLang)
    buildMenu()
    startSession() // how did the last run end? (an unexpected exit mid-service is offered back to the operator)
    live.init()
    registerIpc()
    setCommandHandler((cmd) => forwardCommand(cmd))
    createOperator()
    lifecycle.started = true
    if (getSettings().outputEnabled) createOutput()
    void restartServer()
    autoBackup().catch((e) => log.error('auto backup failed', e))
    // and every hour the app stays open (only if something changed, never while something is on screen)
    setInterval(
      () => {
        if (live.state.slideIndex >= 0 || live.state.video?.playing) return
        autoBackup().catch((e) => log.error('auto backup failed', e))
      },
      60 * 60 * 1000
    )

    // a crashed GPU process can leave the projector black or frozen: tell the operator about the workaround
    app.on('child-process-gone', (_e, d) => {
      log.warn(`child process gone: ${d.type} (${d.reason}, exit ${d.exitCode})`)
      if (d.type === 'GPU' && d.reason !== 'clean-exit') notify({ type: 'gpuCrashed' })
    })
    // sleep: save, and don't mistake the pause for a frozen projector when the PC wakes up
    powerMonitor.on('suspend', () => {
      log.info('system suspending: saving')
      db().flush()
      pauseHeartbeats()
    })
    powerMonitor.on('resume', () => {
      log.info('system resumed')
      resumeHeartbeats()
    })

    // optional update check (off by default; never during a service), a minute after start and then daily. The
    // installed app downloads a newer version by itself and says so when it is ready (updates.ts); the portable
    // exe can only point to the download page.
    const runUpdateCheck = () =>
      void checkForUpdates({ manual: false }).then((r) => {
        if (r.ok && r.newer && !r.selfUpdate) notify({ type: 'update', latest: r.latest, url: r.url })
      })
    setTimeout(runUpdateCheck, 60_000)
    setInterval(runUpdateCheck, 6 * 60 * 60 * 1000)

    const displaysChanged = (what: string) => {
      log.info(what)
      send(wins.operator, 'displays:changed')
      placeOutput()
    }
    screen.on('display-added', () => displaysChanged('display added'))
    screen.on('display-removed', () => displaysChanged('display removed'))
  })
  .catch((e) => {
    // a throw in the startup code above is a rejection, not an uncaught exception
    log.error('startup failed:', e)
    if (!lifecycle.started) startupFailed(e)
    else notify({ type: 'mainError' })
  })

app.on('before-quit', () => {
  lifecycle.quitting = true
  log.info('quitting')
  db().flush()
  endSession()
  updatesBeforeQuit() // a downloaded update installs only if still wanted and nothing is on screen
  stopServer()
})

app.on('window-all-closed', () => app.quit())
