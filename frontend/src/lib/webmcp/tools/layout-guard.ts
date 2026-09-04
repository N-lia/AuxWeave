/**
 * Layout enforcement guard for mutating WebMCP tools.
 * ---------------------------------------------------------------------------
 * Every canvas mutation flows through `withLayoutGuard`: after the mutation
 * succeeds, the live scene is re-validated and the report is merged into the
 * tool result the agent sees. When error-severity violations exist, one
 * automatic repair pass runs immediately and its outcome is reported too.
 * Warnings never trigger auto-mutation — the agent decides via repair_layout.
 *
 * Keeps responses token-bounded: inline reports carry at most 6 issues, the
 * full list stays available via validate_layout.
 */

export type GuardLayoutIssue = {
  code: string
  severity: 'error' | 'warning'
  message: string
  hint: string
  objectId?: string
}

export type GuardLayoutReport = {
  issueCount: number
  errorCount: number
  warningCount: number
  omittedCount: number
  issues: GuardLayoutIssue[]
}

export type GuardAutoRepairReport = {
  appliedCount: number
  fixes: unknown[]
  remaining: unknown[]
}

export type BridgePlacementResult = {
  objectId: string
  x: number
  y: number
  width: number
  height: number
}

export type ResolvedPlacement = {
  objectId: string | null
  x?: number
  y?: number
  width?: number
  height?: number
}

const MAX_INLINE_ISSUES = 6

/**
 * Tolerantly unpack a bridge placement receipt. Newer bridge builds return a
 * `{ objectId, x, y, width, height }` object; older ones return a bare id
 * string. Anything else means the creation failed.
 */
export function resolvePlacement(raw: unknown): ResolvedPlacement {
  if (typeof raw === 'string') return { objectId: raw }
  if (raw && typeof raw === 'object') {
    const r = raw as Partial<BridgePlacementResult>
    if (typeof r.objectId === 'string') {
      const box: ResolvedPlacement = { objectId: r.objectId }
      if (typeof r.x === 'number') box.x = Math.round(r.x)
      if (typeof r.y === 'number') box.y = Math.round(r.y)
      if (typeof r.width === 'number') box.width = Math.round(r.width)
      if (typeof r.height === 'number') box.height = Math.round(r.height)
      return box
    }
  }
  return { objectId: null }
}

async function callBridge<T>(name: string, args: unknown): Promise<T | null> {
  if (typeof window === 'undefined') return null
  const fn = (window as unknown as Record<string, unknown>)[name]
  if (typeof fn !== 'function') return null
  try {
    return (await (fn as (args: unknown) => Promise<T>)(args)) as T
  } catch {
    return null
  }
}

type ValidateBridgeResult = {
  success: boolean
  issueCount: number
  errorCount: number
  warningCount: number
  issues: GuardLayoutIssue[]
}

type RepairBridgeResult = {
  success: boolean
  appliedCount: number
  fixes: unknown[]
  remaining: unknown[]
}

/**
 * Validate the live scene and auto-repair error-severity violations once.
 * Never throws; degrades to null reports when the bridge is unavailable.
 */
export async function enforceLayoutGuard(): Promise<{
  layout: GuardLayoutReport | null
  autoRepair: GuardAutoRepairReport | null
}> {
  const validation = await callBridge<ValidateBridgeResult>(
    '__Auxweave_VALIDATE_LAYOUT__',
    undefined,
  )
  if (!validation || validation.success === false) {
    return { layout: null, autoRepair: null }
  }
  const issues = Array.isArray(validation.issues) ? validation.issues : []
  const layout: GuardLayoutReport = {
    issueCount: validation.issueCount,
    errorCount: validation.errorCount,
    warningCount: validation.warningCount,
    omittedCount: Math.max(0, issues.length - MAX_INLINE_ISSUES),
    issues: issues.slice(0, MAX_INLINE_ISSUES),
  }
  if (validation.errorCount <= 0) {
    return { layout, autoRepair: null }
  }
  const repair = await callBridge<RepairBridgeResult>('__Auxweave_REPAIR_LAYOUT__', {})
  if (!repair || repair.success === false) {
    return { layout, autoRepair: null }
  }
  return {
    layout,
    autoRepair: {
      appliedCount: repair.appliedCount,
      fixes: repair.fixes,
      remaining: repair.remaining,
    },
  }
}

/**
 * Merge a layout enforcement report into a successful tool result.
 * Failed results pass through untouched (the scene did not change).
 */
export async function withLayoutGuard<T extends Record<string, unknown>>(
  result: T,
): Promise<T & { layout?: GuardLayoutReport; autoRepair?: GuardAutoRepairReport }> {
  if (result.success === false) return result
  const guard = await enforceLayoutGuard()
  if (!guard.layout) return result
  return {
    ...result,
    layout: guard.layout,
    ...(guard.autoRepair ? { autoRepair: guard.autoRepair } : {}),
  }
}
