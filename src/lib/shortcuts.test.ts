import { describe, expect, it } from 'vitest'

import { describeSequence, matchSequence, SEQUENCE_SHORTCUTS, shortcutFor } from './shortcuts'

describe('matchSequence', () => {
  it('should recognise a complete sequence', () => {
    const outcome = matchSequence(['n', 's'])
    expect(outcome.kind).toBe('match')
    if (outcome.kind === 'match') expect(outcome.shortcut.href).toBe('/sessions/new')
  })

  it('should wait for the second key of a known prefix', () => {
    expect(matchSequence(['g'])).toEqual({ kind: 'prefix' })
    expect(matchSequence(['n'])).toEqual({ kind: 'prefix' })
  })

  it('should reject an unknown prefix or an unknown suffix', () => {
    expect(matchSequence(['x'])).toEqual({ kind: 'none' })
    expect(matchSequence(['g', 'x'])).toEqual({ kind: 'none' })
    expect(matchSequence([])).toEqual({ kind: 'none' })
    expect(matchSequence(['g', 'l', 'h'])).toEqual({ kind: 'none' })
  })

  it('should keep every sequence unique', () => {
    const seen = new Set(SEQUENCE_SHORTCUTS.map((shortcut) => shortcut.keys.join(' ')))
    expect(seen.size).toBe(SEQUENCE_SHORTCUTS.length)
  })
})

describe('shortcutFor', () => {
  it('should find the shortcut of a destination and describe it', () => {
    const shortcut = shortcutFor('/lists')
    expect(shortcut?.keys).toEqual(['g', 'l'])
    expect(describeSequence(shortcut!)).toBe('g puis l')
    expect(shortcutFor('/nowhere')).toBeUndefined()
  })
})
