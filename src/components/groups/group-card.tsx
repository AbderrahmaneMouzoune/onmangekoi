'use client'

import { RiGroupLine, RiPencilLine } from '@remixicon/react'
import { useActionState, useState, useTransition } from 'react'

import { deleteGroupAction, leaveGroupAction, renameGroupAction } from '@/actions/groups'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { TwoStepButton } from '@/components/ui/two-step-button'
import { GROUP_NAME_MAX } from '@/domain/schemas/group'
import { countLabel, participantLabel } from '@/lib/format'

import type { GroupWithMembers } from '@/data-access/models'

interface GroupCardProps {
  group: GroupWithMembers
  /** Profil courant : pour se reconnaître dans la liste et savoir qui possède. */
  meId: string
}

/**
 * Un groupe et ce qu'on peut en faire : le propriétaire renomme et supprime,
 * les autres quittent. Les deux gestes sont irréversibles pour le groupe —
 * ils passent donc par une confirmation en deux temps.
 */
export function GroupCard({ group, meId }: GroupCardProps) {
  const [renameState, renameAction, isRenaming] = useActionState(renameGroupAction, null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)

  const isOwner = group.owner_id === meId

  function leave() {
    setError(null)
    startTransition(async () => {
      const result = await leaveGroupAction(group.id)
      if (!result.ok) setError(result.error)
    })
  }

  function remove() {
    setError(null)
    startTransition(async () => {
      const result = await deleteGroupAction(group.id)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <li className="flex flex-col gap-3 rounded-lg bg-surface p-4 ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="flex items-center gap-2 truncate font-display text-base font-semibold">
            <RiGroupLine aria-hidden="true" className="size-4.5 shrink-0 text-muted-foreground" />
            {group.name}
          </h3>
          <p className="text-xs text-muted-foreground">
            {countLabel(group.members.length, 'membre')}
          </p>
        </div>
        {isOwner ? (
          <Badge variant="outline">Propriétaire</Badge>
        ) : (
          <Badge variant="outline">Membre</Badge>
        )}
      </div>

      <ul className="flex flex-wrap gap-2">
        {group.members.map((member) => {
          const pseudo = participantLabel(member.profile_id, member.profiles?.pseudo)
          return (
            <li
              key={member.profile_id}
              className="inline-flex items-center gap-2 rounded-full bg-surface-2 py-1 pr-3 pl-1 text-sm"
            >
              <Avatar name={pseudo} size="sm" />
              <span className="max-w-32 truncate">
                {pseudo}
                {member.profile_id === meId && (
                  <span className="ml-1 text-xs text-muted-foreground">(toi)</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>

      {isOwner && editing && (
        <form action={renameAction} className="flex flex-col gap-2">
          <input type="hidden" name="groupId" value={group.id} />
          <Label htmlFor={`group-name-${group.id}`}>Nom du groupe</Label>
          <div className="flex gap-2">
            <Input
              id={`group-name-${group.id}`}
              name="name"
              defaultValue={group.name}
              maxLength={GROUP_NAME_MAX}
              required
              autoComplete="off"
              className="flex-1"
            />
            <Button type="submit" variant="outline" disabled={isRenaming}>
              {isRenaming ? <Spinner /> : 'Renommer'}
            </Button>
          </div>
          <FormMessage error={renameState?.error} success={renameState?.success} />
        </form>
      )}

      <FormMessage error={error} />

      <div className="flex flex-wrap items-center justify-end gap-2">
        {isOwner ? (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEditing((value) => !value)}
            >
              <RiPencilLine aria-hidden="true" />
              {editing ? 'Fermer' : 'Renommer'}
            </Button>
            <TwoStepButton
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-veto"
              label="Supprimer le groupe"
              confirmLabel="Confirmer — le groupe disparaît pour tout le monde"
              onConfirm={remove}
              disabled={isPending}
            />
          </>
        ) : (
          <TwoStepButton
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-veto"
            label="Quitter le groupe"
            confirmLabel="Confirmer — tu ne seras plus invité"
            onConfirm={leave}
            disabled={isPending}
          />
        )}
      </div>
    </li>
  )
}
