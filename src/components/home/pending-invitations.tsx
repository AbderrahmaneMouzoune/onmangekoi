'use client'

import { RiArrowRightLine, RiMailOpenLine } from '@remixicon/react'
import Link from 'next/link'
import { useState, useTransition } from 'react'

import { declineInvitationAction } from '@/actions/groups'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { router } from '@/config/router.config'
import { countLabel, displayPseudo } from '@/lib/format'

import type { PendingInvitation } from '@/data-access/models'

/**
 * Les sessions où l'on est attendu. C'est la contrepartie du pré-ajout : sans
 * cet écran, un membre pré-invité n'aurait aucun moyen de savoir qu'on
 * l'attend — et il n'est participant qu'au moment où il ouvre la session.
 */
export function PendingInvitations({ invitations }: { invitations: PendingInvitation[] }) {
  const [declined, setDeclined] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const visible = invitations.filter((invitation) => !declined.includes(invitation.session_id))
  if (visible.length === 0) return null

  function decline(sessionId: string) {
    setError(null)
    setDeclined((previous) => [...previous, sessionId])
    startTransition(async () => {
      const result = await declineInvitationAction(sessionId)
      if (!result.ok) {
        setError(result.error)
        setDeclined((previous) => previous.filter((id) => id !== sessionId))
      }
    })
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <RiMailOpenLine aria-hidden="true" className="size-5 text-brand" />
        On t’attend
      </h2>
      <ul className="flex flex-col gap-2">
        {visible.map((invitation) => (
          <li
            key={invitation.session_id}
            className="flex flex-col gap-2 rounded-lg bg-brand-soft p-4 ring-1 ring-brand/30"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-semibold">{invitation.name}</span>
                <span className="text-xs text-muted-foreground">
                  {displayPseudo(invitation.host_pseudo)}
                  {invitation.group_name ? ` · ${invitation.group_name}` : ''} ·{' '}
                  {countLabel(invitation.participant_count, 'participant')}
                </span>
              </div>
              <Link
                href={router.joinInvite(invitation.invite_code)}
                className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand hover:underline"
              >
                Rejoindre
                <RiArrowRightLine aria-hidden="true" className="size-4" />
              </Link>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start text-xs text-muted-foreground"
              onClick={() => decline(invitation.session_id)}
              disabled={isPending}
            >
              Décliner
            </Button>
          </li>
        ))}
      </ul>
      <FormMessage error={error} />
    </section>
  )
}
