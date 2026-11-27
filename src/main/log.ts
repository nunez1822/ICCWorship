/**
 * A small file logger (no dependency). Logs live in the profile's logs folder (%APPDATA%\ICCWorship\logs\main.log;
 * the portable exe: ICCWorship Data\.app\logs; test runs: <ICCWORSHIP_DATA>\.userdata\logs), rotate at 1 MB and keep
 * 5 old files. They exist so a church can attach them to a bug report, so they must never hold private data:
 *
 *   LOG ONLY ids, counts, collection names, error codes and short messages. NEVER log song text, people,
 *   prayer requests, request URLs (the PIN travels in one) or any payload.
 *
 * As a second line of defence every line passes through redact(): the data folder becomes <data>, the user's
 * home folder %USERPROFILE%, and lines are cut to 300 characters.
 */
import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { loggableError } from '@shared/loggableError'
import { LogRepeats, type LogLine } from '@shared/logRepeats'

type Level = 'debug' | 'info' | 'warn' | 'error'
const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }
const MAX_BYTES = 1024 * 1024
const KEEP = 5
const MAX_LINE = 300

let file: string | null = null
let dataRoot = ''
const minLevel: Level = process.env.ICCWORSHIP_LOG === 'debug' ? 'debug' : 'info'

/** Tell the logger where the church's data lives, so paths inside it are shortened to <data>. */
export function setLogDataRoot(root: string): void {
  dataRoot = root
}

/** The log folder (resolved lazily: bootstrap.ts may move userData first). */
export function logDir(): string {
  return app.getPath('logs')
}

function target(): string {
  if (!file) {
    const dir = logDir()
    mkdirSync(dir, { recursive: true })
    file = join(dir, 'main.log')
  }
  return file
}

const BACKSLASH = String.fromCharCode(92)
/** Windows paths are compared with forward slashes, so both spellings of a path match. */
const slashes = (s: string) => s.split(BACKSLASH).join('/')

/** Replaces every occurrence of `needle` in `hay`, ignoring letter case (paths on Windows are case-insensitive). */
function replaceAllCI(hay: string, needle: string, label: string): string {
  if (!needle) return hay
  const lowHay = hay.toLowerCase()
  const lowNeedle = needle.toLowerCase()
  let out = ''
  let from = 0
  for (let i = lowHay.indexOf(lowNeedle); i >= 0; i = lowHay.indexOf(lowNeedle, from)) {
    out += hay.slice(from, i) + label
    from = i + needle.length
  }
  return out + hay.slice(from)
}

/** Removes things that identify the church or the person from a log line. Exported for tests. */
export function redact(text: string, roots: { data?: string; home?: string } = { data: dataRoot, home: homedir() }): string {
  // paths are written with forward slashes in the log, so data and home folders match in either spelling
  let t = slashes(text)
  for (const [root, label] of [
    [roots.data, '<data>'],
    [roots.home, '%USERPROFILE%']
  ] as const) {
    if (root) t = replaceAllCI(t, slashes(root).replace(/\/+$/, ''), label)
  }
  t = t.replace(/[\r\n]+/g, ' ')
  return t.length > MAX_LINE ? t.slice(0, MAX_LINE) + '…' : t
}

function rotate(f: string): void {
  try {
    if (!existsSync(f) || statSync(f).size < MAX_BYTES) return
    rmSync(`${f}.${KEEP}`, { force: true })
    for (let i = KEEP - 1; i >= 1; i--) if (existsSync(`${f}.${i}`)) renameSync(`${f}.${i}`, `${f}.${i + 1}`)
    renameSync(f, `${f}.1`)
  } catch {
    /* a locked log file must never break the app */
  }
}

// the same line repeated in a burst (a render loop, a flapping network) is written once with a count (LogRepeats)
const repeats = new LogRepeats()
let repeatTimer: ReturnType<typeof setTimeout> | undefined
let burst = 0
let burstStart = 0

function append(lines: LogLine[]): void {
  if (!lines.length) return
  try {
    const f = target()
    rotate(f)
    appendFileSync(f, lines.map((l) => `${new Date(l.at).toISOString()} [${l.level}] ${l.text}`).join('\n') + '\n')
  } catch {
    /* never let logging break the app */
  }
}

/** a repeat run that went quiet (or the app is exiting): write its count now */
function flushRepeats(): void {
  clearTimeout(repeatTimer)
  repeatTimer = undefined
  const line = repeats.flush()
  if (line) append([line])
}
process.on('exit', flushRepeats)

function write(level: Level, parts: unknown[]): void {
  if (ORDER[level] < ORDER[minLevel]) return
  const msg = redact(
    parts
      .map((p) =>
        p instanceof Error
          ? loggableError(p) // never the raw message: it can hold file names, command lines or quoted file text
          : typeof p === 'string'
            ? p
            : safeJson(p)
      )
      .join(' ')
  )
  const now = Date.now()
  // rate limit: at most 200 lines a minute (a repeat of the last line costs nothing)
  if (now - burstStart > 60_000) {
    burstStart = now
    burst = 0
  }
  const lines = repeats.next(level, msg, now)
  if (!lines.length) {
    // repeating: the count is written when the run ends, or once it has been quiet for 10 s
    clearTimeout(repeatTimer)
    repeatTimer = setTimeout(flushRepeats, 10_000)
    repeatTimer.unref?.()
    return
  }
  clearTimeout(repeatTimer)
  repeatTimer = undefined
  if (++burst > 200) return
  append(lines)
  if (!app.isPackaged) (level === 'error' ? console.error : console.log)(`[${level}]`, msg)
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

export const log = {
  debug: (...p: unknown[]) => write('debug', p),
  info: (...p: unknown[]) => write('info', p),
  warn: (...p: unknown[]) => write('warn', p),
  error: (...p: unknown[]) => write('error', p)
}
