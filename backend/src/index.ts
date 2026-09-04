import './load-env'

import { cors } from '@elysiajs/cors'
import { node } from '@elysiajs/node'
import { Elysia } from 'elysia'
import { env } from './config/env'
import { HttpError } from './lib/http'
import { mediaRoutes } from './routes/media'
import { sponsorRoutes } from './routes/sponsor'
import { unsplashRoutes } from './routes/unsplash'

function corsOrigins(value: string): string | string[] {
  const parts = value
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return parts.length <= 1 ? (parts[0] ?? value) : parts
}

const app = new Elysia({ adapter: node() })
  .use(
    cors({
      origin: corsOrigins(env.CORS_ORIGIN),
      credentials: true,
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  )
  .onError(({ code, error, set }) => {
    if (error instanceof HttpError) {
      set.status = error.status
      return {
        error: error.message,
        details: error.details ?? null,
      }
    }

    if (code === 'VALIDATION') {
      set.status = 400
      return {
        error: 'Invalid request payload',
        details: error.message,
      }
    }

    if (code === 'NOT_FOUND') {
      set.status = 404
      return {
        error: 'Not found',
      }
    }

    console.error(error)
    set.status = 500
    return {
      error: 'Internal server error',
    }
  })

const apiRoutes = new Elysia()
  .get('/', () => ({
    name: 'Auxweave-backend',
    status: 'ok',
  }))
  .get('/health', () => ({
    status: 'ok',
  }))
  .use(mediaRoutes)
  .use(sponsorRoutes)
  .use(unsplashRoutes)

app.use(apiRoutes)
app.group('/api', group => group.use(apiRoutes))

if (!process.env.VERCEL) {
  app.listen(env.PORT)
  console.log(`Auxweave backend running at ${app.server?.hostname}:${app.server?.port}`)
}

export default app

