import { useCallback, useEffect, useRef, useState } from 'react'

export function hslToHex(h: number, s: number, l: number): string {
  const lNorm = l / 100
  const a = (s * Math.min(lNorm, 1 - lNorm)) / 100
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = lNorm - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

export function hsvToHex(h: number, s: number, v: number): string {
  const l = v - (v * s) / 200
  const m = Math.min(l, 100 - l)
  const hslS = m === 0 ? 0 : ((v - l) / m) * 100
  return hslToHex(h, hslS, l)
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  let c = hex.replace('#', '').trim()
  if (c.length === 3) c = c.split('').map(x => x + x).join('')
  if (c.length !== 6) return { h: 0, s: 100, v: 100 }
  const r = Number.parseInt(c.substring(0, 2), 16) / 255
  const g = Number.parseInt(c.substring(2, 4), 16) / 255
  const b = Number.parseInt(c.substring(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  const s = max === 0 ? 0 : d / max
  const v = max

  if (max !== min) {
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    v: Math.round(v * 100),
  }
}

type ColorPickerProps = {
  color: string
  onChange: (hex: string) => void
  className?: string
}

export default function ColorPicker({ color, onChange, className = '' }: ColorPickerProps) {
  const [hsv, setHsv] = useState(() => hexToHsv(color))
  const [hexDraft, setHexDraft] = useState(color)
  const spectrumRef = useRef<HTMLDivElement>(null)
  const isDraggingSpectrum = useRef(false)
  const nativeColorInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (color !== hexDraft) {
      setHexDraft(color)
      setHsv(hexToHsv(color))
    }
  }, [color])

  const updateHsv = useCallback(
    (newHsv: { h: number; s: number; v: number }) => {
      setHsv(newHsv)
      const hex = hsvToHex(newHsv.h, newHsv.s, newHsv.v)
      setHexDraft(hex)
      onChange(hex)
    },
    [onChange],
  )

  const handleSpectrumPointer = useCallback(
    (e: React.PointerEvent | PointerEvent) => {
      const el = spectrumRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
      const s = Math.round((x / rect.width) * 100)
      const v = Math.round((1 - y / rect.height) * 100)
      updateHsv({ ...hsv, s, v })
    },
    [hsv, updateHsv],
  )

  const onSpectrumPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    isDraggingSpectrum.current = true
    handleSpectrumPointer(e)

    const onMove = (me: PointerEvent) => {
      if (isDraggingSpectrum.current) {
        handleSpectrumPointer(me)
      }
    }

    const onUp = () => {
      isDraggingSpectrum.current = false
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const handleEyeDropper = async () => {
    if (typeof window !== 'undefined' && 'EyeDropper' in window) {
      try {
        const eyeDropper = new (window as any).EyeDropper()
        const result = await eyeDropper.open()
        if (result?.sRGBHex) {
          const hex = result.sRGBHex.toLowerCase()
          setHexDraft(hex)
          setHsv(hexToHsv(hex))
          onChange(hex)
        }
      } catch {
        // User canceled eyedropper
      }
    } else {
      nativeColorInputRef.current?.click()
    }
  }

  const pureHueColor = `hsl(${hsv.h}, 100%, 50%)`
  const handleX = `${hsv.s}%`
  const handleY = `${100 - hsv.v}%`

  const hasEyeDropperSupport = typeof window !== 'undefined' && 'EyeDropper' in window

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* 2D Saturation / Value Spectrum Box */}
      <div
        ref={spectrumRef}
        onPointerDown={onSpectrumPointerDown}
        className="relative h-32 w-full cursor-crosshair overflow-hidden rounded-lg border border-black/10 select-none shadow-inner"
        style={{ backgroundColor: pureHueColor }}
      >
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, #fff, transparent)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to top, #000, transparent)' }}
        />
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_2px_rgba(0,0,0,0.8)]"
          style={{ left: handleX, top: handleY, backgroundColor: hexDraft }}
        />
      </div>

      {/* Hue Rainbow Slider */}
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={360}
          value={hsv.h}
          onChange={e => updateHsv({ ...hsv, h: Number.parseInt(e.target.value, 10) })}
          className="h-3 w-full cursor-pointer appearance-none rounded-lg outline-none"
          style={{
            background:
              'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
          }}
          aria-label="Hue spectrum"
        />
      </div>

      {/* Hex Input & Screen Eyedropper Button */}
      <div className="flex items-center gap-2 rounded-lg border border-black/10 p-1.5 bg-neutral-50/70">
        <button
          type="button"
          onClick={() => nativeColorInputRef.current?.click()}
          className="h-7 w-7 shrink-0 rounded-md border border-black/15 shadow-sm outline-none transition hover:scale-105"
          style={{ backgroundColor: /^#[0-9A-Fa-f]{6}$/.test(hexDraft) ? hexDraft : '#ffffff' }}
          title="Native color picker"
        />
        <input
          ref={nativeColorInputRef}
          type="color"
          value={/^#[0-9A-Fa-f]{6}$/.test(hexDraft) ? hexDraft : '#ffffff'}
          onChange={e => {
            const hex = e.target.value
            setHexDraft(hex)
            setHsv(hexToHsv(hex))
            onChange(hex)
          }}
          className="sr-only"
          tabIndex={-1}
        />

        <input
          type="text"
          value={hexDraft}
          onChange={e => {
            const val = e.target.value
            setHexDraft(val)
            if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
              setHsv(hexToHsv(val))
              onChange(val)
            }
          }}
          onBlur={() => {
            if (/^#[0-9A-Fa-f]{6}$/.test(hexDraft)) {
              onChange(hexDraft)
            } else {
              setHexDraft(color)
            }
          }}
          className="min-w-0 flex-1 rounded bg-transparent px-2 py-1 font-mono text-xs font-semibold text-neutral-800 outline-none uppercase"
          placeholder="#000000"
          aria-label="Hex color value"
        />

        {/* Screen Eyedropper Tool */}
        <button
          type="button"
          onClick={handleEyeDropper}
          className="flex h-7 px-2 shrink-0 items-center justify-center gap-1 rounded border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 active:scale-95 transition text-[11px] font-medium shadow-2xs"
          title={
            hasEyeDropperSupport
              ? 'Sample any color from screen (EyeDropper)'
              : 'Pick color from screen'
          }
        >
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M19.35 4.65a3.5 3.5 0 0 0-4.95 0l-2.7 2.7 1.41 1.41 2.7-2.7a1.5 1.5 0 0 1 2.12 2.12l-2.7 2.7 1.41 1.41 2.7-2.7a3.5 3.5 0 0 0 0-4.94zM11.7 8.76 4 16.46V20h3.54l7.7-7.7-3.54-3.54z" />
          </svg>
          <span className="hidden sm:inline">Pick</span>
        </button>
      </div>
    </div>
  )
}
