'use client'

import { RiPlayLine } from '@remixicon/react'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { deleteSessionAction, launchSessionAction, leaveSessionAction } from '@/actions/sessions'
import { ConnectionIndicator } from '@/components/session/connection-indicator'
import { InviteCard } from '@/components/session/invite-card'
import { ParticipantList } from '@/components/session/participant-list'
import { PendingInvitees } from '@/components/session/pending-invitees'
import { PushOptIn } from '@/components/session/push-opt-in'
import { RulesSummary } from '@/components/session/rules-summary'
import { SessionRestaurantsPanel } from '@/components/session/session-restaurants-panel'
import { Button } from '@/components/ui/button'
import { FormMessage } from '@/components/ui/form-message'
import { Spinner } from '@/components/ui/spinner'
import { TwoStepButton } from '@/components/ui/two-step-button'
import { displayPseudo } from '@/lib/format'

import type {
  GroupWithMembers,
  InvitationWithProfile,
  ParticipantWithProfile,
  Session,
  SessionRestaurantWithRestaurant,
} from '@/data-access/models'
import type { RestaurantPage } from '@/data-access/restaurants'
import type { ConstraintConflictCounts, FoodConstraints } from '@/domain/food-constraints'
import type { SessionRules } from '@/domain/session-rules'
import type { ConnectionState } from '@/hooks/use-session-room'

const MIN_PARTICIPANTS = 2
/** Un seul resto ne se départage pas : le vote n'aurait rien à trancher. */
const MIN_RESTAURANTS = 2

interface WaitingRoomProps {
  session: Session
  participants: ParticipantWithProfile[]
  meId: string
  isHost: boolean
  inviteUrl: string
  qrSvg: string | null
  restaurants: SessionRestaurantWithRestaurant[]
  rules: SessionRules
  /** Première page du catalogue, pour le sélecteur de restaurants */
  restaurantCatalog: RestaurantPage | null
  connection: ConnectionState
  /** Invités pré-ajoutés qui n'ont pas encore ouvert la session (host). */
  invitations: InvitationWithProfile[]
  /** Groupes du host, pour en inviter un depuis la salle d'attente. */
  groups: GroupWithMembers[]
  /** Par resto, combien de participants ne peuvent pas y manger (#60). */
  conflicts: ConstraintConflictCounts
  /** Ses propres contraintes, pour badger le sélecteur. */
  myConstraints: FoodConstraints | null
  onLaunched: (session: Session) => void
  /** Resynchronise la salle après un ajout ou un retrait de restaurant */
  onRestaurantsChanged: () => void
}

/**
 * Salle d'attente. Sur grand écran, l'invitation et les restos proposés
 * occupent la colonne de gauche, les participants et l'action la droite : ce
 * qu'on partage et apporte d'un côté, ce qui arrive de l'autre.
 */
export function WaitingRoom({
  session,
  participants,
  meId,
  isHost,
  inviteUrl,
  qrSvg,
  restaurants,
  rules,
  restaurantCatalog,
  connection,
  invitations,
  groups,
  conflicts,
  myConstraints,
  onLaunched,
  onRestaurantsChanged,
}: WaitingRoomProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const t = useTranslations('session.waiting')
  const tCommon = useTranslations('common')

  const host = participants.find(
    (p) => session.host_id !== null && p.profile_id === session.host_id
  )
  const missingParticipants = participants.length < MIN_PARTICIPANTS
  const missingRestaurants = restaurants.length < MIN_RESTAURANTS
  const canLaunch = !missingParticipants && !missingRestaurants

  function launch() {
    setError(null)
    startTransition(async () => {
      const result = await launchSessionAction(session.id)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onLaunched(result.data)
    })
  }

  function leave() {
    startTransition(async () => {
      const result = await leaveSessionAction(session.id)
      if (!result.ok) setError(result.error)
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteSessionAction(session.id)
      if (!result.ok) setError(result.error)
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <ConnectionIndicator state={connection} />
      </div>

      <RulesSummary rules={rules} />

      {/* Sur grand écran : ce qu'on partage et ce qu'on apporte à gauche,
          ce qui arrive — participants, lancement — à droite. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start lg:gap-10">
        <div className="flex flex-col gap-6">
          {/* Inviter n'est pas un privilège de host : tout le monde peut faire
              venir du monde, comme tout le monde peut apporter un resto. */}
          <InviteCard
            sessionId={session.id}
            inviteCode={session.invite_code}
            inviteUrl={inviteUrl}
            sessionName={session.name}
            qrSvg={qrSvg}
          />

          <SessionRestaurantsPanel
            sessionId={session.id}
            restaurants={restaurants}
            participants={participants}
            meId={meId}
            isHost={isHost}
            conflicts={conflicts}
            myConstraints={myConstraints}
            initialPage={restaurantCatalog}
            onChanged={onRestaurantsChanged}
          />
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-24">
          <ParticipantList participants={participants} hostId={session.host_id} meId={meId} />

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

          <FormMessage error={error} />

          {isHost ? (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                size="lg"
                onClick={launch}
                disabled={isPending || !canLaunch}
                className="w-full"
              >
                {isPending ? <Spinner /> : <RiPlayLine aria-hidden="true" />}
                {t('launch')}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                {t(launchHint({ missingParticipants, missingRestaurants }), {
                  participants: MIN_PARTICIPANTS,
                  restaurants: MIN_RESTAURANTS,
                })}
              </p>
              <TwoStepButton
                variant="ghost"
                size="sm"
                className="mt-2 self-center text-muted-foreground hover:text-veto"
                label={t('delete')}
                confirmLabel={t('confirmDelete')}
                onConfirm={remove}
                disabled={isPending}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                {t('waitingFor', {
                  host: displayPseudo(host?.profiles?.pseudo, tCommon('people.guest')),
                })}
              </p>
              {/* Le Realtime ne sert que l'onglet ouvert : de quoi fermer celui-ci
                  sans rater le lancement. */}
              <PushOptIn sessionId={session.id} context="launch" />
              <TwoStepButton
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-veto"
                label={t('leave')}
                confirmLabel={t('confirm')}
                onConfirm={leave}
                disabled={isPending}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Ce qui manque pour lancer, dit en une phrase — et ce que lancer implique
 * quand plus rien ne manque (`session.waiting.hints.<clé>`).
 */
function launchHint({
  missingParticipants,
  missingRestaurants,
}: {
  missingParticipants: boolean
  missingRestaurants: boolean
}): `hints.${'both' | 'participants' | 'restaurants' | 'ready'}` {
  if (missingParticipants && missingRestaurants) return 'hints.both'
  if (missingParticipants) return 'hints.participants'
  if (missingRestaurants) return 'hints.restaurants'
  return 'hints.ready'
}
