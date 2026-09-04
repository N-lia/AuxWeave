import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { registerAllAuxweaveWebMCPTools } from './lib/webmcp/webmcp-registry'
import { getRouter } from './router'
import './styles.css'

// Eagerly bootstrap WebMCP tools so Chrome DevTools WebMCP Testing Extension
// and AI agents detect registered tools immediately upon page load.
// NOTE: no headless editor bridge is installed here on purpose — canvas tools
// must fail loudly ("bridge not initialized") when no editor is mounted,
// never succeed silently against a phantom document.
void registerAllAuxweaveWebMCPTools()

const router = getRouter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
