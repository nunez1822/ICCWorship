import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron'
import { notify } from './appState'
import { REPO_URL } from './env'
import { exportDiagnosticsInteractive, newIssueUrl, openLogs, openNotices } from './help'
import { t } from './i18n'

/** The app menu, in the current UI language (rebuilt when it changes). */
export function buildMenu(): void {
  const view: MenuItemConstructorOptions[] = [
    { role: 'reload', label: t('menu.reload') },
    { type: 'separator' },
    { role: 'zoomIn', label: t('menu.zoomIn') },
    { role: 'zoomOut', label: t('menu.zoomOut') },
    { role: 'resetZoom', label: t('menu.zoomReset') },
    { type: 'separator' },
    { role: 'togglefullscreen', label: t('menu.fullscreen') }
  ]
  if (!app.isPackaged) view.push({ type: 'separator' }, { role: 'toggleDevTools', label: t('menu.devtools') })
  const template: MenuItemConstructorOptions[] = [
    { label: t('menu.file'), submenu: [{ role: 'quit', label: t('menu.quit') }] },
    { label: t('menu.view'), submenu: view },
    {
      label: t('menu.help'),
      submenu: [
        { label: t('menu.shortcuts'), click: () => notify({ type: 'menu', action: 'shortcuts' }) },
        { type: 'separator' },
        { label: t('menu.openLogs'), click: () => void openLogs().then((ok) => ok || notify({ type: 'openFailed', what: 'logs' })) },
        {
          label: t('menu.exportDiagnostics'),
          click: () => void exportDiagnosticsInteractive(false).then((r) => r && notify({ type: 'diagnostics', ok: r.ok }))
        },
        { label: t('menu.reportProblem'), click: () => void shell.openExternal(newIssueUrl()) },
        { type: 'separator' },
        { label: t('menu.website'), click: () => void shell.openExternal(REPO_URL) },
        { label: t('menu.notices'), click: () => void openNotices().then((ok) => ok || notify({ type: 'openFailed', what: 'notices' })) },
        { label: t('menu.about'), click: () => notify({ type: 'menu', action: 'about' }) }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
