/**
 * Auxweave Design Skill — cold-start playbook for external agents.
 * ---------------------------------------------------------------------------
 * Judge and third-party agents land on the canvas with no prior knowledge.
 * `get_design_skill` hands them one self-contained document: which tool to
 * call for which goal, the mandatory create → validate → repair → verify
 * loop, and the failure-recovery rules. Versioned so eval harnesses can pin
 * behavior (`DESIGN_SKILL_VERSION`).
 *
 * DOM-free, deterministic, importable without a browser.
 */

export const DESIGN_SKILL_VERSION = '1.0.0'

export const DESIGN_SKILL_MD = `# Auxweave Design Skill v${DESIGN_SKILL_VERSION}

You are operating the Auxweave vector canvas through WebMCP tools. Follow this
playbook exactly — it is the difference between a broken canvas and a winner.

## The mandatory loop (no exceptions)

1. INSPECT (optional, cheap): \`get_canvas_scene_state\` — artboard size + objects.
2. CREATE: full flyer → \`apply_poster_template\`; section/card → \`create_flex_container\`; single element → \`add_*\`; image → \`place_moodboard_image\`.
3. VALIDATE: \`validate_layout\` — must run after your last edit.
4. REPAIR (only if step 3 reports issues): \`repair_layout\`, then re-validate.
5. VERIFY: \`verify_canvas_alignment\`, then summarize.
6. EXPORT (when asked): \`export_artboard_render\`.

Every mutation already returns a \`layout\` report
(\`issueCount/errorCount/warningCount\`). Error-severity violations trigger one
automatic repair, reported as \`autoRepair\`. Warnings are yours to fix.

## Tool routing — goal to tool

| Goal | Tool |
|---|---|
| Full flyer/poster from words | \`apply_poster_template({ headline, badge, tagline, credits, release, footer, palette })\` |
| Section, card, hero block | \`create_flex_container({ direction, gap, padding, children })\` |
| One shape / text / icon / image | \`add_shape_primitive\` / \`add_text_element\` / \`add_hugeicon_symbol\` / \`add_image_element\` |
| Move, resize, rotate by id | \`update_object_transform\` |
| Recolor one element | \`apply_fill_paint\` |
| Recolor a set | \`apply_moodboard_palette\` |
| Use a moodboard reference | \`place_moodboard_image({ itemId })\` (find ids via \`get_moodboard_content\`) |
| Wrap loose elements in flow | \`wrap_in_flex_container({ objectIds, direction })\` |
| Check health | \`validate_layout\` |
| Fix health | \`repair_layout\` |
| Tokens, palettes, templates | \`get_design_language\` |

## Hard rules

1. WORDS, NOT PIXELS. For flyers, supply copy and let the engine compute geometry. Never hand-calculate coordinates when a template or flex container exists.
2. TRUST RETURNED GEOMETRY. Every creation returns its ACTUAL box (\`x, y, width, height\`) after collision-avoidance and clamping. Record each box; derive every follow-up placement from recorded boxes, never from the coordinates you sent.
3. PALETTE ROLES, NEVER RAW HEX. Pick one palette (\`noir-crimson\`, \`gold-premiere\`, \`neon-midnight\`, \`bone-minimal\`); use its background/ink/accent roles. Derive the background from moodboard pixels when references exist — never default to black.
4. ONE HERO. A single headline owns the canvas; max 3 colors; text contrast ≥ 4.5:1; foreground inside the 4% safe frame; reading order top-to-bottom.
5. BATCH. Emit all independent calls in one turn so the composition renders at once.
6. FINISH CLEAN. Never conclude with error-severity issues open, and never conclude a mutated canvas without \`validate_layout\` having run after the last edit.

## Minimal winning example (poster)

\`\`\`json
{
  "headline": "City of Echoes",
  "badge": "A noir thriller",
  "tagline": "Every street remembers.",
  "credits": "Lena Voss · Julian Rhodes",
  "release": "In theaters January 16",
  "footer": "PG-13 · 2 HR 11 MIN",
  "palette": "noir-crimson"
}
\`\`\`
Call \`apply_poster_template\` with that object, then \`validate_layout\`.

## Failure recovery

- \`{ success: false, error }\` → read the error, fix the argument (usually a bad id, unknown palette/icon name, or unmounted canvas), retry once with corrected input.
- \`"bridge not initialized"\` → the editor canvas is not mounted yet; wait and retry, do not invent coordinates.
- Empty scene reads (\`count: 0\`) → the canvas is blank; proceed to CREATE, do not loop inspections.
- Repair leaves \`remaining\` issues → adjust those elements directly (\`update_object_transform\` / recolor), then \`validate_layout\` again.
`
