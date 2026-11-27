/**
 * One running ICCWorship per Windows user, whichever copy it is. Electron's single-instance lock lives in the
 * profile folder, and the portable exe keeps its profile beside it (portable.ts), so the portable and the installed
 * copy (or two portable copies) would each get their own lock: a second full app would open its own projector window
 * over the live one, and its phone server couldn't start.
 *
 * A named pipe is the lock: Windows allows one listener per name and frees it the moment the process ends (a crash or
 * power cut leaves no stale lock that could stop the app on Sunday), and it leaves no file on the computer.
 */
import { createHash } from 'node:crypto'
import { createServer, type Server } from 'node:net'
import { userInfo } from 'node:os'
import { log } from './log'

let held: Server | undefined

/** 'taken': another copy of ICCWorship is running for this user */
export function machineLock(): Promise<'ok' | 'taken'> {
  if (process.platform !== 'win32' || held) return Promise.resolve('ok')
  let user = 'user'
  try {
    // a hash, not the name itself: names that differ only in accents or other non-ASCII letters (José, Jose) must not
    // share a lock (pipe names are machine-wide)
    user = createHash('sha256').update(userInfo().username).digest('hex').slice(0, 24)
  } catch {
    /* no user name: one lock for the computer */
  }
  return new Promise((resolve) => {
    const server = createServer((socket) => {
      socket.on('error', () => {}) // nothing a connection does may throw in main
      socket.destroy()
    })
    server.once('error', (e) => {
      // anything but "in use" (pipes unavailable?) must never keep the app from starting
      resolve((e as NodeJS.ErrnoException).code === 'EADDRINUSE' ? 'taken' : 'ok')
    })
    server.listen(`\\\\.\\pipe\\ICCWorship-${user}`, () => {
      server.unref() // never keeps the app from quitting
      // a later error on the pipe is logged, never an uncaught exception
      server.on('error', (e) => log.warn('machine lock:', (e as NodeJS.ErrnoException).code || 'error'))
      held = server
      resolve('ok')
    })
  })
}
