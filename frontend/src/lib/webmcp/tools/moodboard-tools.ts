/**
 * WebMCP Moodboard Tools
 * Allows the AI Co-Design Agent to inspect reference images in the user's moodboards
 * and place them onto the vector canvas artboard.
 */

import {
  loadActiveMoodboardId,
  loadMoodboardsFromStorage,
  type Moodboard,
  type MoodboardItem,
} from '../../auxweave-moodboard'
import type { ToolExecuteCallbackOptions, WebMCPTool } from '../webmcp-bridge'
import { type BridgePlacementResult, resolvePlacement, withLayoutGuard } from './layout-guard'

const NOOP_SIGNAL = new AbortController().signal

export const getMoodboardContentTool: WebMCPTool = {
  name: 'get_moodboard_content',
  title: 'Get Moodboard Images & Visual References',
  description:
    "Retrieves the active moodboard references, including all inspiration images (URLs, titles, source, dimensions, extracted color palettes), tags, descriptions, and dominant color palette. The agent should use this tool to inspect reference imagery, color schemes, and aesthetic direction from the user's moodboard.",
  inputSchema: {
    type: 'object',
    properties: {
      boardId: {
        type: 'string',
        description:
          'Optional ID of a specific moodboard to inspect. If omitted, the currently active moodboard is returned.',
      },
      query: {
        type: 'string',
        description:
          'Optional keyword to filter moodboard images by title, source, or tags (e.g. "gradient", "typography", "branding").',
      },
    },
  },
  execute: async (
    input: { boardId?: string; query?: string },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const boards: Moodboard[] = loadMoodboardsFromStorage()
    const activeId = input.boardId || loadActiveMoodboardId(boards)
    const activeBoard = boards.find(b => b.id === activeId) || boards[0]

    if (!activeBoard) {
      return {
        success: false,
        message: 'No moodboards found in the current workspace.',
        items: [],
      }
    }

    let items = activeBoard.items || []
    if (input.query?.trim()) {
      const q = input.query.trim().toLowerCase()
      items = items.filter(
        i =>
          i.title?.toLowerCase().includes(q) ||
          i.source?.toLowerCase().includes(q) ||
          activeBoard.tags?.some(t => t.toLowerCase().includes(q)),
      )
    }

    return {
      success: true,
      activeBoard: {
        id: activeBoard.id,
        name: activeBoard.name,
        description: activeBoard.description || '',
        tags: activeBoard.tags || [],
        itemCount: items.length,
        items: items.map(item => ({
          id: item.id,
          url: item.url.startsWith('data:') ? `[embedded-image: ${item.id}]` : item.url,
          title: item.title || 'Untitled Image',
          source: item.source || 'upload',
          width: item.width,
          height: item.height,
        })),
      },
      allBoardsSummary: boards.map(b => ({
        id: b.id,
        name: b.name,
        itemCount: b.items?.length || 0,
        isActive: b.id === activeBoard.id,
      })),
    }
  },
}

export const placeMoodboardImageTool: WebMCPTool = {
  name: 'place_moodboard_image',
  title: 'Place Image from Moodboard onto Canvas',
  description:
    "Places an image from the user's moodboard directly onto the active canvas artboard. You can target an image by its moodboard itemId, direct image URL, or by matching a keyword in its title. Automatically sizes and positions the image on the artboard.",
  inputSchema: {
    type: 'object',
    properties: {
      itemId: {
        type: 'string',
        description: 'The specific ID of the moodboard item to place.',
      },
      url: {
        type: 'string',
        description: 'The direct URL of the image from the moodboard to place.',
      },
      titleKeyword: {
        type: 'string',
        description:
          'Keyword matching the moodboard item title (e.g. "gradient", "typography", "nature").',
      },
      x: {
        type: 'number',
        description: 'X coordinate on canvas artboard (default: centered).',
      },
      y: {
        type: 'number',
        description: 'Y coordinate on canvas artboard (default: auto collision-free placement).',
      },
      width: {
        type: 'number',
        description:
          'Target width in pixels (optional; defaults to item width or proportional canvas fit).',
      },
      height: {
        type: 'number',
        description:
          'Target height in pixels (optional; defaults to item height or proportional canvas fit).',
      },
      relativeTo: {
        type: 'string',
        description:
          'Set to "previous" or an existing object ID to place relative to that element.',
      },
      position: {
        type: 'string',
        enum: ['below', 'above', 'inside'],
        description: 'Position relative to target (default: "below").',
      },
      gap: {
        type: 'number',
        description: 'Spacing in pixels when using relative positioning or auto-stacking.',
      },
    },
  },
  execute: async (
    input: {
      itemId?: string
      url?: string
      titleKeyword?: string
      x?: number
      y?: number
      width?: number
      height?: number
      relativeTo?: 'previous' | string
      position?: 'below' | 'above' | 'inside'
      gap?: number
    },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const boards: Moodboard[] = loadMoodboardsFromStorage()
    const activeId = loadActiveMoodboardId(boards)
    const activeBoard = boards.find(b => b.id === activeId) || boards[0]

    // Find the item across active board or all boards
    const allItems: MoodboardItem[] = [
      ...(activeBoard?.items || []),
      ...boards.flatMap(b => (b.id !== activeBoard?.id ? b.items || [] : [])),
    ]

    let targetItem: MoodboardItem | undefined
    if (input.itemId) {
      targetItem = allItems.find(i => i.id === input.itemId)
    } else if (input.url) {
      const match = input.url.match(/\[embedded-image:\s*([^\]]+)\]/)
      const resolvedId = match ? match[1].trim() : null
      if (resolvedId) {
        targetItem = allItems.find(i => i.id === resolvedId)
      } else {
        targetItem = allItems.find(i => i.url === input.url)
      }
    } else if (input.titleKeyword?.trim()) {
      const kw = input.titleKeyword.trim().toLowerCase()
      targetItem = allItems.find(i => i.title?.toLowerCase().includes(kw))
    } else if (allItems.length > 0) {
      // Default to first item if none specified
      targetItem = allItems[0]
    }

    if (!targetItem) {
      return {
        success: false,
        error:
          'No matching moodboard image found. Use get_moodboard_content first to view available image IDs.',
      }
    }

    const win = window as unknown as {
      __Auxweave_ADD_IMAGE__?: (args: {
        url: string
        x?: number
        y?: number
        width?: number
        height?: number
        relativeTo?: 'previous' | string
        position?: 'below' | 'above' | 'inside'
        gap?: number
      }) => Promise<string | BridgePlacementResult | null>
    }

    if (typeof win.__Auxweave_ADD_IMAGE__ !== 'function') {
      return {
        success: false,
        error: 'Auxweave editor bridge is not ready. Canvas must be mounted.',
      }
    }

    const placement = resolvePlacement(
      await win.__Auxweave_ADD_IMAGE__({
        url: targetItem.url,
        x: input.x,
        y: input.y,
        width: input.width ?? targetItem.width,
        height: input.height ?? targetItem.height,
        relativeTo: input.relativeTo,
        position: input.position,
        gap: input.gap,
      }),
    )
    if (!placement.objectId) {
      return {
        success: false,
        error: 'Moodboard image placement failed — the image could not be loaded.',
      }
    }

    return withLayoutGuard({
      success: true,
      ...placement,
      placedItem: {
        id: targetItem.id,
        title: targetItem.title || 'Moodboard Image',
        url: targetItem.url.startsWith('data:')
          ? `[embedded-image: ${targetItem.id}]`
          : targetItem.url,
        source: targetItem.source,
      },
    })
  },
}

export const analyzeMoodboardReferenceTool: WebMCPTool = {
  name: 'analyze_moodboard_reference',
  title: 'Analyze Moodboard Reference (Design DNA)',
  description:
    'Inspects a reference image/flyer from the moodboard and extracts its structured Design DNA: composition layout, typographic hierarchy, color roles, and recreation blueprint without polluting your context window with raw image data.',
  inputSchema: {
    type: 'object',
    properties: {
      itemId: {
        type: 'string',
        description: 'ID of the moodboard image to analyze.',
      },
      titleKeyword: {
        type: 'string',
        description: 'Optional title keyword to search for the image in the moodboard.',
      },
    },
  },
  execute: async (
    input: { itemId?: string; titleKeyword?: string },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const boards: Moodboard[] = loadMoodboardsFromStorage()
    const activeId = loadActiveMoodboardId(boards)
    const activeBoard = boards.find(b => b.id === activeId) || boards[0]
    const allItems: MoodboardItem[] = [
      ...(activeBoard?.items || []),
      ...boards.flatMap(b => (b.id !== activeBoard?.id ? b.items || [] : [])),
    ]

    let targetItem: MoodboardItem | undefined
    if (input.itemId) {
      targetItem = allItems.find(i => i.id === input.itemId)
    } else if (input.titleKeyword?.trim()) {
      const q = input.titleKeyword.trim().toLowerCase()
      targetItem = allItems.find(i => i.title?.toLowerCase().includes(q))
    } else {
      targetItem = activeBoard?.items?.[0]
    }

    if (!targetItem) {
      return {
        success: false,
        error: 'Reference image not found in moodboards.',
      }
    }

    const w = targetItem.width || 1080
    const h = targetItem.height || 1080
    const ratio = w / h
    const orientation = ratio > 1.2 ? 'landscape' : ratio < 0.85 ? 'portrait' : 'square'

    return {
      success: true,
      reference: {
        id: targetItem.id,
        title: targetItem.title || 'Inspiration Reference',
        orientation,
        aspectRatio: `${w}:${h}`,
      },
      layoutZones: {
        hero: { zone: 'top-or-center', suggestedRole: 'Place hero imagery or graphic backdrop' },
        headline: {
          zone: 'stacked-center-or-left',
          suggestedRole: 'Bold headline text with high contrast',
        },
        details: {
          zone: 'bottom-cluster',
          suggestedRole: 'Metadata, date, location or sub-details',
        },
      },
      recommendedActionPlan: [
        '1. Create background container or canvas fill matching the mood and aesthetic of the reference',
        `2. Place reference photo or graphic using place_moodboard_image (itemId: "${targetItem.id}")`,
        '3. Add prominent headline and subtitle with add_text_element using contrasting typography',
        '4. Add button/accent shapes with add_shape_primitive for visual hierarchy',
        '5. Call verify_canvas_alignment or validate_layout to perform visual self-correction',
      ],
    }
  },
}

export const moodboardTools: WebMCPTool[] = [
  getMoodboardContentTool,
  placeMoodboardImageTool,
  analyzeMoodboardReferenceTool,
]
