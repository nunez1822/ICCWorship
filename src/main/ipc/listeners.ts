/**
 * Every message the app's pages send to main without waiting for an answer (ipcRenderer.send → ipcMain.on).
 * Like handlers.ts, this object is the contract the preload is typed against. The sender check is applied by
 * registerIpc (./index.ts). Payloads are checked here: a page that misbehaves must not throw in main.
 */
import type { RemoteCommand } from '@shared/types'
import { validateCommand } from '@shared/security'
import { notify, open, wins } from '../appState'
import { getSettings } from '../db'
import { live } from '../live'
import { log } from '../log'
import { forwardCommand } from '../windows'
import { guards, kindOf, operatorAlive, recover, setOperatorBusy, type Guarded } from '../windowGuards'
import { testSoundAnswered } from './testSound'

type Ev = Electron.IpcMainEvent
export type VideoProgressReport = { current: number; duration: number; error?: boolean; src?: string; itemId?: string; seekSeq?: number; load?: boolean }

export function createListeners() {
  const lastRenderError: Record<Guarded, { m: string; at: number }> = { output: { m: '', at: 0 }, stage: { m: '', at: 0 } }
  return {
    /* ---------------- live ---------------- */
    'output:progress': (_e: Ev, p: VideoProgressReport) => {
      const r = p as { [K in keyof VideoProgressReport]?: unknown } | undefined
      const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
      live.progress({
        current: num(r?.current),
        duration: num(r?.duration),
        error: r?.error === true ? true : undefined,
        src: typeof r?.src === 'string' && r.src.length < 4000 ? r.src : undefined,
        itemId: typeof r?.itemId === 'string' && r.itemId.length < 200 ? r.itemId : undefined,
        seekSeq: typeof r?.seekSeq === 'number' && Number.isSafeInteger(r.seekSeq) ? r.seekSeq : undefined,
        load: r?.load === true ? true : undefined
      })
    },
    'output:ended': (_e: Ev, info: { itemId?: string; src: string }) => {
      const i = info as { itemId?: unknown; src?: unknown } | undefined
      if (typeof i?.src !== 'string') return
      forwardCommand({ type: 'videoEnded', src: i.src, itemId: typeof i.itemId === 'string' ? i.itemId : undefined })
    },
    'stage:command': (_e: Ev, raw: RemoteCommand) => {
      const cmd = validateCommand(raw)
      if (cmd) forwardCommand(cmd)
    },

    /* ---------------- crash & freeze recovery (see windowGuards.ts) ---------------- */
    'win:alive': (e: Ev) => {
      if (open(wins.operator) && e.sender === wins.operator.webContents) return operatorAlive()
      const kind = kindOf(e.sender)
      if (kind) guards[kind].beat.beat()
    },
    // the operator page opened / closed a confirm() (it blocks the page): waiting for the volunteer isn't a freeze
    'win:busy': (e: Ev, busy: boolean) => {
      if (!open(wins.operator) || e.sender !== wins.operator.webContents) return
      setOperatorBusy(busy === true)
    },
    'win:fatal': (e: Ev, message: string) => {
      const kind = kindOf(e.sender)
      if (!kind) return
      log.error(`${kind} page failed:`, String(message).slice(0, 200))
      recover(kind, 'render error')
    },
    'win:renderError': (e: Ev, message: string) => {
      const kind = kindOf(e.sender)
      if (!kind) return
      // a slide that can't be drawn throws again on every update: report it once, not every second
      const m = String(message).slice(0, 200)
      if (m === lastRenderError[kind].m && Date.now() - lastRenderError[kind].at < 30_000) return
      lastRenderError[kind] = { m, at: Date.now() }
      log.error(`${kind} could not draw a slide:`, m)
      notify({ type: 'renderError', window: kind })
    },

    /* ---------------- sound output ---------------- */
    'output:testSoundResult': (e: Ev, r: { ok: boolean }) => {
      if (kindOf(e.sender) === 'output') testSoundAnswered((r as { ok?: unknown } | undefined)?.ok === true)
    },
    'output:sinkFailed': (e: Ev) => {
      if (kindOf(e.sender) !== 'output') return
      log.warn('the chosen sound output is not available: playing through the default one')
      notify({ type: 'soundOutputMissing', label: getSettings().audioOutputLabel || '' })
    },

    /* ---------------- logging from the pages ---------------- */
    'app:log': (e: Ev, level: 'info' | 'warn' | 'error', message: string) => {
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
    }
  }
}

export type IpcListeners = ReturnType<typeof createListeners>
