import { useEffect, type ReactNode } from 'react'
import type { PlanItemType } from '@shared/types'

export function Modal(p: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        p.onClose()
      }
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [p.onClose])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className={`modal ${p.wide ? 'wide' : ''}`} role="dialog">
        <div className="modal-head">
          <h2>{p.title}</h2>
          <button className="btn ghost icon-btn" onClick={p.onClose} aria-label="close">
            ✕
          </button>
        </div>
        <div className="modal-body">{p.children}</div>
        {p.footer && <div className="modal-foot">{p.footer}</div>}
      </div>
    </div>
  )
}

export function Field(p: { label: ReactNode; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <label className="field" style={p.style}>
      <span>{p.label}</span>
      {p.children}
    </label>
  )
}

export function Seg<T extends string>(p: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {p.options.map((o) => (
        <button key={o.value} className={o.value === p.value ? 'on' : ''} onClick={() => p.onChange(o.value)} title={o.title}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export const TYPE_ICON: Record<PlanItemType, string> = {
  song: '🎵',
  scripture: '📖',
  announcement: '📣',
  media: '🎬',
  presentation: '🖼️',
  countdown: '⏱️',
  notes: '📝',
  header: '🔖',
  blank: '⬛',
  prayer: '🙏'
}

export function fmtMin(min: number): string {
  if (!min) return '0m'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h ? `${h}h ${m}m` : `${m}m`
}

export function confirmDel(msg: string): boolean {
  return window.confirm(msg)
}
