'use client'

import { RiPlayLine } from '@remixicon/react'
import Link from 'next/link'
import { useState, useTransition } from 'react'

import { startSessionFromListAction } from '@/actions/lists'
import { Button, buttonVariants } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { rememberSessionEntry } from '@/lib/analytics/handoff'
import { cn } from '@/lib/utils'

const LABEL = 'Lancer une session depuis cette liste'

interface StartSessionButtonProps {
  /** Code de partage de la liste. */
  identifier: string
  /**
   * Renseigné quand la personne n'a pas encore de pseudo : le bouton devient
   * un lien vers l'onboarding, qui la ramène ensuite à cette liste — le même
   * chemin que `/join/<code>`.
   */
  setupHref?: string
}

/**
 * La porte d'entrée de qui reçoit une liste : un vote, tout de suite, avec
 * ces restos-là. Aucun identifiant de restaurant ne part du navigateur — le
 * serveur relit la liste derrière son code.
 */
export function StartSessionButton({ identifier, setupHref }: StartSessionButtonProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (setupHref) {
    return (
      <Link href={setupHref} className={cn(buttonVariants(), 'w-full')}>
        <RiPlayLine aria-hidden="true" />
        {LABEL}
      </Link>
    )
  }

  function start() {
    setError(null)
    startTransition(async () => {
      // L'intention est déposée avant la navigation : la salle de session la
      // consomme à l'arrivée, un échec ne compte donc jamais pour une création.
      rememberSessionEntry({ kind: 'created', listCount: 1 })
      const result = await startSessionFromListAction(identifier)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" onClick={start} disabled={isPending} className="w-full">
        {isPending ? <Spinner /> : <RiPlayLine aria-hidden="true" />}
        {LABEL}
      </Button>
      <FormMessage error={error} />
    </div>
  )
}
