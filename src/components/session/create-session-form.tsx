'use client'

import { useState, useActionState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createSessionAction } from '@/lib/actions/sessions'
import { cn } from '@/lib/utils'

import type { Restaurant } from '@/data-access/models/database'
import type { ListWithRestaurants } from '@/data-access/restaurants'

interface Props {
  lists: ListWithRestaurants[]
  restaurants: Restaurant[]
}

export function CreateSessionForm({ lists, restaurants }: Props) {
  const [state, formAction, isPending] = useActionState(createSessionAction, null)
  const [selectedListIds, setSelectedListIds] = useState<Set<string>>(new Set())
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<Set<string>>(new Set())

  function toggleList(listId: string) {
    setSelectedListIds((prev) => {
      const next = new Set(prev)
      if (next.has(listId)) next.delete(listId)
      else next.add(listId)
      return next
    })
  }

  function toggleRestaurant(restaurantId: string) {
    setSelectedRestaurantIds((prev) => {
      const next = new Set(prev)
      if (next.has(restaurantId)) next.delete(restaurantId)
      else next.add(restaurantId)
      return next
    })
  }

  const fromListsIds = new Set(
    lists
      .filter((l) => selectedListIds.has(l.id))
      .flatMap((l) => l.list_restaurants.map((lr) => lr.restaurant_id))
  )
  const totalSelected = new Set([...fromListsIds, ...selectedRestaurantIds]).size

  return (
    <form action={formAction} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Nom de la session</Label>
        <Input
          id="name"
          name="name"
          placeholder="Lunch du vendredi"
          required
          maxLength={100}
          autoFocus
        />
      </div>

      {/* Hidden inputs pour les IDs sélectionnés */}
      {Array.from(selectedListIds).map((id) => (
        <input key={id} type="hidden" name="listIds" value={id} />
      ))}
      {Array.from(selectedRestaurantIds).map((id) => (
        <input key={id} type="hidden" name="restaurantIds" value={id} />
      ))}

      {lists.length > 0 && (
        <div className="space-y-2">
          <Label>Mes listes</Label>
          <div className="space-y-2">
            {lists.map((list) => {
              const count = list.list_restaurants.length
              const isSelected = selectedListIds.has(list.id)
              return (
                <button
                  key={list.id}
                  type="button"
                  onClick={() => toggleList(list.id)}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors',
                    isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                  )}
                >
                  <span className="font-medium">{list.name}</span>
                  <Badge variant={isSelected ? 'default' : 'secondary'}>
                    {count} resto{count > 1 ? 's' : ''}
                  </Badge>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Restaurants</Label>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {restaurants.map((r) => {
            const isSelected = selectedRestaurantIds.has(r.id)
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => toggleRestaurant(r.id)}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                  isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                )}
              >
                <span>{r.name}</span>
                {r.cuisine_type && (
                  <span className="text-xs text-muted-foreground">{r.cuisine_type}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {state?.error && <p className="text-sm text-destructive">{state.error}</p>}

      <Button type="submit" disabled={isPending || totalSelected === 0} className="w-full">
        {isPending
          ? 'Création...'
          : totalSelected > 0
            ? `Créer la session · ${totalSelected} resto${totalSelected > 1 ? 's' : ''}`
            : 'Sélectionne des restaurants'}
      </Button>
    </form>
  )
}
