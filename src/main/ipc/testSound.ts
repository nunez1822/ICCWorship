// Settings → Screens → Test sound: the projector plays a short tone through the chosen output and answers.
import { open, send, wins } from '../appState'

export type TestSoundResult = { ok: boolean; error?: 'closed' | 'failed' }

let waiter: ((r: TestSoundResult) => void) | null = null

export function testSound(): Promise<TestSoundResult> {
  return new Promise<TestSoundResult>((resolve) => {
    if (!open(wins.output)) return resolve({ ok: false, error: 'closed' })
    waiter?.({ ok: false, error: 'failed' })
    const timer = setTimeout(() => {
      waiter = null
      resolve({ ok: false, error: 'failed' })
    }, 5000)
    waiter = (r) => {
      clearTimeout(timer)
      waiter = null
      resolve(r)
    }
    send(wins.output, 'output:testSound')
  })
}

/** the projector's answer */
export function testSoundAnswered(ok: boolean): void {
  waiter?.(ok ? { ok: true } : { ok: false, error: 'failed' })
}
