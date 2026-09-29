'use client'

import { useActionState, useMemo, useState } from 'react'

import { createSessionAction } from '@/actions/sessions'
import { RestaurantPicker } from '@/components/restaurants/restaurant-picker'
import { SuggestionNotice } from '@/components/session/suggestion-notice'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { DUO_MIN_RESTAURANTS } from '@/domain/duo'
import {
  keptSuggestionCount,
  suggestedIds,
  suggestionSummary,
  withoutSuggestion,
} from '@/domain/suggestions'
import { rememberSessionEntry } from '@/lib/analytics/handoff'
import { countLabel } from '@/lib/format'

import type { ListWithRestaurantIds } from '@/data-access/lists'
import type { RestaurantPage } from '@/data-access/restaurants'
import type { FoodConstraints } from '@/domain/food-constraints'
import type { RecentWinnerDates } from '@/domain/recent-winners'
import type { RestaurantSuggestion } from '@/domain/suggestions'

interface DuoCreateFormProps {
  lists: ListWithRestaurantIds[]
  initialPage: RestaurantPage
  /** Nom de la session, calculé côté serveur : personne n'a à le taper */
  name: string
  recentWinners: RecentWinnerDates
  /** Sélection proposée d'après l'historique (#59), cochée à l'ouverture */
  suggestion?: RestaurantSuggestion | null
  /** Ses propres contraintes alimentaires (#60), pour badger le carnet */
  myConstraints?: FoodConstraints
}

/**
 * Créer un duo (#61) : une seule étape, les restos. Pas de nom à trouver, pas
 * d'échéance, pas de règles à régler — le premier accord ferme le vote, les
 * jokers restent ceux de toujours. Le reste est le formulaire complet en plus
 * court : même sélecteur, même proposition d'après l'historique, même action.
 *
 * Deux restos au moins : personne n'en ajoutera une fois la session partie.
 */
export function DuoCreateForm({
  lists,
  initialPage,
  name,
  recentWinners,
  suggestion = null,
  myConstraints,
}: DuoCreateFormProps) {
  const [state, formAction, isPending] = useActionState(createSessionAction, null)
  const [selectedListIds, setSelectedListIds] = useState<string[]>([])
  const [proposedIds] = useState(() => suggestedIds(suggestion))
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>(proposedIds)
  const [suggestionDismissed, setSuggestionDismissed] = useState(false)

  const total = useMemo(() => {
    const ids = new Set(selectedRestaurantIds)
    for (const list of lists) {
      if (selectedListIds.includes(list.id)) list.restaurant_ids.forEach((id) => ids.add(id))
    }
    return ids.size
  }, [lists, selectedListIds, selectedRestaurantIds])

  const keptSuggested = keptSuggestionCount(proposedIds, selectedRestaurantIds)

  function resetSuggestion() {
    setSelectedRestaurantIds((previous) => withoutSuggestion(previous, proposedIds))
    setSuggestionDismissed(true)
  }

  // L'action redirige : l'intention est notée ici, la page de session la
  // transforme en `session_created` si la création aboutit.
  function rememberCreation() {
    rememberSessionEntry({
      kind: 'created',
      listCount: selectedListIds.length,
      suggestedCount: proposedIds.length,
      suggestedKept: keptSuggested,
    })
  }

  return (
    <form action={formAction} onSubmit={rememberCreation} className="flex flex-col gap-6">
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="duo" value="on" />

      <section aria-labelledby="duo-restaurants-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="duo-restaurants-title" className="text-base font-semibold">
            Les restos à balayer
          </h2>
          <p className="text-sm text-muted-foreground">
            Vous verrez les mêmes, dans le même ordre. Quelques-uns suffisent : on s’arrête au
            premier « ça me va » commun.
          </p>
        </div>

        {suggestion && !suggestionDismissed && keptSuggested > 0 && (
          <SuggestionNotice summary={suggestionSummary(suggestion)} onReset={resetSuggestion} />
        )}

        <RestaurantPicker
          initialPage={initialPage}
          knownRestaurants={suggestion?.restaurants}
          value={selectedRestaurantIds}
          onChange={setSelectedRestaurantIds}
          recentWinners={recentWinners}
          inputName="restaurantIds"
          lists={lists}
          selectedListIds={selectedListIds}
          onListsChange={setSelectedListIds}
          listsInputName="listIds"
          myConstraints={myConstraints}
        />
      </section>

      <FormMessage error={state?.error} />

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-background/90 px-4 pt-3 pb-3 safe-bottom backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:m-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <Button
          type="submit"
          size="lg"
          disabled={isPending || total < DUO_MIN_RESTAURANTS}
          className="w-full lg:w-auto"
        >
          {isPending ? (
            <Spinner />
          ) : total >= DUO_MIN_RESTAURANTS ? (
            `C’est parti · ${countLabel(total, 'resto')}`
          ) : total === 1 ? (
            'Encore un resto au moins'
          ) : (
            'Sélectionne des restaurants'
          )}
        </Button>
      </div>
    </form>
  )
}
