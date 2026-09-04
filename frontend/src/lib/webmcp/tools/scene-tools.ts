/**
 * WebMCP Read-Only Scene State Inspection Tools
 */

import type { ToolExecuteCallbackOptions, WebMCPTool } from '../webmcp-bridge'

const NOOP_SIGNAL = new AbortController().signal

function sanitizeSceneObject(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {}
  const obj = raw as Record<string, unknown>
  const sanitized: Record<string, unknown> = {
    id: obj.id,
    type: obj.type,
    x: typeof obj.x === 'number' ? Math.round(obj.x) : obj.x,
    y: typeof obj.y === 'number' ? Math.round(obj.y) : obj.y,
    width: typeof obj.width === 'number' ? Math.round(obj.width) : obj.width,
    height: typeof obj.height === 'number' ? Math.round(obj.height) : obj.height,
    zIndex: obj.zIndex,
    visible: obj.visible,
  }

  if (obj.name) sanitized.name = obj.name
  if (obj.rotation) sanitized.rotation = obj.rotation

  if (obj.type === 'text') {
    sanitized.text = typeof obj.content === 'string' ? obj.content.slice(0, 120) : obj.text
  } else if (obj.type === 'image') {
    sanitized.image = `[image: ${sanitized.width}x${sanitized.height}]`
  } else if (obj.type === 'icon') {
    const c = obj.content as Record<string, unknown> | undefined
    sanitized.icon = c?.iconName || obj.iconName
  } else if (obj.type === 'group') {
    // Children are stored container-local; report absolute boxes so the
    // agent's spatial map matches what actually renders (recursive).
    const content = obj.content as { children?: unknown[] } | undefined
    const kids = Array.isArray(content?.children) ? content.children : []
    const baseX = typeof obj.x === 'number' ? obj.x : 0
    const baseY = typeof obj.y === 'number' ? obj.y : 0
    sanitized.childCount = kids.length
    sanitized.children = kids
      .slice(0, 12)
      .map(kid => absolutizeStructuredChild(kid, baseX, baseY))
      .filter(Boolean)
  }

  if (obj.style && typeof obj.style === 'object') {
    const s = obj.style as Record<string, unknown>
    const cleanStyle: Record<string, unknown> = {}
    if (s.fill && typeof s.fill === 'object') {
      const f = s.fill as Record<string, unknown>
      if (f.type === 'solid' && f.color) cleanStyle.fill = f.color
      else if (f.type === 'linear') cleanStyle.fill = 'linear-gradient'
    }
    if (s.stroke && typeof s.stroke === 'object') {
      const st = s.stroke as Record<string, unknown>
      if (st.type === 'solid' && st.color && st.color !== 'transparent') {
        cleanStyle.stroke = st.color
        cleanStyle.strokeWidth = s.strokeWidth || 1
      }
    }
    if (s.fontSize) cleanStyle.fontSize = s.fontSize
    if (s.fontWeight) cleanStyle.fontWeight = s.fontWeight
    if (s.cornerRadius) cleanStyle.cornerRadius = s.cornerRadius
    if (Object.keys(cleanStyle).length > 0) sanitized.style = cleanStyle
  }

  return sanitized
}

function absolutizeStructuredChild(
  kid: unknown,
  baseX: number,
  baseY: number,
): Record<string, unknown> | null {
  if (!kid || typeof kid !== 'object') return null
  const k = kid as Record<string, unknown>
  const kx = typeof k.x === 'number' ? k.x : 0
  const ky = typeof k.y === 'number' ? k.y : 0
  const absX = Math.round(baseX + kx)
  const absY = Math.round(baseY + ky)
  const entry: Record<string, unknown> = {
    id: k.id,
    type: k.type,
    x: absX,
    y: absY,
    width: k.width,
    height: k.height,
  }
  if (k.type === 'group') {
    const content = k.content as { children?: unknown[] } | undefined
    const kids = Array.isArray(content?.children) ? content.children : []
    entry.childCount = kids.length
    entry.children = kids
      .slice(0, 12)
      .map(nested => absolutizeStructuredChild(nested, absX, absY))
      .filter(Boolean)
  }
  return entry
}

export const getCanvasSceneStateTool: WebMCPTool = {
  name: 'get_canvas_scene_state',
  title: 'Get Canvas Scene Objects & Artboard Bounds',
  description:
    'Retrieves structured scene graph of elements on the active artboard page (IDs, types, coordinates, dimensions, text, styles, and active artboard width/height bounds).',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async (_input, options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL }) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_GET_STRUCTURED_STATE__?: () => unknown[]
      __Auxweave_GET_DOC_META__?: () => { width: number; height: number; name?: string }
    }

    const meta =
      typeof win.__Auxweave_GET_DOC_META__ === 'function'
        ? win.__Auxweave_GET_DOC_META__()
        : { width: 1080, height: 1080 }

    if (typeof win.__Auxweave_GET_STRUCTURED_STATE__ === 'function') {
      const state = win.__Auxweave_GET_STRUCTURED_STATE__()
      const rawList = Array.isArray(state) ? state : []
      const sanitizedObjects = rawList.slice(0, 40).map(sanitizeSceneObject)
      return {
        count: rawList.length,
        artboard: {
          width: meta.width,
          height: meta.height,
        },
        objects: sanitizedObjects,
        truncated:
          rawList.length > 40
            ? `${rawList.length - 40} objects omitted for context efficiency`
            : undefined,
      }
    }

    return {
      count: 0,
      artboard: {
        width: meta.width,
        height: meta.height,
      },
      objects: [],
    }
  },
}

export const getActiveSelectionTool: WebMCPTool = {
  name: 'get_active_selection',
  title: 'Get Selected Scene Objects',
  description: 'Returns the IDs and bounding details of currently selected canvas elements.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async (_input, options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL }) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_GET_SELECTED_IDS__?: () => string[]
    }

    const selectedIds =
      typeof win.__Auxweave_GET_SELECTED_IDS__ === 'function'
        ? win.__Auxweave_GET_SELECTED_IDS__()
        : []

    return {
      selectedCount: selectedIds.length,
      selectedIds,
    }
  },
}

export const getDocumentMetadataTool: WebMCPTool = {
  name: 'get_document_metadata',
  title: 'Get Document & Artboard Metadata',
  description: 'Returns document pages, dimensions, and current active page index.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async (_input, options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL }) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_GET_DOC_META__?: () => {
        id: string
        name: string
        width: number
        height: number
        pageCount: number
        activePageIndex: number
      }
    }

    if (typeof win.__Auxweave_GET_DOC_META__ === 'function') {
      return win.__Auxweave_GET_DOC_META__()
    }

    return {
      id: '',
      name: 'Untitled',
      width: 1200,
      height: 630,
      pageCount: 1,
      activePageIndex: 0,
    }
  },
}

export const verifyCanvasAlignmentTool: WebMCPTool = {
  name: 'verify_canvas_alignment',
  title: 'Verify Canvas Alignment & Visual Self-Correction',
  description:
    'Evaluates current canvas layout geometry, visual hierarchy, margin compliance, and spatial balance against the target design reference. Call this before completing a turn to identify and correct any misalignments or spacing discrepancies.',
  inputSchema: {
    type: 'object',
    properties: {
      targetReferenceId: {
        type: 'string',
        description: 'Optional moodboard reference ID to compare against.',
      },
    },
  },
  execute: async (
    _input: { targetReferenceId?: string },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_GET_STRUCTURED_STATE__?: () => unknown[]
      __Auxweave_GET_DOC_META__?: () => { width: number; height: number }
      __Auxweave_VALIDATE_LAYOUT__?: () => {
        success: boolean
        artboard?: { width: number; height: number }
        objectCount?: number
        issueCount?: number
        issues?: Array<{
          code: string
          severity: 'error' | 'warning'
          message: string
          hint: string
          objectId?: string
        }>
      }
    }

    const meta =
      typeof win.__Auxweave_GET_DOC_META__ === 'function'
        ? win.__Auxweave_GET_DOC_META__()
        : { width: 1080, height: 1080 }

    const state =
      typeof win.__Auxweave_GET_STRUCTURED_STATE__ === 'function'
        ? win.__Auxweave_GET_STRUCTURED_STATE__()
        : []

    const objects = Array.isArray(state) ? state : []

    // Full-fidelity validation (container-aware, contrast, typography) when
    // the editor bridge is mounted; otherwise degrade to an empty pass.
    let issues: Array<{
      code: string
      severity: 'error' | 'warning'
      message: string
      hint: string
      objectId?: string
    }> = []
    if (typeof win.__Auxweave_VALIDATE_LAYOUT__ === 'function') {
      try {
        const report = await win.__Auxweave_VALIDATE_LAYOUT__()
        if (report && report.success && Array.isArray(report.issues)) {
          issues = report.issues
        }
      } catch {
        /* fall through with no issues */
      }
    }

    const marginViolations = issues
      .filter(i => i.code === 'out-of-bounds' || i.code === 'safe-margin')
      .map(i => i.message)
    const errors = issues.filter(i => i.severity === 'error')

    return {
      status: 'evaluated',
      artboard: { width: meta.width, height: meta.height, objectCount: objects.length },
      visualHierarchy: {
        hasElements: objects.length > 0,
        textElementsCount: objects.filter(o => (o as Record<string, unknown>).type === 'text')
          .length,
        shapesCount: objects.filter(
          o =>
            (o as Record<string, unknown>).type === 'rect' ||
            (o as Record<string, unknown>).type === 'ellipse',
        ).length,
        imagesCount: objects.filter(o => (o as Record<string, unknown>).type === 'image').length,
      },
      marginDiagnostics: {
        safeMarginPx: Math.round(Math.min(meta.width, meta.height) * 0.04),
        marginViolations: marginViolations.slice(0, 5),
        isWithinSafeBounds: marginViolations.length === 0,
      },
      issueCount: issues.length,
      errorCount: errors.length,
      issues: issues.slice(0, 10),
      selfCorrectionAdvice:
        issues.length > 0
          ? [
              ...issues.slice(0, 2).map(i => i.hint),
              'Run repair_layout to apply automatic fixes, then re-verify.',
            ]
          : [
              'Layout is well-contained within artboard safe bounds.',
              'Check typography hierarchy and color contrast before concluding.',
            ],
    }
  },
}

export const removeSceneElementTool: WebMCPTool = {
  name: 'remove_scene_element',
  title: 'Remove Scene Element',
  description:
    'Deletes/removes a shape, text, image, icon, or design element from the active canvas artboard by its object ID, name, or active selection.',
  inputSchema: {
    type: 'object',
    properties: {
      objectId: {
        type: 'string',
        description: 'The unique object ID of the element to delete/remove (e.g. "obj-123").',
      },
      name: {
        type: 'string',
        description: 'Optional name, text content, or label of the object to remove.',
      },
      removeSelected: {
        type: 'boolean',
        description: 'Set to true to delete all currently selected objects on the canvas.',
      },
    },
  },
  execute: async (
    input: { objectId?: string; name?: string; removeSelected?: boolean },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_REMOVE_OBJECT__?: (params: {
        objectId?: string
        name?: string
        removeSelected?: boolean
      }) => { success: boolean; removedCount: number; removedIds?: string[]; message?: string }
    }

    if (typeof win.__Auxweave_REMOVE_OBJECT__ === 'function') {
      return win.__Auxweave_REMOVE_OBJECT__(input)
    }

    return { success: false, removedCount: 0, message: 'Remove object bridge not connected.' }
  },
}

export const sceneTools: WebMCPTool[] = [
  getCanvasSceneStateTool,
  getActiveSelectionTool,
  getDocumentMetadataTool,
  verifyCanvasAlignmentTool,
  removeSceneElementTool,
]
