/**
 * Every call the app's pages can make into main (ipcRenderer.invoke → ipcMain.handle), in one object.
 *
 * This object IS the IPC contract: the preload (src/preload/index.ts) derives each call's arguments and result from
 * `IpcHandlers`, so a renamed channel, a changed argument or a different result is a type error on both sides.
 * The sender check (only our own pages) is applied to every channel by registerIpc (./index.ts).
 *
 * Arguments come from our own pages, but still validate anything that becomes a path, an id or a file write
 * (see CLAUDE.md → Trust boundaries).
 *
 * A handler takes only the page's arguments — no event first (registerIpc drops it). Listeners (listeners.ts) are
 * the other way round: the event comes first. Mixing the two up shifts every argument by one.
 */
import { app, BrowserWindow, clipboard, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import type { LiveState } from '@shared/types'
import { sanitizeSettingsPatch } from '@shared/security'
import { decodeText } from '@shared/textDecode'
import { loggableError } from '@shared/loggableError'
import { MAX_SOURCE_BYTES } from '@shared/tracks'
import { open, pendingNotices, send, wins } from '../appState'
import { assertWritable, COLLECTIONS, dataStatus, db, ensurePin, getSettings, isCollection, seedIfEmpty, setSettings } from '../db'
import * as bible from '../bible'
import { live } from '../live'
import { serverInfo } from '../server'
import { mediaFile } from '../mediaPath'
import { deletePresentation, detectConverters, importImages, importPresentation, savePdfPages } from '../presentations'
import { createBackup, defaultBackupName, listBackups, restoreBackup } from '../backup'
import { backupDir, dataRoot } from '../paths'
import { log } from '../log'
import { newPin, within } from '../pathGuard'
import { setMainLang } from '../i18n'
import { systemInfoText } from '../diagnostics'
import { canSelfUpdate, checkForUpdates, installUpdate, RELEASES_URL, updatePhase, updateSettingsChanged } from '../updates'
import { pruneTrack, saveTrack } from '../tracks'
import { e2eQueues, isGranted, openDialog, saveDialog } from '../dialogs'
import { E2E } from '../env'
import { exportDiagnosticsInteractive, newIssueUrl, openFolder, openLogs, openNotices } from '../help'
import { buildMenu } from '../menu'
import { audioOutputOf, restartServer } from '../serverControl'
import { createOutput, createStageWindow, listDisplays, placeOutput, restartOutput } from '../windows'
import { guards } from '../windowGuards'
import { testSound } from './testSound'
import { takeResumeOffer } from '../session'
import { location } from '../bootstrap'
import { copyIntoLibrary, deleteCopyIfUnused, removeMediaItem } from '../mediaLibrary'
import { isLibraryPath } from '@shared/mediaLibrary'

type FileFilter = { name: string; extensions: string[] }

export function createHandlers() {
  return {
    /* ---------------- database ---------------- */
    // hand the startup problems over once (the operator may initialise more than once)
    // read every collection first: one the operator doesn't load at startup (the CCLI usage
    // log) would otherwise be found damaged later, after this report — and never shown
    'db:problems': () => {
      for (const c of COLLECTIONS) db().list(c)
      return db().problems.splice(0)
    },
    'db:list': (c: string): unknown[] => (isCollection(c) ? db().list(c) : []),
    'db:get': (c: string, id: string): unknown => (isCollection(c) ? db().get(c, id) : undefined),
    'db:upsert': (c: string, item: { id: string }): unknown => (isCollection(c) ? db().upsert(c, item) : item),
    'db:upsertMany': (c: string, items: { id: string }[]): void => {
      if (isCollection(c)) db().upsertMany(c, items)
    },
    'db:remove': (c: string, id: string): void => {
      if (c === 'presentations') deletePresentation(id)
      else if (c === 'media') removeMediaItem(id) // and its library copy, when nothing else shows it
      else if (isCollection(c)) {
        db().remove(c, id)
        if (c === 'songs') pruneTrack(id) // its backing track goes with it (unless it is playing right now)
      }
    },

    /* ---------------- settings — only known settings with valid values are saved (see sanitizeSettingsPatch) ---------------- */
    'settings:get': () => getSettings(),
    'settings:set': async (raw: unknown) => {
      const patch = sanitizeSettingsPatch(raw)
      const before = getSettings()
      const s = setSettings(patch)
      if (patch.uiLang) {
        setMainLang(s.uiLang)
        buildMenu()
        BrowserWindow.getAllWindows().forEach((w) => send(w, 'settings:changed', s))
      }
      if (patch.outputDisplayId !== undefined && wins.output) placeOutput()
      if (before.serverPort !== s.serverPort || before.serverEnabled !== s.serverEnabled) await restartServer()
      if (patch.logoPath !== undefined || patch.churchName !== undefined) live.update({ logoPath: s.logoPath, churchName: s.churchName })
      if (patch.audioOutputId !== undefined || patch.audioOutputLabel !== undefined) live.update({ audioOutput: audioOutputOf(s) })
      if (patch.checkForUpdates !== undefined || patch.autoUpdate !== undefined) updateSettingsChanged()
      // a replaced or cleared logo's library copy (if nothing else shows it)
      if (patch.logoPath !== undefined && before.logoPath && before.logoPath !== s.logoPath) deleteCopyIfUnused({ id: '', path: before.logoPath })
      return s
    },

    /* ---------------- bible ---------------- */
    'bible:versions': () => bible.versions(),
    'bible:passage': (id: string, ref: string) => bible.passage(id, ref),
    'bible:search': (id: string, q: string) => bible.search(id, q),
    'bible:structure': () => bible.structure(),
    'bible:createPasted': (meta: Parameters<typeof bible.createPasted>[0]) => bible.createPasted(meta),
    'bible:parsePaste': (ref: string, text: string) => bible.parsePaste(ref, text),
    'bible:savePasted': (id: string, verses: Parameters<typeof bible.savePastedVerses>[1]) => bible.savePastedVerses(id, verses),
    'bible:listPasted': (id: string) => bible.listPastedVerses(id),
    'bible:deletePastedVerse': (id: string, b: number, c: number, v: number) => bible.deletePastedVerse(id, b, c, v),
    'bible:deleteVersion': (id: string) => bible.deleteVersion(id),
    'bible:importFile': async (
      meta: Parameters<typeof bible.importFile>[1]
    ): Promise<{ ok: boolean; info?: ReturnType<typeof bible.importFile>; error?: string; canceled?: boolean }> => {
      const r = await openDialog({ properties: ['openFile'], filters: [{ name: 'Bible (OSIS, USFX, JSON)', extensions: ['xml', 'osis', 'usfx', 'json'] }] })
      if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true }
      try {
        return { ok: true, info: bible.importFile(r.filePaths[0], meta) }
      } catch (e) {
        // never the raw message in the log: a parser's SyntaxError quotes the file's text (maybe a licensed Bible)
        log.warn('bible import failed:', loggableError(e))
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      }
    },

    /* ---------------- live ---------------- */
    'live:get': () => live.state,
    'live:update': (patch: Partial<LiveState>) => live.update(patch),

    /* ---------------- windows ---------------- */
    // Settings → Screens → Test sound: the projector plays a short tone through the chosen output and answers
    'output:testSound': () => testSound(),
    'output:restart': () => restartOutput(),
    'app:notices': () => pendingNotices.splice(0),
    /** what was on screen when the last run closed unexpectedly (once; null when there is nothing to offer) */
    'app:resumeOffer': () => takeResumeOffer(),
    'displays:list': () => listDisplays(),
    'output:open': () => createOutput(),
    'output:close': () => wins.output?.close(),
    /** failed: the window is there but stopped after crashing, or shows the black safe page ("Restart projector") */
    'output:status': () => {
      const w = wins.output
      return { open: !!w, failed: !!w && (!!guards.output.failed || !!guards.output.safe || w.webContents.isCrashed()) }
    },
    'output:replace': () => placeOutput(),
    'stage:open': () => createStageWindow(),

    /* ---------------- dialogs & files ---------------- */
    'dialog:openFiles': async (opts: { filters?: FileFilter[]; multi?: boolean; directory?: boolean }): Promise<string[]> => {
      const r = await openDialog({
        properties: opts?.directory ? ['openDirectory'] : opts?.multi ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: opts?.filters
      })
      return r.canceled ? [] : r.filePaths
    },
    'file:exists': (paths: string[]): boolean[] => (Array.isArray(paths) ? paths.map((p) => typeof p === 'string' && existsSync(p)) : []),
    // media:// URLs → is the file there? (resolved like the projector does: data-relative and moved slides too)
    'file:mediaStatus': (urls: string[]): { path: string | null; exists: boolean }[] =>
      (Array.isArray(urls) ? (urls as unknown[]) : []).map((u) => {
        const path = typeof u === 'string' ? mediaFile(u) : null
        return { path, exists: !!path && existsSync(path) }
      }),
    'file:readText': (p: string): string => {
      // only a file the user picked in a dialog (song import)
      if (!isGranted(p)) throw new Error('forbidden')
      return decodeText(readFileSync(p))
    },
    'file:saveText': async (name: string, content: string, filters?: FileFilter[]): Promise<string | null> => {
      const r = await saveDialog({ defaultPath: name, filters })
      if (r.canceled || !r.filePath) return null
      writeFileSync(r.filePath, String.fromCharCode(0xfeff) + content, 'utf8') // BOM: Excel reads the CSV as UTF-8
      return r.filePath
    },

    /* ---------------- backing tracks: the renderer reads the picked file, decodes and encodes it, and hands back Ogg bytes ---------------- */
    'tracks:readPicked': async (p: string): Promise<Uint8Array> => {
      if (!isGranted(p)) throw new Error('forbidden') // only a file the user picked in a dialog
      if ((await stat(p)).size > MAX_SOURCE_BYTES) throw new Error('too-large')
      return new Uint8Array(await readFile(p))
    },
    'tracks:save': (songId: string, bytes: Uint8Array) => saveTrack(songId, bytes),
    'tracks:prune': (songId: string): void => {
      assertWritable()
      pruneTrack(songId)
    },

    /* ---------------- media library: keep a copy of what is added (see @shared/mediaLibrary) ---------------- */
    'media:copyIn': (path: string) => copyIntoLibrary(path),
    /** a copy whose item (or logo) couldn't be saved after all: delete it, unless something does use that file */
    'media:discardCopy': (path: string) => {
      if (typeof path === 'string' && isLibraryPath(path)) deleteCopyIfUnused({ id: '', path })
    },

    /* ---------------- presentations ---------------- */
    'pres:detect': () => detectConverters(),
    'pres:import': (path: string, prefer?: 'powerpoint' | 'libreoffice' | 'text', reuseId?: string) => importPresentation(path, prefer, reuseId),
    'pres:savePdfPages': (args: Parameters<typeof savePdfPages>[0]) => savePdfPages(args),
    'pres:importImages': (paths: string[], name: string) => importImages(paths, name),

    /* ---------------- phone / stage server ---------------- */
    'server:info': () => serverInfo(),
    'server:restart': () => restartServer(),
    'server:newPin': async () => {
      // a new PIN restarts the server, which disconnects every phone and stage screen using the old one
      setSettings({ remotePin: newPin() })
      await restartServer()
      log.info('remote PIN changed')
      return getSettings()
    },

    /* ---------------- backup ---------------- */
    'backup:create': async () => {
      const r = await saveDialog({ defaultPath: defaultBackupName(), filters: [{ name: 'ICCWorship backup', extensions: ['zip'] }] })
      if (r.canceled || !r.filePath) return null
      const res = await createBackup(r.filePath)
      if (res.ok) setSettings({ lastManualBackup: Date.now() }) // "Ready for Sunday?" judges the backup line on it
      return res
    },
    'backup:restore': async (path?: string) => {
      let p: string
      if (path === undefined || path === null) {
        const r = await openDialog({ properties: ['openFile'], filters: [{ name: 'ICCWorship backup', extensions: ['zip'] }] })
        if (r.canceled || !r.filePaths[0]) return null
        p = r.filePaths[0]
      } else if (isGranted(path) || (typeof path === 'string' && within(backupDir(), path))) {
        // a file picked in a dialog this session, or one of the backups in Documents\ICCWorship\backups
        p = path
      } else return { ok: false, error: 'forbidden' as const }
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
        live.update({ logoPath: s.logoPath, churchName: s.churchName, audioOutput: audioOutputOf(s) })
        BrowserWindow.getAllWindows().forEach((w) => send(w, 'settings:changed', s))
        if (before.remotePin !== s.remotePin || before.serverPort !== s.serverPort || before.serverEnabled !== s.serverEnabled) await restartServer()
        // reply first, then reload: reloading before the answer arrives destroys the page that is waiting for it
        setTimeout(() => (open(wins.operator) ? wins.operator.webContents.reload() : undefined), 150)
      }
      return res
    },
    'backup:list': () => listBackups(),

    /* ---------------- printing: the HTML comes from the operator page; rendered with JavaScript off, in a throw-away session ---------------- */
    'print:pdf': async (html: string, name: string): Promise<string | null> => {
      const win = new BrowserWindow({ show: false, webPreferences: PRINT_PREFS })
      let pdf: Buffer
      try {
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
        pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: 'Letter' })
      } finally {
        if (!win.isDestroyed()) win.destroy() // a failed export must not leave a hidden window running
      }
      const r = await saveDialog({ defaultPath: name, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (r.canceled || !r.filePath) return null
      writeFileSync(r.filePath, pdf)
      if (!E2E) void shell.openPath(r.filePath)
      return r.filePath
    },
    'print:print': async (html: string): Promise<void> => {
      const win = new BrowserWindow({ show: false, webPreferences: PRINT_PREFS })
      try {
        await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
      } catch (e) {
        win.destroy()
        throw e
      }
      win.webContents.print({ printBackground: true }, () => {
        if (!win.isDestroyed()) win.destroy()
      })
    },

    /* ---------------- e2e (registered only for `pnpm e2e:launch`, see registerIpc) ---------------- */
    'e2e:queueOpen': (paths: string[]): void => void e2eQueues.open.push(paths),
    'e2e:queueSave': (path: string): void => void e2eQueues.save.push(path),
    'e2e:queueMessageBox': (response: number): void => void e2eQueues.messageBox.push(response),

    /* ---------------- help & diagnostics ---------------- */
    'app:openLogs': () => openLogs(),
    'app:exportDiagnostics': (includeCrashDumps: boolean) => exportDiagnosticsInteractive(includeCrashDumps === true),
    'app:copySystemInfo': async () => {
      // Electron 45's clipboard.writeText is async: wait for it, so a failure reaches the operator as a toast
      await clipboard.writeText(systemInfoText())
      return true
    },
    'app:openNotices': () => openNotices(),
    'app:reportProblem': (): void => void shell.openExternal(newIssueUrl()),
    'app:checkUpdates': () => checkForUpdates({ manual: true }),
    /** where a self-update is (installed app): downloading, ready to install… */
    'app:updateStatus': () => ({ selfUpdate: canSelfUpdate(), ...updatePhase() }),
    'app:installUpdate': () => installUpdate(),
    'app:openRelease': (url: string): void => {
      if (typeof url === 'string' && url.startsWith(RELEASES_URL)) void shell.openExternal(url)
    },

    /* ---------------- app ---------------- */
    'app:info': () => ({
      version: app.getVersion(),
      dataPath: dataRoot(),
      electron: process.versions.electron,
      /** portable: the data is in the folder beside the portable exe; portable-fallback: it couldn't be written there */
      dataMode: location.mode
    }),
    'app:openDataFolder': () => openFolder(dataRoot(), 'data'),
    'app:openBackups': () => openFolder(backupDir(), 'backups'),
    'app:dataStatus': () => dataStatus(),
    'app:openExternal': (url: string): void => {
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) void shell.openExternal(url)
    }
  }
}

const PRINT_PREFS = { sandbox: true, javascript: false, partition: 'iccworship-print' }

export type IpcHandlers = ReturnType<typeof createHandlers>
