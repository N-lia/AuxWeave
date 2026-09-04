/**
 * Master WebMCP Registry & Lifecycle Manager for Auxweave
 */

import { assetTools } from './tools/asset-tools'
import { containerTools } from './tools/container-tools'
import { exportTools } from './tools/export-tools'
import { layoutTools } from './tools/layout-tools'
import { moodboardTools } from './tools/moodboard-tools'
import { pageTools } from './tools/page-tools'
import { primitiveTools } from './tools/primitive-tools'
import { sceneTools } from './tools/scene-tools'
import { skillTools } from './tools/skill-tools'
import { styleTools } from './tools/style-tools'
import { transformTools } from './tools/transform-tools'
import { getWebMCPContext, type WebMCPTool } from './webmcp-bridge'

export const allAuxweaveTools: WebMCPTool[] = [
  ...skillTools,
  ...containerTools,
  ...sceneTools,
  ...primitiveTools,
  ...transformTools,
  ...styleTools,
  ...layoutTools,
  ...pageTools,
  ...exportTools,
  ...moodboardTools,
  ...assetTools,
]

export type RegistryOptions = {
  signal?: AbortSignal
  allowedToolNames?: string[]
}

/**
 * Registers all modular Auxweave tools with document.modelContext
 */
export async function registerAllAuxweaveWebMCPTools(options?: RegistryOptions): Promise<number> {
  const mc = getWebMCPContext()
  let count = 0

  const toolsToRegister = options?.allowedToolNames
    ? allAuxweaveTools.filter(t => options.allowedToolNames!.includes(t.name))
    : allAuxweaveTools

  for (const tool of toolsToRegister) {
    if (options?.signal?.aborted) break
    await mc.registerTool(tool, { signal: options?.signal })
    count++
  }

  // Also mirror tools to native Chrome browser ModelContext so Chrome DevTools WebMCP panel displays them
  if (typeof window !== 'undefined') {
    const win = window as unknown as {
      __nativeModelContext__?: { registerTool?: (t: unknown, opt?: unknown) => Promise<void> }
    }
    const nativeMC = win.__nativeModelContext__
    if (nativeMC && typeof nativeMC.registerTool === 'function') {
      for (const tool of toolsToRegister) {
        if (options?.signal?.aborted) break
        try {
          await nativeMC.registerTool(
            {
              name: tool.name,
              title: tool.title || tool.name,
              description: tool.description,
              inputSchema: tool.inputSchema,
              execute: tool.execute,
            },
            { signal: options?.signal },
          )
        } catch (e) {
          console.warn(`Native Chrome WebMCP registration notice for '${tool.name}':`, e)
        }
      }
    }
  }

  // Dispatch toolchange on document and window for DevTools extension discovery
  if (typeof document !== 'undefined') {
    try {
      document.dispatchEvent(new Event('toolchange'))
      document.dispatchEvent(
        new CustomEvent('toolchange', {
          detail: { count, toolNames: toolsToRegister.map(t => t.name) },
        }),
      )
    } catch {
      /* ignore */
    }
  }

  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new Event('toolchange'))
    } catch {
      /* ignore */
    }
  }

  return count
}

/**
 * Helper hook / class to manage WebMCP lifecycle in React components
 */
export class AuxweaveWebMCPController {
  private abortController: AbortController | null = null

  public async start() {
    this.stop()
    this.abortController = new AbortController()
    return await registerAllAuxweaveWebMCPTools({ signal: this.abortController.signal })
  }

  public stop() {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }
}
