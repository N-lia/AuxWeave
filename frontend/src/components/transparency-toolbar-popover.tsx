import { TransparencyIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SceneBlendMode } from '../lib/auxweave-scene'
import { useViewportAwarePopoverPlacement } from '../hooks/use-viewport-aware-popover'
import EditorRangeSlider from './editor-range-slider'
import { floatingToolbarIconButton, floatingToolbarPopoverClass } from './floating-toolbar-shell'

const PANEL_ESTIMATE_H = 180

const BLEND_MODE_OPTIONS: { value: SceneBlendMode; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
  { value: 'hue', label: 'Hue' },
  { value: 'saturation', label: 'Saturation' },
  { value: 'color', label: 'Color' },
  { value: 'luminosity', label: 'Luminosity' },
]

type Props = {
  opacityPct: number
  fillOpacityPct?: number
  blendMode?: SceneBlendMode
  isolateGroup?: boolean
  onChange: (opacityPct: number) => void
  onFillOpacityChange?: (fillOpacityPct: number) => void
  onBlendModeChange?: (blendMode: SceneBlendMode) => void
  onIsolateGroupChange?: (isolate: boolean) => void
}

export default function TransparencyToolbarPopover({
  opacityPct,
  fillOpacityPct,
  blendMode = 'normal',
  isolateGroup = false,
  onChange,
  onFillOpacityChange,
  onBlendModeChange,
  onIsolateGroupChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pickPanel = useCallback(() => panelRef.current, [])
  const { openUpward, shiftX } = useViewportAwarePopoverPlacement(
    open,
    rootRef,
    PANEL_ESTIMATE_H,
    pickPanel,
    'center',
  )

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className={[floatingToolbarIconButton(open, { wide: true }), 'gap-1 px-2'].join(' ')}
        aria-label={`Transparency and Blend Mode, ${opacityPct}% ${blendMode}`}
        title="Transparency & Blend Mode"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(o => !o)}
      >
        <HugeiconsIcon icon={TransparencyIcon} size={18} strokeWidth={1.75} />
        <span className="min-w-[2.25rem] text-left text-xs font-medium tabular-nums text-neutral-700">
          {opacityPct}%
        </span>
      </button>
      {open ? (
        <div
          ref={panelRef}
          className={[
            'absolute left-1/2 z-[70] min-w-[16rem] p-3.5 space-y-3',
            openUpward ? 'bottom-full mb-2' : 'top-full mt-2',
            floatingToolbarPopoverClass,
          ].join(' ')}
          style={{
            transform: `translateX(calc(-50% + ${shiftX}px))`,
          }}
        >
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-[13px] font-medium text-neutral-800">Master Opacity</span>
              <span className="text-[13px] tabular-nums text-neutral-600">{opacityPct}%</span>
            </div>
            <EditorRangeSlider
              min={0}
              max={100}
              value={opacityPct}
              onChange={onChange}
              aria-label="Master Opacity"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={opacityPct}
              trackClassName="w-full"
            />
          </div>

          {onFillOpacityChange && fillOpacityPct !== undefined ? (
            <div className="border-t border-neutral-100 pt-2.5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-neutral-800">Fill Opacity</span>
                <span className="text-[13px] tabular-nums text-neutral-600">{fillOpacityPct}%</span>
              </div>
              <EditorRangeSlider
                min={0}
                max={100}
                value={fillOpacityPct}
                onChange={onFillOpacityChange}
                aria-label="Fill Opacity"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={fillOpacityPct}
                trackClassName="w-full"
              />
            </div>
          ) : null}

          {onBlendModeChange ? (
            <div className="border-t border-neutral-100 pt-2.5">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium text-neutral-800">Blend Mode</span>
              </div>
              <select
                value={blendMode}
                onChange={e => onBlendModeChange(e.target.value as SceneBlendMode)}
                className="w-full rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-800 outline-none focus:border-neutral-400 focus:bg-white"
              >
                {BLEND_MODE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {onIsolateGroupChange ? (
            <div className="border-t border-neutral-100 pt-2.5 flex items-center justify-between">
              <span className="text-[13px] font-medium text-neutral-800">Isolate Blending</span>
              <button
                type="button"
                role="switch"
                aria-checked={isolateGroup}
                onClick={() => onIsolateGroupChange(!isolateGroup)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  isolateGroup ? 'bg-neutral-900' : 'bg-neutral-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    isolateGroup ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

