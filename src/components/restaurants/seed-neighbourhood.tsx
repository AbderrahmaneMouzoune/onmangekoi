'use client'

import { RiMapPinAddLine } from '@remixicon/react'
import { useState, useTransition } from 'react'

import { seedNeighbourhoodAction } from '@/actions/places'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { NEIGHBOURHOOD_IMPORT_MAX } from '@/domain/schemas/place'
import { captureEvent } from '@/lib/analytics/client'
import { countLabel, plural } from '@/lib/format'

import type { Restaurant } from '@/data-access/models'
import type { Position } from '@/hooks/use-geolocation'
import type { SeededNeighbourhood } from '@/use-cases/seed-neighbourhood'

interface SeedNeighbourhoodProps {
  /** Position déjà accordée. Sans elle, l'appelant ne monte pas ce composant. */
  position: Position
  /** Restos entrés en base : le carnet les adopte sans rien recharger. */
  onSeeded: (restaurants: Restaurant[]) => void
}

/** Ce que le lot a donné, dit à qui vient de le lancer. */
function outcomeLabel({ restaurants, failed, remaining }: SeededNeighbourhood): string {
  const added = restaurants.length
  const entered = `${countLabel(added, 'resto')} ${plural(added, 'est entré', 'sont entrés')} dans le carnet`
  const missed =
    failed > 0
      ? `, ${failed} ${plural(failed, 'n’a pas pu être enregistré', 'n’ont pas pu être enregistrés')}`
      : ''
  const left =
    remaining > 0
      ? `Il te reste ${countLabel(remaining, 'amorçage')} aujourd’hui.`
      : 'C’était ton dernier amorçage du jour.'
  return `${entered}${missed}. ${left}`
}

/**
 * « Amorcer mon quartier » : les restaurants les plus proches entrent dans le
 * carnet d'un seul geste.
 *
 * C'est le coût de première utilisation qu'on enlève au host : sans ça, il
 * importe ses restos un par un, juste avant d'avoir à convaincre cinq
 * collègues de cliquer. Le bouton n'existe qu'une fois la position accordée
 * — il ne déclenche donc jamais lui-même la demande d'autorisation.
 *
 * Ce qui entre n'est pas coché pour autant : le carnet se remplit, la
 * sélection reste un choix. Le plafond et le quota, eux, sont tenus par le
 * serveur : ce composant n'envoie qu'une position.
 */
export function SeedNeighbourhood({ position, onSeeded }: SeedNeighbourhoodProps) {
  const [isSeeding, startSeeding] = useTransition()
  const [outcome, setOutcome] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState(false)

  function seed() {
    setError(null)
    startSeeding(async () => {
      const result = await seedNeighbourhoodAction(position)
      if (!result.ok) {
        setError(result.error)
        setOutcome(null)
        return
      }
      onSeeded(result.data.restaurants)
      captureEvent('neighbourhood_seeded', {
        restaurant_count: result.data.restaurants.length,
        failed_count: result.data.failed,
      })
      setExhausted(result.data.remaining <= 0)
      setOutcome(outcomeLabel(result.data))
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-2 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="text-sm font-semibold text-ink">Amorcer mon quartier</p>
          <p className="text-xs text-muted-foreground">
            Jusqu’à {NEIGHBOURHOOD_IMPORT_MAX} restos autour de toi entrent dans le carnet d’un
            coup. Tu coches ensuite ceux que tu veux.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={seed}
          disabled={isSeeding || exhausted}
        >
          {isSeeding ? <Spinner /> : <RiMapPinAddLine aria-hidden="true" />}
          Amorcer
        </Button>
      </div>

      <FormMessage error={error} success={outcome} />
    </div>
  )
}
