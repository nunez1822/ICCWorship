/**
 * Pure input checks for everything that crosses a trust boundary: renderer → main (IPC ids, settings) and
 * phone/browser → main (HTTP Range, Host/Origin headers, remote commands, the state we send out).
 * No Node or DOM imports: the renderer bundles this file too, and everything here is unit tested.
 */
import type { BilingualOrder, DisplayLang, Lang, LiveState, PlanSummaryItem, RemoteCommand, Settings, Slide } from './types'

/* ------------------------------ ids that become file names ------------------------------ */

/** An id that is safe to use as a file or folder name: letters, digits, _ and -, 1–64 characters. */
export function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id)
}

/* ------------------------------ HTTP Range ------------------------------ */

export type RangeResult = { kind: 'full' } | { kind: 'partial'; start: number; end: number } | { kind: 'unsatisfiable' }

/**
 * Parses a single-range `Range: bytes=…` header against a file of `size` bytes (RFC 9110 §14.1.2).
 * Anything we don't understand (missing header, other units, several ranges) is served whole, as the RFC allows.
 * A syntactically valid range that doesn't fit the file is "unsatisfiable" (HTTP 416).
 */
export function parseRange(header: string | null | undefined, size: number): RangeResult {
  if (!header || header.length > 200) return { kind: 'full' }
  // Split by hand rather than with one regex: optional spaces around optional digits (\s*(\d*)\s*) backtrack
  // polynomially on a long run of spaces, and this header comes from anyone on the Wi-Fi.
  const eq = header.indexOf('=')
  if (eq < 0 || header.slice(0, eq).trim().toLowerCase() !== 'bytes') return { kind: 'full' }
  const spec = header.slice(eq + 1)
  const dash = spec.indexOf('-')
  if (dash < 0) return { kind: 'full' }
  const first = spec.slice(0, dash).trim()
  const last = spec.slice(dash + 1).trim()
  if (!/^\d*$/.test(first) || !/^\d*$/.test(last) || (first === '' && last === '')) return { kind: 'full' }
  if (size <= 0) return { kind: 'unsatisfiable' }
  if (first === '') {
    // suffix range: the last N bytes
    const n = Number(last)
    if (!Number.isSafeInteger(n) || n <= 0) return { kind: 'unsatisfiable' }
    return { kind: 'partial', start: Math.max(0, size - n), end: size - 1 }
  }
  const start = Number(first)
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1)
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || start > end) return { kind: 'unsatisfiable' }
  return { kind: 'partial', start, end }
}

/* ------------------------------ Host / Origin (DNS rebinding) ------------------------------ */

/** Local-only name suffixes that can't be registered on the public internet (so DNS rebinding can't use them). */
const LOCAL_SUFFIXES = ['.local', '.lan', '.home', '.home.arpa', '.localdomain', '.internal']

/** "host:port" / "[v6]:port" → lower-case host without port. */
function hostOnly(host: string): string {
  const h = host.trim().toLowerCase()
  if (h.startsWith('[')) return h.slice(1, h.indexOf(']') > 0 ? h.indexOf(']') : undefined)
  const i = h.lastIndexOf(':')
  return i > 0 && h.indexOf(':') === i ? h.slice(0, i) : h
}

/**
 * Is this Host header one of ours? A web page on some other site can make a phone's browser talk to
 * http://<this PC>:7272 by pointing its own domain at our IP (DNS rebinding) — but the browser then sends
 * that domain as Host. So we only answer to IP addresses, localhost and this computer's own name.
 */
export function isAllowedHost(host: string | undefined, machineName: string): boolean {
  if (!host) return false
  const h = hostOnly(host)
  if (!h) return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return true
  if (h.includes(':')) return /^[0-9a-f:.]+$/.test(h) // IPv6 literal (from [..])
  if (h === 'localhost') return true
  const name = machineName.trim().toLowerCase()
  if (!name) return false
  return h === name || LOCAL_SUFFIXES.some((s) => h === name + s)
}

/** A browser's Origin must be our own page (same host). Non-browser clients send no Origin. */
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (origin === undefined || origin === '') return true
  if (!host) return false
  try {
    const u = new URL(origin)
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.host.toLowerCase() === host.trim().toLowerCase()
  } catch {
    return false // includes the literal "null" origin (sandboxed iframes, file: pages)
  }
}

/* ------------------------------ remote / stage commands ------------------------------ */

/** The longest screen or stage message a phone may send (the remote's inputs stop typing there too). */
export const MAX_MESSAGE_LENGTH = 500
const MAX_TEXT = MAX_MESSAGE_LENGTH
const SIMPLE = new Set(['next', 'prev', 'nextItem', 'prevItem', 'black', 'clearText', 'logo', 'clearAll', 'clearMessage', 'videoToggle'])
const DISPLAY_LANGS: readonly DisplayLang[] = ['es', 'en', 'both']

/** Returns a clean copy of a command from a phone or the stage window, or null if it isn't one we accept. */
export function validateCommand(raw: unknown): RemoteCommand | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  const type = c.type
  if (typeof type !== 'string') return null
  if (SIMPLE.has(type)) return { type } as RemoteCommand
  switch (type) {
    case 'gotoItem':
    case 'gotoSlide':
      return Number.isSafeInteger(c.index) && (c.index as number) >= 0 ? { type, index: c.index as number } : null
    case 'displayLang':
      return DISPLAY_LANGS.includes(c.value as DisplayLang) ? { type, value: c.value as DisplayLang } : null
    case 'message':
      return typeof c.text === 'string' && c.text.trim() && c.text.length <= MAX_TEXT ? { type, text: c.text } : null
    case 'stageMessage':
      // '' is allowed: it clears the stage message
      return typeof c.text === 'string' && c.text.length <= MAX_TEXT ? { type, text: c.text } : null
    default:
      return null // includes 'videoEnded': only the projector window may report that
  }
}

/* ------------------------------ what phones and stage screens receive ------------------------------ */

export type PublicSlide = Pick<Slide, 'id' | 'kind' | 'group' | 'text' | 'title' | 'chords' | 'notes' | 'countdownTo' | 'countdownLabel'> & { media?: string }
export interface PublicState {
  slides: PublicSlide[]
  slideIndex: number
  clearedFrom?: number
  itemIndex: number
  itemId?: string
  itemTitle?: string
  itemNotes?: string
  itemStartedAt?: number
  serviceStartedAt?: number
  planTitle?: string
  planItems: Pick<PlanSummaryItem, 'id' | 'title' | 'type' | 'person' | 'durationMin'>[]
  layers: { black: boolean; clearText: boolean; logo: boolean }
  video?: { playing: boolean }
  stageMessage?: LiveState['stageMessage']
  displayLang: DisplayLang
  bilingualOrder: BilingualOrder
}

/**
 * The live state as phones and stage screens see it: only the fields their pages read, so nothing else
 * (local file paths, theme files, the logo path, which reveal the Windows user name) leaves this PC.
 * `mediaUrl` turns a slide's media:// url into a URL the browser may fetch (or undefined to drop it).
 */
export function pickPublicState(s: LiveState, mediaUrl: (u: string | undefined) => string | undefined): PublicState {
  return {
    slides: s.slides.map((sl) => ({
      id: sl.id,
      kind: sl.kind,
      group: sl.group,
      text: sl.text,
      title: sl.title,
      chords: sl.chords,
      notes: sl.notes,
      countdownTo: sl.countdownTo,
      countdownLabel: sl.countdownLabel,
      media: sl.kind === 'image' ? mediaUrl(sl.media) : undefined
    })),
    slideIndex: s.slideIndex,
    clearedFrom: s.clearedFrom,
    itemIndex: s.itemIndex,
    itemId: s.itemId,
    itemTitle: s.itemTitle,
    itemNotes: s.itemNotes,
    itemStartedAt: s.itemStartedAt,
    serviceStartedAt: s.serviceStartedAt,
    planTitle: s.planTitle,
    planItems: s.planItems.map((i) => ({ id: i.id, title: i.title, type: i.type, person: i.person, durationMin: i.durationMin })),
    layers: { black: s.layers.black, clearText: s.layers.clearText, logo: s.layers.logo },
    video: s.video ? { playing: s.video.playing } : undefined,
    stageMessage: s.stageMessage,
    displayLang: s.displayLang,
    bilingualOrder: s.bilingualOrder
  }
}

/* ------------------------------ settings from the renderer ------------------------------ */

const LANGS: readonly Lang[] = ['es', 'en']
const ORDERS: readonly BilingualOrder[] = ['es-first', 'en-first']
const str = (max: number) => (v: unknown) => (typeof v === 'string' && v.length <= max ? v : undefined)
const bool = (v: unknown) => (typeof v === 'boolean' ? v : undefined)
const oneOf =
  <T>(list: readonly T[]) =>
  (v: unknown) =>
    list.includes(v as T) ? (v as T) : undefined

/**
 * Every setting the renderer may change, with its check. Keys not listed are dropped — in particular
 * `remotePin`, which only main generates (server:newPin). Add new settings here or they can't be saved.
 */
const SETTING_CHECKS: { [K in keyof Settings]?: (v: unknown) => Settings[K] | undefined } = {
  uiLang: oneOf(LANGS),
  displayLang: oneOf(DISPLAY_LANGS),
  bilingualOrder: oneOf(ORDERS),
  churchName: str(200),
  ccliLicense: str(100),
  outputDisplayId: (v) => (Number.isSafeInteger(v) ? (v as number) : undefined),
  outputEnabled: bool,
  defaultThemeId: str(200),
  logoPath: str(2000),
  serverEnabled: bool,
  serverPort: (v) => (Number.isSafeInteger(v) && (v as number) >= 1024 && (v as number) <= 65535 ? (v as number) : undefined),
  bibleEn: str(200),
  bibleEs: str(200),
  messageTemplates: (v) =>
    Array.isArray(v) && v.length <= 100 && v.every((m) => m && typeof m.id === 'string' && typeof m.en === 'string' && typeof m.es === 'string')
      ? (v as Settings['messageTemplates']).map((m) => ({ id: m.id.slice(0, 100), en: m.en.slice(0, 500), es: m.es.slice(0, 500) }))
      : undefined,
  messageSeconds: (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(3600, Math.max(5, Math.round(v))) : undefined),
  operatorTheme: oneOf(['dark', 'light'] as const),
  firstRunDone: bool
}

/** Keeps only valid, known settings from a renderer patch. Invalid values are dropped, never thrown. */
export function sanitizeSettingsPatch(patch: unknown): Partial<Settings> {
  const out: Partial<Settings> = {}
  if (!patch || typeof patch !== 'object') return out
  for (const [k, v] of Object.entries(patch)) {
    const check = SETTING_CHECKS[k as keyof Settings]
    if (!check) continue
    const ok = check(v)
    if (ok !== undefined) (out as Record<string, unknown>)[k] = ok
  }
  return out
}
