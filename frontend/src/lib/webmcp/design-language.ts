/**
 * Auxweave Design Language v1
 * ---------------------------------------------------------------------------
 * A deterministic, machine-readable design system for flyer/poster generation.
 * Both the in-house agent and external agents target this spec instead of raw
 * pixel math: palettes assign *roles* (ink/accent/…), templates assign
 * *semantic slots* (badge/headline/…), and `instantiatePosterTemplate` turns
 * words into concrete, collision-free geometry on any artboard size.
 *
 * DOM-free and deterministic: safe to import in workers, tests, and prompts.
 */

import {
  type Box,
  computeRoleFontSize,
  regionBox,
  type SemanticRegion,
  safeFrame,
  spacingRamp,
  stackLayout,
  type TypographicRole,
} from './layout-engine'

export const DESIGN_LANGUAGE_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// Palettes — every palette carries *roles*, never raw hex in agent output
// ---------------------------------------------------------------------------

export type PaletteRole =
  | 'background'
  | 'surface'
  | 'ink'
  | 'muted'
  | 'accent'
  | 'accent2'
  | 'onAccent'

export type DesignPalette = {
  name: string
  description: string
  background: string
  surface: string
  ink: string
  muted: string
  accent: string
  accent2: string
  /** Text color guaranteed readable on `accent`. */
  onAccent: string
}

export const CINEMATIC_PALETTES: Record<string, DesignPalette> = {
  'noir-crimson': {
    name: 'noir-crimson',
    description: 'Deep obsidian noir with crimson drama and cyan light-streaks.',
    background: '#0B0F19',
    surface: '#141A2B',
    ink: '#F8FAFC',
    muted: '#94A3B8',
    accent: '#E11D48',
    accent2: '#22D3EE',
    onAccent: '#FFFFFF',
  },
  'gold-premiere': {
    name: 'gold-premiere',
    description: 'Black-and-gold awards-season premiere look.',
    background: '#0A0908',
    surface: '#171310',
    ink: '#FAF6EE',
    muted: '#A89F91',
    accent: '#D4A017',
    accent2: '#8C2F1B',
    onAccent: '#1A1206',
  },
  'neon-midnight': {
    name: 'neon-midnight',
    description: 'Midnight blue with electric cyan and violet neon.',
    background: '#060A13',
    surface: '#0C1626',
    ink: '#F2F7FF',
    muted: '#7D8DA6',
    accent: '#22D3EE',
    accent2: '#A78BFA',
    onAccent: '#06222B',
  },
  'bone-minimal': {
    name: 'bone-minimal',
    description: 'Warm light paper with burnt-orange accent for arthouse prints.',
    background: '#F7F4EC',
    surface: '#FFFFFF',
    ink: '#16130C',
    muted: '#6B6455',
    accent: '#B3402A',
    accent2: '#1F5C4D',
    onAccent: '#FFFFFF',
  },
}

export const DEFAULT_PALETTE_NAME = 'noir-crimson'

export function getPalette(name?: string): DesignPalette {
  if (name && CINEMATIC_PALETTES[name]) return CINEMATIC_PALETTES[name]!
  if (name && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(name.trim())) {
    const bg = name.trim()
    const hex = bg.replace('#', '')
    const r = Number.parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.slice(0, 2), 16)
    const g = Number.parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.slice(2, 4), 16)
    const b = Number.parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.slice(4, 6), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    const isLight = luminance > 0.5
    return {
      name: 'extracted-reference',
      description: 'Dynamically extracted from reference flyer.',
      background: bg,
      surface: isLight ? '#FFFFFF' : '#1E2433',
      ink: isLight ? '#111827' : '#F9FAFB',
      muted: isLight ? '#6B7280' : '#9CA3AF',
      accent: isLight ? '#2563EB' : '#38BDF8',
      accent2: isLight ? '#D97706' : '#F43F5E',
      onAccent: '#FFFFFF',
    }
  }
  return CINEMATIC_PALETTES[DEFAULT_PALETTE_NAME]!
}

export function paletteColor(palette: DesignPalette, role: PaletteRole): string {
  return palette[role]
}

// ---------------------------------------------------------------------------
// Typography — display/body font pairings + role scale
// ---------------------------------------------------------------------------

export type FontPairing = {
  name: string
  description: string
  display: string
  body: string
}

export const FONT_PAIRINGS: Record<string, FontPairing> = {
  cinematic: {
    name: 'cinematic',
    description: 'High-contrast serif display with clean grotesque body.',
    display: 'Playfair Display',
    body: 'Montserrat',
  },
  modern: {
    name: 'modern',
    description: 'Geometric sans throughout, bold display weights.',
    display: 'Poppins',
    body: 'Inter',
  },
  noir: {
    name: 'noir',
    description: 'Condensed poster display with neutral body.',
    display: 'Oswald',
    body: 'Inter',
  },
}

export const DEFAULT_FONT_PAIRING_NAME = 'cinematic'

export function getFontPairing(name?: string): FontPairing {
  if (name && FONT_PAIRINGS[name]) return FONT_PAIRINGS[name]!
  return FONT_PAIRINGS[DEFAULT_FONT_PAIRING_NAME]!
}

export type TypeAssignment = {
  role: TypographicRole
  fontSize: number
  fontFamily: string
  color: string
}

/** Role-based size for an artboard, resolved to a concrete font family. */
export function assignType(
  role: TypographicRole,
  artboardW: number,
  artboardH: number,
  pairing: FontPairing,
  color: string,
  overrideSize?: number,
): TypeAssignment {
  const { fontSize } = computeRoleFontSize(role, artboardW, artboardH, overrideSize)
  return {
    role,
    fontSize,
    fontFamily: role === 'headline' || role === 'subtitle' ? pairing.display : pairing.body,
    color,
  }
}

// ---------------------------------------------------------------------------
// Poster template — semantic slots, fractional geometry, deterministic build
// ---------------------------------------------------------------------------

export type PosterSlotKey =
  | 'background'
  | 'badge'
  | 'headline'
  | 'divider'
  | 'tagline'
  | 'creditsLabel'
  | 'credits'
  | 'release'
  | 'footer'

export type PosterSlot = {
  key: PosterSlotKey
  region: SemanticRegion
  order: number
  typeRole: TypographicRole | null
  paletteRole: PaletteRole | null
}

export type PosterTemplate = {
  name: string
  description: string
  /** Intended aspect, e.g. '4:5'. Geometry is fractional so any size works. */
  aspect: string
  slots: PosterSlot[]
}

export const CINEMATIC_PORTRAIT_TEMPLATE: PosterTemplate = {
  name: 'cinematic-portrait',
  description: 'Dark movie-poster flyer: badge, hero headline, tagline, credits, release, footer.',
  aspect: '4:5',
  slots: [
    { key: 'background', region: 'full', order: 0, typeRole: null, paletteRole: 'background' },
    { key: 'badge', region: 'header', order: 1, typeRole: 'badge', paletteRole: 'accent' },
    { key: 'headline', region: 'hero', order: 2, typeRole: 'headline', paletteRole: 'ink' },
    { key: 'divider', region: 'hero', order: 3, typeRole: null, paletteRole: 'accent' },
    { key: 'tagline', region: 'hero', order: 4, typeRole: 'subtitle', paletteRole: 'ink' },
    { key: 'creditsLabel', region: 'body', order: 5, typeRole: 'caption', paletteRole: 'muted' },
    { key: 'credits', region: 'body', order: 6, typeRole: 'body', paletteRole: 'ink' },
    { key: 'release', region: 'body', order: 7, typeRole: 'body', paletteRole: 'accent' },
    { key: 'footer', region: 'footer', order: 8, typeRole: 'caption', paletteRole: 'muted' },
  ],
}

export const POSTER_TEMPLATES: Record<string, PosterTemplate> = {
  'cinematic-portrait': CINEMATIC_PORTRAIT_TEMPLATE,
}

export function getPosterTemplate(name?: string): PosterTemplate {
  if (name && POSTER_TEMPLATES[name]) return POSTER_TEMPLATES[name]!
  return CINEMATIC_PORTRAIT_TEMPLATE
}

export type PosterContent = {
  headline: string
  badge?: string
  tagline?: string
  creditsLabel?: string
  credits?: string
  release?: string
  footer?: string
}

export type SlotFrame = {
  key: PosterSlotKey
  box: Box
  type: TypeAssignment | null
  color: string
  /** One entry per rendered line (headline may split into two). */
  lines: string[]
  align: 'left' | 'center'
}

/** Rough average glyph advance as a fraction of font size (caps serif). */
const GLYPH_FACTOR = 0.62

/** Deterministic text width estimate — no canvas measurement needed. */
export function estimateTextWidth(text: string, fontSize: number, factor = GLYPH_FACTOR): number {
  return Math.ceil(text.length * fontSize * factor)
}

/**
 * Balance headline words across at most two centered lines.
 * Pure string math: same input always yields the same lines.
 */
export function splitHeadline(headline: string): string[] {
  const words = headline.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']
  if (words.length === 1) {
    const w = words[0]!
    if (w.length <= 12) return [w.toUpperCase()]
    const mid = Math.ceil(w.length / 2)
    return [w.slice(0, mid).toUpperCase(), w.slice(mid).toUpperCase()]
  }
  let best = { index: 1, score: Infinity }
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length
    const b = words.slice(i).join(' ').length
    const score = Math.abs(a - b) + Math.max(a, b) * 0.05
    if (score < best.score) best = { index: i, score }
  }
  return [
    words.slice(0, best.index).join(' ').toUpperCase(),
    words.slice(best.index).join(' ').toUpperCase(),
  ]
}

export type InstantiateOptions = {
  palette?: string
  fontPairing?: string
}

/**
 * Turn poster words into concrete, collision-free slot frames on any
 * artboard. Vertical rhythm comes from stacked regions with spacing-ramp
 * gaps; the headline auto-fits the safe width by shrinking (never growing
 * past the role size).
 */
export function instantiatePosterTemplate(
  templateName: string | undefined,
  content: PosterContent,
  artboardW: number,
  artboardH: number,
  opts: InstantiateOptions = {},
): SlotFrame[] {
  const template = getPosterTemplate(templateName)
  const palette = getPalette(opts.palette)
  const pairing = getFontPairing(opts.fontPairing)
  const minDim = Math.min(artboardW, artboardH)
  const spacing = spacingRamp(minDim)
  const safe = safeFrame(artboardW, artboardH)
  const frames: SlotFrame[] = []
  const push = (frame: SlotFrame) => {
    frames.push({ ...frame, box: { ...frame.box } })
  }

  // Background always fills the bleed.
  push({
    key: 'background',
    box: { x: 0, y: 0, width: artboardW, height: artboardH },
    type: null,
    color: palette.background,
    lines: [],
    align: 'center',
  })

  const header = regionBox('header', artboardW, artboardH)
  const hero = regionBox('hero', artboardW, artboardH)
  const body = regionBox('body', artboardW, artboardH)
  const footer = regionBox('footer', artboardW, artboardH)

  // Badge — docked top-center of the header zone.
  if (content.badge?.trim()) {
    const type = assignType('badge', artboardW, artboardH, pairing, palette.accent)
    const w = Math.min(safe.width, estimateTextWidth(content.badge, type.fontSize) + spacing.md * 2)
    const h = type.fontSize + spacing.sm
    const box = {
      x: Math.round(artboardW / 2 - w / 2),
      y: Math.round(header.y + header.height / 2 - h / 2),
      width: Math.round(w),
      height: Math.round(h),
    }
    push({
      key: 'badge',
      box,
      type,
      color: palette.accent,
      lines: [content.badge.trim().toUpperCase()],
      align: 'center',
    })
  }

  // Headline — auto-fit to the safe width, then stacked with divider+tagline.
  const lines = splitHeadline(content.headline)
  let headSize = computeRoleFontSize('headline', artboardW, artboardH).fontSize
  headSize = Math.max(28, Math.round(minDim * 0.085))
  const longest = Math.max(...lines.map(l => l.length))
  const fitSize = Math.floor(safe.width / (longest * GLYPH_FACTOR))
  headSize = Math.max(24, Math.min(headSize, fitSize))
  const lineH = Math.round(headSize * 1.18)
  const heroStack: Box[] = lines.map(line => ({
    x: 0,
    y: 0,
    width: Math.min(safe.width, estimateTextWidth(line, headSize)),
    height: lineH,
  }))
  const dividerH = Math.max(3, Math.round(artboardH * 0.004))
  heroStack.push({ x: 0, y: 0, width: Math.round(artboardW * 0.22), height: dividerH })
  let taglineType: TypeAssignment | null = null
  if (content.tagline?.trim()) {
    taglineType = assignType('subtitle', artboardW, artboardH, pairing, palette.ink)
    heroStack.push({
      x: 0,
      y: 0,
      width: Math.min(safe.width, estimateTextWidth(content.tagline, taglineType.fontSize, 0.52)),
      height: Math.round(taglineType.fontSize * 1.3),
    })
  }
  // Compress hero gaps (never the badge above it) when the stack would spill
  // past the body block start. Deterministic: same inputs, same gap.
  const heroStart = Math.round(hero.y + spacing.sm)
  const heroLimit = Math.round(body.y + spacing.sm)
  const heroHeights = heroStack.reduce((sum, b) => sum + b.height, 0)
  let heroGap = spacing.md
  if (
    heroStack.length > 1 &&
    heroHeights + heroGap * (heroStack.length - 1) > heroLimit - heroStart
  ) {
    heroGap = Math.max(
      4,
      Math.floor((heroLimit - heroStart - heroHeights) / (heroStack.length - 1)),
    )
  }
  const stacked = stackLayout(heroStack, {
    direction: 'vertical',
    gap: heroGap,
    align: 'center',
    startX: safe.x,
    startY: heroStart,
  })
  // Center the whole hero block horizontally within the safe frame.
  const heroUnion = {
    x: Math.min(...stacked.map(b => b.x)),
    y: Math.min(...stacked.map(b => b.y)),
    width: 0,
    height: 0,
  }
  heroUnion.width = Math.max(...stacked.map(b => b.x + b.width)) - heroUnion.x
  heroUnion.height = Math.max(...stacked.map(b => b.y + b.height)) - heroUnion.y
  const shiftX = Math.round(safe.x + safe.width / 2 - (heroUnion.x + heroUnion.width / 2))
  let placed = stacked.map(b => ({ ...b, x: b.x + shiftX }))
  // Keep the hero block above the body block: on wide/short canvases the
  // stack can run long, so translate it up (never above the safe frame).
  const bodyTop = Math.round(body.y + spacing.sm)
  const heroBottom = Math.max(...placed.map(b => b.y + b.height))
  if (heroBottom > bodyTop) {
    const top = Math.min(...placed.map(b => b.y))
    const dy = Math.min(heroBottom - bodyTop, top - safe.y)
    if (dy > 0) placed = placed.map(b => ({ ...b, y: b.y - dy }))
  }

  const headType = assignType('headline', artboardW, artboardH, pairing, palette.ink, headSize)
  lines.forEach((line, i) => {
    push({
      key: 'headline',
      box: placed[i]!,
      type: headType,
      color: palette.ink,
      lines: [line],
      align: 'center',
    })
  })
  push({
    key: 'divider',
    box: placed[lines.length]!,
    type: null,
    color: palette.accent,
    lines: [],
    align: 'center',
  })
  if (taglineType && content.tagline?.trim()) {
    push({
      key: 'tagline',
      box: placed[lines.length + 1]!,
      type: taglineType,
      color: palette.ink,
      lines: [content.tagline.trim()],
      align: 'center',
    })
  }

  // Body — credits block stacked from the body zone top.
  const bodyItems: Array<{ key: PosterSlotKey; text: string; type: TypeAssignment }> = []
  if (content.creditsLabel?.trim()) {
    bodyItems.push({
      key: 'creditsLabel',
      text: content.creditsLabel.trim().toUpperCase(),
      type: assignType('caption', artboardW, artboardH, pairing, palette.muted),
    })
  }
  if (content.credits?.trim()) {
    bodyItems.push({
      key: 'credits',
      text: content.credits.trim(),
      type: assignType('body', artboardW, artboardH, pairing, palette.ink),
    })
  }
  if (content.release?.trim()) {
    bodyItems.push({
      key: 'release',
      text: content.release.trim().toUpperCase(),
      type: assignType('body', artboardW, artboardH, pairing, palette.accent),
    })
  }
  const bodyBoxes = stackLayout(
    bodyItems.map(item => ({
      x: 0,
      y: 0,
      width: Math.min(safe.width, estimateTextWidth(item.text, item.type.fontSize, 0.55)),
      height: Math.round(item.type.fontSize * 1.35),
    })),
    {
      direction: 'vertical',
      gap: spacing.sm,
      align: 'center',
      startX: safe.x,
      startY: Math.round(body.y + spacing.sm),
    },
  )
  bodyItems.forEach((item, i) => {
    const b = bodyBoxes[i]!
    const centered = { ...b, x: Math.round(safe.x + safe.width / 2 - b.width / 2) }
    push({
      key: item.key,
      box: centered,
      type: item.type,
      color: item.type.color,
      lines: [item.text],
      align: 'center',
    })
  })
  // Keep the body block above the footer zone on short canvases.
  if (bodyItems.length > 0) {
    const last = frames[frames.length - 1]!
    if (last.box.y + last.box.height > footer.y) {
      const dy = last.box.y + last.box.height - footer.y
      for (const f of frames) {
        if (f.key === 'creditsLabel' || f.key === 'credits' || f.key === 'release') {
          f.box = { ...f.box, y: f.box.y - dy }
        }
      }
    }
  }

  // Footer — docked bottom-center.
  if (content.footer?.trim()) {
    const type = assignType('caption', artboardW, artboardH, pairing, palette.muted)
    const w = Math.min(safe.width, estimateTextWidth(content.footer, type.fontSize, 0.55))
    const h = Math.round(type.fontSize * 1.4)
    const cell = { x: 0, y: 0, width: Math.round(w), height: h }
    const docked = {
      ...cell,
      x: Math.round(safe.x + safe.width / 2 - cell.width / 2),
      y: Math.round(footer.y + footer.height - h - spacing.xs),
    }
    push({
      key: 'footer',
      box: docked,
      type,
      color: palette.muted,
      lines: [content.footer.trim()],
      align: 'center',
    })
  }

  return frames.sort(
    (a, b) =>
      template.slots.find(s => s.key === a.key)!.order -
      template.slots.find(s => s.key === b.key)!.order,
  )
}

// ---------------------------------------------------------------------------
// Composition rules — normative guidance, partly machine-checkable
// ---------------------------------------------------------------------------

export const COMPOSITION_RULES: string[] = [
  'R1 — One hero: a single headline owns the hero zone; nothing competes with it.',
  'R2 — Three-color max: background + ink + one accent (a second accent only for light-streaks).',
  'R3 — Ink must hold ≥4.5:1 contrast against its backdrop; accents carrying text use onAccent.',
  'R4 — Respect the safe frame: foreground stays 4% of min-dimension inside every edge.',
  'R5 — No foreground collisions: elements stack with spacing-ramp gaps, never overlap.',
  'R6 — Three sizes max: headline / supporting / metadata. Extra sizes are type-chaos.',
  'R7 — Reading order: badge → headline → tagline → credits → release → footer, top to bottom.',
  'R8 — Full-bleed backgrounds sit at the bottom of the layer stack, never on top.',
]

/** Compact design-language brief for agent system prompts. */
export function describeDesignLanguage(): string {
  const palettes = Object.values(CINEMATIC_PALETTES)
    .map(
      p =>
        `- ${p.name}: bg ${p.background}, ink ${p.ink}, accent ${p.accent}, accent2 ${p.accent2} — ${p.description}`,
    )
    .join('\n')
  return [
    `Auxweave Design Language v${DESIGN_LANGUAGE_VERSION}.`,
    'Palette Strategy: DYNAMIC REFERENCE EXTRACTION. Extract authentic color roles from the moodboard reference flyer instead of choosing from hardcoded palettes.',
    'Color roles: background (canvas backdrop), surface (cards/panels), ink (text contrast >= 4.5:1), muted (secondary text), accent (focal pop).',
    'Reference Presets (optional fallback):',
    palettes,
    'Type roles: badge / headline / subtitle / body / caption (sizes auto-scale to canvas).',
    'Semantic regions: header / hero / body / footer (+ safe, left/center/right).',
    'Sequential Workflow: 1. Understand Colors -> 2. Understand Text Properties -> 3. Design Layout -> 4. Design Elements (or apply_poster_template) -> 5. validate_layout -> repair_layout -> verify_canvas_alignment.',
    `Rules: ${COMPOSITION_RULES.join(' ')}`,
  ].join('\n')
}
