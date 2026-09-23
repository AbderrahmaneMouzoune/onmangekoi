'use client'

import { RiGroupLine, RiTimeLine } from '@remixicon/react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { inviteGroupToSessionAction } from '@/actions/groups'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { captureEvent } from '@/lib/analytics/client'
import { countLabel, participantLabel } from '@/lib/format'

import type { GroupWithMembers, InvitationWithProfile } from '@/data-access/models'

interface PendingInviteesProps {
  sessionId: string
  invitations: InvitationWithProfile[]
  /** Groupes du host, pour en inviter un de plus depuis la salle d'attente. */
  groups: GroupWithMembers[]
  /** Profils déjà arrivés : leur invitation est honorée, elle disparaît. */
  arrivedIds: string[]
}

/**
 * Les invités qu'on attend encore. Ils ne sont pas participants — ni dans le
 * compte, ni dans le quorum de lancement : tant qu'ils n'ont pas ouvert la
 * session, ils ne bloquent rien.
 *
 * La liste se filtre sur les participants déjà connus du direct : quelqu'un
 * qui vient d'arriver quitte l'attente sans attendre un aller-retour serveur.
 */
export function PendingInvitees({
  sessionId,
  invitations,
  groups,
  arrivedIds,
}: PendingInviteesProps) {
  const navigation = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const waiting = invitations.filter((invitation) => !arrivedIds.includes(invitation.profile_id))
  const invitedIds = new Set(invitations.map((invitation) => invitation.profile_id))
  const invitable = groups.filter((group) =>
    group.members.some(
      (member) => !invitedIds.has(member.profile_id) && !arrivedIds.includes(member.profile_id)
    )
  )

  if (waiting.length === 0 && invitable.length === 0) return null

  function invite(group: GroupWithMembers) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await inviteGroupToSessionAction(group.id, sessionId)
      if (!result.ok) {
        setError(result.error)
        return
      }
      captureEvent('group_invited', { session_id: sessionId, invited_count: result.data })
      setNotice(
        result.data > 0
          ? `${countLabel(result.data, 'personne')} de « ${group.name} » ${result.data > 1 ? 'sont attendues' : 'est attendue'}.`
          : `Tout « ${group.name} » est déjà là.`
      )
      navigation.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {waiting.length > 0 && (
        <>
          <h2 className="flex items-center gap-2 font-display text-base font-semibold">
            <RiTimeLine aria-hidden="true" className="size-4.5 text-muted-foreground" />
            {countLabel(waiting.length, 'invité')} en attente
          </h2>
          <ul className="flex flex-wrap gap-2">
            {waiting.map((invitation) => {
              const pseudo = participantLabel(invitation.profile_id, invitation.profiles?.pseudo)
              return (
                <li
                  key={invitation.profile_id}
                  className="inline-flex items-center gap-2 rounded-full border border-dashed border-line-strong py-1 pr-3 pl-1 text-sm text-muted-foreground"
                >
                  <Avatar name={pseudo} size="sm" className="opacity-60" />
                  <span className="max-w-32 truncate">{pseudo}</span>
                </li>
              )
            })}
          </ul>
          <p className="text-xs text-muted-foreground">
            Envoie-leur le lien : ils ne comptent comme participants qu’une fois la session ouverte.
          </p>
        </>
      )}

      {invitable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {invitable.map((group) => (
            <Button
              key={group.id}
              type="button"
              variant="outline"
              size="sm"
              onClick={() => invite(group)}
              disabled={isPending}
            >
              {isPending ? <Spinner /> : <RiGroupLine aria-hidden="true" />}
              Inviter « {group.name} »
            </Button>
          ))}
        </div>
      )}

      <FormMessage error={error} success={notice} />
    </div>
  )
}
