import { useEffect, useRef, useState } from 'react'
import type { LiveState, RemoteCommand } from '@shared/types'
import i18n from '../i18n'

export type FeedStatus = 'connecting' | 'online' | 'offline' | 'badpin'

/**
 * Live state for the stage display / phone remote.
 * Inside the ICCWorship app (stage window) it uses IPC; in a phone or other
 * computer's browser it uses the local-network WebSocket.
 */
export function useLiveFeed(role: 'stage' | 'remote', pin?: string) {
  const [state, setState] = useState<LiveState | null>(null)
  const [progress, setProgress] = useState<LiveState['videoProgress']>()
  const [status, setStatus] = useState<FeedStatus>('connecting')
  const [lockedSec, setLockedSec] = useState(0)
  const ws = useRef<WebSocket | null>(null)
  const local = typeof window !== 'undefined' && !!window.api

  useEffect(() => {
    if (local) {
      void window.api.live.get().then((s) => {
        setState(s)
        setStatus('online')
      })
      void window.api.settings.get().then((s) => i18n.changeLanguage(s.uiLang))
      const a = window.api.live.onState(setState)
      const b = window.api.live.onProgress(setProgress)
      return () => {
        a()
        b()
      }
    }
    if (role === 'remote' && !pin) {
      setStatus('badpin')
      return
    }
    let closed = false
    let retry: ReturnType<typeof setTimeout>
    let attempt = 0
    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const sock = new WebSocket(`${proto}://${location.host}/ws?role=${role}&pin=${encodeURIComponent(pin || '')}`)
      ws.current = sock
      let rejected = false
      sock.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data))
        if (msg.type === 'hello') {
          rejected = !msg.authed
          if (msg.uiLang) void i18n.changeLanguage(msg.uiLang)
          setStatus(msg.authed ? 'online' : 'badpin')
          setLockedSec(msg.locked || 0)
          if (msg.authed) attempt = 0
        } else if (msg.type === 'state') setState(msg.state)
        else if (msg.type === 'progress') setProgress(msg.progress)
      }
      sock.onclose = () => {
        if (closed) return
        // Only an explicit "wrong PIN" from the server stops us. Any other close — Wi-Fi
        // drop, app restarted, server briefly off, or a retry that failed before the
        // server could say hello — keeps retrying (it used to give up after one failure,
        // leaving the phone frozen on stale slides with buttons that did nothing).
        if (rejected) return
        setStatus('offline')
        attempt++
        retry = setTimeout(connect, Math.min(1000 * attempt, 5000))
      }
    }
    setStatus('connecting')
    connect()
    return () => {
      closed = true
      clearTimeout(retry)
      ws.current?.close()
    }
  }, [role, pin, local])

  const send = (cmd: RemoteCommand) => {
    if (local) window.api.live.stageCommand(cmd)
    else if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: 'command', cmd }))
  }

  return { state, progress, status, send, lockedSec }
}
