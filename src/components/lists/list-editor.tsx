'use client'

import { RiAddLine, RiCloseLine, RiDeleteBinLine, RiGroupLine } from '@remixicon/react'
import { useActionState, useOptimistic, useState, useTransition } from 'react'

import { RestaurantPicker } from '@/components/restaurants/restaurant-picker'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { TwoStepButton } from '@/components/ui/two-step-button'
import {
  addRestaurantsToListAction,
  deleteListAction,
  removeRestaurantFromListAction,
  renameListAction,
  setListCollaborativeAction,
} from '@/lib/actions/lists'
import { groupCode } from '@/lib/crockford'
import { countLabel } from '@/lib/format'
import { LIST_NAME_MAX } from '@/lib/schemas/list'
import { cn } from '@/lib/utils'

import type { ListWithRestaurants, Restaurant } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'

interface ListEditorProps {
  list: ListWithRestaurants
  initialPage: RestaurantPage
  shareUrl: string
}

export function ListEditor({ list, initialPage, shareUrl }: ListEditorProps) {
  const [renameState, renameAction, isRenaming] = useActionState(renameListAction, null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isCollaborative, setIsCollaborative] = useState(list.is_collaborative)
  const [adding, setAdding] = useState(false)
  const [pickerIds, setPickerIds] = useState<string[]>([])

  const [restaurants, mutateRestaurants] = useOptimistic(
    list.restaurants,
    (state: Restaurant[], action: { type: 'remove'; id: string }) =>
      action.type === 'remove' ? state.filter((r) => r.id !== action.id) : state
  )

  function remove(restaurant: Restaurant) {
    setError(null)
    startTransition(async () => {
      mutateRestaurants({ type: 'remove', id: restaurant.id })
      const result = await removeRestaurantFromListAction(list.id, restaurant.id)
      if (!result.ok) setError(result.error)
    })
  }

  function addSelected() {
    if (pickerIds.length === 0) return
    setError(null)
    startTransition(async () => {
      // Un seul aller-retour pour tous les restaurants sélectionnés
      const result = await addRestaurantsToListAction(list.id, pickerIds)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPickerIds([])
      setAdding(false)
    })
  }

  function toggleCollaborative() {
    const next = !isCollaborative
    setIsCollaborative(next)
    startTransition(async () => {
      const result = await setListCollaborativeAction(list.id, next)
      if (!result.ok) {
        setIsCollaborative(!next)
        setError(result.error)
      }
    })
  }

  function destroy() {
    startTransition(async () => {
      const result = await deleteListAction(list.id)
      if (!result.ok) setError(result.error)
    })
  }

  const existingIds = restaurants.map((r) => r.id)

  return (
    <div className="flex flex-col gap-8">
      <form action={renameAction} className="flex flex-col gap-2">
        <input type="hidden" name="listId" value={list.id} />
        <Label htmlFor="name">Nom</Label>
        <div className="flex gap-2">
          <Input
            id="name"
            name="name"
            defaultValue={list.name}
            required
            maxLength={LIST_NAME_MAX}
            className="flex-1"
          />
          <Button type="submit" variant="secondary" disabled={isRenaming}>
            {isRenaming ? <Spinner /> : 'Renommer'}
          </Button>
        </div>
        <FormMessage error={renameState?.error} success={renameState?.success} />
      </form>

      <section
        aria-labelledby="share-title"
        className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line"
      >
        <div className="flex flex-col gap-0.5">
          <h2 id="share-title" className="font-display text-base font-semibold">
            Partager
          </h2>
          <p className="text-sm text-muted-foreground">
            Toute personne avec le lien peut voir la liste
            {isCollaborative ? ' et y ajouter des restos' : ''}.
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2">
          <span className="font-mono text-[0.68rem] tracking-wide text-muted-foreground uppercase">
            Code
          </span>
          <span className="font-mono text-base font-semibold tracking-[0.15em] tabular">
            {groupCode(list.share_code, 5)}
          </span>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <CopyButton
            value={shareUrl}
            label="Copier le lien"
            variant="outline"
            className="sm:flex-1"
          />
          <button
            type="button"
            role="switch"
            aria-checked={isCollaborative}
            onClick={toggleCollaborative}
            disabled={isPending}
            className={cn(
              'inline-flex h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors sm:flex-1',
              isCollaborative
                ? 'border-brand bg-brand-soft text-brand-hover'
                : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2'
            )}
          >
            <RiGroupLine aria-hidden="true" className="size-4.5" />
            {isCollaborative ? 'Collaborative' : 'Lecture seule'}
          </button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-base font-semibold">
            {countLabel(restaurants.length, 'restaurant')}
          </h2>
          {!adding && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)}>
              <RiAddLine aria-hidden="true" />
              Ajouter
            </Button>
          )}
        </div>

        {adding && (
          <div className="flex flex-col gap-3 rounded-lg bg-surface-2 p-3">
            <RestaurantPicker
              initialPage={initialPage}
              value={pickerIds}
              onChange={setPickerIds}
              lockedIds={existingIds}
            />
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={addSelected}
                disabled={isPending || pickerIds.length === 0}
                className="flex-1"
              >
                {isPending ? (
                  <Spinner />
                ) : (
                  `Ajouter ${pickerIds.length > 0 ? pickerIds.length : ''}`
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAdding(false)
                  setPickerIds([])
                }}
              >
                Annuler
              </Button>
            </div>
          </div>
        )}

        <FormMessage error={error} />

        {restaurants.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line-strong p-6 text-center text-sm text-muted-foreground">
            Liste vide. Ajoute des restos pour pouvoir l’importer dans une session.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {restaurants.map((restaurant) => (
              <li
                key={restaurant.id}
                className="flex items-center gap-3 rounded-md bg-surface px-3 py-2.5 ring-1 ring-line"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{restaurant.name}</span>
                  {restaurant.cuisine_type && (
                    <span className="font-mono text-[0.68rem] tracking-wide text-muted-foreground uppercase">
                      {restaurant.cuisine_type}
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Retirer ${restaurant.name}`}
                  onClick={() => remove(restaurant)}
                  disabled={isPending}
                >
                  <RiCloseLine aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex justify-center">
        <TwoStepButton
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-veto"
          label={
            <>
              <RiDeleteBinLine aria-hidden="true" />
              Supprimer la liste
            </>
          }
          confirmLabel="Confirmer la suppression"
          onConfirm={destroy}
          disabled={isPending}
        />
      </div>
    </div>
  )
}
