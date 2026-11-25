import type { Song } from '@shared/types'
import { songName } from '@shared/slides'

const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** The Spanish title to show after the main name, if it adds anything (one-language songs have none). */
export function songSecondTitle(song: Pick<Song, 'title' | 'titleEs'>): string {
  return song.title?.trim() && song.titleEs?.trim() ? song.titleEs.trim() : ''
}

/** Songs sorted by name; with a query, ranked: title prefix > title match > lyrics/author/tags/CCLI > all words anywhere. */
export function filterSongs(songs: Song[], q: string): Song[] {
  const n = norm(q.trim())
  const sorted = [...songs].sort((a, b) => songName(a).localeCompare(songName(b)))
  if (!n) return sorted
  const words = n.split(/\s+/).filter(Boolean)
  const score = (s: Song) => {
    // either title may be empty (one-language songs)
    const titles = [s.title, s.titleEs].map((x) => norm(x?.trim() || '')).filter(Boolean)
    if (titles.some((x) => x.startsWith(n))) return 3
    const title = titles.join(' ')
    if (title.includes(n)) return 2
    const body = norm(s.sections.map((x) => `${x.en} ${x.es}`).join(' ') + ' ' + (s.author || '') + ' ' + s.tags.join(' ') + ' ' + (s.ccli || ''))
    if (body.includes(n)) return 1
    // every typed word somewhere, in any order ("amazing sound", "bulk 1")
    const all = `${title} ${body}`
    return words.length > 1 && words.every((w) => all.includes(w)) ? 0.5 : 0
  }
  return sorted
    .map((s) => ({ s, sc: score(s) }))
    .filter((x) => x.sc > 0)
    .sort((a, b) => b.sc - a.sc)
    .map((x) => x.s)
}
