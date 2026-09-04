/**
 * WebMCP Transformation, Alignment & Layering Tools
 */

import type { ToolExecuteCallbackOptions, WebMCPTool } from '../webmcp-bridge'
import { withLayoutGuard } from './layout-guard'

const NOOP_SIGNAL = new AbortController().signal

export const updateObjectTransformTool: WebMCPTool = {
  name: 'update_object_transform',
  title: 'Update Object Spatial Transform',
  description: 'Updates coordinates, dimensions, or rotation angle of an element by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      objectId: { type: 'string', description: 'Unique target element ID' },
      x: { type: 'number', description: 'New X position' },
      y: { type: 'number', description: 'New Y position' },
      width: { type: 'number', description: 'New width in pixels' },
      height: { type: 'number', description: 'New height in pixels' },
      rotation: { type: 'number', description: 'Rotation angle in degrees (0-360)' },
    },
    required: ['objectId'],
  },
  execute: async (
    input: {
      objectId: string
      x?: number
      y?: number
      width?: number
      height?: number
      rotation?: number
    },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_UPDATE_TRANSFORM__?: (args: typeof input) => Promise<boolean>
    }

    if (typeof win.__Auxweave_UPDATE_TRANSFORM__ === 'function') {
      const success = await win.__Auxweave_UPDATE_TRANSFORM__(input)
      return withLayoutGuard({ success })
    }

    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const alignSelectedObjectsTool: WebMCPTool = {
  name: 'align_selected_objects',
  title: 'Align Selected Objects',
  description:
    'Aligns targeted or selected elements along left, center, right, top, middle, or bottom bounds.',
  inputSchema: {
    type: 'object',
    properties: {
      alignment: {
        type: 'string',
        enum: ['left', 'center', 'right', 'top', 'middle', 'bottom'],
        description: 'Alignment mode',
      },
      relativeTo: {
        type: 'string',
        enum: ['selection', 'artboard'],
        description: 'Align relative to group selection or artboard bounds',
      },
    },
    required: ['alignment'],
  },
  execute: async (
    input: { alignment: string; relativeTo?: string },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_ALIGN_OBJECTS__?: (args: typeof input) => Promise<boolean>
    }

    if (typeof win.__Auxweave_ALIGN_OBJECTS__ === 'function') {
      const success = await win.__Auxweave_ALIGN_OBJECTS__(input)
      return withLayoutGuard({ success })
    }

    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const transformTools: WebMCPTool[] = [updateObjectTransformTool, alignSelectedObjectsTool]
