import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Auxweave_MOODBOARD_STORAGE_KEY,
  createEmptyMoodboard,
  imageSignature,
  loadActiveMoodboardId,
  loadMoodboardsFromStorage,
  type Moodboard,
  migrateMoodboardSeed,
  saveActiveMoodboardId,
  saveMoodboardsToStorage,
} from '../lib/auxweave-moodboard'

const DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

function userImage(id: string): Moodboard['items'][number] {
  return {
    id,
    url: DATA_URL,
    source: 'upload',
    title: 'My reference',
    colors: ['#111111'],
    addedAt: 1,
  }
}

function seedBoard(): Moodboard {
  // Real seeded boards persisted `isDefault: true` (legacy marker).
  return {
    id: 'mb-default',
    name: 'Primary Moodboard',
    isDefault: true,
    items: [
      {
        id: 'mb-item-sample-1',
        url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80',
        source: 'pinterest' as never,
        title: 'Abstract Gradient Form',
        addedAt: 1,
      },
      {
        id: 'mb-item-sample-2',
        url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80',
        source: 'behance' as never,
        title: 'Editorial Typography',
        addedAt: 2,
      },
    ],
    colorPalette: ['#2b2d42'],
    createdAt: 0,
  } as Moodboard
}

describe('migrateMoodboardSeed', () => {
  it('removes the hardcoded seed board entirely', () => {
    const { boards, changed } = migrateMoodboardSeed([seedBoard()])
    expect(changed).toBe(true)
    expect(boards).toEqual([])
  })

  it('keeps user images that were added to the seeded board', () => {
    const board = { ...seedBoard(), items: [...seedBoard().items, userImage('mine-1')] }
    const { boards, changed } = migrateMoodboardSeed([board])
    expect(changed).toBe(true)
    expect(boards).toHaveLength(1)
    expect(boards[0]!.items.map(i => i.id)).toEqual(['mine-1'])
    // Legacy seed marker is stripped from surviving boards.
    expect('isDefault' in boards[0]!).toBe(false)
  })

  it('drops legacy link items but keeps embedded images', () => {
    const board: Moodboard = {
      id: 'mb-user',
      name: 'Mine',
      items: [
        userImage('img-1'),
        {
          id: 'link-1',
          url: 'https://www.behance.net/gallery/123',
          source: 'behance' as never,
          addedAt: 2,
        },
        {
          id: 'link-2',
          url: 'https://example.com/photo.jpg',
          source: 'web' as never,
          addedAt: 3,
        },
      ],
      createdAt: 0,
    }
    const { boards, changed } = migrateMoodboardSeed([board])
    expect(changed).toBe(true)
    expect(boards[0]!.items.map(i => i.id)).toEqual(['img-1'])
  })

  it('leaves clean user boards untouched', () => {
    const board: Moodboard = {
      id: 'mb-user',
      name: 'Mine',
      items: [userImage('img-1')],
      createdAt: 0,
    }
    const { boards, changed } = migrateMoodboardSeed([board])
    expect(changed).toBe(false)
    expect(boards).toEqual([board])
  })
})

describe('moodboard storage (no seeding)', () => {
  const backing = new Map<string, string>()

  afterEach(() => vi.unstubAllGlobals())

  beforeEach(() => {
    backing.clear()
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
      setItem: (k: string, v: string) => void backing.set(k, String(v)),
      removeItem: (k: string) => void backing.delete(k),
      clear: () => backing.clear(),
    })
  })

  it('starts empty and never seeds', () => {
    expect(loadMoodboardsFromStorage('doc-1')).toEqual([])
    // No seed write happened.
    expect(backing.has(`${Auxweave_MOODBOARD_STORAGE_KEY}-doc-1`)).toBe(false)
  })

  it('migrates legacy seed storage on load and writes back', () => {
    backing.set(`${Auxweave_MOODBOARD_STORAGE_KEY}-doc-1`, JSON.stringify([seedBoard()]))
    expect(loadMoodboardsFromStorage('doc-1')).toEqual([])
    expect(backing.get(`${Auxweave_MOODBOARD_STORAGE_KEY}-doc-1`)).toBe('[]')
  })

  it('round-trips user boards per document', () => {
    const board: Moodboard = {
      id: 'mb-1',
      name: 'Refs',
      items: [userImage('img-1')],
      createdAt: 0,
    }
    saveMoodboardsToStorage([board], 'doc-9')
    expect(loadMoodboardsFromStorage('doc-9')).toEqual([board])
    expect(loadMoodboardsFromStorage('other-doc')).toEqual([])
  })

  it('resolves the active board id with empty-safe fallbacks', () => {
    expect(loadActiveMoodboardId([], 'doc-1')).toBe('')
    const boards: Moodboard[] = [
      { id: 'a', name: 'A', items: [], createdAt: 0 },
      { id: 'b', name: 'B', items: [], createdAt: 0 },
    ]
    expect(loadActiveMoodboardId(boards, 'doc-1')).toBe('a')
    saveActiveMoodboardId('b', 'doc-1')
    expect(loadActiveMoodboardId(boards, 'doc-1')).toBe('b')
    // Stale stored id falls back to the first board.
    saveActiveMoodboardId('gone', 'doc-1')
    expect(loadActiveMoodboardId(boards, 'doc-1')).toBe('a')
  })
})

describe('moodboard helpers', () => {
  it('creates empty user boards with unique ids', () => {
    const a = createEmptyMoodboard('Refs')
    const b = createEmptyMoodboard('  ')
    expect(a.name).toBe('Refs')
    expect(a.items).toEqual([])
    expect(b.name).toBe('Moodboard')
    expect(a.id).not.toBe(b.id)
  })

  it('produces stable image signatures for dedupe', () => {
    expect(imageSignature(DATA_URL)).toBe(imageSignature(DATA_URL))
    expect(imageSignature(`${DATA_URL}extra`)).not.toBe(imageSignature(DATA_URL))
  })
})
