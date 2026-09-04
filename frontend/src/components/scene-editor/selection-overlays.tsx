import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

import type { SceneImage, SceneObject } from '../../lib/auxweave-scene'
import {
  cursorForHandle,
  RESIZE_HANDLES,
  type ResizeHandleId,
  type SceneSnapGuide,
} from '../../scene-engine/primitives'

const SELECT_ACCENT = 'var(--accent)'

export function ImageRemovalOverlay({
  object,
  phase,
}: {
  object: SceneImage
  phase: 'running' | 'success'
}) {
  return (
    <div
      className="pointer-events-none absolute z-[20]"
      style={{
        left: object.x,
        top: object.y,
        width: object.width,
        height: object.height,
        transform: `rotate(${object.rotation}deg)`,
        transformOrigin: 'center center',
      }}
    >
      <div
        className="auxweave-remove-bg-overlay absolute inset-0 overflow-hidden"
        data-phase={phase}
        style={{ borderRadius: object.cornerRadius }}
      >
        <div className="auxweave-remove-bg-overlay__wash" />
        <div className="auxweave-remove-bg-overlay__beam" />
        <div className="auxweave-remove-bg-overlay__edge" />
      </div>
    </div>
  )
}

export function SelectionOverlay({
  object,
  scale,
  onHandlePointerDown,
  onRotatePointerDown,
}: {
  object: SceneObject
  scale: number
  onHandlePointerDown: (e: ReactPointerEvent<HTMLButtonElement>, handle: ResizeHandleId) => void
  onRotatePointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  const screenScale = Math.max(scale, 0.01)
  const borderWidth = 1.5 / screenScale
  const cornerHandleSize = 12 / screenScale
  const sideHandleLength = 22 / screenScale
  const sideHandleThickness = 8 / screenScale
  const cornerHitSize = 24 / screenScale
  const sideHitLength = 32 / screenScale
  const sideHitThickness = 24 / screenScale
  const rotateHitSize = 28 / screenScale
  const rotateHandleSize = 16 / screenScale
  const rotateCenterOffset = 34 / screenScale
  const handleChromeClass =
    'block border border-[#aeb0bd] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.18),0_0_0_1px_rgba(255,255,255,0.95)] transition-[transform,border-color,box-shadow] duration-150 group-hover:scale-110 group-hover:border-[#ff9f6e] group-hover:shadow-[0_2px_8px_rgba(15,23,42,0.22),0_0_0_3px_rgba(255,159,110,0.18)]'

  // Compute the rotation handle position in canvas (unrotated) coordinates.
  // The local anchor is at (centerX, centerY + height/2 + rotateCenterOffset).
  // Rotating local vector (dx=0, dy=height/2+offset) by object.rotation gives:
  //   handleX = centerX - dy * sin(θ)
  //   handleY = centerY + dy * cos(θ)
  // This means the handle always tracks the visual bottom-center of the object,
  // at every rotation angle, with no dependency on toolbarPlacement.
  const rotationRad = (object.rotation * Math.PI) / 180
  const cosθ = Math.cos(rotationRad)
  const sinθ = Math.sin(rotationRad)
  const centerX = object.x + object.width / 2
  const centerY = object.y + object.height / 2
  const lineDy = object.height / 2  // from center to box bottom edge
  const handleDy = object.height / 2 + rotateCenterOffset  // from center to handle

  // Canvas-space positions
  const lineEndX = centerX - lineDy * sinθ
  const lineEndY = centerY + lineDy * cosθ
  const handleX = centerX - handleDy * sinθ
  const handleY = centerY + handleDy * cosθ

  // Angle for the connector line (perpendicular to the object's bottom edge)
  const lineAngleDeg = object.rotation  // line points in the same direction as local-Y

  return (
    <>
      {/* Rotated bounding box + resize handles */}
      <div
        className="pointer-events-none absolute z-[22]"
        style={{
          left: object.x,
          top: object.y,
          width: object.width,
          height: object.height,
          transform: `rotate(${object.rotation}deg)`,
          transformOrigin: 'center center',
        }}
      >
        <div
          className="absolute inset-0 rounded-[6px]"
          style={{
            border: `${borderWidth}px solid ${SELECT_ACCENT}`,
            boxShadow: `0 0 0 ${1 / screenScale}px rgba(255,255,255,0.9), 0 0 0 ${2.5 / screenScale}px color-mix(in srgb, ${SELECT_ACCENT} 16%, transparent)`,
          }}
        />
        {RESIZE_HANDLES.map(handle => {
          const horizontalSide = handle === 'e' || handle === 'w'
          const verticalSide = handle === 'n' || handle === 's'
          const side = horizontalSide || verticalSide
          const hitWidth = horizontalSide ? sideHitLength : side ? sideHitThickness : cornerHitSize
          const hitHeight = verticalSide ? sideHitLength : side ? sideHitThickness : cornerHitSize
          const visualWidth = horizontalSide
            ? sideHandleLength
            : verticalSide
              ? sideHandleThickness
              : cornerHandleSize
          const visualHeight = verticalSide
            ? sideHandleLength
            : horizontalSide
              ? sideHandleThickness
              : cornerHandleSize
          const hitOffsetX = -hitWidth / 2
          const hitOffsetY = -hitHeight / 2
          const common =
            'group pointer-events-auto absolute z-[2] flex items-center justify-center rounded-full bg-transparent p-0 outline-none touch-none'
          const pos: Record<ResizeHandleId, CSSProperties> = {
            nw: { left: hitOffsetX, top: hitOffsetY },
            n: { left: '50%', top: hitOffsetY, marginLeft: hitOffsetX },
            ne: { right: hitOffsetX, top: hitOffsetY },
            e: { right: hitOffsetX, top: '50%', marginTop: hitOffsetY },
            se: { right: hitOffsetX, bottom: hitOffsetY },
            s: { left: '50%', bottom: hitOffsetY, marginLeft: hitOffsetX },
            sw: { left: hitOffsetX, bottom: hitOffsetY },
            w: { left: hitOffsetX, top: '50%', marginTop: hitOffsetY },
          }
          return (
            <button
              key={handle}
              type="button"
              tabIndex={-1}
              className={common}
              style={{
                ...pos[handle],
                width: hitWidth,
                height: hitHeight,
                cursor: cursorForHandle(handle),
              }}
              onPointerDown={e => onHandlePointerDown(e, handle)}
            >
              <span
                aria-hidden="true"
                className={handleChromeClass}
                style={{
                  width: visualWidth,
                  height: visualHeight,
                  borderRadius: side ? `${sideHandleThickness}px` : '9999px',
                }}
              />
            </button>
          )
        })}
      </div>

      {/* Connector line — positioned in canvas space, rotated to match object */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute z-[22] rounded-full"
        style={{
          left: lineEndX,
          top: lineEndY,
          width: Math.max(1 / screenScale, borderWidth),
          height: rotateCenterOffset,
          transform: `translate(-50%, 0%) rotate(${lineAngleDeg}deg)`,
          transformOrigin: 'top center',
          background: SELECT_ACCENT,
          boxShadow: `0 0 0 ${1 / screenScale}px rgba(255,255,255,0.85)`,
        }}
      />

      {/* Rotation handle — positioned in canvas space */}
      <button
        type="button"
        tabIndex={-1}
        className="group pointer-events-auto absolute z-[22] flex items-center justify-center rounded-full bg-transparent p-0 outline-none touch-none"
        style={{
          left: handleX,
          top: handleY,
          width: rotateHitSize,
          height: rotateHitSize,
          transform: 'translate(-50%, -50%)',
          cursor: 'grab',
        }}
        onPointerDown={onRotatePointerDown}
      >
        <span
          aria-hidden="true"
          className={handleChromeClass}
          style={{
            width: rotateHandleSize,
            height: rotateHandleSize,
            borderRadius: '9999px',
          }}
        />
      </button>
    </>
  )
}


export function SelectionBoundsOverlay({
  bounds,
  scale,
  dashed = false,
  fill = false,
}: {
  bounds: { left: number; top: number; width: number; height: number }
  scale: number
  dashed?: boolean
  fill?: boolean
}) {
  const screenScale = Math.max(scale, 0.01)
  const borderWidth = 1.5 / screenScale
  return (
    <div
      className="pointer-events-none absolute z-[21] rounded-[6px]"
      style={{
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
        height: bounds.height,
        border: `${borderWidth}px ${dashed ? 'dashed' : 'solid'} ${SELECT_ACCENT}`,
        background: fill ? `color-mix(in srgb, ${SELECT_ACCENT} 12%, transparent)` : 'transparent',
        boxShadow: dashed
          ? undefined
          : `0 0 0 ${1 / screenScale}px color-mix(in srgb, ${SELECT_ACCENT} 18%, transparent)`,
      }}
    />
  )
}

export function SnapGuidesOverlay({
  guides,
  scale,
  artboardW,
  artboardH,
}: {
  guides: SceneSnapGuide[]
  scale: number
  artboardW: number
  artboardH: number
}) {
  if (guides.length === 0) return null
  const screenScale = Math.max(scale, 0.01)
  const lineThickness = 1 / screenScale
  return (
    <>
      {guides.map((guide, index) =>
        guide.axis === 'v' ? (
          <div
            key={`snap-v-${guide.pos}-${index}`}
            className="pointer-events-none absolute z-[19] bg-[var(--accent)]"
            style={{
              left: guide.pos - lineThickness / 2,
              top: 0,
              width: lineThickness,
              height: artboardH,
            }}
          />
        ) : (
          <div
            key={`snap-h-${guide.pos}-${index}`}
            className="pointer-events-none absolute z-[19] bg-[var(--accent)]"
            style={{
              left: 0,
              top: guide.pos - lineThickness / 2,
              width: artboardW,
              height: lineThickness,
            }}
          />
        ),
      )}
    </>
  )
}
