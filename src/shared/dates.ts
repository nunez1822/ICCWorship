/**
 * Calendar dates as `YYYY-MM-DD` in the computer's **local** time zone.
 * Never use `toISOString().slice(0, 10)` for this: that is the UTC date, which is
 * already "tomorrow" on a Sunday evening in the Americas.
 */
export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Local date + time as `YYYY-MM-DD-HH-mm` (safe for file names). */
export function localStamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${localDate(d)}-${p(d.getHours())}-${p(d.getMinutes())}`
}

/** The next Sunday strictly after today (a week ahead when today is Sunday). */
export function nextSunday(from: Date = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7))
  return localDate(d)
}
