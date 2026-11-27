import type { LiveState } from '@shared/types'
import type { ServerStatus } from '@shared/ipcEvents'
import { send, wins } from './appState'
import { getSettings } from './db'
import { devUrl, rendererDir } from './env'
import { log } from './log'
import { startServer } from './server'

/** (re)start the phone/stage server with the current settings and tell the operator how it went */
export async function restartServer(): Promise<ServerStatus> {
  // startServer stops the old server itself, in turn with any other restart
  const r = await startServer({ rendererDir, devUrl })
  if (r.error !== 'superseded') log.info('LAN server', r.ok ? `listening on port ${getSettings().serverPort}` : `not running: ${r.error}`)
  send(wins.operator, 'server:status', r)
  return r
}

/** the sound output the projector plays through ({} = the Windows default) */
export function audioOutputOf(s: ReturnType<typeof getSettings>): LiveState['audioOutput'] {
  return s.audioOutputId || s.audioOutputLabel ? { id: s.audioOutputId || undefined, label: s.audioOutputLabel || undefined } : undefined
}
