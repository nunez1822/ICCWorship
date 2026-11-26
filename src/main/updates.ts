/**
 * Updates (Settings → About → Updates). Off by default: the app is offline-first.
 *
 * - Checking: once a day when turned on (or "Check now"). Nothing about the church or the computer is sent.
 * - The INSTALLED app (NSIS) can also update itself, like VS Code or Slack: with "Download and install updates" on,
 *   electron-updater downloads the new installer from this project's GitHub release (checked against the SHA-512 in
 *   the release's latest.yml) and installs it when ICCWorship closes, or on "Restart now". Never while something is
 *   on screen (see @shared/updatePolicy).
 * - The PORTABLE exe and development runs can't replace themselves: they only check (GitHub's releases API) and link
 *   to the release page.
 */
import { app, net } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { autoUpdater, type AppUpdater } from 'electron-updater'
import { isNewerVersion } from '@shared/version'
import { loggableError } from '@shared/loggableError'
import { automaticCheckDue, installNow, isLive, mayDownload, type UpdatePhase } from '@shared/updatePolicy'
import { notify } from './appState'
import { getSettings, setSettings } from './db'
import { live } from './live'
import { log } from './log'

const API = 'https://api.github.com/repos/nunez1822/ICCWorship/releases/latest'
export const RELEASES_URL = 'https://github.com/nunez1822/ICCWorship/releases/'

export type UpdateResult =
  | { ok: true; latest: string; newer: boolean; url: string; selfUpdate: boolean }
  | { ok: false; error: string }
  | { ok: false; skipped: true }

const liveNow = () => isLive(live.state)

/** a short, safe code for the log and the UI: an HTTP error's message can carry the whole web page it got */
function updateError(e: unknown): string {
  if (e instanceof Error && e.name === 'TimeoutError') return 'timeout'
  const status = (e as { statusCode?: unknown } | null)?.statusCode
  if (typeof status === 'number') return `http-${status}`
  return loggableError(e)
}
const firstLine = (m: unknown) => String(m).split(/\r?\n/)[0].slice(0, 120)

// Test hook (smoke.mjs; ignored by a packaged app, like every development switch): an update feed on this computer, so
// the check → download → SHA-512 check → "ready" path runs for real. Nothing is ever installed from it.
const TEST_FEED = app.isPackaged ? undefined : process.env.ICCWORSHIP_TEST_UPDATE_CONFIG || undefined

/** The installed app can update itself; the portable exe and developer runs can only check. */
export function canSelfUpdate(): boolean {
  if (TEST_FEED) return true
  return app.isPackaged && !process.env.PORTABLE_EXECUTABLE_DIR && existsSync(join(process.resourcesPath, 'app-update.yml'))
}

let phase: UpdatePhase = { phase: 'idle' }
export const updatePhase = (): UpdatePhase => phase

let updater: AppUpdater | null = null
// electron-updater creates its updater on first use (autoUpdater is a lazy getter): only the installed app does
async function getUpdater(): Promise<AppUpdater> {
  if (updater) return updater
  autoUpdater.autoDownload = false // we decide when (never while live)
  autoUpdater.autoInstallOnAppQuit = true // a downloaded update installs when the volunteer closes ICCWorship
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  if (TEST_FEED) {
    autoUpdater.forceDevUpdateConfig = true
    autoUpdater.updateConfigPath = TEST_FEED
    autoUpdater.autoInstallOnAppQuit = false
  }
  // its messages are about GitHub URLs and versions, never church data; keep only warnings and errors
  autoUpdater.logger = {
    info: () => {},
    debug: () => {},
    warn: (m: unknown) => log.warn('updater:', firstLine(m)),
    error: (m: unknown) => log.warn('updater error:', m instanceof Error ? updateError(m) : firstLine(m))
  }
  autoUpdater.on('download-progress', (p) => {
    if (phase.phase === 'downloading') phase = { ...phase, percent: Math.round(p.percent) }
  })
  autoUpdater.on('update-downloaded', (info) => {
    phase = { phase: 'ready', version: info.version }
    log.info(`update ${info.version} downloaded: installs when ICCWorship closes`)
    notify({ type: 'updateReady', version: info.version })
  })
  updater = autoUpdater
  return updater
}

function startDownload(u: AppUpdater, version: string): void {
  const s = getSettings()
  // "Download and install" sits under "Check for new versions": both must be on (a manual check with checks off
  // only reports)
  if (!mayDownload({ selfUpdate: true, autoUpdate: !!s.checkForUpdates && s.autoUpdate !== false, live: liveNow(), phase })) return
  phase = { phase: 'downloading', version, percent: 0 }
  log.info(`downloading update ${version}`)
  u.downloadUpdate().catch((e) => {
    phase = { phase: 'failed', version }
    log.warn('update download failed:', updateError(e))
  })
}

export async function checkForUpdates(opts: { manual: boolean }): Promise<UpdateResult> {
  const s = getSettings()
  if (!opts.manual && !automaticCheckDue({ enabled: !!s.checkForUpdates, lastCheck: s.lastUpdateCheck, now: Date.now(), live: liveNow() }))
    return { ok: false, skipped: true }
  try {
    const r = canSelfUpdate() ? await checkWithUpdater() : await checkWithApi()
    setSettings({ lastUpdateCheck: Date.now() })
    log.info('update check:', r.latest ? `latest ${r.latest}${r.newer ? ' (newer)' : ''}` : 'no release found')
    return r
  } catch (e) {
    const error = updateError(e)
    log.info('update check failed:', error)
    return { ok: false, error }
  }
}

async function checkWithUpdater(): Promise<Extract<UpdateResult, { ok: true }>> {
  const u = await getUpdater()
  const r = await u.checkForUpdates()
  const latest = r?.updateInfo.version || ''
  const newer = !!latest && isNewerVersion(latest, app.getVersion())
  if (newer) startDownload(u, latest)
  return { ok: true, latest, newer, url: latest ? `${RELEASES_URL}tag/v${latest}` : RELEASES_URL, selfUpdate: true }
}

async function checkWithApi(): Promise<Extract<UpdateResult, { ok: true }>> {
  const res = await net.fetch(API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ICCWorship-update-check' },
    signal: AbortSignal.timeout(5000)
  })
  if (!res.ok) throw new Error(`http-${res.status}`)
  const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown }
  const latest = typeof body.tag_name === 'string' ? body.tag_name.replace(/^v/, '') : ''
  // only ever open this project's own release page
  const url = typeof body.html_url === 'string' && body.html_url.startsWith(RELEASES_URL) ? body.html_url : RELEASES_URL
  const newer = !!latest && !body.draft && !body.prerelease && isNewerVersion(latest, app.getVersion())
  return { ok: true, latest, newer, url, selfUpdate: false }
}

/** "Restart now": install the downloaded update (never while something is on screen) */
export function installUpdate(): { ok: boolean; error?: 'live' | 'not-ready' } {
  const decision = installNow({ live: liveNow(), phase })
  if (decision !== 'install' || !updater) return { ok: false, error: decision === 'live' ? 'live' : 'not-ready' }
  log.info(`installing update ${phase.phase === 'ready' ? phase.version : ''} now`)
  if (TEST_FEED) return { ok: true } // a test feed's "installer" is never run
  const u = updater
  // reply first; quitAndInstall closes the app (before-quit saves everything), runs the installer silently and
  // starts the new version
  setTimeout(() => u.quitAndInstall(true, true), 300)
  return { ok: true }
}
