import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { BibleVersionInfo, Lang, LiveState, PassageResult, Presentation, RemoteCommand, Settings, Verse, VideoEndedCommand } from '@shared/types'
import type { PasteParseResult } from '@shared/bibleCore'

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

function on<T>(channel: string, cb: (v: T) => void): () => void {
  const fn = (_e: unknown, v: T) => cb(v)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

export type AppEvent =
  | { type: 'mainError' }
  | { type: 'windowRecovered'; window: 'output' | 'stage'; safe: boolean }
  | { type: 'windowFailed'; window: 'output' | 'stage' }
  | { type: 'renderError'; window: 'output' | 'stage' }
  | { type: 'gpuCrashed' }
  | { type: 'update'; latest: string; url: string }
  | { type: 'diagnostics'; ok: boolean }
  | { type: 'menu'; action: 'shortcuts' | 'about' }
  | { type: 'openFailed'; what: 'logs' | 'notices' }

export interface ImportOutcome {
  presentation?: Presentation
  pdfToRender?: { id: string; pdfPath: string; name: string; sourcePath: string; method: 'libreoffice' | 'pdf' }
  error?: string
}

const api = {
  db: {
    list: <T>(c: string): Promise<T[]> => invoke('db:list', c),
    get: <T>(c: string, id: string): Promise<T | undefined> => invoke('db:get', c, id),
    upsert: <T extends { id: string }>(c: string, item: T): Promise<T> => invoke('db:upsert', c, item),
    upsertMany: <T extends { id: string }>(c: string, items: T[]): Promise<void> => invoke('db:upsertMany', c, items),
    remove: (c: string, id: string): Promise<void> => invoke('db:remove', c, id),
    problems: (): Promise<{ name: string; kind: 'recovered' | 'unreadable'; savedAs?: string }[]> => invoke('db:problems'),
    onWriteError: (cb: (e: { name: string; message: string }) => void) => on('db:writeError', cb)
  },
  settings: {
    get: (): Promise<Settings> => invoke('settings:get'),
    set: (patch: Partial<Settings>): Promise<Settings> => invoke('settings:set', patch),
    onChange: (cb: (s: Settings) => void) => on('settings:changed', cb)
  },
  bible: {
    versions: (): Promise<BibleVersionInfo[]> => invoke('bible:versions'),
    passage: (id: string, ref: string): Promise<PassageResult> => invoke('bible:passage', id, ref),
    search: (id: string, q: string): Promise<Verse[]> => invoke('bible:search', id, q),
    structure: (): Promise<number[][]> => invoke('bible:structure'),
    createPasted: (meta: { id?: string; name: string; abbrev: string; lang: Lang; copyright?: string; verseLimit?: number }): Promise<BibleVersionInfo> =>
      invoke('bible:createPasted', meta),
    parsePaste: (ref: string, text: string): Promise<PasteParseResult> => invoke('bible:parsePaste', ref, text),
    savePasted: (id: string, verses: Verse[]): Promise<{ ok: boolean; info?: BibleVersionInfo; overLimit?: boolean }> => invoke('bible:savePasted', id, verses),
    listPasted: (id: string): Promise<Verse[]> => invoke('bible:listPasted', id),
    deletePastedVerse: (id: string, b: number, c: number, v: number): Promise<void> => invoke('bible:deletePastedVerse', id, b, c, v),
    deleteVersion: (id: string): Promise<void> => invoke('bible:deleteVersion', id),
    importFile: (meta: {
      name: string
      abbrev: string
      lang: Lang
      copyright?: string
    }): Promise<{ ok: boolean; info?: BibleVersionInfo; error?: string; canceled?: boolean }> => invoke('bible:importFile', meta)
  },
  live: {
    get: (): Promise<LiveState> => invoke('live:get'),
    update: (patch: Partial<LiveState>): Promise<LiveState> => invoke('live:update', patch),
    onState: (cb: (s: LiveState) => void) => on('live:state', cb),
    onProgress: (cb: (p: LiveState['videoProgress']) => void) => on('live:progress', cb),
    onCommand: (cb: (c: RemoteCommand | VideoEndedCommand) => void) => on('remote:command', cb),
    videoProgress: (p: { current: number; duration: number; error?: boolean; src?: string }) => ipcRenderer.send('output:progress', p),
    videoEnded: (info: { itemId?: string; src: string }) => ipcRenderer.send('output:ended', info),
    stageCommand: (cmd: RemoteCommand) => ipcRenderer.send('stage:command', cmd)
  },
  displays: {
    list: (): Promise<{ id: number; label: string; width: number; height: number; primary: boolean }[]> => invoke('displays:list'),
    onChange: (cb: () => void) => on('displays:changed', cb)
  },
  output: {
    open: () => invoke('output:open'),
    close: () => invoke('output:close'),
    status: (): Promise<{ open: boolean }> => invoke('output:status'),
    replace: () => invoke('output:replace'),
    onStatus: (cb: (s: { open: boolean }) => void) => on('output:status', cb),
    /** reload the projector page (and leave "safe" mode after repeated crashes) */
    restart: () => invoke('output:restart')
  },
  /** projector / stage windows: "I'm alive" every second, and "my page broke, reload me" */
  win: {
    alive: () => ipcRenderer.send('win:alive'),
    fatal: (message: string) => ipcRenderer.send('win:fatal', message),
    /** this window couldn't draw the current slide (its error boundary caught it): tell the operator */
    renderError: (message: string) => ipcRenderer.send('win:renderError', message)
  },
  stage: { open: () => invoke('stage:open') },
  files: {
    open: (opts: { filters?: { name: string; extensions: string[] }[]; multi?: boolean; directory?: boolean }): Promise<string[]> =>
      invoke('dialog:openFiles', opts),
    exists: (paths: string[]): Promise<boolean[]> => invoke('file:exists', paths),
    /** media:// URLs → the file they point to on this PC and whether it is there (as the projector resolves them) */
    mediaStatus: (urls: string[]): Promise<{ path: string | null; exists: boolean }[]> => invoke('file:mediaStatus', urls),
    readText: (p: string): Promise<string> => invoke('file:readText', p),
    saveText: (name: string, content: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null> =>
      invoke('file:saveText', name, content, filters),
    /** absolute path of a file dropped from Windows Explorer */
    pathOf: (f: File): string => webUtils.getPathForFile(f)
  },
  pres: {
    detect: (): Promise<{ powerpoint: boolean; libreoffice: string | null }> => invoke('pres:detect'),
    import: (path: string, prefer?: 'powerpoint' | 'libreoffice' | 'text', reuseId?: string): Promise<ImportOutcome> =>
      invoke('pres:import', path, prefer, reuseId),
    savePdfPages: (args: { id: string; name: string; sourcePath: string; method: 'libreoffice' | 'pdf'; pages: Uint8Array[] }): Promise<Presentation> =>
      invoke('pres:savePdfPages', args),
    importImages: (paths: string[], name: string): Promise<Presentation> => invoke('pres:importImages', paths, name)
  },
  server: {
    info: (): Promise<{ running: boolean; port: number; pin: string; urls: string[]; qr?: string; stageQr?: string; clients: number }> => invoke('server:info'),
    restart: (): Promise<{ ok: boolean; error?: string }> => invoke('server:restart'),
    /** generate a new 6-digit PIN in main (disconnects phones and stage screens using the old one) */
    newPin: (): Promise<Settings> => invoke('server:newPin'),
    onStatus: (cb: (s: { ok: boolean; error?: string }) => void) => on('server:status', cb)
  },
  backup: {
    create: (): Promise<{ ok: boolean; path: string; files: number; bytes: number } | null> => invoke('backup:create'),
    restore: (
      path?: string
    ): Promise<{
      ok: boolean
      error?:
        | 'not-a-backup'
        | 'newer-format'
        | 'newer-schema'
        | 'damaged-backup'
        | 'restore-failed'
        | 'restore-failed-mixed'
        | 'read-only'
        | 'read-only-unprepared'
        | 'forbidden'
      /** the copy of the data from just before the restore */
      safetyBackup?: string
    } | null> => invoke('backup:restore', path),
    list: (): Promise<{ name: string; path: string; size: number; date: number }[]> => invoke('backup:list')
  },
  print: {
    pdf: (html: string, name: string): Promise<string | null> => invoke('print:pdf', html, name),
    print: (html: string): Promise<void> => invoke('print:print', html)
  },
  /** test-only (pnpm e2e:launch): pre-answer the next native file dialog */
  e2e: {
    queueOpenFiles: (paths: string[]): Promise<void> => invoke('e2e:queueOpen', paths),
    queueSaveFile: (path: string): Promise<void> => invoke('e2e:queueSave', path),
    /** answer the next message box with this button index */
    queueMessageBox: (response: number): Promise<void> => invoke('e2e:queueMessageBox', response)
  },
  app: {
    info: (): Promise<{ version: string; dataPath: string; electron: string }> => invoke('app:info'),
    /** false when the folder could not be opened */
    openDataFolder: (): Promise<boolean> => invoke('app:openDataFolder'),
    /** false when the folder could not be opened */
    openBackups: (): Promise<boolean> => invoke('app:openBackups'),
    /** readOnly: the data was written by a newer ICCWorship (nothing is saved this session) */
    dataStatus: (): Promise<{ readOnly: boolean; newerSchema?: number; upgradeFailed?: boolean }> => invoke('app:dataStatus'),
    openExternal: (url: string) => invoke('app:openExternal', url),
    /** write a line to the app's log file (never put lyrics, people or PINs in it) */
    log: (level: 'info' | 'warn' | 'error', message: string) => ipcRenderer.send('app:log', level, message),
    /** false when the folder could not be opened */
    openLogs: (): Promise<boolean> => invoke('app:openLogs'),
    exportDiagnostics: (includeCrashDumps: boolean): Promise<{ ok: boolean; path: string } | null> => invoke('app:exportDiagnostics', includeCrashDumps),
    copySystemInfo: (): Promise<boolean> => invoke('app:copySystemInfo'),
    /** false when the licences file is missing */
    openNotices: (): Promise<boolean> => invoke('app:openNotices'),
    reportProblem: () => invoke('app:reportProblem'),
    checkUpdates: (): Promise<{ ok: true; latest: string; newer: boolean; url: string } | { ok: false; error?: string; skipped?: true }> =>
      invoke('app:checkUpdates'),
    openRelease: (url: string) => invoke('app:openRelease', url),
    /** things to tell the operator after a (re)load, e.g. 'operatorRecovered' */
    notices: (): Promise<string[]> => invoke('app:notices'),
    onEvent: (cb: (e: AppEvent) => void) => on('app:event', cb)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
