'use client'

import { RiCheckLine, RiGroupLine } from '@remixicon/react'
import { useActionState, useId, useMemo, useState } from 'react'

import { createSessionAction } from '@/actions/sessions'
import { RestaurantPicker } from '@/components/restaurants/restaurant-picker'
import { DeadlinePicker } from '@/components/session/deadline-picker'
import { SESSION_STEPS, SessionStep, StepTitle } from '@/components/session/session-step'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { RECENT_WINNER_WINDOW_DAYS, recentWinnerCount } from '@/domain/recent-winners'
import { GROUPS_PER_SESSION_MAX } from '@/domain/schemas/group'
import { SESSION_NAME_MAX } from '@/domain/schemas/session'
import { rememberSessionEntry } from '@/lib/analytics/handoff'
import { countLabel, plural } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { ListWithRestaurantIds } from '@/data-access/lists'
import type { GroupWithMembers } from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'
import type { RecentWinnerDates } from '@/domain/recent-winners'

interface CreateSessionFormProps {
  lists: ListWithRestaurantIds[]
  /** Groupes récurrents de la personne — vide, l'étape n'existe pas. */
  groups: GroupWithMembers[]
  initialPage: RestaurantPage
  defaultName: string
  /** Anti-fatigue : ce qui a gagné récemment, et quand */
  recentWinners: RecentWinnerDates
}

/**
 * Créer une session, en trois étapes numérotées : un nom, les restos, une
 * échéance. Les restos viennent d'où on veut — une liste entière, le carnet,
 * Google — et se mélangent dans un seul panier.
 *
 * Une quatrième étape s'ajoute à qui a déjà sauvegardé un groupe : la
 * réinviter d'un clic. Elle vient après les trois autres, pour que la
 * silhouette prérendue — qui ne sait pas si on a des groupes — n'ait jamais à
 * renuméroter quoi que ce soit.
 *
 * Sur grand écran, le nom, l'échéance, les groupes et le bouton d'envoi
 * tiennent dans la colonne de gauche ; le sélecteur de restos, le plus haut
 * des blocs, occupe la droite. L'ordre du document reste celui des étapes.
 */
export function CreateSessionForm({
  lists,
  groups,
  initialPage,
  defaultName,
  recentWinners,
}: CreateSessionFormProps) {
  const [state, formAction, isPending] = useActionState(createSessionAction, null)
  const [selectedListIds, setSelectedListIds] = useState<string[]>([])
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [selectedRestaurantIds, setSelectedRestaurantIds] = useState<string[]>([])
  const [excludeRecent, setExcludeRecent] = useState(false)

  // `chosen` compte ce qu'on a pris, `total` ce qui partira vraiment : le
  // serveur refait ce tri, une liste apportant des restos que cet écran n'a
  // jamais montrés un par un.
  const { chosen, total } = useMemo(() => {
    const ids = new Set(selectedRestaurantIds)
    for (const list of lists) {
      if (selectedListIds.includes(list.id)) list.restaurant_ids.forEach((id) => ids.add(id))
    }
    const kept = excludeRecent
      ? [...ids].filter((id) => recentWinners[id] === undefined).length
      : ids.size
    return { chosen: ids.size, total: kept }
  }, [lists, selectedListIds, selectedRestaurantIds, excludeRecent, recentWinners])

  const recentCount = recentWinnerCount(recentWinners)

  function toggleGroup(id: string) {
    setSelectedGroupIds((previous) =>
      previous.includes(id)
        ? previous.filter((value) => value !== id)
        : previous.length >= GROUPS_PER_SESSION_MAX
          ? previous
          : [...previous, id]
    )
  }

  // L'action redirige : elle ne rend jamais la main. On note l'intention ici,
  // la page de session la transforme en `session_created` — et seulement si la
  // création a bien abouti.
  function rememberCreation() {
    rememberSessionEntry({ kind: 'created', listCount: selectedListIds.length })
  }

  return (
    <form
      action={formAction}
      onSubmit={rememberCreation}
      className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-x-10"
    >
      <SessionStep
        number={1}
        title={
          <Label htmlFor="name" className="text-base font-semibold">
            {SESSION_STEPS.name}
          </Label>
        }
      >
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
      </SessionStep>

      <div className="contents lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:block">
        <SessionStep
          number={2}
          title={<h2 className="text-base font-semibold">{SESSION_STEPS.restaurants}</h2>}
          hint={SESSION_STEPS.restaurantsHint}
        >
          <RestaurantPicker
            initialPage={initialPage}
            value={selectedRestaurantIds}
            onChange={setSelectedRestaurantIds}
            recentWinners={recentWinners}
            excludeRecent={excludeRecent}
            inputName="restaurantIds"
            lists={lists}
            selectedListIds={selectedListIds}
            onListsChange={setSelectedListIds}
            listsInputName="listIds"
          />

          {recentCount > 0 && (
            <AntiFatigueToggle
              checked={excludeRecent}
              onChange={setExcludeRecent}
              recentCount={recentCount}
              excludedCount={chosen - total}
            />
          )}
        </SessionStep>
      </div>

      <DeadlinePicker
        legend={
          <StepTitle number={3}>
            <span className="text-base font-semibold">{SESSION_STEPS.deadline}</span>
          </StepTitle>
        }
      />

      {groups.length > 0 && (
        <SessionStep
          number={4}
          title={<h2 className="text-base font-semibold">{SESSION_STEPS.groups}</h2>}
          hint={SESSION_STEPS.groupsHint}
        >
          {selectedGroupIds.map((id) => (
            <input key={id} type="hidden" name="groupIds" value={id} />
          ))}
          <ul className="flex flex-col gap-2" aria-label="Mes groupes">
            {groups.map((group) => (
              <li key={group.id}>
                <GroupToggle
                  name={group.name}
                  memberCount={group.members.length}
                  selected={selectedGroupIds.includes(group.id)}
                  onToggle={() => toggleGroup(group.id)}
                />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Les membres reçoivent une invitation en attente. Ils ne comptent comme participants
            qu’une fois la session ouverte — personne ne bloque le vote sans être là.
          </p>
        </SessionStep>
      )}

      <FormMessage error={state?.error} className="lg:col-start-1" />

      {/* Sur grand écran, le bouton reste sous les étapes, dans la colonne de
          gauche : plus besoin de la barre du bas. */}
      <div className="sticky bottom-0 -mx-4 border-t border-line bg-background/90 px-4 pt-3 pb-3 safe-bottom backdrop-blur-md sm:-mx-6 sm:px-6 lg:static lg:col-start-1 lg:m-0 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <Button type="submit" size="lg" disabled={isPending || total === 0} className="w-full">
          {isPending ? (
            <Spinner />
          ) : total > 0 ? (
            `Créer la session · ${countLabel(total, 'resto')}`
          ) : chosen > 0 ? (
            'Tout est écarté par l’anti-fatigue'
          ) : (
            'Sélectionne des restaurants'
          )}
        </Button>
      </div>
    </form>
  )
}

interface GroupToggleProps {
  name: string
  memberCount: number
  selected: boolean
  onToggle: () => void
}

/** Un groupe à pré-inviter, coché d'un bloc comme une liste de favoris. */
function GroupToggle({ name, memberCount, selected, onToggle }: GroupToggleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg border p-3.5 text-left transition-colors',
        selected ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:bg-surface-2'
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full border',
            selected ? 'border-brand bg-brand text-on-brand' : 'border-line-strong'
          )}
        >
          {selected && <RiCheckLine className="size-3.5" />}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <RiGroupLine aria-hidden="true" className="size-4 shrink-0 text-brand" />
          <span className="truncate font-medium">{name}</span>
        </span>
      </span>
      <span className="shrink-0 font-mono text-xs text-muted-foreground tabular">
        {countLabel(memberCount, 'membre')}
      </span>
    </button>
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
    <div className="flex flex-col gap-2">
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
    </div>
  )
}
