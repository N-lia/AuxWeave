import { describe, expect, it } from 'vitest'
import {
  CINEMATIC_PALETTES,
  COMPOSITION_RULES,
  DEFAULT_PALETTE_NAME,
  DESIGN_LANGUAGE_VERSION,
  describeDesignLanguage,
  estimateTextWidth,
  getFontPairing,
  getPalette,
  getPosterTemplate,
  instantiatePosterTemplate,
  splitHeadline,
} from '../lib/webmcp/design-language'
import { contrastRatio, overlapRatio } from '../lib/webmcp/layout-engine'

const SIZES = [
  { w: 1080, h: 1350 },
  { w: 1920, h: 1080 },
  { w: 1080, h: 1080 },
]

const FULL_CONTENT = {
  headline: 'City of Echoes',
  badge: 'A noir thriller',
  tagline: 'Every street remembers.',
  creditsLabel: 'Starring',
  credits: 'Lena Voss · Julian Rhodes',
  release: 'In theaters January 16',
  footer: 'PG-13 · 2 HR 11 MIN',
}

describe('palettes', () => {
  it('guarantees readable ink and on-accent pairs in every palette', () => {
    for (const palette of Object.values(CINEMATIC_PALETTES)) {
      const ink = contrastRatio(palette.ink, palette.background)
      expect(ink, `${palette.name} ink/bg`).not.toBeNull()
      expect(ink!, `${palette.name} ink/bg`).toBeGreaterThanOrEqual(7)
      const accent = contrastRatio(palette.onAccent, palette.accent)
      expect(accent, `${palette.name} onAccent/accent`).not.toBeNull()
      expect(accent!, `${palette.name} onAccent/accent`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('falls back to defaults for unknown names', () => {
    expect(getPalette('nope').name).toBe(DEFAULT_PALETTE_NAME)
    expect(getPosterTemplate('nope').name).toBe('cinematic-portrait')
    expect(getFontPairing('nope').name).toBe('cinematic')
  })
})

describe('splitHeadline', () => {
  it('balances words across two uppercase lines', () => {
    expect(splitHeadline('City of Echoes')).toEqual(['CITY OF', 'ECHOES'])
    expect(splitHeadline('Dune')).toEqual(['DUNE'])
    expect(splitHeadline('')).toEqual([''])
    expect(splitHeadline('  ')).toEqual([''])
  })

  it('is deterministic', () => {
    expect(splitHeadline('The Long Night of the Neon City')).toEqual(
      splitHeadline('The Long Night of the Neon City'),
    )
  })
})

describe('estimateTextWidth', () => {
  it('grows monotonically with text length and font size', () => {
    const a = estimateTextWidth('ABC', 40)
    const b = estimateTextWidth('ABCDEF', 40)
    const c = estimateTextWidth('ABC', 80)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(a)
  })
})

describe('instantiatePosterTemplate', () => {
  it('stays in-bounds and collision-free on reference sizes', () => {
    for (const { w, h } of SIZES) {
      const frames = instantiatePosterTemplate('cinematic-portrait', FULL_CONTENT, w, h)
      expect(frames.length).toBeGreaterThan(5)
      for (const f of frames) {
        expect(f.box.x, `${w}x${h} ${f.key} x`).toBeGreaterThanOrEqual(0)
        expect(f.box.y, `${w}x${h} ${f.key} y`).toBeGreaterThanOrEqual(0)
        expect(f.box.x + f.box.width, `${w}x${h} ${f.key} right`).toBeLessThanOrEqual(w)
        expect(f.box.y + f.box.height, `${w}x${h} ${f.key} bottom`).toBeLessThanOrEqual(h)
      }
      const fg = frames.filter(f => f.key !== 'background')
      for (let i = 0; i < fg.length; i++) {
        for (let j = i + 1; j < fg.length; j++) {
          const ratio = overlapRatio(fg[i]!.box, fg[j]!.box)
          expect(ratio, `${w}x${h} ${fg[i]!.key} vs ${fg[j]!.key}`).toBeLessThanOrEqual(0.05)
        }
      }
    }
  })

  it('fits the headline inside the safe width', () => {
    const w = 1080
    const h = 1350
    const frames = instantiatePosterTemplate('cinematic-portrait', FULL_CONTENT, w, h)
    const heads = frames.filter(f => f.key === 'headline')
    expect(heads.length).toBe(2)
    for (const hf of heads) {
      expect(hf.box.width).toBeLessThanOrEqual(w)
    }
  })

  it('skips empty optional slots and stays deterministic', () => {
    const minimal = instantiatePosterTemplate(
      'cinematic-portrait',
      { headline: 'Echoes' },
      1080,
      1350,
    )
    const keys = minimal.map(f => f.key)
    expect(keys).toContain('background')
    expect(keys).toContain('headline')
    expect(keys).not.toContain('tagline')
    expect(keys).not.toContain('credits')
    const again = instantiatePosterTemplate(
      'cinematic-portrait',
      { headline: 'Echoes' },
      1080,
      1350,
    )
    expect(again).toEqual(minimal)
  })
})

describe('describeDesignLanguage', () => {
  it('briefs agents with version, palettes, tools, and rules', () => {
    const brief = describeDesignLanguage()
    expect(brief).toContain(DESIGN_LANGUAGE_VERSION)
    expect(brief).toContain('noir-crimson')
    expect(brief).toContain('apply_poster_template')
    expect(brief).toContain('validate_layout')
    for (const rule of COMPOSITION_RULES) {
      expect(brief).toContain(rule.split('—')[0]!.trim())
    }
  })
})
