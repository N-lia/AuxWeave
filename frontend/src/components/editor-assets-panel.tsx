import {
  Cancel01Icon,
  CheckmarkSquare02Icon,
  CloudUploadIcon,
  Delete02Icon,
  Folder01Icon,
  Folder02Icon,
  FolderSyncIcon,
  Link01Icon,
  PlusSignIcon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  type AssetCategory,
  Auxweave_ASSETS_UPDATED_EVENT,
  type DesignAsset,
  detectImageDimensions,
  disconnectLinkedDirectory,
  getLinkedDirectoryHandle,
  idbDeleteProjectAsset,
  idbGetProjectAssets,
  idbSaveProjectAsset,
  inferAssetCategory,
  isFileSystemAccessSupported,
  promptAndLinkLocalDirectory,
  syncAssetsFromDirectoryHandle,
  writeAssetToLocalDirectory,
} from '../lib/auxweave-assets'
import {
  editorSidebarPanelLeftClass,
  editorSidebarPanelTopClass,
} from '../lib/editor-sidebar-panel-layout'

type Props = {
  open: boolean
  onClose: () => void
  documentId?: string
  placeImageObject?: (
    url: string,
    opts?: {
      x?: number
      y?: number
      width?: number
      height?: number
      origin?: 'center' | 'top-left'
    },
  ) => Promise<string | null>
}

export default function EditorAssetsPanel({
  open,
  onClose,
  documentId = 'default-doc',
  placeImageObject,
}: Props) {
  const [assets, setAssets] = useState<DesignAsset[]>([])
  const [activeCategory, setActiveCategory] = useState<AssetCategory | 'all'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [linkedFolderHandle, setLinkedFolderHandle] = useState<FileSystemDirectoryHandle | null>(
    null,
  )
  const [isSyncing, setIsSyncing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 2500)
  }

  // Load assets & check linked directory
  const loadData = useCallback(async () => {
    if (!documentId) return
    const storedAssets = await idbGetProjectAssets(documentId)
    setAssets(storedAssets)

    const handle = await getLinkedDirectoryHandle(documentId)
    setLinkedFolderHandle(handle)
  }, [documentId])

  useEffect(() => {
    if (!open) return
    void loadData()

    const onAssetsUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ docId: string }>).detail
      if (!detail || detail.docId === documentId) {
        void loadData()
      }
    }

    window.addEventListener(Auxweave_ASSETS_UPDATED_EVENT, onAssetsUpdated)
    return () => {
      window.removeEventListener(Auxweave_ASSETS_UPDATED_EVENT, onAssetsUpdated)
    }
  }, [open, loadData, documentId])

  // Handle local folder link
  const handleLinkFolder = async () => {
    try {
      const handle = await promptAndLinkLocalDirectory(documentId)
      if (handle) {
        setLinkedFolderHandle(handle)
        setIsSyncing(true)
        const discovered = await syncAssetsFromDirectoryHandle(documentId, handle)
        setIsSyncing(false)
        await loadData()
        showToast(`Linked to "${handle.name}" (${discovered.length} assets synced)`)
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        console.error('Failed to link directory:', err)
        showToast('Could not access folder')
      }
    }
  }

  const handleDisconnectFolder = async () => {
    await disconnectLinkedDirectory(documentId)
    setLinkedFolderHandle(null)
    showToast('Disconnected local folder')
  }

  const handleSyncFolder = async () => {
    if (!linkedFolderHandle) return
    setIsSyncing(true)
    try {
      const synced = await syncAssetsFromDirectoryHandle(documentId, linkedFolderHandle)
      await loadData()
      showToast(`Synced ${synced.length} assets from folder`)
    } catch (err) {
      console.error('Failed to sync folder:', err)
      showToast('Sync failed')
    } finally {
      setIsSyncing(false)
    }
  }

  // Handle file uploads
  const handleProcessFiles = async (files: FileList | File[]) => {
    const fileList = Array.from(files)
    if (fileList.length === 0) return

    for (const file of fileList) {
      const reader = new FileReader()
      reader.onload = async () => {
        const dataUrl = reader.result as string
        const dims = await detectImageDimensions(dataUrl)
        const category = inferAssetCategory(file.name, file.type)

        const asset: DesignAsset = {
          id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          docId: documentId,
          name: file.name,
          category,
          mimeType: file.type || 'image/png',
          url: dataUrl,
          width: dims.width,
          height: dims.height,
          sizeBytes: file.size,
          addedAt: Date.now(),
          source: 'upload',
        }

        await idbSaveProjectAsset(asset)

        // Write to local folder if connected
        if (linkedFolderHandle) {
          void writeAssetToLocalDirectory(linkedFolderHandle, file.name, file)
        }
      }
      reader.readAsDataURL(file)
    }

    showToast(`Added ${fileList.length} asset${fileList.length > 1 ? 's' : ''}!`)
    await loadData()
  }

  // Canvas placement
  const handlePlaceAsset = async (asset: DesignAsset) => {
    if (placeImageObject) {
      await placeImageObject(asset.url, {
        width: asset.width,
        height: asset.height,
        origin: 'center',
      })
      showToast(`Placed "${asset.name}" on canvas`)
    }
  }

  const handleDeleteAsset = async (assetId: string) => {
    await idbDeleteProjectAsset(documentId, assetId)
    await loadData()
    showToast('Asset removed')
  }

  if (!open) return null

  const filteredAssets = assets.filter(a => {
    const matchesCategory = activeCategory === 'all' || a.category === activeCategory
    const matchesSearch =
      !searchQuery.trim() || a.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
    return matchesCategory && matchesSearch
  })

  return (
    <div
      data-Auxweave-chrome
      className={[
        'pointer-events-auto fixed z-40 flex w-[min(100vw-1.5rem,380px)] max-h-[min(92dvh,740px)] flex-col overflow-hidden rounded-3xl border border-black/[0.08] bg-white/95 backdrop-blur-md shadow-2xl',
        editorSidebarPanelLeftClass,
        editorSidebarPanelTopClass,
      ].join(' ')}
      role="dialog"
      aria-label="Design Assets & Working Directory"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={Folder02Icon} size={18} className="text-blue-600" />
          <span className="text-sm font-bold text-neutral-900">Project Assets</span>
          <span className="rounded-full bg-neutral-100 text-neutral-600 px-2 py-0.5 text-[10px] font-bold">
            {assets.length}
          </span>
        </div>
        <button
          type="button"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-400 hover:bg-black/[0.05] hover:text-neutral-700 transition"
          onClick={onClose}
          aria-label="Close assets"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} />
        </button>
      </div>

      {/* Working Directory Bar (Tier 1 vs Tier 2) */}
      <div className="bg-neutral-50/80 border-b border-black/[0.05] px-4 py-2.5 flex items-center justify-between gap-2 text-xs">
        {linkedFolderHandle ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="font-medium text-neutral-800 truncate" title={linkedFolderHandle.name}>
              {linkedFolderHandle.name}
            </span>
            <span className="rounded bg-emerald-100/70 text-emerald-800 text-[10px] px-1.5 py-0.2 font-semibold">
              Disk
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex h-2 w-2 rounded-full bg-blue-500 shrink-0" />
            <span className="text-[11px] text-neutral-600 truncate">
              Project Storage (Browser IDB)
            </span>
          </div>
        )}

        <div className="flex items-center gap-1 shrink-0">
          {linkedFolderHandle ? (
            <>
              <button
                type="button"
                onClick={handleSyncFolder}
                disabled={isSyncing}
                title="Sync from folder"
                className="p-1 rounded text-neutral-500 hover:text-neutral-900 hover:bg-black/[0.05] transition"
              >
                <HugeiconsIcon
                  icon={FolderSyncIcon}
                  size={14}
                  className={isSyncing ? 'animate-spin text-blue-600' : ''}
                />
              </button>
              <button
                type="button"
                onClick={handleDisconnectFolder}
                className="text-[10px] text-neutral-400 hover:text-red-600 font-medium px-1"
              >
                Unlink
              </button>
            </>
          ) : isFileSystemAccessSupported() ? (
            <button
              type="button"
              onClick={handleLinkFolder}
              className="flex items-center gap-1 rounded-lg border border-black/[0.1] bg-white px-2 py-1 text-[11px] font-medium text-neutral-700 hover:bg-neutral-100 transition shadow-2xs"
            >
              <HugeiconsIcon icon={Folder01Icon} size={13} className="text-neutral-500" />
              <span>Link Folder</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {/* Dropzone / Upload button */}
        <div
          onDragOver={e => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => {
            e.preventDefault()
            setIsDragging(false)
            if (e.dataTransfer.files) {
              void handleProcessFiles(e.dataTransfer.files)
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          className={[
            'cursor-pointer border-2 border-dashed rounded-2xl p-4 text-center transition flex flex-col items-center justify-center gap-1.5',
            isDragging
              ? 'border-blue-600 bg-blue-50/60'
              : 'border-black/[0.1] hover:border-black/25 bg-neutral-50/40 hover:bg-neutral-50/80',
          ].join(' ')}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="hidden"
            onChange={e => {
              if (e.target.files) {
                void handleProcessFiles(e.target.files)
              }
            }}
          />
          <div className="rounded-full bg-blue-100/70 text-blue-600 p-2">
            <HugeiconsIcon icon={CloudUploadIcon} size={20} />
          </div>
          <div className="text-xs font-semibold text-neutral-800">Upload Design Assets</div>
          <p className="text-[10px] text-neutral-400">
            Drag & drop PNG logos, SVG graphics, or photos (or click to browse)
          </p>
        </div>

        {/* Search & Category Filter */}
        <div className="space-y-2">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search assets by name..."
              className="w-full rounded-xl border border-black/[0.1] bg-white py-1.5 pl-8 pr-3 text-xs text-neutral-800 placeholder:text-neutral-400 focus:border-blue-600 focus:outline-none"
            />
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              className="absolute left-2.5 top-2.5 text-neutral-400"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px]">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'logo', label: 'Logos' },
                { id: 'svg', label: 'SVGs' },
                { id: 'icon', label: 'Icons' },
                { id: 'image', label: 'Images' },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCategory(tab.id)}
                className={[
                  'rounded-lg px-2 py-1 font-medium transition whitespace-nowrap',
                  activeCategory === tab.id
                    ? 'bg-neutral-900 text-white font-semibold'
                    : 'bg-neutral-100/80 text-neutral-600 hover:bg-neutral-200/60',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Asset Cards Grid */}
        {filteredAssets.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-400 space-y-1">
            <p className="font-medium text-neutral-500">No assets found</p>
            <p className="text-[11px]">
              {searchQuery ? 'Try a different search query' : 'Upload PNGs, SVGs, or link a folder'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredAssets.map(asset => (
              <div
                key={asset.id}
                className="group relative rounded-2xl border border-black/[0.07] bg-white p-2 hover:border-black/20 hover:shadow-xs transition flex flex-col justify-between"
              >
                {/* Thumbnail */}
                <div
                  onClick={() => handlePlaceAsset(asset)}
                  title={`Click to place on canvas (${asset.width || '?'}×${asset.height || '?'})`}
                  className="relative aspect-square w-full rounded-xl bg-neutral-50 flex items-center justify-center overflow-hidden cursor-pointer group-hover:bg-neutral-100/70 transition"
                >
                  <img
                    src={asset.url}
                    alt={asset.name}
                    className="max-h-full max-w-full object-contain p-2 transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-blue-600/10 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <span className="rounded-full bg-white/95 px-2 py-0.5 text-[9px] font-bold text-blue-700 shadow-xs">
                      + Place
                    </span>
                  </div>
                </div>

                {/* Metadata */}
                <div className="pt-2">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className="text-[11px] font-semibold text-neutral-800 truncate"
                      title={asset.name}
                    >
                      {asset.name}
                    </span>
                    <span className="rounded bg-neutral-100 px-1 py-0.2 text-[9px] font-bold text-neutral-500 uppercase">
                      {asset.category}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-neutral-400 pt-0.5">
                    <span>
                      {asset.width && asset.height ? `${asset.width}×${asset.height}` : 'Vector'}
                    </span>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation()
                        void handleDeleteAsset(asset.id)
                      }}
                      className="text-neutral-300 hover:text-red-600 transition"
                      title="Delete asset"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast Notice */}
      {toastMessage && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-xl bg-neutral-900/90 text-white px-3 py-1.5 text-[11px] font-medium shadow-lg backdrop-blur-sm flex items-center gap-1.5 animate-fade-in">
          <HugeiconsIcon icon={CheckmarkSquare02Icon} size={13} className="text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  )
}
