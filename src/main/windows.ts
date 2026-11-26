/**
 * The operator, projector (output) and stage windows: creating and placing them, and keeping them in step with
 * the live state.
 */
import { app, BrowserWindow, screen, type Display } from 'electron'
import { existsSync } from 'node:fs'
import type { LiveState, RemoteCommand, VideoEndedCommand } from '@shared/types'
import { open, send, wins } from './appState'
import { getSettings } from './db'
import { iconPath, preloadPath } from './env'
import { live } from './live'
import { log } from './log'
import { loadPage } from './pages'
import { guardOperator, guards, guardWindow } from './windowGuards'

export function createOperator(): void {
  const operator = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 680,
    show: false,
    backgroundColor: '#0e1420',
    title: 'ICCWorship',
    icon: existsSync(iconPath) ? iconPath : undefined,
    autoHideMenuBar: true,
    webPreferences: { preload: preloadPath, sandbox: true, contextIsolation: true }
  })
  wins.operator = operator
  operator.once('ready-to-show', () => {
    operator.maximize()
    operator.show()
  })
  operator.on('closed', () => {
    wins.operator = null
    wins.output?.destroy()
    wins.stage?.destroy()
    app.quit()
  })
  guardOperator(operator)
  loadPage(operator, 'index')
}

function pickOutputDisplay(s: ReturnType<typeof getSettings>): Display | null {
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  if (s.outputDisplayId !== undefined) {
    const d = displays.find((x) => x.id === s.outputDisplayId)
    if (d) return d
  }
  return displays.find((d) => d.id !== primary.id) || null
}

export function placeOutput(): void {
  const output = wins.output
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

export function createOutput(): void {
  if (wins.output) return
  const output = new BrowserWindow({
    width: 640,
    height: 360,
    show: false,
    frame: false,
    backgroundColor: '#000000',
    title: 'ICCWorship — Output',
    skipTaskbar: false,
    webPreferences: { preload: preloadPath, sandbox: true, contextIsolation: true, backgroundThrottling: false }
  })
  wins.output = output
  output.setMenuBarVisibility(false)
  output.on('closed', () => {
    wins.output = null
    send(wins.operator, 'output:status', { open: false })
  })
  output.once('ready-to-show', () => {
    placeOutput()
    output.showInactive()
    wins.operator?.focus()
    send(wins.operator, 'output:status', { open: true })
  })
  guardWindow(output, 'output')
  loadPage(output, 'output')
}

/** "Restart projector": reload the page (leaving safe mode), or open the window if it is closed */
export function restartOutput(): void {
  guards.output.budget.reset()
  guards.output.failed = false
  if (open(wins.output)) loadPage(wins.output, 'output')
  else createOutput()
}

export function createStageWindow(): void {
  const existing = wins.stage
  if (existing) {
    // after it gave up (or crashed for good) "open it again" must really start it again, not just focus it
    if (guards.stage.failed || existing.webContents.isCrashed()) {
      log.info('stage window started again after it failed')
      guards.stage.budget.reset()
      guards.stage.failed = false
      loadPage(existing, 'stage', '#local')
    }
    existing.focus()
    return
  }
  const displays = screen.getAllDisplays()
  const primary = screen.getPrimaryDisplay()
  const outId = pickOutputDisplay(getSettings())?.id
  const third = displays.find((d) => d.id !== primary.id && d.id !== outId)
  const stage = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#000000',
    title: 'ICCWorship — Stage',
    autoHideMenuBar: true,
    webPreferences: { preload: preloadPath, sandbox: true, contextIsolation: true, backgroundThrottling: false }
  })
  wins.stage = stage
  if (third) {
    stage.setBounds(third.bounds)
    stage.setFullScreen(true)
  }
  stage.on('closed', () => (wins.stage = null))
  guardWindow(stage, 'stage')
  loadPage(stage, 'stage', '#local')
}

export function listDisplays(): { id: number; label: string; width: number; height: number; primary: boolean }[] {
  const primary = screen.getPrimaryDisplay()
  return screen
    .getAllDisplays()
    .map((d, i) => ({ id: d.id, label: d.label || `Display ${i + 1}`, width: d.size.width, height: d.size.height, primary: d.id === primary.id }))
}

/* ------------------------------ live broadcasting ------------------------------ */
export function broadcastLive(): void {
  live.on('change', (state: LiveState) => {
    send(wins.output, 'live:state', state)
    send(wins.stage, 'live:state', state)
    send(wins.operator, 'live:state', state)
  })
  live.on('progress', (p: LiveState['videoProgress']) => {
    send(wins.operator, 'live:progress', p)
    send(wins.stage, 'live:progress', p)
  })
}

/** a command from a phone, the stage display or the projector (video ended): the operator page carries it out */
export function forwardCommand(cmd: RemoteCommand | VideoEndedCommand): void {
  send(wins.operator, 'remote:command', cmd)
}
