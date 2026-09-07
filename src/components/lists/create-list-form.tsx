'use client'

import { useActionState, useState } from 'react'

import { createListAction } from '@/actions/lists'
import { RestaurantPicker } from '@/components/restaurants/restaurant-picker'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { LIST_NAME_MAX } from '@/domain/schemas/list'
import { countLabel } from '@/lib/format'

import type { RestaurantPage } from '@/data-access/restaurants'

export function CreateListForm({ initialPage }: { initialPage: RestaurantPage }) {
  const [state, formAction, isPending] = useActionState(createListAction, null)
  const [restaurantIds, setRestaurantIds] = useState<string[]>([])

  const submitLabel =
    restaurantIds.length > 0
      ? `Créer la liste · ${countLabel(restaurantIds.length, 'resto')}`
      : 'Créer la liste vide'

  return (
    <form
      action={formAction}
      className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-10"
    >
      <div className="flex flex-col gap-6 lg:sticky lg:top-24">
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

        <div className="hidden lg:flex lg:flex-col lg:gap-2">
          <Button type="submit" size="lg" disabled={isPending} className="w-full">
            {isPending ? <Spinner /> : submitLabel}
          </Button>
          <FormMessage error={state?.error} />
        </div>
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

      <div className="flex flex-col gap-3 lg:hidden">
        <FormMessage error={state?.error} />
        <div className="sticky bottom-0 -mx-4 border-t border-line bg-background/90 px-4 pt-3 pb-3 safe-bottom backdrop-blur-md sm:-mx-6 sm:px-6">
          <Button type="submit" size="lg" disabled={isPending} className="w-full">
            {isPending ? <Spinner /> : submitLabel}
          </Button>
        </div>
      </div>
    </form>
  )
}
