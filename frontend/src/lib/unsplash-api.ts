import { getPublicApiBase } from './public-api-base'

/** Max width or height when placing a photo on the canvas (keeps inserts view-sized). */
export const UNSPLASH_PLACE_MAX_EDGE_PX = 800

export function scaleUnsplashToPlaceBox(
  width: number,
  height: number,
  maxEdge = UNSPLASH_PLACE_MAX_EDGE_PX,
) {
  const s = Math.min(1, maxEdge / Math.max(width, height))
  return {
    width: Math.round(width * s),
    height: Math.round(height * s),
  }
}

export type UnsplashPhoto = {
  id: string
  width: number
  height: number
  description: string | null
  alt_description: string | null
  urls: {
    small: string
    regular: string
    full: string
  }
  links: {
    download_location: string
    html: string
  }
  user: {
    name: string
    links: { html: string }
  }
}

async function readErrorMessage(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string }
    if (typeof j.error === 'string') return j.error
  } catch {
    /* ignore */
  }
  return `Request failed (${res.status}).`
}

type FeedJson = {
  data: {
    photos: UnsplashPhoto[]
    hasMore: boolean
  }
}

export async function fetchUnsplashPopular(
  page: number,
  perPage = 20,
): Promise<{ photos: UnsplashPhoto[]; hasMore: boolean; error?: string }> {
  const url = `${getPublicApiBase()}/unsplash/photos?page=${page}&per_page=${perPage}`
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    return {
      photos: [],
      hasMore: false,
      error: await readErrorMessage(res),
    }
  }
  const body = (await res.json()) as FeedJson
  return {
    photos: body.data.photos,
    hasMore: body.data.hasMore,
  }
}

export async function fetchUnsplashSearch(
  query: string,
  page: number,
  perPage = 20,
): Promise<{ photos: UnsplashPhoto[]; hasMore: boolean; error?: string }> {
  const q = query.trim()
  if (!q) {
    return { photos: [], hasMore: false }
  }
  const url = `${getPublicApiBase()}/unsplash/search?q=${encodeURIComponent(q)}&page=${page}&per_page=${perPage}`
  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) {
    return {
      photos: [],
      hasMore: false,
      error: await readErrorMessage(res),
    }
  }
  const body = (await res.json()) as FeedJson
  return {
    photos: body.data.photos,
    hasMore: body.data.hasMore,
  }
}

export async function trackUnsplashDownload(downloadLocation: string): Promise<void> {
  const res = await fetch(`${getPublicApiBase()}/unsplash/download`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ downloadLocation }),
  })
  if (!res.ok) {
    throw new Error(await readErrorMessage(res))
  }
}
