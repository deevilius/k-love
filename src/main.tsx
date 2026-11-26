import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createHashRouter } from 'react-router-dom'
import '@fontsource-variable/nunito'
import '@fontsource/gowun-batang/400.css'
import '@fontsource/gowun-batang/700.css'
import './index.css'
import App from './App'
import { installErrorLog } from './lib/diagnostics'

installErrorLog()

// Daten-Router (statt <HashRouter>), damit Formulare beim Verlassen nachfragen können (useBlocker)
const router = createHashRouter([{ path: '*', element: <App /> }])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
