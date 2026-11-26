/**
 * Native dialogs, the files the user picked in them, and the e2e queues that answer them in tests.
 */
import { dialog } from 'electron'
import { resolve } from 'node:path'
import { open, wins } from './appState'
import { E2E } from './env'

// Paths the user picked in a file dialog during this session. IPC calls that read a file the renderer names
// (file:readText, backup:restore) only accept these, so the renderer can't ask for arbitrary files.
const granted = new Set<string>()
const grant = (p: string) => granted.add(resolve(p).toLowerCase())
export const isGranted = (p: unknown): p is string => typeof p === 'string' && granted.has(resolve(p).toLowerCase())

// E2E test hook — only when started by `pnpm e2e:launch` (ICCWORSHIP_E2E=1, never in a packaged app):
// native file dialogs cannot be driven by Playwright, so a tester can queue the path the next dialog should "pick".
export const e2eQueues = { open: [] as string[][], save: [] as string[], messageBox: [] as number[] }

/** async message box (never the sync one: it would block main, and with it the projector) */
export function messageBox(opts: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  if (E2E && e2eQueues.messageBox.length) return Promise.resolve({ response: e2eQueues.messageBox.shift()!, checkboxChecked: false })
  return open(wins.operator) ? dialog.showMessageBox(wins.operator, opts) : dialog.showMessageBox(opts)
}

export async function openDialog(opts: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
  const r = E2E && e2eQueues.open.length ? { canceled: false, filePaths: e2eQueues.open.shift()! } : await dialog.showOpenDialog(wins.operator!, opts)
  if (!r.canceled) r.filePaths.forEach(grant)
  return r
}

export async function saveDialog(opts: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> {
  const r = E2E && e2eQueues.save.length ? { canceled: false, filePath: e2eQueues.save.shift()! } : await dialog.showSaveDialog(wins.operator!, opts)
  if (!r.canceled && r.filePath) grant(r.filePath)
  return r
}
