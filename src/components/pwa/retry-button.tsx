'use client'

import { RiRefreshLine } from '@remixicon/react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'

/**
 * Recharge la page demandée. La page hors ligne est servie *à la place* de
 * celle qu'on voulait, à la même adresse : recharger, c'est donc retenter
 * exactement la navigation qui a échoué. Le retour du réseau la retente seul.
 */
export function RetryButton() {
  useEffect(() => {
    const reload = () => window.location.reload()
    window.addEventListener('online', reload)
    return () => window.removeEventListener('online', reload)
  }, [])

  return (
    <Button type="button" variant="chalk" onClick={() => window.location.reload()}>
      <RiRefreshLine aria-hidden="true" />
      Réessayer
    </Button>
  )
}
