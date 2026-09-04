/**
 * auxweave-moodboard-layout.ts
 * Proportional layout engine for rendering Moodboards on their own dedicated Canvas Artboard.
 */

import type { Moodboard, MoodboardItem } from './auxweave-moodboard'
import type { SceneImage, SceneObject, SceneRect, SceneText } from './auxweave-scene'

export interface MoodboardCanvasLayout {
  artboard: { width: number; height: number }
  objects: SceneObject[]
}

function createTextObject(params: {
  id: string
  x: number
  y: number
  width: number
  height: number
  text: string
  fontSize: number
  fontWeight?: number | 'normal' | 'bold'
  color?: string
  opacity?: number
}): SceneText {
  return {
    id: params.id,
    type: 'text',
    x: params.x,
    y: params.y,
    width: params.width,
    height: params.height,
    rotation: 0,
    opacity: params.opacity ?? 1,
    visible: true,
    locked: true,
    name: 'Moodboard Text',
    blurPct: 0,
    shadow: null,
    text: params.text,
    fontSize: params.fontSize,
    fontFamily: 'Inter, system-ui, sans-serif',
    fontWeight: params.fontWeight ?? 'normal',
    fontStyle: 'normal',
    underline: false,
    textAlign: 'left',
    letterSpacing: 0,
    strokeWidth: 0,
    fill: { type: 'solid', color: params.color ?? '#FFFFFF' },
    stroke: { type: 'solid', color: 'transparent' },
  }
}

function createRectObject(params: {
  id: string
  x: number
  y: number
  width: number
  height: number
  fillColor: string
  cornerRadius?: number
  name?: string
}): SceneRect {
  return {
    id: params.id,
    type: 'rect',
    x: params.x,
    y: params.y,
    width: params.width,
    height: params.height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: params.name ?? 'Color Swatch',
    blurPct: 0,
    shadow: {
      color: 'rgba(0,0,0,0.25)',
      x: 0,
      y: 4,
      blur: 12,
    },
    cornerRadius: params.cornerRadius ?? 8,
    fill: { type: 'solid', color: params.fillColor },
    stroke: { type: 'solid', color: 'rgba(255,255,255,0.1)' },
    strokeWidth: 1,
  }
}

function createImageObject(params: {
  id: string
  x: number
  y: number
  width: number
  height: number
  url: string
  naturalWidth?: number
  naturalHeight?: number
  name?: string
}): SceneImage {
  const nw = params.naturalWidth || params.width
  const nh = params.naturalHeight || params.height
  return {
    id: params.id,
    type: 'image',
    x: params.x,
    y: params.y,
    width: params.width,
    height: params.height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    name: params.name ?? 'Moodboard Reference',
    blurPct: 0,
    shadow: {
      color: 'rgba(0,0,0,0.3)',
      x: 0,
      y: 8,
      blur: 24,
    },
    src: params.url,
    naturalWidth: nw,
    naturalHeight: nh,
    crop: {
      x: 0,
      y: 0,
      width: nw,
      height: nh,
      rotation: 0,
    },
    cornerRadius: 14,
  }
}

/**
 * Computes optimal proportional positions for a moodboard's reference images
 * on a dedicated canvas artboard.
 */
export function generateMoodboardCanvasPage(board: Moodboard): MoodboardCanvasLayout {
  const ARTBOARD_W = 1920
  const HEADER_H = 130
  const MARGIN_X = 64
  const AVAILABLE_W = ARTBOARD_W - MARGIN_X * 2

  const objects: SceneObject[] = []

  // 1. Header Typography
  objects.push(
    createTextObject({
      id: `mb-header-title-${board.id}`,
      x: MARGIN_X,
      y: 40,
      width: AVAILABLE_W,
      height: 38,
      text: `${board.name.toUpperCase()} // DESIGN MOODBOARD`,
      fontSize: 26,
      fontWeight: 'bold',
      color: '#F8FAFC',
    }),
  )

  objects.push(
    createTextObject({
      id: `mb-header-sub-${board.id}`,
      x: MARGIN_X,
      y: 80,
      width: AVAILABLE_W,
      height: 24,
      text: `${items.length} Visual Reference${items.length === 1 ? '' : 's'} • Context Reference for AI Co-Design Agent`,
      fontSize: 14,
      color: '#94A3B8',
    }),
  )

  // 2. Proportional Image Layout
  const contentStartY = HEADER_H
  let totalGridH = 800

  if (items.length === 0) {
    totalGridH = 400
    objects.push(
      createTextObject({
        id: `mb-empty-${board.id}`,
        x: MARGIN_X,
        y: contentStartY + 80,
        width: AVAILABLE_W,
        height: 60,
        text: 'No visual references yet. Upload images or paste URLs in the Moodboard Panel!',
        fontSize: 20,
        color: '#64748B',
      }),
    )
  } else if (items.length === 1) {
    // 1 Reference: Large Centered Hero
    const item = items[0]
    const naturalRatio = (item.width && item.height ? item.width / item.height : 1) || 1
    const maxHeroW = 1200
    const maxHeroH = 760

    let imgW = maxHeroW
    let imgH = imgW / naturalRatio
    if (imgH > maxHeroH) {
      imgH = maxHeroH
      imgW = imgH * naturalRatio
    }
    imgW = Math.round(imgW)
    imgH = Math.round(imgH)

    const imgX = Math.round((ARTBOARD_W - imgW) / 2)
    const imgY = contentStartY + 20
    totalGridH = imgH + 40

    objects.push(
      createImageObject({
        id: `mb-img-${item.id}`,
        x: imgX,
        y: imgY,
        width: imgW,
        height: imgH,
        url: item.url,
        naturalWidth: item.width,
        naturalHeight: item.height,
        name: item.title || 'Primary Reference',
      }),
    )
  } else if (items.length === 2) {
    // 2 References: Side-by-Side Dual Hero with balanced aspect ratios
    const gap = 48
    const colW = Math.round((AVAILABLE_W - gap) / 2)
    const maxColH = 740
    let maxH = 500

    items.forEach((item, index) => {
      const ratio = (item.width && item.height ? item.width / item.height : 1) || 1
      let imgW = colW
      let imgH = Math.round(imgW / ratio)
      if (imgH > maxColH) {
        imgH = maxColH
        imgW = Math.round(imgH * ratio)
      }
      if (imgH > maxH) maxH = imgH

      const x = MARGIN_X + index * (colW + gap) + Math.round((colW - imgW) / 2)
      const y = contentStartY + 20

      objects.push(
        createImageObject({
          id: `mb-img-${item.id}`,
          x,
          y,
          width: imgW,
          height: imgH,
          url: item.url,
          naturalWidth: item.width,
          naturalHeight: item.height,
          name: item.title || `Reference ${index + 1}`,
        }),
      )
    })
    totalGridH = maxH + 40
  } else if (items.length === 3) {
    // 3 References: Asymmetric Hero Left (60%) + 2 Stacked Right (40%)
    const gap = 36
    const heroW = Math.round(AVAILABLE_W * 0.58)
    const stackW = AVAILABLE_W - heroW - gap
    const totalH = 760
    totalGridH = totalH + 40

    // Main Hero Left
    const heroItem = items[0]
    objects.push(
      createImageObject({
        id: `mb-img-${heroItem.id}`,
        x: MARGIN_X,
        y: contentStartY + 20,
        width: heroW,
        height: totalH,
        url: heroItem.url,
        naturalWidth: heroItem.width,
        naturalHeight: heroItem.height,
        name: heroItem.title || 'Hero Reference',
      }),
    )

    // Stacked Right
    const stackH = Math.round((totalH - gap) / 2)
    const stackItems = items.slice(1, 3)
    stackItems.forEach((item, idx) => {
      const y = contentStartY + 20 + idx * (stackH + gap)
      objects.push(
        createImageObject({
          id: `mb-img-${item.id}`,
          x: MARGIN_X + heroW + gap,
          y,
          width: stackW,
          height: stackH,
          url: item.url,
          naturalWidth: item.width,
          naturalHeight: item.height,
          name: item.title || `Reference ${idx + 2}`,
        }),
      )
    })
  } else if (items.length === 4) {
    // 4 References: Balanced 2x2 Grid
    const gap = 36
    const colW = Math.round((AVAILABLE_W - gap) / 2)
    const rowH = 390
    totalGridH = rowH * 2 + gap + 40

    items.forEach((item, index) => {
      const col = index % 2
      const row = Math.floor(index / 2)
      const x = MARGIN_X + col * (colW + gap)
      const y = contentStartY + 20 + row * (rowH + gap)

      objects.push(
        createImageObject({
          id: `mb-img-${item.id}`,
          x,
          y,
          width: colW,
          height: rowH,
          url: item.url,
          naturalWidth: item.width,
          naturalHeight: item.height,
          name: item.title || `Reference ${index + 1}`,
        }),
      )
    })
  } else {
    // 5+ References: 3-Column Responsive Masonry Collage
    const gap = 32
    const cols = 3
    const colW = Math.round((AVAILABLE_W - gap * (cols - 1)) / cols)
    const defaultH = 340

    items.forEach((item, index) => {
      const col = index % cols
      const row = Math.floor(index / cols)
      const x = MARGIN_X + col * (colW + gap)
      const y = contentStartY + 20 + row * (defaultH + gap)

      objects.push(
        createImageObject({
          id: `mb-img-${item.id}`,
          x,
          y,
          width: colW,
          height: defaultH,
          url: item.url,
          naturalWidth: item.width,
          naturalHeight: item.height,
          name: item.title || `Reference ${index + 1}`,
        }),
      )
    })
    const numRows = Math.ceil(items.length / cols)
    totalGridH = numRows * (defaultH + gap) + 40
  }

  const finalArtboardH = Math.max(1080, contentStartY + totalGridH + 60)

  return {
    artboard: {
      width: ARTBOARD_W,
      height: finalArtboardH,
    },
    objects,
  }
}
