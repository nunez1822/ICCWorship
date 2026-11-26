import { useEffect, useState } from 'react'

/**
 * The PIN a phone or stage screen uses: from a `#pin=123456` link (the QR codes in Settings) — remembered for
 * next time and removed from the address bar — or the one remembered from before.
 */
export function readPin(): string {
  const fromHash = /pin=(\d+)/.exec(location.hash)?.[1]
  if (fromHash) {
    try {
      localStorage.setItem('icc-pin', fromHash)
    } catch {
      /* ignore */
    }
    history.replaceState(null, '', location.pathname)
    return fromHash
  }
  try {
    return localStorage.getItem('icc-pin') || ''
  } catch {
    return ''
  }
}

export function rememberPin(pin: string): void {
  try {
    localStorage.setItem('icc-pin', pin)
  } catch {
    /* ignore */
  }
}

/** The current PIN, updated when a new #pin=… link is opened in the same tab (scanning the QR code again). */
export function usePin(): [string, (p: string) => void] {
  const [pin, setPin] = useState(readPin)
  useEffect(() => {
    const onHash = () => {
      if (/pin=\d+/.test(location.hash)) setPin(readPin())
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return [pin, setPin]
}
