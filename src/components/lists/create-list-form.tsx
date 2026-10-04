'use client'

import { useTranslations } from 'next-intl'
import { useActionState, useState } from 'react'

import { createListAction } from '@/actions/lists'
import { ListIdentityCard } from '@/components/lists/list-identity-card'
import { RestaurantPicker } from '@/components/restaurants/restaurant-picker'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { LIST_NAME_MAX } from '@/domain/schemas/list'

import type { RestaurantPage } from '@/data-access/restaurants'

/**
 * Créer une liste de favoris : un nom, des restos, et c'est tout. Pas
 * d'étapes ni d'échéance — ce formulaire prépare une réserve, il ne lance
 * rien, et sa carte dorée le dit d'entrée.
 */
export function CreateListForm({ initialPage }: { initialPage: RestaurantPage }) {
  const t = useTranslations('lists.form')
  const [state, formAction, isPending] = useActionState(createListAction, null)
  const [restaurantIds, setRestaurantIds] = useState<string[]>([])

  const submitLabel =
    restaurantIds.length > 0 ? t('submit', { count: restaurantIds.length }) : t('submitEmpty')

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-x-10"
    >
      <ListIdentityCard>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{t('name')}</Label>
          <Input
            id="name"
            name="name"
            placeholder={t('namePlaceholder')}
            required
            maxLength={LIST_NAME_MAX}
            autoComplete="off"
            autoFocus
            className="h-12 text-lg"
          />
        </div>
      </ListIdentityCard>

      <section className="flex flex-col gap-3 lg:col-start-2 lg:row-span-3 lg:row-start-1">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">{t('restaurants')}</h2>
          <p className="text-sm text-muted-foreground">{t('restaurantsHint')}</p>
        </div>
        <RestaurantPicker
          initialPage={initialPage}
          value={restaurantIds}
          onChange={setRestaurantIds}
          inputName="restaurantIds"
        />
      </section>

      <FormMessage error={state?.error} className="lg:col-start-1" />

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-background/90 px-4 pt-3 pb-3 safe-bottom backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:col-start-1 lg:m-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <Button type="submit" size="lg" disabled={isPending} className="w-full">
          {isPending ? <Spinner /> : submitLabel}
        </Button>
      </div>
    </form>
  )
}
