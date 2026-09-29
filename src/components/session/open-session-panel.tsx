'use client'

import { RiArrowDownSLine, RiUserAddLine } from '@remixicon/react'
import { useState } from 'react'

import { InviteCard } from '@/components/session/invite-card'
import { PendingInvitees } from '@/components/session/pending-invitees'
import { RulesSummary } from '@/components/session/rules-summary'
import { countLabel } from '@/lib/format'

import type {
  GroupWithMembers,
  InvitationWithProfile,
  ParticipantWithProfile,
  Session,
} from '@/data-access/models'
import type { SessionRules } from '@/domain/session-rules'

interface OpenSessionPanelProps {
  session: Session
  rules: SessionRules
  participants: ParticipantWithProfile[]
  isHost: boolean
  inviteUrl: string
  /** QR code SVG du lien d'invitation, rendu côté serveur */
  qrSvg: string | null
  /** Invités pré-ajoutés en attente — vide pour qui n'est pas le host. */
  invitations: InvitationWithProfile[]
  /** Groupes du host, à inviter pendant le vote. */
  groups: GroupWithMembers[]
}

/**
 * Ce qui remplace la salle d'attente d'une session ouverte : les règles, et de
 * quoi faire venir du monde pendant que le vote tourne. Le deck reste l'écran
 * principal — l'invitation se replie au-dessus.
 *
 * Dépliée d'emblée pour le host encore seul : juste après la création, son
 * premier geste est d'envoyer le lien, pas de voter. Ensuite, elle reste comme
 * on l'a laissée — l'arrivée d'un participant ne la referme pas sous ses doigts.
 */
export function OpenSessionPanel({
  session,
  rules,
  participants,
  isHost,
  inviteUrl,
  qrSvg,
  invitations,
  groups,
}: OpenSessionPanelProps) {
  const [initiallyOpen] = useState(() => isHost && participants.length <= 1)

  return (
    <section aria-label="Session ouverte" className="flex flex-col gap-3">
      <RulesSummary rules={rules} />

      <details open={initiallyOpen} className="group rounded-lg border border-line bg-surface">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 outline-none focus-visible:ring-3 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-2.5">
            <RiUserAddLine aria-hidden="true" className="size-4.5 shrink-0 text-brand" />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">Faire venir du monde</span>
              <span className="text-xs text-muted-foreground">
                On entre jusqu’à l’échéance · {countLabel(participants.length, 'participant')}
              </span>
            </span>
          </span>
          <RiArrowDownSLine
            aria-hidden="true"
            className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="grid grid-cols-1 gap-6 border-t border-line p-4 lg:grid-cols-2 lg:items-start">
          <InviteCard
            sessionId={session.id}
            inviteCode={session.invite_code}
            inviteUrl={inviteUrl}
            sessionName={session.name}
            qrSvg={qrSvg}
          />

          {isHost && (
            <PendingInvitees
              sessionId={session.id}
              invitations={invitations}
              groups={groups}
              arrivedIds={participants
                .map((participant) => participant.profile_id)
                .filter((id): id is string => id !== null)}
            />
          )}
        </div>
      </details>
    </section>
  )
}
