export const Auxweave_MOODBOARD_STORAGE_KEY = 'auxweave-editor-moodboards'
export const Auxweave_MOODBOARD_ACTIVE_BOARD_STORAGE_KEY = 'auxweave-editor-moodboards-active-board'

/** Fired on `window` whenever moodboard data changes in storage. */
export const Auxweave_MOODBOARD_UPDATED_EVENT = 'auxweave-moodboard-updated'

/**
 * Where a reference image came from. Moodboards are image-only: files added
 * via upload/drag-and-drop (`upload`) or pasted from the clipboard
 * (`clipboard`). Link/URL references are not supported.
 */
export type MoodboardItemSource = 'upload' | 'clipboard'

export type MoodboardItem = {
  id: string
  /** `data:image/...` URL of the pasted, dropped, or uploaded image. */
  url: string
  source?: MoodboardItemSource
  title?: string
  width?: number
  height?: number
  colors?: string[]
  addedAt: number
}

export type Moodboard = {
  id: string
  name: string
  description?: string
  tags?: string[]
  items: MoodboardItem[]
  colorPalette?: string[]
  createdAt: number
}

/** Boards start empty and user-created. Nothing is ever seeded. */
export function createEmptyMoodboard(name: string): Moodboard {
  const trimmed = name.trim() || 'Moodboard'
  return {
    id: `mb-${crypto.randomUUID()}`,
    name: trimmed,
    items: [],
    colorPalette: [],
    createdAt: Date.now(),
  }
}

// ---------------------------------------------------------------------------
// One-time migration away from the legacy hardcoded seed + link items.
// ---------------------------------------------------------------------------

const LEGACY_SEED_ITEM_IDS = new Set(['mb-item-sample-1', 'mb-item-sample-2'])
const LEGACY_SEED_PHOTO_IDS = [
  'photo-1618005182384-a83a8bd57fbe',
  'photo-1579783902614-a3fb3927b675',
]

function isSeedSampleItem(item: MoodboardItem): boolean {
  if (LEGACY_SEED_ITEM_IDS.has(item.id)) return true
  return LEGACY_SEED_PHOTO_IDS.some(photoId => item.url.includes(photoId))
}

function isLinkItem(item: MoodboardItem): boolean {
  // Only embedded images from the image intake paths (upload/drop/paste) are
  // kept. Anything else is a legacy link reference.
  return !item.url.startsWith('data:image/')
}

/**
 * Pure migration: strips hardcoded sample items and legacy link references,
 * and drops boards that were themselves seeded (marked `isDefault`) once they
 * hold no user content. User-added images are never touched.
 */
export function migrateMoodboardSeed(boards: Moodboard[]): {
  boards: Moodboard[]
  changed: boolean
} {
  let changed = false
  const next: Moodboard[] = []
  for (const board of boards) {
    const items = (board.items || []).filter(item => {
      if (isSeedSampleItem(item) || isLinkItem(item)) {
        changed = true
        return false
      }
      return true
    })
    const seeded = (board as { isDefault?: boolean }).isDefault === true
    if (seeded && items.length === 0) {
      changed = true
      continue
    }
    if (items.length !== (board.items || []).length || seeded) {
      const { isDefault: _dropped, ...rest } = board as Moodboard & { isDefault?: boolean }
      void _dropped
      next.push({ ...rest, items })
      if (seeded) changed = true
    } else {
      next.push(board)
    }
  }
  return { boards: next, changed }
}

export function getActiveDocumentId(): string | undefined {
  if (typeof window === 'undefined') return undefined
  return (window as unknown as { __Auxweave_ACTIVE_DOC_ID__?: string }).__Auxweave_ACTIVE_DOC_ID__
}

export function getMoodboardStorageKey(docId?: string): string {
  const activeId = docId || getActiveDocumentId()
  return activeId ? `${Auxweave_MOODBOARD_STORAGE_KEY}-${activeId}` : Auxweave_MOODBOARD_STORAGE_KEY
}

export function getActiveMoodboardIdStorageKey(docId?: string): string {
  const activeId = docId || getActiveDocumentId()
  return activeId
    ? `${Auxweave_MOODBOARD_ACTIVE_BOARD_STORAGE_KEY}-${activeId}`
    : Auxweave_MOODBOARD_ACTIVE_BOARD_STORAGE_KEY
}

export function loadMoodboardsFromStorage(docId?: string): Moodboard[] {
  if (typeof window === 'undefined') return []
  try {
    const key = getMoodboardStorageKey(docId)
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Moodboard[]
    if (!Array.isArray(parsed)) return []
    const { boards, changed } = migrateMoodboardSeed(parsed)
    if (changed) {
      localStorage.setItem(key, JSON.stringify(boards))
    }
    return boards
  } catch (err) {
    console.error('Failed to load moodboards from storage:', err)
    return []
  }
}

export function saveMoodboardsToStorage(boards: Moodboard[], docId?: string) {
  if (typeof window === 'undefined') return
  try {
    const key = getMoodboardStorageKey(docId)
    const serialized = JSON.stringify(boards)
    // No-op when nothing changed: skips both the write and the update event
    // so persist effects can never echo into an update loop.
    if (localStorage.getItem(key) === serialized) return
    localStorage.setItem(key, serialized)
    window.dispatchEvent(
      new CustomEvent(Auxweave_MOODBOARD_UPDATED_EVENT, {
        detail: { docId: docId || getActiveDocumentId() },
      }),
    )
  } catch (err) {
    console.error('Failed to save moodboards to storage:', err)
  }
}

/** Reads the id of the moodboard that should receive newly added items. */
export function loadActiveMoodboardId(boards: Moodboard[], docId?: string): string {
  const fallback = boards[0]?.id ?? ''
  if (typeof window === 'undefined') return fallback
  try {
    const key = getActiveMoodboardIdStorageKey(docId)
    const stored = localStorage.getItem(key)
    if (stored && boards.some(b => b.id === stored)) return stored
  } catch {
    // ignore read errors, fall back below
  }
  return fallback
}

export function saveActiveMoodboardId(boardId: string, docId?: string) {
  if (typeof window === 'undefined') return
  try {
    const key = getActiveMoodboardIdStorageKey(docId)
    localStorage.setItem(key, boardId)
  } catch (err) {
    console.error('Failed to save active moodboard id to storage:', err)
  }
}

/** Short stable signature of an embedded image, used to skip exact duplicates. */
export function imageSignature(dataUrl: string): string {
  return `${dataUrl.length}:${dataUrl.slice(0, 96)}`
}

/**
 * Appends an image item directly to storage. Returns the updated boards and
 * the newly created item, or `null` if there is no board to add to.
 */
export function appendMoodboardItem(
  boardId: string | null,
  item: Omit<MoodboardItem, 'id' | 'addedAt'>,
  docId?: string,
): { boards: Moodboard[]; item: MoodboardItem } | null {
  const activeDocId = docId || getActiveDocumentId()
  const boards = loadMoodboardsFromStorage(activeDocId)
  const targetId = (boardId && boards.some(b => b.id === boardId) ? boardId : null) ?? boards[0]?.id
  if (!targetId) return null

  const newItem: MoodboardItem = {
    ...item,
    id: `mb-item-${crypto.randomUUID()}`,
    addedAt: Date.now(),
  }

  const nextBoards = boards.map(board => {
    if (board.id !== targetId) return board
    const items = [newItem, ...board.items]
    return { ...board, items }
  })

  saveMoodboardsToStorage(nextBoards, activeDocId)
  return { boards: nextBoards, item: newItem }
}
