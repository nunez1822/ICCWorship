/**
 * One running ICCWorship per Windows user, whichever copy it is. Electron's single-instance lock lives in the
 * profile folder, and the portable exe keeps its profile beside it (portable.ts), so the portable and the installed
 * copy (or two portable copies) would each get their own lock: a second full app would open its own projector window
 * over the live one, and its phone server couldn't start.
 *
 * A named pipe is the lock: Windows allows one listener per name and frees it the moment the process ends (a crash or
 * power cut leaves no stale lock that could stop the app on Sunday), and it leaves no file on the computer.
 */
import { createServer, type Server } from 'node:net'
import { userInfo } from 'node:os'

let held: Server | undefined

/** 'taken': another copy of ICCWorship is running for this user */
export function machineLock(): Promise<'ok' | 'taken'> {
  if (process.platform !== 'win32' || held) return Promise.resolve('ok')
  let user = 'user'
  try {
    user =
      userInfo()
        .username.replace(/[^A-Za-z0-9_-]/g, '_')
        .slice(0, 64) || user
  } catch {
    /* no user name: one lock for the computer */
  }
  return new Promise((resolve) => {
    const server = createServer((socket) => socket.destroy())
    server.once('error', (e) => {
      // anything but "in use" (pipes unavailable?) must never keep the app from starting
      resolve((e as NodeJS.ErrnoException).code === 'EADDRINUSE' ? 'taken' : 'ok')
    })
    server.listen(`\\\\.\\pipe\\ICCWorship-${user}`, () => {
      server.unref() // never keeps the app from quitting
      held = server
      resolve('ok')
    })
  })
}
