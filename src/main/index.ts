import './bootstrap' // must stay the first import: it adjusts app paths before other modules use them
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  powerMonitor,
  protocol,
  screen,
  session,
  shell,
  type Display,
  type MenuItemConstructorOptions
} from 'electron'
import { createReadStream, existsSync, statSync, writeFileSync, readFileSync, type Stats } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'
import type { LiveState, RemoteCommand, VideoEndedCommand } from '@shared/types'
import { parseRange, sanitizeSettingsPatch, validateCommand } from '@shared/security'
import { COLLECTIONS, dataStatus, db, ensurePin, getSettings, isCollection, prepareData, seedIfEmpty, setSettings } from './db'
import * as bible from './bible'
import { live } from './live'
import { serverInfo, setCommandHandler, startServer, stopServer } from './server'
import { mediaFile } from './mediaPath'
import { deletePresentation, detectConverters, importImages, importPresentation, savePdfPages } from './presentations'
import { autoBackup, createBackup, createSafetyBackup, defaultBackupName, listBackups, restoreBackup } from './backup'
import { backupDir, dataRoot, resourcesDir } from './paths'
import { decodeText } from '@shared/textDecode'
import { loggableError } from '@shared/loggableError'
import { log, logDir, setLogDataRoot } from './log'
import { newPin, within } from './pathGuard'
import { setMainLang, t } from './i18n'
import { Heartbeat, ReloadBudget } from '@shared/recovery'
import { exportDiagnostics, systemInfoText } from './diagnostics'
import { checkForUpdates, RELEASES_URL } from './updates'

// media:// serves local media files to the app's own pages. corsEnabled + "Access-Control-Allow-Origin: *" are
// needed: PDF import fetch()es media:// from a file:// page, and thumbnails load with crossOrigin="anonymous".
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
])

let operator: BrowserWindow | null = null
let output: BrowserWindow | null = null
let stageWin: BrowserWindow | null = null
let quitting = false
/** the operator window has been created: from then on an uncaught error is reported, not fatal */
let started = false

/** Events for the operator window (shown as toasts): crashes recovered, menu actions, updates… */
type AppEvent =
  | { type: 'mainError' }
  | { type: 'windowRecovered'; window: 'output' | 'stage'; safe: boolean }
  | { type: 'windowFailed'; window: 'output' | 'stage' }
  | { type: 'renderError'; window: 'output' | 'stage' }
  | { type: 'gpuCrashed' }
  | { type: 'update'; latest: string; url: string }
  | { type: 'diagnostics'; ok: boolean }
  | { type: 'menu'; action: 'shortcuts' | 'about' }
  | { type: 'openFailed'; what: 'logs' | 'notices' }
function notify(evt: AppEvent): void {
  if (operator && !operator.isDestroyed()) operator.webContents.send('app:event', evt)
}
/** told to the operator page when it (re)loads — e.g. that it was restarted after a crash */
const pendingNotices: string[] = []

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
  if (operator && !operator.isDestroyed()) notify({ type: 'mainError' })
  else if (!started && !quitting) startupFailed(e)
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
function isAbortedLoad(e: unknown): boolean {
  return e instanceof Error && (e as Error & { code?: unknown }).code === 'ERR_ABORTED'
}

// Development and test switches. A packaged app ignores them, so nobody can point an installed ICCWorship at
// other pages (ELECTRON_RENDERER_URL) or turn on the test hooks (ICCWORSHIP_E2E) with an environment variable.
const devUrl = app.isPackaged ? undefined : process.env['ELECTRON_RENDERER_URL'] || undefined
const E2E = !app.isPackaged && !!process.env.ICCWORSHIP_E2E
const rendererDir = join(__dirname, '../renderer')
const preload = join(__dirname, '../preload/index.js')
const iconPath = join(resourcesDir(), 'icon.png')
const REPO_URL = 'https://github.com/nunez1822/ICCWorship'

let loads = 0
function loadPage(win: BrowserWindow, page: 'index' | 'output' | 'stage' | 'remote', hash = ''): void {
  // A query that changes on every load makes this a real page load. Without it, loading the URL the window
  // already shows (stage.html#local, or output.html → output.html#safe) only changes the #fragment: the page
  // would not restart, although the operator is told it did.
  const load = String(++loads)
  const loading = devUrl
    ? win.loadURL(`${devUrl}/${page}.html?load=${load}${hash}`)
    : win.loadFile(join(rendererDir, `${page}.html`), { query: { load }, hash: hash.replace(/^#/, '') })
  // A newer load (crash recovery, "Restart projector" pressed twice) aborts the pending one: that is expected.
  // A real failure is logged; the crash and heartbeat guards deal with a window that stays broken.
  loading.catch((e) => {
    if (!isAbortedLoad(e)) log.warn(`${page} page did not load:`, e)
  })
}

/* ------------------------------ media:// protocol ------------------------------ */
// Only these file types are ever served; anything else (settings.json, documents, keys…) is "not found".
const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf'
}

function registerMediaProtocol(): void {
  // Range-aware file streaming so videos can seek smoothly
  protocol.handle('media', async (req) => {
    const notFound = () => new Response('Not found', { status: 404 })
    const p = mediaFile(req.url)
    const type = p ? MIME[extname(p).toLowerCase()] : undefined
    if (!p || !type) return notFound()
    let st: Stats | undefined
    try {
      st = statSync(p, { throwIfNoEntry: false })
    } catch {
      return notFound()
    }
    if (!st?.isFile()) return notFound()
    const size = st.size
    const base = { 'Access-Control-Allow-Origin': '*', 'Content-Type': type, 'Accept-Ranges': 'bytes' }
    const range = parseRange(req.headers.get('range'), size)
    if (range.kind === 'unsatisfiable') return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } })
    if (range.kind === 'partial') {
      const { start, end } = range
      const stream = Readable.toWeb(createReadStream(p, { start, end })) as ReadableStream
      return new Response(stream, {
        status: 206,
        headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }
      })
    }
    const stream = Readable.toWeb(createReadStream(p)) as ReadableStream
    return new Response(stream, { status: 200, headers: { ...base, 'Content-Length': String(size) } })
  })
}

/* ------------------------------ web contents hardening ------------------------------ */
const ALLOWED_PERMISSIONS = new Set(['fullscreen', 'clipboard-sanitized-write'])

function hardenWebContents(): void {
  app.on('web-contents-created', (_e, wc) => {
    // The app's pages never navigate. Without this, a file dropped outside a drop zone would replace the
    // operator or projector page with that file.
    // Reloading the same page stays allowed (the "Reload window" button, location.reload()).
    wc.on('will-navigate', (ev, url) => {
      const page = (u: string) => u.split('#')[0]
      if (page(url) !== page(wc.getURL())) ev.preventDefault()
    })
    wc.on('will-attach-webview', (ev) => ev.preventDefault())
    // Links open in the user's browser, and only web links.
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
  session.defaultSession.setPermissionRequestHandler((_wc, permission, done) => done(ALLOWED_PERMISSIONS.has(permission)))
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ALLOWED_PERMISSIONS.has(permission))
}

/** Only our own three pages (operator, projector, stage) may call into main. */
const TRUSTED_PAGES = new Set(['index.html', 'output.html', 'stage.html'])
function isTrustedSender(frame: Electron.WebFrameMain | null | undefined): boolean {
  if (!frame) return false
  let u: URL
  try {
    u = new URL(frame.url)
  } catch {
    return false
  }
  if (!TRUSTED_PAGES.has(u.pathname.split('/').pop() || '')) return false
  if (devUrl) return u.origin === new URL(devUrl).origin
  if (u.protocol !== 'file:') return false
  return dirname(fileURLToPath(u)).toLowerCase() === resolve(rendererDir).toLowerCase()
}

/* ------------------------------ menu ------------------------------ */
function buildMenu(): void {
  const view: MenuItemConstructorOptions[] = [
    { role: 'reload', label: t('menu.reload') },
    { type: 'separator' },
    { role: 'zoomIn', label: t('menu.zoomIn') },
    { role: 'zoomOut', label: t('menu.zoomOut') },
    { role: 'resetZoom', label: t('menu.zoomReset') },
    { type: 'separator' },
    { role: 'togglefullscreen', label: t('menu.fullscreen') }
  ]
  if (!app.isPackaged) view.push({ type: 'separator' }, { role: 'toggleDevTools', label: t('menu.devtools') })
  const template: MenuItemConstructorOptions[] = [
    { label: t('menu.file'), submenu: [{ role: 'quit', label: t('menu.quit') }] },
    { label: t('menu.view'), submenu: view },
    {
      label: t('menu.help'),
      submenu: [
        { label: t('menu.shortcuts'), click: () => notify({ type: 'menu', action: 'shortcuts' }) },
        { type: 'separator' },
        { label: t('menu.openLogs'), click: () => void openLogs().then((ok) => ok || notify({ type: 'openFailed', what: 'logs' })) },
        {
          label: t('menu.exportDiagnostics'),
          click: () => void exportDiagnosticsInteractive(false).then((r) => r && notify({ type: 'diagnostics', ok: r.ok }))
        },
        { label: t('menu.reportProblem'), click: () => void shell.openExternal(newIssueUrl()) },
        { type: 'separator' },
        { label: t('menu.website'), click: () => void shell.openExternal(REPO_URL) },
        { label: t('menu.notices'), click: () => void openNotices().then((ok) => ok || notify({ type: 'openFailed', what: 'notices' })) },
        { label: t('menu.about'), click: () => notify({ type: 'menu', action: 'about' }) }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/* ------------------------------ help ------------------------------ */
/** the bug-report form with the version already filled in */
const newIssueUrl = () => `${REPO_URL}/issues/new?template=bug_report.yml&version=${encodeURIComponent(app.getVersion())}`

function noticesPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'THIRD_PARTY_NOTICES.md') : join(app.getAppPath(), 'out', 'THIRD_PARTY_NOTICES.md')
}
/** false when the file isn't there (e.g. `pnpm dev` before `node scripts/licenses.mjs`): the caller says so */
async function openNotices(): Promise<boolean> {
  const p = noticesPath()
  if (!existsSync(p)) {
    log.warn('open-source notices file missing')
    return false
  }
  // .md may have no program associated with it on a church PC: then show the file in Explorer instead
  if (await shell.openPath(p)) shell.showItemInFolder(p)
  return true
}

/** shell.openPath answers with an error text ('' when it worked); false tells the caller to say so */
async function openFolder(dir: string, what: string): Promise<boolean> {
  const error = await shell.openPath(dir)
  if (error) log.warn(`could not open the ${what} folder`)
  return !error
}
const openLogs = () => openFolder(logDir(), 'logs')

async function exportDiagnosticsInteractive(includeCrashDumps: boolean): Promise<{ ok: boolean; path: string } | null> {
  const stamp = new Date().toISOString().slice(0, 10)
  const r = await saveDialog({ defaultPath: `ICCWorship-diagnostics-${stamp}.zip`, filters: [{ name: 'Zip', extensions: ['zip'] }] })
  if (r.canceled || !r.filePath) return null
  try {
    await exportDiagnostics(r.filePath, { includeCrashDumps })
    log.info('diagnostics exported', includeCrashDumps ? '(with crash dumps)' : '')
    if (!E2E) shell.showItemInFolder(r.filePath)
    return { ok: true, path: r.filePath }
  } catch (e) {
    log.error('diagnostics export failed', e)
    return { ok: false, path: r.filePath }
  }
}

/* ------------------------------ crash & freeze recovery ------------------------------ */
// The projector and stage windows reload themselves when their page crashes or freezes, resuming what is live
// (main holds the live state). If one keeps crashing, the projector falls back to plain black ("safe" mode) and
// finally stops retrying; the operator is told every time.
type Guarded = 'output' | 'stage'
const winOf = (kind: Guarded) => (kind === 'output' ? output : stageWin)
const guards: Record<Guarded, { budget: ReloadBudget; beat: Heartbeat; unresponsive?: ReturnType<typeof setTimeout>; failed?: boolean }> = {
  output: { budget: new ReloadBudget(), beat: new Heartbeat(() => killFrozen('output')) },
  stage: { budget: new ReloadBudget(), beat: new Heartbeat(() => killFrozen('stage')) }
}

function killFrozen(kind: Guarded): void {
  const win = winOf(kind)
  clearUnresponsive(kind)
  if (quitting || !win || win.isDestroyed()) return
  log.warn(`${kind} window stopped responding: restarting it`)
  win.webContents.forcefullyCrashRenderer() // → render-process-gone → recover()
}

function recover(kind: Guarded, reason: string): void {
  const win = winOf(kind)
  if (quitting || !win || win.isDestroyed()) return
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

function guardWindow(win: BrowserWindow, kind: Guarded): void {
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
function kindOf(sender: Electron.WebContents): Guarded | null {
  if (output && !output.isDestroyed() && sender === output.webContents) return 'output'
  if (stageWin && !stageWin.isDestroyed() && sender === stageWin.webContents) return 'stage'
  return null
}

// The operator window reloads once after a crash; a second crash within a minute asks the user. Once the
// window has run fine for a minute, it goes back to reloading by itself.
const operatorBudget = new ReloadBudget(1, 60_000)
let operatorStable: ReturnType<typeof setTimeout> | undefined
function guardOperator(win: BrowserWindow): void {
  win.webContents.on('did-finish-load', () => {
    clearTimeout(operatorStable)
    operatorStable = setTimeout(() => operatorBudget.reset(), 60_000)
  })
  win.on('closed', () => clearTimeout(operatorStable))
  win.webContents.on('render-process-gone', async (_e, d) => {
    clearTimeout(operatorStable)
    if (d.reason === 'clean-exit' || quitting || win.isDestroyed()) return
    log.error(`operator window crashed (${d.reason})`)
    db().flush()
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
  win.on('unresponsive', () => log.warn('operator window unresponsive'))
  // Windows shutdown / log off skips before-quit: save now
  win.on('session-end', () => {
    log.info('Windows session ending: saving')
    db().flush()
  })
}

/* ------------------------------ windows ------------------------------ */
function createOperator(): void {
  operator = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#0e1420',
    title: 'ICCWorship',
    icon: existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: { preload, sandbox: true, contextIsolation: true }
  })
  operator.once('ready-to-show', () => {
    operator?.maximize()
    operator?.show()
  })
  operator.on('closed', () => {
    operator = null
    output?.destroy()
    stageWin?.destroy()
    app.quit()
  })
  guardOperator(operator)
  loadPage(operator, 'index')
}

function pickOutputDisplay(s: ReturnType<typeof getSettings>): Display | null {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  if (s.outputDisplayId !== undefined) {
    const d = displays.find((x) => x.id === s.outputDisplayId)
    if (d) return d
  }
  return displays.find((d) => d.id !== primary.id) || null
}

function placeOutput(): void {
  if (!output) return
  const d = pickOutputDisplay(getSettings())
  const primary = screen.getPrimaryDisplay()
  // ICCWORSHIP_WINDOWED=1 keeps the projector in a small window (development / automated tests)
  if (process.env.ICCWORSHIP_WINDOWED) {
    output.setFullScreen(false)
    output.setBounds({ x: primary.workArea.x + 40, y: primary.workArea.y + 40, width: 960, height: 540 })
    return
  }
  if (d && d.id !== primary.id) {
    output.setFullScreen(false)
    output.setBounds(d.bounds)
    output.setFullScreen(true)
    output.setAlwaysOnTop(true, 'screen-saver')
  } else if (d && d.id === primary.id) {
    // user explicitly chose the main screen: full screen there (Esc / toggle to exit)
    output.setBounds(d.bounds)
    output.setFullScreen(true)
  } else {
    // only one screen: show a movable preview window
    output.setFullScreen(false)
    output.setAlwaysOnTop(false)
    const wa = primary.workArea
    output.setBounds({ x: wa.x + wa.width - 660, y: wa.y + wa.height - 400, width: 640, height: 360 })
  }
}

function createOutput(): void {
  if (output) return
  output = new BrowserWindow({
    width: 640,
    height: 360,
    show: false,
    frame: false,
    backgroundColor: '#000000',
    title: 'ICCWorship — Output',
    skipTaskbar: false,
    webPreferences: { preload, sandbox: true, contextIsolation: true, backgroundThrottling: false }
  })
  output.setMenuBarVisibility(false)
  output.on('closed', () => {
    output = null
    operator?.webContents.send('output:status', { open: false })
  })
  output.once('ready-to-show', () => {
    placeOutput()
    output?.showInactive()
    operator?.focus()
    operator?.webContents.send('output:status', { open: true })
  })
  guardWindow(output, 'output')
  loadPage(output, 'output')
}

function createStageWindow(): void {
  if (stageWin) {
    // after it gave up (or crashed for good) "open it again" must really start it again, not just focus it
    if (guards.stage.failed || stageWin.webContents.isCrashed()) {
      log.info('stage window started again after it failed')
      guards.stage.budget.reset()
      guards.stage.failed = false
      loadPage(stageWin, 'stage', '#local')
    }
    stageWin.focus()
    return
  }
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const outId = pickOutputDisplay(getSettings())?.id
  const third = displays.find((d) => d.id !== primary.id && d.id !== outId)
  stageWin = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    title: 'ICCWorship — Stage',
    autoHideMenuBar: true,
    webPreferences: { preload, sandbox: true, contextIsolation: true, backgroundThrottling: false }
  })
  if (third) {
    stageWin.setBounds(third.bounds)
    stageWin.setFullScreen(true)
  }
  stageWin.on('closed', () => (stageWin = null))
  guardWindow(stageWin, 'stage')
  loadPage(stageWin, 'stage', '#local')
}

/* ------------------------------ live broadcasting ------------------------------ */
live.on('change', (state: LiveState) => {
  output?.webContents.send('live:state', state)
  stageWin?.webContents.send('live:state', state)
  operator?.webContents.send('live:state', state)
})
live.on('progress', (p) => {
  operator?.webContents.send('live:progress', p)
  stageWin?.webContents.send('live:progress', p)
})

function forwardCommand(cmd: RemoteCommand | VideoEndedCommand): void {
  operator?.webContents.send('remote:command', cmd)
}

/* ------------------------------ dialogs ------------------------------ */
// Paths the user picked in a file dialog during this session. IPC calls that read a file the renderer names
// (file:readText, backup:restore) only accept these, so the renderer can't ask for arbitrary files.
const granted = new Set<string>()
const grant = (p: string) => granted.add(resolve(p).toLowerCase())
const isGranted = (p: unknown): p is string => typeof p === 'string' && granted.has(resolve(p).toLowerCase())

// E2E test hook — only when started by `pnpm e2e:launch` (ICCWORSHIP_E2E=1, never in a packaged app):
// native file dialogs cannot be driven by Playwright, so a tester can queue the path the next dialog should "pick".
const openQueue: string[][] = []
const saveQueue: string[] = []
const messageBoxQueue: number[] = []

/** async message box (never the sync one: it would block main, and with it the projector) */
function messageBox(opts: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  if (E2E && messageBoxQueue.length) return Promise.resolve({ response: messageBoxQueue.shift()!, checkboxChecked: false })
  return operator && !operator.isDestroyed() ? dialog.showMessageBox(operator, opts) : dialog.showMessageBox(opts)
}

async function openDialog(opts: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
  const r = E2E && openQueue.length ? { canceled: false, filePaths: openQueue.shift()! } : await dialog.showOpenDialog(operator!, opts)
  if (!r.canceled) r.filePaths.forEach(grant)
  return r
}

async function saveDialog(opts: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> {
  const r = E2E && saveQueue.length ? { canceled: false, filePath: saveQueue.shift()! } : await dialog.showSaveDialog(operator!, opts)
  if (!r.canceled && r.filePath) grant(r.filePath)
  return r
}

/* ------------------------------ IPC ------------------------------ */
function registerIpc(): void {
  // Every channel checks that the call comes from one of our own pages.
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- each handler declares its own argument types
  const h = (channel: string, fn: (e: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown) =>
    ipcMain.handle(channel, (e, ...args) => {
      if (!isTrustedSender(e.senderFrame)) {
        log.warn('ipc call from an untrusted page rejected:', channel)
        throw new Error('forbidden')
      }
      return fn(e, ...args)
    })
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- each listener declares its own argument types
  const on = (channel: string, fn: (e: Electron.IpcMainEvent, ...args: any[]) => void) =>
    ipcMain.on(channel, (e, ...args) => {
      if (isTrustedSender(e.senderFrame)) fn(e, ...args)
    })

  // database
  // hand the startup problems over once (the operator may initialise more than once)
  // read every collection first: one the operator doesn't load at startup (the CCLI usage
  // log) would otherwise be found damaged later, after this report — and never shown
  h('db:problems', () => {
    for (const c of COLLECTIONS) db().list(c)
    return db().problems.splice(0)
  })
  {
    // a failed save (read-only file, disk full…) must reach the operator, not crash main
    const lastWarn = new Map<string, number>()
    db().onWriteError = (name, error) => {
      log.error('could not save', name, error)
      const now = Date.now()
      if (now - (lastWarn.get(name) || 0) < 10_000) return
      lastWarn.set(name, now)
      operator?.webContents.send('db:writeError', { name, message: (error as NodeJS.ErrnoException).code || error.message })
    }
  }
  h('db:list', (_e, c: string) => (isCollection(c) ? db().list(c) : []))
  h('db:get', (_e, c: string, id: string) => (isCollection(c) ? db().get(c, id) : undefined))
  h('db:upsert', (_e, c: string, item: { id: string }) => (isCollection(c) ? db().upsert(c, item) : item))
  h('db:upsertMany', (_e, c: string, items: { id: string }[]) => {
    if (isCollection(c)) db().upsertMany(c, items)
  })
  h('db:remove', (_e, c: string, id: string) => {
    if (c === 'presentations') deletePresentation(id)
    else if (isCollection(c)) db().remove(c, id)
  })

  // settings — only known settings with valid values are saved (see sanitizeSettingsPatch)
  h('settings:get', () => getSettings())
  h('settings:set', async (_e, raw: unknown) => {
    const patch = sanitizeSettingsPatch(raw)
    const before = getSettings()
    const s = setSettings(patch)
    if (patch.uiLang) {
      setMainLang(s.uiLang)
      buildMenu()
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('settings:changed', s))
    }
    if (patch.outputDisplayId !== undefined && output) placeOutput()
    if (before.serverPort !== s.serverPort || before.serverEnabled !== s.serverEnabled) await restartServer()
    if (patch.logoPath !== undefined || patch.churchName !== undefined) live.update({ logoPath: s.logoPath, churchName: s.churchName })
    return s
  })

  // bible
  h('bible:versions', () => bible.versions())
  h('bible:passage', (_e, id: string, ref: string) => bible.passage(id, ref))
  h('bible:search', (_e, id: string, q: string) => bible.search(id, q))
  h('bible:structure', () => bible.structure())
  h('bible:createPasted', (_e, meta) => bible.createPasted(meta))
  h('bible:parsePaste', (_e, ref: string, text: string) => bible.parsePaste(ref, text))
  h('bible:savePasted', (_e, id: string, verses) => bible.savePastedVerses(id, verses))
  h('bible:listPasted', (_e, id: string) => bible.listPastedVerses(id))
  h('bible:deletePastedVerse', (_e, id: string, b: number, c: number, v: number) => bible.deletePastedVerse(id, b, c, v))
  h('bible:deleteVersion', (_e, id: string) => bible.deleteVersion(id))
  h('bible:importFile', async (_e, meta) => {
    const r = await openDialog({ properties: ['openFile'], filters: [{ name: 'Bible (OSIS, USFX, JSON)', extensions: ['xml', 'osis', 'usfx', 'json'] }] })
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
    try {
      return { ok: true, info: bible.importFile(r.filePaths[0], meta) }
    } catch (e) {
      // never the raw message in the log: a parser's SyntaxError quotes the file's text (maybe a licensed Bible)
      log.warn('bible import failed:', loggableError(e))
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  // live
  h('live:get', () => live.state)
  h('live:update', (_e, patch: Partial<LiveState>) => live.update(patch))
  on('output:progress', (_e, p: { current?: unknown; duration?: unknown; error?: unknown; src?: unknown }) => {
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
    live.progress({
      current: num(p?.current),
      duration: num(p?.duration),
      error: p?.error === true ? true : undefined,
      src: typeof p?.src === 'string' && p.src.length < 4000 ? p.src : undefined
    })
  })
  on('output:ended', (_e, info: { itemId?: unknown; src?: unknown }) => {
    if (typeof info?.src !== 'string') return
    forwardCommand({ type: 'videoEnded', src: info.src, itemId: typeof info.itemId === 'string' ? info.itemId : undefined })
  })
  on('stage:command', (_e, raw: unknown) => {
    const cmd = validateCommand(raw)
    if (cmd) forwardCommand(cmd)
  })

  // crash & freeze recovery (see guardWindow)
  on('win:alive', (e) => {
    const kind = kindOf(e.sender)
    if (kind) guards[kind].beat.beat()
  })
  on('win:fatal', (e, message: unknown) => {
    const kind = kindOf(e.sender)
    if (!kind) return
    log.error(`${kind} page failed:`, String(message).slice(0, 200))
    recover(kind, 'render error')
  })
  {
    const last: Record<Guarded, { m: string; at: number }> = { output: { m: '', at: 0 }, stage: { m: '', at: 0 } }
    on('win:renderError', (e, message: unknown) => {
      const kind = kindOf(e.sender)
      if (!kind) return
      // a slide that can't be drawn throws again on every update: report it once, not every second
      const m = String(message).slice(0, 200)
      if (m === last[kind].m && Date.now() - last[kind].at < 30_000) return
      last[kind] = { m, at: Date.now() }
      log.error(`${kind} could not draw a slide:`, m)
      notify({ type: 'renderError', window: kind })
    })
  }
  h('output:restart', () => {
    guards.output.budget.reset()
    guards.output.failed = false
    if (output && !output.isDestroyed()) loadPage(output, 'output')
    else createOutput()
  })
  h('app:notices', () => pendingNotices.splice(0))
  on('app:log', (e, level: unknown, message: unknown) => {
    const page = (() => {
      try {
        return new URL(e.senderFrame?.url || '').pathname.split('/').pop()
      } catch {
        return '?'
      }
    })()
    const msg = `[${page}] ${String(message).slice(0, 300)}`
    if (level === 'error') log.error(msg)
    else if (level === 'warn') log.warn(msg)
    else log.info(msg)
  })

  // displays / windows
  h('displays:list', () => {
    const primary = screen.getPrimaryDisplay()
    return screen
      .getAllDisplays()
      .map((d, i) => ({ id: d.id, label: d.label || `Display ${i + 1}`, width: d.size.width, height: d.size.height, primary: d.id === primary.id }))
  })
  h('output:open', () => createOutput())
  h('output:close', () => output?.close())
  h('output:status', () => ({ open: !!output }))
  h('output:replace', () => placeOutput())
  h('stage:open', () => createStageWindow())

  // dialogs & files
  h('dialog:openFiles', async (_e, opts: { filters?: Electron.FileFilter[]; multi?: boolean; directory?: boolean }) => {
    const r = await openDialog({
      properties: opts?.directory ? ['openDirectory'] : opts?.multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: opts?.filters
    })
    return r.canceled ? [] : r.filePaths
  })
  h('file:exists', (_e, paths: string[]) => (Array.isArray(paths) ? paths.map((p) => typeof p === 'string' && existsSync(p)) : []))
  // media:// URLs → is the file there? (resolved like the projector does: data-relative and moved slides too)
  h('file:mediaStatus', (_e, urls: unknown) =>
    (Array.isArray(urls) ? urls : []).map((u) => {
      const path = typeof u === 'string' ? mediaFile(u) : null
      return { path, exists: !!path && existsSync(path) }
    })
  )
  h('file:readText', (_e, p: unknown) => {
    // only a file the user picked in a dialog (song import)
    if (!isGranted(p)) throw new Error('forbidden')
    return decodeText(readFileSync(p))
  })
  h('file:saveText', async (_e, name: string, content: string, filters?: Electron.FileFilter[]) => {
    const r = await saveDialog({ defaultPath: name, filters })
    if (r.canceled || !r.filePath) return null
    writeFileSync(r.filePath, '﻿' + content, 'utf8')
    return r.filePath
  })

  // presentations
  h('pres:detect', () => detectConverters())
  h('pres:import', (_e, path: string, prefer?: 'powerpoint' | 'libreoffice' | 'text', reuseId?: string) => importPresentation(path, prefer, reuseId))
  h('pres:savePdfPages', (_e, args) => savePdfPages(args))
  h('pres:importImages', (_e, paths: string[], name: string) => importImages(paths, name))

  // server
  h('server:info', () => serverInfo())
  h('server:restart', () => restartServer())
  h('server:newPin', async () => {
    // a new PIN restarts the server, which disconnects every phone and stage screen using the old one
    setSettings({ remotePin: newPin() })
    await restartServer()
    log.info('remote PIN changed')
    return getSettings()
  })

  // backup
  h('backup:create', async () => {
    const r = await saveDialog({ defaultPath: defaultBackupName(), filters: [{ name: 'ICCWorship backup', extensions: ['zip'] }] })
    if (r.canceled || !r.filePath) return null
    return createBackup(r.filePath)
  })
  h('backup:restore', async (_e, path?: unknown) => {
    let p: string
    if (path === undefined || path === null) {
      const r = await openDialog({ properties: ['openFile'], filters: [{ name: 'ICCWorship backup', extensions: ['zip'] }] })
      if (r.canceled || !r.filePaths[0]) return null
      p = r.filePaths[0]
    } else if (isGranted(path) || (typeof path === 'string' && within(backupDir(), path))) {
      // a file picked in a dialog this session, or one of the backups in Documents\ICCWorship\backups
      p = path as string
    } else return { ok: false, error: 'forbidden' }
    const before = getSettings()
    const res = await restoreBackup(p)
    log.info('backup restore', res.ok ? 'ok' : `failed: ${res.error}`)
    if (res.ok) {
      // The restored data is in place: refresh what main holds, tell every window, reload only the operator (the
      // projector and stage keep showing what is live — reloading them mid-service gains nothing). The restore
      // keeps this PC's PIN, port and server switch, so phones and stage screens stay connected; the server is
      // restarted only if one of them did change (e.g. there was no PIN and a new one had to be made).
      if (ensurePin()) log.info('restored settings had no remote PIN: made a new one')
      seedIfEmpty() // restored meta is always marked seeded: this only keeps the built-in themes up to date
      const s = getSettings()
      setMainLang(s.uiLang)
      buildMenu()
      live.update({ logoPath: s.logoPath, churchName: s.churchName })
      BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('settings:changed', s))
      if (before.remotePin !== s.remotePin || before.serverPort !== s.serverPort || before.serverEnabled !== s.serverEnabled) await restartServer()
      // reply first, then reload: reloading before the answer arrives destroys the page that is waiting for it
      setTimeout(() => operator?.webContents.reload(), 150)
    }
    return res
  })
  h('backup:list', () => listBackups())

  // printing: the HTML comes from the operator page; render it with JavaScript off, in a throw-away session
  const printPrefs = { sandbox: true, javascript: false, partition: 'iccworship-print' }
  h('print:pdf', async (_e, html: string, name: string) => {
    const win = new BrowserWindow({ show: false, webPreferences: printPrefs })
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'Letter' })
    win.destroy()
    const r = await saveDialog({ defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (r.canceled || !r.filePath) return null
    writeFileSync(r.filePath, pdf)
    if (!E2E) void shell.openPath(r.filePath)
    return r.filePath
  })
  h('print:print', async (_e, html: string) => {
    const win = new BrowserWindow({ show: false, webPreferences: printPrefs })
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    win.webContents.print({ printBackground: true }, () => win.destroy())
  })

  // e2e
  if (E2E) {
    h('e2e:queueOpen', (_e, paths: string[]) => void openQueue.push(paths))
    h('e2e:queueSave', (_e, path: string) => void saveQueue.push(path))
    h('e2e:queueMessageBox', (_e, response: number) => void messageBoxQueue.push(response))
  }

  // help & diagnostics
  h('app:openLogs', () => openLogs())
  h('app:exportDiagnostics', (_e, includeCrashDumps: unknown) => exportDiagnosticsInteractive(includeCrashDumps === true))
  h('app:copySystemInfo', async () => {
    // Electron 45's clipboard.writeText is async: wait for it, so a failure reaches the operator as a toast
    await clipboard.writeText(systemInfoText())
    return true
  })
  h('app:openNotices', () => openNotices())
  h('app:reportProblem', () => void shell.openExternal(newIssueUrl()))
  h('app:checkUpdates', () => checkForUpdates({ manual: true }))
  h('app:openRelease', (_e, url: unknown) => {
    if (typeof url === 'string' && url.startsWith(RELEASES_URL)) void shell.openExternal(url)
  })

  // app
  h('app:info', () => ({ version: app.getVersion(), dataPath: dataRoot(), electron: process.versions.electron }))
  h('app:openDataFolder', () => openFolder(dataRoot(), 'data'))
  h('app:openBackups', () => openFolder(backupDir(), 'backups'))
  h('app:dataStatus', () => dataStatus())
  h('app:openExternal', (_e, url: unknown) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) void shell.openExternal(url)
  })
}

async function restartServer(): Promise<{ ok: boolean; error?: string }> {
  // startServer stops the old server itself, in turn with any other restart
  const r = await startServer({ rendererDir, devUrl })
  if (r.error !== 'superseded') log.info('LAN server', r.ok ? `listening on port ${getSettings().serverPort}` : `not running: ${r.error}`)
  operator?.webContents.send('server:status', r)
  return r
}

/* ------------------------------ app lifecycle ------------------------------ */
app.setAppUserModelId('org.iccworship.app')

const single = app.requestSingleInstanceLock()
// Second launch (double-clicked icon while running): hand over to the first instance
// and exit immediately. app.quit() before 'ready' left helper processes running.
if (!single) app.exit(0)
app.on('second-instance', () => {
  if (operator) {
    if (operator.isMinimized()) operator.restore()
    operator.focus()
  }
})

app
  .whenReady()
  .then(async () => {
    if (!single) return
    setLogDataRoot(dataRoot())
    // until the settings are read (reading them could be what fails), use the PC's language
    setMainLang(app.getLocale().toLowerCase().startsWith('es') ? 'es' : 'en')
    log.info(`ICCWorship ${app.getVersion()} starting (Electron ${process.versions.electron}, ${process.platform} ${process.getSystemVersion()})`)
    hardenWebContents()
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
    setMainLang(getSettings().uiLang)
    buildMenu()
    live.init()
    registerIpc()
    setCommandHandler((cmd) => forwardCommand(cmd))
    createOperator()
    started = true
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
      guards.output.beat.pause()
      guards.stage.beat.pause()
    })
    powerMonitor.on('resume', () => {
      log.info('system resumed')
      guards.output.beat.resume()
      guards.stage.beat.resume()
    })

    // optional update check (off by default; never during a service), a minute after start and then daily
    const runUpdateCheck = () =>
      void checkForUpdates({ manual: false }).then((r) => {
        if (r.ok && r.newer) notify({ type: 'update', latest: r.latest, url: r.url })
      })
    setTimeout(runUpdateCheck, 60_000)
    setInterval(runUpdateCheck, 6 * 60 * 60 * 1000)

    screen.on('display-added', () => {
      log.info('display added')
      operator?.webContents.send('displays:changed')
      placeOutput()
    })
    screen.on('display-removed', () => {
      log.info('display removed')
      operator?.webContents.send('displays:changed')
      placeOutput()
    })
  })
  .catch((e) => {
    // a throw in the startup code above is a rejection, not an uncaught exception
    log.error('startup failed:', e)
    if (!started) startupFailed(e)
    else notify({ type: 'mainError' })
  })

app.on('before-quit', () => {
  quitting = true
  log.info('quitting')
  db().flush()
  stopServer()
})

app.on('window-all-closed', () => app.quit())
