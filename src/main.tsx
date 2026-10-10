import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { OFFLINE, VIEWER } from './offline/offline'
import { Viewer } from './report/Viewer'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {VIEWER && OFFLINE ? <Viewer project={OFFLINE.project} layouts={OFFLINE.layouts} /> : <App />}
  </StrictMode>,
)
