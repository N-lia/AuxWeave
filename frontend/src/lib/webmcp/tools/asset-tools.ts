/**
 * asset-tools.ts
 * WebMCP tools allowing the AI Agent to inspect and place project design assets
 * (logos, SVG vectors, product imagery, brand kits).
 */

import { type DesignAsset, idbGetProjectAssets } from '../../auxweave-assets'
import type { WebMCPTool } from '../webmcp-bridge'
import { resolvePlacement, withLayoutGuard } from './layout-guard'

function getActiveDocId(): string {
  if (typeof window !== 'undefined') {
    const win = window as unknown as { __Auxweave_ACTIVE_DOC_ID__?: string }
    if (win.__Auxweave_ACTIVE_DOC_ID__) return win.__Auxweave_ACTIVE_DOC_ID__
  }
  return 'default-doc'
}

/**
 * 1. get_project_assets
 * Inspects all available design assets in the current working directory / project.
 */
export const getProjectAssetsTool: WebMCPTool = {
  name: 'get_project_assets',
  title: 'Get Project Design Assets',
  description:
    'Retrieves the list of design assets (company logos, vector graphics, product photos, icons) available in the current project working directory or linked local folder. Always call this tool when the user mentions using existing logos or assets.',
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        enum: ['all', 'logo', 'icon', 'svg', 'image'],
        description: 'Optional filter by asset category (default: all).',
      },
      searchQuery: {
        type: 'string',
        description: 'Optional search keyword to match asset file names (e.g. "logo", "badge").',
      },
    },
  },
  execute: async (input: { category?: string; searchQuery?: string } = {}) => {
    const docId = getActiveDocId()
    const allAssets = await idbGetProjectAssets(docId)

    const filtered = allAssets.filter(asset => {
      if (input.category && input.category !== 'all' && asset.category !== input.category) {
        return false
      }
      if (input.searchQuery) {
        const q = input.searchQuery.toLowerCase().trim()
        if (!asset.name.toLowerCase().includes(q) && !asset.category.toLowerCase().includes(q)) {
          return false
        }
      }
      return true
    })

    // Token-efficient sanitization (never include raw base64 or blob strings)
    const sanitizedList = filtered.slice(0, 25).map(asset => ({
      id: asset.id,
      name: asset.name,
      category: asset.category,
      dimensions:
        asset.width && asset.height ? `${asset.width}x${asset.height}` : 'scalable-vector',
      format: asset.mimeType,
      source: asset.source || 'upload',
      reference: `[asset-ref: ${asset.id}]`,
    }))

    return {
      success: true,
      docId,
      totalCount: allAssets.length,
      matchingCount: filtered.length,
      assets: sanitizedList,
    }
  },
}

/**
 * 2. place_project_asset
 * Places a design asset onto the active canvas artboard.
 */
export const placeProjectAssetTool: WebMCPTool = {
  name: 'place_project_asset',
  title: 'Place Design Asset onto Canvas',
  description:
    'Places a specified project asset (logo, icon, photo, or vector graphic) onto the active canvas artboard. You can target the asset by its assetId or by a keyword in its name (e.g. "logo"). Automatically scales and positions the asset.',
  inputSchema: {
    type: 'object',
    properties: {
      assetId: {
        type: 'string',
        description: 'The exact ID of the project asset (from get_project_assets).',
      },
      assetNameKeyword: {
        type: 'string',
        description: 'Keyword to search asset name (e.g. "logo", "banner", "sponsor").',
      },
      x: {
        type: 'number',
        description: 'Explicit X coordinate on artboard. If omitted, uses smart positioning.',
      },
      y: {
        type: 'number',
        description: 'Explicit Y coordinate on artboard. If omitted, uses smart positioning.',
      },
      width: {
        type: 'number',
        description: 'Target display width in pixels.',
      },
      height: {
        type: 'number',
        description: 'Target display height in pixels.',
      },
      position: {
        type: 'string',
        enum: ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'hero'],
        description: 'Preset positioning zone (e.g. "top-right" for logos, "center" for hero).',
      },
    },
  },
  execute: async (
    input: {
      assetId?: string
      assetNameKeyword?: string
      x?: number
      y?: number
      width?: number
      height?: number
      position?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'hero'
    } = {},
  ) => {
    const docId = getActiveDocId()
    const allAssets = await idbGetProjectAssets(docId)

    if (allAssets.length === 0) {
      return {
        success: false,
        message: 'No assets found in the current project. Please upload an asset first.',
      }
    }

    let targetAsset: DesignAsset | undefined

    if (input.assetId) {
      targetAsset = allAssets.find(a => a.id === input.assetId)
    }

    if (!targetAsset && input.assetNameKeyword) {
      const q = input.assetNameKeyword.toLowerCase().trim()
      targetAsset =
        allAssets.find(a => a.name.toLowerCase().includes(q)) ||
        allAssets.find(a => a.category.toLowerCase().includes(q))
    }

    if (!targetAsset) {
      targetAsset = allAssets[0]
    }

    if (!targetAsset) {
      return {
        success: false,
        message: 'No matching asset found. Use get_project_assets to see available assets.',
      }
    }

    const win = typeof window !== 'undefined' ? (window as any) : {}
    const docMeta: { width: number; height: number } =
      typeof win.__Auxweave_GET_DOC_META__ === 'function'
        ? win.__Auxweave_GET_DOC_META__()
        : { width: 1080, height: 1080 }

    const artboardW = docMeta.width || 1080
    const artboardH = docMeta.height || 1080
    const minDim = Math.min(artboardW, artboardH)

    let finalW = input.width
    let finalH = input.height

    if (!finalW && !finalH) {
      if (targetAsset.category === 'logo') {
        finalW = Math.round(minDim * 0.16)
        const aspect = (targetAsset.height || 1) / (targetAsset.width || 1)
        finalH = Math.round(finalW * aspect)
      } else if (targetAsset.category === 'icon') {
        finalW = Math.round(minDim * 0.08)
        finalH = finalW
      } else {
        finalW = Math.round(minDim * 0.35)
        const aspect = (targetAsset.height || 1) / (targetAsset.width || 1)
        finalH = Math.round(finalW * aspect)
      }
    } else if (finalW && !finalH) {
      const aspect = (targetAsset.height || 1) / (targetAsset.width || 1)
      finalH = Math.round(finalW * aspect)
    } else if (!finalW && finalH) {
      const aspect = (targetAsset.width || 1) / (targetAsset.height || 1)
      finalW = Math.round(finalH * aspect)
    }

    let finalX = input.x
    let finalY = input.y

    if (finalX === undefined || finalY === undefined) {
      const margin = Math.round(minDim * 0.05)
      const pos = input.position || (targetAsset.category === 'logo' ? 'top-right' : 'center')

      switch (pos) {
        case 'top-left':
          finalX = margin
          finalY = margin
          break
        case 'top-right':
          finalX = artboardW - (finalW || 100) - margin
          finalY = margin
          break
        case 'bottom-left':
          finalX = margin
          finalY = artboardH - (finalH || 100) - margin
          break
        case 'bottom-right':
          finalX = artboardW - (finalW || 100) - margin
          finalY = artboardH - (finalH || 100) - margin
          break
        case 'hero':
          finalX = Math.round((artboardW - (finalW || 100)) / 2)
          finalY = Math.round(artboardH * 0.2)
          break
        case 'center':
        default:
          finalX = Math.round((artboardW - (finalW || 100)) / 2)
          finalY = Math.round((artboardH - (finalH || 100)) / 2)
          break
      }
    }

    let placedId: string | null = null
    let placedBox: { x?: number; y?: number; width?: number; height?: number } = {}
    if (typeof win.__Auxweave_ADD_IMAGE__ === 'function') {
      const placement = resolvePlacement(
        await win.__Auxweave_ADD_IMAGE__({
          url: targetAsset.url,
          x: finalX,
          y: finalY,
          width: finalW,
          height: finalH,
        }),
      )
      placedId = placement.objectId
      placedBox = placement
    }
    if (!placedId) {
      return {
        success: false,
        message: 'Asset placement failed — the image could not be loaded.',
      }
    }

    return withLayoutGuard({
      success: true,
      placedObjectId: placedId,
      assetName: targetAsset.name,
      category: targetAsset.category,
      x: placedBox.x ?? finalX,
      y: placedBox.y ?? finalY,
      width: placedBox.width ?? finalW,
      height: placedBox.height ?? finalH,
    })
  },
}

export const assetTools: WebMCPTool[] = [getProjectAssetsTool, placeProjectAssetTool]
