/**
 * Remembering the operator window's size and place between runs (userData/window-state.json, this PC only), as
 * every desktop app does — and never restoring it somewhere the volunteer can't see it (a projector or a second
 * screen that is no longer connected, a resolution that got smaller).
 */
export type Rect = { x: number; y: number; width: number; height: number }
export type WindowState = { bounds?: Rect; maximized: boolean }

/** at least this much of the window must be on a screen, or it is placed fresh */
const MIN_VISIBLE = { width: 160, height: 80 }

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isRect = (r: unknown): r is Rect =>
  !!r && typeof r === 'object' && num((r as Rect).x) && num((r as Rect).y) && num((r as Rect).width) && num((r as Rect).height)

function overlap(a: Rect, b: Rect): { width: number; height: number } {
  return {
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  }
}

/**
 * Where to open the window. Nothing saved (first run) or unreadable → maximized, as before this was remembered.
 * Saved bounds that are still visible are used, made to fit the screen they are mostly on and kept at least the
 * window's minimum size; otherwise the window opens at its default place, maximized if it was.
 */
export function restoreWindowState(saved: unknown, workAreas: Rect[], min: { width: number; height: number }): WindowState {
  if (!saved || typeof saved !== 'object') return { maximized: true }
  const s = saved as { bounds?: unknown; maximized?: unknown }
  const maximized = s.maximized !== false
  if (!isRect(s.bounds) || s.bounds.width <= 0 || s.bounds.height <= 0) return { maximized }
  const b = s.bounds
  let best: Rect | undefined
  let bestArea = 0
  for (const wa of workAreas) {
    const o = overlap(b, wa)
    if (o.width >= MIN_VISIBLE.width && o.height >= MIN_VISIBLE.height && o.width * o.height > bestArea) {
      best = wa
      bestArea = o.width * o.height
    }
  }
  if (!best) return { maximized }
  const width = Math.round(Math.max(min.width, Math.min(b.width, best.width)))
  const height = Math.round(Math.max(min.height, Math.min(b.height, best.height)))
  // pull it back inside the screen if it hangs off an edge
  const x = Math.round(Math.min(Math.max(b.x, best.x), best.x + best.width - Math.min(width, best.width)))
  const y = Math.round(Math.min(Math.max(b.y, best.y), best.y + best.height - Math.min(height, best.height)))
  return { bounds: { x, y, width, height }, maximized }
}
