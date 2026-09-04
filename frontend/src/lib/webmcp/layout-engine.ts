/**
 * WebMCP Spatial Layout Engine
 *
 * Implements context-aware placement, AABB (Axis-Aligned Bounding Box)
 * collision avoidance, container/background detection, relative anchoring,
 * and modular role-based typography scaling for in-browser AI design agents.
 */

import type { SceneObject } from '../auxweave-scene'

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

export type TypographicRole = 'headline' | 'subtitle' | 'body' | 'badge' | 'caption'

export const ROLE_TYPOGRAPHIC_SCALE: Record<
  TypographicRole,
  { ratio: number; minSize: number; weight: 'bold' | 'normal' }
> = {
  headline: { ratio: 0.058, minSize: 52, weight: 'bold' },
  subtitle: { ratio: 0.032, minSize: 32, weight: 'bold' },
  body: { ratio: 0.019, minSize: 20, weight: 'normal' },
  badge: { ratio: 0.015, minSize: 16, weight: 'bold' },
  caption: { ratio: 0.011, minSize: 14, weight: 'normal' },
}

/**
 * Calculates a proportional font size based on canvas dimensions and typographic role.
 */
export function computeRoleFontSize(
  role: TypographicRole | undefined,
  artboardW: number,
  artboardH: number,
  overrideFontSize?: number,
): { fontSize: number; weight: 'bold' | 'normal' } {
  const minDim = Math.min(artboardW, artboardH)
  const config = (role && ROLE_TYPOGRAPHIC_SCALE[role]) || ROLE_TYPOGRAPHIC_SCALE.headline
  const calculatedSize = Math.round(Math.max(config.minSize, minDim * config.ratio))
  return {
    fontSize: overrideFontSize ?? calculatedSize,
    weight: config.weight,
  }
}

/**
 * Checks if two Axis-Aligned Bounding Boxes collide, taking an optional padding into account.
 */
export function checkAABBCollision(a: Box, b: Box, padding = 16): boolean {
  return (
    a.x - padding < b.x + b.width &&
    a.x + a.width + padding > b.x &&
    a.y - padding < b.y + b.height &&
    a.y + a.height + padding > b.y
  )
}

/**
 * Checks if box A is substantially enclosed inside box B (meaning B acts as a container/card for A).
 */
export function isContainedWithin(candidate: Box, container: Box): boolean {
  return (
    candidate.x >= container.x - 20 &&
    candidate.y >= container.y - 20 &&
    candidate.x + candidate.width <= container.x + container.width + 20 &&
    candidate.y + candidate.height <= container.y + container.height + 20
  )
}

/**
 * Identifies if a scene object is a full-artboard backdrop or container card.
 * Foreground elements are intended to sit ON TOP of containers rather than be pushed below them.
 *
 * Both large rectangles AND covering groups (e.g. flex-container groups that
 * span the artboard) count as containers. A fill-sized group treated as
 * foreground would swallow every later placement, collapsing the layout.
 *
 * Accepts any structural { type, width, height } so flattened validation
 * entries (which are not full SceneObjects) can be tested too.
 */
export function isContainerOrBackdrop(
  obj: { type: string; x: number; y: number; width: number; height: number },
  artboardW: number,
  artboardH: number,
  candidate?: Box,
): boolean {
  const covers = obj.width >= artboardW * 0.65 && obj.height >= artboardH * 0.65
  // Groups are layout-owned: a covering group is always a container, and a
  // small group is always an atomic foreground unit (never expanded here).
  if (obj.type === 'group') {
    if (covers) return true
    if (
      candidate &&
      isContainedWithin(candidate, obj) &&
      (obj.width > candidate.width * 1.3 || obj.height > candidate.height * 1.3)
    ) {
      return true
    }
    return false
  }

  // Only geometric rectangles, cards, or frames can act as containers/backdrops.
  // Text, icons, images, and lines are always foreground elements.
  if (obj.type !== 'rect') {
    return false
  }

  // Covers >65% of artboard in both dimensions
  if (covers) {
    return true
  }
  // Candidate is completely placed inside this object
  if (
    candidate &&
    isContainedWithin(candidate, obj) &&
    (obj.width > candidate.width * 1.3 || obj.height > candidate.height * 1.3)
  ) {
    return true
  }
  return false
}

/**
 * Flatten a scene into absolute-coordinate entries for collision,
 * validation, and anchoring.
 *
 * Container-sized groups are EXPANDED (children reported at absolute
 * positions = group origin + local offset) and dropped as obstacles;
 * small groups stay atomic. Nested groups accumulate offsets recursively.
 * Flat scenes pass through unchanged (identity for existing callers).
 */
export function flattenSpatialObjects(
  objects: SceneObject[],
  artboardW: number,
  artboardH: number,
  originX = 0,
  originY = 0,
): ValidatableObject[] {
  const out: ValidatableObject[] = []
  for (const obj of objects) {
    if (obj.type === 'group' && isContainerOrBackdrop(obj, artboardW, artboardH)) {
      flattenSpatialObjects(obj.children, artboardW, artboardH, originX + obj.x, originY + obj.y)
        .forEach(entry => out.push(entry))
      continue
    }
    const entry = toValidatable(obj)
    entry.x += originX
    entry.y += originY
    out.push(entry)
  }
  return out
}

/** Find any object by id, recursing into groups (offsets ignored). */
export function findSpatialObjectById(objects: SceneObject[], id: string): SceneObject | null {
  for (const obj of objects) {
    if (obj.id === id) return obj
    if (obj.type === 'group') {
      const nested = findSpatialObjectById(obj.children, id)
      if (nested) return nested
    }
  }
  return null
}

/**
 * Resolves a collision-free Y coordinate by inspecting existing objects on the canvas
 * and pushing below the lowest colliding foreground element with a clean design gap.
 */
export function resolveCollisionFreeY(
  candidate: Box,
  existingObjects: SceneObject[],
  artboardW: number,
  artboardH: number,
  gap?: number,
): number {
  const defaultGap = gap ?? Math.round(Math.max(24, Math.min(artboardW, artboardH) * 0.02))
  let currentY = candidate.y
  let hasCollision = true
  let attempts = 0
  const maxAttempts = 20

  // Filter out background cards/containers. Flattened to absolute coords so
  // children of container groups (e.g. flex layouts) are real obstacles while
  // the container itself never swallows placements.
  const foregroundObjects = flattenSpatialObjects(existingObjects, artboardW, artboardH).filter(
    obj => !isContainerOrBackdrop(obj, artboardW, artboardH, candidate),
  )

  while (hasCollision && attempts < maxAttempts) {
    hasCollision = false
    const testBox: Box = { ...candidate, y: currentY }

    for (const obj of foregroundObjects) {
      if (checkAABBCollision(testBox, obj, defaultGap)) {
        hasCollision = true
        currentY = Math.round(obj.y + obj.height + defaultGap)
        break
      }
    }
    attempts++
  }

  // Safety clamp: keep within artboard bounds if possible
  const maxAllowedY = artboardH - candidate.height - defaultGap
  if (currentY > maxAllowedY && maxAllowedY > defaultGap) {
    return currentY
  }

  return currentY
}

/**
 * Resolves coordinates when an element is positioned relative to another element
 * (e.g. relativeTo: 'previous' with position: 'below').
 */
export function resolveAnchorPlacement(
  relativeTo: 'previous' | string,
  candidate: { width: number; height: number },
  existingObjects: SceneObject[],
  artboardW: number,
  artboardH: number,
  opts?: {
    position?: 'below' | 'above' | 'inside'
    gap?: number
    align?: 'center' | 'left' | 'right'
  },
): { x: number; y: number } | null {
  if (existingObjects.length === 0) return null

  // Absolute-coordinate view: container groups expand to their children so
  // anchoring sees real foreground (flex children included).
  const flat = flattenSpatialObjects(existingObjects, artboardW, artboardH)

  let targetBox: Box | undefined

  if (relativeTo === 'previous') {
    // Find the last foreground object
    for (let i = flat.length - 1; i >= 0; i--) {
      const candidateObj = flat[i]!
      if (!isContainerOrBackdrop(candidateObj, artboardW, artboardH)) {
        targetBox = candidateObj
        break
      }
    }
    // Fallback to absolute last object if all are containers
    if (!targetBox) {
      const last = flat[flat.length - 1]
      if (last) targetBox = last
    }
  } else {
    const direct = existingObjects.find(o => o.id === relativeTo)
    if (direct) {
      targetBox = { x: direct.x, y: direct.y, width: direct.width, height: direct.height }
    } else {
      targetBox = flat.find(o => o.id === relativeTo)
    }
  }

  const target = targetBox
  if (!target) return null

  const gap = opts?.gap ?? Math.round(Math.max(20, Math.min(artboardW, artboardH) * 0.02))
  const position = opts?.position ?? 'below'
  const align = opts?.align ?? 'center'

  let x = Math.round(artboardW / 2 - candidate.width / 2)
  if (align === 'left') {
    x = target.x
  } else if (align === 'right') {
    x = target.x + target.width - candidate.width
  } else {
    x = Math.round(target.x + target.width / 2 - candidate.width / 2)
  }

  let y = target.y
  if (position === 'below') {
    y = Math.round(target.y + target.height + gap)
  } else if (position === 'above') {
    y = Math.round(target.y - candidate.height - gap)
  } else if (position === 'inside') {
    y = Math.round(target.y + target.height / 2 - candidate.height / 2)
  }

  const margin = Math.round(Math.min(artboardW, artboardH) * 0.04)
  if (x + candidate.width > artboardW - margin) {
    x = Math.max(margin, artboardW - candidate.width - margin)
  }
  if (x < margin) x = margin
  if (y + candidate.height > artboardH - margin) {
    y = Math.max(margin, artboardH - candidate.height - margin)
  }
  if (y < margin) y = margin

  return { x, y }
}

/**
 * Clamps coordinates and dimensions of an element so it NEVER extends past
 * the artboard boundaries or safe working margins.
 */
export function clampToArtboardBounds(
  box: Box,
  artboardW: number,
  artboardH: number,
  isFullBleed = false,
): Box {
  if (isFullBleed) {
    return { x: 0, y: 0, width: artboardW, height: artboardH }
  }

  // Ensure dimensions do not exceed artboard itself
  const width = Math.min(box.width, artboardW)
  const height = Math.min(box.height, artboardH)

  let x = box.x
  let y = box.y

  // Prevent extending off the right edge: shift left so entire element stays visible
  if (x + width > artboardW) {
    x = Math.max(0, artboardW - width)
  }
  if (x < 0 && box.width <= artboardW) {
    x = 0
  }

  // Prevent extending off the bottom edge: shift up so entire element stays visible
  if (y + height > artboardH) {
    y = Math.max(0, artboardH - height)
  }
  if (y < 0 && box.height <= artboardH) {
    y = 0
  }

  return { x, y, width, height }
}

// ===========================================================================
// Deterministic geometry primitives
// ---------------------------------------------------------------------------
// All helpers below are pure, rounding to whole pixels and free of randomness,
// clocks, or DOM access so agent-driven layouts are reproducible and testable.
// ===========================================================================

/** Base grid unit (px at 1080p reference). All derived spacing snaps to this. */
export const GRID_UNIT = 8

/** Snap a value to the nearest multiple of `step` (default GRID_UNIT). */
export function snapToGrid(value: number, step = GRID_UNIT): number {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) return 0
  return Math.round(value / step) * step
}

/** Round every field of a box to whole pixels. */
export function roundBox(box: Box): Box {
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  }
}

/**
 * Normalize a possibly-degenerate box: finite numbers, non-negative origin,
 * minimum 1px dimensions. Never throws.
 */
export function normalizeBox(box: Box, minSize = 1): Box {
  const safe = (v: number, fallback: number) => (Number.isFinite(v) ? v : fallback)
  return {
    x: Math.max(0, Math.round(safe(box.x, 0))),
    y: Math.max(0, Math.round(safe(box.y, 0))),
    width: Math.max(minSize, Math.round(safe(box.width, minSize))),
    height: Math.max(minSize, Math.round(safe(box.height, minSize))),
  }
}

/** Center point of a box. */
export function boxCenter(box: Box): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Smallest box enclosing every input box. Empty input yields a zero box. */
export function unionBoxes(boxes: Box[]): Box {
  if (boxes.length === 0) return { x: 0, y: 0, width: 0, height: 0 }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const b of boxes) {
    minX = Math.min(minX, b.x)
    minY = Math.min(minY, b.y)
    maxX = Math.max(maxX, b.x + b.width)
    maxY = Math.max(maxY, b.y + b.height)
  }
  return roundBox({ x: minX, y: minY, width: maxX - minX, height: maxY - minY })
}

/** Area (px²) of the intersection of two boxes; 0 when disjoint. */
export function intersectionArea(a: Box, b: Box): number {
  const xOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)
  const yOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
  if (xOverlap <= 0 || yOverlap <= 0) return 0
  return xOverlap * yOverlap
}

/**
 * Overlap of `a` relative to the smaller box (0..1). Deterministic and
 * scale-invariant, unlike raw pixel thresholds.
 */
export function overlapRatio(a: Box, b: Box): number {
  const smaller = Math.min(a.width * a.height, b.width * b.height)
  if (smaller <= 0) return 0
  return intersectionArea(a, b) / smaller
}

/** Spacing ramp derived from canvas size; every step snaps to the grid. */
export function spacingRamp(minDim: number): {
  xs: number
  sm: number
  md: number
  lg: number
  xl: number
} {
  const base = Math.max(GRID_UNIT, Math.round(minDim * 0.02))
  const snap = (v: number) => Math.max(GRID_UNIT, snapToGrid(v))
  return {
    xs: snap(base * 0.5),
    sm: snap(base),
    md: snap(base * 2),
    lg: snap(base * 4),
    xl: snap(base * 8),
  }
}

/**
 * Inset safe frame of the artboard. `marginRatio` is a fraction of the
 * smaller dimension (default 4%).
 */
export function safeFrame(artboardW: number, artboardH: number, marginRatio = 0.04): Box {
  const margin = Math.round(Math.min(artboardW, artboardH) * marginRatio)
  return {
    x: margin,
    y: margin,
    width: Math.max(1, artboardW - margin * 2),
    height: Math.max(1, artboardH - margin * 2),
  }
}

// ===========================================================================
// Semantic regions — named canvas zones agents can target without raw coords
// ===========================================================================

export type SemanticRegion =
  | 'full'
  | 'safe'
  | 'header'
  | 'hero'
  | 'body'
  | 'footer'
  | 'left'
  | 'center'
  | 'right'
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export const SEMANTIC_REGIONS: SemanticRegion[] = [
  'full',
  'safe',
  'header',
  'hero',
  'body',
  'footer',
  'left',
  'center',
  'right',
  'top-left',
  'top-center',
  'top-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

/**
 * Resolve a semantic region to a concrete pixel box.
 * Vertical thirds (header/hero/body/footer) follow poster anatomy:
 * header 0–12%, hero 12–46%, body 46–82%, footer 82–100%.
 * All boxes are inset by the safe margin except `full`.
 */
export function regionBox(
  region: SemanticRegion,
  artboardW: number,
  artboardH: number,
  marginRatio = 0.04,
): Box {
  const margin = Math.round(Math.min(artboardW, artboardH) * marginRatio)
  const inner = {
    x: margin,
    y: margin,
    width: Math.max(1, artboardW - margin * 2),
    height: Math.max(1, artboardH - margin * 2),
  }
  // Shared integer edges so vertical zones partition without gaps or overlaps
  // (independent per-zone rounding would drift by a pixel).
  const ex = (f: number) => inner.x + Math.round(inner.width * f)
  const ey = (f: number) => inner.y + Math.round(inner.height * f)
  const y0 = inner.y
  const y1 = ey(0.12)
  const y2 = ey(0.46)
  const y3 = ey(0.82)
  const y4 = inner.y + inner.height
  const x0 = inner.x
  const x1 = ex(0.33)
  const x2 = ex(0.67)
  const x3 = inner.x + inner.width
  const cx1 = ex(0.2)
  const cx2 = ex(0.8)
  const zone = (x: number, y: number, right: number, bottom: number): Box => ({
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  })
  switch (region) {
    case 'full':
      return { x: 0, y: 0, width: artboardW, height: artboardH }
    case 'safe':
      return { ...inner }
    case 'header':
      return zone(x0, y0, x3, y1)
    case 'hero':
      return zone(x0, y1, x3, y2)
    case 'body':
      return zone(x0, y2, x3, y3)
    case 'footer':
      return zone(x0, y3, x3, y4)
    case 'left':
      return zone(x0, y0, x1, y4)
    case 'center':
      return zone(cx1, y0, cx2, y4)
    case 'right':
      return zone(x2, y0, x3, y4)
    case 'top-left':
      return zone(x0, y0, x1, ey(0.33))
    case 'top-center':
      return zone(x1, y0, x2, ey(0.33))
    case 'top-right':
      return zone(x2, y0, x3, ey(0.33))
    case 'bottom-left':
      return zone(x0, ey(0.67), x1, y4)
    case 'bottom-center':
      return zone(x1, ey(0.67), x2, y4)
    case 'bottom-right':
      return zone(x2, ey(0.67), x3, y4)
  }
}

// ===========================================================================
// Semantic composition operators (pure box layout, deterministic)
// ===========================================================================

export type StackDirection = 'vertical' | 'horizontal'
export type AlignMode = 'start' | 'center' | 'end'

/**
 * Stack boxes along an axis with a fixed gap, cross-aligned within the
 * widest/tallest item. Returns new boxes in the same order.
 */
export function stackLayout(
  boxes: Box[],
  opts: {
    direction?: StackDirection
    gap?: number
    align?: AlignMode
    startX?: number
    startY?: number
  },
): Box[] {
  if (boxes.length === 0) return []
  const direction = opts.direction ?? 'vertical'
  const gap = Math.max(0, Math.round(opts.gap ?? GRID_UNIT * 3))
  const align = opts.align ?? 'center'
  const cross =
    direction === 'vertical'
      ? Math.max(...boxes.map(b => b.width))
      : Math.max(...boxes.map(b => b.height))
  let cursorX = opts.startX ?? boxes[0]!.x
  let cursorY = opts.startY ?? boxes[0]!.y
  return boxes.map(b => {
    const crossOffset =
      align === 'center'
        ? Math.round((cross - (direction === 'vertical' ? b.width : b.height)) / 2)
        : align === 'end'
          ? cross - (direction === 'vertical' ? b.width : b.height)
          : 0
    const placed =
      direction === 'vertical'
        ? { ...b, x: Math.round(cursorX + crossOffset), y: Math.round(cursorY) }
        : { ...b, x: Math.round(cursorX), y: Math.round(cursorY + crossOffset) }
    if (direction === 'vertical') cursorY += b.height + gap
    else cursorX += b.width + gap
    return placed
  })
}

/**
 * Evenly distribute boxes between the first and last edge along an axis.
 * Endpoints stay pinned; interior boxes are spaced uniformly. Returns new
 * boxes in the same order.
 */
export function distributeLayout(
  boxes: Box[],
  opts: { direction?: StackDirection; container?: Box },
): Box[] {
  if (boxes.length <= 2) return boxes.map(b => ({ ...b }))
  const direction = opts.direction ?? 'horizontal'
  const sorted = boxes
    .map((b, i) => ({ b: { ...b }, i }))
    .sort((p, q) =>
      direction === 'horizontal' ? p.b.x - q.b.x || p.b.y - q.b.y : p.b.y - q.b.y || p.b.x - q.b.x,
    )
  const spanOf = (b: Box) => (direction === 'horizontal' ? b.width : b.height)
  const startOf = (b: Box) => (direction === 'horizontal' ? b.x : b.y)
  const first = sorted[0]!.b
  const last = sorted[sorted.length - 1]!.b
  const lo = opts.container
    ? direction === 'horizontal'
      ? opts.container.x
      : opts.container.y
    : startOf(first)
  const hiEdge = opts.container
    ? direction === 'horizontal'
      ? opts.container.x + opts.container.width
      : opts.container.y + opts.container.height
    : startOf(last) + spanOf(last)
  const totalSize = sorted.reduce((sum, s) => sum + spanOf(s.b), 0)
  const gapCount = sorted.length - 1
  const gap = Math.max(0, Math.round((hiEdge - lo - totalSize) / gapCount))
  let cursor = Math.round(lo)
  const placed = sorted.map(s => {
    const next = { ...s.b }
    if (direction === 'horizontal') next.x = cursor
    else next.y = cursor
    cursor += spanOf(s.b) + gap
    return { ...next, i: s.i }
  })
  return placed.sort((a, b) => a.i - b.i).map(({ i: _i, ...rest }) => rest)
}

export type EdgeAlign = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

/**
 * Align boxes to a shared edge. Targets default to the union of the boxes;
 * pass an explicit `relativeTo` box (e.g. the artboard) to align to it.
 */
export function alignLayout(boxes: Box[], mode: EdgeAlign, relativeTo?: Box): Box[] {
  if (boxes.length === 0) return []
  const ref = relativeTo ?? unionBoxes(boxes)
  return boxes.map(b => {
    const next = { ...b }
    switch (mode) {
      case 'left':
        next.x = ref.x
        break
      case 'right':
        next.x = Math.round(ref.x + ref.width - b.width)
        break
      case 'center':
        next.x = Math.round(ref.x + ref.width / 2 - b.width / 2)
        break
      case 'top':
        next.y = ref.y
        break
      case 'bottom':
        next.y = Math.round(ref.y + ref.height - b.height)
        break
      case 'middle':
        next.y = Math.round(ref.y + ref.height / 2 - b.height / 2)
        break
    }
    return next
  })
}

/** Dock a box against a container edge with an optional gap. */
export function dockLayout(
  box: Box,
  edge: 'top' | 'bottom' | 'left' | 'right' | 'center',
  container: Box,
  gap = GRID_UNIT * 2,
): Box {
  const g = Math.max(0, Math.round(gap))
  const next = { ...box }
  switch (edge) {
    case 'top':
      next.y = container.y + g
      break
    case 'bottom':
      next.y = Math.round(container.y + container.height - box.height - g)
      break
    case 'left':
      next.x = container.x + g
      break
    case 'right':
      next.x = Math.round(container.x + container.width - box.width - g)
      break
    case 'center':
      next.x = Math.round(container.x + container.width / 2 - box.width / 2)
      next.y = Math.round(container.y + container.height / 2 - box.height / 2)
      break
  }
  return next
}

/**
 * Split a container into a deterministic rows×cols cell grid with uniform
 * gaps. Cells are row-major order. Edges are computed cumulatively so the
 * last row/column absorbs rounding remainder and never spills outside.
 */
export function gridLayout(container: Box, rows: number, cols: number, gap = GRID_UNIT * 2): Box[] {
  const r = Math.max(1, Math.floor(rows))
  const c = Math.max(1, Math.floor(cols))
  const g = Math.max(0, Math.round(gap))
  const colStep = (container.width - g * (c - 1)) / c
  const rowStep = (container.height - g * (r - 1)) / r
  const colEdge = (i: number) =>
    i >= c ? container.x + container.width : Math.round(container.x + i * (colStep + g))
  const rowEdge = (i: number) =>
    i >= r ? container.y + container.height : Math.round(container.y + i * (rowStep + g))
  const cells: Box[] = []
  for (let row = 0; row < r; row++) {
    for (let col = 0; col < c; col++) {
      const x = colEdge(col)
      const y = rowEdge(row)
      const right = col === c - 1 ? container.x + container.width : colEdge(col + 1) - g
      const bottom = row === r - 1 ? container.y + container.height : rowEdge(row + 1) - g
      cells.push({ x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) })
    }
  }
  return cells
}

// ===========================================================================
// Constraint validation — deterministic layout Lint
// ===========================================================================

export type LayoutIssueCode =
  | 'out-of-bounds'
  | 'safe-margin'
  | 'foreground-overlap'
  | 'tiny-text'
  | 'type-chaos'
  | 'low-contrast'

export type LayoutIssue = {
  code: LayoutIssueCode
  severity: 'error' | 'warning'
  /** Human-readable finding. */
  message: string
  /** Deterministic fix hint for agents. */
  hint: string
  objectId?: string
}

export type ValidateLayoutOptions = {
  /** Solid CSS color of the artboard backdrop (for contrast checks). */
  artboardBg?: string
  /** Fraction of min dimension treated as safe margin (default 0.04). */
  marginRatio?: number
  /** Overlap ratio of the smaller box that counts as collision (default 0.05). */
  overlapThreshold?: number
  /** Minimum WCAG contrast for text (default 4.5). */
  minContrast?: number
  /** Max distinct font sizes before type-chaos (default 6). */
  maxFontSizes?: number
}

type ValidatableObject = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  visible?: boolean
  fontSize?: number
  /** Solid CSS fill color, when known. */
  fillColor?: string
}

function toValidatable(obj: SceneObject): ValidatableObject {
  const base: ValidatableObject = {
    id: obj.id,
    type: obj.type,
    x: obj.x,
    y: obj.y,
    width: obj.width,
    height: obj.height,
    visible: obj.visible !== false,
  }
  if (obj.type === 'text') {
    base.fontSize = obj.fontSize
    const fill = (obj as { fill?: unknown }).fill as { type?: string; color?: string } | undefined
    if (fill?.type === 'solid' && typeof fill.color === 'string') base.fillColor = fill.color
  }
  return base
}

/** Extract a solid CSS color from any fill-like value; null when unknown. */
export function solidFillColor(fill: unknown): string | null {
  if (typeof fill === 'string') return fill
  if (fill && typeof fill === 'object') {
    const f = fill as { type?: string; color?: string }
    if (f.type === 'solid' && typeof f.color === 'string') return f.color
  }
  return null
}

const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  transparent: '#000000',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
}

/** Parse a CSS color to [r,g,b] 0..255. Supports #rgb/#rrggbb/#rrggbbaa + names. */
export function parseCssColor(color: string): [number, number, number] | null {
  const s = color.trim().toLowerCase()
  const hexMatch = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s)
  if (hexMatch) {
    let hex = hexMatch[1]!
    if (hex.length === 3)
      hex = hex
        .split('')
        .map(ch => ch + ch)
        .join('')
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ]
  }
  const rgbMatch = /^rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/.exec(s)
  if (rgbMatch) {
    return [
      Math.min(255, Math.max(0, Math.round(Number(rgbMatch[1])))),
      Math.min(255, Math.max(0, Math.round(Number(rgbMatch[2])))),
      Math.min(255, Math.max(0, Math.round(Number(rgbMatch[3])))),
    ]
  }
  if (NAMED_COLORS[s]) return parseCssColor(NAMED_COLORS[s]!)
  return null
}

function linearChannel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** WCAG relative luminance (0..1). */
export function relativeLuminance(color: string): number | null {
  const rgb = parseCssColor(color)
  if (!rgb) return null
  return (
    0.2126 * linearChannel(rgb[0]) + 0.7152 * linearChannel(rgb[1]) + 0.0722 * linearChannel(rgb[2])
  )
}

/** WCAG contrast ratio (1..21). Null when either color is unparseable. */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = relativeLuminance(foreground)
  const bg = relativeLuminance(background)
  if (fg === null || bg === null) return null
  const [lighter, darker] = fg >= bg ? [fg, bg] : [bg, fg]
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Lint a scene for layout constraint violations. Pure and deterministic:
 * same input always yields the same issues in the same order.
 */
export function validateLayout(
  objects: SceneObject[],
  artboardW: number,
  artboardH: number,
  opts: ValidateLayoutOptions = {},
): LayoutIssue[] {
  const issues: LayoutIssue[] = []
  const marginRatio = opts.marginRatio ?? 0.04
  const overlapThreshold = opts.overlapThreshold ?? 0.05
  const minContrast = opts.minContrast ?? 4.5
  const maxFontSizes = opts.maxFontSizes ?? 6
  const margin = Math.round(Math.min(artboardW, artboardH) * marginRatio)
  // Absolute-coordinate view: container groups expand so flex children are
  // linted where they actually render (and containers never collide).
  const items = flattenSpatialObjects(objects, artboardW, artboardH).filter(o => o.visible !== false)

  const isBackdrop = (o: ValidatableObject) =>
    o.type === 'rect' && o.width >= artboardW * 0.9 && o.height >= artboardH * 0.9

  // 1. Bounds + safe margins
  for (const o of items) {
    const overflowRight = o.x + o.width - artboardW
    const overflowBottom = o.y + o.height - artboardH
    if (o.x < -1 || o.y < -1 || overflowRight > 1 || overflowBottom > 1) {
      issues.push({
        code: 'out-of-bounds',
        severity: 'error',
        objectId: o.id,
        message: `${o.id} (${o.type}) extends past the artboard edge`,
        hint: `Move/resize ${o.id} inside 0..${artboardW} x 0..${artboardH} via update_object_transform.`,
      })
      continue
    }
    if (!isBackdrop(o)) {
      const violations: string[] = []
      if (o.x < margin) violations.push(`left x=${Math.round(o.x)}`)
      if (o.y < margin) violations.push(`top y=${Math.round(o.y)}`)
      if (o.x + o.width > artboardW - margin)
        violations.push(`right x+w=${Math.round(o.x + o.width)}`)
      if (o.y + o.height > artboardH - margin)
        violations.push(`bottom y+h=${Math.round(o.y + o.height)}`)
      if (violations.length > 0) {
        issues.push({
          code: 'safe-margin',
          severity: 'warning',
          objectId: o.id,
          message: `${o.id} (${o.type}) touches the safe margin: ${violations.join(', ')}`,
          hint: `Nudge ${o.id} at least ${margin}px inside the artboard edges.`,
        })
      }
    }
  }

  // 2. Foreground overlaps (pairwise, document order). An element fully
  // contained in a much larger card/container is composition, not collision.
  const foreground = items.filter(o => !isBackdrop(o))
  for (let i = 0; i < foreground.length; i++) {
    for (let j = i + 1; j < foreground.length; j++) {
      const a = foreground[i]!
      const b = foreground[j]!
      if (
        isContainerOrBackdrop(a, artboardW, artboardH, b) ||
        isContainerOrBackdrop(b, artboardW, artboardH, a)
      ) {
        continue
      }
      const ratio = overlapRatio(a, b)
      if (ratio > overlapThreshold) {
        issues.push({
          code: 'foreground-overlap',
          severity: 'warning',
          objectId: b.id,
          message: `${b.id} (${b.type}) overlaps ${a.id} (${a.type}) by ${Math.round(ratio * 100)}%`,
          hint: `Move ${b.id} below ${a.id} or shrink it to remove the collision.`,
        })
      }
    }
  }

  // 3. Typography: tiny text + too many distinct sizes
  const minReadable = Math.max(12, Math.round(Math.min(artboardW, artboardH) * 0.012))
  const sizes = new Set<number>()
  for (const o of items) {
    if (o.type !== 'text' || typeof o.fontSize !== 'number') continue
    sizes.add(Math.round(o.fontSize))
    if (o.fontSize < minReadable) {
      issues.push({
        code: 'tiny-text',
        severity: 'warning',
        objectId: o.id,
        message: `${o.id} text is ${Math.round(o.fontSize)}px, below the ${minReadable}px readability floor`,
        hint: `Raise ${o.id} fontSize to at least ${minReadable}px.`,
      })
    }
  }
  if (sizes.size > maxFontSizes) {
    issues.push({
      code: 'type-chaos',
      severity: 'warning',
      message: `${sizes.size} distinct font sizes used (max ${maxFontSizes}) — hierarchy is unclear`,
      hint: 'Consolidate text into headline/subtitle/body/caption roles from the design language.',
    })
  }

  // 4. Contrast: text fill vs effective backdrop
  const bgColor = opts.artboardBg ? solidFillColor(opts.artboardBg) : null
  if (bgColor && parseCssColor(bgColor)) {
    const backdrops = items.filter(isBackdrop)
    for (const o of items) {
      if (o.type !== 'text' || !o.fillColor || !parseCssColor(o.fillColor)) continue
      const center = boxCenter(o)
      const covering = backdrops.filter(
        b =>
          center.x >= b.x &&
          center.x <= b.x + b.width &&
          center.y >= b.y &&
          center.y <= b.y + b.height,
      )
      // Effective backdrop = topmost covering rect's solid fill, else artboard bg.
      let effectiveBg = bgColor
      for (const b of covering) {
        const sceneObj = findSpatialObjectById(objects, b.id)
        const fill = solidFillColor((sceneObj as { fill?: unknown } | undefined)?.fill)
        if (fill && parseCssColor(fill)) effectiveBg = fill
      }
      const ratio = contrastRatio(o.fillColor, effectiveBg)
      if (ratio !== null && ratio < minContrast) {
        issues.push({
          code: 'low-contrast',
          severity: 'warning',
          objectId: o.id,
          message: `${o.id} text contrast is ${ratio.toFixed(2)}:1 (needs ${minContrast}:1)`,
          hint: `Recolor ${o.id} or its backdrop using a design-language ink/accent pair.`,
        })
      }
    }
  }

  return issues
}

// ===========================================================================
// Automatic layout repair — deterministic, bounded, non-destructive
// ---------------------------------------------------------------------------
// Applies the smallest change that clears each violation: clamp, push-down,
// margin nudge, readability bump. Backdrops are only ever clamped, never
// moved for collisions. Nothing is deleted. Returns patched clones.
// ===========================================================================

export type RepairKind = 'clamp' | 'move' | 'resize' | 'restyle'

export type RepairAction = {
  objectId: string
  kind: RepairKind
  reason: string
  before: Record<string, number | string>
  after: Record<string, number | string>
}

export type RepairResult = {
  objects: SceneObject[]
  fixes: RepairAction[]
  remaining: LayoutIssue[]
}

export type RepairOptions = ValidateLayoutOptions & {
  /** Bump tiny text up to the readability floor (default true). */
  fixTinyText?: boolean
}

function patchBox<T extends SceneObject>(obj: T, box: Box): T {
  return { ...obj, x: box.x, y: box.y, width: box.width, height: box.height }
}

/**
 * Repair a scene in place-order: clamp → de-collide → margin-nudge →
 * readability. Deterministic: same input, same fixes, same order.
 */
export function repairLayout(
  objects: SceneObject[],
  artboardW: number,
  artboardH: number,
  opts: RepairOptions = {},
): RepairResult {
  const fixes: RepairAction[] = []
  const marginRatio = opts.marginRatio ?? 0.04
  const margin = Math.round(Math.min(artboardW, artboardH) * marginRatio)
  const overlapThreshold = opts.overlapThreshold ?? 0.05
  const fixTinyText = opts.fixTinyText ?? true
  const minReadable = Math.max(12, Math.round(Math.min(artboardW, artboardH) * 0.012))

  let working: SceneObject[] = objects.map(o => ({ ...o }))
  const byId = new Map(working.map(o => [o.id, o] as const))

  const recordBoxFix = (id: string, kind: RepairKind, reason: string, before: Box, after: Box) => {
    const changed: Record<string, number> = {}
    const afterRec: Record<string, number> = {}
    for (const k of ['x', 'y', 'width', 'height'] as const) {
      if (before[k] !== after[k]) {
        changed[k] = before[k]
        afterRec[k] = after[k]
      }
    }
    if (Object.keys(changed).length === 0) return
    const obj = byId.get(id)
    if (obj) byId.set(id, patchBox(obj, after))
    fixes.push({ objectId: id, kind, reason, before: changed, after: afterRec })
  }

  const isBackdrop = (o: SceneObject) =>
    o.type === 'rect' && o.width >= artboardW * 0.9 && o.height >= artboardH * 0.9
  // Covering groups (flex containers) are layout-owned: never moved for
  // collisions or margins, only clamped as units.
  const isContainer = (o: SceneObject) =>
    isBackdrop(o) || isContainerOrBackdrop(o, artboardW, artboardH)

  // Pass 1 — clamp everything into bounds.
  for (const o of working) {
    const before: Box = { x: o.x, y: o.y, width: o.width, height: o.height }
    const after = clampToArtboardBounds(before, artboardW, artboardH, isBackdrop(o))
    recordBoxFix(o.id, 'clamp', 'keep inside artboard bounds', before, after)
  }
  working = working.map(o => byId.get(o.id)!)

  // Pass 2 — de-collide top-level foreground in document order (later items
  // move down). Children of container groups act as FIXED obstacles at
  // absolute coords; only top-level objects move, so solver-placed flex
  // children are never torn apart by repair.
  const placed: Box[] = []
  for (const o of working) {
    if (o.type === 'group' && isContainerOrBackdrop(o, artboardW, artboardH)) {
      for (const entry of flattenSpatialObjects([o], artboardW, artboardH)) {
        if (!isContainerOrBackdrop(entry, artboardW, artboardH)) placed.push(entry)
      }
    }
  }
  for (const o of working) {
    const current = byId.get(o.id)!
    const box: Box = { x: current.x, y: current.y, width: current.width, height: current.height }
    if (!isContainer(current)) {
      let candidate = { ...box }
      for (let attempt = 0; attempt < 20; attempt++) {
        const hit = placed.find(p => overlapRatio(candidate, p) > overlapThreshold)
        if (!hit) break
        candidate = {
          ...candidate,
          y: Math.round(hit.y + hit.height + Math.max(GRID_UNIT, Math.round(margin / 2))),
        }
      }
      candidate = clampToArtboardBounds(candidate, artboardW, artboardH, false)
      if (candidate.x !== box.x || candidate.y !== box.y) {
        recordBoxFix(o.id, 'move', 'clear foreground collision', box, candidate)
      }
      placed.push({ ...candidate, width: box.width, height: box.height })
    }
  }
  working = working.map(o => byId.get(o.id)!)

  // Pass 3 — nudge top-level foreground boxes into the safe frame.
  const frame = safeFrame(artboardW, artboardH, marginRatio)
  for (const o of working) {
    if (isContainer(byId.get(o.id)!)) continue
    const current = byId.get(o.id)!
    const box: Box = { x: current.x, y: current.y, width: current.width, height: current.height }
    const nudged = { ...box }
    if (nudged.x < frame.x) nudged.x = frame.x
    if (nudged.y < frame.y) nudged.y = frame.y
    if (nudged.x + nudged.width > frame.x + frame.width) {
      nudged.x = Math.max(frame.x, frame.x + frame.width - nudged.width)
    }
    if (nudged.y + nudged.height > frame.y + frame.height) {
      nudged.y = Math.max(frame.y, frame.y + frame.height - nudged.height)
    }
    recordBoxFix(o.id, 'move', 'respect safe margins', box, roundBox(nudged))
  }
  working = working.map(o => byId.get(o.id)!)

  // Pass 4 — readability floor for tiny text (top-level and nested).
  if (fixTinyText) {
    const bump = (objects: SceneObject[]): { next: SceneObject[]; changed: boolean } => {
      let changed = false
      const next = objects.map(obj => {
        if (obj.type === 'text' && obj.fontSize < minReadable) {
          fixes.push({
            objectId: obj.id,
            kind: 'restyle',
            reason: `raise to ${minReadable}px readability floor`,
            before: { fontSize: Math.round(obj.fontSize) },
            after: { fontSize: minReadable },
          })
          changed = true
          return { ...obj, fontSize: minReadable }
        }
        if (obj.type === 'group') {
          const inner = bump(obj.children)
          if (inner.changed) {
            changed = true
            return { ...obj, children: inner.next }
          }
        }
        return obj
      })
      return { next: changed ? next : objects, changed }
    }
    const bumped = bump(working)
    if (bumped.changed) {
      working = bumped.next
      byId.clear()
      for (const o of working) byId.set(o.id, o)
    }
  }

  const remaining = validateLayout(working, artboardW, artboardH, opts)
  return { objects: working, fixes, remaining }
}
