'use client'

import { useMemo } from 'react'

import { useIsClient } from '@/hooks/use-is-client'
import { isOpenNow, parseOpeningHours } from '@/lib/opening-hours'

import type { Json } from '@/data-access/models'

/**
 * `true` ouvert, `false` fermé, `null` inconnu (donnée absente ou pas encore
 * hydraté). La réponse dépend de l'heure du visiteur : la calculer au rendu
 * serveur produirait une valeur périmée et une hydratation divergente.
 */
export function useOpenNow(hours: Json | null | undefined): boolean | null {
  const isClient = useIsClient()
  const parsed = useMemo(() => parseOpeningHours(hours), [hours])
  return isClient ? isOpenNow(parsed) : null
}
