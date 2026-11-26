/**
 * "Help → Export diagnostics": one .zip a church can attach to a bug report. It must be safe to post publicly,
 * so it holds only: the logs (already redacted), facts about the PC and app, settings WITHOUT the PIN, logo path
 * or CCLI number, how many songs/plans/… exist (never their contents), and — only if the user ticks the box —
 * crash dumps (which can contain whatever was on screen).
 */
import { app, screen } from 'electron'
import JSZip from 'jszip'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { arch, homedir, release, totalmem, type as osType } from 'node:os'
import { join } from 'node:path'
import { COLLECTIONS, db, getSettings } from './db'
import { dataDir, dataRoot } from './paths'
import { location } from './bootstrap'
import { logDir, redact } from './log'

const DAY = 24 * 60 * 60 * 1000

export function systemInfo(): Record<string, unknown> {
  return {
    app: `ICCWorship ${app.getVersion()}`,
    packaged: app.isPackaged,
    portable: !!process.env.PORTABLE_EXECUTABLE_DIR,
    dataMode: location.mode, // where the data is (portable.ts): beside the exe, read-only, Documents…
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    os: `${osType()} ${release()} (${process.getSystemVersion()}) ${arch()}`,
    memoryGB: Math.round(totalmem() / 1024 ** 3),
    locale: app.getLocale(),
    displays: screen
      .getAllDisplays()
      .map((d) => ({ size: `${d.size.width}x${d.size.height}`, scale: d.scaleFactor, primary: d.id === screen.getPrimaryDisplay().id })),
    gpu: app.getGPUFeatureStatus(),
    // where the data lives (Documents, another drive, OneDrive…) without the Windows user name. redact()'s default
    // would turn the data folder itself into "<data>", which says nothing.
    dataFolder: redact(dataRoot(), { home: homedir() }),
    customDataFolder: !!process.env.ICCWORSHIP_DATA
  }
}

/** Plain text for "Copy system info" (pasted into a bug report) */
export function systemInfoText(): string {
  const s = systemInfo()
  const lines = Object.entries(s)
    .filter(([k]) => k !== 'gpu')
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
  return lines.join('\n')
}

function safeSettings(): Record<string, unknown> {
  const { remotePin: _pin, logoPath, ccliLicense, churchName: _name, messageTemplates, ...rest } = getSettings()
  return { ...rest, logoPath: logoPath ? '(set)' : '', ccliLicense: ccliLicense ? '(set)' : '', messageTemplates: messageTemplates.length }
}

function counts(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of COLLECTIONS) out[c] = db().list(c).length
  return out
}

function filesIn(dir: string, keep: (name: string, mtime: number) => boolean): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((f) => join(dir, f))
    .filter((p) => {
      try {
        const st = statSync(p)
        return st.isFile() && keep(p, st.mtimeMs)
      } catch {
        return false
      }
    })
}

export async function exportDiagnostics(target: string, opts: { includeCrashDumps: boolean }): Promise<{ ok: boolean; files: number }> {
  const zip = new JSZip()
  let files = 0
  for (const f of filesIn(logDir(), (p) => /main\.log(\.\d+)?$/.test(p))) {
    zip.file(`logs/${f.split(/[\\/]/).pop()}`, readFileSync(f))
    files++
  }
  zip.file('system.json', JSON.stringify(systemInfo(), null, 2))
  zip.file('settings.json', JSON.stringify(safeSettings(), null, 2))
  const meta = (() => {
    try {
      return JSON.parse(readFileSync(join(dataDir(), 'meta.json'), 'utf8'))
    } catch {
      return null
    }
  })()
  zip.file(
    'data-summary.json',
    JSON.stringify(
      {
        counts: counts(),
        meta,
        damagedFiles: filesIn(dataDir(), (p) => /\.corrupt-/.test(p)).map((p) => p.split(/[\\/]/).pop()),
        backups: filesIn(join(dataRoot(), 'backups'), (p) => p.endsWith('.zip')).length
      },
      null,
      2
    )
  )
  if (opts.includeCrashDumps) {
    const dumps = join(app.getPath('crashDumps'), 'reports')
    for (const f of filesIn(dumps, (p, mtime) => p.endsWith('.dmp') && Date.now() - mtime < 7 * DAY)) {
      zip.file(`crash-dumps/${f.split(/[\\/]/).pop()}`, readFileSync(f))
      files++
    }
  }
  zip.file(
    'README.txt',
    'ICCWorship diagnostics. Logs never contain lyrics, people, prayer requests or the remote PIN.\n' +
      (opts.includeCrashDumps ? 'crash-dumps/ may contain text that was on screen when the app crashed.\n' : 'No crash dumps included.\n')
  )
  writeFileSync(target, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }))
  return { ok: true, files }
}
