'use client'

import { RiCheckLine } from '@remixicon/react'
import { useActionState, useMemo, useState } from 'react'

import { RestaurantPicker } from '@/components/restaurants/restaurant-picker'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { createSessionAction } from '@/lib/actions/sessions'
import { rememberSessionEntry } from '@/lib/analytics/handoff'
import { countLabel } from '@/lib/format'
import { SESSION_NAME_MAX } from '@/lib/schemas/session'
import { cn } from '@/lib/utils'

import type { ListWithRestaurantIds } from '@/data-access/lists'
import type { RestaurantPage } from '@/data-access/restaurants'

interface CreateSessionFormProps {
  lists: ListWithRestaurantIds[]
  initialPage: RestaurantPage
  defaultName: string
}

export function CreateSessionForm({ lists, initialPage, defaultName }: CreateSessionFormProps) {
  const [state, formAction, isPending] = useActionState(createSessionAction, null)
  const [selectedListIds, setSelectedListIds] = useState<string[]>([])
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([])

  const fromLists = useMemo(() => {
    const ids = new Set<string>()
    for (const list of lists) {
      if (selectedListIds.includes(list.id)) list.restaurant_ids.forEach((id) => ids.add(id))
    }
    return ids
  }, [lists, selectedListIds])

  const total = new Set([...fromLists, ...selectedRestaurantIds]).size

  function toggleList(id: string) {
    setSelectedListIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]))
  }

  // L'action redirige : elle ne rend jamais la main. On note l'intention ici,
  // la page de session la transforme en `session_created` — et seulement si la
  // création a bien abouti.
  function rememberCreation() {
    rememberSessionEntry({ kind: 'created', listCount: selectedListIds.length })
  }

  return (
    <form action={formAction} onSubmit={rememberCreation} className="flex flex-col gap-6">
      {selectedListIds.map((id) => (
        <input key={id} type="hidden" name="listIds" value={id} />
      ))}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nom de la session</Label>
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
      </div>

      {lists.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Depuis mes listes</legend>
          <ul className="flex flex-col gap-2">
            {lists.map((list) => {
              const isSelected = selectedListIds.includes(list.id)
              return (
                <li key={list.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => toggleList(list.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg border p-3.5 text-left transition-colors',
                      isSelected
                        ? 'border-brand bg-brand-soft'
                        : 'border-line bg-surface hover:bg-surface-2'
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'flex size-5 items-center justify-center rounded-full border',
                          isSelected ? 'border-brand bg-brand text-on-brand' : 'border-line-strong'
                        )}
                      >
                        {isSelected && <RiCheckLine className="size-3.5" />}
                      </span>
                      <span className="font-medium">{list.name}</span>
                    </span>
                    <span className="font-mono text-xs text-muted-foreground tabular">
                      {countLabel(list.restaurant_ids.length, 'resto')}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </fieldset>
      )}

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium">
          {lists.length > 0 ? 'Ajouter des restaurants' : 'Restaurants'}
        </p>
        <RestaurantPicker
          initialPage={initialPage}
          value={selectedRestaurantIds}
          onChange={setSelectedRestaurantIds}
          lockedIds={[...fromLists]}
          inputName="restaurantIds"
        />
      </div>

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
