/**
 * Help menu / Settings → About actions: logs, diagnostics, notices, reporting a problem.
 */
import { app, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { exportDiagnostics } from './diagnostics'
import { saveDialog } from './dialogs'
import { E2E, REPO_URL } from './env'
import { log, logDir } from './log'

/** the bug-report form with the version already filled in */
export const newIssueUrl = () => `${REPO_URL}/issues/new?template=bug_report.yml&version=${encodeURIComponent(app.getVersion())}`

function noticesPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'THIRD_PARTY_NOTICES.md') : join(app.getAppPath(), 'out', 'THIRD_PARTY_NOTICES.md')
}
/** false when the file isn't there (e.g. `pnpm dev` before `node scripts/licenses.mjs`): the caller says so */
export async function openNotices(): Promise<boolean> {
  const p = noticesPath()
  if (!existsSync(p)) {
    log.warn('open-source notices file missing')
    return false
  }
  // .md may have no program associated with it on a church PC: then show the file in Explorer instead
  if (await shell.openPath(p)) shell.showItemInFolder(p)
  return true
}

/** shell.openPath answers with an error text ('' when it worked); false tells the caller to say so */
export async function openFolder(dir: string, what: string): Promise<boolean> {
  const error = await shell.openPath(dir)
  if (error) log.warn(`could not open the ${what} folder`)
  return !error
}
export const openLogs = () => openFolder(logDir(), 'logs')

export async function exportDiagnosticsInteractive(includeCrashDumps: boolean): Promise<{ ok: boolean; path: string } | null> {
  const stamp = new Date().toISOString().slice(0, 10)
  const r = await saveDialog({ defaultPath: `ICCWorship-diagnostics-${stamp}.zip`, filters: [{ name: 'Zip', extensions: ['zip'] }] })
  if (r.canceled || !r.filePath) return null
  try {
    await exportDiagnostics(r.filePath, { includeCrashDumps })
    log.info('diagnostics exported', includeCrashDumps ? '(with crash dumps)' : '')
    if (!E2E) shell.showItemInFolder(r.filePath)
    return { ok: true, path: r.filePath }
  } catch (e) {
    log.error('diagnostics export failed', e)
    return { ok: false, path: r.filePath }
  }
}
