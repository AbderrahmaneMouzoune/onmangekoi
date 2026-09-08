import { describe, expect, it } from 'vitest'

import { compareVersions } from '@/lib/version'

import { RELEASE_NOTES } from './entries'

import { getLatestRelease, getReleaseNotes, ReleaseNoteSchema } from './index'

describe('notes de version', () => {
  it('should hold at least one note', () => {
    expect(RELEASE_NOTES.length).toBeGreaterThan(0)
  })

  it('should match the schema, note by note', () => {
    for (const note of RELEASE_NOTES) {
      expect(() => ReleaseNoteSchema.parse(note)).not.toThrow()
    }
  })

  it('should never publish the same version twice', () => {
    const versions = RELEASE_NOTES.map((note) => note.version)
    expect(new Set(versions).size).toBe(versions.length)
  })

  it('should list the most recent note first', () => {
    const notes = getReleaseNotes()
    for (let index = 1; index < notes.length; index += 1) {
      expect(compareVersions(notes[index - 1].version, notes[index].version)).toBeGreaterThan(0)
    }
    expect(getLatestRelease()?.version).toBe(notes[0]?.version)
  })

  it('should not announce a release from the future', () => {
    const today = new Date().toISOString().slice(0, 10)
    for (const note of RELEASE_NOTES) {
      expect(note.date <= today).toBe(true)
    }
  })
})
