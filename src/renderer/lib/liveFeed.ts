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
    const connect = () => {
      setStatus('connecting')
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const sock = new WebSocket(`${proto}://${location.host}/ws?role=${role}&pin=${encodeURIComponent(pin || '')}`)
      ws.current = sock
      let authed = false
      sock.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data))
        if (msg.type === 'hello') {
          authed = msg.authed
          if (msg.uiLang) void i18n.changeLanguage(msg.uiLang)
          setStatus(msg.authed ? 'online' : 'badpin')
        } else if (msg.type === 'state') setState(msg.state)
        else if (msg.type === 'progress') setProgress(msg.progress)
      }
      sock.onclose = () => {
        if (closed) return
        if (!authed && role === 'remote') return
        setStatus('offline')
        retry = setTimeout(connect, 2000)
      }
    }
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

  return { state, progress, status, send }
}
