'use client'

import { useActionState, useMemo, useState } from 'react'

import { createSessionAction } from '@/actions/sessions'
import { RestaurantPicker } from '@/components/restaurants/restaurant-picker'
import { DeadlinePicker } from '@/components/session/deadline-picker'
import { SESSION_STEPS, SessionStep, StepTitle } from '@/components/session/session-step'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { SESSION_NAME_MAX } from '@/domain/schemas/session'
import { rememberSessionEntry } from '@/lib/analytics/handoff'
import { countLabel } from '@/lib/format'

import type { ListWithRestaurantIds } from '@/data-access/lists'
import type { RestaurantPage } from '@/data-access/restaurants'

interface CreateSessionFormProps {
  lists: ListWithRestaurantIds[]
  initialPage: RestaurantPage
  defaultName: string
}

/**
 * Créer une session, en trois étapes numérotées : un nom, les restos, une
 * échéance. Les restos viennent d'où on veut — une liste entière, le carnet,
 * Google — et se mélangent dans un seul panier.
 */
export function CreateSessionForm({ lists, initialPage, defaultName }: CreateSessionFormProps) {
  const [state, formAction, isPending] = useActionState(createSessionAction, null)
  const [selectedListIds, setSelectedListIds] = useState<string[]>([])
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([])

  const total = useMemo(() => {
    const ids = new Set(selectedRestaurantIds)
    for (const list of lists) {
      if (selectedListIds.includes(list.id)) list.restaurant_ids.forEach((id) => ids.add(id))
    }
    return ids.size
  }, [lists, selectedListIds, selectedRestaurantIds])

  // L'action redirige : elle ne rend jamais la main. On note l'intention ici,
  // la page de session la transforme en `session_created` — et seulement si la
  // création a bien abouti.
  function rememberCreation() {
    rememberSessionEntry({ kind: 'created', listCount: selectedListIds.length })
  }

  return (
    <form action={formAction} onSubmit={rememberCreation} className="flex flex-col gap-8">
      <SessionStep
        number={1}
        title={
          <Label htmlFor="name" className="text-base font-semibold">
            {SESSION_STEPS.name}
          </Label>
        }
      >
        <Input
          id="name"
          name="name"
          defaultValue={defaultName}
          placeholder="Lunch du vendredi"
          required
          maxLength={SESSION_NAME_MAX}
          autoComplete="off"
          className="h-12 text-lg"
        />
      </SessionStep>

      <SessionStep
        number={2}
        title={<h2 className="text-base font-semibold">{SESSION_STEPS.restaurants}</h2>}
        hint={SESSION_STEPS.restaurantsHint}
      >
        <RestaurantPicker
          initialPage={initialPage}
          value={selectedRestaurantIds}
          onChange={setSelectedRestaurantIds}
          inputName="restaurantIds"
          lists={lists}
          selectedListIds={selectedListIds}
          onListsChange={setSelectedListIds}
          listsInputName="listIds"
        />
      </SessionStep>

      <DeadlinePicker
        legend={
          <StepTitle number={3}>
            <span className="text-base font-semibold">{SESSION_STEPS.deadline}</span>
          </StepTitle>
        }
      />

      <FormMessage error={state?.error} />

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-background/90 px-4 pt-3 pb-3 safe-bottom backdrop-blur-md">
        <Button type="submit" size="lg" disabled={isPending || total === 0} className="w-full">
          {isPending ? (
            <Spinner />
          ) : total > 0 ? (
            `Créer la session · ${countLabel(total, 'resto')}`
          ) : (
            'Sélectionne des restaurants'
          )}
        </Button>
      </div>
    </form>
  )
}
