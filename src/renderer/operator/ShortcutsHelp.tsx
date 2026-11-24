import { useTranslation } from 'react-i18next'
import { Modal } from '../components/ui'

const KEYS: [string, string][] = [
  ['Space  →  ↓  PgDn', 'next'],
  ['←  ↑  PgUp', 'prev'],
  ['Ctrl + →', 'nextItem'],
  ['Ctrl + ←', 'prevItem'],
  ['B', 'black'],
  ['C', 'clearText'],
  ['L', 'logo'],
  ['Esc', 'clearAll'],
  ['P', 'video'],
  ['1', 'en'],
  ['2', 'es'],
  ['3', 'both'],
  ['?  F1', 'help']
]

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <Modal title={`⌨️ ${t('help.title')}`} onClose={onClose}>
      <table className="table">
        <tbody>
          {KEYS.map(([k, v]) => (
            <tr key={v}>
              <td style={{ width: 200 }}>
                {k.split('  ').map((x) => (
                  <span key={x} className="kbd" style={{ marginRight: 6 }}>
                    {x}
                  </span>
                ))}
              </td>
              <td>{t(`help.${v}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">{t('help.note')}</p>
    </Modal>
  )
}
