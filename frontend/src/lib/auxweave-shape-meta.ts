export type AuxweaveShapeKind = 'rect' | 'ellipse' | 'polygon' | 'star' | 'line' | 'arrow'

export type ArrowLineStyle = 'solid' | 'dashed' | 'dotted'

export type ArrowPathType = 'straight' | 'curved'

export type AuxweaveShapeMeta = {
  kind: AuxweaveShapeKind
  polygonSides?: number
  starPoints?: number
  arrowHead?: number
  arrowEndpoints?: { x1: number; y1: number; x2: number; y2: number }
  arrowStrokeWidth?: number
  arrowLineStyle?: ArrowLineStyle
  arrowRoundedEnds?: boolean
  arrowPathType?: ArrowPathType
  arrowCurveBulge?: number
  arrowCurveT?: number
}

type MaybeShapeMetaCarrier = {
  AuxweaveShape?: AuxweaveShapeMeta | null
}

export function getAuxweaveShapeMeta(
  obj: MaybeShapeMetaCarrier | undefined | null,
): AuxweaveShapeMeta | null {
  if (!obj) return null
  const meta = obj.AuxweaveShape
  return meta && typeof meta === 'object' && 'kind' in meta ? meta : null
}

export function setAuxweaveShapeMeta(obj: MaybeShapeMetaCarrier, meta: AuxweaveShapeMeta | null): void {
  obj.AuxweaveShape = meta
}

export function isAuxweaveStrokeLineLike(meta: AuxweaveShapeMeta | null | undefined): boolean {
  if (!meta) return false
  if (meta.kind === 'arrow') return true
  return meta.kind === 'line' && !!meta.arrowEndpoints && meta.arrowStrokeWidth != null
}

export function AuxweaveStrokeLineHeadFrac(meta: AuxweaveShapeMeta): number {
  return meta.kind === 'line' ? 0 : (meta.arrowHead ?? 1)
}
