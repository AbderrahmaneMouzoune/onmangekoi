import { compareVersions } from '@/lib/version'

import { RELEASE_NOTES } from './entries'

import type { ReleaseNote } from './types'

export { CHANGE_KINDS, ChangeSchema, ReleaseNoteSchema } from './types'
export type { Change, ChangeKind, ReleaseNote } from './types'

/** Notes de version, de la plus récente à la plus ancienne. */
export function getReleaseNotes(): ReleaseNote[] {
  return [...RELEASE_NOTES].sort((a, b) => compareVersions(b.version, a.version))
}

/** Dernière note publiée, `null` tant qu'il n'y en a aucune. */
export function getLatestRelease(): ReleaseNote | null {
  return getReleaseNotes()[0] ?? null
}

/**
 * Version de la dernière note. Constante calculée à la construction : elle
 * part dans le bundle client pour que l'en-tête sache, sans requête, s'il
 * reste quelque chose à lire.
 */
export const LATEST_RELEASE_VERSION: string | null = getLatestRelease()?.version ?? null
