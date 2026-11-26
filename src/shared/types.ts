/* ------------------------------------------------------------------ *
 * ICCWorship shared data model (used by main, preload and renderer)  *
 * ------------------------------------------------------------------ */

export type Lang = 'en' | 'es'
/** What language(s) show on the projector */
export type DisplayLang = 'en' | 'es' | 'both'
export type BilingualOrder = 'es-first' | 'en-first'

export interface BiText {
  en?: string
  es?: string
}

/* ---------------- Songs ---------------- */
export type SectionType = 'verse' | 'chorus' | 'pre' | 'bridge' | 'tag' | 'intro' | 'ending' | 'other'

export interface SongSection {
  id: string
  type: SectionType
  /** e.g. "Verse 1", "Chorus" */
  label: string
  /** lyrics; may contain ChordPro chords like [G] which are hidden on the projector */
  en: string
  es: string
}

export interface Song {
  id: string
  title: string
  titleEs?: string
  author?: string
  copyright?: string
  ccli?: string
  tags: string[]
  sections: SongSection[]
  /** ordered section ids; empty = sections in written order */
  arrangement: string[]
  linesPerSlide: number
  key?: string
  createdAt: number
  updatedAt: number
}

/* ---------------- Slides ---------------- */
export type SlideKind = 'text' | 'image' | 'video' | 'countdown' | 'blank'

export interface Slide {
  id: string
  kind: SlideKind
  /** group label shown on slide thumbnails (Verse 1, John 3:16…) */
  group?: string
  text?: BiText
  /** reference / copyright line */
  footer?: BiText
  /** footer.en / footer.es are the same line in two orders — show only one */
  footerCombined?: boolean
  /** media:// url or file path for image/video slides */
  media?: string
  notes?: string
  /** chord chart (stage display only) */
  chords?: BiText
  /** for countdowns: epoch ms target */
  countdownTo?: number
  countdownLabel?: BiText
  /** a slide that is a title card (headers, announcements) gets larger heading style */
  title?: BiText
  /** auto-advance after N seconds (announcement loops) */
  advanceAfter?: number
}

/* ---------------- Themes ---------------- */
export type BackgroundType = 'color' | 'gradient' | 'image' | 'video'

export interface Background {
  type: BackgroundType
  /** color, css gradient, or media path */
  value: string
  /** darken overlay 0..0.9 for readability over images/videos */
  dim?: number
}

export interface Theme {
  id: string
  name: string
  fontFamily: string
  /** font size in px on a 1920x1080 canvas */
  fontSize: number
  color: string
  secondaryColor: string
  /** secondary language size relative to primary 0.5..1 */
  secondaryScale: number
  shadow: boolean
  outline: boolean
  uppercase: boolean
  bold: boolean
  align: 'left' | 'center' | 'right'
  position: 'top' | 'middle' | 'bottom'
  background: Background
  builtIn?: boolean
}

/* ---------------- Media / presentations ---------------- */
export type MediaKind = 'image' | 'video' | 'audio'

export interface MediaItem {
  id: string
  name: string
  path: string
  kind: MediaKind
  /** small jpeg data url */
  thumb?: string
  addedAt: number
}

export type PresentationMethod = 'powerpoint' | 'libreoffice' | 'pdf' | 'text' | 'images'

export interface PresentationSlide {
  image?: string
  text?: BiText
  notes?: string
}

export interface Presentation {
  id: string
  name: string
  sourcePath: string
  method: PresentationMethod
  slides: PresentationSlide[]
  importedAt: number
}

/* ---------------- Service plans ---------------- */
export type PlanItemType = 'song' | 'scripture' | 'announcement' | 'media' | 'presentation' | 'countdown' | 'notes' | 'header' | 'blank' | 'prayer'

export interface CountdownConfig {
  mode: 'time' | 'duration'
  /** HH:MM for mode=time */
  time?: string
  minutes?: number
  label?: BiText
}

export interface PlanItem {
  id: string
  type: PlanItemType
  title: string
  /** songId / mediaId / presentationId */
  refId?: string
  scripture?: { ref: string; primary: string; secondary?: string }
  /** custom slides for announcements, sermon notes, prayer */
  slides?: { text: BiText; title?: BiText; media?: string }[]
  countdown?: CountdownConfig
  video?: { loop: boolean; autoNext: boolean; volume: number }
  /** seconds between auto-advance for announcement loops (0 = manual) */
  loopSeconds?: number
  durationMin: number
  notes?: string
  person?: string
  themeId?: string
  /** override background: media id */
  backgroundMediaId?: string
}

export interface Assignment {
  id: string
  teamId: string
  position: string
  personId: string
  status: 'pending' | 'confirmed' | 'declined'
}

export interface ServicePlan {
  id: string
  title: string
  /** YYYY-MM-DD */
  date: string
  /** HH:MM */
  time: string
  serviceType: string
  items: PlanItem[]
  team: Assignment[]
  attendance?: number
  offering?: number
  notes?: string
  isTemplate?: boolean
  createdAt: number
  updatedAt: number
}

/* ---------------- People ---------------- */
export interface Person {
  id: string
  firstName: string
  lastName: string
  phone?: string
  email?: string
  lang: Lang
  notes?: string
  teamIds: string[]
  createdAt: number
}

export interface Team {
  id: string
  name: string
  nameEs: string
  positions: string[]
}

export interface PrayerRequest {
  id: string
  name: string
  request: string
  date: string
  status: 'open' | 'answered'
  private: boolean
}

export interface SongUsage {
  id: string
  songId: string
  title: string
  ccli?: string
  date: string
  planId?: string
}

/* ---------------- Bible ---------------- */
export interface BibleVersionInfo {
  id: string
  name: string
  abbrev: string
  lang: Lang
  copyright?: string
  /** built-in public domain versions vs pasted / imported */
  source: 'builtin' | 'imported' | 'pasted'
  /** pasted versions: Lockman-style limit (e.g. 500); undefined = no limit */
  verseLimit?: number
  verseCount?: number
}

export interface Verse {
  book: number
  chapter: number
  verse: number
  text: string
}

export interface PassageResult {
  ok: boolean
  /** normalized reference in the version's language, e.g. "Juan 3:16-18" */
  reference: string
  verses: Verse[]
  /** verses requested that the version does not have (pasted versions) */
  missing: { book: number; chapter: number; verse: number }[]
  error?: string
  copyright?: string
  abbrev?: string
}

/* ---------------- Settings ---------------- */
export interface MessageTemplate {
  id: string
  en: string
  es: string
}

export interface Settings {
  uiLang: Lang
  displayLang: DisplayLang
  bilingualOrder: BilingualOrder
  churchName: string
  ccliLicense?: string
  outputDisplayId?: number
  outputEnabled: boolean
  defaultThemeId: string
  logoPath?: string
  serverEnabled: boolean
  serverPort: number
  remotePin: string
  bibleEn: string
  bibleEs: string
  messageTemplates: MessageTemplate[]
  messageSeconds: number
  operatorTheme: 'dark' | 'light'
  firstRunDone: boolean
  /** opt-in: ask GitHub once a day whether a newer ICCWorship exists (off by default: offline-first) */
  checkForUpdates?: boolean
  /** when the update check last ran (epoch ms) — set by main only */
  lastUpdateCheck?: number
  /** troubleshooting: turn off GPU acceleration (takes effect after a restart) */
  disableHwAccel?: boolean
  /** where videos, audio and backing tracks play ('' / unset = the Windows default). The id is what Chromium
   *  reported on this PC; the label finds the device again when the id changes (ids are per page and profile). */
  audioOutputId?: string
  audioOutputLabel?: string
}

/* ---------------- Live state ---------------- */
export interface LiveLayers {
  black: boolean
  clearText: boolean
  clearBackground: boolean
  logo: boolean
}

export interface VideoState {
  src: string
  playing: boolean
  loop: boolean
  volume: number
  /** bump to issue a seek */
  seekSeq: number
  seekTo: number
}

export interface PlanSummaryItem {
  id: string
  type: PlanItemType
  title: string
  durationMin: number
  person?: string
}

export interface LiveState {
  planId?: string
  planTitle?: string
  planItems: PlanSummaryItem[]
  itemIndex: number
  itemId?: string
  itemTitle?: string
  itemType?: PlanItemType
  itemNotes?: string
  slides: Slide[]
  slideIndex: number
  theme: Theme
  background: Background | null
  displayLang: DisplayLang
  bilingualOrder: BilingualOrder
  layers: LiveLayers
  message?: { text: string; until?: number; seq: number }
  stageMessage?: { text: string; seq: number }
  video?: VideoState
  /** error: the projector could not load/play the video (missing file, damaged, unsupported) */
  /** src: the media:// url the projector was playing (so a restarted projector resumes the right video) */
  videoProgress?: { current: number; duration: number; error?: boolean; src?: string }
  /** song shown by the live item (plan item or Show now) — lets edits refresh the screen */
  songId?: string
  /** slide that was live before Clear all (Esc) — Space resumes there */
  clearedFrom?: number
  itemStartedAt?: number
  serviceStartedAt?: number
  logoPath?: string
  churchName?: string
  /** the sound output chosen in Settings (pushed by main, like the logo) — the projector plays through it */
  audioOutput?: { id?: string; label?: string }
  seq: number
}

/** Commands the stage/remote pages can send */
/** Projector -> operator: a non-looping video reached its end. Names the item and file that
 *  ended so a late event (queued behind Next item or Esc) cannot act on a different video. */
export interface VideoEndedCommand {
  type: 'videoEnded'
  itemId?: string
  src: string
}

export type RemoteCommand =
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'nextItem' }
  | { type: 'prevItem' }
  | { type: 'gotoItem'; index: number }
  | { type: 'gotoSlide'; index: number }
  | { type: 'black' }
  | { type: 'clearText' }
  | { type: 'logo' }
  | { type: 'clearAll' }
  | { type: 'displayLang'; value: DisplayLang }
  | { type: 'message'; text: string }
  | { type: 'clearMessage' }
  | { type: 'stageMessage'; text: string }
  | { type: 'videoToggle' }
