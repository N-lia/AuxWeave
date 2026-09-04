import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolvePlacement, withLayoutGuard } from '../lib/webmcp/tools/layout-guard'

function stubBridge(impl: Record<string, (args: unknown) => unknown>) {
  vi.stubGlobal('window', { ...impl })
}

afterEach(() => vi.unstubAllGlobals())

describe('withLayoutGuard', () => {
  it('merges a clean layout report without repairing', () => {
    const repair = vi.fn()
    stubBridge({
      __Auxweave_VALIDATE_LAYOUT__: () =>
        Promise.resolve({
          success: true,
          issueCount: 0,
          errorCount: 0,
          warningCount: 0,
          issues: [],
        }),
      __Auxweave_REPAIR_LAYOUT__: repair,
    })
    return withLayoutGuard({ success: true, objectId: 'obj-1' }).then(result => {
      expect(result.layout).toMatchObject({ issueCount: 0, errorCount: 0 })
      expect('autoRepair' in result).toBe(false)
      expect(repair).not.toHaveBeenCalled()
    })
  })

  it('auto-repairs once when errors exist, and caps inline issues', () => {
    const repair = vi.fn(() =>
      Promise.resolve({ success: true, appliedCount: 2, fixes: [{ a: 1 }], remaining: [] }),
    )
    stubBridge({
      __Auxweave_VALIDATE_LAYOUT__: () =>
        Promise.resolve({
          success: true,
          issueCount: 8,
          errorCount: 2,
          warningCount: 6,
          issues: Array.from({ length: 8 }, (_, i) => ({
            code: 'safe-margin',
            severity: i < 2 ? 'error' : 'warning',
            message: `issue ${i}`,
            hint: 'fix it',
          })),
        }),
      __Auxweave_REPAIR_LAYOUT__: repair,
    })
    return withLayoutGuard({ success: true }).then(result => {
      expect(repair).toHaveBeenCalledTimes(1)
      expect(result.layout?.omittedCount).toBe(2)
      expect(result.layout?.issues).toHaveLength(6)
      expect(result.autoRepair).toMatchObject({ appliedCount: 2 })
    })
  })

  it('skips repair for warnings only', () => {
    const repair = vi.fn()
    stubBridge({
      __Auxweave_VALIDATE_LAYOUT__: () =>
        Promise.resolve({
          success: true,
          issueCount: 1,
          errorCount: 0,
          warningCount: 1,
          issues: [{ code: 'safe-margin', severity: 'warning', message: 'm', hint: 'h' }],
        }),
      __Auxweave_REPAIR_LAYOUT__: repair,
    })
    return withLayoutGuard({ success: true }).then(result => {
      expect(repair).not.toHaveBeenCalled()
      expect(result.layout?.warningCount).toBe(1)
    })
  })

  it('passes failed results through without bridge calls', () => {
    const validate = vi.fn()
    stubBridge({ __Auxweave_VALIDATE_LAYOUT__: validate })
    const failed = { success: false, error: 'nope' }
    return withLayoutGuard(failed).then(result => {
      expect(result).toBe(failed)
      expect(validate).not.toHaveBeenCalled()
    })
  })

  it('degrades gracefully when the bridge is absent', () => {
    vi.stubGlobal('window', {})
    return withLayoutGuard({ success: true, objectId: 'x' }).then(result => {
      expect(result).toEqual({ success: true, objectId: 'x' })
    })
  })
})

describe('resolvePlacement', () => {
  it('unpacks the placement receipt object', () => {
    expect(
      resolvePlacement({ objectId: 'a', x: 10.6, y: 20.4, width: 100.2, height: 50.8 }),
    ).toEqual({ objectId: 'a', x: 11, y: 20, width: 100, height: 51 })
  })

  it('accepts legacy bare id strings', () => {
    expect(resolvePlacement('legacy-id')).toEqual({ objectId: 'legacy-id' })
  })

  it('maps null and garbage to a failed placement', () => {
    expect(resolvePlacement(null)).toEqual({ objectId: null })
    expect(resolvePlacement(undefined)).toEqual({ objectId: null })
    expect(resolvePlacement({ x: 1 })).toEqual({ objectId: null })
    expect(resolvePlacement(42)).toEqual({ objectId: null })
  })
})
