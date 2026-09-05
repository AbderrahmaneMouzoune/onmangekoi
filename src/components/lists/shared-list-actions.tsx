'use client'

import { RiAddLine, RiBookmarkLine } from '@remixicon/react'
import { useState, useTransition } from 'react'

import { RestaurantPicker } from '@/components/restaurants/restaurant-picker'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { addToSharedListAction, copySharedListAction } from '@/lib/actions/lists'

import type { RestaurantPage } from '@/data-access/restaurants'

interface SharedListActionsProps {
  /** Code de partage de la liste */
  identifier: string
  isCollaborative: boolean
  isOwner: boolean
  existingIds: string[]
  initialPage: RestaurantPage
}

export function SharedListActions({
  identifier,
  isCollaborative,
  isOwner,
  existingIds,
  initialPage,
}: SharedListActionsProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [pickerIds, setPickerIds] = useState<string[]>([])

  function copy() {
    setError(null)
    startTransition(async () => {
      const result = await copySharedListAction(identifier)
      if (!result.ok) setError(result.error)
    })
  }

  function addSelected() {
    setError(null)
    startTransition(async () => {
      // Un seul aller-retour pour tous les restaurants sélectionnés
      const result = await addToSharedListAction(identifier, pickerIds)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPickerIds([])
      setAdding(false)
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <FormMessage error={error} />

      {isCollaborative && !adding && (
        <Button type="button" variant="outline" onClick={() => setAdding(true)}>
          <RiAddLine aria-hidden="true" />
          Ajouter un resto à cette liste
        </Button>
      )}

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
              {isPending ? <Spinner /> : 'Ajouter'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {!isOwner && (
        <Button type="button" onClick={copy} disabled={isPending}>
          {isPending ? <Spinner /> : <RiBookmarkLine aria-hidden="true" />}
          Enregistrer dans mes listes
        </Button>
      )}
    </div>
  )
}
