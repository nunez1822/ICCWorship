/** Serves app://iccworship/ from the built pages folder (see appUrl.ts for why). */
import { protocol } from 'electron'
import { createReadStream, statSync, type Stats } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { APP_SCHEME, APP_TYPES, appFile } from './appUrl'
import { rendererDir } from './env'

/** Must run before the app is ready (with every other privileged scheme: Electron allows one call). */
export const appSchemePrivileges: Electron.CustomScheme = {
  scheme: APP_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true }
}

export function registerAppProtocol(): void {
  protocol.handle(APP_SCHEME, (req) => {
    const notFound = () => new Response('Not found', { status: 404 })
    const file = appFile(req.url, rendererDir)
    if (!file) return notFound()
    let st: Stats | undefined
    try {
      st = statSync(file, { throwIfNoEntry: false })
    } catch {
      return notFound()
    }
    if (!st?.isFile()) return notFound()
    const type = APP_TYPES[extname(file).toLowerCase()]
    const stream = Readable.toWeb(createReadStream(file)) as ReadableStream
    // nosniff: a file is only ever run as the type it is; no-store: a new version is never mixed with a cached old one
    return new Response(stream, { status: 200, headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' } })
  })
}
