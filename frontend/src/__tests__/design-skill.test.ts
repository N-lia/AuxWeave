import { describe, expect, it } from 'vitest'
import { DESIGN_SKILL_MD, DESIGN_SKILL_VERSION } from '../lib/webmcp/design-skill'
import { getDesignSkillTool } from '../lib/webmcp/tools/skill-tools'

const REQUIRED_TOOLS = [
  'apply_poster_template',
  'create_flex_container',
  'add_shape_primitive',
  'add_text_element',
  'place_moodboard_image',
  'validate_layout',
  'repair_layout',
  'verify_canvas_alignment',
  'export_artboard_render',
  'get_design_language',
]

describe('design skill content', () => {
  it('is versioned', () => {
    expect(DESIGN_SKILL_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
    expect(DESIGN_SKILL_MD).toContain(DESIGN_SKILL_VERSION)
  })

  it('routes every core tool so cold agents can plan', () => {
    for (const tool of REQUIRED_TOOLS) {
      expect(DESIGN_SKILL_MD, tool).toContain(tool)
    }
  })

  it('teaches the mandatory loop and hard rules', () => {
    expect(DESIGN_SKILL_MD).toContain('validate_layout')
    expect(DESIGN_SKILL_MD).toContain('repair_layout')
    expect(DESIGN_SKILL_MD).toContain('TRUST RETURNED GEOMETRY')
    expect(DESIGN_SKILL_MD).toContain('PALETTE ROLES')
  })

  it('stays within a token budget (~3KB)', () => {
    expect(DESIGN_SKILL_MD.length).toBeLessThan(6000)
    expect(DESIGN_SKILL_MD.length).toBeGreaterThan(1500)
  })
})

describe('get_design_skill tool', () => {
  it('serves the skill without a browser bridge', () =>
    getDesignSkillTool.execute({}, { signal: new AbortController().signal }).then(result => {
      const r = result as { success: boolean; version: string; skill: string }
      expect(r.success).toBe(true)
      expect(r.version).toBe(DESIGN_SKILL_VERSION)
      expect(r.skill).toBe(DESIGN_SKILL_MD)
    }))

  it('is registered with a cold-start description', () => {
    expect(getDesignSkillTool.name).toBe('get_design_skill')
    expect(getDesignSkillTool.description).toMatch(/FIRST/i)
  })
})
