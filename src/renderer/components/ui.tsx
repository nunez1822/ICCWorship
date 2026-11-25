import { Children, cloneElement, isValidElement, useEffect, useId, type ReactElement, type ReactNode } from 'react'
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

/**
 * A labelled form field, done the accessible way (WCAG / WAI-ARIA, as in Microsoft and Apple
 * apps): one input / select / textarea gets a real <label for>, so screen readers and
 * "click the label" both work. Anything else (a row of buttons, several checkboxes, a
 * custom control) becomes a named group, so the label no longer leaks into the name of
 * whatever happens to be the first button inside it.
 */
export function Field(p: { label: ReactNode; children: ReactNode; style?: React.CSSProperties }) {
  const id = useId()
  const kids = Children.toArray(p.children)
  const [first, ...rest] = kids
  // The mode depends only on what the children ARE, never on how many are showing right
  // now: a helper that appears under the input (search suggestions) must not flip the
  // field to the other layout, which would throw the input away mid-typing.
  if (isFormControl(first) && !rest.some(isFormControl)) {
    const controlId = first.props.id || id
    return (
      <div className="field" style={p.style}>
        <label className="field-label" htmlFor={controlId}>
          {p.label}
        </label>
        {/* always an array with the toArray keys, so the input keeps its identity */}
        {[cloneElement(first, { id: controlId }), ...rest]}
      </div>
    )
  }
  return (
    <div className="field" style={p.style} role="group" aria-labelledby={id}>
      <span className="field-label" id={id}>
        {p.label}
      </span>
      {p.children}
    </div>
  )
}

function isFormControl(x: unknown): x is ReactElement<{ id?: string }> {
  return isValidElement(x) && typeof x.type === 'string' && ['input', 'select', 'textarea'].includes(x.type)
}

export function Seg<T extends string>(p: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {p.options.map((o) => (
        <button key={o.value} className={o.value === p.value ? 'on' : ''} aria-pressed={o.value === p.value} onClick={() => p.onChange(o.value)} title={o.title}>
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
