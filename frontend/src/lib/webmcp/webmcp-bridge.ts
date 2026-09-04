/**
 * WebMCP Polyfill & Core Bridge for Auxweave
 * Complies with W3C Web Machine Learning Community Group Specification (August 2026)
 * https://webmachinelearning.github.io/webmcp/
 */

export type WebMCPToolInputSchema = {
  type: string
  properties?: Record<string, unknown>
  required?: string[]
  description?: string
  [key: string]: unknown
}

export type ToolExecuteCallbackOptions = {
  signal: AbortSignal
}

export type WebMCPTool = {
  name: string
  title?: string
  description: string
  inputSchema: WebMCPToolInputSchema
  execute: (inputObject: any, options: ToolExecuteCallbackOptions) => Promise<any>
}

export type RegisteredTool = {
  name: string
  title?: string
  description: string
  inputSchema: string // JSON String
}

export type ModelContextRegisterToolOptions = {
  signal?: AbortSignal
  exposedOrigins?: string[]
}

export interface ModelContextInterface extends EventTarget {
  registerTool(tool: WebMCPTool, options?: ModelContextRegisterToolOptions): Promise<void>
  getTools(options?: { name?: string }): Promise<RegisteredTool[]>
  executeTool(
    toolRef: { name: string },
    inputObject?: object,
    options?: { signal?: AbortSignal },
  ): Promise<string>
  ontoolchange: ((this: ModelContextInterface, ev: Event) => any) | null
}

class AuxiliaryModelContext extends EventTarget implements ModelContextInterface {
  private tools = new Map<string, WebMCPTool>()
  public ontoolchange: ((this: ModelContextInterface, ev: Event) => any) | null = null

  async registerTool(tool: WebMCPTool, options?: ModelContextRegisterToolOptions): Promise<void> {
    if (options?.signal?.aborted) return

    // Tool name validation (W3C ASCII alphanumeric + low line/hyphen/period)
    if (!/^[a-zA-Z0-9_\-.]{1,128}$/.test(tool.name)) {
      throw new TypeError(`Invalid tool name format: '${tool.name}'`)
    }

    this.tools.set(tool.name, tool)

    if (options?.signal) {
      options.signal.addEventListener(
        'abort',
        () => {
          this.tools.delete(tool.name)
          this.notifyToolChange()
        },
        { once: true },
      )
    }

    this.notifyToolChange()
  }

  async getTools(options?: { name?: string }): Promise<RegisteredTool[]> {
    const list = Array.from(this.tools.values())
    const filtered = options?.name ? list.filter(t => t.name === options.name) : list

    return filtered.map(t => {
      const schemaObj =
        typeof t.inputSchema === 'object' && t.inputSchema !== null ? t.inputSchema : {}
      const schemaStr = JSON.stringify(schemaObj)
      // Satisfies both object consumers (Chrome DevTools UI) and string consumers (JSON-schema parsers)
      const schemaHybrid = Object.assign(new String(schemaStr), schemaObj) as unknown as string
      return {
        name: t.name,
        title: t.title ?? t.name,
        description: t.description,
        inputSchema: schemaHybrid,
      }
    })
  }

  async executeTool(
    toolRef: { name: string },
    inputObject: object = {},
    options?: { signal?: AbortSignal },
  ): Promise<string> {
    const tool = this.tools.get(toolRef.name)
    if (!tool) {
      throw new DOMException(`WebMCP tool '${toolRef.name}' not found`, 'NotFoundError')
    }

    const controller = new AbortController()

    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort()
      } else {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true })
      }
    }

    try {
      const result = await tool.execute(inputObject, { signal: controller.signal })
      return JSON.stringify(result ?? null)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err
      }
      throw new DOMException(
        `Tool execution failed: ${err instanceof Error ? err.message : String(err)}`,
        'OperationError',
      )
    }
  }

  private notifyToolChange() {
    const event = new Event('toolchange')
    this.dispatchEvent(event)
    if (typeof this.ontoolchange === 'function') {
      this.ontoolchange.call(this, event)
    }

    // Standard W3C WebMCP: fire toolchange on document and window for DevTools inspectors
    if (typeof document !== 'undefined') {
      try {
        document.dispatchEvent(new Event('toolchange'))
        document.dispatchEvent(
          new CustomEvent('toolchange', {
            detail: { count: this.tools.size, toolNames: Array.from(this.tools.keys()) },
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
  }
}

/**
 * Initializes WebMCP bridge.
 *
 * We ALWAYS use our AuxiliaryModelContext polyfill — never the browser's
 * native document.modelContext. Chrome's built-in ModelContext enforces
 * strict WebIDL validation (inputSchema must be a parsed object, description
 * must be a DOMString) that conflicts with our JSON-string wire format and
 * causes "Failed to parse input arguments" on every tool call.
 *
 * The polyfill instance is stored on window.__AuxweaveModelContext__ so it
 * survives Vite hot-module reloads without losing registered tools.
 */
const POLYFILL_KEY = '__AuxweaveModelContext__'

export function initWebMCPBridge(): ModelContextInterface {
  if (typeof window === 'undefined') {
    return new AuxiliaryModelContext()
  }

  const win = window as unknown as Record<string, unknown>

  // Preserve native browser modelContext if present before installing polyfill
  if (!win.__nativeModelContext__) {
    const docMC =
      typeof document !== 'undefined'
        ? (document as unknown as Record<string, unknown>).modelContext
        : undefined
    const navMC =
      typeof navigator !== 'undefined'
        ? (navigator as unknown as Record<string, unknown>).modelContext
        : undefined
    if (docMC && !(docMC instanceof AuxiliaryModelContext)) {
      win.__nativeModelContext__ = docMC
    } else if (navMC && !(navMC instanceof AuxiliaryModelContext)) {
      win.__nativeModelContext__ = navMC
    }
  }

  if (!(win[POLYFILL_KEY] instanceof AuxiliaryModelContext)) {
    win[POLYFILL_KEY] = new AuxiliaryModelContext()
  }

  const instance = win[POLYFILL_KEY] as AuxiliaryModelContext

  if (typeof document !== 'undefined') {
    try {
      Object.defineProperty(document, 'modelContext', {
        value: instance,
        writable: true,
        configurable: true,
        enumerable: true,
      })
    } catch {
      ;(document as unknown as Record<string, unknown>).modelContext = instance
    }
  }

  try {
    Object.defineProperty(window, 'modelContext', {
      value: instance,
      writable: true,
      configurable: true,
      enumerable: true,
    })
  } catch {
    win.modelContext = instance
  }

  if (typeof navigator !== 'undefined') {
    try {
      Object.defineProperty(navigator, 'modelContext', {
        value: instance,
        writable: true,
        configurable: true,
        enumerable: true,
      })
    } catch {
      ;(navigator as unknown as Record<string, unknown>).modelContext = instance
    }
  }

  return instance
}

export function getWebMCPContext(): ModelContextInterface {
  return initWebMCPBridge()
}

// ─────────────────────────────────────────────────────────────────────────────
// Nebius Token Factory In-House AI Co-Design Agent Engine
// ─────────────────────────────────────────────────────────────────────────────

export interface NebiusModelOption {
  id: string
  name: string
  provider: 'Google' | 'DeepSeek' | 'Meta' | 'Qwen' | 'OpenRouter' | 'AgentRouter' | 'Custom'
  description: string
  recommended?: boolean
}

export const NEBIUS_MODELS: NebiusModelOption[] = [
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    description:
      'Ultra-fast multimodal frontier model from Google with vision and high reasoning precision.',
    recommended: true,
  },
  {
    id: 'gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    description:
      'Google’s flagship reasoning and creative multimodal design model for complex tasks.',
  },
  {
    id: 'moonshotai/kimi-k2.6',
    name: 'Kimi k2.6',
    provider: 'AgentRouter',
    description:
      'State-of-the-art vision and instruction reasoning model via AgentRouter with native spatial tool calling.',
    recommended: true,
  },
  {
    id: 'glm-5.3',
    name: 'GLM 5.3',
    provider: 'AgentRouter',
    description: 'High-capability reasoning model with fast tool calling on AgentRouter.',
    recommended: true,
  },
  {
    id: 'deepseek-v4-flash',
    name: 'DeepSeek V4 Flash',
    provider: 'AgentRouter',
    description: 'Ultra-fast DeepSeek V4 frontier reasoning model on AgentRouter.',
    recommended: true,
  },
  {
    id: 'claude-3-7-sonnet-20250219',
    name: 'Claude 3.7 Sonnet',
    provider: 'AgentRouter',
    description:
      'Hybrid reasoning and spatial creative design model from Anthropic via AgentRouter.',
  },
  {
    id: 'deepseek-ai/DeepSeek-V3-0324',
    name: 'DeepSeek-V3',
    provider: 'DeepSeek',
    description: 'SOTA 671B MoE model. Exceptional tool calling and design precision.',
    recommended: true,
  },
  {
    id: 'deepseek-ai/DeepSeek-R1-0528',
    name: 'DeepSeek-R1',
    provider: 'DeepSeek',
    description: 'Frontier reasoning model for complex multi-step spatial planning.',
  },
  {
    id: 'meta-llama/Llama-3.3-70B-Instruct',
    name: 'Llama 3.3 70B',
    provider: 'Meta',
    description: 'High-intelligence open model with strong instruction following.',
  },
  {
    id: 'meta-llama/Meta-Llama-3.1-70B-Instruct',
    name: 'Llama 3.1 70B',
    provider: 'Meta',
    description: 'Fast, balanced open-weights model for real-time design generation.',
  },
  {
    id: 'Qwen/Qwen3-235B-A22B-Instruct-2507',
    name: 'Qwen3 235B',
    provider: 'Qwen',
    description: 'Most capable Qwen model for expressive typography and structured outputs.',
  },
  {
    id: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    name: 'Qwen 2.5 Coder 32B',
    provider: 'Qwen',
    description: 'Specialized in structured schemas and precision tool parameters.',
  },
  {
    id: 'minimax/minimax-m3:free',
    name: 'MiniMax M3 (Free)',
    provider: 'OpenRouter',
    description:
      'Free multimodal model with 1M context window, vision understanding, and fast tool calling on OpenRouter.',
  },
]

export const NEBIUS_DEFAULT_MODEL = 'deepseek-ai/DeepSeek-V3-0324'

export const NEBIUS_STORAGE_KEY_API_KEY = 'auxweave_nebius_api_key'
export const NEBIUS_STORAGE_KEY_MODEL = 'auxweave_nebius_model'
export const NEBIUS_STORAGE_KEY_ENDPOINT = 'auxweave_nebius_endpoint'
export const GEMINI_STORAGE_KEY_API_KEY = 'auxweave_gemini_api_key'
export const AGENTROUTER_STORAGE_KEY_API_KEY = 'auxweave_agentrouter_api_key'

export const AGENTROUTER_BASE_URL = 'https://agentrouter.org/v1'
export const AGENTROUTER_API_URL = 'https://agentrouter.org/v1/chat/completions'
export const NEBIUS_DEFAULT_API_URL = 'https://api.tokenfactory.nebius.com/v1/chat/completions'
export const NEBIUS_STUDIO_API_URL = 'https://api.studio.nebius.ai/v1/chat/completions'
export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
export const NEBIUS_API_URL = NEBIUS_DEFAULT_API_URL
// Legacy aliases kept for backward compat
export const NEBIUS_DIRECT_URL = NEBIUS_API_URL
export const NEBIUS_PROXY_URL = NEBIUS_API_URL

export const DEFAULT_API_URL = AGENTROUTER_BASE_URL

/**
 * Normalizes any base URL (e.g. "https://agentrouter.org/v1") to its full
 * OpenAI-compatible "/chat/completions" endpoint.
 */
export function resolveChatCompletionsUrl(endpoint: string): string {
  let url = (endpoint || '').trim()
  if (!url) return AGENTROUTER_API_URL
  url = url.replace(/\/+$/, '')
  if (url.endsWith('/chat/completions')) {
    return url
  }
  return `${url}/chat/completions`
}

export function getStoredEndpoint(): string {
  if (typeof window === 'undefined') return AGENTROUTER_BASE_URL
  return localStorage.getItem(NEBIUS_STORAGE_KEY_ENDPOINT) || AGENTROUTER_BASE_URL
}

export function setStoredEndpoint(url: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(NEBIUS_STORAGE_KEY_ENDPOINT, url.trim())
}

export function getStoredApiKey(): string {
  if (typeof window === 'undefined') return ''
  const endpoint = getStoredEndpoint()
  if (endpoint.includes('googleapis.com')) {
    return (
      localStorage.getItem(GEMINI_STORAGE_KEY_API_KEY) ||
      localStorage.getItem(NEBIUS_STORAGE_KEY_API_KEY) ||
      ''
    )
  }
  if (endpoint.includes('agentrouter.org')) {
    return (
      localStorage.getItem(AGENTROUTER_STORAGE_KEY_API_KEY) ||
      localStorage.getItem(NEBIUS_STORAGE_KEY_API_KEY) ||
      ''
    )
  }
  return (
    localStorage.getItem(NEBIUS_STORAGE_KEY_API_KEY) ||
    localStorage.getItem('auxweave_openrouter_api_key') ||
    localStorage.getItem(AGENTROUTER_STORAGE_KEY_API_KEY) ||
    localStorage.getItem(GEMINI_STORAGE_KEY_API_KEY) ||
    ''
  )
}

export function setStoredApiKey(key: string): void {
  if (typeof window === 'undefined') return
  const endpoint = getStoredEndpoint()
  if (endpoint.includes('googleapis.com')) {
    localStorage.setItem(GEMINI_STORAGE_KEY_API_KEY, key.trim())
  } else if (endpoint.includes('agentrouter.org')) {
    localStorage.setItem(AGENTROUTER_STORAGE_KEY_API_KEY, key.trim())
  }
  localStorage.setItem(NEBIUS_STORAGE_KEY_API_KEY, key.trim())
}

export function getStoredModel(): string {
  if (typeof window === 'undefined') return NEBIUS_DEFAULT_MODEL
  return localStorage.getItem(NEBIUS_STORAGE_KEY_MODEL) || NEBIUS_DEFAULT_MODEL
}

export function setStoredModel(model: string): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(NEBIUS_STORAGE_KEY_MODEL, model.trim())
}

export function convertWebMCPToolsToOpenAI(tools: RegisteredTool[]): Array<{
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}> {
  return tools.map(tool => {
    let params: Record<string, unknown> = { type: 'object', properties: {}, required: [] }
    try {
      params = JSON.parse(tool.inputSchema)
    } catch {
      // use default
    }
    return {
      type: 'function',
      function: { name: tool.name, description: tool.description, parameters: params },
    }
  })
}

export function buildAgentSystemPrompt(
  artboardW: number,
  artboardH: number,
  objectCount: number,
  moodboardSummary?: string,
): string {
  const minDim = Math.min(artboardW, artboardH)
  const isSquare = artboardW === artboardH
  const isLandscape = artboardW > artboardH
  const aspectDesc = isSquare ? 'Square 1:1' : isLandscape ? 'Landscape' : 'Portrait'

  const safeMarginX = Math.round(artboardW * 0.05)
  const safeMarginY = Math.round(artboardH * 0.05)
  const safeWidth = Math.round(artboardW * 0.9)
  const safeHeight = Math.round(artboardH * 0.9)
  const centerX = Math.round(artboardW / 2)
  const centerY = Math.round(artboardH / 2)

  const moodboardSection = moodboardSummary
    ? `\n### 🖼️ USER MOODBOARD REFERENCES\n${moodboardSummary}\n- When reference images are attached as vision input, STUDY THEIR PIXELS FIRST: extract the actual background tone, lighting mood, and composition, and mirror them — do not fall back to a default dark canvas.\n- You can inspect these images and palettes using \`get_moodboard_content\`.\n- You can place reference images directly onto the canvas using \`place_moodboard_image\`.\n`
    : `\n### 🖼️ USER MOODBOARD REFERENCES\n- The user has curated moodboards with visual references and inspiration.\n- Call \`get_moodboard_content\` to inspect available images, color palettes, and style tags.\n- Call \`place_moodboard_image\` to place images from the moodboard onto the canvas.\n`

  return `You are the Auxweave Co-Design Agent — an expert graphic designer, art director, and layout specialist embedded inside the Auxweave vector canvas editor. You manipulate the user's vector canvas in real-time by calling available creation, positioning, and editing tools.

### 📐 SPATIAL CANVAS METRICS & SAFE BOUNDS (INSPECTED LIVE)
- **Canvas Dimensions**: ${artboardW}px × ${artboardH}px (${aspectDesc}, ${(artboardW / artboardH).toFixed(2)}:1)
- **Canvas Center Point**: (x: ${centerX}, y: ${centerY})
- **Safe Working Area**: X: ${safeMarginX}px to ${artboardW - safeMarginX}px | Y: ${safeMarginY}px to ${artboardH - safeMarginY}px (width: ${safeWidth}px, height: ${safeHeight}px)
- **Active Canvas Elements**: ${objectCount}
${moodboardSection}
IMPORTANT: Canvas metrics are ALREADY MEASURED above. Do NOT call \`get_canvas_scene_state\` or \`get_document_metadata\` when asked to create or layout a design! Proceed IMMEDIATELY to create elements using \`add_shape_primitive\`, \`add_text_element\`, \`place_moodboard_image\`, etc.

### 🚀 MODERN WEB-NATIVE LAYOUT PRIMITIVES (STRONGLY RECOMMENDED)
You have access to \`create_flex_container\` (Flexbox / Auto Layout).
Instead of manually calculating Cartesian x and y coordinates for each element, you can declare an entire composition, flyer, poster, or card section in a SINGLE tool call:
\`\`\`json
create_flex_container({
  "direction": "column",
  "justify": "center",
  "align": "center",
  "gap": 24,
  "padding": 64,
  "fillColor": "<palette background role — derive from moodboard pixels or chosen palette, e.g. noir-crimson background>",
  "width": "fill",
  "height": "fill",
  "children": [
    { "type": "badge", "text": "GLOBAL DESIGN SUMMIT", "fillColor": "#ef233c" },
    { "type": "headline", "text": "AUXWEAVE 2026", "fillColor": "#FFFFFF" },
    { "type": "subtitle", "text": "The Co-Design Canvas", "fillColor": "#8d99ae" },
    {
      "type": "container",
      "direction": "row",
      "gap": 16,
      "children": [
        { "type": "body", "text": "March 14–16 · Berlin", "fillColor": "#edf2f4" },
        { "type": "icon", "iconName": "calendar-01", "size": 24 }
      ]
    }
  ]
})
\`\`\`
When creating full compositions, flyers, or stacked sections, ALWAYS PREFER \`create_flex_container\`. The deterministic layout solver handles intrinsic text measurements, line wrapping, and gaps with mathematical perfection without you having to calculate pixel arithmetic.

### ACTION-FIRST & SEQUENTIAL EXECUTION DIRECTIVES (MANDATORY)
1. **CALL CREATION TOOLS IMMEDIATELY**: When the user asks you to design, create, layout, or add to the canvas, emit native tool calls (\`create_flex_container\`, \`add_shape_primitive\`, \`add_text_element\`, \`add_hugeicon_symbol\`, \`place_moodboard_image\`) in your VERY FIRST RESPONSE.
2. **SEQUENTIAL STEP-BY-STEP COMPOSITION**: Build complex designs in logical sequential steps so the user sees their artboard evolve live:
   - **Step 1 — Frame & Background**: Create the canvas background shape or primary root flex container (\`create_flex_container\`).
   - **Step 2 — Structural Cards & Media**: Place backdrop cards, hero frames, or moodboard imagery (\`place_moodboard_image\`).
   - **Step 3 — Typographic Hierarchy**: Add the category badge, hero headline, subtitle, and body text (\`add_text_element\`).
   - **Step 4 — Icons & Accents**: Add vector icons (\`add_hugeicon_symbol\`), divider lines, or accent shapes (\`add_shape_primitive\`).
   - **Step 5 — Quality Assurance & Auto-Repair**: Run \`validate_layout\` to verify contrast (≥4.5:1) and boundary alignment.
3. **GROUND NEXT STEPS IN RETURNED GEOMETRY**:
   - Each creation tool returns the element's actual bounding box (\`x, y, width, height\`).
   - Use returned boxes to position follow-up elements precisely (\`relativeTo: 'previous'\`, \`position: 'below'\`), guaranteeing zero overlaps and optical spacing.
4. **STRICT TOKEN & REASONING DISCIPLINE**:
   - Limit internal reasoning to under 100 words.
   - NEVER write pseudocode, drafts, or function calls in markdown text.
   - Tool calls MUST be invoked exclusively via native \`tool_calls\`.
5. **NEVER FINISH WITH ONLY READ-ONLY INSPECTIONS**: Never return just \`get_canvas_scene_state\` without creating requested design elements!

### 📏 SPATIAL AWARENESS & PROPORTIONAL SIZING GUIDELINES:
0. **TRUST RETURNED GEOMETRY, NEVER YOUR REQUESTS (SPATIAL GROUND TRUTH)**:
   - Every creation tool returns the element's ACTUAL box (\`x, y, width, height\`) after collision-avoidance and clamping. The engine may have moved or resized what you asked for.
   - Maintain a running map: after each placement, record its returned box. All follow-up placements (\`relativeTo\`, explicit coords, alignment) MUST derive from recorded boxes, never from the coordinates you originally sent.
   - If a returned box surprises you (e.g. pushed far down), the canvas is crowded there — pick a different zone instead of stacking more.
1. **FULL-BLEED BACKGROUND (PALETTE-DRIVEN, NEVER DEFAULT BLACK)**:
   - Derive the background from the moodboard pixels or the chosen design-language palette's background role — e.g. \`add_shape_primitive({ shapeKind: 'rectangle', width: ${artboardW}, height: ${artboardH}, x: 0, y: 0, fillColor: '<palette background>' })\`.
   - Only use near-black when the references are genuinely dark or the user asked for it. A bright, airy moodboard must produce a bright canvas.
2. **HERO CONTAINERS / CARDS / BACKDROPS**:
   - Width: ~${Math.round(safeWidth * 0.85)}px–${safeWidth}px
   - Height: ~${Math.round(safeHeight * 0.85)}px–${safeHeight}px
3. **SPATIAL GRID LAYOUT (LANDSCAPE & CUSTOM ARTBOARDS)**:
   - **Left Column**: x = ${safeMarginX}, width = ${Math.round(safeWidth * 0.52)}
   - **Right Column**: x = ${safeMarginX + Math.round(safeWidth * 0.56)}, width = ${Math.round(safeWidth * 0.44)}
   - **Vertical Spacing**: Ensure distinct Y coordinates for text blocks (e.g. Headline y=${safeMarginY + 40}, Subtitle y=${safeMarginY + 120}, Body y=${safeMarginY + 200}) or use \`relativeTo: 'previous'\` with \`position: 'below'\`.
4. **MODULAR TYPOGRAPHIC SCALE**:
   - **Headline (role: 'headline')**: ~${Math.round(minDim * 0.055)}px–${Math.round(minDim * 0.075)}px (hero impact, e.g. fontSize: ${Math.round(minDim * 0.065)})
   - **Subtitle (role: 'subtitle')**: ~${Math.round(minDim * 0.03)}px–${Math.round(minDim * 0.04)}px
   - **Body Copy (role: 'body')**: ~${Math.round(minDim * 0.018)}px–${Math.round(minDim * 0.024)}px
   - **Badges / Pill Tags (role: 'badge')**: ~${Math.round(minDim * 0.014)}px–${Math.round(minDim * 0.018)}px
5. **COLOR THEORY & CONTRAST**:
   - Derive the palette from the attached moodboard pixels (or an explicit \`palette\` argument): background role for the canvas, ink role for headlines, accent role sparingly. Example vocabulary (pick ONE palette, never mix): noir-crimson (obsidian/crimson/cyan), gold-premiere, neon-midnight, bone-minimal (light).
   - Never place low-contrast text on any background; every creation result reports its geometry — use those actual boxes (not your requested coordinates) for all follow-up placements.
6. **MOODBOARD REPLICATION & VISUAL SELF-CORRECTION**:
   - When asked to replicate or take inspiration from a moodboard flyer or image, call \`analyze_moodboard_reference({ itemId })\` to extract its Design DNA (layout zones, color roles, and typographic hierarchy).
   - Once elements are placed and styled, call \`verify_canvas_alignment\` to run an automated visual self-correction check and ensure safe margin bounds before concluding.
7. **ELEMENT REMOVAL**:
   - Call \`remove_scene_element({ objectId: '...' })\` or \`remove_scene_element({ name: '...' })\` to clean up unwanted or outdated elements.
8. **PROJECT ASSETS & BRAND LOGOS**:
   - Call \`get_project_assets\` to inspect logos, product shots, or vector assets available in the current project or linked local folder.
   - Use \`place_project_asset({ assetNameKeyword: 'logo', position: 'top-right' })\` to incorporate client logos or hero imagery directly on canvas.
9. **DESIGN LANGUAGE & POSTER GENERATION (PREFERRED FOR FLYERS)**:
   - For ANY full flyer/poster request, call \`apply_poster_template({ headline, badge, tagline, credits, release, footer, palette })\` FIRST — the engine computes all geometry deterministically (background, auto-fitted headline, divider, credits block). Supply WORDS, never pixel math.
   - Palettes (roles, never raw hex): \`noir-crimson\` (obsidian/crimson/cyan), \`gold-premiere\` (black/gold), \`neon-midnight\` (midnight/cyan/violet), \`bone-minimal\` (light paper/burnt-orange). Call \`get_design_language\` for the full token list.
   - After building (template or manual), ALWAYS run \`validate_layout\` → if issues, \`repair_layout\` → finish with \`verify_canvas_alignment\`. Never present a design with error-severity issues.
   - Enforcement is automatic: every mutating tool returns a \`layout\` report (\`issueCount/errorCount/warningCount\`); error-severity violations trigger one auto-repair pass reported as \`autoRepair\`. You cannot finish the session until \`validate_layout\` (or \`repair_layout\` / \`apply_poster_template\`) has run after your last edit — plan for it instead of fighting it.
   - Rules: one hero headline; max 3 colors (bg + ink + one accent); text contrast ≥4.5:1; foreground inside the 4% safe frame; no overlaps; reading order badge → headline → tagline → credits → release → footer.`
}

export interface ToolCallRecord {
  id: string
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  error?: string
  status?: 'running' | 'success' | 'error'
  durationMs?: number
  reasoning?: string
}

export interface AgentTraceStep {
  turn: number
  reasoning?: string
  toolCalls: ToolCallRecord[]
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  reasoning?: string
  trace?: AgentTraceStep[]
  toolCalls?: ToolCallRecord[]
  timestamp: number
}

export interface AgentExecutionCallbacks {
  onToolStart?: (call: ToolCallRecord) => void
  onToolComplete?: (call: ToolCallRecord) => void
  onReasoning?: (reasoning: string) => void
  onAssistantMessage?: (content: string) => void
  onTraceUpdate?: (trace: AgentTraceStep[]) => void
  onError?: (err: Error) => void
}

interface _NebiusChoice {
  message: {
    role: string
    content: string | null
    reasoning_content?: string | null
    reasoning?: string | null
    tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
  }
  finish_reason: string
}

async function _callNebius(
  body: Record<string, unknown>,
  apiKey: string,
  signal?: AbortSignal,
): Promise<{ choices: _NebiusChoice[] }> {
  const rawEndpoint = getStoredEndpoint()
  let endpoint = resolveChatCompletionsUrl(rawEndpoint)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  if (endpoint.includes('openrouter.ai') || endpoint.includes('agentrouter.org')) {
    headers['HTTP-Referer'] = 'https://auxweave.dev'
    headers['X-Title'] = 'Auxweave Vector Studio'
  }

  const isAgentRouter =
    endpoint.includes('agentrouter.org') || rawEndpoint.includes('agentrouter.org')
  if (isAgentRouter) {
    headers['User-Agent'] = 'opencode/'
    if (typeof body.model === 'string') {
      body.model = body.model.trim().toLowerCase()
    }
  }

  const isLocalDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  let requestUrl = endpoint
  if (isLocalDev && isAgentRouter && requestUrl.startsWith('https://agentrouter.org')) {
    requestUrl = requestUrl.replace('https://agentrouter.org', '/agentrouter-proxy')
  }

  let res: Response
  try {
    res = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
  } catch (err) {
    if (requestUrl !== endpoint) {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      })
    } else {
      throw err
    }
  }

  if (!res.ok && requestUrl !== endpoint && isAgentRouter) {
    try {
      const retryRes = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      })
      if (retryRes.ok) {
        return (await retryRes.json()) as { choices: _NebiusChoice[] }
      }
    } catch {
      /* ignore retry failure */
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const isAR = isAgentRouter
    const isOR = endpoint.includes('openrouter.ai')
    const isGoogle = endpoint.includes('googleapis.com')
    let msg = isGoogle
      ? `Google Gemini API error (${res.status})`
      : isAR
        ? `AgentRouter API error (${res.status})`
        : isOR
          ? `OpenRouter API error (${res.status})`
          : `Nebius API error (${res.status})`
    try {
      const p = JSON.parse(text) as { error?: { message?: string } }
      if (p.error?.message) msg += `: ${p.error.message}`
    } catch {
      if (text) msg += `: ${text.slice(0, 200)}`
    }
    if (res.status === 401 && isGoogle) {
      msg += ` [Endpoint: ${endpoint}]. Please check that you entered a valid Google AI Studio Gemini API key (AIza...) in settings.`
    } else if (res.status === 401 && isAR) {
      msg += ` [Endpoint: ${endpoint}]. Please check that you entered a valid AgentRouter API key in settings.`
    } else if (res.status === 401 && isOR) {
      msg += ` [Endpoint: ${endpoint}]. Please check that you entered a valid OpenRouter API key (sk-or-v1-...) in settings.`
    } else if (res.status === 404) {
      msg += ` [Endpoint: ${endpoint}]. Verify your model name or try switching endpoint to AgentRouter, Nebius, OpenRouter, or Google Gemini in settings.`
    }
    throw new Error(msg)
  }

  return (await res.json()) as { choices: _NebiusChoice[] }
}

async function _callNebiusStream(
  body: Record<string, unknown>,
  apiKey: string,
  callbacks: {
    onReasoning?: (text: string) => void
    onContent?: (text: string) => void
  } = {},
  signal?: AbortSignal,
): Promise<{ choices: _NebiusChoice[] }> {
  const rawEndpoint = getStoredEndpoint()
  let endpoint = resolveChatCompletionsUrl(rawEndpoint)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  if (endpoint.includes('openrouter.ai') || endpoint.includes('agentrouter.org')) {
    headers['HTTP-Referer'] = 'https://auxweave.dev'
    headers['X-Title'] = 'Auxweave Vector Studio'
  }

  const isAgentRouter =
    endpoint.includes('agentrouter.org') || rawEndpoint.includes('agentrouter.org')
  if (isAgentRouter) {
    headers['User-Agent'] = 'opencode/'
    if (typeof body.model === 'string') {
      body.model = body.model.trim().toLowerCase()
    }
  }

  const isLocalDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  let requestUrl = endpoint
  if (isLocalDev && isAgentRouter && requestUrl.startsWith('https://agentrouter.org')) {
    requestUrl = requestUrl.replace('https://agentrouter.org', '/agentrouter-proxy')
  }

  const payload = { ...body, stream: true }

  let res: Response
  try {
    res = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal,
    })
  } catch (err) {
    if (requestUrl !== endpoint) {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal,
      })
    } else {
      throw err
    }
  }

  if (!res.ok || !res.body) {
    return _callNebius(body, apiKey, signal)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()

  let accumulatedContent = ''
  let accumulatedReasoning = ''
  const toolCallsMap = new Map<number, { id: string; name: string; args: string }>()

  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith(':')) continue
        if (trimmed === 'data: [DONE]') break

        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6)
          try {
            const parsed = JSON.parse(jsonStr) as {
              choices?: Array<{
                delta?: {
                  content?: string
                  reasoning_content?: string
                  reasoning?: string
                  tool_calls?: Array<{
                    index?: number
                    id?: string
                    function?: { name?: string; arguments?: string }
                  }>
                }
              }>
            }
            const delta = parsed.choices?.[0]?.delta
            if (!delta) continue

            const reasoningChunk = delta.reasoning_content || delta.reasoning
            if (reasoningChunk) {
              accumulatedReasoning += reasoningChunk
              callbacks.onReasoning?.(accumulatedReasoning)
            }

            if (delta.content) {
              accumulatedContent += delta.content
              callbacks.onContent?.(accumulatedContent)
            }

            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const index = tc.index ?? 0
                const existing = toolCallsMap.get(index) ?? { id: '', name: '', args: '' }
                if (tc.id) existing.id = tc.id
                if (tc.function?.name) existing.name += tc.function.name
                if (tc.function?.arguments) existing.args += tc.function.arguments
                toolCallsMap.set(index, existing)
              }
            }
          } catch {
            /* ignore partial chunk parse errors */
          }
        }
      }
    }
  } catch {
    /* if stream interrupted, return whatever was accumulated so far */
  }

  const finalToolCalls = Array.from(toolCallsMap.values()).map((tc, idx) => ({
    id: tc.id || `call_${idx}_${Date.now()}`,
    type: 'function',
    function: {
      name: tc.name,
      arguments: tc.args,
    },
  }))

  return {
    choices: [
      {
        index: 0,
        finish_reason: 'stop',
        message: {
          role: 'assistant',
          content: accumulatedContent,
          reasoning_content: accumulatedReasoning || undefined,
          tool_calls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
        },
      },
    ],
  }
}

/**
 * Fetches dynamic models catalog from GET https://agentrouter.org/v1/models
 * with required 'User-Agent: opencode/' and 'Authorization: Bearer KEY'.
 */
export async function fetchAgentRouterModels(apiKey: string): Promise<NebiusModelOption[]> {
  const trimmedKey = (apiKey || '').trim()
  if (!trimmedKey) return []

  const rawEndpoint = getStoredEndpoint()
  let endpoint = rawEndpoint.includes('agentrouter.org')
    ? resolveChatCompletionsUrl(rawEndpoint).replace('/chat/completions', '/models')
    : 'https://agentrouter.org/v1/models'

  const isLocalDev =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  let requestUrl = endpoint
  if (isLocalDev && requestUrl.startsWith('https://agentrouter.org')) {
    requestUrl = requestUrl.replace('https://agentrouter.org', '/agentrouter-proxy')
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${trimmedKey}`,
    'Content-Type': 'application/json',
    'User-Agent': 'opencode/',
  }

  try {
    let res = await fetch(requestUrl, { method: 'GET', headers })
    if (!res.ok && requestUrl !== endpoint) {
      res = await fetch(endpoint, { method: 'GET', headers })
    }
    if (!res.ok) return []
    const json = (await res.json()) as { data?: Array<{ id: string; name?: string }> }
    if (Array.isArray(json.data) && json.data.length > 0) {
      return json.data.map(item => ({
        id: item.id,
        name: item.name || item.id.split('/').pop() || item.id,
        provider: 'AgentRouter',
        description: `AgentRouter model: ${item.id}`,
      }))
    }
  } catch {
    /* fallback to preconfigured models */
  }

  return []
}

function compactHistoricalToolResults(
  msgs: Array<{
    role: string
    content: AgentMessageContent
    tool_calls?: unknown[]
    tool_call_id?: string
  }>,
  keepLastN = 2,
): void {
  const toolIndices: number[] = []
  for (let i = 0; i < msgs.length; i++) {
    if (msgs[i].role === 'tool') toolIndices.push(i)
  }
  const toCompact = toolIndices.slice(0, Math.max(0, toolIndices.length - keepLastN))
  for (const idx of toCompact) {
    const m = msgs[idx]
    if (typeof m.content === 'string' && m.content.length > 150) {
      try {
        const parsed = JSON.parse(m.content)
        if (
          parsed.status === 'ok' ||
          parsed.status === 'success' ||
          parsed.count !== undefined ||
          parsed.objectId
        ) {
          m.content = JSON.stringify({
            status: 'ok',
            summary: parsed.objectId
              ? `created ${parsed.objectId}`
              : parsed.count !== undefined
                ? `inspected ${parsed.count} items`
                : 'completed',
          })
        } else {
          m.content = '{"status":"ok","summary":"completed"}'
        }
      } catch {
        m.content = '{"status":"ok","summary":"completed"}'
      }
    }
  }
}

function capToolResultLength(raw: string, maxLen = 2500): string {
  if (raw.length <= maxLen) return raw
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.objects)) {
      parsed.objects = parsed.objects.slice(0, 15)
      parsed.notice = `Compacted from ${raw.length} chars to stay within context budget`
      return JSON.stringify(parsed)
    }
  } catch {
    /* fallback */
  }
  return raw.slice(0, maxLen) + '... [compacted for context efficiency]'
}

/**
 * Extracts and parses tool calls that reasoning models inadvertently write as
 * pseudocode or text in their output (e.g. `add_shape_primitive({...})`)
 * instead of native OpenAI function call frames.
 */
function extractTextualToolCalls(
  text: string,
): Array<{ id: string; type: string; function: { name: string; arguments: string } }> {
  if (!text) return []
  const results: Array<{
    id: string
    type: string
    function: { name: string; arguments: string }
  }> = []
  const toolNames = [
    'create_flex_container',
    'wrap_in_flex_container',
    'add_shape_primitive',
    'add_text_element',
    'add_hugeicon_symbol',
    'add_image_element',
    'align_objects',
    'apply_color_palette',
    'place_moodboard_image',
    'verify_canvas_alignment',
  ]

  const regex = new RegExp(`(${toolNames.join('|')})\\s*\\((\\{[\\s\\S]*?\\})\\)`, 'g')
  let match = regex.exec(text)
  let count = 0

  while (match !== null) {
    const toolName = match[1]
    const rawArgs = match[2]
    try {
      const jsonStr = rawArgs.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":').replace(/'/g, '"')
      const parsed = JSON.parse(jsonStr)
      results.push({
        id: `call_fallback_${Date.now()}_${count++}`,
        type: 'function',
        function: {
          name: toolName,
          arguments: JSON.stringify(parsed),
        },
      })
    } catch {
      try {
        const fn = new Function(`return (${rawArgs});`)
        const evaluated = fn()
        if (evaluated && typeof evaluated === 'object') {
          results.push({
            id: `call_fallback_${Date.now()}_${count++}`,
            type: 'function',
            function: {
              name: toolName,
              arguments: JSON.stringify(evaluated),
            },
          })
        }
      } catch {
        /* skip invalid snippet */
      }
    }
    match = regex.exec(text)
  }

  return results
}

function estimateTokenCharacters(
  msgs: Array<{ role: string; content: AgentMessageContent }>,
): number {
  let chars = 0
  for (const m of msgs) {
    if (typeof m.content === 'string') chars += m.content.length
  }
  return chars
}

// ─────────────────────────────────────────────────────────────────────────────
// Moodboard vision: send ACTUAL PIXELS, not just hex lists.
// A text-only reference (`[embedded-image: id]`, palette hexes) lets the model
// talk about a moodboard it has never seen — the root cause of "ignores the
// moodboard" designs. On vision-capable endpoints we attach downscaled image
// parts to the user message in OpenAI chat format.
// ─────────────────────────────────────────────────────────────────────────────

export const VISION_MAX_IMAGES = 3
export const VISION_MAX_DIM = 768

export function endpointSupportsVision(rawEndpoint: string): boolean {
  const e = (rawEndpoint || '').toLowerCase()
  return (
    e.includes('agentrouter.org') || e.includes('openrouter.ai') || e.includes('googleapis.com')
  )
}

/**
 * Pure selection of which board items deserve vision context: first-seen
 * order, de-duplicated by URL, image payloads only. Testable in Node.
 */
export function selectVisionImages<T extends { id: string; title?: string; url: string }>(
  items: T[],
  max = VISION_MAX_IMAGES,
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    if (out.length >= max) break
    if (!item.url || seen.has(item.url)) continue
    if (item.url.startsWith('data:') && !item.url.startsWith('data:image/')) continue
    seen.add(item.url)
    out.push(item)
  }
  return out
}

/** Downscale an embedded image to a model-friendly payload. Browser-only. */
export async function downscaleDataUrlForVision(
  dataUrl: string,
  maxDim = VISION_MAX_DIM,
): Promise<string | null> {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return null
    if (!dataUrl.startsWith('data:image/')) {
      return dataUrl.startsWith('http') ? dataUrl : null
    }
    if (dataUrl.length < 400_000) return dataUrl
    const res = await fetch(dataUrl)
    const blob = await res.blob()
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height))
    if (scale >= 1) {
      bitmap.close()
      return dataUrl
    }
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      bitmap.close()
      return null
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', 0.82)
  } catch {
    return null
  }
}

export type MoodboardVisionImage = { id: string; title: string; url: string }

/** Message content: plain text, or OpenAI chat vision parts. */
export type AgentMessageContent = string | null | Array<Record<string, unknown>>

/** Build user message content, with vision parts when references exist. */
export function toUserContent(
  prompt: string,
  images: MoodboardVisionImage[],
): string | Array<Record<string, unknown>> {
  if (images.length === 0) return prompt
  return [
    { type: 'text', text: prompt },
    ...images.map(img => ({ type: 'image_url', image_url: { url: img.url } })),
  ]
}

export async function executeAgentTurn(
  prompt: string,
  history: ChatMessage[],
  callbacks: AgentExecutionCallbacks = {},
  signal?: AbortSignal,
): Promise<{ reply: string; toolCalls: ToolCallRecord[] }> {
  const apiKey = getStoredApiKey()
  if (!apiKey)
    throw new Error('Nebius API Token is missing. Please configure it in agent settings.')

  const model = getStoredModel()
  const mc = getWebMCPContext()

  // Fetch all registered tools FIRST — we need the full RegisteredTool objects
  // to pass back to mc.executeTool (WebMCP spec requires the full descriptor,
  // not just a bare { name } stub — otherwise description is undefined).
  const availableTools = await mc.getTools()

  // Build a name → RegisteredTool lookup map for O(1) full-descriptor access
  const toolMap = new Map<string, RegisteredTool>()
  for (const t of availableTools) {
    toolMap.set(t.name, t)
  }

  // 1. Get live canvas dimensions from editor bridge and WebMCP metadata
  let artboardW = 1920
  let artboardH = 1080
  let objectCount = 0

  const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : {}

  // Fast-path: query live canvas dimensions from the mounted editor bridge
  if (typeof win.__Auxweave_GET_DOC_META__ === 'function') {
    try {
      const meta = (
        win.__Auxweave_GET_DOC_META__ as () => {
          width?: number
          height?: number
        }
      )()
      if (meta?.width && meta?.height) {
        artboardW = meta.width
        artboardH = meta.height
      }
    } catch {
      /* fallback */
    }
  }

  // Primary check: Query direct document window metadata for active artboard bounds
  if (typeof window !== 'undefined') {
    const win = window as unknown as {
      __Auxweave_GET_DOC_META__?: () => { width: number; height: number }
    }
    if (typeof win.__Auxweave_GET_DOC_META__ === 'function') {
      const meta = win.__Auxweave_GET_DOC_META__()
      if (meta?.width && meta?.height) {
        artboardW = meta.width
        artboardH = meta.height
      }
    }
  }

  // Secondary check: Query scene state via WebMCP tool for object count and artboard bounds
  const sceneStateTool = toolMap.get('get_canvas_scene_state')
  if (sceneStateTool) {
    try {
      const raw = await mc.executeTool(sceneStateTool, {})
      const state = JSON.parse(raw) as {
        artboard?: { width: number; height: number }
        objects?: unknown[]
      }
      if (state?.artboard?.width && state?.artboard?.height) {
        artboardW = state.artboard.width
        artboardH = state.artboard.height
      }
      if (Array.isArray(state?.objects)) objectCount = state.objects.length
    } catch {
      /* use defaults */
    }
  }

  let moodboardSummary = ''
  let visionImages: MoodboardVisionImage[] = []
  try {
    const { loadMoodboardsFromStorage, loadActiveMoodboardId } = await import(
      '../auxweave-moodboard'
    )
    const boards = loadMoodboardsFromStorage()
    const activeId = loadActiveMoodboardId(boards)
    const activeBoard = boards.find(b => b.id === activeId) || boards[0]
    if (activeBoard && activeBoard.items && activeBoard.items.length > 0) {
      moodboardSummary = `Active Moodboard "${activeBoard.name}" (${activeBoard.items.length} images): ${activeBoard.items
        .slice(0, 8)
        .map(
          i =>
            `[ID: ${i.id}] "${i.title || 'Image'}" (URL: ${i.url.startsWith('data:') ? `[embedded-image: ${i.id}]` : i.url})`,
        )
        .join(', ')}. Dominant palette: ${activeBoard.colorPalette?.join(', ') || 'N/A'}.`
      if (endpointSupportsVision(getStoredEndpoint())) {
        const picked = selectVisionImages(activeBoard.items)
        const prepared = await Promise.all(
          picked.map(async item => {
            const url = item.url.startsWith('data:')
              ? await downscaleDataUrlForVision(item.url)
              : item.url
            return url ? { id: item.id, title: item.title || 'Image', url } : null
          }),
        )
        visionImages = prepared.filter((v): v is MoodboardVisionImage => v !== null)
        if (visionImages.length > 0) {
          moodboardSummary += ` ${visionImages.length} reference image(s) are attached as vision input to this request — STUDY THEIR ACTUAL PIXELS (mood, lighting, composition, dominant colors) and let them drive your palette and layout choices, instead of defaulting to a black background.`
        }
      }
    }
  } catch {
    /* fallback */
  }

  const openAITools = convertWebMCPToolsToOpenAI(availableTools)
  const systemPrompt = buildAgentSystemPrompt(artboardW, artboardH, objectCount, moodboardSummary)

  const messages: Array<{
    role: string
    content: AgentMessageContent
    tool_calls?: unknown[]
    tool_call_id?: string
  }> = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-4).map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content.slice(0, 1000) : m.content,
    })),
    { role: 'user', content: toUserContent(prompt, visionImages) },
  ]

  const trace: AgentTraceStep[] = []
  const executedToolCalls: ToolCallRecord[] = []
  let accumulatedReasoning = ''
  let finalReply = ''
  let turns = 0
  const maxTurns = 8

  const READ_ONLY_TOOLS = new Set([
    'get_canvas_scene_state',
    'get_document_metadata',
    'get_active_selection',
    'get_moodboard_content',
    'analyze_moodboard_reference',
    'verify_canvas_alignment',
    'validate_layout',
    'get_design_language',
    'get_project_assets',
  ])

  // Tools whose result already carries a full layout-issues report.
  const VALIDATED_BY_TOOLS = new Set(['validate_layout', 'repair_layout', 'apply_poster_template'])

  while (turns < maxTurns) {
    if (signal?.aborted) throw new DOMException('Agent execution stopped', 'AbortError')
    turns++

    // Anthropic Context Engineering: Compact historical tool results on turn 2+
    if (turns > 1) {
      compactHistoricalToolResults(messages, 2)
    }

    // Safety guard: If total characters exceed safe context budget, aggressively compact all tool results
    if (estimateTokenCharacters(messages) > 100000) {
      compactHistoricalToolResults(messages, 0)
    }

    const data = await _callNebiusStream(
      {
        model,
        messages,
        tools: openAITools.length > 0 ? openAITools : undefined,
        tool_choice: openAITools.length > 0 ? 'auto' : undefined,
        temperature: 0.7,
        max_tokens: 8192,
      },
      apiKey,
      {
        onReasoning: text => {
          callbacks.onReasoning?.(text)
        },
        onContent: text => {
          callbacks.onAssistantMessage?.(text)
        },
      },
      signal,
    )

    const choice = data.choices?.[0]
    if (!choice) break

    const assistantMsg = choice.message

    // Extract reasoning trace from reasoning_content or <think> tags or intermediate text
    let turnReasoning = ''
    const rawReasoning =
      assistantMsg.reasoning_content ||
      (assistantMsg as unknown as { reasoning?: string }).reasoning

    let cleanContent = assistantMsg.content || ''
    if (rawReasoning) {
      turnReasoning = rawReasoning.trim()
    } else if (cleanContent.includes('<think>')) {
      const match = cleanContent.match(/<think>([\s\S]*?)<\/think>/)
      if (match) {
        turnReasoning = match[1].trim()
        cleanContent = cleanContent.replace(/<think>[\s\S]*?<\/think>/, '').trim()
      }
    } else if (
      assistantMsg.tool_calls &&
      assistantMsg.tool_calls.length > 0 &&
      cleanContent.trim()
    ) {
      turnReasoning = cleanContent.trim()
    }

    // Safety fallback: If model didn't emit formal tool_calls but wrote them as pseudocode in text
    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
      const fallbackCalls = extractTextualToolCalls(`${cleanContent}\n${turnReasoning}`)
      if (fallbackCalls.length > 0) {
        assistantMsg.tool_calls = fallbackCalls
      }
    }

    if (turnReasoning) {
      accumulatedReasoning += (accumulatedReasoning ? '\n\n' : '') + turnReasoning
      callbacks.onReasoning?.(accumulatedReasoning)
    }

    messages.push({
      role: 'assistant',
      content: assistantMsg.content,
      tool_calls: assistantMsg.tool_calls,
    })

    // If turn got truncated due to token length during reasoning and made no tool calls,
    // nudge the model in the next turn to emit tool calls directly without reasoning
    if (
      choice.finish_reason === 'length' &&
      (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) &&
      turns < maxTurns
    ) {
      messages.push({
        role: 'user',
        content:
          'SYSTEM ALERT: Your previous turn was cut off at the token limit during internal reasoning without invoking tools. Immediately emit the necessary native tool calls now without preamble or reasoning.',
      })
      continue
    }

    if (cleanContent) {
      finalReply = cleanContent
      callbacks.onAssistantMessage?.(finalReply)
    }

    const currentTurnTools: ToolCallRecord[] = []

    if (assistantMsg.tool_calls && assistantMsg.tool_calls.length > 0) {
      for (const toolCall of assistantMsg.tool_calls) {
        if (signal?.aborted) throw new DOMException('Agent execution stopped', 'AbortError')

        let parsedArgs: Record<string, unknown> = {}
        try {
          parsedArgs = JSON.parse(toolCall.function.arguments)
        } catch {
          /* use empty */
        }

        const record: ToolCallRecord = {
          id: toolCall.id,
          toolName: toolCall.function.name,
          args: parsedArgs,
          reasoning: turnReasoning || undefined,
          status: 'running',
        }
        callbacks.onToolStart?.(record)

        // Look up the full RegisteredTool descriptor — required by WebMCP spec.
        const registeredTool = toolMap.get(record.toolName)
        if (!registeredTool) {
          const errStr = `Tool '${record.toolName}' is not registered in this canvas session.`
          record.error = errStr
          record.status = 'error'
          callbacks.onToolComplete?.(record)
          currentTurnTools.push(record)
          executedToolCalls.push(record)
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: errStr }),
          })
          continue
        }

        const startT = performance.now()
        try {
          const rawResult = await mc.executeTool(registeredTool, parsedArgs)
          const duration = Math.round(performance.now() - startT)
          let parsedResult: unknown = rawResult
          try {
            parsedResult = JSON.parse(rawResult)
          } catch {
            /* keep raw string */
          }

          record.result = parsedResult
          record.status = 'success'
          record.durationMs = duration
          callbacks.onToolComplete?.(record)
          currentTurnTools.push(record)
          executedToolCalls.push(record)
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: capToolResultLength(rawResult ?? JSON.stringify({ success: true })),
          })
        } catch (err) {
          const duration = Math.round(performance.now() - startT)
          const errStr = err instanceof Error ? err.message : String(err)
          record.error = errStr
          record.status = 'error'
          record.durationMs = duration
          callbacks.onToolComplete?.(record)
          currentTurnTools.push(record)
          executedToolCalls.push(record)
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: errStr }),
          })
        }
      }
    }

    const step: AgentTraceStep = {
      turn: turns,
      reasoning: turnReasoning || undefined,
      toolCalls: currentTurnTools,
    }
    trace.push(step)
    callbacks.onTraceUpdate?.(trace)

    // Critical: If all tools executed in this turn were purely read-only inspections
    // (e.g. get_canvas_scene_state, analyze_moodboard_reference), DO NOT stop!
    // Instruct the model to proceed immediately to create the elements.
    const onlyReadOnlyCalled =
      currentTurnTools.length > 0 && currentTurnTools.every(t => READ_ONLY_TOOLS.has(t.toolName))

    if (onlyReadOnlyCalled && turns < maxTurns) {
      messages.push({
        role: 'user',
        content:
          'Inspection complete. Now proceed immediately to create and place the requested shapes, typography, and design elements on the canvas using add_shape_primitive, add_text_element, and other creation tools to build the requested design.',
      })
      continue
    }

    // Enforced validation: a session that mutated the canvas may not conclude
    // until a full layout validation has run after the last edit.
    const wroteToCanvas = executedToolCalls.some(
      t => t.status === 'success' && !READ_ONLY_TOOLS.has(t.toolName),
    )
    const ranFullValidation = executedToolCalls.some(
      t => t.status !== 'error' && VALIDATED_BY_TOOLS.has(t.toolName),
    )
    if (wroteToCanvas && !ranFullValidation && turns < maxTurns) {
      messages.push({
        role: 'user',
        content:
          'You edited the canvas but have not run `validate_layout` since your last edit. Run `validate_layout` now; if it reports violations, fix them with `repair_layout` (or adjust the elements directly), re-validate, and only then summarize the finished design.',
      })
      continue
    }

    if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) break
  }

  return {
    reply: finalReply || 'Done! I have applied the requested design elements to your canvas.',
    reasoning: accumulatedReasoning || undefined,
    trace,
    toolCalls: executedToolCalls,
  }
}
