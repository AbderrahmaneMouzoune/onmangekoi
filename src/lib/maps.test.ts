import { describe, expect, it } from 'vitest'

import { directionsUrl, distanceMeters, formatDistance, parseGeoPoint, staticMap } from './maps'

/** Opéra Garnier, Paris */
const OPERA = { lat: 48.8719, lng: 2.3316 }

describe('parseGeoPoint', () => {
  it('should read a well-formed point', () => {
    expect(parseGeoPoint({ lat: 48.8719, lng: 2.3316 })).toEqual(OPERA)
  })

  it('should reject absent, malformed or out-of-range values', () => {
    expect(parseGeoPoint(null)).toBeNull()
    expect(parseGeoPoint({ lat: 91, lng: 0 })).toBeNull()
    expect(parseGeoPoint({ lat: 0, lng: 181 })).toBeNull()
    expect(parseGeoPoint({ lat: '48.87', lng: 2.33 })).toBeNull()
    expect(parseGeoPoint('48.87,2.33')).toBeNull()
  })
})

describe('distanceMeters', () => {
  it('should measure the walk from the Opéra to the Louvre pyramid', () => {
    const louvre = { lat: 48.8611, lng: 2.3358 }
    const distance = distanceMeters(OPERA, louvre)
    expect(distance).toBeGreaterThan(1150)
    expect(distance).toBeLessThan(1250)
  })

  it('should be symmetric and null on the same point', () => {
    const louvre = { lat: 48.8611, lng: 2.3358 }
    expect(distanceMeters(OPERA, louvre)).toBeCloseTo(distanceMeters(louvre, OPERA), 6)
    expect(distanceMeters(OPERA, OPERA)).toBe(0)
  })
})

describe('formatDistance', () => {
  it('should round to ten metres below a kilometre', () => {
    expect(formatDistance(347)).toBe('350 m')
    expect(formatDistance(4)).toBe('10 m')
    expect(formatDistance(999)).toBe('1000 m')
  })

  it('should switch to kilometres with one decimal, the French way', () => {
    expect(formatDistance(1000)).toBe('1 km')
    expect(formatDistance(1234)).toBe('1,2 km')
    expect(formatDistance(12_345)).toBe('12,3 km')
  })

  it('should stay silent on a distance that makes no sense', () => {
    expect(formatDistance(-1)).toBe('')
    expect(formatDistance(Number.NaN)).toBe('')
  })
})

describe('directionsUrl', () => {
  it('should prefer the coordinates over the address', () => {
    expect(directionsUrl({ name: 'Sakura', address: '12 rue de la Paix', location: OPERA })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=48.8719%2C2.3316'
    )
  })

  it('should fall back to name, address and city', () => {
    expect(directionsUrl({ name: 'Sakura', address: '12 rue de la Paix', city: 'Paris' })).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=Sakura%2C%2012%20rue%20de%20la%20Paix%2C%20Paris'
    )
  })

  it('should offer nothing without coordinates nor address', () => {
    expect(directionsUrl({ name: 'Sakura', city: 'Paris' })).toBeNull()
    expect(directionsUrl({ name: 'Sakura', address: '   ', location: null })).toBeNull()
  })
})

describe('staticMap', () => {
  it('should return a 2x2 block of openstreetmap tiles', () => {
    const map = staticMap(OPERA, 15)
    expect(map.zoom).toBe(15)
    expect(map.tiles).toHaveLength(4)
    expect(map.tiles.map((tile) => tile.url)).toEqual([
      'https://tile.openstreetmap.org/15/16595/11270.png',
      'https://tile.openstreetmap.org/15/16596/11270.png',
      'https://tile.openstreetmap.org/15/16595/11271.png',
      'https://tile.openstreetmap.org/15/16596/11271.png',
    ])
  })

  it('should always keep the marker away from the edges', () => {
    for (const point of [
      OPERA,
      { lat: 0, lng: 0 },
      { lat: -33.8688, lng: 151.2093 },
      { lat: 64.1466, lng: -21.9426 },
    ]) {
      const { marker } = staticMap(point)
      expect(marker.left).toBeGreaterThanOrEqual(25)
      expect(marker.left).toBeLessThanOrEqual(75)
      expect(marker.top).toBeGreaterThanOrEqual(25)
      expect(marker.top).toBeLessThanOrEqual(75)
    }
  })

  it('should wrap the columns around the antimeridian', () => {
    const map = staticMap({ lat: 0, lng: 180 }, 3)
    const scale = 2 ** 3
    expect(map.tiles.every((tile) => tile.x >= 0 && tile.x < scale)).toBe(true)
    expect(map.tiles.every((tile) => tile.y >= 0 && tile.y < scale)).toBe(true)
  })

  it('should clamp the zoom and stay inside the mercator bounds at the poles', () => {
    const map = staticMap({ lat: 89.9, lng: 0 }, 42)
    expect(map.zoom).toBe(19)
    expect(map.tiles.every((tile) => tile.y >= 0 && tile.y < 2 ** 19)).toBe(true)
  })
})
