/**
 * Base URL for the Elysia HTTP API (no trailing slash).
 *
 * **Production (Vercel):** `experimentalServices.backend.routePrefix` is `/api`
 * (see repo root `vercel.json`). The browser calls same-origin `/api/...`; no Vite
 * proxy is involved.
 *
 * **Local dev:** Either:
 * - Leave `VITE_PUBLIC_API_URL` unset and use Vite `server.proxy` in
 *   `vite.config.ts` to forward `/api` → `http://localhost:3001` with the path
 *   rewritten so the backend sees `/unsplash`, `/documents`, etc., or
 * - Set `VITE_PUBLIC_API_URL=http://localhost:3001` and call the backend
 *   directly (ensure backend `CORS_ORIGIN` includes your Vite dev origin).
 */
export function getPublicApiBase(): string {
  const raw = import.meta.env.VITE_PUBLIC_API_URL as string | undefined
  const trimmed = raw?.trim()
  if (trimmed) return trimmed.replace(/\/$/, '')
  return '/api'
}
