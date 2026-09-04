import type { AuxweaveDocument } from './auxweave-document'
import { renderAuxweaveDocumentToDataUrl } from './auxweave-scene-render'
import { loadVectorBoardDocs } from './auxweave-vector-boards-storage'

const previewCache = new Map<string, string>()
const PREVIEW_CACHE_MAX = 48

function trimPreviewCache() {
  while (previewCache.size > PREVIEW_CACHE_MAX) {
    const first = previewCache.keys().next().value as string | undefined
    if (!first) break
    previewCache.delete(first)
  }
}

export function AuxweaveDocumentPreviewCacheKey(persistId: string, updatedAt: number): string {
  return `${persistId}:${updatedAt}`
}

export function AuxweaveDocumentPreviewEvictPersistId(persistId: string) {
  for (const key of [...previewCache.keys()]) {
    if (key.startsWith(`${persistId}:`)) previewCache.delete(key)
  }
}

export async function renderAuxweaveDocumentPreviewDataUrl(
  doc: AuxweaveDocument,
  persistId: string,
  options?: { maxCssPx?: number; cacheKey?: string },
): Promise<string | null> {
  const cacheKey = options?.cacheKey
  if (cacheKey) {
    const hit = previewCache.get(cacheKey)
    if (hit) return hit
  }
  const maxCssPx = options?.maxCssPx ?? 400
  const maxEdge = Math.max(doc.artboard.width, doc.artboard.height)
  const multiplier = maxEdge > 0 ? Math.max(1, Math.round(Math.min(3, maxCssPx / maxEdge))) : 1

  try {
    const url = await renderAuxweaveDocumentToDataUrl(doc, loadVectorBoardDocs(persistId), {
      multiplier,
      transparent: false,
    })
    if (cacheKey) {
      previewCache.set(cacheKey, url)
      trimPreviewCache()
    }
    return url
  } catch (error) {
    console.error('[Auxweave] document preview failed', error)
    return null
  }
}
