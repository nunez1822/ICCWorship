import { app, BrowserWindow, dialog, ipcMain, protocol, screen, shell, type Display } from 'electron'
import { createReadStream, existsSync, statSync, writeFileSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { Readable } from 'node:stream'
import type { LiveState, RemoteCommand, Settings } from '@shared/types'
import { db, getSettings, isCollection, seedIfEmpty, setSettings } from './db'
import * as bible from './bible'
import { live } from './live'
import { mediaUrlToPath, serverInfo, setCommandHandler, startServer, stopServer } from './server'
import { deletePresentation, detectConverters, importImages, importPresentation, savePdfPages } from './presentations'
import { autoBackup, createBackup, defaultBackupName, listBackups, restoreBackup } from './backup'
import { dataRoot, resourcesDir } from './paths'
import { decodeText } from '@shared/textDecode'

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }
])

let operator: BrowserWindow | null = null
let output: BrowserWindow | null = null
let stageWin: BrowserWindow | null = null

const devUrl = process.env['ELECTRON_RENDERER_URL']
const rendererDir = join(__dirname, '../renderer')
const preload = join(__dirname, '../preload/index.js')
const iconPath = join(resourcesDir(), 'icon.png')

function loadPage(win: BrowserWindow, page: 'index' | 'output' | 'stage' | 'remote', hash = ''): void {
  if (devUrl) void win.loadURL(`${devUrl}/${page}.html${hash}`)
  else void win.loadFile(join(rendererDir, `${page}.html`), { hash: hash.replace(/^#/, '') })
}

/* ------------------------------ media:// protocol ------------------------------ */
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
    const p = mediaUrlToPath(req.url)
    if (!p || !existsSync(p)) return new Response('Not found', { status: 404 })
    const size = statSync(p).size
    const type = MIME[extname(p).toLowerCase()] || 'application/octet-stream'
    const range = req.headers.get('range')
    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range)
      const start = m && m[1] ? parseInt(m[1], 10) : 0
      const end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1
      const stream = Readable.toWeb(createReadStream(p, { start, end })) as ReadableStream
      return new Response(stream, {
        status: 206,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': String(end - start + 1) }
      })
    }
    const stream = Readable.toWeb(createReadStream(p)) as ReadableStream
    return new Response(stream, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } })
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
    webPreferences: { preload, sandbox: false, contextIsolation: true }
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
  operator.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
  loadPage(operator, 'index')
}

function pickOutputDisplay(s: Settings): Display | null {
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
    webPreferences: { preload, sandbox: false, contextIsolation: true, backgroundThrottling: false }
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
  loadPage(output, 'output')
}

function createStageWindow(): void {
  if (stageWin) {
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
    webPreferences: { preload, sandbox: false, contextIsolation: true, backgroundThrottling: false }
  })
  if (third) {
    stageWin.setBounds(third.bounds)
    stageWin.setFullScreen(true)
  }
  stageWin.on('closed', () => (stageWin = null))
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

function forwardCommand(cmd: RemoteCommand | { type: 'videoEnded' }): void {
  operator?.webContents.send('remote:command', cmd)
}

/* ------------------------------ E2E test hook ------------------------------ */
// Only when started by `npm run e2e:launch` (ICCWORSHIP_E2E=1): native file dialogs cannot be
// driven by Playwright, so a tester can queue the path the next dialog should "pick".
const E2E = !!process.env.ICCWORSHIP_E2E
const openQueue: string[][] = []
const saveQueue: string[] = []

function openDialog(opts: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
  if (E2E && openQueue.length) return Promise.resolve({ canceled: false, filePaths: openQueue.shift()! })
  return dialog.showOpenDialog(operator!, opts)
}

function saveDialog(opts: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> {
  if (E2E && saveQueue.length) return Promise.resolve({ canceled: false, filePath: saveQueue.shift()! })
  return dialog.showSaveDialog(operator!, opts)
}

/* ------------------------------ IPC ------------------------------ */
function registerIpc(): void {
  const h = ipcMain.handle.bind(ipcMain)

  // database
  // hand the startup problems over once (the operator may initialise more than once)
  h('db:problems', () => db().problems.splice(0))
  {
    // a failed save (read-only file, disk full…) must reach the operator, not crash main
    const lastWarn = new Map<string, number>()
    db().onWriteError = (name, error) => {
      console.error('could not save', name, error)
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

  // settings
  h('settings:get', () => getSettings())
  h('settings:set', async (_e, patch: Partial<Settings>) => {
    const before = getSettings()
    const s = setSettings(patch)
    if (patch.uiLang) BrowserWindow.getAllWindows().forEach((w) => w.webContents.send('settings:changed', s))
    if (patch.outputDisplayId !== undefined && output) placeOutput()
    if (patch.serverPort !== undefined || patch.serverEnabled !== undefined || patch.remotePin !== undefined) {
      if (before.serverPort !== s.serverPort || before.serverEnabled !== s.serverEnabled || before.remotePin !== s.remotePin) await restartServer()
    }
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
    const r = await openDialog( { properties: ['openFile'], filters: [{ name: 'Bible (OSIS, USFX, JSON)', extensions: ['xml', 'osis', 'usfx', 'json'] }] })
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
    try {
      return { ok: true, info: bible.importFile(r.filePaths[0], meta) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  })

  // live
  h('live:get', () => live.state)
  h('live:update', (_e, patch: Partial<LiveState>) => live.update(patch))
  ipcMain.on('output:progress', (_e, p) => live.progress(p))
  ipcMain.on('output:ended', () => forwardCommand({ type: 'videoEnded' }))
  ipcMain.on('stage:command', (_e, cmd: RemoteCommand) => forwardCommand(cmd))

  // displays / windows
  h('displays:list', () => {
    const primary = screen.getPrimaryDisplay()
    return screen.getAllDisplays().map((d, i) => ({ id: d.id, label: d.label || `Display ${i + 1}`, width: d.size.width, height: d.size.height, primary: d.id === primary.id }))
  })
  h('output:open', () => createOutput())
  h('output:close', () => output?.close())
  h('output:status', () => ({ open: !!output }))
  h('output:replace', () => placeOutput())
  h('stage:open', () => createStageWindow())

  // dialogs & files
  h('dialog:openFiles', async (_e, opts: { filters?: Electron.FileFilter[]; multi?: boolean; directory?: boolean }) => {
    const r = await openDialog( {
      properties: opts.directory ? ['openDirectory'] : opts.multi ? ['openFile', 'multiSelections'] : ['openFile'],
      filters: opts.filters
    })
    return r.canceled ? [] : r.filePaths
  })
  h('file:exists', (_e, paths: string[]) => paths.map((p) => existsSync(p)))
  h('file:readText', (_e, p: string) => decodeText(readFileSync(p)))
  h('file:saveText', async (_e, name: string, content: string, filters?: Electron.FileFilter[]) => {
    const r = await saveDialog( { defaultPath: name, filters })
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

  // backup
  h('backup:create', async () => {
    const r = await saveDialog( { defaultPath: defaultBackupName(), filters: [{ name: 'ICCWorship backup', extensions: ['zip'] }] })
    if (r.canceled || !r.filePath) return null
    return createBackup(r.filePath)
  })
  h('backup:restore', async (_e, path?: string) => {
    let p = path
    if (!p) {
      const r = await openDialog( { properties: ['openFile'], filters: [{ name: 'ICCWorship backup', extensions: ['zip'] }] })
      if (r.canceled || !r.filePaths[0]) return null
      p = r.filePaths[0]
    }
    const res = await restoreBackup(p)
    if (res.ok) operator?.webContents.reload()
    return res
  })
  h('backup:list', () => listBackups())

  // printing
  h('print:pdf', async (_e, html: string, name: string) => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'Letter' })
    win.destroy()
    const r = await saveDialog( { defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
    if (r.canceled || !r.filePath) return null
    writeFileSync(r.filePath, pdf)
    if (!E2E) void shell.openPath(r.filePath)
    return r.filePath
  })
  h('print:print', async (_e, html: string) => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    win.webContents.print({ printBackground: true }, () => win.destroy())
  })

  // e2e
  if (E2E) {
    h('e2e:queueOpen', (_e, paths: string[]) => void openQueue.push(paths))
    h('e2e:queueSave', (_e, path: string) => void saveQueue.push(path))
  }

  // app
  h('app:info', () => ({ version: app.getVersion(), dataPath: dataRoot(), electron: process.versions.electron }))
  h('app:openDataFolder', () => shell.openPath(dataRoot()))
  h('app:openExternal', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })
}

async function restartServer(): Promise<{ ok: boolean; error?: string }> {
  stopServer()
  const r = await startServer({ rendererDir, devUrl })
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

app.whenReady().then(async () => {
  if (!single) return
  registerMediaProtocol()
  seedIfEmpty()
  live.init()
  registerIpc()
  setCommandHandler((cmd) => forwardCommand(cmd))
  createOperator()
  if (getSettings().outputEnabled) createOutput()
  void restartServer()
  autoBackup().catch((e) => console.error('auto backup failed', e))

  screen.on('display-added', () => {
    operator?.webContents.send('displays:changed')
    placeOutput()
  })
  screen.on('display-removed', () => {
    operator?.webContents.send('displays:changed')
    placeOutput()
  })
})

app.on('before-quit', () => {
  db().flush()
  stopServer()
})

app.on('window-all-closed', () => app.quit())
