export type ViewportState = {
  zoom: number // 1.0 = 100%
  panX: number // screen-space viewport X offset
  panY: number // screen-space viewport Y offset
}

/**
 * Converts screen-space pixel coordinates (e.g. from pointer events)
 * into logical canvas coordinates.
 */
export function screenToCanvas(
  screenX: number,
  screenY: number,
  viewport: ViewportState,
): { x: number; y: number } {
  const zoom = viewport.zoom || 1
  return {
    x: (screenX - viewport.panX) / zoom,
    y: (screenY - viewport.panY) / zoom,
  }
}

/**
 * Converts logical canvas coordinates into screen-space pixel coordinates.
 */
export function canvasToScreen(
  canvasX: number,
  canvasY: number,
  viewport: ViewportState,
): { x: number; y: number } {
  const zoom = viewport.zoom || 1
  return {
    x: canvasX * zoom + viewport.panX,
    y: canvasY * zoom + viewport.panY,
  }
}
