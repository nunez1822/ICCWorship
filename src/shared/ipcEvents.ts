/**
 * Messages main sends to the app's windows (main → renderer). Main sends them with `send()` (src/main/appState.ts)
 * and the preload listens with `on()`: both are checked against this map, so a channel name or payload can't drift.
 *
 * Calls the other way (renderer → main) are typed from the handlers themselves: see src/main/ipc/handlers.ts.
 */
import type { LiveState, RemoteCommand, Settings, VideoEndedCommand } from './types'

/** Events for the operator window (shown as toasts): crashes recovered, menu actions, updates… */
export type AppEvent =
  | { type: 'mainError' }
  | { type: 'windowRecovered'; window: 'output' | 'stage'; safe: boolean }
  | { type: 'windowFailed'; window: 'output' | 'stage' }
  | { type: 'renderError'; window: 'output' | 'stage' }
  | { type: 'gpuCrashed' }
  | { type: 'update'; latest: string; url: string }
  /** the installed app downloaded a new version: it installs when ICCWorship closes (or "Restart now") */
  | { type: 'updateReady'; version: string }
  | { type: 'diagnostics'; ok: boolean }
  | { type: 'menu'; action: 'shortcuts' | 'about' }
  | { type: 'openFailed'; what: 'logs' | 'notices' }
  | { type: 'soundOutputMissing'; label: string }

export type ServerStatus = { ok: boolean; error?: string }

export interface MainEvents {
  'app:event': AppEvent
  'db:writeError': { name: string; message: string }
  'settings:changed': Settings
  'live:state': LiveState
  'live:progress': LiveState['videoProgress']
  'remote:command': RemoteCommand | VideoEndedCommand
  'output:status': { open: boolean }
  'output:testSound': undefined
  'server:status': ServerStatus
  'displays:changed': undefined
}
