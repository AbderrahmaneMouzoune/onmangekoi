import { describe, expect, it } from 'vitest'

import { encodeSessionCursor, favoriteRate, parseSessionCursor } from './history'

const ENTRY = {
  created_at: '2026-09-04T12:00:00+00:00',
  id: 'ffffffff-0000-4000-8000-000000000001',
}

describe('session cursor', () => {
  it('should round-trip the date and the id of the last row', () => {
    expect(parseSessionCursor(encodeSessionCursor(ENTRY))).toEqual({
      createdAt: ENTRY.created_at,
      id: ENTRY.id,
    })
  })

  it('should stay opaque and URL-safe', () => {
    const cursor = encodeSessionCursor(ENTRY)
    expect(cursor).not.toContain(ENTRY.id)
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(encodeURIComponent(cursor)).toBe(cursor)
  })

  it('should distinguish two sessions created in the same instant', () => {
    const twin = { ...ENTRY, id: 'ffffffff-0000-4000-8000-000000000002' }
    expect(encodeSessionCursor(twin)).not.toBe(encodeSessionCursor(ENTRY))
    expect(parseSessionCursor(encodeSessionCursor(twin))?.id).toBe(twin.id)
  })

  it('should fall back to the first page when the cursor is unusable', () => {
    expect(parseSessionCursor(null)).toBeNull()
    expect(parseSessionCursor('')).toBeNull()
    expect(parseSessionCursor('pas-du-base64!!')).toBeNull()
    // Bien encodé, mais sans séparateur, sans uuid, ou sans date lisible.
    expect(parseSessionCursor(btoa('2026-09-04T12:00:00Z'))).toBeNull()
    expect(parseSessionCursor(btoa('2026-09-04T12:00:00Z|pas-un-uuid'))).toBeNull()
    expect(parseSessionCursor(btoa(`hier|${ENTRY.id}`))).toBeNull()
  })

  it('should normalize the id it hands back to the query', () => {
    const upper = { ...ENTRY, id: ENTRY.id.toUpperCase() }
    expect(parseSessionCursor(encodeSessionCursor(upper))?.id).toBe(ENTRY.id)
  })
})

describe('favoriteRate', () => {
  it('should divide the coups de cœur by the total number of votes', () => {
    expect(favoriteRate(3, 12)).toBe(0.25)
    expect(favoriteRate(0, 4)).toBe(0)
  })

  it('should stay null when nothing has been voted yet', () => {
    expect(favoriteRate(0, 0)).toBeNull()
  })
})
