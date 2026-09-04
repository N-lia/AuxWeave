import { Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import EditorRangeSlider from './editor-range-slider'
import { Button } from './ui'

const MIN_SIDE = 12
const HANDLE_PX = 10
const ROTATION_MIN = -180
const ROTATION_MAX = 180
const ASPECT_MATCH_TOLERANCE = 0.015

type CropRect = { x: number; y: number; w: number; h: number; rotation: number }
type FrameSize = { width: number; height: number }

export type ImageCropModalApplyPayload = {
  cropX: number
  cropY: number
  width: number
  height: number
  cropRotation: number
}

type Props = {
  open: boolean
  imageSrc: string
  initialCrop: CropRect
  initialFrame: FrameSize
  onCancel: () => void
  onApply: (rect: ImageCropModalApplyPayload) => void
}

type DragKind = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

type AspectPreset = {
  id: string
  label: string
  description: string
  ratio: number | 'original' | 'frame' | null
}

const ASPECT_PRESETS: readonly AspectPreset[] = [
  { id: 'square', label: '1:1', description: 'Square', ratio: 1 },
  { id: 'landscape', label: '16:9', description: 'Widescreen', ratio: 16 / 9 },
  { id: 'story', label: '9:16', description: 'Story', ratio: 9 / 16 },
  { id: 'portrait', label: '4:5', description: 'Portrait', ratio: 4 / 5 },
  { id: 'post', label: '5:4', description: 'Post', ratio: 5 / 4 },
  { id: 'photo', label: '3:2', description: 'Photo', ratio: 3 / 2 },
  { id: 'classic', label: '4:3', description: 'Classic', ratio: 4 / 3 },
  { id: 'current', label: 'Frame', description: 'Current shape', ratio: 'frame' },
  { id: 'original', label: 'Original', description: 'Image ratio', ratio: 'original' },
  { id: 'free', label: 'Free', description: 'Unlocked', ratio: null },
]

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function safeMinSide(nw: number, nh: number) {
  return Math.max(1, Math.min(MIN_SIDE, nw, nh))
}

function clampRotation(value: number) {
  if (!Number.isFinite(value)) return 0
  return clampNumber(Math.round(value * 10) / 10, ROTATION_MIN, ROTATION_MAX)
}

function clampCrop(r: CropRect, nw: number, nh: number): CropRect {
  const minSide = safeMinSide(nw, nh)
  let { x, y, w, h } = r
  x = clampNumber(x, 0, Math.max(0, nw - minSide))
  y = clampNumber(y, 0, Math.max(0, nh - minSide))
  w = clampNumber(w, minSide, Math.max(minSide, nw - x))
  h = clampNumber(h, minSide, Math.max(minSide, nh - y))
  return { x, y, w, h, rotation: clampRotation(r.rotation) }
}

function clampAspectCrop(r: CropRect, nw: number, nh: number, aspect: number): CropRect {
  const safeAspect = Math.max(0.001, aspect)
  const maxWidth = Math.max(1, Math.min(nw, nh * safeAspect))
  const maxHeight = Math.max(1, maxWidth / safeAspect)
  let width = clampNumber(r.w, 1, maxWidth)
  let height = width / safeAspect

  if (height > maxHeight) {
    height = maxHeight
    width = height * safeAspect
  }

  const minSide = Math.min(safeMinSide(nw, nh), maxWidth, maxHeight)
  if (width < minSide || height < minSide) {
    if (safeAspect >= 1) {
      height = Math.min(maxHeight, minSide)
      width = height * safeAspect
    } else {
      width = Math.min(maxWidth, minSide)
      height = width / safeAspect
    }
  }

  return {
    x: clampNumber(r.x, 0, Math.max(0, nw - width)),
    y: clampNumber(r.y, 0, Math.max(0, nh - height)),
    w: width,
    h: height,
    rotation: clampRotation(r.rotation),
  }
}

function fitCropToAspect(crop: CropRect, nw: number, nh: number, aspect: number): CropRect {
  const safeAspect = Math.max(0.001, aspect)
  const maxWidth = Math.min(nw, nh * safeAspect)
  const maxHeight = Math.min(nh, nw / safeAspect)
  let width = crop.w
  let height = crop.h

  if (width / Math.max(1, height) > safeAspect) {
    width = height * safeAspect
  } else {
    height = width / safeAspect
  }
  if (width > maxWidth) {
    width = maxWidth
    height = width / safeAspect
  }
  if (height > maxHeight) {
    height = maxHeight
    width = height * safeAspect
  }

  const centerX = crop.x + crop.w / 2
  const centerY = crop.y + crop.h / 2
  return clampAspectCrop(
    {
      x: centerX - width / 2,
      y: centerY - height / 2,
      w: width,
      h: height,
      rotation: crop.rotation,
    },
    nw,
    nh,
    safeAspect,
  )
}

function fitRotatedCropInsideImage(crop: CropRect, nw: number, nh: number): CropRect {
  const clamped = clampCrop(crop, nw, nh)
  const rotation = clampRotation(clamped.rotation)
  if (Math.abs(rotation) < 0.001) return { ...clamped, rotation }

  const aspect = Math.max(0.001, clamped.w / Math.max(1, clamped.h))
  const centerX = clamped.x + clamped.w / 2
  const centerY = clamped.y + clamped.h / 2
  const availableX = Math.max(0, Math.min(centerX, nw - centerX))
  const availableY = Math.max(0, Math.min(centerY, nh - centerY))
  const radians = (rotation * Math.PI) / 180
  const absCos = Math.abs(Math.cos(radians))
  const absSin = Math.abs(Math.sin(radians))
  const widthFromX = (2 * availableX) / Math.max(0.0001, absCos + absSin / aspect)
  const widthFromY = (2 * availableY) / Math.max(0.0001, absSin + absCos / aspect)
  const maxWidth = Math.max(1, Math.min(nw, nh * aspect, widthFromX, widthFromY))
  const width = Math.max(1, Math.min(clamped.w, maxWidth))
  const height = Math.max(1, width / aspect)

  return {
    x: clampNumber(centerX - width / 2, 0, Math.max(0, nw - width)),
    y: clampNumber(centerY - height / 2, 0, Math.max(0, nh - height)),
    w: width,
    h: height,
    rotation,
  }
}

function resolvePresetRatio(
  preset: AspectPreset,
  natural: { w: number; h: number },
  frame: FrameSize,
) {
  if (preset.ratio === null) return null
  if (preset.ratio === 'original') {
    return natural.w > 0 && natural.h > 0 ? natural.w / natural.h : null
  }
  if (preset.ratio === 'frame') {
    return frame.width > 0 && frame.height > 0 ? frame.width / frame.height : null
  }
  return preset.ratio
}

function findMatchingPresetId(aspect: number, natural: { w: number; h: number }, frame: FrameSize) {
  if (!Number.isFinite(aspect) || aspect <= 0) return 'free'
  for (const preset of ASPECT_PRESETS) {
    if (preset.ratio === null) continue
    const ratio = resolvePresetRatio(preset, natural, frame)
    if (ratio && Math.abs(ratio - aspect) <= ASPECT_MATCH_TOLERANCE) return preset.id
  }
  return 'free'
}

function resizeCropFromHandle(
  start: CropRect,
  kind: DragKind,
  dx: number,
  dy: number,
  nw: number,
  nh: number,
  aspect: number | null,
): CropRect {
  if (kind === 'move') {
    return clampCrop({ ...start, x: start.x + dx, y: start.y + dy }, nw, nh)
  }

  if (!aspect) {
    const next = { ...start }
    if (kind.includes('e')) next.w = start.w + dx
    if (kind.includes('w')) {
      next.x = start.x + dx
      next.w = start.w - dx
    }
    if (kind.includes('s')) next.h = start.h + dy
    if (kind.includes('n')) {
      next.y = start.y + dy
      next.h = start.h - dy
    }
    if (next.w < MIN_SIDE) {
      if (kind.includes('w')) next.x = start.x + start.w - MIN_SIDE
      next.w = MIN_SIDE
    }
    if (next.h < MIN_SIDE) {
      if (kind.includes('n')) next.y = start.y + start.h - MIN_SIDE
      next.h = MIN_SIDE
    }
    return clampCrop(next, nw, nh)
  }

  const centerX = start.x + start.w / 2
  const centerY = start.y + start.h / 2
  const hasHorizontalHandle = kind.includes('e') || kind.includes('w')
  const hasVerticalHandle = kind.includes('n') || kind.includes('s')
  let width = start.w
  let height = start.h

  if (hasHorizontalHandle) width = kind.includes('w') ? start.w - dx : start.w + dx
  if (hasVerticalHandle) height = kind.includes('n') ? start.h - dy : start.h + dy

  if (hasHorizontalHandle && !hasVerticalHandle) {
    height = width / aspect
  } else if (hasVerticalHandle && !hasHorizontalHandle) {
    width = height * aspect
  } else {
    const widthDelta = Math.abs(width - start.w)
    const heightDeltaAsWidth = Math.abs(height - start.h) * aspect
    if (widthDelta >= heightDeltaAsWidth) {
      height = width / aspect
    } else {
      width = height * aspect
    }
  }

  width = Math.max(MIN_SIDE, width)
  height = Math.max(MIN_SIDE, height)

  const x = kind.includes('w')
    ? start.x + start.w - width
    : kind.includes('e')
      ? start.x
      : centerX - width / 2
  const y = kind.includes('n')
    ? start.y + start.h - height
    : kind.includes('s')
      ? start.y
      : centerY - height / 2

  return clampAspectCrop({ x, y, w: width, h: height, rotation: start.rotation }, nw, nh, aspect)
}

function AspectGlyph({ ratio }: { ratio: number | null }) {
  const maxW = 32
  const maxH = 24
  const safeRatio = ratio ?? 1
  const width = safeRatio >= maxW / maxH ? maxW : maxH * safeRatio
  const height = safeRatio >= maxW / maxH ? maxW / safeRatio : maxH

  return (
    <span
      className={[
        'block rounded-[4px] border-2 border-current',
        ratio === null ? 'border-dashed opacity-80' : '',
      ].join(' ')}
      style={{ width, height }}
      aria-hidden
    />
  )
}

export default function ImageCropModal({
  open,
  imageSrc,
  initialCrop,
  initialFrame,
  onCancel,
  onApply,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const initialCropRef = useRef(initialCrop)
  initialCropRef.current = initialCrop

  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [crop, setCrop] = useState<CropRect>(initialCrop)
  const [boxPx, setBoxPx] = useState({ left: 0, top: 0, width: 0, height: 0 })
  const [aspectPresetId, setAspectPresetId] = useState('free')
  const [, layoutBump] = useReducer((n: number) => n + 1, 0)

  const dragRef = useRef<{
    kind: DragKind
    startClientX: number
    startClientY: number
    start: CropRect
    scale: number
    aspect: number | null
  } | null>(null)

  const selectedPreset =
    ASPECT_PRESETS.find(preset => preset.id === aspectPresetId) ?? ASPECT_PRESETS[0]
  const selectedAspect = resolvePresetRatio(selectedPreset, natural, initialFrame)

  useEffect(() => {
    if (!open) {
      setNatural({ w: 0, h: 0 })
      return
    }
    const nextCrop = { ...initialCrop, rotation: clampRotation(initialCrop.rotation) }
    const initialAspect =
      initialFrame.width > 0 && initialFrame.height > 0
        ? initialFrame.width / initialFrame.height
        : nextCrop.w / Math.max(1, nextCrop.h)
    setCrop(nextCrop)
    setAspectPresetId(findMatchingPresetId(initialAspect, { w: 0, h: 0 }, initialFrame))
  }, [
    open,
    initialCrop.x,
    initialCrop.y,
    initialCrop.w,
    initialCrop.h,
    initialCrop.rotation,
    initialFrame.width,
    initialFrame.height,
  ])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && natural.w > 0) {
        onApply({
          cropX: crop.x,
          cropY: crop.y,
          width: crop.w,
          height: crop.h,
          cropRotation: crop.rotation,
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel, onApply, natural.w, crop.x, crop.y, crop.w, crop.h, crop.rotation])

  useEffect(() => {
    if (!open) return
    const onResize = () => layoutBump()
    window.addEventListener('resize', onResize)
    const el = wrapRef.current
    let ro: ResizeObserver | null = null
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => layoutBump())
      ro.observe(el)
    }
    return () => {
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
    }
  }, [open])

  useEffect(() => {
    if (!open || natural.w <= 0 || natural.h <= 0 || !selectedAspect) return
    setCrop(current =>
      fitRotatedCropInsideImage(
        fitCropToAspect(current, natural.w, natural.h, selectedAspect),
        natural.w,
        natural.h,
      ),
    )
  }, [open, natural.w, natural.h, selectedAspect])

  const onImgLoad = useCallback(() => {
    const el = imgRef.current
    if (!el) return
    const nw = el.naturalWidth
    const nh = el.naturalHeight
    if (nw <= 0 || nh <= 0) return
    setNatural({ w: nw, h: nh })
    const ic = initialCropRef.current
    setCrop(clampCrop({ x: ic.x, y: ic.y, w: ic.w, h: ic.h, rotation: ic.rotation }, nw, nh))
    layoutBump()
  }, [])

  useLayoutEffect(() => {
    const img = imgRef.current
    if (!open || !img || natural.w <= 0) {
      setBoxPx({ left: 0, top: 0, width: 0, height: 0 })
      return
    }
    const renderedWidth = img.offsetWidth || img.getBoundingClientRect().width
    const scale = renderedWidth / natural.w
    setBoxPx({
      left: crop.x * scale,
      top: crop.y * scale,
      width: crop.w * scale,
      height: crop.h * scale,
    })
  }, [open, natural.w, crop.x, crop.y, crop.w, crop.h, layoutBump])

  const onPointerDownCrop = useCallback(
    (e: React.PointerEvent, kind: DragKind) => {
      e.preventDefault()
      e.stopPropagation()
      const img = imgRef.current
      if (!img || natural.w <= 0) return
      const scale = (img.offsetWidth || img.getBoundingClientRect().width) / natural.w
      dragRef.current = {
        kind,
        startClientX: e.clientX,
        startClientY: e.clientY,
        start: { ...crop },
        scale,
        aspect: selectedAspect,
      }
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    },
    [crop, natural.w, selectedAspect],
  )

  useEffect(() => {
    if (!open) return

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current
      if (!d || natural.w <= 0 || natural.h <= 0) return
      const rawDx = e.clientX - d.startClientX
      const rawDy = e.clientY - d.startClientY
      const dx = rawDx / d.scale
      const dy = rawDy / d.scale

      setCrop(
        fitRotatedCropInsideImage(
          resizeCropFromHandle(d.start, d.kind, dx, dy, natural.w, natural.h, d.aspect),
          natural.w,
          natural.h,
        ),
      )
    }

    const onUp = () => {
      dragRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [open, natural.w, natural.h])

  const chooseAspectPreset = useCallback(
    (preset: AspectPreset) => {
      setAspectPresetId(preset.id)
      const ratio = resolvePresetRatio(preset, natural, initialFrame)
      if (ratio && natural.w > 0 && natural.h > 0) {
        setCrop(current =>
          fitRotatedCropInsideImage(
            fitCropToAspect(current, natural.w, natural.h, ratio),
            natural.w,
            natural.h,
          ),
        )
      }
    },
    [natural, initialFrame],
  )

  const updateCropRotation = useCallback(
    (value: number) => {
      const nextRotation = clampRotation(value)
      setCrop(current =>
        natural.w > 0 && natural.h > 0
          ? fitRotatedCropInsideImage({ ...current, rotation: nextRotation }, natural.w, natural.h)
          : { ...current, rotation: nextRotation },
      )
    },
    [natural.w, natural.h],
  )

  const applyCrop = useCallback(() => {
    onApply({
      cropX: crop.x,
      cropY: crop.y,
      width: crop.w,
      height: crop.h,
      cropRotation: crop.rotation,
    })
  }, [crop, onApply])

  if (!open || typeof document === 'undefined') return null

  const imgReady = natural.w > 0 && natural.h > 0 && imgRef.current

  const boxStyle: CSSProperties = imgReady
    ? {
        left: boxPx.left,
        top: boxPx.top,
        width: boxPx.width,
        height: boxPx.height,
      }
    : { display: 'none' }

  const imageStyle: CSSProperties = imgReady
    ? {
        transform: `rotate(${crop.rotation}deg)`,
        transformOrigin: `${boxPx.left + boxPx.width / 2}px ${boxPx.top + boxPx.height / 2}px`,
      }
    : {}

  const handle = (kind: DragKind, className: string) => (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      className={`absolute z-10 box-border rounded-sm border-2 border-white bg-[var(--accent)] shadow-[0_1px_4px_rgba(0,0,0,0.28)] ${className}`}
      style={{ width: HANDLE_PX, height: HANDLE_PX, margin: -HANDLE_PX / 2 }}
      onPointerDown={e => onPointerDownCrop(e, kind)}
    />
  )

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Crop image"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-black/10 bg-[var(--surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
          <h2 className="m-0 text-base font-semibold text-[var(--text)]">Crop image</h2>
          <button
            type="button"
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-black/5 hover:text-neutral-800"
            aria-label="Close"
            onClick={onCancel}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={20} strokeWidth={1.75} />
          </button>
        </div>

        <div className="border-b border-black/10 px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-[var(--text)]">Aspect ratio</span>
            <span className="text-xs font-medium text-neutral-500">Image rotation</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {ASPECT_PRESETS.map(preset => {
              const ratio = resolvePresetRatio(preset, natural, initialFrame)
              const active = aspectPresetId === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={[
                    'flex min-w-[5.75rem] flex-col items-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-semibold outline-none',
                    'hover:bg-black/[0.03] focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40',
                    active
                      ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,white)] text-neutral-950 shadow-[0_0_0_2px_color-mix(in_srgb,var(--accent)_25%,transparent)]'
                      : 'border-neutral-200 bg-white text-neutral-700',
                  ].join(' ')}
                  title={preset.description}
                  aria-pressed={active}
                  onClick={() => chooseAspectPreset(preset)}
                >
                  <span className="flex h-7 items-center justify-center">
                    <AspectGlyph ratio={ratio} />
                  </span>
                  {preset.label}
                </button>
              )
            })}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
            <EditorRangeSlider
              min={ROTATION_MIN}
              max={ROTATION_MAX}
              step={1}
              value={crop.rotation}
              onChange={updateCropRotation}
              aria-label="Rotate image within crop"
              trackClassName="w-full"
            />
            <button
              type="button"
              className="h-10 rounded-lg border border-black/10 bg-white px-3 text-sm font-semibold text-neutral-800 hover:bg-black/[0.04]"
              onClick={() => updateCropRotation(0)}
            >
              Auto
            </button>
            <label className="flex h-10 min-w-[5rem] items-center rounded-lg border border-black/10 bg-white px-2">
              <span className="sr-only">Image rotation degrees</span>
              <input
                type="number"
                min={ROTATION_MIN}
                max={ROTATION_MAX}
                step={1}
                value={Math.round(crop.rotation)}
                className="min-w-0 flex-1 border-0 bg-transparent text-center text-sm font-medium outline-none"
                onChange={e => updateCropRotation(Number(e.target.value))}
              />
              <span className="text-xs font-medium text-neutral-500">°</span>
            </label>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[#d5d9e2] p-4">
          <div ref={wrapRef} className="relative mx-auto inline-block max-w-full">
            <img
              key={imageSrc}
              ref={imgRef}
              src={imageSrc}
              alt=""
              className="block max-h-[55vh] max-w-full object-contain"
              style={imageStyle}
              draggable={false}
              onLoad={onImgLoad}
            />
            {imgReady ? (
              <div className="pointer-events-none absolute inset-0">
                <div
                  className="pointer-events-auto absolute z-[1] cursor-move border-2 border-[var(--accent)] shadow-[0_0_0_9999px_rgba(0,0,0,0.52)]"
                  style={boxStyle}
                  onPointerDown={e => onPointerDownCrop(e, 'move')}
                >
                  <div
                    className="pointer-events-none absolute inset-0 opacity-70"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.8) 1px, transparent 1px)',
                      backgroundSize: '33.333% 100%, 100% 33.333%',
                    }}
                    aria-hidden
                  />
                  {handle('nw', 'left-0 top-0 cursor-nwse-resize')}
                  {handle('n', 'left-1/2 top-0 -translate-x-1/2 cursor-ns-resize')}
                  {handle('ne', 'right-0 top-0 cursor-nesw-resize')}
                  {handle('e', 'right-0 top-1/2 -translate-y-1/2 cursor-ew-resize')}
                  {handle('se', 'right-0 bottom-0 cursor-nwse-resize')}
                  {handle('s', 'bottom-0 left-1/2 -translate-x-1/2 cursor-ns-resize')}
                  {handle('sw', 'bottom-0 left-0 cursor-nesw-resize')}
                  {handle('w', 'left-0 top-1/2 -translate-y-1/2 cursor-ew-resize')}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex justify-end gap-2.5 border-t border-black/10 px-4 py-3">
          <Button
            variant="secondary"
            size="md"
            className="h-11 !rounded-full px-5"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            disabled={!imgReady}
            variant="primary"
            size="md"
            className="h-11 !rounded-full px-5"
            onClick={applyCrop}
            iconBefore={<HugeiconsIcon icon={Tick02Icon} size={18} strokeWidth={1.75} />}
          >
            Apply crop
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
