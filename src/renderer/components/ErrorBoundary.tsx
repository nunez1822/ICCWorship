import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  /** what to show instead of the broken part; `reset` tries rendering it again */
  fallback: (reset: () => void) => ReactNode
  /** render again automatically when any of these change (e.g. the live slide, the page) */
  resetKeys?: unknown[]
  onError?: (error: Error, info: ErrorInfo) => void
  children: ReactNode
}

/**
 * Keeps a rendering bug in one part of a window from blanking the whole window. During a service that matters:
 * a slide that can't be drawn must not take the keyboard shortcuts, the phone remote or the next slide with it.
 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
  }

  componentDidUpdate(prev: Props): void {
    if (!this.state.failed) return
    const a = prev.resetKeys || []
    const b = this.props.resetKeys || []
    if (a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]))) this.setState({ failed: false })
  }

  reset = (): void => this.setState({ failed: false })

  render(): ReactNode {
    return this.state.failed ? this.props.fallback(this.reset) : this.props.children
  }
}

/** Short, content-free description of an error for the log (never include slide text). */
export function errorSummary(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 200)
  return String(e).slice(0, 200)
}
