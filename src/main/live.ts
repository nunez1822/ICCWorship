import { EventEmitter } from 'node:events'
import type { LiveState } from '@shared/types'
import { isLive, onScreen } from '@shared/updatePolicy'
import { getSettings, getTheme } from './db'

/**
 * Single source of truth for what is on screen. The operator window computes slides
 * and pushes updates; main keeps the merged state and broadcasts it to the projector
 * window (IPC) and to stage/remote browsers (WebSocket).
 */
class LiveStore extends EventEmitter {
  state: LiveState
  /** when something was last on screen this run, on the monotonic clock (Windows setting the wall clock forward
   *  2 hours during a cleared sermon must not end the service) */
  private lastOnScreenMono: number | undefined

  /** when something was last on screen (epoch ms, measured on the monotonic clock); a timed message counts until it
   *  ran out, even though nothing updated the live state then */
  lastOnScreenAt(now = Date.now()): number | undefined {
    const seen = this.lastOnScreenMono === undefined ? undefined : now - (performance.now() - this.lastOnScreenMono)
    const until = this.state.message?.until
    return until !== undefined && until <= now && (seen === undefined || until > seen) ? until : seen
  }

  /** a service may be running (see isLive): updates wait, and a Windows shutdown now is an interrupted service */
  serviceRunning(now = Date.now()): boolean {
    return isLive(this.state, now, this.lastOnScreenAt(now))
  }

  /* Sleep counts as time passed (a laptop closed for the night after a cleared sermon ended that service), but the
   * monotonic clock may not run while Windows sleeps. As Chromium does, the power events fill the gap: at wake-up,
   * the sleep the monotonic clock missed (measured on the wall clock) is added. Never subtracted, so a clock that did
   * run, or a wall clock set back meanwhile, changes nothing. */
  private suspendedAt: { wall: number; mono: number } | undefined
  suspended(): void {
    this.suspendedAt = { wall: Date.now(), mono: performance.now() }
  }
  resumed(): void {
    const at = this.suspendedAt
    this.suspendedAt = undefined
    if (!at || this.lastOnScreenMono === undefined) return
    const missed = Date.now() - at.wall - (performance.now() - at.mono)
    if (missed > 0) this.lastOnScreenMono -= missed
  }

  constructor() {
    super()
    this.state = {
      planItems: [],
      itemIndex: -1,
      slides: [],
      slideIndex: -1,
      theme: undefined as unknown as LiveState['theme'],
      background: null,
      displayLang: 'both',
      bilingualOrder: 'es-first',
      layers: { black: false, clearText: false, clearBackground: false, logo: false },
      seq: 0
    }
  }

  init(): void {
    const s = getSettings()
    this.state.theme = getTheme()
    this.state.background = this.state.theme.background
    this.state.displayLang = s.displayLang
    this.state.bilingualOrder = s.bilingualOrder
    this.state.logoPath = s.logoPath
    this.state.churchName = s.churchName
    if (s.audioOutputId || s.audioOutputLabel) this.state.audioOutput = { id: s.audioOutputId || undefined, label: s.audioOutputLabel || undefined }
  }

  update(patch: Partial<LiveState>): LiveState {
    const was = onScreen(this.state)
    this.state = { ...this.state, ...patch, seq: this.state.seq + 1 }
    // on screen until now (a video that played for 40 minutes, then Esc), or from now
    if (was || onScreen(this.state)) this.lastOnScreenMono = performance.now()
    this.emit('change', this.state)
    return this.state
  }

  /** high-frequency updates (video progress) that do not need a full re-render */
  progress(p: LiveState['videoProgress']): void {
    const wasError = this.state.videoProgress?.error
    this.state.videoProgress = p
    this.emit('progress', p)
    // A video that failed to load is not "playing" — keep the operator's controls honest. Also
    // broadcast the error as part of the state, so every window (and the projector's own
    // "report it again" check) sees it until the operator moves on.
    if (p?.error && !wasError) this.update(this.state.video?.playing ? { video: { ...this.state.video, playing: false } } : {})
  }
}

export const live = new LiveStore()
