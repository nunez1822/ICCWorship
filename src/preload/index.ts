import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { BibleVersionInfo, Lang, LiveState, PassageResult, Presentation, RemoteCommand, Settings, Verse } from '@shared/types'
import type { PasteParseResult } from '@shared/bibleCore'

const invoke = ipcRenderer.invoke.bind(ipcRenderer)

function on<T>(channel: string, cb: (v: T) => void): () => void {
  const fn = (_e: unknown, v: T) => cb(v)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.removeListener(channel, fn)
}

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
    remove: (c: string, id: string): Promise<void> => invoke('db:remove', c, id)
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
    importFile: (meta: { name: string; abbrev: string; lang: Lang; copyright?: string }): Promise<{ ok: boolean; info?: BibleVersionInfo; error?: string; canceled?: boolean }> =>
      invoke('bible:importFile', meta)
  },
  live: {
    get: (): Promise<LiveState> => invoke('live:get'),
    update: (patch: Partial<LiveState>): Promise<void> => invoke('live:update', patch),
    onState: (cb: (s: LiveState) => void) => on('live:state', cb),
    onProgress: (cb: (p: LiveState['videoProgress']) => void) => on('live:progress', cb),
    onCommand: (cb: (c: RemoteCommand | { type: 'videoEnded' }) => void) => on('remote:command', cb),
    videoProgress: (p: { current: number; duration: number }) => ipcRenderer.send('output:progress', p),
    videoEnded: () => ipcRenderer.send('output:ended'),
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
    onStatus: (cb: (s: { open: boolean }) => void) => on('output:status', cb)
  },
  stage: { open: () => invoke('stage:open') },
  files: {
    open: (opts: { filters?: { name: string; extensions: string[] }[]; multi?: boolean; directory?: boolean }): Promise<string[]> => invoke('dialog:openFiles', opts),
    exists: (paths: string[]): Promise<boolean[]> => invoke('file:exists', paths),
    readText: (p: string): Promise<string> => invoke('file:readText', p),
    saveText: (name: string, content: string, filters?: { name: string; extensions: string[] }[]): Promise<string | null> => invoke('file:saveText', name, content, filters),
    /** absolute path of a file dropped from Windows Explorer */
    pathOf: (f: File): string => webUtils.getPathForFile(f)
  },
  pres: {
    detect: (): Promise<{ powerpoint: boolean; libreoffice: string | null }> => invoke('pres:detect'),
    import: (path: string, prefer?: 'powerpoint' | 'libreoffice' | 'text', reuseId?: string): Promise<ImportOutcome> => invoke('pres:import', path, prefer, reuseId),
    savePdfPages: (args: { id: string; name: string; sourcePath: string; method: 'libreoffice' | 'pdf'; pages: Uint8Array[] }): Promise<Presentation> =>
      invoke('pres:savePdfPages', args),
    importImages: (paths: string[], name: string): Promise<Presentation> => invoke('pres:importImages', paths, name)
  },
  server: {
    info: (): Promise<{ running: boolean; port: number; pin: string; urls: string[]; qr?: string; clients: number }> => invoke('server:info'),
    restart: (): Promise<{ ok: boolean; error?: string }> => invoke('server:restart'),
    onStatus: (cb: (s: { ok: boolean; error?: string }) => void) => on('server:status', cb)
  },
  backup: {
    create: (): Promise<{ ok: boolean; path: string; files: number; bytes: number } | null> => invoke('backup:create'),
    restore: (path?: string): Promise<{ ok: boolean; error?: string } | null> => invoke('backup:restore', path),
    list: (): Promise<{ name: string; path: string; size: number; date: number }[]> => invoke('backup:list')
  },
  print: {
    pdf: (html: string, name: string): Promise<string | null> => invoke('print:pdf', html, name),
    print: (html: string): Promise<void> => invoke('print:print', html)
  },
  /** test-only (npm run e2e:launch): pre-answer the next native file dialog */
  e2e: {
    queueOpenFiles: (paths: string[]): Promise<void> => invoke('e2e:queueOpen', paths),
    queueSaveFile: (path: string): Promise<void> => invoke('e2e:queueSave', path)
  },
  app: {
    info: (): Promise<{ version: string; dataPath: string; electron: string }> => invoke('app:info'),
    openDataFolder: () => invoke('app:openDataFolder'),
    openExternal: (url: string) => invoke('app:openExternal', url)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
