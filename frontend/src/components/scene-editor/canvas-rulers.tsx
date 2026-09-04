import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  PX_PER_UNIT,
  type UnitKind,
  type UserGuide,
  generateRulerTicks,
} from '#/scene-engine/primitives/index'

export type { UnitKind, UserGuide }

type Props = {
  scale: number
  artboardW: number
  artboardH: number
  selectedBounds?: { left: number; top: number; width: number; height: number } | null
  margins?: { top: number; right: number; bottom: number; left: number }
  guides?: UserGuide[]
  onGuidesChange?: (guides: UserGuide[]) => void
  containerRef: React.RefObject<HTMLDivElement | null>
  artboardRef: React.RefObject<HTMLDivElement | null>
  showRulers?: boolean
  activeSnapGuideIds?: string[]
}

const RULER_THICKNESS = 22 // px
const UNITS: UnitKind[] = ['px', 'in', 'cm', 'mm', 'pt']

export const CanvasRulers = memo(function CanvasRulers({
  scale,
  artboardW,
  artboardH,
  selectedBounds,
  margins = { top: 32, right: 32, bottom: 32, left: 32 },
  guides = [],
  onGuidesChange,
  containerRef,
  artboardRef,
  showRulers = true,
  activeSnapGuideIds = [],
}: Props) {
  const [unit, setUnit] = useState<UnitKind>('px')
  const canvasXRef = useRef<HTMLCanvasElement>(null)
  const canvasYRef = useRef<HTMLCanvasElement>(null)

  const [draggingGuide, setDraggingGuide] = useState<{
    id?: string
    axis: 'x' | 'y'
    currentPos: number
  } | null>(null)

  // Track position offset between container top-left and artboard top-left
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const offsetRef = useRef({ x: 0, y: 0 })

  // Cached container size ref to prevent layout thrashing
  const sizeRef = useRef({ w: 0, h: 0 })

  // Cursor position tracking ref for zero-lag canvas projection lines
  const cursorPosRef = useRef<{ screenX: number; screenY: number; canvasX: number; canvasY: number } | null>(null)

  const updateOffsets = useCallback(() => {
    if (!containerRef.current || !artboardRef.current) return
    const container = containerRef.current
    const artboard = artboardRef.current

    const containerRect = container.getBoundingClientRect()
    const artboardRect = artboard.getBoundingClientRect()

    sizeRef.current = {
      w: container.clientWidth,
      h: container.clientHeight,
    }

    const newX = artboardRect.left - containerRect.left
    const newY = artboardRect.top - containerRect.top

    if (Math.abs(offsetRef.current.x - newX) > 0.5 || Math.abs(offsetRef.current.y - newY) > 0.5) {
      offsetRef.current = { x: newX, y: newY }
      requestAnimationFrame(() => {
        setOffset({ x: newX, y: newY })
      })
    }
  }, [containerRef, artboardRef])

  // Efficient passive listener for scroll/resize
  useEffect(() => {
    updateOffsets()

    const container = containerRef.current
    if (!container) return

    window.addEventListener('resize', updateOffsets, { passive: true })
    container.addEventListener('scroll', updateOffsets, { passive: true })

    const observer = new ResizeObserver(() => {
      requestAnimationFrame(updateOffsets)
    })
    observer.observe(container)

    return () => {
      window.removeEventListener('resize', updateOffsets)
      container.removeEventListener('scroll', updateOffsets)
      observer.disconnect()
    }
  }, [updateOffsets, scale, artboardW, artboardH])

  // Cursor tracking for ruler projection lines
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top

      if (screenX >= RULER_THICKNESS && screenY >= RULER_THICKNESS && screenX <= rect.width && screenY <= rect.height) {
        const canvasX = Math.round((screenX - offset.x) / scale)
        const canvasY = Math.round((screenY - offset.y) / scale)
        cursorPosRef.current = { screenX, screenY, canvasX, canvasY }
      } else {
        cursorPosRef.current = null
      }
    }

    const handlePointerLeave = () => {
      cursorPosRef.current = null
    }

    container.addEventListener('pointermove', handlePointerMove, { passive: true })
    container.addEventListener('pointerleave', handlePointerLeave, { passive: true })

    return () => {
      container.removeEventListener('pointermove', handlePointerMove)
      container.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [containerRef, offset, scale])

  // Draw Both Rulers on Animation Frame in single unified pass
  useEffect(() => {
    if (!showRulers) return
    const canvasX = canvasXRef.current
    const canvasY = canvasYRef.current
    const container = containerRef.current
    if (!container) return

    let rafId: number

    const render = () => {
      const dpr = window.devicePixelRatio || 1
      const width = sizeRef.current.w || container.clientWidth
      const height = sizeRef.current.h || container.clientHeight
      const viewport = { zoom: scale, panX: offset.x, panY: offset.y }
      const cursorPos = cursorPosRef.current

      // 1. Horizontal (X) Ruler
      if (canvasX) {
        const targetW = width * dpr
        const targetH = RULER_THICKNESS * dpr
        if (canvasX.width !== targetW || canvasX.height !== targetH) {
          canvasX.width = targetW
          canvasX.height = targetH
          canvasX.style.width = `${width}px`
          canvasX.style.height = `${RULER_THICKNESS}px`
        }

        const ctxX = canvasX.getContext('2d', { alpha: false })
        if (ctxX) {
          ctxX.save()
          ctxX.scale(dpr, dpr)

          // Background track
          ctxX.fillStyle = '#f4f4f5'
          ctxX.fillRect(0, 0, width, RULER_THICKNESS)

          // Artboard Highlight Span
          const artboardStartX = offset.x
          const artboardEndX = offset.x + artboardW * scale
          ctxX.fillStyle = '#ffffff'
          ctxX.fillRect(
            Math.max(0, artboardStartX),
            0,
            Math.max(0, Math.min(width, artboardEndX) - Math.max(0, artboardStartX)),
            RULER_THICKNESS,
          )

          // Safe Margin indicators
          if (margins) {
            const marginStartX = offset.x + margins.left * scale
            const marginEndX = offset.x + (artboardW - margins.right) * scale
            ctxX.fillStyle = 'rgba(59, 130, 246, 0.08)'
            ctxX.fillRect(marginStartX, 0, Math.max(0, marginEndX - marginStartX), RULER_THICKNESS)
          }

          // Selected Object Bounds Projection
          if (selectedBounds) {
            const selX1 = offset.x + selectedBounds.left * scale
            const selX2 = offset.x + (selectedBounds.left + selectedBounds.width) * scale
            const selMidX = offset.x + (selectedBounds.left + selectedBounds.width / 2) * scale

            ctxX.fillStyle = 'rgba(244, 63, 94, 0.18)'
            ctxX.fillRect(selX1, 0, Math.max(0, selX2 - selX1), RULER_THICKNESS)

            ctxX.strokeStyle = '#e11d48'
            ctxX.lineWidth = 1.5
            ctxX.beginPath()
            ctxX.moveTo(selMidX, RULER_THICKNESS - 6)
            ctxX.lineTo(selMidX, RULER_THICKNESS)
            ctxX.stroke()
          }

          // Ticks & Labels using dynamic generator
          const xTicks = generateRulerTicks(viewport, width, 'x', unit, RULER_THICKNESS)

          for (const tick of xTicks) {
            ctxX.beginPath()
            ctxX.strokeStyle = tick.isZero ? '#2563eb' : '#a1a1aa'
            ctxX.lineWidth = tick.isZero ? 1.5 : tick.isMajor ? 1 : 0.75

            const tickLength = tick.isZero ? 14 : tick.isMajor ? 10 : tick.isMedium ? 6 : 4
            ctxX.moveTo(tick.screenPos, RULER_THICKNESS - tickLength)
            ctxX.lineTo(tick.screenPos, RULER_THICKNESS)
            ctxX.stroke()

            if (tick.label) {
              ctxX.fillStyle = tick.isZero ? '#2563eb' : '#71717a'
              ctxX.font = tick.isZero ? 'bold 9px Inter, sans-serif' : '9px Inter, sans-serif'
              ctxX.textAlign = 'left'
              ctxX.fillText(tick.label, tick.screenPos + 3, 10)
            }
          }

          // Cursor Position Projection Indicator on X Ruler
          if (cursorPos) {
            ctxX.strokeStyle = '#2563eb'
            ctxX.lineWidth = 1.5
            ctxX.beginPath()
            ctxX.moveTo(cursorPos.screenX, 0)
            ctxX.lineTo(cursorPos.screenX, RULER_THICKNESS)
            ctxX.stroke()
          }

          // Border line at bottom of horizontal ruler
          ctxX.strokeStyle = 'rgba(0, 0, 0, 0.08)'
          ctxX.beginPath()
          ctxX.moveTo(0, RULER_THICKNESS - 0.5)
          ctxX.lineTo(width, RULER_THICKNESS - 0.5)
          ctxX.stroke()

          ctxX.restore()
        }
      }

      // 2. Vertical (Y) Ruler
      if (canvasY) {
        const targetW = RULER_THICKNESS * dpr
        const targetH = height * dpr
        if (canvasY.width !== targetW || canvasY.height !== targetH) {
          canvasY.width = targetW
          canvasY.height = targetH
          canvasY.style.width = `${RULER_THICKNESS}px`
          canvasY.style.height = `${height}px`
        }

        const ctxY = canvasY.getContext('2d', { alpha: false })
        if (ctxY) {
          ctxY.save()
          ctxY.scale(dpr, dpr)

          // Background track
          ctxY.fillStyle = '#f4f4f5'
          ctxY.fillRect(0, 0, RULER_THICKNESS, height)

          // Artboard Highlight Span
          const artboardStartY = offset.y
          const artboardEndY = offset.y + artboardH * scale
          ctxY.fillStyle = '#ffffff'
          ctxY.fillRect(
            0,
            Math.max(0, artboardStartY),
            RULER_THICKNESS,
            Math.max(0, Math.min(height, artboardEndY) - Math.max(0, artboardStartY)),
          )

          // Safe Margin indicators
          if (margins) {
            const marginStartY = offset.y + margins.top * scale
            const marginEndY = offset.y + (artboardH - margins.bottom) * scale
            ctxY.fillStyle = 'rgba(59, 130, 246, 0.08)'
            ctxY.fillRect(0, marginStartY, RULER_THICKNESS, Math.max(0, marginEndY - marginStartY))
          }

          // Selected Object Bounds Projection
          if (selectedBounds) {
            const selY1 = offset.y + selectedBounds.top * scale
            const selY2 = offset.y + (selectedBounds.top + selectedBounds.height) * scale
            const selMidY = offset.y + (selectedBounds.top + selectedBounds.height / 2) * scale

            ctxY.fillStyle = 'rgba(244, 63, 94, 0.18)'
            ctxY.fillRect(0, selY1, RULER_THICKNESS, Math.max(0, selY2 - selY1))

            ctxY.strokeStyle = '#e11d48'
            ctxY.lineWidth = 1.5
            ctxY.beginPath()
            ctxY.moveTo(RULER_THICKNESS - 6, selMidY)
            ctxY.lineTo(RULER_THICKNESS, selMidY)
            ctxY.stroke()
          }

          // Ticks & Labels using dynamic generator
          const yTicks = generateRulerTicks(viewport, height, 'y', unit, RULER_THICKNESS)

          for (const tick of yTicks) {
            ctxY.beginPath()
            ctxY.strokeStyle = tick.isZero ? '#2563eb' : '#a1a1aa'
            ctxY.lineWidth = tick.isZero ? 1.5 : tick.isMajor ? 1 : 0.75

            const tickLength = tick.isZero ? 14 : tick.isMajor ? 10 : tick.isMedium ? 6 : 4
            ctxY.moveTo(RULER_THICKNESS - tickLength, tick.screenPos)
            ctxY.lineTo(RULER_THICKNESS, tick.screenPos)
            ctxY.stroke()

            if (tick.label) {
              ctxY.save()
              ctxY.translate(10, tick.screenPos + 3)
              ctxY.rotate(-Math.PI / 2)
              ctxY.fillStyle = tick.isZero ? '#2563eb' : '#71717a'
              ctxY.font = tick.isZero ? 'bold 9px Inter, sans-serif' : '9px Inter, sans-serif'
              ctxY.fillText(tick.label, 0, 0)
              ctxY.restore()
            }
          }

          // Cursor Position Projection Indicator on Y Ruler
          if (cursorPos) {
            ctxY.strokeStyle = '#2563eb'
            ctxY.lineWidth = 1.5
            ctxY.beginPath()
            ctxY.moveTo(0, cursorPos.screenY)
            ctxY.lineTo(RULER_THICKNESS, cursorPos.screenY)
            ctxY.stroke()
          }

          // Border line at right of vertical ruler
          ctxY.strokeStyle = 'rgba(0, 0, 0, 0.08)'
          ctxY.beginPath()
          ctxY.moveTo(RULER_THICKNESS - 0.5, 0)
          ctxY.lineTo(RULER_THICKNESS - 0.5, height)
          ctxY.stroke()

          ctxY.restore()
        }
      }
    }

    rafId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafId)
  }, [showRulers, scale, offset, artboardW, artboardH, selectedBounds, margins, unit, containerRef])

  // Drag out new snap guides or move existing guides from rulers
  const handleStartGuideDrag = (axis: 'x' | 'y', e: React.PointerEvent, guideId?: string) => {
    e.preventDefault()
    e.stopPropagation()
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (!containerRect) return

    const initialPos = axis === 'x' ? e.clientX - containerRect.left : e.clientY - containerRect.top
    setDraggingGuide({ id: guideId, axis, currentPos: initialPos })

    const onPointerMove = (moveEv: PointerEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const currentPos =
        axis === 'x'
          ? Math.max(0, Math.min(rect.width, moveEv.clientX - rect.left))
          : Math.max(0, Math.min(rect.height, moveEv.clientY - rect.top))
      setDraggingGuide({ id: guideId, axis, currentPos })
    }

    const onPointerUp = (upEv: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      setDraggingGuide(null)

      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const rawFinal = axis === 'x' ? upEv.clientX - rect.left : upEv.clientY - rect.top

      // Dropping guide back on ruler track removes/cancels guide
      if (rawFinal < RULER_THICKNESS) {
        if (guideId && onGuidesChange) {
          onGuidesChange(guides.filter(item => item.id !== guideId))
        }
        return
      }

      const finalPos = Math.max(0, Math.min(axis === 'x' ? rect.width : rect.height, rawFinal))
      const artboardPos = axis === 'x' ? (finalPos - offset.x) / scale : (finalPos - offset.y) / scale

      if (onGuidesChange) {
        if (guideId) {
          onGuidesChange(
            guides.map(item => (item.id === guideId ? { ...item, position: Math.round(artboardPos) } : item)),
          )
        } else {
          onGuidesChange([
            ...guides,
            {
              id: crypto.randomUUID(),
              axis,
              position: Math.round(artboardPos),
            },
          ])
        }
      }
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  const cycleUnit = () => {
    const nextIdx = (UNITS.indexOf(unit) + 1) % UNITS.length
    setUnit(UNITS[nextIdx])
  }

  if (!showRulers) return null

  const containerWidth = containerRef.current?.clientWidth || 0
  const containerHeight = containerRef.current?.clientHeight || 0

  return (
    <div className="sticky top-0 left-0 h-0 w-0 pointer-events-none overflow-visible z-[30]">
      {/* Top-Left Unit Switcher Corner Box */}
      <button
        type="button"
        onClick={cycleUnit}
        title={`Current unit: ${unit.toUpperCase()} (Click to toggle)`}
        style={{ width: RULER_THICKNESS, height: RULER_THICKNESS }}
        className="pointer-events-auto absolute left-0 top-0 z-[35] flex items-center justify-center border-b border-r border-black/10 bg-neutral-200 text-[9px] font-bold tracking-tight text-neutral-700 transition-colors hover:bg-neutral-300 select-none"
      >
        {unit}
      </button>

      {/* Horizontal (X) Ruler Canvas */}
      <div
        className="pointer-events-auto absolute left-0 top-0 z-[30] cursor-row-resize overflow-hidden"
        style={{ left: 0, width: containerWidth || '100%', height: RULER_THICKNESS }}
        onPointerDown={e => handleStartGuideDrag('y', e)}
        title="Horizontal Ruler — Drag down to add a horizontal guide line"
      >
        <canvas ref={canvasXRef} className="block pointer-events-none" />
      </div>

      {/* Vertical (Y) Ruler Canvas */}
      <div
        className="pointer-events-auto absolute left-0 top-0 z-[30] cursor-col-resize overflow-hidden"
        style={{ left: 0, top: 0, height: containerHeight || '100%', width: RULER_THICKNESS }}
        onPointerDown={e => handleStartGuideDrag('x', e)}
        title="Vertical Ruler — Drag right to add a vertical guide line"
      >
        <canvas ref={canvasYRef} className="block pointer-events-none" />
      </div>

      {/* Live Dragging Guide Line Indicator */}
      {draggingGuide ? (
        <div
          className="pointer-events-none absolute z-[40] border-dashed border-cyan-500"
          style={
            draggingGuide.axis === 'x'
              ? {
                  left: draggingGuide.currentPos,
                  top: 0,
                  height: containerHeight || '100%',
                  borderLeftWidth: 1.5,
                }
              : {
                  top: draggingGuide.currentPos,
                  left: 0,
                  width: containerWidth || '100%',
                  borderTopWidth: 1.5,
                }
          }
        >
          <span className="absolute left-2 top-2 rounded bg-cyan-600 px-1.5 py-0.5 text-[10px] font-medium text-white shadow">
            {draggingGuide.axis === 'x'
              ? `X: ${Math.round((draggingGuide.currentPos - offset.x) / scale)}px`
              : `Y: ${Math.round((draggingGuide.currentPos - offset.y) / scale)}px`}
          </span>
        </div>
      ) : null}

      {/* Render Active User Snap Guides on Canvas */}
      {guides.map(g => {
        const pos = g.axis === 'x' ? offset.x + g.position * scale : offset.y + g.position * scale
        const isSnapped = activeSnapGuideIds.includes(g.id)

        return (
          <div
            key={g.id}
            className="group pointer-events-auto absolute z-[28] hover:cursor-grab"
            style={
              g.axis === 'x'
                ? { left: pos - 3, top: 0, height: containerHeight || '100%', width: 7 }
                : { top: pos - 3, left: 0, width: containerWidth || '100%', height: 7 }
            }
            title={`Guide (${g.axis.toUpperCase()}: ${g.position}px) — Drag to move / Double click to remove`}
            onPointerDown={e => handleStartGuideDrag(g.axis, e, g.id)}
            onDoubleClick={e => {
              e.stopPropagation()
              if (onGuidesChange) {
                onGuidesChange(guides.filter(item => item.id !== g.id))
              }
            }}
          >
            <div
              className={`h-full w-full transition-colors ${
                isSnapped
                  ? 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]'
                  : 'bg-cyan-400/80 group-hover:bg-cyan-600'
              }`}
              style={
                g.axis === 'x'
                  ? { width: isSnapped ? 2 : 1, margin: '0 auto' }
                  : { height: isSnapped ? 2 : 1, margin: 'auto 0' }
              }
            />
          </div>
        )
      })}
    </div>
  )
})
