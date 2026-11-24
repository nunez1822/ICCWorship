import { EventEmitter } from 'node:events'
import type { LiveState } from '@shared/types'
import { getSettings, getTheme } from './db'

/**
 * Single source of truth for what is on screen. The operator window computes slides
 * and pushes updates; main keeps the merged state and broadcasts it to the projector
 * window (IPC) and to stage/remote browsers (WebSocket).
 */
class LiveStore extends EventEmitter {
  state: LiveState

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
  }

  update(patch: Partial<LiveState>): LiveState {
    this.state = { ...this.state, ...patch, seq: this.state.seq + 1 }
    this.emit('change', this.state)
    return this.state
  }

  /** high-frequency updates (video progress) that do not need a full re-render */
  progress(p: LiveState['videoProgress']): void {
    this.state.videoProgress = p
    this.emit('progress', p)
  }
}

export const live = new LiveStore()
