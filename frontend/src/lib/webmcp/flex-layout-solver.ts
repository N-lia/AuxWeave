/**
 * WebMCP Flex Layout Solver Engine
 *
 * Implements deterministic 1D/2D Flexbox constraint solving (direction, justify,
 * align, gap, padding, hug, fill) for design canvases. Translates high-level
 * semantic component declarations into exact pixel-positioned SceneObjects.
 */

import {
  ROLE_TYPOGRAPHIC_SCALE,
  type TypographicRole,
  computeRoleFontSize,
} from './layout-engine'

export type FlexDirection = 'column' | 'row'
export type FlexJustify =
  | 'start'
  | 'center'
  | 'end'
  | 'space-between'
  | 'space-around'
  | 'space-evenly'
export type FlexAlign = 'start' | 'center' | 'end' | 'stretch'
export type FlexSizing = number | 'fill' | 'hug'

export type FlexPadding =
  | number
  | { top?: number; right?: number; bottom?: number; left?: number }

export interface FlexContainerChildSpec {
  type:
    | 'text'
    | 'headline'
    | 'subtitle'
    | 'body'
    | 'badge'
    | 'caption'
    | 'shape'
    | 'icon'
    | 'image'
    | 'container'
    | 'ref'

  // Text specific
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: 'normal' | 'bold'
  textAlign?: 'left' | 'center' | 'right'

  // Shape specific
  shapeKind?: 'rectangle' | 'circle' | 'polygon' | 'star' | 'line' | 'arrow'
  cornerRadius?: number

  // Icon specific
  iconName?: string
  size?: number

  // Image specific
  url?: string

  // Common styling
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  opacity?: number

  // Sizing & Alignment override
  width?: FlexSizing
  height?: FlexSizing
  alignSelf?: FlexAlign

  // Nested container
  direction?: FlexDirection
  justify?: FlexJustify
  align?: FlexAlign
  gap?: number
  padding?: FlexPadding
  children?: FlexContainerChildSpec[]

  // Ref object
  objectId?: string
}

export interface FlexContainerInput {
  name?: string
  x?: number
  y?: number
  width?: FlexSizing
  height?: FlexSizing
  direction?: FlexDirection
  justify?: FlexJustify
  align?: FlexAlign
  gap?: number
  padding?: FlexPadding
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  cornerRadius?: number
  children?: FlexContainerChildSpec[]
}

export interface SolvedChildBox {
  spec: FlexContainerChildSpec
  x: number
  y: number
  width: number
  height: number
  children?: SolvedChildBox[]
}

export interface SolvedFlexContainer {
  name?: string
  x: number
  y: number
  width: number
  height: number
  direction: FlexDirection
  justify: FlexJustify
  align: FlexAlign
  gap: number
  padding: { top: number; right: number; bottom: number; left: number }
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  cornerRadius?: number
  children: SolvedChildBox[]
}

function normalizePadding(p: FlexPadding | undefined): {
  top: number
  right: number
  bottom: number
  left: number
} {
  if (p === undefined) return { top: 0, right: 0, bottom: 0, left: 0 }
  if (typeof p === 'number') {
    const val = Math.max(0, Math.round(p))
    return { top: val, right: val, bottom: val, left: val }
  }
  return {
    top: Math.max(0, Math.round(p.top ?? 0)),
    right: Math.max(0, Math.round(p.right ?? 0)),
    bottom: Math.max(0, Math.round(p.bottom ?? 0)),
    left: Math.max(0, Math.round(p.left ?? 0)),
  }
}

/**
 * Estimates intrinsic text width and height given font metrics and max available width.
 */
export function estimateTextDimensions(
  text: string,
  fontSize: number,
  maxAvailableWidth: number,
  explicitWidth?: FlexSizing,
): { width: number; height: number } {
  const clean = text || ' '
  const lines = clean.split(/\r?\n/)
  const maxLineChars = Math.max(...lines.map(l => l.length), 1)

  // Natural single-line width estimate
  const naturalWidth = Math.round(maxLineChars * fontSize * 0.6)

  let width: number
  if (typeof explicitWidth === 'number') {
    width = explicitWidth
  } else if (explicitWidth === 'fill') {
    width = maxAvailableWidth
  } else {
    // 'hug' or undefined
    width = Math.min(maxAvailableWidth, Math.max(60, naturalWidth))
  }

  // Calculate wrapped lines based on container width
  const charsPerLine = Math.max(1, Math.floor(width / (fontSize * 0.55)))
  let totalLines = 0
  for (const line of lines) {
    totalLines += Math.max(1, Math.ceil(line.length / charsPerLine))
  }

  const height = Math.round(totalLines * fontSize * 1.3)
  return { width, height }
}

/**
 * Solves a flex container's dimensions and positions its children along the main
 * and cross axes.
 */
export function solveFlexContainer(
  input: FlexContainerInput,
  parentBounds: { width: number; height: number },
): SolvedFlexContainer {
  const direction: FlexDirection = input.direction ?? 'column'
  const justify: FlexJustify = input.justify ?? 'start'
  const align: FlexAlign = input.align ?? (direction === 'column' ? 'center' : 'start')
  const gap = Number.isFinite(input.gap) ? Math.max(0, Math.round(input.gap!)) : 16
  const padding = normalizePadding(input.padding)
  const isCol = direction === 'column'

  // Resolve container width and height
  const innerParentW = parentBounds.width - padding.left - padding.right
  const innerParentH = parentBounds.height - padding.top - padding.bottom

  let containerW =
    typeof input.width === 'number'
      ? input.width
      : input.width === 'fill' || input.width === undefined
        ? parentBounds.width
        : 0 // hug will compute later

  let containerH =
    typeof input.height === 'number'
      ? input.height
      : input.height === 'fill' || input.height === undefined
        ? parentBounds.height
        : 0 // hug will compute later

  const rawChildren = input.children ?? []

  // Phase 1: Measure intrinsic child sizes
  interface MeasuredChild {
    spec: FlexContainerChildSpec
    width: number
    height: number
    solvedNested?: SolvedFlexContainer
    isFillMain: boolean
    isFillCross: boolean
  }

  const measuredChildren: MeasuredChild[] = []

  for (const spec of rawChildren) {
    const isFillMain = isCol ? spec.height === 'fill' : spec.width === 'fill'
    const isFillCross = isCol ? spec.width === 'fill' : spec.height === 'fill'

    if (spec.type === 'container') {
      // Recursively solve nested container
      const nestedSolved = solveFlexContainer(spec as FlexContainerInput, {
        width: isCol ? innerParentW : Math.round(innerParentW / Math.max(1, rawChildren.length)),
        height: isCol ? Math.round(innerParentH / Math.max(1, rawChildren.length)) : innerParentH,
      })
      measuredChildren.push({
        spec,
        width: nestedSolved.width,
        height: nestedSolved.height,
        solvedNested: nestedSolved,
        isFillMain,
        isFillCross,
      })
      continue
    }

    // Role-based text element
    const isText =
      spec.type === 'text' ||
      spec.type === 'headline' ||
      spec.type === 'subtitle' ||
      spec.type === 'body' ||
      spec.type === 'badge' ||
      spec.type === 'caption'

    if (isText) {
      const role: TypographicRole =
        spec.type === 'text' ? 'body' : (spec.type as TypographicRole)
      const { fontSize } = computeRoleFontSize(
        role,
        parentBounds.width,
        parentBounds.height,
        spec.fontSize,
      )

      const maxTextW = isCol ? innerParentW : Math.round(innerParentW * 0.7)
      const dims = estimateTextDimensions(
        spec.text || '',
        fontSize,
        maxTextW,
        spec.width,
      )

      measuredChildren.push({
        spec: { ...spec, fontSize },
        width: dims.width,
        height: dims.height,
        isFillMain,
        isFillCross,
      })
      continue
    }

    if (spec.type === 'icon') {
      const iconSize =
        typeof spec.size === 'number'
          ? spec.size
          : Math.round(Math.min(parentBounds.width, parentBounds.height) * 0.05)
      measuredChildren.push({
        spec,
        width: iconSize,
        height: iconSize,
        isFillMain,
        isFillCross,
      })
      continue
    }

    if (spec.type === 'shape') {
      const shapeKind = spec.shapeKind ?? 'rectangle'
      const isLine = shapeKind === 'line' || shapeKind === 'arrow'
      const defW = isLine
        ? Math.round(innerParentW * 0.8)
        : Math.round(Math.min(parentBounds.width, parentBounds.height) * 0.25)
      const defH = isLine ? 16 : defW

      const w =
        typeof spec.width === 'number'
          ? spec.width
          : spec.width === 'fill'
            ? innerParentW
            : defW
      const h =
        typeof spec.height === 'number'
          ? spec.height
          : spec.height === 'fill'
            ? innerParentH
            : defH

      measuredChildren.push({
        spec,
        width: w,
        height: h,
        isFillMain,
        isFillCross,
      })
      continue
    }

    if (spec.type === 'image') {
      const w =
        typeof spec.width === 'number'
          ? spec.width
          : spec.width === 'fill'
            ? innerParentW
            : Math.round(innerParentW * 0.5)
      const h =
        typeof spec.height === 'number'
          ? spec.height
          : spec.height === 'fill'
            ? innerParentH
            : Math.round(w * 0.66)

      measuredChildren.push({
        spec,
        width: w,
        height: h,
        isFillMain,
        isFillCross,
      })
      continue
    }

    // Default generic leaf
    measuredChildren.push({
      spec,
      width: typeof spec.width === 'number' ? spec.width : 100,
      height: typeof spec.height === 'number' ? spec.height : 50,
      isFillMain,
      isFillCross,
    })
  }

  // Phase 2: Compute hug container bounds if necessary
  const totalGaps = Math.max(0, measuredChildren.length - 1) * gap
  const contentMainSize = measuredChildren.reduce(
    (acc, c) => acc + (isCol ? c.height : c.width),
    0,
  )
  const maxCrossSize = measuredChildren.reduce(
    (max, c) => Math.max(max, isCol ? c.width : c.height),
    0,
  )

  if (input.width === 'hug') {
    containerW = isCol
      ? maxCrossSize + padding.left + padding.right
      : contentMainSize + totalGaps + padding.left + padding.right
  }
  if (input.height === 'hug') {
    containerH = isCol
      ? contentMainSize + totalGaps + padding.top + padding.bottom
      : maxCrossSize + padding.top + padding.bottom
  }

  // Container coordinate placement
  let posX = input.x ?? 0
  let posY = input.y ?? 0
  if (input.x === undefined && containerW < parentBounds.width) {
    posX = Math.round(parentBounds.width / 2 - containerW / 2)
  }
  if (input.y === undefined && containerH < parentBounds.height) {
    posY = Math.round(parentBounds.height / 2 - containerH / 2)
  }

  // Phase 3: Position children along main axis
  const availMain =
    (isCol ? containerH - padding.top - padding.bottom : containerW - padding.left - padding.right) -
    totalGaps
  const fixedMainSize = measuredChildren
    .filter(c => !c.isFillMain)
    .reduce((sum, c) => sum + (isCol ? c.height : c.width), 0)

  const fillMainChildren = measuredChildren.filter(c => c.isFillMain)
  const remainingMain = Math.max(0, availMain - fixedMainSize)
  const fillMainItemSize =
    fillMainChildren.length > 0
      ? Math.round(remainingMain / fillMainChildren.length)
      : 0

  // Apply fill main sizing
  for (const c of fillMainChildren) {
    if (isCol) c.height = fillMainItemSize
    else c.width = fillMainItemSize
  }

  const effectiveTotalMain =
    measuredChildren.reduce((sum, c) => sum + (isCol ? c.height : c.width), 0) +
    totalGaps
  const totalContainerInnerMain = isCol
    ? containerH - padding.top - padding.bottom
    : containerW - padding.left - padding.right
  const slackSpace = Math.max(0, totalContainerInnerMain - effectiveTotalMain)

  let mainCursor = isCol ? padding.top : padding.left
  let extraGap = 0

  if (slackSpace > 0) {
    if (justify === 'center') {
      mainCursor += Math.round(slackSpace / 2)
    } else if (justify === 'end') {
      mainCursor += slackSpace
    } else if (justify === 'space-between' && measuredChildren.length > 1) {
      extraGap = slackSpace / (measuredChildren.length - 1)
    } else if (justify === 'space-around' && measuredChildren.length > 0) {
      const chunk = slackSpace / measuredChildren.length
      mainCursor += Math.round(chunk / 2)
      extraGap = chunk
    } else if (justify === 'space-evenly' && measuredChildren.length > 0) {
      const chunk = slackSpace / (measuredChildren.length + 1)
      mainCursor += Math.round(chunk)
      extraGap = chunk
    }
  }

  const solvedChildren: SolvedChildBox[] = []

  for (const child of measuredChildren) {
    const childMain = isCol ? child.height : child.width
    let childCross = isCol ? child.width : child.height

    const innerCross = isCol
      ? containerW - padding.left - padding.right
      : containerH - padding.top - padding.bottom

    const effectiveAlign = child.spec.alignSelf ?? align

    // Handle cross-axis stretching
    if (effectiveAlign === 'stretch' || child.isFillCross) {
      childCross = innerCross
      if (isCol) child.width = innerCross
      else child.height = innerCross
    }

    let crossPos = isCol ? padding.left : padding.top
    if (effectiveAlign === 'center') {
      crossPos += Math.round(innerCross / 2 - childCross / 2)
    } else if (effectiveAlign === 'end') {
      crossPos += innerCross - childCross
    }

    const childX = isCol ? crossPos : mainCursor
    const childY = isCol ? mainCursor : crossPos

    solvedChildren.push({
      spec: child.spec,
      x: childX,
      y: childY,
      width: child.width,
      height: child.height,
      children: child.solvedNested?.children,
    })

    mainCursor += Math.round(childMain + gap + extraGap)
  }

  return {
    name: input.name,
    x: posX,
    y: posY,
    width: containerW,
    height: containerH,
    direction,
    justify,
    align,
    gap,
    padding,
    fillColor: input.fillColor,
    strokeColor: input.strokeColor,
    strokeWidth: input.strokeWidth,
    cornerRadius: input.cornerRadius,
    children: solvedChildren,
  }
}

