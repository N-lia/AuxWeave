import { describe, expect, it } from 'vitest'
import type { SceneGroup, SceneObject } from '../lib/auxweave-scene'
import {
  alignLayout,
  clampToArtboardBounds,
  contrastRatio,
  distributeLayout,
  dockLayout,
  findSpatialObjectById,
  flattenSpatialObjects,
  GRID_UNIT,
  gridLayout,
  intersectionArea,
  isContainerOrBackdrop,
  normalizeBox,
  overlapRatio,
  parseCssColor,
  regionBox,
  relativeLuminance,
  repairLayout,
  roundBox,
  SEMANTIC_REGIONS,
  safeFrame,
  snapToGrid,
  spacingRamp,
  stackLayout,
  unionBoxes,
  validateLayout,
} from '../lib/webmcp/layout-engine'

let idCounter = 0
const nextId = () => `test-${++idCounter}`

function makeRect(x: number, y: number, width: number, height: number): SceneObject {
  return {
    id: nextId(),
    type: 'rect',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    blurPct: 0,
    shadow: null,
    fill: { type: 'solid', color: '#E11D48' },
    stroke: { type: 'solid', color: 'transparent' },
    strokeWidth: 0,
    cornerRadius: 8,
  }
}

function makeText(
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  color = '#FFFFFF',
): SceneObject {
  return {
    id: nextId(),
    type: 'text',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    blurPct: 0,
    shadow: null,
    text: 'Hello',
    fill: { type: 'solid', color },
    stroke: { type: 'solid', color: 'transparent' },
    strokeWidth: 0,
    fontFamily: 'Inter',
    fontSize,
    letterSpacing: 0,
    lineHeight: 1.22,
    fontWeight: 'normal',
    fontStyle: 'normal',
    underline: false,
    textAlign: 'center',
  }
}

describe('deterministic geometry', () => {
  it('snaps to the grid and rounds boxes', () => {
    expect(snapToGrid(10)).toBe(8)
    expect(snapToGrid(13)).toBe(16)
    expect(snapToGrid(Number.NaN)).toBe(0)
    expect(roundBox({ x: 1.4, y: 2.5, width: 3.6, height: 4.1 })).toEqual({
      x: 1,
      y: 3,
      width: 4,
      height: 4,
    })
  })

  it('normalizes degenerate boxes without throwing', () => {
    expect(normalizeBox({ x: NaN, y: -5, width: 0, height: Infinity })).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })
  })

  it('computes unions, intersections, and overlap ratios', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 }
    const b = { x: 50, y: 50, width: 100, height: 100 }
    expect(unionBoxes([a, b])).toEqual({ x: 0, y: 0, width: 150, height: 150 })
    expect(unionBoxes([])).toEqual({ x: 0, y: 0, width: 0, height: 0 })
    expect(intersectionArea(a, b)).toBe(2500)
    expect(overlapRatio(a, b)).toBeCloseTo(0.25)
    expect(overlapRatio(a, { x: 500, y: 500, width: 10, height: 10 })).toBe(0)
  })

  it('derives a grid-snapped spacing ramp and safe frame', () => {
    const ramp = spacingRamp(1080)
    for (const v of Object.values(ramp)) expect(v % GRID_UNIT).toBe(0)
    expect(
      ramp.xs <= ramp.sm && ramp.sm <= ramp.md && ramp.md <= ramp.lg && ramp.lg <= ramp.xl,
    ).toBe(true)
    const frame = safeFrame(1080, 1350)
    expect(frame.x).toBeGreaterThan(0)
    expect(frame.x + frame.width).toBeLessThanOrEqual(1080)
    expect(frame.y + frame.height).toBeLessThanOrEqual(1350)
  })

  it('keeps clamping behavior backward compatible', () => {
    expect(
      clampToArtboardBounds({ x: 0, y: 0, width: 1080, height: 1350 }, 1080, 1350, true),
    ).toEqual({
      x: 0,
      y: 0,
      width: 1080,
      height: 1350,
    })
    const clamped = clampToArtboardBounds({ x: 1000, y: 1300, width: 200, height: 200 }, 1080, 1350)
    expect(clamped.x + clamped.width).toBeLessThanOrEqual(1080)
    expect(clamped.y + clamped.height).toBeLessThanOrEqual(1350)
  })
})

describe('semantic regions', () => {
  it('exposes every named region inside the artboard', () => {
    for (const W of [1080, 1920]) {
      for (const H of [1080, 1350]) {
        for (const region of SEMANTIC_REGIONS) {
          const box = regionBox(region, W, H)
          expect(box.x, `${region} x`).toBeGreaterThanOrEqual(0)
          expect(box.y, `${region} y`).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width, `${region} right`).toBeLessThanOrEqual(W)
          expect(box.y + box.height, `${region} bottom`).toBeLessThanOrEqual(H)
          expect(box.width, `${region} w`).toBeGreaterThan(0)
          expect(box.height, `${region} h`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('partitions header/hero/body/footer without gaps', () => {
    const W = 1080
    const H = 1350
    const header = regionBox('header', W, H)
    const hero = regionBox('hero', W, H)
    const body = regionBox('body', W, H)
    const footer = regionBox('footer', W, H)
    expect(hero.y).toBe(header.y + header.height)
    expect(body.y).toBe(hero.y + hero.height)
    expect(footer.y).toBe(body.y + body.height)
  })
})

describe('composition operators', () => {
  it('stacks boxes with fixed gaps and center alignment', () => {
    const out = stackLayout(
      [
        { x: 0, y: 0, width: 100, height: 50 },
        { x: 0, y: 0, width: 200, height: 30 },
      ],
      { direction: 'vertical', gap: 10, align: 'center', startX: 0, startY: 0 },
    )
    expect(out[0]).toMatchObject({ x: 50, y: 0 })
    expect(out[1]).toMatchObject({ x: 0, y: 60 })
  })

  it('distributes boxes evenly while pinning endpoints', () => {
    const out = distributeLayout(
      [
        { x: 0, y: 0, width: 100, height: 20 },
        { x: 300, y: 0, width: 100, height: 20 },
        { x: 900, y: 0, width: 100, height: 20 },
      ],
      { direction: 'horizontal' },
    )
    expect(out[0]!.x).toBe(0)
    expect(out[2]!.x).toBe(900)
    expect(out[1]!.x).toBe(450)
  })

  it('aligns and docks boxes deterministically', () => {
    const boxes = [
      { x: 0, y: 0, width: 100, height: 40 },
      { x: 300, y: 200, width: 60, height: 40 },
    ]
    const centered = alignLayout(boxes, 'center', { x: 0, y: 0, width: 1000, height: 1000 })
    expect(centered[0]!.x).toBe(450)
    expect(centered[1]!.x).toBe(470)
    const dockedRight = dockLayout(
      { x: 5, y: 5, width: 100, height: 50 },
      'right',
      { x: 0, y: 0, width: 1000, height: 800 },
      20,
    )
    expect(dockedRight.x).toBe(880)
    const dockedCenter = dockLayout({ x: 0, y: 0, width: 100, height: 50 }, 'center', {
      x: 0,
      y: 0,
      width: 1000,
      height: 800,
    })
    expect(dockedCenter).toMatchObject({ x: 450, y: 375 })
    const dockedBottom = dockLayout(
      { x: 5, y: 5, width: 100, height: 50 },
      'bottom',
      { x: 0, y: 0, width: 1000, height: 800 },
      20,
    )
    expect(dockedBottom.y).toBe(730)
  })

  it('splits containers into grids that stay inside', () => {
    const cells = gridLayout({ x: 0, y: 0, width: 1000, height: 500 }, 2, 3, 10)
    expect(cells).toHaveLength(6)
    for (const c of cells) {
      expect(c.x + c.width).toBeLessThanOrEqual(1000)
      expect(c.y + c.height).toBeLessThanOrEqual(500)
    }
  })

  it('is deterministic across repeated runs', () => {
    const boxes = [
      { x: 7, y: 3, width: 111, height: 57 },
      { x: 400, y: 900, width: 63, height: 200 },
    ]
    expect(stackLayout(boxes, { gap: 13 })).toEqual(stackLayout(boxes, { gap: 13 }))
    expect(alignLayout(boxes, 'middle')).toEqual(alignLayout(boxes, 'middle'))
  })
})

describe('color science', () => {
  it('parses hex/rgb/named colors and computes contrast', () => {
    expect(parseCssColor('#fff')).toEqual([255, 255, 255])
    expect(parseCssColor('#0B0F19')).toEqual([11, 15, 25])
    expect(parseCssColor('not-a-color')).toBeNull()
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1)
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21)
    expect(contrastRatio('#FFFFFF', '#0B0F19')).toBeGreaterThan(7)
  })
})

describe('validateLayout', () => {
  it('passes a clean scene', () => {
    const issues = validateLayout(
      [makeRect(0, 0, 1080, 1350), makeText(200, 200, 400, 60, 48, '#FFFFFF')],
      1080,
      1350,
      { artboardBg: '#0B0F19' },
    )
    expect(issues).toEqual([])
  })

  it('flags out-of-bounds as errors', () => {
    const obj = makeRect(1000, 1300, 400, 400)
    const issues = validateLayout([obj], 1080, 1350)
    expect(
      issues.some(
        i => i.code === 'out-of-bounds' && i.severity === 'error' && i.objectId === obj.id,
      ),
    ).toBe(true)
  })

  it('flags overlaps, tiny text, and low contrast as warnings', () => {
    const a = makeRect(100, 100, 300, 200)
    const b = makeRect(200, 150, 300, 200)
    const tiny = makeText(100, 500, 300, 40, 8, '#F8FAFC')
    const washed = makeText(100, 600, 300, 60, 48, '#3A4356')
    const issues = validateLayout([a, b, tiny, washed], 1080, 1350, { artboardBg: '#0B0F19' })
    const codes = issues.map(i => i.code)
    expect(codes).toContain('foreground-overlap')
    expect(codes).toContain('tiny-text')
    expect(codes).toContain('low-contrast')
    expect(issues.find(i => i.code === 'foreground-overlap')?.hint).toContain(b.id)
  })

  it('ignores full-bleed backdrops for margins and collisions', () => {
    const issues = validateLayout([makeRect(0, 0, 1080, 1350)], 1080, 1350)
    expect(issues).toEqual([])
  })
})

describe('repairLayout', () => {
  it('clears fixable violations and reports fixes', () => {
    const backdrop = makeRect(0, 0, 1080, 1350)
    const a = makeRect(100, 100, 300, 200)
    const b = makeRect(200, 150, 300, 200)
    const tiny = makeText(100, 900, 300, 40, 8, '#FFFFFF')
    const runaway = makeRect(900, 1200, 500, 400)
    const result = repairLayout([backdrop, a, b, tiny, runaway], 1080, 1350, {
      artboardBg: '#0B0F19',
    })
    expect(result.fixes.length).toBeGreaterThan(0)
    expect(result.remaining).toEqual([])
    // Backdrop never moved for collisions.
    const fixedBackdrop = result.objects.find(o => o.id === backdrop.id)!
    expect(fixedBackdrop.x).toBe(0)
    expect(fixedBackdrop.y).toBe(0)
    // Tiny text raised to the readability floor.
    const fixedTiny = result.objects.find(o => o.id === tiny.id)!
    expect(fixedTiny.type).toBe('text')
    if (fixedTiny.type === 'text') expect(fixedTiny.fontSize).toBeGreaterThanOrEqual(12)
    // Idempotent: a second repair finds nothing left to fix.
    const again = repairLayout(result.objects, 1080, 1350, { artboardBg: '#0B0F19' })
    expect(again.fixes).toEqual([])
    expect(again.remaining).toEqual([])
  })

  it('never deletes objects', () => {
    const objects = [makeRect(0, 0, 1080, 1350), makeRect(2000, 2000, 9000, 9000)]
    const result = repairLayout(objects, 1080, 1350)
    expect(result.objects).toHaveLength(objects.length)
    expect(result.objects.map(o => o.id).sort()).toEqual(objects.map(o => o.id).sort())
  })
})

function makeGroup(x: number, y: number, width: number, height: number, children: SceneObject[]): SceneGroup {
  return {
    id: nextId(),
    type: 'group',
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    blurPct: 0,
    shadow: null,
    children,
  }
}

describe('container-aware spatial layer', () => {
  it('treats covering groups as containers and small groups as foreground', () => {
    const covering = makeGroup(0, 0, 1080, 1350, [])
    const small = makeGroup(100, 100, 200, 150, [])
    expect(isContainerOrBackdrop(covering, 1080, 1350)).toBe(true)
    expect(isContainerOrBackdrop(small, 1080, 1350)).toBe(false)
    expect(
      isContainerOrBackdrop(small, 1080, 1350, { x: 120, y: 110, width: 40, height: 30 }),
    ).toBe(true)
  })

  it('flattens container groups to absolute child coords', () => {
    const child = makeText(10, 20, 300, 50, 32, '#FFFFFF')
    const group = makeGroup(500, 400, 1080, 1350, [child])
    const flat = flattenSpatialObjects([group], 1080, 1350)
    expect(flat).toHaveLength(1)
    expect(flat[0]).toMatchObject({ id: child.id, x: 510, y: 420 })
  })

  it('keeps small groups atomic when flattening', () => {
    const child = makeText(10, 20, 300, 50, 32, '#FFFFFF')
    const group = makeGroup(100, 100, 320, 200, [child])
    const flat = flattenSpatialObjects([group], 1080, 1350)
    expect(flat).toHaveLength(1)
    expect(flat[0]).toMatchObject({ id: group.id, x: 100, y: 100 })
  })

  it('finds nested objects by id', () => {
    const child = makeText(10, 20, 300, 50, 32, '#FFFFFF')
    const group = makeGroup(0, 0, 1080, 1350, [child])
    expect(findSpatialObjectById([group], child.id)?.id).toBe(child.id)
    expect(findSpatialObjectById([group], 'missing')).toBeNull()
  })

  it('does not flag container-contained composition as overlap', () => {
    const card = makeRect(100, 100, 500, 400)
    const label = makeText(150, 150, 200, 50, 32, '#FFFFFF')
    const issues = validateLayout([card, label], 1080, 1350, { artboardBg: '#0B0F19' })
    expect(issues.filter(i => i.code === 'foreground-overlap')).toEqual([])
  })

  it('validates flex children at absolute positions without false margins', () => {
    const child = makeText(10, 20, 300, 50, 32, '#FFFFFF')
    const group = makeGroup(500, 400, 1080, 1350, [child])
    const issues = validateLayout([group], 1080, 1350, { artboardBg: '#0B0F19' })
    // Child renders at (510,420) — no margin violation; group is a container.
    expect(issues).toEqual([])
  })

  it('repair never moves covering groups but moves colliding outsiders', () => {
    const child = makeRect(100, 100, 300, 200)
    const group = makeGroup(0, 0, 1080, 1350, [child])
    const outsider = makeRect(150, 150, 200, 100)
    const result = repairLayout([group, outsider], 1080, 1350)
    const fixedGroup = result.objects.find(o => o.id === group.id)!
    expect(fixedGroup.x).toBe(0)
    expect(fixedGroup.y).toBe(0)
    const fixedOutsider = result.objects.find(o => o.id === outsider.id)!
    // Outsider overlapped the flex child at absolute (100,100)-(400,300).
    expect(fixedOutsider.y).toBeGreaterThan(outsider.y)
    // Nested flex children untouched (same references, no drift).
    const fixedChild = (fixedGroup as SceneGroup).children[0]!
    expect(fixedChild.x).toBe(100)
    expect(fixedChild.y).toBe(100)
  })

  it('repair bumps nested tiny text to the readability floor', () => {
    const tiny = makeText(120, 120, 200, 30, 8, '#FFFFFF')
    const group = makeGroup(0, 0, 1080, 1350, [tiny])
    const result = repairLayout([group], 1080, 1350, { artboardBg: '#0B0F19' })
    const fixedChild = (result.objects.find(o => o.id === group.id) as SceneGroup).children[0]!
    expect(fixedChild.type).toBe('text')
    if (fixedChild.type === 'text') expect(fixedChild.fontSize).toBeGreaterThanOrEqual(12)
  })
})
