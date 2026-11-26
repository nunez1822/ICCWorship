/**
 * Optional update check (Settings → About → "Check for new versions", OFF by default — the app is offline-first).
 * One HTTPS request to the GitHub Releases API; nothing about the church or computer is sent. It never runs while
 * something is on screen, never downloads or installs anything, and only ever links to this project's releases.
 */
import { app, net } from 'electron'
import { isNewerVersion } from '@shared/version'
import { getSettings, setSettings } from './db'
import { live } from './live'
import { log } from './log'
import { loggableError } from '@shared/loggableError'

const API = 'https://api.github.com/repos/nunez1822/ICCWorship/releases/latest'
export const RELEASES_URL = 'https://github.com/nunez1822/ICCWorship/releases/'
const DAY = 24 * 60 * 60 * 1000

export type UpdateResult = { ok: true; latest: string; newer: boolean; url: string } | { ok: false; error: string } | { ok: false; skipped: true }

const isLive = () => live.state.slideIndex >= 0 || !!live.state.video?.playing

export async function checkForUpdates(opts: { manual: boolean }): Promise<UpdateResult> {
  const s = getSettings()
  if (!opts.manual) {
    if (!s.checkForUpdates) return { ok: false, skipped: true }
    if (s.lastUpdateCheck && Date.now() - s.lastUpdateCheck < DAY) return { ok: false, skipped: true }
    if (isLive()) return { ok: false, skipped: true } // never during a service
  }
  try {
    const res = await net.fetch(API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ICCWorship-update-check' },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) throw new Error(`http-${res.status}`)
    const body = (await res.json()) as { tag_name?: unknown; html_url?: unknown; draft?: unknown; prerelease?: unknown }
    const latest = typeof body.tag_name === 'string' ? body.tag_name.replace(/^v/, '') : ''
    // only ever open this project's own release page
    const url = typeof body.html_url === 'string' && body.html_url.startsWith(RELEASES_URL) ? body.html_url : RELEASES_URL
    setSettings({ lastUpdateCheck: Date.now() })
    const newer = !!latest && !body.draft && !body.prerelease && isNewerVersion(latest, app.getVersion())
    log.info('update check:', latest ? `latest ${latest}${newer ? ' (newer)' : ''}` : 'no release found')
    return { ok: true, latest, newer, url }
  } catch (e) {
    // never the raw message: a captive portal's HTML page makes res.json() throw a SyntaxError that quotes it
    const error = e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : loggableError(e)
    log.info('update check failed:', error)
    return { ok: false, error }
  }
}
