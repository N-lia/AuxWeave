import type { SceneBounds, SceneSnapGuide } from './types'

export const SNAP_DEADBAND_PX = 0.25
export const DEFAULT_SNAP_THRESHOLD_PX = 8

const SNAP_SWITCH_HYSTERESIS_PX = 1.5
const SNAP_RELEASE_MULTIPLIER = 1.6

export type UserGuide = {
  id: string
  axis: 'x' | 'y' // 'x' = vertical guide at canvas X, 'y' = horizontal guide at canvas Y
  position: number // canvas coordinate
}

/**
 * Converts a screen-pixel snap threshold (default 8px) into canvas units.
 */
export function getCanvasSnapThreshold(zoom: number, screenThresholdPx = DEFAULT_SNAP_THRESHOLD_PX): number {
  const safeZoom = Math.max(0.001, zoom)
  return screenThresholdPx / safeZoom
}

export function sceneSnapThreshold(boardW: number, boardH: number) {
  return Math.max(8, Math.round(Math.min(boardW, boardH) * 0.0025))
}

export type SnapResult = {
  guides: SceneSnapGuide[]
  dx: number
  dy: number
  activeUserGuideIds: string[]
}

/**
 * Evaluates snapping of moving element bounds against scene objects, artboard center, and user guides.
 * Evaluates candidates (left, center, right for X; top, center, bottom for Y).
 * Threshold is converted to canvas units based on zoom to ensure consistent screen-pixel snapping feel.
 */
export function computeSceneSnap(
  movingBounds: SceneBounds,
  snapTargets: SceneBounds[],
  boardW: number,
  boardH: number,
  threshold: number,
  prevGuideX: number | null,
  prevGuideY: number | null,
  userGuides: UserGuide[] = [],
  zoom = 1,
): SnapResult {
  const left = movingBounds.left
  const right = movingBounds.left + movingBounds.width
  const top = movingBounds.top
  const bottom = movingBounds.top + movingBounds.height
  const centerX = left + movingBounds.width / 2
  const centerY = top + movingBounds.height / 2

  const guideThreshold = getCanvasSnapThreshold(zoom, DEFAULT_SNAP_THRESHOLD_PX)
  const effectiveThresholdX = Math.min(threshold, guideThreshold)
  const effectiveThresholdY = Math.min(threshold, guideThreshold)

  let bestDx = 0
  let bestXScore = Number.POSITIVE_INFINITY
  let guideX: number | null = null
  let activeGuideIdX: string | null = null

  const releaseThresholdX = effectiveThresholdX * SNAP_RELEASE_MULTIPLIER

  const tryX = (myX: number, theirX: number, guideId?: string) => {
    const delta = theirX - myX
    const absDelta = Math.abs(delta)
    const sticky = prevGuideX !== null && Math.abs(theirX - prevGuideX) < 0.5
    const limit = sticky ? releaseThresholdX : effectiveThresholdX
    if (absDelta > limit) return
    const score = absDelta - (sticky ? SNAP_SWITCH_HYSTERESIS_PX : 0)
    if (score < bestXScore) {
      bestXScore = score
      bestDx = delta
      guideX = theirX
      activeGuideIdX = guideId ?? null
    }
  }

  // Snap to other objects
  for (const target of snapTargets) {
    const targetLeft = target.left
    const targetCenter = target.left + target.width / 2
    const targetRight = target.left + target.width
    for (const targetX of [targetLeft, targetCenter, targetRight]) {
      tryX(left, targetX)
      tryX(centerX, targetX)
      tryX(right, targetX)
    }
  }
  // Snap to artboard center X
  tryX(centerX, boardW / 2)

  // Snap to user vertical guides (axis === 'x')
  for (const guide of userGuides) {
    if (guide.axis === 'x') {
      tryX(left, guide.position, guide.id)
      tryX(centerX, guide.position, guide.id)
      tryX(right, guide.position, guide.id)
    }
  }

  let bestDy = 0
  let bestYScore = Number.POSITIVE_INFINITY
  let guideY: number | null = null
  let activeGuideIdY: string | null = null

  const releaseThresholdY = effectiveThresholdY * SNAP_RELEASE_MULTIPLIER

  const tryY = (myY: number, theirY: number, guideId?: string) => {
    const delta = theirY - myY
    const absDelta = Math.abs(delta)
    const sticky = prevGuideY !== null && Math.abs(theirY - prevGuideY) < 0.5
    const limit = sticky ? releaseThresholdY : effectiveThresholdY
    if (absDelta > limit) return
    const score = absDelta - (sticky ? SNAP_SWITCH_HYSTERESIS_PX : 0)
    if (score < bestYScore) {
      bestYScore = score
      bestDy = delta
      guideY = theirY
      activeGuideIdY = guideId ?? null
    }
  }

  // Snap to other objects
  for (const target of snapTargets) {
    const targetTop = target.top
    const targetCenter = target.top + target.height / 2
    const targetBottom = target.top + target.height
    for (const targetY of [targetTop, targetCenter, targetBottom]) {
      tryY(top, targetY)
      tryY(centerY, targetY)
      tryY(bottom, targetY)
    }
  }
  // Snap to artboard center Y
  tryY(centerY, boardH / 2)

  // Snap to user horizontal guides (axis === 'y')
  for (const guide of userGuides) {
    if (guide.axis === 'y') {
      tryY(top, guide.position, guide.id)
      tryY(centerY, guide.position, guide.id)
      tryY(bottom, guide.position, guide.id)
    }
  }

  const guides: SceneSnapGuide[] = []
  if (guideX !== null) guides.push({ axis: 'v', pos: guideX })
  if (guideY !== null) guides.push({ axis: 'h', pos: guideY })

  const activeUserGuideIds: string[] = []
  if (activeGuideIdX) activeUserGuideIds.push(activeGuideIdX)
  if (activeGuideIdY) activeUserGuideIds.push(activeGuideIdY)

  return { guides, dx: bestDx, dy: bestDy, activeUserGuideIds }
}
