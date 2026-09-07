'use client'

import { useEffect, useState } from 'react'

import { remainingMs } from '@/domain/session-deadline'
import { useIsClient } from '@/hooks/use-is-client'

/**
 * Millisecondes restantes avant `target`, relues chaque seconde **sur
 * l'horloge** et jamais décrémentées : un onglet en arrière-plan voit ses
 * minuteurs ralentis, et un compte à rebours qui se soustrait lui-même revient
 * au premier plan avec des minutes de retard. Le retour est donc aussi un
 * moment de resynchronisation, comme dans `useSessionRoom`.
 *
 * `null` sans échéance et tant que l'hydratation n'a pas eu lieu : le rendu
 * serveur ne peut pas afficher l'heure du visiteur sans diverger de la sienne.
 */
export function useCountdown(target: string | null | undefined): number | null {
  const isClient = useIsClient()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!target) return

    const tick = () => setNow(Date.now())
    const timer = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('focus', tick)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
      window.removeEventListener('focus', tick)
    }
  }, [target])

  if (!isClient || !target) return null
  return remainingMs(target, new Date(now))
}
