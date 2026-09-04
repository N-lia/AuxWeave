import { isIP } from 'node:net'
import { Elysia, t } from 'elysia'
import { HttpError } from '../lib/http'

const IMAGE_ACCEPT_HEADER = 'image/*,*/*;q=0.8'

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return true
  }

  const ipVersion = isIP(host)
  if (ipVersion === 4) {
    const parts = host.split('.').map(part => Number(part))
    const [a = 0, b = 0] = parts
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    )
  }

  if (ipVersion === 6) {
    return (
      host === '::' ||
      host === '::1' ||
      host.startsWith('fe80:') ||
      host.startsWith('fc') ||
      host.startsWith('fd')
    )
  }

  return false
}

function assertAllowedImageUrl(target: URL): void {
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new HttpError(400, 'Invalid image URL.')
  }
  if (isBlockedHostname(target.hostname)) {
    throw new HttpError(400, 'This image host is not allowed.')
  }
}

async function fetchImageUpstream(target: URL): Promise<Response> {
  let current = target
  for (let hop = 0; hop < 5; hop += 1) {
    assertAllowedImageUrl(current)
    let upstream: Response
    try {
      upstream = await fetch(current, {
        redirect: 'manual',
        headers: {
          Accept: IMAGE_ACCEPT_HEADER,
        },
      })
    } catch {
      throw new HttpError(502, 'Could not fetch image.')
    }

    if (upstream.status >= 300 && upstream.status < 400) {
      const location = upstream.headers.get('location')
      if (!location) {
        throw new HttpError(502, 'Image redirect was missing a location.')
      }
      try {
        current = new URL(location, current)
      } catch {
        throw new HttpError(502, 'Image redirect was invalid.')
      }
      continue
    }

    return upstream
  }

  throw new HttpError(502, 'Too many image redirects.')
}

function assertImageResponseContentType(contentType: string): void {
  if (contentType && !contentType.toLowerCase().startsWith('image/')) {
    throw new HttpError(415, 'The requested URL did not return an image.')
  }
}

function trimContentType(contentType: string | null): string {
  return contentType?.split(';')[0]?.trim() ?? ''
}

export const mediaRoutes = new Elysia({ prefix: '/media' }).get(
  '/proxy',
  async ({ query }) => {
    let target: URL
    try {
      target = new URL(query.url)
    } catch {
      throw new HttpError(400, 'Invalid image URL.')
    }
    const upstream = await fetchImageUpstream(target)

    if (!upstream.ok) {
      throw new HttpError(502, `Image fetch failed (${upstream.status}).`)
    }

    const contentType = trimContentType(upstream.headers.get('content-type'))
    assertImageResponseContentType(contentType)

    const body = await upstream.arrayBuffer()
    return new Response(body, {
      headers: {
        'cache-control': 'public, max-age=3600',
        'content-type': contentType || 'application/octet-stream',
        'x-content-type-options': 'nosniff',
      },
    })
  },
  {
    query: t.Object({
      url: t.String({ minLength: 1 }),
    }),
  },
)
