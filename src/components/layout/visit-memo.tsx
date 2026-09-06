'use client'

import { useEffect } from 'react'

import { rememberVisit, type VisitHint } from '@/lib/visit-hint'

/**
 * Note dans le navigateur la forme de ce que la page vient d'afficher, pour
 * que la silhouette de la prochaine visite lui ressemble. Les champs omis
 * gardent leur valeur : l'en-tête ne connaît que le pseudo, l'accueil connaît
 * tout. Ne rend rien, n'envoie rien — voir `src/lib/visit-hint.ts`.
 */
export function VisitMemo({ account, sessions, lists }: Partial<VisitHint>) {
  useEffect(() => {
    rememberVisit({ account, sessions, lists })
  }, [account, sessions, lists])

  return null
}
