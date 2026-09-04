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

  const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null
  const doc =
    typeof document !== 'undefined' ? (document as unknown as Record<string, unknown>) : null
  const nativeDocMC =
    doc?.modelContext && doc.modelContext !== mc
      ? (doc.modelContext as { registerTool?: (t: unknown, opt?: unknown) => Promise<void> })
      : null
  const nativeWinMC =
    win?.__nativeModelContext__ && win.__nativeModelContext__ !== mc
      ? (win.__nativeModelContext__ as {
          registerTool?: (t: unknown, opt?: unknown) => Promise<void>
        })
      : null

  for (const tool of toolsToRegister) {
    if (options?.signal?.aborted) break

    // Register on Auxweave polyfill ModelContext
    await mc.registerTool(tool, { signal: options?.signal })

    const cleanSchema =
      typeof tool.inputSchema === 'object' && tool.inputSchema !== null
        ? tool.inputSchema
        : { type: 'object', properties: {} }

    const safeNativeExecute = async (input: unknown, opt?: unknown) => {
      let parsed = input
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed)
        } catch {
          parsed = {}
        }
      }
      const res = await tool.execute(
        parsed,
        (opt as { signal: AbortSignal }) ?? { signal: new AbortController().signal },
      )
      return typeof res === 'string' ? res : JSON.stringify(res ?? null)
    }

    const nativeDeclaration = {
      name: tool.name,
      title: tool.title || tool.name,
      description: tool.description,
      inputSchema: cleanSchema,
      execute: safeNativeExecute,
    }

    // Explicit W3C WebMCP document.modelContext registration (native Chrome Blink)
    if (nativeDocMC && typeof nativeDocMC.registerTool === 'function') {
      try {
        await nativeDocMC.registerTool(nativeDeclaration, { signal: options?.signal })
      } catch {
        try {
          // Retry without title or options for strict WebIDL compatibility
          await nativeDocMC.registerTool({
            name: tool.name,
            description: tool.description,
            inputSchema: cleanSchema,
            execute: safeNativeExecute,
          })
        } catch {
          /* ignore mirror registration errors */
        }
      }
    }

    // Mirror to window.__nativeModelContext__ if preserved separately
    if (
      nativeWinMC &&
      nativeWinMC !== nativeDocMC &&
      typeof nativeWinMC.registerTool === 'function'
    ) {
      try {
        await nativeWinMC.registerTool(nativeDeclaration, { signal: options?.signal })
      } catch {
        try {
          await nativeWinMC.registerTool({
            name: tool.name,
            description: tool.description,
            inputSchema: cleanSchema,
            execute: safeNativeExecute,
          })
        } catch {
          /* ignore mirror registration errors */
        }
      }
    }

    count++
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
