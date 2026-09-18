'use client'

import { RiCheckLine } from '@remixicon/react'
import { useActionState, useId, useMemo, useState } from 'react'

import { createSessionAction } from '@/actions/sessions'
import { RestaurantPicker } from '@/components/restaurants/restaurant-picker'
import { DeadlinePicker } from '@/components/session/deadline-picker'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { RECENT_WINNER_WINDOW_DAYS, recentWinnerCount } from '@/domain/recent-winners'
import { SESSION_NAME_MAX } from '@/domain/schemas/session'
import { rememberSessionEntry } from '@/lib/analytics/handoff'
import { countLabel, plural } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ListWithRestaurantIds } from '@/data-access/lists'
import type { RestaurantPage } from '@/data-access/restaurants'
import type { RecentWinnerDates } from '@/domain/recent-winners'

interface CreateSessionFormProps {
  lists: ListWithRestaurantIds[]
  initialPage: RestaurantPage
  defaultName: string
  /** Anti-fatigue : ce qui a gagné récemment, et quand */
  recentWinners: RecentWinnerDates
}

export function CreateSessionForm({
  lists,
  initialPage,
  defaultName,
  recentWinners,
}: CreateSessionFormProps) {
  const [state, formAction, isPending] = useActionState(createSessionAction, null)
  const [selectedListIds, setSelectedListIds] = useState<string[]>([])
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([])
  const [excludeRecent, setExcludeRecent] = useState(false)

  const fromLists = useMemo(() => {
    const ids = new Set<string>()
    for (const list of lists) {
      if (selectedListIds.includes(list.id)) list.restaurant_ids.forEach((id) => ids.add(id))
    }
    return ids
  }, [lists, selectedListIds])

  const chosen = new Set([...fromLists, ...selectedRestaurantIds])
  // Ce que l'anti-fatigue retirerait de la sélection courante. Le serveur
  // refait le calcul : une liste peut apporter des restos jamais affichés ici.
  const excluded = excludeRecent
    ? [...chosen].filter((id) => recentWinners[id] !== undefined).length
    : 0
  const total = chosen.size - excluded
  const recentCount = recentWinnerCount(recentWinners)

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
          recentWinners={recentWinners}
          excludeRecent={excludeRecent}
          inputName="restaurantIds"
        />
      </div>

      {recentCount > 0 && (
        <AntiFatigueToggle
          checked={excludeRecent}
          onChange={setExcludeRecent}
          recentCount={recentCount}
          excludedCount={excluded}
        />
      )}

      <DeadlinePicker />

      <FormMessage error={state?.error} />

      <div className="sticky bottom-0 -mx-4 border-t border-line bg-background/90 px-4 pt-3 pb-3 safe-bottom backdrop-blur-md">
        <Button type="submit" size="lg" disabled={isPending || total === 0} className="w-full">
          {isPending ? (
            <Spinner />
          ) : total > 0 ? (
            `Créer la session · ${countLabel(total, 'resto')}`
          ) : chosen.size > 0 ? (
            'Tout est écarté par l’anti-fatigue'
          ) : (
            'Sélectionne des restaurants'
          )}
        </Button>
      </div>
    </form>
  )
}

interface AntiFatigueToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Nombre de gagnants récents connus, cochée ou non */
  recentCount: number
  /** Ce que la case retire réellement de la sélection courante */
  excludedCount: number
}

const ANTI_FATIGUE_LEGEND = 'Anti-fatigue'

/**
 * La case qui écarte d'un coup les restaurants sortis gagnants dans le dernier
 * mois. Elle n'apparaît que s'il y en a — proposer d'exclure le vide n'aiderait
 * personne — et n'envoie son champ que cochée. Le serveur refait le tri de son
 * côté : une liste apporte des restaurants que cet écran n'a jamais montrés.
 */
function AntiFatigueToggle({
  checked,
  onChange,
  recentCount,
  excludedCount,
}: AntiFatigueToggleProps) {
  const hintId = useId()

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{ANTI_FATIGUE_LEGEND}</legend>

      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        aria-describedby={hintId}
        onClick={() => onChange(!checked)}
        className={cn(
          'flex w-full items-center gap-3 rounded-lg border p-3.5 text-left transition-colors',
          checked ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:bg-surface-2'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full border',
            checked ? 'border-brand bg-brand text-on-brand' : 'border-line-strong'
          )}
        >
          {checked && <RiCheckLine className="size-3.5" />}
        </span>
        <span className="font-medium">Exclure les gagnants récents</span>
      </button>

      {checked && <input type="hidden" name="excludeRecentWinners" value="on" />}

      <p id={hintId} className="text-xs text-muted-foreground">
        {!checked
          ? `${countLabel(recentCount, 'resto')} ${plural(recentCount, 'a', 'ont')} gagné dans les ${RECENT_WINNER_WINDOW_DAYS} derniers jours.`
          : excludedCount > 0
            ? `${countLabel(excludedCount, 'resto')} ${plural(excludedCount, 'écarté', 'écartés')} de cette session.`
            : 'Aucun de tes choix n’a gagné récemment.'}
      </p>
    </fieldset>
  )
}
