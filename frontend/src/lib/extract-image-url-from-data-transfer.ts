function decodeHtmlAttr(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function firstHttpUrlFromUriList(uriList: string): string | null {
  for (const line of uriList.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    if (/^https?:\/\//i.test(t)) return t
  }
  return null
}

function firstImgSrcFromHtml(html: string): string | null {
  const img = html.match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i)
  if (img?.[1]) return decodeHtmlAttr(img[1])
  const srcset = html.match(/srcset\s*=\s*["']([^"']+)["']/i)
  if (srcset?.[1]) {
    const first = srcset[1].split(',')[0]?.trim().split(/\s+/)[0]
    if (first) return decodeHtmlAttr(first)
  }
  return null
}

/**
 * When dragging an image from a browser tab (e.g. search results), the drop
 * payload is often `text/html` with an `<img src>` and/or `text/uri-list`,
 * not `File` entries. This returns a usable image URL when present.
 */
/** Chrome: `image/png:name.png:https://...` */
function urlFromDownloadUrlPayload(raw: string): string | null {
  const i = raw.indexOf('http://')
  const j = raw.indexOf('https://')
  const k = i >= 0 && j >= 0 ? Math.min(i, j) : Math.max(i, j)
  if (k < 0) return null
  return raw.slice(k).trim() || null
}

export function extractImageUrlFromDataTransfer(dt: DataTransfer): string | null {
  const downloadUrl = dt.getData('DownloadURL')
  if (downloadUrl) {
    const u = urlFromDownloadUrlPayload(downloadUrl)
    if (u) return u
  }

  const html = dt.getData('text/html')
  if (html) {
    const fromImg = firstImgSrcFromHtml(html)
    if (fromImg && /^https?:\/\//i.test(fromImg)) return fromImg
  }

  const uriList = dt.getData('text/uri-list')
  if (uriList) {
    const u = firstHttpUrlFromUriList(uriList)
    if (u) return u
  }

  const plain = dt.getData('text/plain')?.trim()
  if (plain && /^https?:\/\//i.test(plain)) return plain

  return null
}
