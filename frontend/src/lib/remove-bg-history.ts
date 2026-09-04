const DB_NAME = 'auxweave-remove-bg'
const DB_VERSION = 1
const STORE = 'processed-images'
const DEFAULT_LIMIT = 12

export type RemoveBgHistoryItem = {
  id: string
  createdAt: number
  filename: string
  sourceName: string
  originalBlob: Blob
  resultBlob: Blob
}

type StoredRemoveBgHistoryItem = {
  id?: unknown
  createdAt?: unknown
  filename?: unknown
  sourceName?: unknown
  originalBlob?: unknown
  resultBlob?: unknown
}

function normalizeHistoryItem(row: StoredRemoveBgHistoryItem): RemoveBgHistoryItem | null {
  if (
    typeof row.id !== 'string' ||
    typeof row.filename !== 'string' ||
    !(row.originalBlob instanceof Blob) ||
    !(row.resultBlob instanceof Blob)
  ) {
    return null
  }

  return {
    id: row.id,
    createdAt: Number.isFinite(row.createdAt) ? Number(row.createdAt) : Date.now(),
    filename: row.filename.trim() || 'image-no-bg.png',
    sourceName:
      typeof row.sourceName === 'string' && row.sourceName.trim() ? row.sourceName : row.filename,
    originalBlob: row.originalBlob,
    resultBlob: row.resultBlob,
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available.'))
      return
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed.'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
  })
}

export async function listRemoveBgHistory(): Promise<RemoveBgHistoryItem[]> {
  const db = await openDb()
  try {
    return await new Promise<RemoveBgHistoryItem[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB list failed.'))
      const req = tx.objectStore(STORE).getAll()
      req.onerror = () => reject(req.error ?? new Error('IndexedDB getAll failed.'))
      req.onsuccess = () => {
        const items = (req.result as StoredRemoveBgHistoryItem[])
          .map(row => normalizeHistoryItem(row))
          .filter((item): item is RemoveBgHistoryItem => item != null)
        items.sort((a, b) => b.createdAt - a.createdAt)
        resolve(items)
      }
    })
  } finally {
    db.close()
  }
}

export async function putRemoveBgHistoryItem(
  item: RemoveBgHistoryItem,
  opts?: { limit?: number },
): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed.'))
      tx.oncomplete = () => resolve()
      tx.objectStore(STORE).put(item)
    })
  } finally {
    db.close()
  }

  await pruneRemoveBgHistory(opts?.limit ?? DEFAULT_LIMIT)
}

export async function deleteRemoveBgHistoryItem(id: string): Promise<void> {
  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed.'))
      tx.oncomplete = () => resolve()
      tx.objectStore(STORE).delete(id)
    })
  } finally {
    db.close()
  }
}

export async function pruneRemoveBgHistory(limit = DEFAULT_LIMIT): Promise<void> {
  const items = await listRemoveBgHistory()
  const stale = items.slice(limit)
  if (stale.length === 0) return

  const db = await openDb()
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB prune failed.'))
      tx.oncomplete = () => resolve()
      const store = tx.objectStore(STORE)
      for (const item of stale) store.delete(item.id)
    })
  } finally {
    db.close()
  }
}
