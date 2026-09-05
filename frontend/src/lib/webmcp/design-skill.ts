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

export const DESIGN_SKILL_VERSION = '1.1.0'

export const DESIGN_SKILL_MD = `# Auxweave Design Skill v${DESIGN_SKILL_VERSION}

You are operating the Auxweave vector canvas through WebMCP tools. Follow this
sequential reference-driven playbook to recreate and build production-grade flyers.

## The Reference-Driven Pipeline (Execute Sequentially)

When recreating a flyer from a moodboard or designing from visual references,
execute these steps sequentially so the canvas evolves progressively:

### 1. UNDERSTAND COLORS FIRST (Dynamic Extraction — Never Hardcode Palettes)
- DO NOT use hardcoded palettes (never default to noir-crimson, gold-premiere, or static presets).
- Inspect the moodboard reference flyer via \`place_moodboard_image\` or visual analysis.
- Extract authentic color DNA and assign semantic PALETTE ROLES:
  * \`background\`: Canvas backdrop color (derived directly from the reference flyer pixels).
  * \`surface\`: Structural card or container fill color.
  * \`ink\`: High-contrast headline and body text color (contrast ratio >= 4.5:1).
  * \`muted\`: Secondary metadata, subtitle, and kicker label color.
  * \`accent\` / \`accent2\`: Vibrant focal punch colors for badges, buttons, and highlights.
- Establish the canvas backdrop immediately using \`add_shape_primitive\` or root \`create_flex_container\`.

### 2. UNDERSTAND TEXT PROPERTIES & TYPOGRAPHY
- Analyze the typographic hierarchy from the reference flyer:
  * Hierarchy: Category Badge / Eyebrow -> Hero Headline -> Subtitle -> Details -> Footer.
  * Text Properties: Font family classifications (editorial serif, geometric modern sans), weight (bold 800/900 for headlines, medium 500 for badges, regular 400 for body), canvas-relative sizing, letter-spacing (tracking on badges), and alignment.
  * Contrast: Ensure text uses the extracted \`ink\` color (>= 4.5:1 contrast against its background).

### 3. DESIGN LAYOUT & STRUCTURAL CONTAINERS
- Map out the spatial composition and layout structure:
  * Keep all foreground content inside the 4% safe frame margins.
  * Build structure: Use \`create_flex_container\` (Flexbox / Auto Layout) for auto-spaced columns, rows, and stacked cards with explicit \`gap\` and \`padding\`.
  * Add backdrop cards and panels with \`add_shape_primitive\`.
  * Group floating elements into flex flows with \`wrap_in_flex_container\`.

### 4. DESIGN ELEMENTS, GRAPHICS & ACCENTS
- Integrate graphic assets and visual accents:
  * Place reference imagery or moodboard photos using \`place_moodboard_image\`.
  * Add vector icons matching the theme using \`add_hugeicon_symbol\`.
  * Add divider lines, badges, framing borders, and pill tags with \`add_shape_primitive\`.
  * Adjust layering, positions, and transforms using \`update_object_transform\` and \`apply_fill_paint\`.

### 5. QUALITY VERIFICATION & AUTO-REPAIR
- Run \`validate_layout\` after completing edits to test boundary containment, zero overlaps, and contrast.
- If issues remain, run \`repair_layout\` to auto-correct violations, then re-validate.
- Run \`verify_canvas_alignment\` to visually confirm alignment and balance.
- When requested, call \`export_artboard_render\` to export the completed design.

## Tool Routing — Goal to Tool

| Goal | Tool |
|---|---|
| Full flyer/poster from copy & extracted palette | \`apply_poster_template({ headline, badge, tagline, credits, release, footer, palette })\` |
| Section, card, structural container | \`create_flex_container({ direction, gap, padding, children })\` |
| One shape / text / icon / image | \`add_shape_primitive\` / \`add_text_element\` / \`add_hugeicon_symbol\` / \`add_image_element\` |
| Move, resize, rotate by id | \`update_object_transform\` |
| Recolor element | \`apply_fill_paint\` |
| Recolor selection set | \`apply_moodboard_palette\` |
| Place moodboard reference or asset | \`place_moodboard_image({ itemId })\` |
| Wrap loose elements into flex flow | \`wrap_in_flex_container({ objectIds, direction })\` |
| Inspect design tokens & guidelines | \`get_design_language\` |
| Validate canvas health & contrast | \`validate_layout\` |
| Auto-repair layout issues | \`repair_layout\` |
| Final alignment verification | \`verify_canvas_alignment\` |
| Export final artwork | \`export_artboard_render\` |

## Hard Rules

1. NO HARDCODED PALETTES. Never default to noir-crimson or fixed presets. Every design's colors must be extracted dynamically from the moodboard reference flyer or user brief.
2. CARRY OUT SEQUENTIALLY. Follow Color -> Text Properties -> Layout -> Elements -> Validate sequence so the user sees real-time progress.
3. WORDS & STRUCTURE, NOT RAW PIXELS. Supply semantic copy and use \`create_flex_container\` to let the layout engine calculate geometry mathematically.
4. TRUST RETURNED GEOMETRY. Every creation tool returns the element's actual bounding box (\`x, y, width, height\`). Always derive subsequent positions from returned boxes, never requested coordinates.
5. CONTRAST & TYPOGRAPHIC DISCIPLINE. Text contrast must be >= 4.5:1. Limit type hierarchy to 3 distinct size tiers (hero headline, supporting subtitle/body, metadata badge).
6. FINISH CLEAN. Never conclude without \`validate_layout\` having run cleanly after your final edit.

## Failure Recovery

- \`{ success: false, error }\` -> read the error, fix the argument (usually a bad id or unmounted canvas), retry once.
- \`"bridge not initialized"\` -> the editor canvas is not mounted yet; wait and retry.
- Empty scene reads (\`count: 0\`) -> the canvas is blank; proceed immediately to CREATE, do not loop inspections.
- Repair leaves \`remaining\` issues -> adjust elements directly (\`update_object_transform\` / recolor), then \`validate_layout\` again.
`
