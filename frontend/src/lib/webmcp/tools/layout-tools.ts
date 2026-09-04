/**
 * WebMCP Layout Intelligence Tools
 * ---------------------------------------------------------------------------
 * Deterministic layout services for agents: constraint validation, automatic
 * repair, the machine-readable design language, and one-shot poster
 * generation from words (no pixel math required from the model).
 *
 * NOTE: `options` defaults to `{}` so callers may invoke execute(input)
 * without a second argument. Never destructure options as required.
 */

import {
  CINEMATIC_PALETTES,
  COMPOSITION_RULES,
  DEFAULT_FONT_PAIRING_NAME,
  DEFAULT_PALETTE_NAME,
  DESIGN_LANGUAGE_VERSION,
  FONT_PAIRINGS,
  POSTER_TEMPLATES,
  type PosterContent,
} from '../design-language'
import type { ToolExecuteCallbackOptions, WebMCPTool } from '../webmcp-bridge'

const NOOP_SIGNAL = new AbortController().signal

type BridgeWindow = {
  __Auxweave_VALIDATE_LAYOUT__?: () => unknown
  __Auxweave_REPAIR_LAYOUT__?: (args: unknown) => unknown
  __Auxweave_APPLY_TEMPLATE__?: (args: unknown) => unknown
}

function bridge(): BridgeWindow {
  return typeof window !== 'undefined' ? (window as unknown as BridgeWindow) : {}
}

export const validateLayoutTool: WebMCPTool = {
  name: 'validate_layout',
  title: 'Validate Layout Constraints',
  description:
    'Lints the active artboard for deterministic constraint violations: out-of-bounds elements, safe-margin breaches, foreground overlaps, unreadably small text, type-chaos, and low-contrast text. Read-only; returns issues with fix hints.',
  inputSchema: {
    type: 'object',
    properties: {
      minContrast: {
        type: 'number',
        description: 'Minimum WCAG text contrast ratio (default 4.5).',
      },
    },
  },
  execute: async (
    input: { minContrast?: number } = {},
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const win = bridge()
    if (typeof win.__Auxweave_VALIDATE_LAYOUT__ === 'function') {
      return (await win.__Auxweave_VALIDATE_LAYOUT__()) as Record<string, unknown>
    }
    void input
    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const repairLayoutTool: WebMCPTool = {
  name: 'repair_layout',
  title: 'Repair Layout Automatically',
  description:
    'Applies the smallest deterministic fixes for layout violations: clamps runaway elements into bounds, pushes colliding foreground apart, nudges items into safe margins, and raises tiny text to the readability floor. Non-destructive — nothing is deleted. Returns applied fixes plus any remaining issues.',
  inputSchema: {
    type: 'object',
    properties: {
      fixTinyText: {
        type: 'boolean',
        description: 'Raise tiny text to the readability floor (default true).',
      },
    },
  },
  execute: async (
    input: { fixTinyText?: boolean } = {},
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const win = bridge()
    if (typeof win.__Auxweave_REPAIR_LAYOUT__ === 'function') {
      return (await win.__Auxweave_REPAIR_LAYOUT__(input)) as Record<string, unknown>
    }
    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const getDesignLanguageTool: WebMCPTool = {
  name: 'get_design_language',
  title: 'Get Design Language Tokens',
  description:
    'Returns the Auxweave Design Language: version, cinematic palettes with semantic color roles, font pairings, poster templates with slot anatomy, and composition rules. Call this before hand-building a flyer so colors, type, and zones stay on-system.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  execute: async (
    _input: Record<string, unknown> = {},
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    return {
      success: true,
      version: DESIGN_LANGUAGE_VERSION,
      defaultPalette: DEFAULT_PALETTE_NAME,
      defaultFontPairing: DEFAULT_FONT_PAIRING_NAME,
      palettes: Object.values(CINEMATIC_PALETTES),
      fontPairings: Object.values(FONT_PAIRINGS),
      templates: Object.values(POSTER_TEMPLATES).map(t => ({
        name: t.name,
        description: t.description,
        aspect: t.aspect,
        slots: t.slots.map(s => ({
          key: s.key,
          region: s.region,
          typeRole: s.typeRole,
          paletteRole: s.paletteRole,
        })),
      })),
      compositionRules: COMPOSITION_RULES,
    }
  },
}

export const applyPosterTemplateTool: WebMCPTool = {
  name: 'apply_poster_template',
  title: 'Generate Poster From Template',
  description:
    'One-shot cinematic flyer generation: supply WORDS (headline, tagline, credits, release) plus palette/template names, and the engine computes all geometry deterministically — background, badge, auto-fitted headline, divider, tagline, credits, release, footer. Prefer this over manual add_shape/add_text sequences for full flyers.',
  inputSchema: {
    type: 'object',
    properties: {
      template: {
        type: 'string',
        description:
          'Poster template name (default "cinematic-portrait"). See get_design_language.',
      },
      headline: {
        type: 'string',
        description: 'Hero headline words, e.g. "City of Echoes". Required.',
      },
      badge: { type: 'string', description: 'Eyebrow line, e.g. "A noir thriller".' },
      tagline: { type: 'string', description: 'One-linehook under the headline.' },
      creditsLabel: { type: 'string', description: 'Credits kicker, e.g. "Starring".' },
      credits: { type: 'string', description: 'Cast/credit names line.' },
      release: { type: 'string', description: 'Release line, e.g. "In theaters January 16".' },
      footer: { type: 'string', description: 'Bottom metadata, e.g. "PG-13 · 2 HR 11 MIN".' },
      palette: {
        type: 'string',
        description: 'Palette name (default "noir-crimson"). See get_design_language.',
      },
      fontPairing: {
        type: 'string',
        description: 'Font pairing name (default "cinematic"). See get_design_language.',
      },
    },
    required: ['headline'],
  },
  execute: async (
    input: PosterContent & { template?: string; palette?: string; fontPairing?: string },
    options: ToolExecuteCallbackOptions = { signal: NOOP_SIGNAL },
  ) => {
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (!input?.headline || typeof input.headline !== 'string' || !input.headline.trim()) {
      return { success: false, error: 'headline is required to generate a poster.' }
    }
    const win = bridge()
    if (typeof win.__Auxweave_APPLY_TEMPLATE__ === 'function') {
      return (await win.__Auxweave_APPLY_TEMPLATE__(input)) as Record<string, unknown>
    }
    return { success: false, error: 'Auxweave editor bridge not initialized' }
  },
}

export const layoutTools: WebMCPTool[] = [
  validateLayoutTool,
  repairLayoutTool,
  getDesignLanguageTool,
  applyPosterTemplateTool,
]
