import * as hugeiconsFree from '@hugeicons/core-free-icons?icon-collection'
import type { IconSvgElement } from '@hugeicons/react'

import { normalizeIconSvg, type SceneIconSvg } from './auxweave-icon'

export type HugeiconsFreeIconItem = {
  name: string
  label: string
  keywords: string
  icon: IconSvgElement
  svg: SceneIconSvg
}

let cachedCollection: HugeiconsFreeIconItem[] | null = null

function humanizeIconName(name: string): string {
  return name
    .replace(/Icon$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/\b0+(\d)\b/g, '$1')
    .trim()
}

export function getHugeiconsFreeCollection(): HugeiconsFreeIconItem[] {
  if (cachedCollection) return cachedCollection
  cachedCollection = Object.entries(hugeiconsFree)
    .flatMap(([name, value]) => {
      if (!name.endsWith('Icon') || !Array.isArray(value)) return []
      const svg = normalizeIconSvg(value)
      if (!svg) return []
      const label = humanizeIconName(name)
      return [
        {
          name,
          label,
          keywords: `${label} ${name}`.toLowerCase(),
          icon: value as IconSvgElement,
          svg,
        },
      ]
    })
    .sort((a, b) => a.label.localeCompare(b.label))
  return cachedCollection
}
