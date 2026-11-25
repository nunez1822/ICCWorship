import JSZip from 'jszip'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, normalize, relative, resolve, sep } from 'node:path'
import { backupDir, dataRoot } from './paths'
import { db } from './db'
import { localDate, localStamp } from '@shared/dates'
import { reload as reloadBibles } from './bible'

/** Folders inside Documents\ICCWorship that belong in a backup */
const INCLUDE = ['data', join('cache', 'presentations')]

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (!f.endsWith('.tmp')) out.push(p)
  }
  return out
}

export async function createBackup(target: string): Promise<{ ok: boolean; path: string; files: number; bytes: number }> {
  db().flush()
  const root = dataRoot()
  const zip = new JSZip()
  let files = 0
  for (const inc of INCLUDE) {
    for (const f of walk(join(root, inc))) {
      zip.file(relative(root, f).split(sep).join('/'), readFileSync(f))
      files++
    }
  }
  zip.file('iccworship-backup.json', JSON.stringify({ app: 'ICCWorship', version: 1, createdAt: new Date().toISOString() }))
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, buf)
  return { ok: true, path: target, files, bytes: buf.length }
}

export async function restoreBackup(zipPath: string): Promise<{ ok: boolean; error?: string; safetyBackup?: string }> {
  let zip: JSZip
  try {
    zip = await JSZip.loadAsync(readFileSync(zipPath))
  } catch {
    // not a zip at all (renamed text file, truncated download…) — same answer as a foreign zip
    return { ok: false, error: 'not-a-backup' }
  }
  if (!zip.file('iccworship-backup.json')) return { ok: false, error: 'not-a-backup' }
  // a manifest with no data files would "restore" nothing and still reload the app
  if (!Object.keys(zip.files).some((n) => /^data\/[^/]+\.json$/.test(n) && !zip.files[n].dir)) return { ok: false, error: 'not-a-backup' }
  // safety: back up current data before overwriting
  const safety = join(backupDir(), `before-restore-${stamp()}.zip`)
  await createBackup(safety)
  db().reset()
  const root = resolve(dataRoot())
  for (const name of Object.keys(zip.files)) {
    const entry = zip.files[name]
    if (entry.dir || name === 'iccworship-backup.json') continue
    if (!/^(data|cache\/presentations)\//.test(name)) continue
    const dest = resolve(root, normalize(name))
    if (!dest.startsWith(root + sep)) continue // zip-slip protection
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, await entry.async('nodebuffer'))
  }
  db().reset()
  reloadBibles()
  return { ok: true, safetyBackup: safety }
}

const stamp = () => localStamp()

/** One automatic backup per day in Documents\ICCWorship\backups, keep the newest 14 */
export async function autoBackup(): Promise<void> {
  const dir = backupDir()
  const today = localDate()
  const existing = readdirSync(dir).filter((f) => f.startsWith('auto-')).sort()
  if (existing.some((f) => f.includes(today))) return
  await createBackup(join(dir, `auto-${today}.zip`))
  const all = readdirSync(dir).filter((f) => f.startsWith('auto-')).sort()
  for (const old of all.slice(0, Math.max(0, all.length - 14))) unlinkSync(join(dir, old))
}

export function listBackups(): { name: string; path: string; size: number; date: number }[] {
  const dir = backupDir()
  return readdirSync(dir)
    .filter((f) => f.endsWith('.zip'))
    .map((f) => {
      const st = statSync(join(dir, f))
      return { name: f, path: join(dir, f), size: st.size, date: st.mtimeMs }
    })
    .sort((a, b) => b.date - a.date)
}

export const defaultBackupName = () => `ICCWorship-backup-${stamp()}.zip`
