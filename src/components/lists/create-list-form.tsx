'use client'

import { useActionState, useState } from 'react'

import { createListAction } from '@/actions/lists'
import { LIST_FORM, ListIdentityCard } from '@/components/lists/list-identity-card'
import { RestaurantPicker } from '@/components/restaurants/restaurant-picker'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { LIST_NAME_MAX } from '@/domain/schemas/list'
import { countLabel } from '@/lib/format'

import type { RestaurantPage } from '@/data-access/restaurants'

/**
 * Créer une liste de favoris : un nom, des restos, et c'est tout. Pas
 * d'étapes ni d'échéance — ce formulaire prépare une réserve, il ne lance
 * rien, et sa carte dorée le dit d'entrée.
 */
export function CreateListForm({ initialPage }: { initialPage: RestaurantPage }) {
  const [state, formAction, isPending] = useActionState(createListAction, null)
  const [restaurantIds, setRestaurantIds] = useState<string[]>([])

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <ListIdentityCard>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{LIST_FORM.name}</Label>
          <Input
            id="name"
            name="name"
            placeholder="Restos du bureau"
            required
            maxLength={LIST_NAME_MAX}
            autoComplete="off"
            autoFocus
            className="h-12 text-lg"
          />
        </div>
      </ListIdentityCard>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{LIST_FORM.restaurants}</h2>
          <p className="text-sm text-muted-foreground">{LIST_FORM.restaurantsHint}</p>
        </div>
        <RestaurantPicker
          initialPage={initialPage}
          value={restaurantIds}
          onChange={setRestaurantIds}
          inputName="restaurantIds"
        />
      </section>

      <FormMessage error={state?.error} />

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-background/90 px-4 pt-3 pb-3 safe-bottom backdrop-blur-md">
        <Button type="submit" size="lg" disabled={isPending} className="w-full">
          {isPending ? (
            <Spinner />
          ) : restaurantIds.length > 0 ? (
            `Enregistrer la liste · ${countLabel(restaurantIds.length, 'resto')}`
          ) : (
            LIST_FORM.submitEmpty
          )}
        </Button>
      </div>
    </form>
  )
}
