'use client'

import { useEffect } from 'react'

import { captureEvent } from '@/lib/analytics/client'
import { rememberSeenRelease } from '@/lib/changelog-seen'

/**
 * Marque la page « Nouveautés » comme lue jusqu'à cette version : la pastille
 * de l'en-tête s'éteint et ne se rallumera qu'à la prochaine. N'affiche rien.
 *
 * C'est aussi le seul endroit d'où part `changelog_opened` — un numéro de
 * version, rien de personnel.
 */
export function ChangelogSeenMarker({ version }: { version: string }) {
  useEffect(() => {
    rememberSeenRelease(version)
    captureEvent('changelog_opened', { version })
  }, [version])

  return null
}
