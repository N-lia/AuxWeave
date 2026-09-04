import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

const require = createRequire(import.meta.url)

const standardJsonEsm = fileURLToPath(
  new URL('./node_modules/@standard-community/standard-json/dist/index.js', import.meta.url),
)

const proEditorSidebarIconsModule = fileURLToPath(
  new URL('./src/lib/editor-sidebar-icons.pro.ts', import.meta.url),
)

const proHugeiconsBrandIconModule = fileURLToPath(
  new URL('./src/lib/hugeicons-brand-icon.pro.ts', import.meta.url),
)

const hasHugeiconsPro = (() => {
  try {
    require.resolve('@hugeicons-pro/core-solid-rounded/package.json')
    return true
  } catch {
    return false
  }
})()

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  console.info(
    `[icons] ${hasHugeiconsPro ? 'Hugeicons Pro detected' : 'Hugeicons Pro not installed; using free fallback'}`,
  )
  return {
    base: '/',
    resolve: {
      tsconfigPaths: true,
      alias: [
        ...(hasHugeiconsPro
          ? [
              {
                find: /^@\/lib\/editor-sidebar-icons$/,
                replacement: proEditorSidebarIconsModule,
              },
              {
                find: /^@\/lib\/hugeicons-brand-icon$/,
                replacement: proHugeiconsBrandIconModule,
              },
            ]
          : []),
        // Rolldown/Vite 8 can't parse `.cjs` files that contain dynamic
        // `await import(...)`. Force this dep to its ESM entry so the
        // `require` condition from @tambo-ai/client never pulls the CJS
        // shards through the production client build.
        {
          find: /^@standard-community\/standard-json$/,
          replacement: standardJsonEsm,
        },
      ],
    },
    plugins: [tanstackRouter({ target: 'react' }), tailwindcss(), viteReact()],
    server: {
      proxy: {
        '/ingest': {
          target: env.VITE_PUBLIC_POSTHOG_HOST,
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/ingest/, ''),
        },
        // Mirrors production: Vercel mounts the backend at /api (vercel.json).
        // Browser uses same-origin /api; only the dev server proxies to localhost.
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
          rewrite: (path: string) => path.replace(/^\/api/, ''),
        },
        // Nebius Token Factory — proxied to avoid browser CORS restrictions.
        // Browser calls /nebius-proxy/v1/... → https://api.tokenfactory.nebius.com/v1/...
        '/nebius-proxy': {
          target: 'https://api.tokenfactory.nebius.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path: string) => path.replace(/^\/nebius-proxy/, ''),
        },
        // AgentRouter — proxied to supply 'User-Agent: opencode/' and avoid browser UA restrictions.
        // Browser calls /agentrouter-proxy/v1/... → https://agentrouter.org/v1/...
        '/agentrouter-proxy': {
          target: 'https://agentrouter.org',
          changeOrigin: true,
          secure: true,
          headers: {
            'User-Agent': 'opencode/',
          },
          rewrite: (path: string) => path.replace(/^\/agentrouter-proxy/, ''),
        },
      },
    },
  }
})

export default config
