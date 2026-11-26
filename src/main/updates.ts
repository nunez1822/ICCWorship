/**
 * Updates (Settings → About → Updates). Off by default: the app is offline-first.
 *
 * - Checking: once a day when turned on (or "Check now"). Nothing about the church or the computer is sent.
 * - The INSTALLED app (NSIS) can also update itself, like VS Code or Slack: with "Download and install updates" on,
 *   electron-updater downloads the new installer from this project's GitHub release (checked against the SHA-512 in
 *   the release's latest.yml) and installs it when ICCWorship closes with nothing on screen, or on "Restart now".
 *   Nothing starts while a service may be running, and a download running when one starts is cancelled (see
 *   @shared/updatePolicy). Turning either setting off cancels a download and keeps a downloaded one from installing.
 * - The PORTABLE exe and development runs can't replace themselves: they only check (GitHub's releases API) and link
 *   to the release page.
 */
import { app, net } from 'electron'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { autoUpdater, type AppUpdater } from 'electron-updater'
import { isNewerVersion } from '@shared/version'
import { loggableError } from '@shared/loggableError'
import { automaticCheckDue, installNow, installOnQuit, isLive, mayDownload, onScreen, type UpdatePhase } from '@shared/updatePolicy'
import { notify } from './appState'
import { getSettings, setSettings } from './db'
import { live } from './live'
import { log } from './log'

const API = 'https://api.github.com/repos/nunez1822/ICCWorship/releases/latest'
export const RELEASES_URL = 'https://github.com/nunez1822/ICCWorship/releases/'

export type UpdateResult =
  | { ok: true; latest: string; newer: boolean; url: string; selfUpdate: boolean; deferred?: 'live' }
  | { ok: false; error: string }
  | { ok: false; skipped: true }

const liveNow = () => isLive(live.state)
/** both settings: "Check for new versions" and, under it, "Download and install" */
const autoUpdateOn = () => {
  const s = getSettings()
  return !!s.checkForUpdates && s.autoUpdate !== false
}

const UPDATER_CODE = /\bERR_[A-Z_]{1,60}\b/
/** a short, safe code for the log and the UI: an HTTP error's message can carry the whole web page it got */
function updateError(e: unknown): string {
  if (e instanceof Error && e.name === 'TimeoutError') return 'timeout'
  const status = (e as { statusCode?: unknown } | null)?.statusCode
  if (typeof status === 'number') return `http-${status}`
  const code = (e as { code?: unknown } | null)?.code
  if (typeof code === 'string' && UPDATER_CODE.test(code)) return code // electron-updater's ERR_UPDATER_… codes
  return loggableError(e)
}
/** the first line of an updater message, without the URLs it names (CLAUDE.md: no request URLs in the log) */
const firstLine = (m: unknown) =>
  String(m)
    .split(/\r?\n/)[0]
    .replace(/https?:\/\/\S+/g, '<url>')
    .slice(0, 120)

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

/** a check or download we are awaiting (its failure is logged there, not again by the 'error' event) */
let awaiting = 0

/* A download can be cancelled (a service starts, or the volunteer turns updates off). electron-updater takes a
 * CancellationToken from its own copy of builder-util-runtime (it checks `instanceof CancellationError`), so load it
 * from there rather than adding a dependency that could drift to another version. */
type Token = { cancel(): void; readonly cancelled: boolean }
function newToken(): Token | undefined {
  try {
    const req = createRequire(require.resolve('electron-updater'))
    const { CancellationToken } = req('builder-util-runtime') as { CancellationToken: new () => Token }
    return new CancellationToken()
  } catch {
    return undefined // the download then simply can't be cancelled
  }
}
let download: { token: Token | undefined; why?: string } | null = null

function cancelDownload(why: string): void {
  if (phase.phase !== 'downloading' || !download?.token || download.token.cancelled) return
  download.why = why
  download.token.cancel()
}

let updater: AppUpdater | null = null
// electron-updater creates its updater on first use (autoUpdater is a lazy getter): only the installed app does
async function getUpdater(): Promise<AppUpdater> {
  if (updater) return updater
  autoUpdater.autoDownload = false // we decide when (never while live)
  // must be true when the download finishes (that is when electron-updater arms its quit handler); beforeQuit()
  // decides at quit time whether it really installs
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.disableWebInstaller = true // we only ship full installers
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
    // error texts carry URLs and stacks: keep only electron-updater's ERR_… code
    error: (m: unknown) => log.warn('updater error:', m instanceof Error ? updateError(m) : UPDATER_CODE.exec(String(m))?.[0] || 'error')
  }
  // its built-in 'error' listener logs the whole stack (with the feed URL). A failed check or download we await is
  // logged there; the rest (e.g. starting the installer at quit) here
  autoUpdater.removeAllListeners('error')
  autoUpdater.on('error', (e) => {
    if (!awaiting) log.warn('updater error:', updateError(e))
  })
  // a service started while downloading: stop (the next check starts it again)
  live.on('change', () => {
    if (phase.phase === 'downloading' && liveNow()) cancelDownload('something went live')
  })
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

/** start downloading a found update if allowed; 'live' when it waits because a service may be running */
function startDownload(u: AppUpdater, version: string): 'live' | undefined {
  // "Download and install" sits under "Check for new versions": both must be on (a manual check with checks off
  // only reports)
  const may = { selfUpdate: true, autoUpdate: autoUpdateOn(), live: liveNow(), phase }
  if (!mayDownload(may)) return mayDownload({ ...may, live: false }) ? 'live' : undefined
  phase = { phase: 'downloading', version, percent: 0 }
  log.info(`downloading update ${version}`)
  const d: NonNullable<typeof download> = { token: newToken() }
  download = d
  awaiting++
  u.downloadUpdate(d.token as never)
    .catch((e) => {
      if (d.why) {
        phase = { phase: 'idle' }
        log.info(`update download stopped: ${d.why}`)
      } else {
        phase = { phase: 'failed', version }
        log.warn('update download failed:', updateError(e))
      }
    })
    .finally(() => {
      awaiting--
      if (download === d) download = null
    })
  return undefined
}

/** a setting changed: turning updates off stops a download (and beforeQuit keeps a downloaded one from installing) */
export function updateSettingsChanged(): void {
  if (!autoUpdateOn()) cancelDownload('updates turned off')
}

/** ICCWorship is closing: install the downloaded update only if still wanted and nothing is on screen */
export function beforeQuit(): void {
  if (!updater || TEST_FEED) return
  const install = installOnQuit({ allowed: autoUpdateOn(), onScreen: onScreen(live.state), phase })
  updater.autoInstallOnAppQuit = install
  if (phase.phase === 'ready' && !install) log.info(`update ${phase.version} not installed at this quit (turned off or something on screen)`)
}

export async function checkForUpdates(opts: { manual: boolean }): Promise<UpdateResult> {
  const s = getSettings()
  if (!opts.manual && !automaticCheckDue({ enabled: !!s.checkForUpdates, lastCheck: s.lastUpdateCheck, now: Date.now(), live: liveNow() }))
    return { ok: false, skipped: true }
  awaiting++
  try {
    const r = canSelfUpdate() ? await checkWithUpdater() : await checkWithApi()
    setSettings({ lastUpdateCheck: Date.now() })
    log.info('update check:', r.latest ? `latest ${r.latest}${r.newer ? ' (newer)' : ''}` : 'no release found')
    return r
  } catch (e) {
    const error = updateError(e)
    log.info('update check failed:', error)
    return { ok: false, error }
  } finally {
    awaiting--
  }
}

async function checkWithUpdater(): Promise<Extract<UpdateResult, { ok: true }>> {
  const u = await getUpdater()
  const r = await u.checkForUpdates()
  const latest = r?.updateInfo.version || ''
  const newer = !!latest && isNewerVersion(latest, app.getVersion())
  const deferred = newer ? startDownload(u, latest) : undefined
  return { ok: true, latest, newer, url: latest ? `${RELEASES_URL}tag/v${latest}` : RELEASES_URL, selfUpdate: true, deferred }
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
