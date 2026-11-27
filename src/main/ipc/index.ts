import { ipcMain } from 'electron'
import { send, wins } from '../appState'
import { db } from '../db'
import { E2E } from '../env'
import { log } from '../log'
import { isTrustedSender } from '../pages'
import { createHandlers } from './handlers'
import { createListeners } from './listeners'

/** Register every IPC channel. Every channel checks that the call comes from one of our own pages. */
export function registerIpc(): void {
  for (const [channel, fn] of Object.entries(createHandlers())) {
    if (channel.startsWith('e2e:') && !E2E) continue // test hooks exist only for `pnpm e2e:launch`
    const handler = fn as (...args: unknown[]) => unknown
    ipcMain.handle(channel, (e, ...args) => {
      if (!isTrustedSender(e.senderFrame)) {
        log.warn('ipc call from an untrusted page rejected:', channel)
        throw new Error('forbidden')
      }
      return handler(...args)
    })
  }
  for (const [channel, fn] of Object.entries(createListeners())) {
    const listener = fn as (e: Electron.IpcMainEvent, ...args: unknown[]) => void
    ipcMain.on(channel, (e, ...args) => {
      if (isTrustedSender(e.senderFrame)) listener(e, ...args)
    })
  }

  // a failed save (read-only file, disk full…) must reach the operator, not crash main
  const lastWarn = new Map<string, number>()
  db().onWriteError = (name, error) => {
    log.error('could not save', name, error)
    const now = Date.now()
    if (now - (lastWarn.get(name) || 0) < 10_000) return
    lastWarn.set(name, now)
    send(wins.operator, 'db:writeError', { name, message: (error as NodeJS.ErrnoException).code || error.message })
  }
}
