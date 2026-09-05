import { describe, expect, it } from 'vitest'

import { ALLOWED_IMAGE_HOSTS, remoteImageUrl } from './images'
import nextConfig from '../../next.config.mjs'

describe('remoteImageUrl', () => {
  it('should keep an https url served by an allowed host', () => {
    expect(remoteImageUrl('https://lh3.googleusercontent.com/a/photo.jpg')).toBe(
      'https://lh3.googleusercontent.com/a/photo.jpg'
    )
  })

  it('should reject an unknown host, http and garbage', () => {
    expect(remoteImageUrl('https://evil.test/photo.jpg')).toBeNull()
    expect(remoteImageUrl('http://lh3.googleusercontent.com/a/photo.jpg')).toBeNull()
    expect(remoteImageUrl('not-an-url')).toBeNull()
  })

  it('should reject a host that only ends with an allowed one', () => {
    expect(remoteImageUrl('https://nottile.openstreetmap.org.evil.test/1.png')).toBeNull()
  })

  it('should treat absent values as no image', () => {
    expect(remoteImageUrl(null)).toBeNull()
    expect(remoteImageUrl(undefined)).toBeNull()
    expect(remoteImageUrl('')).toBeNull()
  })

  it('should stay in sync with the next/image remote patterns', () => {
    const patterns = nextConfig.images?.remotePatterns ?? []
    expect(patterns.every((pattern) => pattern.protocol === 'https')).toBe(true)
    expect(patterns.map((pattern) => pattern.hostname).sort()).toEqual(
      [...ALLOWED_IMAGE_HOSTS].sort()
    )
  })
})
