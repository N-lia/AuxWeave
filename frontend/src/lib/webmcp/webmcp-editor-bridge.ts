/**
 * WebMCP Editor Bridge
 *
 * Registers all `window.__Auxweave_*` global bridge functions that WebMCP
 * tool execute-handlers call into. Call `mountWebMCPEditorBridge()` once
 * inside the SceneEditor component (via useEffect) and call the returned
 * teardown when the editor unmounts.
 *
 * Bridge functions registered:
 *  - __Auxweave_GET_STRUCTURED_STATE__  (already in scene-editor – kept here too for parity)
 *  - __Auxweave_GET_SELECTED_IDS__
 *  - __Auxweave_GET_DOC_META__
 *  - __Auxweave_ADD_SHAPE__
 *  - __Auxweave_ADD_TEXT__
 *  - __Auxweave_ADD_ICON__
 *  - __Auxweave_UPDATE_TRANSFORM__
 *  - __Auxweave_ALIGN_OBJECTS__
 *  - __Auxweave_APPLY_FILL__
 *  - __Auxweave_APPLY_PALETTE__
 *  - __Auxweave_ADD_PAGE__
 *  - __Auxweave_DUPLICATE_PAGE__
 *  - __Auxweave_EXPORT_RENDER__
 *  - __Auxweave_VALIDATE_LAYOUT__
 *  - __Auxweave_REPAIR_LAYOUT__
 *  - __Auxweave_APPLY_TEMPLATE__
 */

import type { BgValue } from '../../components/background-popover'
import { cloneIconSvg } from '../auxweave-icon'
import { loadImageMetadata } from '../auxweave-image-proxy'
import {
  type AuxweaveDocument,
  activateAuxweavePage,
  createEmptyAuxweaveDocument,
  createEmptyAuxweavePage,
  exportSceneStructuredState,
  getSelectionBounds,
  type SceneGroup,
  type SceneImage,
  type SceneObject,
} from '../auxweave-scene'
import { renderAuxweaveDocumentToDataUrl } from '../auxweave-scene-render'
import { getHugeiconsFreeCollection } from '../hugeicons-free-collection'
import { loadGoogleFontFamily } from '../load-google-font'
import { getFontPairing, getPalette, instantiatePosterTemplate } from './design-language'
import { type FlexContainerInput, solveFlexContainer } from './flex-layout-solver'
import {
  clampToArtboardBounds,
  computeRoleFontSize,
  repairLayout,
  resolveAnchorPlacement,
  resolveCollisionFreeY,
  solidFillColor,
  type TypographicRole,
  validateLayout,
} from './layout-engine'
import { registerAllAuxweaveWebMCPTools } from './webmcp-registry'

// ---------------------------------------------------------------------------
// Types matching the editor store slice we need
// ---------------------------------------------------------------------------

export interface EditorBridgeStore {
  getState: () => {
    doc: AuxweaveDocument
    selectedIds: string[]
    setDoc: (updater: (prev: AuxweaveDocument) => AuxweaveDocument) => void
    setSelectedIds: (ids: string[]) => void
  }
}

export interface EditorBridgeOptions {
  store: EditorBridgeStore
  /** Provided so export can resolve vector-board documents */
  getVectorBoardDocs: () => Record<string, unknown>
  placeImageObject?: (
    url: string,
    opts?: {
      x?: number
      y?: number
      width?: number
      height?: number
      origin?: 'center' | 'top-left'
    },
  ) => Promise<string | null>
}

// ---------------------------------------------------------------------------
// Helper: build a minimal default SceneObject base
// ---------------------------------------------------------------------------
function makeBase(overrides: Partial<SceneObject> & { type: SceneObject['type'] }): SceneObject {
  const id = crypto.randomUUID()
  return {
    id,
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    blurPct: 0,
    shadow: null,
    ...overrides,
  } as SceneObject
}

function solidFill(color: string | undefined): BgValue {
  return { type: 'solid', color: color ?? '#262626' }
}

/**
 * Placement receipt returned by every ADD_* bridge function so agents learn
 * the *actual* geometry (post collision-avoidance and clamping), not just an
 * ID. Without this the model's mental map of the canvas is wrong from the
 * first placement, and every later coordinate compounds the error.
 */
export type BridgePlacement = {
  objectId: string
  x: number
  y: number
  width: number
  height: number
}

function placeResult(obj: SceneObject): BridgePlacement {
  return {
    objectId: obj.id,
    x: Math.round(obj.x),
    y: Math.round(obj.y),
    width: Math.round(obj.width),
    height: Math.round(obj.height),
  }
}

// ---------------------------------------------------------------------------
// Mount / teardown
// ---------------------------------------------------------------------------
type AnyFn = (...args: any[]) => any

export function mountWebMCPEditorBridge(opts: EditorBridgeOptions): () => void {
  if (typeof window === 'undefined') return () => {}
  const win = window as unknown as Record<string, AnyFn | undefined>
  const { store, getVectorBoardDocs } = opts

  // ── Reads ────────────────────────────────────────────────────────────────

  win.__Auxweave_GET_STRUCTURED_STATE__ = () => {
    const { doc } = store.getState()
    return exportSceneStructuredState(doc.objects)
  }

  win.__Auxweave_GET_SELECTED_IDS__ = () => {
    return store.getState().selectedIds
  }

  win.__Auxweave_GET_DOC_META__ = () => {
    const { doc } = store.getState()
    const activePageIndex = doc.pages.findIndex(p => p.id === doc.activePageId)
    return {
      id: doc.activePageId,
      name: doc.pages[activePageIndex]?.name ?? 'Untitled',
      width: doc.artboard.width,
      height: doc.artboard.height,
      pageCount: doc.pages.length,
      activePageIndex: Math.max(0, activePageIndex),
    }
  }

  // ── Primitive Creation ───────────────────────────────────────────────────

  win.__Auxweave_ADD_SHAPE__ = (args: unknown) => {
    const input = args as {
      shapeKind: string
      x?: number
      y?: number
      width?: number
      height?: number
      fillColor?: string
      relativeTo?: 'previous' | string
      position?: 'below' | 'above' | 'inside'
      gap?: number
    }
    const { setDoc, setSelectedIds, doc } = store.getState()
    const artboardW = doc.artboard.width
    const artboardH = doc.artboard.height
    const kind = input.shapeKind
    const isLineOrArrow = kind === 'line' || kind === 'arrow'

    // Proportional, prominent sizing relative to canvas dimensions
    const defaultShapeSize = Math.round(Math.min(artboardW, artboardH) * 0.35)
    const defaultLineW = Math.round(artboardW * 0.45)
    const defaultLineH = Math.max(24, Math.round(artboardH * 0.08))

    const w = input.width ?? (isLineOrArrow ? defaultLineW : defaultShapeSize)
    const h = input.height ?? (isLineOrArrow ? defaultLineH : defaultShapeSize)

    let x = input.x
    let y = input.y

    if (input.relativeTo) {
      const anchored = resolveAnchorPlacement(
        input.relativeTo,
        { width: w, height: h },
        doc.objects,
        artboardW,
        artboardH,
        {
          position: input.position ?? 'below',
          gap: input.gap,
        },
      )
      if (anchored) {
        x = anchored.x
        y = anchored.y
      }
    }

    if (x === undefined) x = Math.round(artboardW / 2 - w / 2)
    if (y === undefined) y = Math.round(artboardH / 2 - h / 2)

    // Enforce spatial bounds: prevent elements from running off-screen
    const isFullBleed =
      (w >= artboardW * 0.92 && h >= artboardH * 0.92) ||
      (x === 0 && y === 0 && w >= artboardW * 0.9)
    const clamped = clampToArtboardBounds(
      { x: x!, y: y!, width: w, height: h },
      artboardW,
      artboardH,
      isFullBleed,
    )
    const finalX = clamped.x
    const finalY = clamped.y
    const finalW = clamped.width
    const finalH = clamped.height

    const fill = solidFill(
      input.fillColor ?? (input as { fill?: string }).fill ?? (input as { color?: string }).color,
    )
    const stroke: BgValue = { type: 'solid', color: 'transparent' }

    let obj: SceneObject | null = null

    if (kind === 'rectangle') {
      obj = makeBase({
        type: 'rect',
        x: finalX,
        y: finalY,
        width: finalW,
        height: finalH,
        fill,
        stroke,
        strokeWidth: 0,
        cornerRadius: Math.round(finalW * 0.04),
      })
    } else if (kind === 'circle') {
      obj = makeBase({
        type: 'ellipse',
        x: finalX,
        y: finalY,
        width: finalW,
        height: finalH,
        fill,
        stroke,
        strokeWidth: 0,
      })
    } else if (kind === 'polygon') {
      obj = makeBase({
        type: 'polygon',
        x: finalX,
        y: finalY,
        width: finalW,
        height: finalH,
        fill,
        stroke,
        strokeWidth: 0,
        sides: 6,
      })
    } else if (kind === 'star') {
      obj = makeBase({
        type: 'star',
        x: finalX,
        y: finalY,
        width: finalW,
        height: finalH,
        fill,
        stroke,
        strokeWidth: 0,
        points: 5,
      })
    } else if (kind === 'line') {
      const strokeLine: BgValue = { type: 'solid', color: input.fillColor ?? '#262626' }
      obj = makeBase({
        type: 'line',
        x: finalX,
        y: finalY,
        width: finalW,
        height: Math.max(24, finalH),
        stroke: strokeLine,
        strokeWidth: 6,
        lineStyle: 'solid',
        roundedEnds: true,
      })
    } else if (kind === 'arrow') {
      const strokeArrow: BgValue = { type: 'solid', color: input.fillColor ?? '#262626' }
      obj = makeBase({
        type: 'arrow',
        x: finalX,
        y: finalY,
        width: finalW,
        height: Math.max(24, finalH),
        stroke: strokeArrow,
        strokeWidth: 6,
        lineStyle: 'solid',
        roundedEnds: true,
        pathType: 'straight',
        headSize: 1,
        curveBulge: 0,
        curveT: 0.5,
      })
    }

    if (!obj) return null
    setDoc(prev => ({ ...prev, objects: [...prev.objects, obj!] }))
    setSelectedIds([obj.id])
    return placeResult(obj)
  }

  win.__Auxweave_ADD_TEXT__ = (args: unknown) => {
    const input = args as {
      text: string
      x?: number
      y?: number
      width?: number
      textAlign?: 'left' | 'center' | 'right'
      role?: TypographicRole
      relativeTo?: 'previous' | string
      position?: 'below' | 'above' | 'inside'
      gap?: number
      fontSize?: number
      fontFamily?: string
      fillColor?: string
    }
    const { setDoc, setSelectedIds, doc } = store.getState()
    const artboardW = doc.artboard.width
    const artboardH = doc.artboard.height

    // 1. Context-Aware Modular Typographic Scale based on role
    const { fontSize, weight } = computeRoleFontSize(
      input.role,
      artboardW,
      artboardH,
      input.fontSize,
    )

    // 2. Proportionally sized text container with boundary protection
    let w: number
    if (input.width && input.width > 0) {
      w = Math.min(input.width, artboardW)
    } else {
      const naturalW = Math.round(input.text.length * fontSize * 0.6)
      if (input.role === 'badge') {
        w = Math.min(Math.round(artboardW * 0.45), Math.max(80, naturalW + 24))
      } else {
        const defaultMaxW = Math.round(artboardW * (input.role === 'body' ? 0.8 : 0.9))
        w = Math.min(defaultMaxW, Math.max(140, naturalW))
      }
    }

    // Calculate realistic height based on line breaks and wrapping
    const explicitLines = input.text.split(/\r?\n/).length
    const approxCharsPerLine = Math.max(1, Math.floor(w / (fontSize * 0.55)))
    const wrappedLines = Math.ceil(input.text.length / approxCharsPerLine)
    const lineCount = Math.max(explicitLines, wrappedLines, 1)
    const h = Math.round(lineCount * fontSize * 1.35)

    // 3. Anchor or Stacking Placement
    let x = input.x
    let y = input.y

    if (input.relativeTo) {
      const anchored = resolveAnchorPlacement(
        input.relativeTo,
        { width: w, height: h },
        doc.objects,
        artboardW,
        artboardH,
        {
          position: input.position ?? 'below',
          gap: input.gap,
        },
      )
      if (anchored) {
        x = anchored.x
        y = anchored.y
      }
    }

    if (x === undefined) {
      x = Math.round(artboardW / 2 - w / 2)
    }

    if (y === undefined) {
      const initialY =
        input.role === 'badge'
          ? Math.round(artboardH * 0.12)
          : input.role === 'headline'
            ? Math.round(artboardH * 0.18)
            : Math.round(artboardH * 0.3)
      y = resolveCollisionFreeY(
        { x, y: initialY, width: w, height: h },
        doc.objects,
        artboardW,
        artboardH,
        input.gap,
      )
    } else {
      y = resolveCollisionFreeY(
        { x, y, width: w, height: h },
        doc.objects,
        artboardW,
        artboardH,
        input.gap,
      )
    }

    // 4. Enforce strict spatial clamping: text must never bleed off-screen
    const clamped = clampToArtboardBounds(
      { x, y, width: w, height: h },
      artboardW,
      artboardH,
      false,
    )
    const finalX = clamped.x
    const finalY = clamped.y
    const finalW = clamped.width
    const finalH = clamped.height

    const fontFamily = input.fontFamily ?? 'Inter'
    if (fontFamily) {
      loadGoogleFontFamily(fontFamily)
    }

    const defaultAlign =
      input.role === 'headline' || input.role === 'badge'
        ? 'center'
        : input.x !== undefined
          ? 'left'
          : 'center'
    const textAlign = input.textAlign ?? defaultAlign

    const obj: SceneObject = makeBase({
      type: 'text',
      x: finalX,
      y: finalY,
      width: finalW,
      height: finalH,
      text: input.text,
      fill: solidFill(
        input.fillColor ??
          (input as { fill?: string }).fill ??
          (input as { color?: string }).color ??
          '#FFFFFF',
      ),
      stroke: { type: 'solid', color: 'transparent' },
      strokeWidth: 0,
      fontFamily,
      fontSize,
      letterSpacing: 0,
      lineHeight: 1.22,
      fontWeight: weight,
      fontStyle: 'normal',
      underline: false,
      textAlign,
    })

    setDoc(prev => ({ ...prev, objects: [...prev.objects, obj] }))
    setSelectedIds([obj.id])
    return placeResult(obj)
  }

  win.__Auxweave_ADD_ICON__ = (args: unknown) => {
    const input = args as {
      iconName: string
      x?: number
      y?: number
      size?: number
      color?: string
      relativeTo?: 'previous' | string
      position?: 'below' | 'above' | 'inside'
      gap?: number
    }
    const { setDoc, setSelectedIds, doc } = store.getState()
    const artboardW = doc.artboard.width
    const artboardH = doc.artboard.height
    const size =
      input.size ?? Math.round(Math.max(128, Math.min(512, Math.min(artboardW, artboardH) * 0.18)))

    let x = input.x
    let y = input.y

    if (input.relativeTo) {
      const anchored = resolveAnchorPlacement(
        input.relativeTo,
        { width: size, height: size },
        doc.objects,
        artboardW,
        artboardH,
        {
          position: input.position ?? 'below',
          gap: input.gap,
        },
      )
      if (anchored) {
        x = anchored.x
        y = anchored.y
      }
    }

    if (x === undefined) x = Math.round(artboardW / 2 - size / 2)
    if (y === undefined) {
      y = resolveCollisionFreeY(
        { x, y: Math.round(artboardH / 2 - size / 2), width: size, height: size },
        doc.objects,
        artboardW,
        artboardH,
        input.gap,
      )
    } else {
      y = resolveCollisionFreeY(
        { x, y, width: size, height: size },
        doc.objects,
        artboardW,
        artboardH,
        input.gap,
      )
    }

    const clamped = clampToArtboardBounds(
      { x, y, width: size, height: size },
      artboardW,
      artboardH,
      false,
    )
    const finalX = clamped.x
    const finalY = clamped.y
    const finalSize = clamped.width

    // Look up the icon SVG from the free collection with fuzzy/keyword search
    const collection = getHugeiconsFreeCollection()
    const query = input.iconName.trim().toLowerCase()

    let iconItem =
      collection.find(item => item.name.toLowerCase() === query) ||
      collection.find(item => item.label.toLowerCase() === query) ||
      collection.find(item => item.keywords.includes(query)) ||
      collection.find(
        item => item.name.toLowerCase().includes(query) || item.label.toLowerCase().includes(query),
      )

    if (!iconItem && collection.length > 0) {
      console.warn(
        `[WebMCP] Icon '${input.iconName}' not found. Falling back to default icon '${collection[0]?.name}'.`,
      )
      iconItem = collection[0]
    }

    if (!iconItem) {
      return null
    }

    const obj: SceneObject = makeBase({
      type: 'icon',
      x: finalX,
      y: finalY,
      width: finalSize,
      height: finalSize,
      name: iconItem.label,
      iconName: iconItem.name,
      svg: cloneIconSvg(iconItem.svg),
      fill: solidFill(input.color ?? '#262626'),
      strokeWidth: 1.5,
    })

    setDoc(prev => ({ ...prev, objects: [...prev.objects, obj] }))
    setSelectedIds([obj.id])
    return placeResult(obj)
  }

  win.__Auxweave_ADD_IMAGE__ = async (args: unknown) => {
    const input = args as {
      url: string
      x?: number
      y?: number
      width?: number
      height?: number
      relativeTo?: 'previous' | string
      position?: 'below' | 'above' | 'inside'
      gap?: number
    }
    if (!input?.url) return null

    const { setDoc, setSelectedIds, doc } = store.getState()
    const artboardW = doc.artboard.width
    const artboardH = doc.artboard.height

    try {
      const meta = await loadImageMetadata(input.url)
      let width = input.width
      let height = input.height

      if (!width && !height) {
        // Proportional, prominent sizing: 55% of artboard dimensions
        const targetBoxW = Math.round(artboardW * 0.55)
        const targetBoxH = Math.round(artboardH * 0.55)
        const scale = Math.min(targetBoxW / meta.naturalWidth, targetBoxH / meta.naturalHeight)
        width = Math.max(48, Math.round(meta.naturalWidth * scale))
        height = Math.max(48, Math.round(meta.naturalHeight * scale))
      } else if (width && !height) {
        height = Math.round((meta.naturalHeight / meta.naturalWidth) * width)
      } else if (!width && height) {
        width = Math.round((meta.naturalWidth / meta.naturalHeight) * height)
      }

      width = Math.max(24, width!)
      height = Math.max(24, height!)

      let x = input.x
      let y = input.y

      if (input.relativeTo) {
        const anchored = resolveAnchorPlacement(
          input.relativeTo,
          { width, height },
          doc.objects,
          artboardW,
          artboardH,
          {
            position: input.position ?? 'below',
            gap: input.gap,
          },
        )
        if (anchored) {
          x = anchored.x
          y = anchored.y
        }
      }

      if (x === undefined) x = Math.round(artboardW / 2 - width / 2)
      if (y === undefined) {
        y = resolveCollisionFreeY(
          { x, y: Math.round(artboardH / 2 - height / 2), width, height },
          doc.objects,
          artboardW,
          artboardH,
          input.gap,
        )
      } else {
        y = resolveCollisionFreeY(
          { x, y, width, height },
          doc.objects,
          artboardW,
          artboardH,
          input.gap,
        )
      }

      const isFullBleed =
        (width >= artboardW * 0.92 && height >= artboardH * 0.92) ||
        (x === 0 && y === 0 && width >= artboardW * 0.9)
      const clamped = clampToArtboardBounds(
        { x, y, width, height },
        artboardW,
        artboardH,
        isFullBleed,
      )
      const finalX = clamped.x
      const finalY = clamped.y
      const finalW = clamped.width
      const finalH = clamped.height

      if (opts.placeImageObject) {
        return await opts.placeImageObject(input.url, {
          x: finalX,
          y: finalY,
          width: finalW,
          height: finalH,
          origin: 'top-left',
        })
      }

      const obj: SceneImage = {
        id: crypto.randomUUID(),
        type: 'image',
        x: finalX,
        y: finalY,
        width: finalW,
        height: finalH,
        rotation: 0,
        opacity: 1,
        visible: true,
        locked: false,
        blurPct: 0,
        shadow: null,
        src: meta.src,
        naturalWidth: meta.naturalWidth,
        naturalHeight: meta.naturalHeight,
        crop: {
          x: 0,
          y: 0,
          width: meta.naturalWidth,
          height: meta.naturalHeight,
          rotation: 0,
        },
        cornerRadius: 0,
      }

      setDoc(prev => ({ ...prev, objects: [...prev.objects, obj] }))
      setSelectedIds([obj.id])
      return placeResult(obj)
    } catch (err) {
      console.error('[WebMCP] Failed to add image:', err)
      return null
    }
  }

  // ── Transform & Align ────────────────────────────────────────────────────

  win.__Auxweave_UPDATE_TRANSFORM__ = (args: unknown) => {
    const input = args as {
      objectId: string
      x?: number
      y?: number
      width?: number
      height?: number
      rotation?: number
    }
    const { setDoc, doc } = store.getState()
    const artboardW = doc.artboard.width
    const artboardH = doc.artboard.height
    let found = false
    setDoc(prev => ({
      ...prev,
      objects: prev.objects.map(obj => {
        if (obj.id !== input.objectId) return obj
        found = true
        const w = input.width !== undefined ? Math.max(1, input.width) : obj.width
        const h = input.height !== undefined ? Math.max(1, input.height) : obj.height
        const rawX = input.x !== undefined ? input.x : obj.x
        const rawY = input.y !== undefined ? input.y : obj.y
        const isFullBleed =
          (w >= artboardW * 0.92 && h >= artboardH * 0.92) ||
          (rawX === 0 && rawY === 0 && w >= artboardW * 0.9)
        const clamped = clampToArtboardBounds(
          { x: rawX, y: rawY, width: w, height: h },
          artboardW,
          artboardH,
          isFullBleed,
        )
        return {
          ...obj,
          x: clamped.x,
          y: clamped.y,
          width: clamped.width,
          height: clamped.height,
          ...(input.rotation !== undefined ? { rotation: input.rotation } : {}),
        }
      }),
    }))
    return found
  }

  win.__Auxweave_ALIGN_OBJECTS__ = (args: unknown) => {
    const input = args as {
      alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'
      relativeTo?: 'selection' | 'artboard'
    }
    const { setDoc, selectedIds, doc } = store.getState()
    const targetIds = selectedIds.length > 0 ? selectedIds : doc.objects.map(o => o.id)
    if (targetIds.length === 0) return false

    const targets = doc.objects.filter(obj => targetIds.includes(obj.id))
    const relativeToArtboard = input.relativeTo === 'artboard' || targetIds.length === 1

    const refBounds = relativeToArtboard
      ? {
          left: 0,
          top: 0,
          right: doc.artboard.width,
          bottom: doc.artboard.height,
          width: doc.artboard.width,
          height: doc.artboard.height,
        }
      : (() => {
          const b = getSelectionBounds(targets)
          if (!b) return null
          return {
            left: b.left,
            top: b.top,
            right: b.left + b.width,
            bottom: b.top + b.height,
            width: b.width,
            height: b.height,
          }
        })()

    if (!refBounds) return false

    setDoc(prev => ({
      ...prev,
      objects: prev.objects.map(obj => {
        if (!targetIds.includes(obj.id)) return obj
        const next = { ...obj }
        switch (input.alignment) {
          case 'left':
            next.x = refBounds.left
            break
          case 'right':
            next.x = refBounds.right - obj.width
            break
          case 'center':
            next.x = refBounds.left + refBounds.width / 2 - obj.width / 2
            break
          case 'top':
            next.y = refBounds.top
            break
          case 'bottom':
            next.y = refBounds.bottom - obj.height
            break
          case 'middle':
            next.y = refBounds.top + refBounds.height / 2 - obj.height / 2
            break
        }
        return next
      }),
    }))
    return true
  }

  // ── Style ────────────────────────────────────────────────────────────────

  win.__Auxweave_APPLY_FILL__ = (args: unknown) => {
    const input = args as { objectId: string; color: string }
    const { setDoc } = store.getState()
    const fill: BgValue = { type: 'solid', color: input.color }
    let found = false
    setDoc(prev => ({
      ...prev,
      objects: prev.objects.map(obj => {
        if (obj.id !== input.objectId) return obj
        found = true
        if ('fill' in obj) return { ...obj, fill }
        if ('stroke' in obj) return { ...obj, stroke: fill }
        return obj
      }),
    }))
    return found
  }

  win.__Auxweave_APPLY_PALETTE__ = (args: unknown) => {
    const input = args as { colors: string[] }
    const { setDoc, selectedIds, doc } = store.getState()
    const targetIds = selectedIds.length > 0 ? selectedIds : doc.objects.map(o => o.id)
    if (targetIds.length === 0 || !input.colors?.length) return false
    let colorIndex = 0
    setDoc(prev => ({
      ...prev,
      objects: prev.objects.map(obj => {
        if (!targetIds.includes(obj.id)) return obj
        const color = input.colors[colorIndex % input.colors.length]!
        colorIndex++
        const fill: BgValue = { type: 'solid', color }
        if ('fill' in obj) return { ...obj, fill }
        if ('stroke' in obj) return { ...obj, stroke: fill }
        return obj
      }),
    }))
    return true
  }

  // ── Pages ────────────────────────────────────────────────────────────────

  win.__Auxweave_ADD_PAGE__ = (args: unknown) => {
    const input = (args ?? {}) as { name?: string; width?: number; height?: number }
    const { setDoc, doc } = store.getState()
    const activeIndex = doc.pages.findIndex(p => p.id === doc.activePageId)
    const sourcePage = activeIndex >= 0 ? doc.pages[activeIndex] : null
    const width = input.width ?? sourcePage?.artboard.width ?? doc.artboard.width
    const height = input.height ?? sourcePage?.artboard.height ?? doc.artboard.height
    const insertAt = activeIndex >= 0 ? activeIndex + 1 : doc.pages.length
    const nextPage = createEmptyAuxweavePage(width, height, input.name ?? `Page ${insertAt + 1}`)
    setDoc(prev => {
      const pages = [...prev.pages]
      pages.splice(insertAt, 0, nextPage)
      return activateAuxweavePage({ ...prev, pages }, nextPage.id)
    })
    return nextPage.id
  }

  win.__Auxweave_DUPLICATE_PAGE__ = () => {
    const { setDoc, doc } = store.getState()
    const activeIndex = doc.pages.findIndex(p => p.id === doc.activePageId)
    const activePage = activeIndex >= 0 ? doc.pages[activeIndex] : null
    if (!activePage) return null
    const newPage = createEmptyAuxweavePage(
      activePage.artboard.width,
      activePage.artboard.height,
      `${activePage.name} Copy`,
    )
    const clonedPage = {
      ...newPage,
      bg: activePage.bg,
      objects: activePage.objects.map(obj => ({ ...obj, id: crypto.randomUUID() })),
    }
    setDoc(prev => {
      const pages = [...prev.pages]
      pages.splice(activeIndex + 1, 0, clonedPage)
      return activateAuxweavePage({ ...prev, pages }, clonedPage.id)
    })
    return clonedPage.id
  }

  // ── Export ───────────────────────────────────────────────────────────────

  win.__Auxweave_EXPORT_RENDER__ = async (args: unknown) => {
    const input = (args ?? {}) as { format?: 'png' | 'jpg' | 'webp' | 'svg'; scale?: 1 | 2 | 4 }
    const { doc } = store.getState()
    const format = input.format ?? 'png'
    const multiplier = input.scale ?? 2
    const vectorBoardDocs = getVectorBoardDocs() as Parameters<
      typeof renderAuxweaveDocumentToDataUrl
    >[1]
    const dataUrl = await renderAuxweaveDocumentToDataUrl(doc, vectorBoardDocs, {
      format: (format === 'svg' ? 'png' : format) as 'png' | 'jpg' | 'webp',
      multiplier,
      transparent: format === 'png',
    })
    return dataUrl
  }

  win.__Auxweave_REMOVE_OBJECT__ = (params: {
    objectId?: string
    name?: string
    removeSelected?: boolean
  }) => {
    const { doc, selectedIds, setDoc, setSelectedIds } = store.getState()
    let idsToRemove: string[] = []

    if (params.removeSelected && selectedIds.length > 0) {
      idsToRemove = [...selectedIds]
    } else if (params.objectId) {
      idsToRemove = [params.objectId]
    } else if (params.name) {
      const q = params.name.toLowerCase()
      const matching = doc.objects.filter(
        o =>
          o.name?.toLowerCase().includes(q) ||
          o.id === params.name ||
          (o.type === 'text' && (o as any).text?.toLowerCase().includes(q)),
      )
      idsToRemove = matching.map(o => o.id)
    }

    if (idsToRemove.length === 0) {
      return { success: false, removedCount: 0, message: 'No matching objects found to remove.' }
    }

    setDoc(prev => ({
      ...prev,
      objects: prev.objects.filter(o => !idsToRemove.includes(o.id)),
    }))

    setSelectedIds(selectedIds.filter(id => !idsToRemove.includes(id)))
    return { success: true, removedCount: idsToRemove.length, removedIds: idsToRemove }
  }

  // ── Layout intelligence: validate / repair / poster templates ──────────

  win.__Auxweave_VALIDATE_LAYOUT__ = () => {
    const { doc } = store.getState()
    const artboardBg = solidFillColor(doc.bg) ?? undefined
    const issues = validateLayout(doc.objects, doc.artboard.width, doc.artboard.height, {
      artboardBg,
    })
    return {
      success: true,
      artboard: { width: doc.artboard.width, height: doc.artboard.height },
      objectCount: doc.objects.length,
      issueCount: issues.length,
      errorCount: issues.filter(i => i.severity === 'error').length,
      warningCount: issues.filter(i => i.severity === 'warning').length,
      issues,
    }
  }

  win.__Auxweave_REPAIR_LAYOUT__ = (args: unknown) => {
    const input = (args ?? {}) as { fixTinyText?: boolean }
    const { setDoc, setSelectedIds, doc } = store.getState()
    const artboardBg = solidFillColor(doc.bg) ?? undefined
    const result = repairLayout(doc.objects, doc.artboard.width, doc.artboard.height, {
      artboardBg,
      fixTinyText: input.fixTinyText ?? true,
    })
    setDoc(() => ({ ...doc, objects: result.objects }))
    setSelectedIds(store.getState().selectedIds)
    return {
      success: true,
      appliedCount: result.fixes.length,
      fixes: result.fixes,
      remaining: result.remaining,
    }
  }

  win.__Auxweave_APPLY_TEMPLATE__ = (args: unknown) => {
    const input = (args ?? {}) as {
      template?: string
      palette?: string
      fontPairing?: string
      headline?: string
      badge?: string
      tagline?: string
      creditsLabel?: string
      credits?: string
      release?: string
      footer?: string
    }
    if (!input.headline?.trim()) return null
    const { setDoc, setSelectedIds, doc } = store.getState()
    const artboardW = doc.artboard.width
    const artboardH = doc.artboard.height
    const palette = getPalette(input.palette)
    const pairing = getFontPairing(input.fontPairing)
    loadGoogleFontFamily(pairing.display)
    loadGoogleFontFamily(pairing.body)

    const frames = instantiatePosterTemplate(
      input.template,
      {
        headline: input.headline,
        badge: input.badge,
        tagline: input.tagline,
        creditsLabel: input.creditsLabel,
        credits: input.credits,
        release: input.release,
        footer: input.footer,
      },
      artboardW,
      artboardH,
      { palette: palette.name, fontPairing: pairing.name },
    )

    const bgObjs: SceneObject[] = []
    const fgObjs: SceneObject[] = []
    for (const frame of frames) {
      const clamped = clampToArtboardBounds(
        frame.box,
        artboardW,
        artboardH,
        frame.key === 'background',
      )
      if (frame.key === 'background') {
        bgObjs.push(
          makeBase({
            type: 'rect',
            x: clamped.x,
            y: clamped.y,
            width: Math.max(1, clamped.width),
            height: Math.max(1, clamped.height),
            fill: solidFill(frame.color),
            stroke: { type: 'solid', color: 'transparent' },
            strokeWidth: 0,
            cornerRadius: 0,
          }),
        )
        continue
      }
      if (frame.key === 'divider') {
        fgObjs.push(
          makeBase({
            type: 'rect',
            x: clamped.x,
            y: clamped.y,
            width: Math.max(1, clamped.width),
            height: Math.max(1, clamped.height),
            fill: solidFill(frame.color),
            stroke: { type: 'solid', color: 'transparent' },
            strokeWidth: 0,
            cornerRadius: 0,
          }),
        )
        continue
      }
      const t = frame.type
      const isDisplay = t !== null && (t.role === 'headline' || t.role === 'subtitle')
      fgObjs.push(
        makeBase({
          type: 'text',
          x: clamped.x,
          y: clamped.y,
          width: Math.max(24, clamped.width),
          height: Math.max(24, clamped.height),
          text: frame.lines.join('\n'),
          fill: solidFill(frame.color),
          stroke: { type: 'solid', color: 'transparent' },
          strokeWidth: 0,
          fontFamily: isDisplay ? pairing.display : pairing.body,
          fontSize: t?.fontSize ?? 32,
          letterSpacing: 0,
          lineHeight: 1.22,
          fontWeight: t?.role === 'headline' || t?.role === 'badge' ? 'bold' : 'normal',
          fontStyle: 'normal',
          underline: false,
          textAlign: 'center',
        }),
      )
    }

    // Background anchors the bottom of the stack; template order otherwise preserved.
    const ordered = [...bgObjs, ...doc.objects, ...fgObjs]
    setDoc(prev => ({ ...prev, objects: ordered }))
    setSelectedIds(fgObjs.map(o => o.id))
    const created = [...bgObjs, ...fgObjs]
    const geometry = frames.map((f, i) => {
      const o = created[i]!
      return {
        key: f.key,
        objectId: o.id,
        x: Math.round(o.x),
        y: Math.round(o.y),
        width: Math.round(o.width),
        height: Math.round(o.height),
      }
    })
    const issues = validateLayout(ordered, artboardW, artboardH, {
      artboardBg: palette.background,
    })
    return {
      success: true,
      template: input.template ?? 'cinematic-portrait',
      palette: palette.name,
      fontPairing: pairing.name,
      preexistingCount: doc.objects.length,
      objectIds: created.map(o => o.id),
      slotKeys: frames.map(f => f.key),
      geometry,
      issueCount: issues.length,
      issues,
    }
  }

  // ── Web-Native Layout Primitives: Flex Containers ───────────────────────

  win.__Auxweave_CREATE_FLEX_CONTAINER__ = async (args: unknown) => {
    const input = (args ?? {}) as FlexContainerInput
    const { setDoc, setSelectedIds, doc } = store.getState()
    const artboardW = doc.artboard.width
    const artboardH = doc.artboard.height

    const solved = solveFlexContainer(input, { width: artboardW, height: artboardH })

    const groupChildren: SceneObject[] = []

    // 1. If container specifies background fill or stroke, add background card
    if (solved.fillColor || solved.strokeColor) {
      const bgCard = makeBase({
        type: 'rect',
        x: 0,
        y: 0,
        width: Math.max(1, solved.width),
        height: Math.max(1, solved.height),
        fill: solidFill(solved.fillColor ?? 'transparent'),
        stroke: { type: 'solid', color: solved.strokeColor ?? 'transparent' },
        strokeWidth: solved.strokeWidth ?? 0,
        cornerRadius: solved.cornerRadius ?? 0,
      })
      groupChildren.push(bgCard)
    }

    // 2. Convert solved children into SceneObjects with local container coordinates
    for (const childBox of solved.children) {
      const spec = childBox.spec
      const isText =
        spec.type === 'text' ||
        spec.type === 'headline' ||
        spec.type === 'subtitle' ||
        spec.type === 'body' ||
        spec.type === 'badge' ||
        spec.type === 'caption'

      if (isText) {
        const fontFamily = spec.fontFamily ?? 'Inter'
        if (fontFamily) loadGoogleFontFamily(fontFamily)
        const role: TypographicRole = spec.type === 'text' ? 'body' : (spec.type as TypographicRole)
        const { fontSize, weight } = computeRoleFontSize(role, artboardW, artboardH, spec.fontSize)
        const defaultAlign = role === 'headline' || role === 'badge' ? 'center' : 'left'
        const textAlign = spec.textAlign ?? defaultAlign

        const textObj = makeBase({
          type: 'text',
          x: childBox.x,
          y: childBox.y,
          width: Math.max(1, childBox.width),
          height: Math.max(1, childBox.height),
          text: spec.text || '',
          fill: solidFill(spec.fillColor ?? '#FFFFFF'),
          stroke: { type: 'solid', color: 'transparent' },
          strokeWidth: 0,
          fontFamily,
          fontSize,
          letterSpacing: 0,
          lineHeight: 1.22,
          fontWeight: spec.fontWeight ?? weight,
          fontStyle: 'normal',
          underline: false,
          textAlign,
        })
        groupChildren.push(textObj)
      } else if (spec.type === 'shape') {
        const kind = spec.shapeKind ?? 'rectangle'
        if (kind === 'circle') {
          groupChildren.push(
            makeBase({
              type: 'ellipse',
              x: childBox.x,
              y: childBox.y,
              width: Math.max(1, childBox.width),
              height: Math.max(1, childBox.height),
              fill: solidFill(spec.fillColor ?? '#7c3aed'),
              stroke: { type: 'solid', color: spec.strokeColor ?? 'transparent' },
              strokeWidth: spec.strokeWidth ?? 0,
            }),
          )
        } else {
          groupChildren.push(
            makeBase({
              type: 'rect',
              x: childBox.x,
              y: childBox.y,
              width: Math.max(1, childBox.width),
              height: Math.max(1, childBox.height),
              fill: solidFill(spec.fillColor ?? '#7c3aed'),
              stroke: { type: 'solid', color: spec.strokeColor ?? 'transparent' },
              strokeWidth: spec.strokeWidth ?? 0,
              cornerRadius: spec.cornerRadius ?? 8,
            }),
          )
        }
      } else if (spec.type === 'icon') {
        const collection = getHugeiconsFreeCollection()
        const query = (spec.iconName || 'sparkles').trim().toLowerCase()
        const iconItem =
          collection.find(i => i.name.toLowerCase() === query) ??
          collection.find(i => i.label.toLowerCase().includes(query)) ??
          collection[0]

        if (iconItem) {
          groupChildren.push(
            makeBase({
              type: 'icon',
              x: childBox.x,
              y: childBox.y,
              width: Math.max(1, childBox.width),
              height: Math.max(1, childBox.height),
              name: iconItem.label,
              iconName: iconItem.name,
              svg: cloneIconSvg(iconItem.svg),
              fill: solidFill(spec.fillColor ?? '#FFFFFF'),
            }),
          )
        }
      }
    }

    const groupObj: SceneGroup = makeBase({
      type: 'group',
      name: solved.name ?? 'Flex Container',
      x: solved.x,
      y: solved.y,
      width: Math.max(1, solved.width),
      height: Math.max(1, solved.height),
      children: groupChildren,
      flexLayout: {
        direction: solved.direction,
        justify: solved.justify,
        align: solved.align,
        gap: solved.gap,
        padding: solved.padding,
      },
    }) as SceneGroup

    setDoc(prev => ({ ...prev, objects: [...prev.objects, groupObj] }))
    setSelectedIds([groupObj.id])

    return {
      success: true,
      containerId: groupObj.id,
      childCount: groupChildren.length,
      x: Math.round(solved.x),
      y: Math.round(solved.y),
      width: Math.round(solved.width),
      height: Math.round(solved.height),
    }
  }

  win.__Auxweave_WRAP_IN_FLEX__ = async (args: unknown) => {
    const input = (args ?? {}) as {
      objectIds?: string[]
      direction?: 'column' | 'row'
      gap?: number
      padding?: number
      fillColor?: string
      cornerRadius?: number
    }
    const { setDoc, setSelectedIds, doc } = store.getState()
    const targetIds = new Set(input.objectIds || [])
    const targets = doc.objects.filter(o => targetIds.has(o.id))
    if (targets.length === 0) {
      return { success: false, error: 'No matching objects found to wrap' }
    }

    const direction = input.direction ?? 'row'
    const gap = input.gap ?? 16
    const padding = input.padding ?? 0
    const isCol = direction === 'column'

    const minX = Math.min(...targets.map(o => o.x))
    const minY = Math.min(...targets.map(o => o.y))

    let cursor = padding
    const reflowedChildren: SceneObject[] = []
    let totalW = 0
    let totalH = 0

    for (const obj of targets) {
      const cloned = { ...obj }
      if (isCol) {
        cloned.x = padding
        cloned.y = cursor
        cursor += cloned.height + gap
        totalW = Math.max(totalW, cloned.width)
      } else {
        cloned.x = cursor
        cloned.y = padding
        cursor += cloned.width + gap
        totalH = Math.max(totalH, cloned.height)
      }
      reflowedChildren.push(cloned)
    }

    totalW += padding * 2
    totalH += padding * 2
    if (isCol) totalH = Math.max(1, cursor - gap + padding)
    else totalW = Math.max(1, cursor - gap + padding)

    const bgChildren: SceneObject[] = []
    if (input.fillColor) {
      bgChildren.push(
        makeBase({
          type: 'rect',
          x: 0,
          y: 0,
          width: totalW,
          height: totalH,
          fill: solidFill(input.fillColor),
          stroke: { type: 'solid', color: 'transparent' },
          strokeWidth: 0,
          cornerRadius: input.cornerRadius ?? 8,
        }),
      )
    }

    const groupObj: SceneGroup = makeBase({
      type: 'group',
      name: 'Flex Container',
      x: minX,
      y: minY,
      width: totalW,
      height: totalH,
      children: [...bgChildren, ...reflowedChildren],
      flexLayout: {
        direction,
        gap,
        padding,
      },
    }) as SceneGroup

    setDoc(prev => ({
      ...prev,
      objects: [...prev.objects.filter(o => !targetIds.has(o.id)), groupObj],
    }))
    setSelectedIds([groupObj.id])

    return { success: true, groupId: groupObj.id, count: targets.length }
  }

  // ── Teardown ─────────────────────────────────────────────────────────────
  // Only remove the window globals. Tool registration on document.modelContext
  // is handled separately by ensureWebMCPToolsRegistered() which is idempotent
  // and immune to Strict Mode's double-invoke teardown.

  return () => {
    const KEYS: (keyof typeof win)[] = [
      '__Auxweave_GET_STRUCTURED_STATE__',
      '__Auxweave_GET_SELECTED_IDS__',
      '__Auxweave_GET_DOC_META__',
      '__Auxweave_ADD_SHAPE__',
      '__Auxweave_ADD_TEXT__',
      '__Auxweave_ADD_ICON__',
      '__Auxweave_ADD_IMAGE__',
      '__Auxweave_REMOVE_OBJECT__',
      '__Auxweave_UPDATE_TRANSFORM__',
      '__Auxweave_ALIGN_OBJECTS__',
      '__Auxweave_APPLY_FILL__',
      '__Auxweave_APPLY_PALETTE__',
      '__Auxweave_ADD_PAGE__',
      '__Auxweave_DUPLICATE_PAGE__',
      '__Auxweave_EXPORT_RENDER__',
      '__Auxweave_VALIDATE_LAYOUT__',
      '__Auxweave_REPAIR_LAYOUT__',
      '__Auxweave_APPLY_TEMPLATE__',
      '__Auxweave_CREATE_FLEX_CONTAINER__',
      '__Auxweave_WRAP_IN_FLEX__',
    ]
    for (const key of KEYS) {
      delete win[key]
    }
    // Re-install fallback bridge so WebMCP tools remain callable even when editor unmounts
    installFallbackEditorBridge()
  }
}

// ---------------------------------------------------------------------------
// Headless fallback canvas store
// Keeps all 17 canvas tools fully operable on non-editor routes (e.g. landing /)
// ---------------------------------------------------------------------------
let _fallbackDoc: AuxweaveDocument = createEmptyAuxweaveDocument(1080, 1080)
let _fallbackSelectedIds: string[] = []

export function installFallbackEditorBridge(): void {
  if (typeof window === 'undefined') return
  const win = window as unknown as Record<string, unknown>
  if (typeof win.__Auxweave_GET_STRUCTURED_STATE__ === 'function') return

  mountWebMCPEditorBridge({
    store: {
      getState: () => ({
        doc: _fallbackDoc,
        selectedIds: _fallbackSelectedIds,
        setDoc: updater => {
          _fallbackDoc = updater(_fallbackDoc)
        },
        setSelectedIds: ids => {
          _fallbackSelectedIds = ids
        },
      }),
    },
    getVectorBoardDocs: () => ({}),
  })
}

// Singleton guard — survives Strict Mode double-invoke but prevents re-registration
// on every render when vectorBoardDocs reference changes (which would trigger toolchange
// events → scene-editor re-renders → new vectorBoardDocs → infinite loop).
let _toolsRegistered = false

export function ensureWebMCPToolsRegistered(): void {
  if (_toolsRegistered) return
  _toolsRegistered = true
  void registerAllAuxweaveWebMCPTools()
}
