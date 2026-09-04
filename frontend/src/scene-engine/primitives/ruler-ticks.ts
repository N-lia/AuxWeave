import type { ViewportState } from './coordinates'

export type UnitKind = 'px' | 'in' | 'cm' | 'mm' | 'pt'

export const PX_PER_UNIT: Record<UnitKind, number> = {
  px: 1,
  in: 96,
  cm: 96 / 2.54,
  mm: 96 / 25.4,
  pt: 96 / 72,
}

export type RulerTick = {
  canvasValue: number
  screenPos: number
  isMajor: boolean
  isMedium: boolean
  isMinor: boolean
  label?: string
  isZero: boolean
}

/**
 * Calculates a deterministic 'nice interval' step in canvas units based on zoom and unit scale.
 * Step sequence: 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000...
 */
export function getRulerInterval(zoom: number, unitScale = 1, targetScreenPx = 80): number {
  const safeZoom = Math.max(0.0001, zoom)
  const rawStep = targetScreenPx / (safeZoom * unitScale)
  const exponent = Math.floor(Math.log10(rawStep))
  const fraction = rawStep / Math.pow(10, exponent)

  let niceFraction = 10
  if (fraction <= 1.5) niceFraction = 1
  else if (fraction <= 3.5) niceFraction = 2
  else if (fraction <= 7.5) niceFraction = 5

  return Math.max(0.001, niceFraction * Math.pow(10, exponent))
}

/**
 * Generates major, medium, and minor ruler ticks visible within a track length.
 */
export function generateRulerTicks(
  viewport: ViewportState,
  trackLength: number,
  axis: 'x' | 'y',
  unit: UnitKind = 'px',
  rulerThickness = 22,
): RulerTick[] {
  const ticks: RulerTick[] = []
  const { zoom, panX, panY } = viewport
  const pan = axis === 'x' ? panX : panY
  const pxPerUnit = PX_PER_UNIT[unit]

  const unitStep = getRulerInterval(zoom, pxPerUnit, 80)
  const stepPx = unitStep * pxPerUnit * zoom

  const startVal = Math.floor((-pan / (zoom * pxPerUnit)) / unitStep) * unitStep
  const endVal = Math.ceil(((trackLength - pan) / (zoom * pxPerUnit)) / unitStep) * unitStep

  for (let val = startVal; val <= endVal; val += unitStep) {
    // Avoid precision jitter with floating points
    const roundedVal = Math.round(val * 1000) / 1000
    const screenPos = pan + roundedVal * pxPerUnit * zoom

    if (screenPos < rulerThickness || screenPos > trackLength) continue

    const isZero = Math.abs(roundedVal) < 0.0001

    // Major tick
    ticks.push({
      canvasValue: roundedVal,
      screenPos,
      isMajor: true,
      isMedium: false,
      isMinor: false,
      label: `${roundedVal}`,
      isZero,
    })

    // Sub-ticks depending on zoom density
    if (!isZero) {
      if (stepPx >= 50) {
        // 5 sub-intervals (4 sub-ticks)
        const subStep = stepPx / 5
        const subValStep = unitStep / 5
        for (let i = 1; i < 5; i++) {
          const sPos = screenPos + i * subStep
          if (sPos >= rulerThickness && sPos <= trackLength) {
            const isMid = i === 2 || i === 3
            ticks.push({
              canvasValue: roundedVal + i * subValStep,
              screenPos: sPos,
              isMajor: false,
              isMedium: isMid,
              isMinor: !isMid,
              isZero: false,
            })
          }
        }
      } else if (stepPx >= 25) {
        // 2 sub-intervals (1 medium sub-tick)
        const sPos = screenPos + stepPx / 2
        if (sPos >= rulerThickness && sPos <= trackLength) {
          ticks.push({
            canvasValue: roundedVal + unitStep / 2,
            screenPos: sPos,
            isMajor: false,
            isMedium: true,
            isMinor: false,
            isZero: false,
          })
        }
      }
    }
  }

  return ticks
}
