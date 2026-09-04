/**
 * WebMCP Primitive Creation Tools (Shapes, Text, Icons, Images)
 *
 * NOTE: `options` defaults to `{}` so the Chrome extension can call
 * execute(input) without a second argument. Never destructure options
 * as a required parameter.
 */

import type { ToolExecuteCallbackOptions, WebMCPTool } from '../webmcp-bridge'
import { type BridgePlacementResult, resolvePlacement, withLayoutGuard } from './layout-guard'

const NOOP_SIGNAL = new AbortController().signal

export const addShapePrimitiveTool: WebMCPTool = {
  name: 'add_shape_primitive',
  title: 'Add Geometric Shape Primitive',
  description:
    'Adds a new geometric shape element (rectangle, circle, polygon, star, arrow, or line) to the active artboard. Positions and dimensions are automatically bounded within safe artboard margins so elements never bleed off-screen.',
  inputSchema: {
    type: 'object',
    properties: {
      shapeKind: {
        type: 'string',
        enum: ['rectangle', 'circle', 'polygon', 'star', 'arrow', 'line'],
        description: 'The type of geometric primitive shape.',
      },
      x: { type: 'number', description: 'X position relative to artboard (default: centered)' },
      y: { type: 'number', description: 'Y position relative to artboard (default: centered)' },
      width: {
        type: 'number',
        description:
          'Width of shape in pixels (optional; defaults to a prominent proportional size ~35% of artboard)',
      },
      height: {
        type: 'number',
        description:
          'Height of shape in pixels (optional; defaults to a prominent proportional size ~35% of artboard)',
      },
      fillColor: { type: 'string', description: 'Fill hex/hsl color string (e.g. "#7c3aed")' },
      relativeTo: {
        type: 'string',
        description: 'Set to "previous" or an object ID to place relative to that element.',
      },
      position: {
        type: 'string',
        enum: ['below', 'above', 'inside'],
        description: 'Position relative to target (default: "below")',
      },
      gap: { type: 'number', description: 'Gap spacing in pixels when relativeTo is used' },
    },
    required: ['shapeKind'],
  },
  execute: async (
    input: {
      shapeKind: string
      x?: number
      y?: number
      width?: number
      height?: number
      fillColor?: string
      relativeTo?: 'previous' | string
      position?: 'below' | 'above' | 'inside'
      gap?: number
    },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_ADD_SHAPE__?: (
        args: typeof input,
      ) => Promise<string | BridgePlacementResult | null>
    }

    if (typeof win.__Auxweave_ADD_SHAPE__ === 'function') {
      const placement = resolvePlacement(await win.__Auxweave_ADD_SHAPE__(input))
      if (!placement.objectId) {
        return { success: false, error: 'Shape creation failed in the editor bridge.' }
      }
      return withLayoutGuard({ success: true, ...placement })
    }

    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const addTextElementTool: WebMCPTool = {
  name: 'add_text_element',
  title: 'Add Text Element',
  description:
    'Creates a rich formatted typography block. Features automatic spatial collision avoidance, role-based hierarchy, relative auto-stacking, and automatic safe margin clamping so text never bleeds off-screen.',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The text content string to render' },
      role: {
        type: 'string',
        enum: ['headline', 'subtitle', 'body', 'badge', 'caption'],
        description:
          'Semantic typographic role. Automatically determines proportional font size, weight, and spacing based on canvas dimensions (e.g. headline ~6%, subtitle ~3.2%, body ~1.9%).',
      },
      relativeTo: {
        type: 'string',
        description:
          'Set to "previous" or an object ID to auto-stack below that item without collision.',
      },
      position: {
        type: 'string',
        enum: ['below', 'above', 'inside'],
        description: 'Positioning relative to the target element (default: "below").',
      },
      gap: {
        type: 'number',
        description: 'Spacing in pixels when using relative positioning or auto-stacking.',
      },
      x: { type: 'number', description: 'X coordinate (default: centered)' },
      y: {
        type: 'number',
        description: 'Y coordinate (default: auto collision-free placement below existing content)',
      },
      width: {
        type: 'number',
        description:
          'Container width in pixels. If omitted, automatically calculated and safely clamped to fit within artboard margins.',
      },
      textAlign: {
        type: 'string',
        enum: ['left', 'center', 'right'],
        description:
          'Text alignment (default: "center" for headlines/badges, "left" for body text and columns).',
      },
      fontSize: {
        type: 'number',
        description:
          'Font size in pixels (optional; defaults to role-based proportional size, e.g. 230px on 4000p, 60px on 1080p)',
      },
      fontFamily: {
        type: 'string',
        description:
          'Font family name. Supports any Google Font (e.g. "Inter", "Poppins", "Roboto", "Montserrat")',
      },
      fillColor: { type: 'string', description: 'Text color string (e.g. "#FFFFFF")' },
    },
    required: ['text'],
  },
  execute: async (
    input: {
      text: string
      role?: 'headline' | 'subtitle' | 'body' | 'badge' | 'caption'
      relativeTo?: 'previous' | string
      position?: 'below' | 'above' | 'inside'
      gap?: number
      x?: number
      y?: number
      width?: number
      textAlign?: 'left' | 'center' | 'right'
      fontSize?: number
      fontFamily?: string
      fillColor?: string
    },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_ADD_TEXT__?: (args: typeof input) => Promise<string | BridgePlacementResult | null>
    }

    if (typeof win.__Auxweave_ADD_TEXT__ === 'function') {
      const placement = resolvePlacement(await win.__Auxweave_ADD_TEXT__(input))
      if (!placement.objectId) {
        return { success: false, error: 'Text creation failed in the editor bridge.' }
      }
      return withLayoutGuard({ success: true, ...placement })
    }

    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const addHugeiconSymbolTool: WebMCPTool = {
  name: 'add_hugeicon_symbol',
  title: 'Add Hugeicon Symbol',
  description:
    'Inserts a clean vector icon from Hugeicons onto the active artboard. Uses fuzzy keyword search and collision-free spatial positioning.',
  inputSchema: {
    type: 'object',
    properties: {
      iconName: {
        type: 'string',
        description: 'Icon name or keyword (e.g. "star", "airplane", "home", "sparkles", "cpu")',
      },
      x: { type: 'number', description: 'X position (default: centered)' },
      y: { type: 'number', description: 'Y position (default: auto collision-free placement)' },
      size: {
        type: 'number',
        description: 'Size of icon in pixels (default: proportional ~18% of canvas)',
      },
      color: { type: 'string', description: 'Icon color (e.g. "#262626")' },
      relativeTo: {
        type: 'string',
        description: 'Set to "previous" or an object ID to place relative to that element.',
      },
      position: {
        type: 'string',
        enum: ['below', 'above', 'inside'],
        description: 'Position relative to target (default: "below")',
      },
      gap: { type: 'number', description: 'Gap spacing in pixels' },
    },
    required: ['iconName'],
  },
  execute: async (
    input: {
      iconName: string
      x?: number
      y?: number
      size?: number
      color?: string
      relativeTo?: 'previous' | string
      position?: 'below' | 'above' | 'inside'
      gap?: number
    },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_ADD_ICON__?: (args: typeof input) => Promise<string | BridgePlacementResult | null>
    }

    if (typeof win.__Auxweave_ADD_ICON__ === 'function') {
      const placement = resolvePlacement(await win.__Auxweave_ADD_ICON__(input))
      if (!placement.objectId) {
        return { success: false, error: 'Icon lookup failed — no matching icon found.' }
      }
      return withLayoutGuard({ success: true, ...placement })
    }

    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const addImageElementTool: WebMCPTool = {
  name: 'add_image_element',
  title: 'Add Image Element',
  description:
    'Inserts an image onto the active artboard from a URL or data URL. Automatically sizes the image proportionally to the canvas (~55% of artboard dimensions) so it appears prominent and never tiny.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'The image URL, Unsplash URL, or data URL to place' },
      x: { type: 'number', description: 'X coordinate (default: centered)' },
      y: { type: 'number', description: 'Y coordinate (default: auto collision-free placement)' },
      width: {
        type: 'number',
        description:
          'Target width in pixels (optional; defaults to proportional canvas fit ~55% of artboard)',
      },
      height: {
        type: 'number',
        description:
          'Target height in pixels (optional; defaults to proportional canvas fit ~55% of artboard)',
      },
      relativeTo: {
        type: 'string',
        description: 'Set to "previous" or an object ID to place relative to that element.',
      },
      position: {
        type: 'string',
        enum: ['below', 'above', 'inside'],
        description: 'Position relative to target (default: "below")',
      },
      gap: { type: 'number', description: 'Gap spacing in pixels' },
    },
    required: ['url'],
  },
  execute: async (
    input: {
      url: string
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

    const win = window as unknown as {
      __Auxweave_ADD_IMAGE__?: (
        args: typeof input,
      ) => Promise<string | BridgePlacementResult | null>
    }

    if (typeof win.__Auxweave_ADD_IMAGE__ === 'function') {
      const placement = resolvePlacement(await win.__Auxweave_ADD_IMAGE__(input))
      if (!placement.objectId) {
        return { success: false, error: 'Image placement failed — the image could not be loaded.' }
      }
      return withLayoutGuard({ success: true, ...placement })
    }

    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const addImageAliasTool: WebMCPTool = {
  ...addImageElementTool,
  name: 'add_image',
  title: 'Add Image to Canvas',
}

export const primitiveTools: WebMCPTool[] = [
  addShapePrimitiveTool,
  addTextElementTool,
  addHugeiconSymbolTool,
  addImageElementTool,
  addImageAliasTool,
]
