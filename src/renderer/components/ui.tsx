import { Children, cloneElement, isValidElement, useEffect, useId, useRef, type ReactElement, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem, PlanItem, PlanItemType } from '@shared/types'

/**
 * `dismissable={false}`: a click beside the dialog doesn't close it (work in progress — recorded marks, a track being
 * made — must not be lost to a stray click). Esc and ✕ still call onClose, which may ask first.
 */
export function Modal(p: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; dismissable?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        p.onClose()
      }
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only onClose is used; `p` is a new object every render
  }, [p.onClose])
  const { t } = useTranslation()
  const titleId = useId()
  const box = useRef<HTMLDivElement>(null)
  // focus moves into the dialog when it opens: a key pressed now must not also press the button that opened it
  // behind the dialog (the live shortcuts — Space, B, L… — still work, as on every page)
  useEffect(() => {
    if (box.current && !box.current.contains(document.activeElement)) box.current.focus()
  }, [])
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && p.dismissable !== false && p.onClose()}>
      <div ref={box} className={`modal ${p.wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
        <div className="modal-head">
          <h2 id={titleId}>{p.title}</h2>
          <button className="btn ghost icon-btn" onClick={p.onClose} aria-label={t('common.close')}>
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
        <button
          key={o.value}
          className={o.value === p.value ? 'on' : ''}
          aria-pressed={o.value === p.value}
          onClick={() => p.onChange(o.value)}
          title={o.title}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A plan item's icon; a media item shows whether it is a picture, sound or video. */
export function itemIcon(item: Pick<PlanItem, 'type' | 'refId'>, media: MediaItem[]): string {
  if (item.type === 'media') {
    const kind = media.find((m) => m.id === item.refId)?.kind
    if (kind === 'image') return '🖼'
    if (kind === 'audio') return '🎧'
  }
  return TYPE_ICON[item.type]
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
