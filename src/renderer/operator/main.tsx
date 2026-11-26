import { createRoot } from 'react-dom/client'
import i18n from '../i18n'
import '../lib/noDropNavigation'
import '../styles/app.css'
import { App } from './App'
import { ErrorBoundary, errorSummary } from '../components/ErrorBoundary'

// Each page has its own error boundary (see App), which logs what it catches. This one catches the rest (top
// bar, overlays): instead of a blank window it offers a reload — the projector and the phone keep working.
createRoot(document.getElementById('root')!, {
  onUncaughtError: (e) => window.api.app.log('error', `operator (uncaught): ${errorSummary(e)}`)
}).render(
  <ErrorBoundary
    onError={(e) => window.api.app.log('error', `operator: ${errorSummary(e)}`)}
    fallback={(reset) => (
      <div className="page">
        <div className="card col" style={{ maxWidth: 640, margin: '40px auto' }}>
          <h2>⚠ {i18n.t('boundary.windowTitle')}</h2>
          <div>{i18n.t('boundary.windowBody')}</div>
          <div className="row">
            <button className="btn primary" onClick={() => location.reload()}>
              ↻ {i18n.t('boundary.reload')}
            </button>
            <button className="btn" onClick={reset}>
              {i18n.t('boundary.retry')}
            </button>
          </div>
        </div>
      </div>
    )}
  >
    <App />
  </ErrorBoundary>
)
