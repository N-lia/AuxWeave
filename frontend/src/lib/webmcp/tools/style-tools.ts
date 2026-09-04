/**
 * WebMCP Styling, Fills, Effects & Palette Tools
 */

import type { ToolExecuteCallbackOptions, WebMCPTool } from '../webmcp-bridge'
import { withLayoutGuard } from './layout-guard'

const NOOP_SIGNAL = new AbortController().signal

export const applyFillPaintTool: WebMCPTool = {
  name: 'apply_fill_paint',
  title: 'Apply Element Fill Paint',
  description: 'Applies a solid color fill to a target canvas element by ID.',
  inputSchema: {
    type: 'object',
    properties: {
      objectId: { type: 'string', description: 'Target object ID' },
      color: { type: 'string', description: 'Hex or HSL color string (e.g. "#9333ea")' },
    },
    required: ['objectId', 'color'],
  },
  execute: async (
    input: { objectId: string; color: string },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_APPLY_FILL__?: (args: typeof input) => Promise<boolean>
    }

    if (typeof win.__Auxweave_APPLY_FILL__ === 'function') {
      const success = await win.__Auxweave_APPLY_FILL__(input)
      return withLayoutGuard({ success })
    }

    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const applyMoodboardPaletteTool: WebMCPTool = {
  name: 'apply_moodboard_palette',
  title: 'Apply Moodboard Palette to Selection',
  description: 'Recolors selected or specified elements using a provided color palette.',
  inputSchema: {
    type: 'object',
    properties: {
      colors: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of HEX/HSL color strings to distribute across target elements.',
      },
    },
    required: ['colors'],
  },
  execute: async (
    input: { colors: string[] },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_APPLY_PALETTE__?: (args: typeof input) => Promise<boolean>
    }

    if (typeof win.__Auxweave_APPLY_PALETTE__ === 'function') {
      const success = await win.__Auxweave_APPLY_PALETTE__(input)
      return withLayoutGuard({ success })
    }

    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const styleTools: WebMCPTool[] = [applyFillPaintTool, applyMoodboardPaletteTool]
