/**
 * auxweave-assets.ts
 * Manages project-scoped design assets and hybrid local directory synchronization.
 */

export type AssetCategory = 'image' | 'svg' | 'logo' | 'icon'

export type DesignAsset = {
  id: string
  docId: string
  name: string
  category: AssetCategory
  mimeType: string
  url: string // Data URL or Blob URL
  width?: number
  height?: number
  sizeBytes?: number
  addedAt: number
  source?: 'upload' | 'clipboard' | 'local-folder' | 'canvas'
}

const DB_NAME = 'auxweave-assets-db'
const DB_VERSION = 1
const ASSETS_STORE = 'assets'
const HANDLES_STORE = 'directory-handles'

const memoryAssets = new Map<string, DesignAsset[]>()

export const Auxweave_ASSETS_UPDATED_EVENT = 'auxweave-assets-updated'

function openAssetsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not available in this environment'))
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('Failed to open assets database'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(ASSETS_STORE)) {
        const store = db.createObjectStore(ASSETS_STORE, { keyPath: 'id' })
        store.createIndex('docId', 'docId', { unique: false })
      }
      if (!db.objectStoreNames.contains(HANDLES_STORE)) {
        db.createObjectStore(HANDLES_STORE, { keyPath: 'docId' })
      }
    }
  })
}

/**
 * Retrieves all assets saved for a specific document / working directory.
 */
export async function idbGetProjectAssets(docId: string): Promise<DesignAsset[]> {
  if (!docId) return []
  if (typeof indexedDB === 'undefined') {
    return memoryAssets.get(docId) || []
  }
  try {
    const db = await openAssetsDb()
    return await new Promise<DesignAsset[]>((resolve, reject) => {
      const tx = db.transaction(ASSETS_STORE, 'readonly')
      const index = tx.objectStore(ASSETS_STORE).index('docId')
      const req = index.getAll(docId)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const results = (req.result || []) as DesignAsset[]
        results.sort((a, b) => b.addedAt - a.addedAt)
        resolve(results)
      }
      tx.oncomplete = () => db.close()
    })
  } catch (err) {
    console.warn('Failed to load assets from IndexedDB:', err)
    return memoryAssets.get(docId) || []
  }
}

/**
 * Saves or updates a design asset for a specific document.
 */
export async function idbSaveProjectAsset(asset: DesignAsset): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    const existing = memoryAssets.get(asset.docId) || []
    const filtered = existing.filter(a => a.id !== asset.id)
    memoryAssets.set(asset.docId, [asset, ...filtered])
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(Auxweave_ASSETS_UPDATED_EVENT, { detail: { docId: asset.docId } }),
      )
    }
    return
  }

  const db = await openAssetsDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readwrite')
    const store = tx.objectStore(ASSETS_STORE)
    const req = store.put(asset)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve()
    tx.oncomplete = () => db.close()
  })

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(Auxweave_ASSETS_UPDATED_EVENT, { detail: { docId: asset.docId } }),
    )
  }
}

/**
 * Deletes a design asset by ID.
 */
export async function idbDeleteProjectAsset(docId: string, assetId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    const existing = memoryAssets.get(docId) || []
    memoryAssets.set(
      docId,
      existing.filter(a => a.id !== assetId),
    )
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent(Auxweave_ASSETS_UPDATED_EVENT, { detail: { docId, assetId } }),
      )
    }
    return
  }

  const db = await openAssetsDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(ASSETS_STORE, 'readwrite')
    const store = tx.objectStore(ASSETS_STORE)
    const req = store.delete(assetId)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve()
    tx.oncomplete = () => db.close()
  })

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(Auxweave_ASSETS_UPDATED_EVENT, { detail: { docId, assetId } }),
    )
  }
}

/* ==========================================================================
 * Tier 2: File System Access API (Local Folder Linking)
 * ========================================================================== */

export type LinkedDirectoryMeta = {
  docId: string
  name: string
  handle: FileSystemDirectoryHandle
}

/**
 * Checks if the browser supports the File System Access API directory picker.
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/**
 * Stores a linked FileSystemDirectoryHandle in IndexedDB.
 */
export async function saveLinkedDirectoryHandle(
  docId: string,
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openAssetsDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLES_STORE, 'readwrite')
    const store = tx.objectStore(HANDLES_STORE)
    const req = store.put({ docId, name: handle.name, handle })
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve()
    tx.oncomplete = () => db.close()
  })
}

/**
 * Retrieves the linked FileSystemDirectoryHandle for a document, if any.
 */
export async function getLinkedDirectoryHandle(
  docId: string,
): Promise<FileSystemDirectoryHandle | null> {
  if (!docId) return null
  try {
    const db = await openAssetsDb()
    return await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(HANDLES_STORE, 'readonly')
      const store = tx.objectStore(HANDLES_STORE)
      const req = store.get(docId)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const res = req.result as { handle: FileSystemDirectoryHandle } | undefined
        resolve(res?.handle ?? null)
      }
      tx.oncomplete = () => db.close()
    })
  } catch {
    return null
  }
}

/**
 * Disconnects a linked directory from a document.
 */
export async function disconnectLinkedDirectory(docId: string): Promise<void> {
  if (!docId) return
  const db = await openAssetsDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLES_STORE, 'readwrite')
    const store = tx.objectStore(HANDLES_STORE)
    const req = store.delete(docId)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve()
    tx.oncomplete = () => db.close()
  })
}

/**
 * Prompts the user to pick a local folder, saves the handle, and syncs assets.
 */
export async function promptAndLinkLocalDirectory(
  docId: string,
): Promise<FileSystemDirectoryHandle | null> {
  if (!isFileSystemAccessSupported()) {
    throw new Error('File System Access API is not supported in this browser.')
  }
  const win = window as unknown as {
    showDirectoryPicker: (opts?: {
      mode?: 'read' | 'readwrite'
    }) => Promise<FileSystemDirectoryHandle>
  }
  const handle = await win.showDirectoryPicker({ mode: 'readwrite' })
  await saveLinkedDirectoryHandle(docId, handle)
  return handle
}

/**
 * Synchronizes assets with the local directory handle:
 * Discovers any images or SVGs inside an `assets/` subdirectory (or root of folder).
 */
export async function syncAssetsFromDirectoryHandle(
  docId: string,
  dirHandle: FileSystemDirectoryHandle,
): Promise<DesignAsset[]> {
  const discoveredAssets: DesignAsset[] = []

  let targetDir = dirHandle
  try {
    targetDir = await dirHandle.getDirectoryHandle('assets', { create: false })
  } catch {
    // If no 'assets' subfolder exists, read from root dirHandle directly
    targetDir = dirHandle
  }

  const validExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.svg']
  const dirHandleEntries = (
    targetDir as unknown as { values: () => AsyncIterable<FileSystemHandle> }
  ).values()

  for await (const entry of dirHandleEntries) {
    if (entry.kind === 'file') {
      const lowerName = entry.name.toLowerCase()
      const isMatch = validExtensions.some(ext => lowerName.endsWith(ext))
      if (!isMatch) continue

      const fileHandle = entry as FileSystemFileHandle
      const file = await fileHandle.getFile()
      const mimeType = file.type || (lowerName.endsWith('.svg') ? 'image/svg+xml' : 'image/png')
      const blobUrl = URL.createObjectURL(file)

      let category: AssetCategory = 'image'
      if (lowerName.includes('logo')) category = 'logo'
      else if (lowerName.includes('icon')) category = 'icon'
      else if (lowerName.endsWith('.svg')) category = 'svg'

      const dimensions = await detectImageDimensions(blobUrl)

      const asset: DesignAsset = {
        id: `local-${entry.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        docId,
        name: entry.name,
        category,
        mimeType,
        url: blobUrl,
        width: dimensions.width,
        height: dimensions.height,
        sizeBytes: file.size,
        addedAt: file.lastModified || Date.now(),
        source: 'local-folder',
      }
      discoveredAssets.push(asset)
      // Save in indexedDB as well for fast retrieval
      await idbSaveProjectAsset(asset)
    }
  }

  return discoveredAssets
}

/**
 * Saves a new file to the linked local directory's `assets/` subfolder.
 */
export async function writeAssetToLocalDirectory(
  dirHandle: FileSystemDirectoryHandle,
  filename: string,
  content: Blob,
): Promise<void> {
  try {
    const assetsDir = await dirHandle.getDirectoryHandle('assets', { create: true })
    const fileHandle = await assetsDir.getFileHandle(filename, { create: true })
    const writable = await (
      fileHandle as unknown as { createWritable: () => Promise<FileSystemWritableFileStream> }
    ).createWritable()
    await writable.write(content)
    await writable.close()
  } catch (err) {
    console.warn('Could not write asset to local directory:', err)
  }
}

/* ==========================================================================
 * Helper Utilities
 * ========================================================================== */

export function detectImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    if (typeof window === 'undefined' || !url) {
      return resolve({ width: 400, height: 400 })
    }
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth || 400, height: img.naturalHeight || 400 })
    }
    img.onerror = () => {
      resolve({ width: 400, height: 400 })
    }
    img.src = url
  })
}

/**
 * Infers category ('logo' | 'icon' | 'svg' | 'image') from name and mimeType.
 */
export function inferAssetCategory(name: string, mimeType: string): AssetCategory {
  const lower = name.toLowerCase()
  if (lower.includes('logo')) return 'logo'
  if (lower.includes('icon')) return 'icon'
  if (mimeType.includes('svg') || lower.endsWith('.svg')) return 'svg'
  return 'image'
}
