import { createServer, request, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { networkInterfaces } from 'node:os'
import { WebSocketServer, WebSocket } from 'ws'
import QRCode from 'qrcode'
import type { LiveState, RemoteCommand } from '@shared/types'
import { live } from './live'
import { getSettings } from './db'

/**
 * Local network server for the stage display and phone remote.
 *   /stage   – stage display for musicians/preacher (read only)
 *   /remote  – phone remote (requires the 4 digit PIN)
 *   /ws      – live state over WebSocket
 *   /file    – media files currently on screen (allow-listed)
 * Runs only on the church's local network; nothing is sent to the internet.
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

export function setCommandHandler(fn: (cmd: RemoteCommand) => void): void {
  onCommand = fn
}

/** media:// urls → local paths that stage clients may fetch */
function refreshAllowList(state: LiveState): void {
  allowedFiles.clear()
  const add = (u?: string) => {
    const p = mediaUrlToPath(u)
    if (p) allowedFiles.add(normalize(p).toLowerCase())
  }
  state.slides.forEach((s) => add(s.media))
  add(state.background?.value)
  add(state.logoPath ? toMediaUrl(state.logoPath) : undefined)
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

function send(res: ServerResponse, code: number, body: string, type = 'text/plain; charset=utf-8'): void {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' })
  res.end(body)
}

function serveFile(req: IncomingMessage, res: ServerResponse, file: string): void {
  if (!existsSync(file) || !statSync(file).isFile()) return send(res, 404, 'Not found')
  const size = statSync(file).size
  const type = MIME[extname(file).toLowerCase()] || 'application/octet-stream'
  const range = req.headers.range
  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range)
    const start = m && m[1] ? parseInt(m[1], 10) : 0
    const end = m && m[2] ? parseInt(m[2], 10) : size - 1
    res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 })
    createReadStream(file, { start, end }).pipe(res)
    return
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': size, 'Accept-Ranges': 'bytes' })
  createReadStream(file).pipe(res)
}

function proxyToDev(req: IncomingMessage, res: ServerResponse, path: string): void {
  const target = new URL(path, devUrl)
  const p = request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
    res.writeHead(r.statusCode || 500, r.headers)
    r.pipe(res)
  })
  p.on('error', () => send(res, 502, 'Dev server not reachable'))
  req.pipe(p)
}

function handle(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url || '/', 'http://x')
  let path = url.pathname
  if (path === '/file') {
    const p = url.searchParams.get('p') || ''
    if (!allowedFiles.has(normalize(p).toLowerCase())) return send(res, 403, 'Forbidden')
    return serveFile(req, res, p)
  }
  if (path === '/' || path === '') {
    const s = getSettings()
    return send(
      res,
      200,
      `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>ICCWorship</title>
<style>body{font-family:system-ui;background:#0b1324;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}a{display:block;margin:12px;padding:18px 28px;border-radius:14px;background:#1d3557;color:#fff;text-decoration:none;font-size:20px;text-align:center}</style>
<div><h1 style="text-align:center">${s.churchName || 'ICCWorship'}</h1><a href="/remote">📱 Remote / Control remoto</a><a href="/stage">🎤 Stage / Escenario</a></div>`,
      'text/html; charset=utf-8'
    )
  }
  if (path === '/stage' || path === '/remote') path = `${path}.html`
  if (devUrl) return proxyToDev(req, res, path + url.search)
  const file = resolve(join(rendererDir, normalize(path)))
  if (!file.startsWith(resolve(rendererDir))) return send(res, 403, 'Forbidden')
  // only expose the stage/remote pages and their assets, never the operator page
  if (!/^\/(stage\.html|remote\.html|assets\/)/.test(path)) return send(res, 404, 'Not found')
  serveFile(req, res, file)
}

function broadcast(msg: unknown): void {
  if (!wss) return
  const data = JSON.stringify(msg)
  for (const c of wss.clients) if (c.readyState === WebSocket.OPEN) c.send(data)
}

function publicState(state: LiveState): LiveState {
  // translate media:// urls into /file?p= urls the browser can fetch
  const fix = (u?: string) => {
    const p = mediaUrlToPath(u)
    return p ? `/file?p=${encodeURIComponent(p)}` : u
  }
  return {
    ...state,
    slides: state.slides.map((s) => ({ ...s, media: fix(s.media) })),
    background: state.background ? { ...state.background, value: fix(state.background.value) || state.background.value } : null,
    logoPath: state.logoPath ? `/file?p=${encodeURIComponent(state.logoPath)}` : undefined
  }
}

live.on('change', (state: LiveState) => {
  refreshAllowList(state)
  broadcast({ type: 'state', state: publicState(state) })
})
live.on('progress', (p) => broadcast({ type: 'progress', progress: p }))

export function startServer(opts: { rendererDir: string; devUrl?: string }): Promise<{ ok: boolean; error?: string }> {
  rendererDir = opts.rendererDir
  devUrl = opts.devUrl
  return new Promise((done) => {
    stopServer()
    const s = getSettings()
    if (!s.serverEnabled) return done({ ok: false, error: 'disabled' })
    server = createServer(handle)
    wss = new WebSocketServer({ server, path: '/ws' })
    wss.on('connection', (ws, req) => {
      const u = new URL(req.url || '/', 'http://x')
      const role = u.searchParams.get('role') === 'remote' ? 'remote' : 'stage'
      const pin = u.searchParams.get('pin') || ''
      const authed = role === 'stage' || pin === getSettings().remotePin
      ws.send(JSON.stringify({ type: 'hello', role, authed, uiLang: getSettings().uiLang }))
      if (!authed) {
        setTimeout(() => ws.close(), 200)
        return
      }
      ws.send(JSON.stringify({ type: 'state', state: publicState(live.state) }))
      ws.on('message', (raw) => {
        if (role !== 'remote') return
        try {
          const msg = JSON.parse(String(raw)) as { type: string; cmd: RemoteCommand }
          if (msg.type === 'command' && msg.cmd?.type) onCommand(msg.cmd)
        } catch {
          /* ignore */
        }
      })
    })
    server.once('error', (e: NodeJS.ErrnoException) => {
      server = null
      done({ ok: false, error: e.code || String(e) })
    })
    server.listen(s.serverPort, '0.0.0.0', () => done({ ok: true }))
  })
}

export function stopServer(): void {
  wss?.clients.forEach((c) => c.terminate())
  wss?.close()
  server?.close()
  wss = null
  server = null
}

export async function serverInfo(): Promise<{ running: boolean; port: number; pin: string; urls: string[]; qr?: string; clients: number }> {
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
    clients: wss?.clients.size || 0
  }
}
