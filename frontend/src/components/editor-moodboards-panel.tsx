import {
  Add01Icon,
  Cancel01Icon,
  CheckmarkSquare01Icon,
  ClipboardIcon,
  CloudUploadIcon,
  Delete02Icon,
  GridViewIcon,
  PlusSignIcon,
  SparklesIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  Auxweave_MOODBOARD_UPDATED_EVENT,
  createEmptyMoodboard,
  imageSignature,
  loadActiveMoodboardId,
  loadMoodboardsFromStorage,
  type Moodboard,
  type MoodboardItem,
  type MoodboardItemSource,
  saveActiveMoodboardId,
  saveMoodboardsToStorage,
} from '../lib/auxweave-moodboard'
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
  onSyncToCanvas?: (board: Moodboard) => void
}

type NewImage = {
  dataUrl: string
  title: string
  source: MoodboardItemSource
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export default function EditorMoodboardsPanel({
  open,
  onClose,
  documentId,
  placeImageObject,
  onSyncToCanvas,
}: Props) {
  const [boards, setBoards] = useState<Moodboard[]>(() => loadMoodboardsFromStorage(documentId))
  const [activeBoardId, setActiveBoardId] = useState<string>(() =>
    loadActiveMoodboardId(loadMoodboardsFromStorage(documentId), documentId),
  )
  const [isAddingBoard, setIsAddingBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [activity, setActivity] = useState<{ verb: string; count: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragDepthRef = useRef(0)
  const noticeTimerRef = useRef<number | null>(null)

  // Latest boards for async intake continuations (avoids stale closures when
  // drops/pastes overlap while color extraction is in flight).
  const boardsRef = useRef(boards)
  const activeBoardIdRef = useRef(activeBoardId)
  boardsRef.current = boards
  activeBoardIdRef.current = activeBoardId

  const activeBoard = boards.find(b => b.id === activeBoardId)

  // Re-sync when documentId changes
  useEffect(() => {
    setBoards(loadMoodboardsFromStorage(documentId))
    setActiveBoardId(loadActiveMoodboardId(loadMoodboardsFromStorage(documentId), documentId))
  }, [documentId])

  // Persist state changes
  useEffect(() => {
    saveMoodboardsToStorage(boards, documentId)
    // Expose for WebMCP AI agent context
    if (typeof window !== 'undefined') {
      const win = window as unknown as { __Auxweave_GET_MOODBOARDS__?: () => Moodboard[] }
      win.__Auxweave_GET_MOODBOARDS__ = () => boards
    }
  }, [boards, documentId])

  // Stay in sync with storage writes from elsewhere (e.g. another tab).
  // Compare-then-set: reloading always produces fresh array identities, so
  // blindly setting state would re-trigger the persist effect forever.
  useEffect(() => {
    const syncFromStorage = (e: Event) => {
      const detail = (e as CustomEvent<{ docId: string }>).detail
      if (detail?.docId && detail.docId !== documentId) return
      const next = loadMoodboardsFromStorage(documentId)
      const serialized = JSON.stringify(next)
      setBoards(prev => (JSON.stringify(prev) === serialized ? prev : next))
      setActiveBoardId(prev => {
        if (prev && next.some(b => b.id === prev)) return prev
        return next[0]?.id ?? ''
      })
    }
    window.addEventListener(Auxweave_MOODBOARD_UPDATED_EVENT, syncFromStorage)
    window.addEventListener('storage', syncFromStorage)
    return () => {
      window.removeEventListener(Auxweave_MOODBOARD_UPDATED_EVENT, syncFromStorage)
      window.removeEventListener('storage', syncFromStorage)
    }
  }, [documentId])

  // Remember which board newly added items should land in.
  useEffect(() => {
    if (activeBoardId) saveActiveMoodboardId(activeBoardId, documentId)
  }, [activeBoardId, documentId])

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
    }
  }, [])

  const showNotice = useCallback((msg: string) => {
    setNotice(msg)
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 3000)
  }, [])

  const addImagesToBoard = useCallback(
    async (entries: NewImage[], verb: string) => {
      if (entries.length === 0) return
      const latestBoards = boardsRef.current
      const latestActiveId = activeBoardIdRef.current
      let target = latestBoards.find(b => b.id === latestActiveId)
      let createdBoard: Moodboard | null = null
      if (!target) {
        createdBoard = createEmptyMoodboard(`Moodboard ${latestBoards.length + 1}`)
        target = createdBoard
      }
      const targetId = target.id
      const targetName = target.name

      const known = new Set(target.items.map(i => imageSignature(i.url)))
      const fresh = entries.filter(e => {
        const sig = imageSignature(e.dataUrl)
        if (known.has(sig)) return false
        known.add(sig)
        return true
      })
      if (fresh.length === 0) {
        showNotice(`Those images are already in "${targetName}"`)
        return
      }

      const processed: MoodboardItem[] = fresh.map(entry => ({
        id: `mb-item-${crypto.randomUUID()}`,
        url: entry.dataUrl,
        source: entry.source,
        title: entry.title,
        addedAt: Date.now(),
      }))

      setBoards(prev => {
        const base = createdBoard ? [createdBoard, ...prev] : prev
        return base.map(board => {
          if (board.id !== targetId) return board
          const items = [...processed, ...board.items]
          return { ...board, items }
        })
      })
      if (createdBoard) setActiveBoardId(createdBoard.id)
      const noun = fresh.length === 1 ? 'image' : 'images'
      showNotice(`${verb} ${fresh.length} ${noun} to "${targetName}"`)
    },
    [showNotice],
  )

  const addImageFiles = useCallback(
    async (files: File[], source: MoodboardItemSource, verb: string) => {
      const images = files.filter(f => f.type.startsWith('image/'))
      if (images.length === 0) {
        showNotice('No image files found — drop or paste images only')
        return
      }
      setActivity({ verb, count: images.length })
      try {
        const entries = await Promise.all(
          images.map(async file => ({
            dataUrl: await readFileAsDataUrl(file),
            title: file.name || 'Image reference',
            source,
          })),
        )
        await addImagesToBoard(entries, verb)
      } catch {
        showNotice(`Could not ${verb.toLowerCase()} those images`)
      } finally {
        setActivity(null)
      }
    },
    [addImagesToBoard, showNotice],
  )

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (files.length === 0) return
    void addImageFiles(files, 'upload', 'Uploaded')
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    if (!e.dataTransfer.types.includes('Files')) return
    dragDepthRef.current += 1
    setIsDragging(true)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepthRef.current = 0
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length === 0) return
    void addImageFiles(files, 'upload', 'Dropped')
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files || []).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    e.preventDefault()
    void addImageFiles(files, 'clipboard', 'Pasted')
  }

  const handleCreateBoard = () => {
    if (!newBoardName.trim()) return
    const board = createEmptyMoodboard(newBoardName.trim())
    setBoards(prev => [board, ...prev])
    setActiveBoardId(board.id)
    setNewBoardName('')
    setIsAddingBoard(false)
    showNotice(`Created board "${board.name}"`)
  }

  const handleCreateFirstBoard = () => {
    const board = createEmptyMoodboard(`Moodboard ${boards.length + 1}`)
    setBoards(prev => [board, ...prev])
    setActiveBoardId(board.id)
  }

  const handleDeleteItem = (itemId: string) => {
    if (!activeBoard) return
    setBoards(prev =>
      prev.map(board => {
        if (board.id !== activeBoard.id) return board
        const remaining = board.items.filter(i => i.id !== itemId)
        return { ...board, items: remaining }
      }),
    )
  }

  const handleClearBoard = (boardId: string) => {
    setBoards(prev =>
      prev.map(b => {
        if (b.id !== boardId) return b
        return { ...b, items: [] }
      }),
    )
    showNotice('Cleared all references in board')
  }

  const handleDeleteBoard = (boardId: string) => {
    const doomed = boards.find(b => b.id === boardId)
    const nextBoards = boards.filter(b => b.id !== boardId)
    setBoards(nextBoards)
    if (activeBoardId === boardId) {
      setActiveBoardId(nextBoards[0]?.id ?? '')
    }
    showNotice(doomed ? `Deleted "${doomed.name}"` : 'Moodboard deleted')
  }

  if (!open) return null

  return (
    <div
      data-Auxweave-chrome
      onPaste={handlePaste}
      className={[
        'pointer-events-auto fixed z-40 flex w-[min(100vw-1.5rem,360px)] max-h-[min(92dvh,720px)] flex-col overflow-hidden rounded-3xl border border-black/[0.08] bg-white/95 backdrop-blur-md shadow-xl transition-all',
        editorSidebarPanelLeftClass,
        editorSidebarPanelTopClass,
      ].join(' ')}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-black/[0.06] px-4 py-3">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={GridViewIcon} size={18} className="text-neutral-800" />
          <span className="text-sm font-semibold text-neutral-900">Context Moodboards</span>
          <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 border border-indigo-100">
            <HugeiconsIcon icon={SparklesIcon} size={10} />
            AI Context
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={16} />
        </button>
      </div>

      {/* Board Switcher Bar */}
      {boards.length > 0 ? (
        <div className="flex items-center justify-between border-b border-black/[0.04] bg-neutral-50/60 px-3 py-2">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-[240px]">
            {boards.map(b => {
              const isActive = activeBoardId === b.id
              return (
                <div
                  key={b.id}
                  className={[
                    'group flex items-center shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-all',
                    isActive
                      ? 'bg-neutral-900 text-white shadow-sm'
                      : 'text-neutral-600 hover:bg-black/5 hover:text-neutral-900',
                  ].join(' ')}
                >
                  <button
                    type="button"
                    onClick={() => setActiveBoardId(b.id)}
                    className="truncate max-w-[110px]"
                    title={b.name}
                  >
                    {b.name} ({b.items.length})
                  </button>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      handleDeleteBoard(b.id)
                    }}
                    className={[
                      'ml-1.5 rounded-full p-0.5 transition-colors opacity-60 hover:opacity-100',
                      isActive
                        ? 'hover:bg-white/20 text-white'
                        : 'hover:bg-black/10 text-neutral-500',
                    ].join(' ')}
                    title={`Delete ${b.name}`}
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={11} />
                  </button>
                </div>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => setIsAddingBoard(!isAddingBoard)}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-black/10 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100 shadow-2xs"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={12} />
            New
          </button>
        </div>
      ) : null}

      {/* Notice Banner */}
      {notice ? (
        <div className="flex items-center gap-2 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 border-b border-emerald-100">
          <HugeiconsIcon
            icon={CheckmarkSquare01Icon}
            size={14}
            className="text-emerald-600 shrink-0"
          />
          <span>{notice}</span>
        </div>
      ) : null}

      {/* Create New Board Form */}
      {isAddingBoard ? (
        <div className="border-b border-black/[0.06] bg-neutral-50 p-3">
          <label className="block text-xs font-medium text-neutral-700 mb-1">Board Name</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newBoardName}
              onChange={e => setNewBoardName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateBoard()
              }}
              placeholder="e.g. Editorial Style, Dark Retro"
              className="w-full rounded-xl border border-black/10 bg-white px-3 py-1.5 text-xs outline-none focus:border-neutral-900"
            />
            <button
              type="button"
              onClick={handleCreateBoard}
              className="rounded-xl bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800"
            >
              Add
            </button>
          </div>
        </div>
      ) : null}

      {/* Panel Main Content Scroll */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {boards.length === 0 ? (
          <div className="py-10 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100">
              <HugeiconsIcon icon={GridViewIcon} size={22} className="text-neutral-500" />
            </div>
            <p className="text-sm font-semibold text-neutral-900">No moodboards yet</p>
            <p className="mx-auto max-w-[240px] text-xs leading-relaxed text-neutral-500">
              Create a board to collect design references for you and the AI.
            </p>
            <button
              type="button"
              onClick={handleCreateFirstBoard}
              className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-semibold text-white hover:bg-neutral-800"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={13} />
              Create moodboard
            </button>
          </div>
        ) : (
          <>
            {/* Image Intake Dropzone (drag & drop / upload / paste) */}
            <div
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={[
                'rounded-2xl border p-3 space-y-2 text-center transition-colors',
                isDragging
                  ? 'border-solid border-neutral-900 bg-neutral-900/[0.04]'
                  : 'border-dashed border-black/15 bg-neutral-50/80',
              ].join(' ')}
            >
              <div className="text-xs font-medium text-neutral-700 flex items-center justify-center gap-1.5">
                <HugeiconsIcon
                  icon={activity ? ClipboardIcon : CloudUploadIcon}
                  size={14}
                  className="text-neutral-500 shrink-0"
                />
                <span className={activity ? 'animate-pulse' : undefined}>
                  {isDragging
                    ? 'Drop images to add them'
                    : activity
                      ? `${activity.verb} ${activity.count} ${activity.count === 1 ? 'image' : 'images'}…`
                      : 'Drag & drop images here, upload, or paste from clipboard'}
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={activity !== null}
                  className="flex-1 rounded-xl border border-black/10 bg-white py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 flex items-center justify-center gap-1 disabled:opacity-60"
                >
                  <HugeiconsIcon icon={CloudUploadIcon} size={13} />
                  {activity ? `${activity.verb}…` : 'Upload Files'}
                </button>
                <div
                  className={[
                    'flex-1 rounded-xl border py-1.5 text-xs font-medium flex items-center justify-center gap-1 transition-colors',
                    activity && activity.verb === 'Pasted'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                      : 'border-black/10 bg-white text-neutral-500',
                  ].join(' ')}
                >
                  <HugeiconsIcon icon={ClipboardIcon} size={13} />
                  {activity && activity.verb === 'Pasted' ? 'Pasting…' : 'Ctrl/⌘ + V to paste'}
                </div>
              </div>
            </div>

            {/* Dedicated Moodboard Canvas Artboard Action */}
            {activeBoard ? (
              <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-purple-50/40 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-neutral-900 flex items-center gap-1.5">
                    <HugeiconsIcon icon={SparklesIcon} size={14} className="text-indigo-600" />
                    Dedicated Canvas Artboard
                  </span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100/80 px-1.5 py-0.5 rounded-sm">
                    Proportional View
                  </span>
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed">
                  Display this moodboard on its own dedicated artboard with auto-arranged
                  proportions and AI palette swatches.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (onSyncToCanvas) {
                      onSyncToCanvas(activeBoard)
                      showNotice('Moodboard canvas artboard updated on stage!')
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-neutral-900 py-2 px-3 text-xs font-semibold text-white shadow-sm hover:bg-neutral-800 transition"
                >
                  <HugeiconsIcon icon={GridViewIcon} size={14} className="text-amber-300" />
                  <span>Open as Canvas Artboard</span>
                </button>
              </div>
            ) : null}

            {/* Moodboard Items Grid */}
            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-neutral-700 mb-2">
                <span className="truncate">{activeBoard?.name || 'Moodboard'} Items</span>
                <div className="flex items-center gap-2">
                  {activeBoard && activeBoard.items.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => handleClearBoard(activeBoard.id)}
                      className="text-[11px] text-neutral-500 hover:text-neutral-800 hover:underline transition flex items-center gap-1"
                      title="Clear all references from this board"
                    >
                      Clear Items
                    </button>
                  ) : null}
                  {activeBoard ? (
                    <button
                      type="button"
                      onClick={() => handleDeleteBoard(activeBoard.id)}
                      className="text-[11px] text-rose-500 hover:text-rose-700 hover:underline flex items-center gap-1 transition"
                      title="Delete this moodboard"
                    >
                      <HugeiconsIcon icon={Delete02Icon} size={12} />
                      Delete Board
                    </button>
                  ) : null}
                </div>
              </div>

              {!activeBoard || activeBoard.items.length === 0 ? (
                <div className="py-8 text-center text-xs text-neutral-400">
                  No visual references in this board yet.
                  <br />
                  Drag & drop images, upload files, or paste from clipboard!
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {activeBoard.items.map(item => (
                    <div
                      key={item.id}
                      className="group relative overflow-hidden rounded-2xl border border-black/10 bg-neutral-100 shadow-sm"
                    >
                      <div className="flex items-center justify-center bg-neutral-900/5 p-1 min-h-[130px] max-h-52">
                        <img
                          src={item.url}
                          alt={item.title || 'Moodboard item'}
                          className="max-h-48 w-auto max-w-full rounded-lg object-contain transition-transform duration-300 group-hover:scale-[1.02]"
                        />
                      </div>

                      {/* Badge showing source */}
                      {item.source ? (
                        <span className="absolute top-1.5 left-1.5 rounded-md bg-black/60 backdrop-blur-sm px-1.5 py-0.5 text-[9px] font-semibold text-white uppercase tracking-wider">
                          {item.source}
                        </span>
                      ) : null}

                      {/* Hover Overlay Actions */}
                      <div className="absolute inset-0 flex flex-col justify-between bg-black/40 p-2 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100">
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="rounded-full bg-white/80 p-1 text-rose-600 hover:bg-white"
                            title="Delete reference"
                          >
                            <HugeiconsIcon icon={Delete02Icon} size={12} />
                          </button>
                        </div>

                        {placeImageObject ? (
                          <button
                            type="button"
                            onClick={() => placeImageObject(item.url, { origin: 'center' })}
                            className="flex items-center justify-center gap-1 rounded-xl bg-white py-1.5 text-xs font-semibold text-neutral-900 shadow-sm hover:bg-neutral-100"
                          >
                            <HugeiconsIcon icon={Add01Icon} size={12} />
                            Add to Canvas
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
