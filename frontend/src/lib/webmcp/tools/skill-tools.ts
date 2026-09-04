/**
 * WebMCP Design Skill Tool
 * ---------------------------------------------------------------------------
 * Serves the Auxweave Design Skill to external (judge / third-party) agents
 * that land on the canvas cold. Pure and bridge-independent: the skill is
 * bundled content, so it is available even before the editor finishes
 * mounting — exactly when an evaluating agent needs it most.
 */

import { DESIGN_SKILL_MD, DESIGN_SKILL_VERSION } from '../design-skill'
import type { ToolExecuteCallbackOptions, WebMCPTool } from '../webmcp-bridge'

const NOOP_SIGNAL = new AbortController().signal

export const getDesignSkillTool: WebMCPTool = {
  name: 'get_design_skill',
  title: 'Get Auxweave Design Skill',
  description:
    'Returns the Auxweave Design Skill: the mandatory create → validate → repair → verify workflow, the goal-to-tool routing table, palette and layout rules, a minimal poster example, and failure-recovery guidance. Call this FIRST when you arrive on the canvas with no prior knowledge, before any creation tool.',
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
      version: DESIGN_SKILL_VERSION,
      skill: DESIGN_SKILL_MD,
    }
  },
}

export const skillTools: WebMCPTool[] = [getDesignSkillTool]
