import { connect } from 'node:net'
import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { hostname, networkInterfaces } from 'node:os'
import { WebSocketServer, WebSocket } from 'ws'
import QRCode from 'qrcode'
import type { LiveState, RemoteCommand } from '@shared/types'
import { isAllowedHost, isSameOrigin, parseRange, pickPublicState, validateCommand } from '@shared/security'
import { live } from './live'
import { getSettings } from './db'
import { PinGuard } from './pinGuard'
import { log } from './log'

/**
 * Local network server for the stage display and phone remote.
 *   /stage        – stage display for musicians/preacher (read only, PIN required)
 *   /remote       – phone remote (PIN required)
 *   /ws           – live state over WebSocket (PIN required for both roles)
 *   /file/<token> – the slide images currently on screen (opaque tokens, never file paths)
 * Runs only on the church's local network; nothing is sent to the internet.
 *
 * Anyone on the church Wi-Fi can reach this server, and so can any web page a phone on that Wi-Fi opens.
 * So: only our own host names are answered (DNS rebinding), browsers must come from our own pages (Origin),
 * every input is validated, and nothing a request sends may crash the main process.
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
}

let server: Server | null = null
let wss: WebSocketServer | null = null
let rendererDir = ''
let devUrl: string | undefined
let onCommand: (cmd: RemoteCommand) => void = () => {}
const allowedFiles = new Set<string>()
/** stable opaque token per file path, for the life of the process (so <img src> doesn't change every update) */
const tokenOf = new Map<string, string>()
const pathOf = new Map<string, string>()
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])
const fileKey = (p: string) => normalize(p).toLowerCase()

function fileUrl(path: string): string {
  const key = fileKey(path)
  let tok = tokenOf.get(key)
  if (!tok) {
    tok = randomBytes(16).toString('hex')
    tokenOf.set(key, tok)
    pathOf.set(tok, path)
  }
  return `/file/${tok}`
}

/** a slide's media:// url → the URL a phone may fetch (images only), or undefined */
function publicMediaUrl(u?: string): string | undefined {
  const p = mediaUrlToPath(u)
  return p && IMAGE_EXT.has(extname(p).toLowerCase()) ? fileUrl(p) : undefined
}

export function setCommandHandler(fn: (cmd: RemoteCommand) => void): void {
  onCommand = fn
}

/** media:// urls → local paths that stage clients may fetch: only the slide images of what is on screen */
function refreshAllowList(state: LiveState): void {
  allowedFiles.clear()
  const add = (s?: LiveState['slides'][number]) => {
    const p = s?.kind === 'image' ? mediaUrlToPath(s.media) : null
    if (p) allowedFiles.add(fileKey(p))
  }
  // Cleared screen (Esc): the slides stay in the state so the operator can resume, but they
  // are not on screen, so phones must not be able to fetch them — except the one slide the
  // stage display previews as "Next" (the one Space puts back).
  if (state.slideIndex >= 0) state.slides.forEach(add)
  else if (state.clearedFrom !== undefined) add(state.slides[state.clearedFrom])
}

export function toMediaUrl(path: string): string {
  return 'media://local/' + encodeURIComponent(path)
}

export function mediaUrlToPath(u?: string): string | null {
  if (!u || !u.startsWith('media://local/')) return null
  try {
    return decodeURIComponent(u.slice('media://local/'.length))
  } catch {
    return null
  }
}

export function lanAddresses(): string[] {
  const out: string[] = []
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address)
    }
  }
  return out
}

/** our pages may not be framed by other sites (clickjacking the remote's buttons) */
const PAGE_HEADERS = { 'Content-Security-Policy': "frame-ancestors 'none'", 'X-Frame-Options': 'DENY' }
/** a slide image is shown as an image, never run as a page (an SVG could otherwise script our origin) */
const FILE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox"
}

function send(res: ServerResponse, code: number, body: string, type = 'text/plain; charset=utf-8', extra: Record<string, string> = {}): void {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extra })
  res.end(body)
}

function serveFile(req: IncomingMessage, res: ServerResponse, file: string, extra: Record<string, string> = {}): void {
  // Nothing a phone sends may crash the main process: a vanished or locked file, or a bad Range, is an answer.
  try {
    const st = statSync(file, { throwIfNoEntry: false })
    if (!st?.isFile()) return send(res, 404, 'Not found')
    const size = st.size
    const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream'
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', ...extra }
    const range = parseRange(req.headers.range, size)
    if (range.kind === 'unsatisfiable') return send(res, 416, 'Range not satisfiable', 'text/plain; charset=utf-8', { 'Content-Range': `bytes */${size}` })
    const stream = range.kind === 'partial' ? createReadStream(file, { start: range.start, end: range.end }) : createReadStream(file)
    stream.on('error', () => res.destroy())
    if (range.kind === 'partial') {
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Content-Length': range.end - range.start + 1 })
    } else res.writeHead(200, { ...head, 'Content-Length': size })
    stream.pipe(res)
  } catch (e) {
    log.warn('LAN file request failed', e)
    if (!res.headersSent) send(res, 500, 'Error')
    else res.destroy()
  }
}

function proxyToDev(req: IncomingMessage, res: ServerResponse, path: string, extra: Record<string, string> = {}): void {
  // Build the URL by concatenation: new URL('//evil.example/x', devUrl) would point at another host (request forgery)
  const base = new URL(devUrl!)
  const target = new URL(base.origin + (path.startsWith('/') ? path : `/${path}`))
  if (target.origin !== base.origin) return send(res, 400, 'Bad request')
  const p = request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
    res.writeHead(r.statusCode || 500, { ...r.headers, ...extra })
    r.pipe(res)
  })
  p.on('error', () => send(res, 502, 'Dev server not reachable'))
  req.pipe(p)
}

/** the stage/remote pages' icon (same as in remote.html / stage.html) */
const FAVICON =
  '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22%3E%3Crect width=%22100%22 height=%22100%22 rx=%2222%22 fill=%22%23f6b93b%22/%3E%3Cpath d=%22M44 14h12v24h22v12H56v38H44V50H22V38h22z%22 fill=%22%230b1324%22/%3E%3C/svg%3E" />'

/** The church name is user text — never put it into HTML unescaped (phones load this page). */
function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Is this request for us, from one of our own pages? (blocks DNS rebinding and other websites) */
function trusted(req: IncomingMessage): boolean {
  return isAllowedHost(req.headers.host, hostname()) && isSameOrigin(req.headers.origin, req.headers.host)
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  if (!trusted(req)) {
    log.warn('LAN request with a foreign host or origin rejected')
    return send(res, 403, 'Forbidden')
  }
  let url: URL
  try {
    url = new URL(req.url || '/', 'http://x')
  } catch {
    return send(res, 400, 'Bad request')
  }
  let path = url.pathname
  if (path.startsWith('/file/')) {
    const p = pathOf.get(path.slice('/file/'.length))
    if (!p || !allowedFiles.has(fileKey(p))) return send(res, 403, 'Forbidden')
    return serveFile(req, res, p, FILE_HEADERS)
  }
  // phones ask for /favicon.ico on every page: answer "nothing here" instead of a 404 error
  if (path === '/favicon.ico') {
    res.writeHead(204).end()
    return
  }
  if (path === '/' || path === '') {
    const s = getSettings()
    return send(
      res,
      200,
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>ICCWorship</title>${FAVICON}
<style>body{font-family:system-ui;background:#0b1324;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}a{display:block;margin:12px;padding:18px 28px;border-radius:14px;background:#1d3557;color:#fff;text-decoration:none;font-size:20px;text-align:center}</style>
<div><h1 style="text-align:center">${escapeHtml(s.churchName || 'ICCWorship')}</h1><a href="/remote">📱 Remote / Control remoto</a><a href="/stage">🎤 Stage / Escenario</a></div>`,
      'text/html; charset=utf-8',
      PAGE_HEADERS
    )
  }
  if (path === '/stage' || path === '/remote') path = `${path}.html`
  const page = path === '/stage.html' || path === '/remote.html' ? PAGE_HEADERS : {}
  if (devUrl) {
    // development only: the Vite dev server also needs its own /@vite, /src… paths — but never the operator pages
    if (/^\/(index\.html|output\.html|operator\/)/.test(path)) return send(res, 404, 'Not found')
    return proxyToDev(req, res, path + url.search, page)
  }
  const file = resolve(join(rendererDir, normalize(path)))
  if (!file.startsWith(resolve(rendererDir))) return send(res, 403, 'Forbidden')
  // only expose the stage/remote pages and their assets, never the operator page
  if (!/^\/(stage\.html|remote\.html|assets\/)/.test(path)) return send(res, 404, 'Not found')
  serveFile(req, res, file, page)
}

// PIN guessing protection (lockout after repeated wrong PINs) — see pinGuard.ts
const pins = new PinGuard()

/** sockets that passed the PIN check (stage needs none) — only they receive live data */
const authedSockets = new WeakSet<WebSocket>()
/** sockets that answered the last protocol ping */
const aliveSockets = new WeakSet<WebSocket>()
const HEARTBEAT_MS = 5000

function broadcast(msg: unknown): void {
  if (!wss) return
  const data = JSON.stringify(msg)
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN && authedSockets.has(c)) c.send(data)
}

/**
 * Heartbeat both ways. Browsers can't see protocol pings, so phones also get a small
 * app-level "ping" message: if they hear nothing for a while they know the Wi-Fi dropped
 * (a dead network doesn't close the socket by itself) and reconnect. Here, sockets that
 * stop answering protocol pings are dropped so the 📱 count stays honest.
 */
function heartbeat(): void {
  if (!wss) return
  for (const c of wss.clients) {
    if (!aliveSockets.has(c)) {
      c.terminate()
      continue
    }
    aliveSockets.delete(c)
    try {
      c.ping()
    } catch {
      /* closing */
    }
  }
  broadcast({ type: 'ping', t: Date.now() })
}

/** only what the stage and remote pages read — never local paths (see pickPublicState) */
const publicState = (state: LiveState) => pickPublicState(state, publicMediaUrl)

/** Constant-time PIN check. An empty PIN never matches: that would let anyone in. */
function pinMatches(given: string): boolean {
  const expected = getSettings().remotePin
  if (!expected || !given) return false
  const h = (v: string) => createHash('sha256').update(v).digest()
  return timingSafeEqual(h(given), h(expected))
}

const MAX_CLIENTS = 32
const MAX_PAYLOAD = 64 * 1024

live.on('change', (state: LiveState) => {
  refreshAllowList(state)
  broadcast({ type: 'state', state: publicState(state) })
})
live.on('progress', (p) => broadcast({ type: 'progress', progress: p }))

/**
 * Is something else already answering on this port (IPv4 or IPv6)? Windows lets two
 * programs listen on the same port when one uses IPv6 ([::]) and the other IPv4
 * (0.0.0.0), so listen() succeeds and phones silently reach the wrong program.
 */
function portAnswers(port: number): Promise<boolean> {
  const probe = (host: string) =>
    new Promise<boolean>((res) => {
      const sock = connect({ host, port })
      const finish = (v: boolean) => {
        sock.destroy()
        res(v)
      }
      sock.setTimeout(400, () => finish(false))
      sock.once('connect', () => finish(true))
      sock.once('error', () => finish(false))
    })
  return Promise.all([probe('127.0.0.1'), probe('::1')]).then((r) => r.some(Boolean))
}

/**
 * Starts run one at a time (the settings port field restarts on every keystroke). Each
 * start gets a generation number; a start that a newer start or a stop has replaced gives
 * up instead of creating a second server that nothing would ever close.
 */
let gen = 0
let serverOp: Promise<unknown> = Promise.resolve()
type StartResult = { ok: boolean; error?: string }

export function startServer(opts: { rendererDir: string; devUrl?: string }): Promise<StartResult> {
  const my = ++gen
  const run = serverOp.then(() => doStart(opts, my))
  serverOp = run.catch(() => undefined)
  return run
}

async function doStart(opts: { rendererDir: string; devUrl?: string }, my: number): Promise<StartResult> {
  const superseded: StartResult = { ok: false, error: 'superseded' }
  if (my !== gen) return superseded
  rendererDir = opts.rendererDir
  devUrl = opts.devUrl
  teardown()
  await closing // our own previous server must be fully closed before probing the port
  if (my !== gen) return superseded
  const settings = getSettings()
  if (settings.serverEnabled && (await portAnswers(settings.serverPort))) return { ok: false, error: 'EADDRINUSE' }
  if (my !== gen) return superseded
  return new Promise((done) => {
    const s = getSettings()
    if (!s.serverEnabled) return done({ ok: false, error: 'disabled' })
    server = createServer(handle)
    wss = new WebSocketServer({
      server,
      path: '/ws',
      maxPayload: MAX_PAYLOAD,
      verifyClient: ({ req }: { req: IncomingMessage }) => {
        const ok = trusted(req)
        if (!ok) log.warn('LAN WebSocket with a foreign host or origin rejected')
        return ok
      }
    })
    // Without these listeners a bad frame (invalid UTF-8, too large) or a listen error would be an uncaught
    // exception in the main process — i.e. anyone on the Wi-Fi could stop the projector.
    wss.on('error', (e) => log.warn('LAN WebSocket server error', e))
    const hb = setInterval(heartbeat, HEARTBEAT_MS)
    wss.on('close', () => clearInterval(hb))
    wss.on('connection', (ws, req) => {
      ws.on('error', () => ws.terminate())
      aliveSockets.add(ws)
      ws.on('pong', () => aliveSockets.add(ws))
      let u: URL
      try {
        u = new URL(req.url || '/', 'http://x')
      } catch {
        ws.terminate()
        return
      }
      const role = u.searchParams.get('role') === 'remote' ? 'remote' : 'stage'
      const pin = u.searchParams.get('pin') || ''
      const ip = req.socket.remoteAddress || '?'
      // the stage display shows notes and the service plan: it needs the PIN too (it used to be open)
      const lock = pins.lockedFor(ip)
      let authed = lock === 0 && pinMatches(pin)
      if (authed) pins.succeed(ip)
      else if (lock === 0) pins.fail(ip)
      let authedCount = 0
      wss?.clients.forEach((c) => authedSockets.has(c) && authedCount++)
      const full = authed && authedCount >= MAX_CLIENTS
      if (full) authed = false
      if (!authed) log.info(`LAN ${role} connection refused (${full ? 'too many devices' : lock ? 'locked out' : 'wrong PIN'}) from ${ip}`)
      else log.info(`LAN ${role} connected from ${ip}`)
      ws.send(
        JSON.stringify({
          type: 'hello',
          role,
          authed,
          full,
          locked: !authed ? Math.ceil(pins.lockedFor(ip) / 1000) : 0,
          uiLang: getSettings().uiLang
        })
      )
      if (!authed) {
        setTimeout(() => ws.close(), 200)
        return
      }
      authedSockets.add(ws)
      ws.send(JSON.stringify({ type: 'state', state: publicState(live.state) }))
      ws.on('message', (raw) => {
        if (role !== 'remote') return
        let msg: { type?: unknown; cmd?: unknown }
        try {
          msg = JSON.parse(String(raw))
        } catch {
          return
        }
        const cmd = msg?.type === 'command' ? validateCommand(msg.cmd) : null
        if (cmd) onCommand(cmd)
        else log.warn('LAN remote sent an invalid command, ignored')
      })
    })
    server.once('error', (e: NodeJS.ErrnoException) => {
      wss?.close() // its 'close' handler stops the heartbeat
      wss = null
      server = null
      done({ ok: false, error: e.code || String(e) })
    })
    server.listen(s.serverPort, '0.0.0.0', () => done({ ok: true }))
  })
}

let closing: Promise<void> = Promise.resolve()
/** stop the server and cancel any start still in progress */
export function stopServer(): void {
  gen++
  teardown()
}

function teardown(): void {
  wss?.clients.forEach((c) => c.terminate())
  wss?.close()
  const srv = server
  if (srv) {
    closing = new Promise((r) => srv.close(() => r()))
    srv.closeAllConnections?.() // keep-alive sockets would otherwise hold close() open
  }
  wss = null
  server = null
}

export async function serverInfo(): Promise<{ running: boolean; port: number; pin: string; urls: string[]; qr?: string; stageQr?: string; clients: number }> {
  const s = getSettings()
  const urls = lanAddresses().map((ip) => `http://${ip}:${s.serverPort}`)
  const first = urls[0]
  return {
    running: !!server?.listening,
    port: s.serverPort,
    pin: s.remotePin,
    urls,
    // the PIN rides in the #fragment, which browsers never send to the server
    qr: first ? await QRCode.toDataURL(`${first}/remote#pin=${s.remotePin}`, { margin: 1, width: 240 }) : undefined,
    stageQr: first ? await QRCode.toDataURL(`${first}/stage#pin=${s.remotePin}`, { margin: 1, width: 240 }) : undefined,
    clients: wss?.clients.size || 0
  }
}
