'use client'

import { RiAddLine, RiCloseLine, RiErrorWarningLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { useMemo, useState, useTransition } from 'react'

import { addSessionRestaurantsAction, removeSessionRestaurantAction } from '@/actions/sessions'
import { RestaurantPicker } from '@/components/restaurants/restaurant-picker'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { blockedCount, NO_CONFLICTS, NO_FOOD_CONSTRAINTS } from '@/domain/food-constraints'
import { useArrowNavigation } from '@/hooks/use-arrow-navigation'
import { usePeopleLabels } from '@/i18n/use-people-labels'
import { captureEvent } from '@/lib/analytics/client'
import { participantLabel } from '@/lib/format'

import type { ParticipantWithProfile, SessionRestaurantWithRestaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'
import type { ConstraintConflictCounts, FoodConstraints } from '@/domain/food-constraints'

interface SessionRestaurantsPanelProps {
  sessionId: string
  restaurants: SessionRestaurantWithRestaurant[]
  participants: ParticipantWithProfile[]
  meId: string
  isHost: boolean
  /**
   * Contraintes alimentaires (#60) : par resto, combien de participants ne
   * peuvent pas y manger. Signalé, jamais masqué ni interdit — le host
   * décide, et personne n'est nommé.
   */
  conflicts?: ConstraintConflictCounts
  /** Ses propres contraintes : le sélecteur badge ce qu'on ne peut pas manger soi-même. */
  myConstraints?: FoodConstraints | null
  /**
   * Première page du catalogue, chargée côté serveur pour le sélecteur. Nulle
   * quand la page a été rendue hors salle d'attente : la liste reste lisible,
   * seul l'ajout disparaît.
   */
  initialPage: RestaurantPage | null
  /** Resynchronise la salle après un ajout ou un retrait */
  onChanged: () => void
}

/**
 * Le contenu de la session, en salle d'attente : ce qu'il y a à départager et
 * qui l'a apporté. Chacun ajoute ses restos tant que le vote n'a pas démarré —
 * c'est la salle d'attente qui compose le deck, pas le seul host.
 *
 * Retirer reste plus restreint qu'ajouter : on retire ce qu'on a apporté, et
 * le host arbitre sur sa session. La base porte la même règle.
 */
export function SessionRestaurantsPanel({
  sessionId,
  restaurants,
  participants,
  meId,
  isHost,
  conflicts = NO_CONFLICTS,
  myConstraints,
  initialPage,
  onChanged,
}: SessionRestaurantsPanelProps) {
  const [error, setError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [isPending, startTransition] = useTransition()
  const onKeyDown = useArrowNavigation()
  const t = useTranslations('session.sessionRestaurants')
  const tSession = useTranslations('session')
  const tCommon = useTranslations('common')
  const { guest, deletedParticipant } = usePeopleLabels()

  const pseudoById = useMemo(
    () =>
      new Map(
        participants
          .filter((participant) => participant.profile_id !== null)
          .map((participant) => [
            participant.profile_id,
            participantLabel(participant.profile_id, participant.profiles?.pseudo, {
              guest,
              deletedParticipant,
            }),
          ])
      ),
    [participants, guest, deletedParticipant]
  )

  const presentIds = useMemo(() => restaurants.map((row) => row.restaurant_id), [restaurants])

  function add() {
    setError(null)
    startTransition(async () => {
      const result = await addSessionRestaurantsAction(sessionId, picked)
      if (!result.ok) {
        setError(result.error)
        return
      }
      captureEvent('session_restaurants_added', {
        session_id: sessionId,
        added_count: picked.length,
        restaurant_count: restaurants.length + picked.length,
      })
      setPicked([])
      setIsAdding(false)
      onChanged()
    })
  }

  function remove(restaurantId: string) {
    setError(null)
    startTransition(async () => {
      const result = await removeSessionRestaurantAction(sessionId, restaurantId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onChanged()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-base font-semibold">
          {t('title', { count: restaurants.length })}
        </h2>
        {initialPage && !isAdding && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setIsAdding(true)}>
            <RiAddLine aria-hidden="true" />
            {t('addMine')}
          </Button>
        )}
      </div>

      <ul onKeyDown={onKeyDown} className="flex flex-col gap-1.5" aria-label={t('label')}>
        {restaurants.map((row) => {
          const name = row.restaurants?.name ?? t('removed')
          const mine = row.added_by !== null && row.added_by === meId
          // `added_by` est nul quand la personne a supprimé son compte : le
          // resto reste dans la session, sans auteur à afficher.
          const author = mine ? null : row.added_by ? (pseudoById.get(row.added_by) ?? null) : null
          const canRemove = (mine || isHost) && restaurants.length > 1
          const blocked = blockedCount(conflicts[row.restaurant_id])
          return (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-md bg-surface px-3 py-2.5 ring-1 ring-line"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{name}</span>
                {(mine || author) && (
                  <span className="truncate text-xs text-muted-foreground">
                    {mine ? t('addedByYou') : t('addedBy', { author: author ?? '' })}
                  </span>
                )}
                {blocked && (
                  <span className="mt-1 inline-flex items-center gap-1 self-start rounded-full bg-veto-soft px-2 py-0.5 text-xs font-medium text-veto">
                    <RiErrorWarningLine aria-hidden="true" className="size-3.5 shrink-0" />
                    {tSession('constraints.blocked', { count: blocked })}
                  </span>
                )}
              </span>
              {row.restaurants?.cuisine_type && (
                <span className="shrink-0 font-mono text-[0.68rem] tracking-wide text-muted-foreground uppercase">
                  {row.restaurants.cuisine_type}
                </span>
              )}
              {canRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 hover:text-veto"
                  onClick={() => remove(row.restaurant_id)}
                  disabled={isPending}
                  aria-label={t('remove', { name })}
                >
                  <RiCloseLine aria-hidden="true" />
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      <FormMessage error={error} />

      {initialPage && isAdding && (
        <div className="flex flex-col gap-3 rounded-lg bg-surface-2 p-3">
          <RestaurantPicker
            initialPage={initialPage}
            value={picked}
            onChange={setPicked}
            lockedIds={presentIds}
            myConstraints={myConstraints ?? NO_FOOD_CONSTRAINTS}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={add}
              disabled={isPending || picked.length === 0}
              className="flex-1"
            >
              {isPending ? (
                <Spinner />
              ) : picked.length > 0 ? (
                t('add', { count: picked.length })
              ) : (
                t('addNone')
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPicked([])
                setIsAdding(false)
              }}
            >
              {tCommon('actions.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
