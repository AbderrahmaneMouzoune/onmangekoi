'use client'

import { RiBookmarkLine, RiCheckLine } from '@remixicon/react'

import { countLabel } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ListWithRestaurantIds } from '@/data-access/lists'

interface ListSourcePanelProps {
  lists: ListWithRestaurantIds[]
  selectedIds: string[]
  onToggle: (id: string) => void
}

/**
 * Onglet « Mes listes » : chaque liste se coche d'un bloc et verse tous ses
 * restos dans la sélection. On peut en cocher plusieurs, puis compléter
 * depuis la base ou Google — les restos déjà couverts y apparaissent cochés
 * et verrouillés, pour ne pas les compter deux fois.
 */
export function ListSourcePanel({ lists, selectedIds, onToggle }: ListSourcePanelProps) {
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2" aria-label="Mes listes">
        {lists.map((list) => {
          const isSelected = selectedIds.includes(list.id)
          const isEmpty = list.restaurant_ids.length === 0
          return (
            <li key={list.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                aria-disabled={isEmpty || undefined}
                onClick={() => {
                  if (!isEmpty) onToggle(list.id)
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-lg border p-3.5 text-left transition-colors',
                  isSelected
                    ? 'border-brand bg-brand-soft'
                    : 'border-line bg-surface hover:bg-surface-2',
                  isEmpty && 'cursor-default text-ink-muted hover:bg-surface'
                )}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full border',
                      isSelected ? 'border-brand bg-brand text-on-brand' : 'border-line-strong'
                    )}
                  >
                    {isSelected && <RiCheckLine className="size-3.5" />}
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <RiBookmarkLine aria-hidden="true" className="size-4 shrink-0 text-fav" />
                    <span className="truncate font-medium">{list.name}</span>
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular">
                  {isEmpty ? 'vide' : countLabel(list.restaurant_ids.length, 'resto')}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        Coche autant de listes que tu veux, puis complète depuis la base ou Google.
      </p>
    </div>
  )
}
