/**
 * WebMCP Artboard Page Management Tools
 */

import type { ToolExecuteCallbackOptions, WebMCPTool } from '../webmcp-bridge'

const NOOP_SIGNAL = new AbortController().signal

export const createArtboardPageTool: WebMCPTool = {
  name: 'create_artboard_page',
  title: 'Create Artboard Page',
  description: 'Adds a new artboard page to the active Auxweave document.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Page title (default: "New Page")' },
      width: {
        type: 'number',
        description: 'Artboard width in pixels (default: matches active page)',
      },
      height: {
        type: 'number',
        description: 'Artboard height in pixels (default: matches active page)',
      },
    },
  },
  execute: async (
    input: { name?: string; width?: number; height?: number },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_ADD_PAGE__?: (args: typeof input) => Promise<string | null>
    }

    if (typeof win.__Auxweave_ADD_PAGE__ === 'function') {
      const pageId = await win.__Auxweave_ADD_PAGE__(input)
      return { success: true, pageId }
    }

    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const duplicateActivePageTool: WebMCPTool = {
  name: 'duplicate_active_page',
  title: 'Duplicate Active Page',
  description: 'Clones the currently active page and all its scene elements.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async (_input, options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL }) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_DUPLICATE_PAGE__?: () => Promise<string | null>
    }

    if (typeof win.__Auxweave_DUPLICATE_PAGE__ === 'function') {
      const pageId = await win.__Auxweave_DUPLICATE_PAGE__()
      return { success: true, pageId }
    }

    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const pageTools: WebMCPTool[] = [createArtboardPageTool, duplicateActivePageTool]
