import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { registerAllAuxweaveWebMCPTools } from './lib/webmcp/webmcp-registry'
import { getRouter } from './router'
import './styles.css'

// Eagerly bootstrap WebMCP tools so Chrome DevTools WebMCP Testing Extension
// and AI agents detect registered tools immediately upon page load.
void registerAllAuxweaveWebMCPTools()

const router = getRouter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
