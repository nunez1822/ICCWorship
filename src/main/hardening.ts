/**
 * Electron hardening for every web page the app creates: no navigation, no webviews, no new windows, and only
 * the permissions our own pages need.
 */
import { app, session, shell } from 'electron'
import { permissionAllowed } from '@shared/security'
import { log } from './log'
import { isTrustedSender } from './pages'

export function hardenWebContents(): void {
  app.on('web-contents-created', (_e, wc) => {
    // The app's pages never navigate. Without this, a file dropped outside a drop zone would replace the
    // operator or projector page with that file.
    // Reloading the same page stays allowed (the "Reload window" button, location.reload()).
    wc.on('will-navigate', (ev, url) => {
      const page = (u: string) => u.split('#')[0]
      if (page(url) !== page(wc.getURL())) ev.preventDefault()
    })
    wc.on('will-attach-webview', (ev) => ev.preventDefault())
    // Links open in the user's browser, and only web links.
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
  })
  // Choosing the sound output (Settings → Screens) needs to list the outputs by name: allowed only as a check, only
  // for our own pages. A request (getUserMedia — microphone, camera) is always refused. See permissionAllowed.
  const seen = new Set<string>()
  const devLog = (kind: string, permission: string, mediaType?: string) => {
    const key = `${kind}:${permission}:${mediaType || ''}`
    if (app.isPackaged || seen.has(key)) return
    seen.add(key)
    log.info(`permission ${kind}: ${permission}${mediaType ? ` (${mediaType})` : ''}`)
  }
  session.defaultSession.setPermissionRequestHandler((wc, permission, done, details) => {
    const mediaType = (details as { mediaTypes?: string[] }).mediaTypes?.join(',')
    devLog('request', permission, mediaType)
    done(permissionAllowed(permission, { check: false, trusted: isTrustedSender(wc?.mainFrame) }))
  })
  session.defaultSession.setPermissionCheckHandler((wc, permission, _origin, details) => {
    devLog('check', permission, details.mediaType)
    return permissionAllowed(permission, { check: true, trusted: isTrustedSender(wc?.mainFrame), mediaType: details.mediaType })
  })
}
