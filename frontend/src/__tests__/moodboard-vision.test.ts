import { describe, expect, it } from 'vitest'
import {
  endpointSupportsVision,
  selectVisionImages,
  toUserContent,
} from '../lib/webmcp/webmcp-bridge'

describe('endpointSupportsVision', () => {
  it('detects OpenAI-format vision endpoints', () => {
    expect(endpointSupportsVision('https://agentrouter.org/v1/chat/completions')).toBe(true)
    expect(endpointSupportsVision('https://openrouter.ai/api/v1/chat/completions')).toBe(true)
    expect(
      endpointSupportsVision(
        'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      ),
    ).toBe(true)
  })

  it('rejects unknown endpoints and empty strings', () => {
    expect(endpointSupportsVision('https://api.tokenfactory.nebius.com/v1/chat/completions')).toBe(
      false,
    )
    expect(endpointSupportsVision('')).toBe(false)
  })
})

describe('selectVisionImages', () => {
  const items = [
    { id: 'a', title: 'One', url: 'data:image/png;base64,AAA' },
    { id: 'b', title: 'Two', url: 'https://example.com/photo.jpg' },
    { id: 'dup', title: 'Dupe', url: 'data:image/png;base64,AAA' },
    { id: 'txt', title: 'NotAnImage', url: 'data:text/plain,hello' },
    { id: 'c', title: 'Three', url: 'data:image/jpeg;base64,BBB' },
  ]

  it('dedupes by URL, skips non-images, and caps the count', () => {
    expect(selectVisionImages(items, 10).map(i => i.id)).toEqual(['a', 'b', 'c'])
    expect(selectVisionImages(items, 2).map(i => i.id)).toEqual(['a', 'b'])
  })

  it('handles empty input', () => {
    expect(selectVisionImages([])).toEqual([])
  })
})

describe('toUserContent', () => {
  it('returns plain text when no images are attached', () => {
    expect(toUserContent('hello', [])).toBe('hello')
  })

  it('builds OpenAI vision content parts with images', () => {
    const content = toUserContent('look', [
      { id: 'a', title: 'One', url: 'data:image/png;base64,AAA' },
    ])
    expect(content).toEqual([
      { type: 'text', text: 'look' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
    ])
  })
})
