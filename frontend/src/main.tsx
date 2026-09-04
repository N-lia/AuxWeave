import { RouterProvider } from '@tanstack/react-router'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { installFallbackEditorBridge } from './lib/webmcp/webmcp-editor-bridge'
import { registerAllAuxweaveWebMCPTools } from './lib/webmcp/webmcp-registry'
import { getRouter } from './router'
import './styles.css'

// Eagerly bootstrap WebMCP tools & fallback bridge so Chrome DevTools WebMCP Testing Extension
// and AI agents detect registered tools and working canvas state immediately upon page load.
installFallbackEditorBridge()
void registerAllAuxweaveWebMCPTools()

const router = getRouter()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
