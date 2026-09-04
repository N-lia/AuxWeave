/**
 * WebMCP Export & Rendering Tools
 */

import type { ToolExecuteCallbackOptions, WebMCPTool } from '../webmcp-bridge'

const NOOP_SIGNAL = new AbortController().signal

export const exportArtboardRenderTool: WebMCPTool = {
  name: 'export_artboard_render',
  title: 'Export Artboard Image Render',
  description:
    'Triggers rendering of the active artboard into PNG, JPG, or WEBP image format and returns a data URL.',
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['png', 'jpg', 'webp'],
        description: 'Target export file format (default: "png")',
      },
      scale: {
        type: 'number',
        enum: [1, 2, 4],
        description: 'Export resolution multiplier (1x, 2x, 4x)',
      },
    },
  },
  execute: async (
    input: { format?: string; scale?: number },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_EXPORT_RENDER__?: (args: typeof input) => Promise<string | null>
    }

    if (typeof win.__Auxweave_EXPORT_RENDER__ === 'function') {
      const dataUrl = await win.__Auxweave_EXPORT_RENDER__(input)
      return { success: true, dataUrl }
    }

    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const exportTools: WebMCPTool[] = [exportArtboardRenderTool]
