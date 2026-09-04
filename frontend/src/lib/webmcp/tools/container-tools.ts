/**
 * WebMCP Container Tools (Flexbox / Auto Layout)
 *
 * Enables agents to build web-native layout primitives (VStack, HStack,
 * auto-wrapping flex cards, aligned headers, and footers) without manual
 * Cartesian coordinate calculations.
 */

import type { FlexContainerInput } from '../flex-layout-solver'
import type { ToolExecuteCallbackOptions, WebMCPTool } from '../webmcp-bridge'
import { withLayoutGuard } from './layout-guard'

const NOOP_SIGNAL = new AbortController().signal

export const createFlexContainerTool: WebMCPTool = {
  name: 'create_flex_container',
  title: 'Create Flex Layout Container',
  description:
    'Creates a modern web-native layout container (Flexbox / Auto Layout). Automatically computes child positions, text wrapping, and spacing along vertical columns or horizontal rows. Use this to design complete posters, flyers, cards, and sections without calculating Cartesian x/y coordinates.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name label for the layout container/frame' },
      direction: {
        type: 'string',
        enum: ['column', 'row'],
        description:
          'Flex direction: "column" for vertical stacks, "row" for horizontal bars (default: "column")',
      },
      justify: {
        type: 'string',
        enum: ['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly'],
        description: 'Main-axis alignment / distribution (default: "start")',
      },
      align: {
        type: 'string',
        enum: ['start', 'center', 'end', 'stretch'],
        description: 'Cross-axis alignment (default: "center" for column, "start" for row)',
      },
      gap: {
        type: 'number',
        description: 'Spacing in pixels between consecutive children (e.g. 16, 24, 32)',
      },
      padding: {
        type: 'number',
        description: 'Uniform inner padding in pixels (e.g. 32, 48, 64)',
      },
      width: {
        description:
          'Container width in pixels, or "fill" (100% of artboard/parent), or "hug" (fit-content)',
      },
      height: {
        description:
          'Container height in pixels, or "fill" (100% of artboard/parent), or "hug" (fit-content)',
      },
      x: { type: 'number', description: 'X position on artboard (optional; defaults to centered)' },
      y: { type: 'number', description: 'Y position on artboard (optional; defaults to centered)' },
      fillColor: {
        type: 'string',
        description:
          'Container background fill color (e.g. "#0B0F19" for full-bleed dark flyer, or card backdrop)',
      },
      strokeColor: { type: 'string', description: 'Container border stroke color' },
      strokeWidth: { type: 'number', description: 'Container border stroke width' },
      cornerRadius: { type: 'number', description: 'Container corner radius in pixels' },
      children: {
        type: 'array',
        description:
          'Array of child elements to lay out automatically. Types: "headline", "subtitle", "body", "badge", "caption", "shape", "icon", "image", "container"',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: [
                'headline',
                'subtitle',
                'body',
                'badge',
                'caption',
                'text',
                'shape',
                'icon',
                'image',
                'container',
              ],
            },
            text: { type: 'string', description: 'Text string for typography elements' },
            role: { type: 'string', enum: ['headline', 'subtitle', 'body', 'badge', 'caption'] },
            fontSize: { type: 'number', description: 'Explicit font size override' },
            fontFamily: {
              type: 'string',
              description: 'Google Font family (e.g. "Inter", "Poppins")',
            },
            fontWeight: { type: 'string', enum: ['normal', 'bold'] },
            textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
            fillColor: { type: 'string', description: 'Element fill color or text color' },
            shapeKind: {
              type: 'string',
              enum: ['rectangle', 'circle', 'polygon', 'star', 'line', 'arrow'],
            },
            iconName: {
              type: 'string',
              description: 'Hugeicon icon name (e.g. "calendar-01", "sparkles")',
            },
            size: { type: 'number', description: 'Icon dimension or shape size' },
            url: { type: 'string', description: 'Image asset URL' },
            width: { description: 'Child width: number, "fill", or "hug"' },
            height: { description: 'Child height: number, "fill", or "hug"' },
            direction: {
              type: 'string',
              enum: ['column', 'row'],
              description: 'Nested container direction',
            },
            gap: { type: 'number', description: 'Nested container gap' },
            children: { type: 'array', items: { type: 'object' }, description: 'Nested children' },
          },
          required: ['type'],
        },
      },
    },
    required: ['children'],
  },
  execute: async (
    input: FlexContainerInput,
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_CREATE_FLEX_CONTAINER__?: (args: FlexContainerInput) => Promise<{
        success: boolean
        containerId?: string
        childCount?: number
        x?: number
        y?: number
        width?: number
        height?: number
        error?: string
      }>
    }

    if (typeof win.__Auxweave_CREATE_FLEX_CONTAINER__ === 'function') {
      return withLayoutGuard(await win.__Auxweave_CREATE_FLEX_CONTAINER__(input))
    }

    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const wrapInFlexContainerTool: WebMCPTool = {
  name: 'wrap_in_flex_container',
  title: 'Wrap Elements in Flex Container',
  description:
    'Groups existing canvas elements and automatically reflows them into an aligned Flexbox layout (horizontal row or vertical column) with even gaps and padding.',
  inputSchema: {
    type: 'object',
    properties: {
      objectIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of scene object IDs to group and arrange',
      },
      direction: {
        type: 'string',
        enum: ['column', 'row'],
        description: 'Flex direction: "column" or "row" (default: "row")',
      },
      justify: {
        type: 'string',
        enum: ['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly'],
      },
      align: {
        type: 'string',
        enum: ['start', 'center', 'end', 'stretch'],
      },
      gap: { type: 'number', description: 'Pixel spacing between elements' },
      padding: { type: 'number', description: 'Inner padding in pixels' },
      fillColor: { type: 'string', description: 'Optional card background color' },
      cornerRadius: { type: 'number', description: 'Optional card corner radius' },
    },
    required: ['objectIds'],
  },
  execute: async (
    input: {
      objectIds: string[]
      direction?: 'column' | 'row'
      justify?: string
      align?: string
      gap?: number
      padding?: number
      fillColor?: string
      cornerRadius?: number
    },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const win = window as unknown as {
      __Auxweave_WRAP_IN_FLEX__?: (args: typeof input) => Promise<{
        success: boolean
        groupId?: string
        count?: number
        error?: string
      }>
    }

    if (typeof win.__Auxweave_WRAP_IN_FLEX__ === 'function') {
      return withLayoutGuard(await win.__Auxweave_WRAP_IN_FLEX__(input))
    }

    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const containerTools: WebMCPTool[] = [createFlexContainerTool, wrapInFlexContainerTool]
