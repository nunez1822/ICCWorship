import { createRoot } from 'react-dom/client'
import '../i18n'
import '../lib/noDropNavigation'
import '../styles/app.css'
import { App } from './App'
import { errorSummary } from '../components/ErrorBoundary'

// rendering errors go to the log file (each page also has its own error boundary, see App)
createRoot(document.getElementById('root')!, {
  onCaughtError: (e) => window.api.app.log('error', `operator: ${errorSummary(e)}`),
  onUncaughtError: (e) => window.api.app.log('error', `operator (uncaught): ${errorSummary(e)}`)
}).render(<App />)
