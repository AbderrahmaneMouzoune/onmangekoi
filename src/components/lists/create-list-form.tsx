'use client'

import { useActionState, useState } from 'react'

import { RestaurantPicker } from '@/components/restaurants/restaurant-picker'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { createListAction } from '@/lib/actions/lists'
import { countLabel } from '@/lib/format'
import { LIST_NAME_MAX } from '@/lib/schemas/list'

import type { RestaurantPage } from '@/data-access/restaurants'

export function CreateListForm({ initialPage }: { initialPage: RestaurantPage }) {
  const [state, formAction, isPending] = useActionState(createListAction, null)
  const [restaurantIds, setRestaurantIds] = useState<string[]>([])

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nom de la liste</Label>
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

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">Restaurants</p>
        <RestaurantPicker
          initialPage={initialPage}
          value={restaurantIds}
          onChange={setRestaurantIds}
          inputName="restaurantIds"
        />
      </div>

      <FormMessage error={state?.error} />

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-background/90 px-4 pt-3 pb-3 safe-bottom backdrop-blur-md">
        <Button type="submit" size="lg" disabled={isPending} className="w-full">
          {isPending ? (
            <Spinner />
          ) : restaurantIds.length > 0 ? (
            `Créer la liste · ${countLabel(restaurantIds.length, 'resto')}`
          ) : (
            'Créer la liste vide'
          )}
        </Button>
      </div>
    </form>
  )
}
